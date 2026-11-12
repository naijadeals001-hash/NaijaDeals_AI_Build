/**
 * Partial affiliate-recovery concurrency acceptance.
 *
 * Two `collectRecovery` calls run on independent database connections against
 * the same affiliate wallet and two different outstanding debts:
 *
 *   available = 100,000 kobo
 *   recovery A = 80,000 kobo outstanding
 *   recovery B = 80,000 kobo outstanding
 *
 * `collectRecovery` bounds each collection by the wallet's available balance and
 * by the debt's outstanding amount. Without a wallet row lock both callers can
 * read the same 100,000 balance and each debit 80,000, collecting 160,000 from
 * 100,000 and leaving availableKobo at -60,000. This suite proves the lock and
 * conditional decrement prevent that:
 *
 *   - aggregate collected <= the 100,000 available at the start;
 *   - each recovery collects at most its own 80,000 outstanding;
 *   - availableKobo never goes negative;
 *   - exactly one AFF-REC journal per collection, no duplicate reference;
 *   - stored projections equal the ledger and wallet-reconcile is CLEAN.
 *
 * Database safety: the URL is derived from .env by replacing only the database
 * path with `naijadeals_wallet_acceptance`; `current_database()` is the hard
 * guard. Every fixture carries RUN_ID and is removed by cleanupRun. No real
 * charge, payout, push or deployment is involved.
 *
 * Usage:
 *   npx tsx scripts/wallet-partial-recovery-acceptance.ts
 */
import "dotenv/config";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { requireTestDatabase, testDatabaseChildEnv } from "./lib/test-db-guard";

const DB = "naijadeals_wallet_acceptance";
const RUN_ID = `${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${randomBytes(4).toString("hex")}`;
const WALLET_FUNDING_KOBO = BigInt(100_000);
const RECOVERY_DEBT_KOBO = BigInt(80_000);
const REPO_ROOT = path.resolve(__dirname, "..");
const SELF = __filename;
const TSX_CLI = path.join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const WORKER_TIMEOUT_MS = 60_000;
const BARRIER_TIMEOUT_MS = 20_000;

type CheckResult = { name: string; pass: boolean; detail: string };
type JsonRecord = Record<string, unknown>;
type RecoveryOutcome =
  | { collected: true; recoveryId: string; collectedKobo: string; outstandingKobo: string; ledgerReference: string }
  | { collected: false; reason: string };

type WorkerOutput = {
  __wpr: "result";
  role: string;
  recoveryId: string;
  walletId: string;
  ok: boolean;
  harnessError: boolean;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  pid: number;
  database: string | null;
  backendPidBefore: number;
  backendPidAfter: number;
  walletBefore: { available: string; held: string } | null;
  walletAfter: { available: string; held: string } | null;
  result: RecoveryOutcome | null;
  error: { name: string; status: number | null; code: string | null; message: string } | null;
};

type LockWaitSample = {
  at: number;
  pid: number;
  waitEventType: string | null;
  waitEvent: string | null;
  blockers: number[];
};

const checks: CheckResult[] = [];
let failures = 0;

function record(name: string, pass: boolean, detail: string) {
  checks.push({ name, pass, detail });
  if (!pass) failures += 1;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function redact(value: string) {
  return value
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "<redacted-db-url>")
    .replace(/(DATABASE_URL=)[^\s]+/g, "$1<redacted>");
}

function bigintReplacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the acceptance worker.`);
  return value;
}

function acceptanceUrl(connectionLimit?: number) {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error("TEST_DATABASE_URL is not set by the test database guard.");
  const url = new URL(raw);
  if (connectionLimit) url.searchParams.set("connection_limit", String(connectionLimit));
  return url.toString();
}

async function backendPid(prisma: PrismaClient) {
  const rows = await prisma.$queryRawUnsafe<Array<{ pid: number }>>("select pg_backend_pid() as pid");
  return Number(rows[0]?.pid ?? 0);
}

function walletSnapshot(wallet: { availableKobo: bigint; heldKobo: bigint }) {
  return { available: wallet.availableKobo.toString(), held: wallet.heldKobo.toString() };
}

async function readWallet(prisma: PrismaClient, walletId: string) {
  return prisma.wallet.findUniqueOrThrow({
    where: { id: walletId },
    select: { id: true, ownerType: true, currency: true, availableKobo: true, heldKobo: true, userId: true }
  });
}

/* ------------------------------------------------------------------ workers --- */

type WorkerSpec = { role: string; recoveryId: string; adminId: string; walletId: string };

function spawnWorker(spec: WorkerSpec, barrierDir: string, url: string) {
  const child = spawn(process.execPath, [TSX_CLI, SELF], {
    cwd: REPO_ROOT,
    env: {
      ...testDatabaseChildEnv(url),
      WPR_WORKER: "1",
      WPR_ROLE: spec.role,
      WPR_RECOVERY_ID: spec.recoveryId,
      WPR_ADMIN_ID: spec.adminId,
      WPR_WALLET_ID: spec.walletId,
      WPR_BARRIER_DIR: barrierDir,
      WPR_DB: DB,
      NODE_ENV: "test"
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk) => {
    stdout += String(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });
  const done = new Promise<WorkerOutput>((resolve) => {
    let settled = false;
    const finish = (payload: WorkerOutput) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(payload);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(harnessOutput(spec.role, spec.recoveryId, spec.walletId, child.pid ?? 0, `worker timed out after ${WORKER_TIMEOUT_MS} ms`));
    }, WORKER_TIMEOUT_MS);
    child.on("error", (error) => {
      finish(harnessOutput(spec.role, spec.recoveryId, spec.walletId, child.pid ?? 0, `worker spawn failed: ${String(error)}`));
    });
    child.on("exit", (code, signal) => {
      const payload = extractWorkerOutput(stdout);
      if (payload) {
        finish(payload);
        return;
      }
      finish(
        harnessOutput(
          spec.role,
          spec.recoveryId,
          spec.walletId,
          child.pid ?? 0,
          `worker produced no result (exit ${code ?? signal ?? "unknown"}): ${redact(stderr || stdout).slice(0, 400)}`
        )
      );
    });
  });
  return { role: spec.role, done, kill: () => child.kill() };
}

function harnessOutput(role: string, recoveryId: string, walletId: string, pid: number, message: string): WorkerOutput {
  return {
    __wpr: "result",
    role,
    recoveryId,
    walletId,
    ok: false,
    harnessError: true,
    startedAt: 0,
    endedAt: 0,
    durationMs: 0,
    pid,
    database: null,
    backendPidBefore: 0,
    backendPidAfter: 0,
    walletBefore: null,
    walletAfter: null,
    result: null,
    error: { name: "HarnessError", status: null, code: "harness_error", message: redact(message).slice(0, 400) }
  };
}

function extractWorkerOutput(stdout: string): WorkerOutput | null {
  for (const line of stdout.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean).reverse()) {
    try {
      const parsed = JSON.parse(line) as Partial<WorkerOutput>;
      if (parsed.__wpr === "result") return parsed as WorkerOutput;
    } catch {
      // Ignore non-JSON diagnostics.
    }
  }
  return null;
}

async function waitForFiles(paths: string[], timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (paths.every((candidate) => fs.existsSync(candidate))) return;
    await sleep(2);
  }
  throw new Error(`barrier timeout waiting for ${paths.map((candidate) => path.basename(candidate)).join(", ")}`);
}

async function workerMain() {
  const role = requiredEnv("WPR_ROLE");
  const recoveryId = requiredEnv("WPR_RECOVERY_ID");
  const adminId = requiredEnv("WPR_ADMIN_ID");
  const walletId = requiredEnv("WPR_WALLET_ID");
  const barrierDir = requiredEnv("WPR_BARRIER_DIR");
  const expectedDb = process.env.WPR_DB ?? DB;

  // Import inside the worker after DATABASE_URL is set by the parent.
  const { prisma } = await import("../lib/prisma");
  try {
    const db = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
    if (db[0]?.db !== expectedDb) throw new Error(`worker database mismatch: ${db[0]?.db ?? "unknown"}, expected ${expectedDb}`);
    const wallet = await readWallet(prisma, walletId);
    if (wallet.ownerType !== "CUSTOMER" || wallet.currency !== "NGN") {
      throw new Error("worker wallet is not the expected CUSTOMER NGN wallet");
    }
    const backendPidBefore = await backendPid(prisma);
    // Load the real service before the barrier, so release is followed by the call.
    const { collectRecovery } = await import("../lib/services/affiliate/recovery");

    fs.writeFileSync(
      path.join(barrierDir, `ready-${role}`),
      JSON.stringify({ readyAt: Date.now(), backendPid: backendPidBefore })
    );
    await waitForFiles([path.join(barrierDir, "go")], BARRIER_TIMEOUT_MS);

    const startedAt = Date.now();
    let result: RecoveryOutcome | null = null;
    let error: WorkerOutput["error"] = null;
    try {
      result = await collectRecovery({ actorId: adminId, recoveryId, amountKobo: RECOVERY_DEBT_KOBO });
    } catch (caught) {
      const value = caught as { name?: string; status?: number; code?: string; message?: string };
      error = {
        name: value.name ?? "Error",
        status: typeof value.status === "number" ? value.status : null,
        code: value.code ?? null,
        message: redact(value.message ?? String(caught)).slice(0, 300)
      };
    }
    const endedAt = Date.now();
    const walletAfter = await readWallet(prisma, walletId);
    const backendPidAfter = await backendPid(prisma);

    const payload: WorkerOutput = {
      __wpr: "result",
      role,
      recoveryId,
      walletId,
      ok: error === null,
      harnessError: false,
      startedAt,
      endedAt,
      durationMs: endedAt - startedAt,
      pid: process.pid,
      database: db[0]?.db ?? expectedDb,
      backendPidBefore,
      backendPidAfter,
      walletBefore: walletSnapshot(wallet),
      walletAfter: walletSnapshot(walletAfter),
      result,
      error
    };
    process.stdout.write(`${JSON.stringify(payload, bigintReplacer)}\n`);
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

/* ----------------------------------------------------------------- monitor --- */

/**
 * Watch both worker backends. With the wallet row lock one transaction must
 * wait on the other's `transactionid` lock; `pg_blocking_pids` names the holder.
 * A 4 ms sample can miss a short wait, so absence is reported as not observed,
 * not as proof of serialisation.
 */
function startLockMonitor(prisma: PrismaClient, pids: number[]) {
  const watched = pids.filter((pid) => Number.isInteger(pid) && pid > 0);
  const samples = new Map<string, LockWaitSample>();
  let polling = false;
  const timer = setInterval(() => {
    if (polling || watched.length === 0) return;
    polling = true;
    prisma
      .$queryRawUnsafe<Array<{ pid: number; waitEventType: string | null; waitEvent: string | null; blockers: number[] }>>(
        `select pid, wait_event_type as "waitEventType", wait_event as "waitEvent", pg_blocking_pids(pid) as "blockers" from pg_stat_activity where pid in (${watched.join(", ")})`
      )
      .then((rows) => {
        const at = Date.now();
        for (const row of rows) {
          const blockers = Array.isArray(row.blockers) ? row.blockers.map(Number).filter((pid) => pid > 0) : [];
          if (row.waitEventType !== "Lock" && blockers.length === 0) continue;
          const key = `${row.pid}|${row.waitEventType}|${row.waitEvent}|${blockers.join(",")}`;
          if (!samples.has(key)) {
            samples.set(key, { at, pid: Number(row.pid), waitEventType: row.waitEventType, waitEvent: row.waitEvent, blockers });
          }
        }
      })
      .catch(() => undefined)
      .finally(() => {
        polling = false;
      });
  }, 4);
  timer.unref?.();
  return {
    async stop() {
      clearInterval(timer);
      const deadline = Date.now() + 250;
      while (polling && Date.now() < deadline) await sleep(5);
      return [...samples.values()].sort((a, b) => a.at - b.at);
    }
  };
}

function overlappingMs(results: WorkerOutput[]) {
  const starts = results.map((result) => result.startedAt).filter((value) => value > 0);
  const ends = results.map((result) => result.endedAt).filter((value) => value > 0);
  if (starts.length !== results.length || ends.length !== results.length) return 0;
  return Math.max(0, Math.min(...ends) - Math.max(...starts));
}

async function runRace(prisma: PrismaClient, specs: WorkerSpec[]) {
  const barrierDir = fs.mkdtempSync(path.join(os.tmpdir(), "wpr-race-"));
  const url = acceptanceUrl(1);
  const workers = specs.map((spec) => spawnWorker(spec, barrierDir, url));
  let monitor: ReturnType<typeof startLockMonitor> | null = null;
  let readyPids: number[] = [];
  try {
    await waitForFiles(specs.map((spec) => path.join(barrierDir, `ready-${spec.role}`)), BARRIER_TIMEOUT_MS);
    readyPids = specs.map((spec) => {
      try {
        const ready = JSON.parse(fs.readFileSync(path.join(barrierDir, `ready-${spec.role}`), "utf8")) as { backendPid?: number };
        return Number(ready.backendPid ?? 0);
      } catch {
        return 0;
      }
    });
    monitor = startLockMonitor(prisma, readyPids);
    fs.writeFileSync(path.join(barrierDir, "go"), String(Date.now()));
    const results = await Promise.all(workers.map((worker) => worker.done));
    const lockWaits = await monitor.stop();
    return { results, lockWaits, readyPids, overlapMs: overlappingMs(results) };
  } catch (error) {
    for (const worker of workers) worker.kill();
    const results = await Promise.all(workers.map((worker) => worker.done));
    const lockWaits = monitor ? await monitor.stop() : [];
    return { results, lockWaits, readyPids, overlapMs: overlappingMs(results) };
  } finally {
    try {
      fs.rmSync(barrierDir, { recursive: true, force: true });
    } catch {
      // Temporary barrier files are harmless.
    }
  }
}

/* --------------------------------------------------------------- reporting --- */

async function runReconcile(url: string) {
  return new Promise<{ status?: string; database?: string; mismatches?: number; unattributedHolds?: number }>((resolve, reject) => {
    const child = spawn(process.execPath, [TSX_CLI, path.join(REPO_ROOT, "scripts", "wallet-reconcile.ts")], {
      cwd: REPO_ROOT,
      env: { ...testDatabaseChildEnv(url), RECONCILE_DB: DB, NODE_ENV: "test" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("wallet-reconcile timed out"));
    }, WORKER_TIMEOUT_MS);
    child.on("exit", () => {
      clearTimeout(timer);
      const start = stdout.indexOf("{");
      const end = stdout.lastIndexOf("}");
      if (start < 0 || end <= start) {
        reject(new Error(`wallet-reconcile produced no JSON: ${redact(stderr || stdout).slice(0, 400)}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout.slice(start, end + 1)));
      } catch (error) {
        reject(new Error(`wallet-reconcile JSON could not be parsed: ${String(error)}`));
      }
    });
  });
}

/* ---------------------------------------------------------------- fixtures --- */

async function createFixtureUser(prisma: PrismaClient, label: string) {
  return prisma.user.create({
    data: {
      email: `wpr-${RUN_ID}-${label}@example.test`,
      name: `Partial recovery acceptance ${label}`,
      actorType: label === "admin" ? "ADMIN" : "CUSTOMER"
    }
  });
}

async function fundWallet(prisma: PrismaClient, input: {
  customerWalletId: string;
  systemWalletId: string;
  amountKobo: bigint;
  reference: string;
}) {
  const { postBalancedTransaction } = await import("../lib/services/core/wallet.service");
  await prisma.$transaction(async (tx) => {
    await tx.wallet.update({ where: { id: input.customerWalletId }, data: { availableKobo: { increment: input.amountKobo } } });
    await tx.wallet.update({ where: { id: input.systemWalletId }, data: { availableKobo: { decrement: input.amountKobo } } });
    await postBalancedTransaction({
      tx,
      actorId: null,
      walletId: input.customerWalletId,
      type: "credit",
      amountKobo: input.amountKobo,
      reference: input.reference,
      description: "Isolated partial-recovery acceptance funding: TEST funds, balanced against SYSTEM.",
      entries: [
        { walletId: input.systemWalletId, direction: "DEBIT", amountKobo: input.amountKobo, memo: "Partial recovery TEST funding" },
        { walletId: input.customerWalletId, direction: "CREDIT", amountKobo: input.amountKobo, memo: "Partial recovery TEST funding" }
      ]
    });
  });
}

/**
 * Delete only this run's rows, reversing the shared SYSTEM wallet's stored
 * effect (funding debit and recovery credits) before deleting the journals.
 */
async function cleanupRun(prisma: PrismaClient) {
  const emailPrefix = `wpr-${RUN_ID}-`;
  const runSlug = RUN_ID.toLowerCase();
  const users = await prisma.user.findMany({ where: { email: { startsWith: emailPrefix } }, select: { id: true } });
  const userIds = users.map((user) => user.id);
  if (userIds.length === 0) return { users: 0, wallets: 0, recoveries: 0, conversions: 0, transactions: 0, leftovers: 0 };

  const profiles = await prisma.affiliateProfile.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
  const profileIds = profiles.map((profile) => profile.id);
  const conversions = await prisma.affiliateConversion.findMany({
    where: { OR: [{ affiliateId: { in: profileIds } }, { dedupeKey: { contains: RUN_ID } }] },
    select: { id: true }
  });
  const conversionIds = conversions.map((conversion) => conversion.id);
  const recoveries = await prisma.affiliateRecovery.findMany({
    where: { OR: [{ affiliateId: { in: profileIds } }, { conversionId: { in: conversionIds } }] },
    select: { id: true }
  });
  const recoveryIds = recoveries.map((recovery) => recovery.id);
  const wallets = await prisma.wallet.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
  const walletIds = wallets.map((wallet) => wallet.id);
  const transactions = await prisma.walletTransaction.findMany({
    where: { OR: [{ walletId: { in: walletIds } }, { reference: { contains: RUN_ID } }] },
    select: { id: true }
  });
  const transactionIds = transactions.map((transaction) => transaction.id);
  const campaigns = await prisma.affiliateCampaign.findMany({ where: { slug: { contains: runSlug } }, select: { id: true } });
  const campaignIds = campaigns.map((campaign) => campaign.id);
  const entityIds = [...recoveryIds, ...conversionIds, ...transactionIds, ...campaignIds];

  const systemWallet = await prisma.wallet.findFirst({ where: { ownerType: "SYSTEM" }, select: { id: true } });
  let systemAvailableDelta = BigInt(0);
  if (systemWallet) {
    const fullTransactions = await prisma.walletTransaction.findMany({
      where: { id: { in: transactionIds } },
      include: { ledger: true }
    });
    for (const transaction of fullTransactions) {
      const legs = transaction.ledger.filter((leg) => leg.walletId === systemWallet.id);
      if (legs.length === 0) continue;
      const debit = legs.find((leg) => leg.direction === "DEBIT");
      const credit = legs.find((leg) => leg.direction === "CREDIT");
      if (transaction.type === "credit" && transaction.reference.includes(RUN_ID)) {
        systemAvailableDelta += debit?.amountKobo ?? BigInt(0);
      } else if (transaction.type === "debit" && transaction.reference.startsWith("AFF-REC-")) {
        systemAvailableDelta -= credit?.amountKobo ?? BigInt(0);
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    if (systemWallet && systemAvailableDelta !== BigInt(0)) {
      await tx.wallet.update({ where: { id: systemWallet.id }, data: { availableKobo: { increment: systemAvailableDelta } } });
    }
    await tx.ledgerEntry.deleteMany({ where: { OR: [{ transactionId: { in: transactionIds } }, { walletId: { in: walletIds } }] } });
    await tx.walletTransaction.deleteMany({ where: { id: { in: transactionIds } } });
    await tx.wallet.deleteMany({ where: { id: { in: walletIds } } });
    await tx.auditLog.deleteMany({ where: { OR: [{ actorId: { in: userIds } }, { entityId: { in: entityIds } }] } });
    await tx.systemEvent.deleteMany({ where: { OR: [{ actorId: { in: userIds } }, { entityId: { in: entityIds } }] } });
    await tx.affiliateRecovery.deleteMany({ where: { id: { in: recoveryIds } } });
    await tx.affiliateConversion.deleteMany({ where: { id: { in: conversionIds } } });
    await tx.affiliateProfile.deleteMany({ where: { id: { in: profileIds } } });
    await tx.affiliateCampaign.deleteMany({ where: { id: { in: campaignIds } } });
    await tx.partnerNotification.deleteMany({ where: { userId: { in: userIds } } });
    await tx.notification.deleteMany({ where: { userId: { in: userIds } } });
    await tx.session.deleteMany({ where: { userId: { in: userIds } } });
    await tx.address.deleteMany({ where: { userId: { in: userIds } } });
    await tx.user.deleteMany({ where: { id: { in: userIds } } });
  }, { timeout: 30_000 });

  const leftovers = await prisma.user.count({ where: { email: { startsWith: emailPrefix } } });
  return {
    users: userIds.length,
    wallets: walletIds.length,
    recoveries: recoveryIds.length,
    conversions: conversionIds.length,
    transactions: transactionIds.length,
    leftovers
  };
}

/* --------------------------------------------------------------------- main --- */

async function main(prisma: PrismaClient, url: string) {
  const { ensureWallet } = await import("../lib/payments/service");
  const db = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  assert(db[0]?.db === DB, `wrong database ${db[0]?.db ?? "unknown"}, expected ${DB}`);

  const system = await ensureWallet(prisma, { ownerType: "SYSTEM" });
  const systemBefore = await readWallet(prisma, system.id);

  const admin = await createFixtureUser(prisma, "admin");
  const affiliate = await createFixtureUser(prisma, "affiliate");
  const profile = await prisma.affiliateProfile.create({
    data: {
      userId: affiliate.id,
      termsVersion: `wpr-${RUN_ID}`,
      termsAcceptedAt: new Date(),
      status: "APPROVED",
      approvedAt: new Date()
    }
  });
  const campaign = await prisma.affiliateCampaign.create({
    data: {
      slug: `wpr-${RUN_ID.toLowerCase()}`,
      name: `Partial recovery campaign ${RUN_ID}`,
      vertical: "shop",
      status: "ACTIVE",
      commissionBps: 500,
      budgetKobo: BigInt(10_000_000),
      commissionBasis: "SUBTOTAL",
      ruleVersion: 1
    }
  });
  const affiliateWallet = await ensureWallet(prisma, { userId: affiliate.id, ownerType: "CUSTOMER" });
  const beforeFunding = await readWallet(prisma, affiliateWallet.id);
  await fundWallet(prisma, {
    customerWalletId: affiliateWallet.id,
    systemWalletId: system.id,
    amountKobo: WALLET_FUNDING_KOBO,
    reference: `WPR-FUND-${RUN_ID}`
  });

  const recoveryIds: string[] = [];
  for (const label of ["a", "b"]) {
    const conversion = await prisma.affiliateConversion.create({
      data: {
        dedupeKey: `wpr-${RUN_ID}-conversion-${label}`,
        affiliateId: profile.id,
        campaignId: campaign.id,
        entityType: "Order",
        entityId: `wpr-order-${RUN_ID}-${label}`,
        ruleVersion: 1,
        basisType: "SUBTOTAL",
        commissionBps: 500,
        basisKobo: RECOVERY_DEBT_KOBO * BigInt(20),
        amountKobo: RECOVERY_DEBT_KOBO,
        state: "APPROVED"
      }
    });
    const recovery = await prisma.affiliateRecovery.create({
      data: {
        conversionId: conversion.id,
        affiliateId: profile.id,
        amountKobo: RECOVERY_DEBT_KOBO,
        state: "OUTSTANDING"
      }
    });
    recoveryIds.push(recovery.id);
  }
  const walletStart = await readWallet(prisma, affiliateWallet.id);
  record(
    "fixture: one wallet holds 100,000 kobo and two separate 80,000 kobo debts are outstanding",
    beforeFunding.availableKobo === BigInt(0) &&
      walletStart.availableKobo === WALLET_FUNDING_KOBO &&
      walletStart.heldKobo === BigInt(0) &&
      recoveryIds.length === 2,
    `wallet ${walletStart.availableKobo}/${walletStart.heldKobo}, debts ${recoveryIds.length}`
  );

  const race = await runRace(prisma, [
    { role: "recovery-a", recoveryId: recoveryIds[0], adminId: admin.id, walletId: affiliateWallet.id },
    { role: "recovery-b", recoveryId: recoveryIds[1], adminId: admin.id, walletId: affiliateWallet.id }
  ]);
  const results = race.results;
  const successes = results.filter((result) => result.result?.collected === true);
  const collectedTotal = successes.reduce(
    (sum, result) => sum + BigInt(result.result?.collected === true ? result.result.collectedKobo : "0"),
    BigInt(0)
  );
  const ledger = await prisma.ledgerEntry.groupBy({ by: ["direction"], where: { walletId: affiliateWallet.id }, _sum: { amountKobo: true } });
  const walletCredit = ledger.find((leg) => leg.direction === "CREDIT")?._sum.amountKobo ?? BigInt(0);
  const walletDebit = ledger.find((leg) => leg.direction === "DEBIT")?._sum.amountKobo ?? BigInt(0);
  const finalWallet = await readWallet(prisma, affiliateWallet.id);
  const finalSystem = await readWallet(prisma, system.id);
  const recoveries = await prisma.affiliateRecovery.findMany({ where: { id: { in: recoveryIds } } });
  const recoveryTxns = await prisma.walletTransaction.findMany({
    where: { reference: { startsWith: "AFF-REC-" } },
    include: { ledger: true }
  });
  const relevantTxns = recoveryTxns.filter((txn) => recoveryIds.some((id) => txn.reference.startsWith(`AFF-REC-${id}`)));

  record(
    "race: both calls ran on independent database connections against the same wallet",
    results.length === 2 &&
      results.every((result) => result.database === DB && result.walletId === affiliateWallet.id && result.backendPidBefore > 0) &&
      new Set(results.map((result) => result.backendPidBefore)).size === 2 &&
      race.readyPids.filter((pid) => pid > 0).length === 2,
    results.map((result) => `${result.role}:pid=${result.pid}/backend=${result.backendPidBefore}`).join(", ")
  );
  record(
    "race: the two collectRecovery calls actually overlapped",
    race.overlapMs > 0,
    `overlap=${race.overlapMs}ms, duration ${results.map((result) => result.durationMs).join("/")}ms`
  );
  record(
    "race: both collections succeed, each bounded by its own 80,000 kobo outstanding amount",
    successes.length === 2 &&
      successes.every((result) => result.result?.collected === true && BigInt(result.result.collectedKobo) <= RECOVERY_DEBT_KOBO) &&
      new Set(results.map((result) => result.recoveryId)).size === 2,
    results.map((result) => `${result.role}:${result.result?.collected ? result.result.collectedKobo : result.error?.code ?? "?"}`).join(", ")
  );
  record(
    "race: aggregate collected is at most the 100,000 kobo available at the start",
    collectedTotal <= WALLET_FUNDING_KOBO,
    `collected ${collectedTotal}, available at start ${WALLET_FUNDING_KOBO}`
  );
  record(
    "race: the wallet is not overdrawn",
    finalWallet.availableKobo >= BigInt(0) &&
      finalWallet.availableKobo === WALLET_FUNDING_KOBO - collectedTotal &&
      finalWallet.heldKobo === BigInt(0),
    `available ${finalWallet.availableKobo}, held ${finalWallet.heldKobo}, collected ${collectedTotal}`
  );
  record(
    "race: each recovery's collected + offset never exceeds its amount",
    recoveries.every((recovery) => recovery.collectedKobo + recovery.offsetKobo <= recovery.amountKobo),
    recoveries
      .map((recovery) => `${recovery.id.slice(-6)}:${recovery.collectedKobo}+${recovery.offsetKobo}/${recovery.amountKobo}:${recovery.state}`)
      .join(", ")
  );
  record(
    "ledger: exactly one AFF-REC journal per collection, unique reference, balanced, no duplicate",
    relevantTxns.length === successes.length &&
      new Set(relevantTxns.map((txn) => txn.reference)).size === relevantTxns.length &&
      relevantTxns.every((txn) => {
        const debits = txn.ledger.filter((leg) => leg.direction === "DEBIT").reduce((sum, leg) => sum + leg.amountKobo, BigInt(0));
        const credits = txn.ledger.filter((leg) => leg.direction === "CREDIT").reduce((sum, leg) => sum + leg.amountKobo, BigInt(0));
        return debits === credits && debits === txn.amountKobo;
      }) &&
      recoveryIds.every(
        (id) => relevantTxns.filter((txn) => txn.reference.startsWith(`AFF-REC-${id}`)).length ===
          successes.filter((result) => result.recoveryId === id).length
      ),
    relevantTxns.map((txn) => `${txn.reference}:${txn.amountKobo}`).join(", ")
  );
  record(
    "projections: wallet and SYSTEM stored balances match their journals",
    finalWallet.availableKobo === walletCredit - walletDebit &&
      finalWallet.availableKobo === BigInt(0) &&
      walletCredit - walletDebit === WALLET_FUNDING_KOBO - collectedTotal &&
      finalSystem.availableKobo === systemBefore.availableKobo &&
      finalSystem.heldKobo === systemBefore.heldKobo,
    `wallet credit ${walletCredit} - debit ${walletDebit} = ${walletCredit - walletDebit}; SYSTEM ${systemBefore.availableKobo}/${systemBefore.heldKobo} -> ${finalSystem.availableKobo}/${finalSystem.heldKobo}`
  );

  const journal = await prisma.ledgerEntry.groupBy({ by: ["direction"], where: { wallet: { currency: "NGN" } }, _sum: { amountKobo: true } });
  const journalCredit = journal.find((leg) => leg.direction === "CREDIT")?._sum.amountKobo ?? BigInt(0);
  const journalDebit = journal.find((leg) => leg.direction === "DEBIT")?._sum.amountKobo ?? BigInt(0);
  record("journal: every NGN entry balances across the run", journalCredit === journalDebit, `credit ${journalCredit}, debit ${journalDebit}`);

  const reconcile = await runReconcile(url);
  record(
    "reconcile: wallet-reconcile is CLEAN with the partially collected debt outstanding",
    reconcile.database === DB && reconcile.status === "CLEAN" && reconcile.mismatches === 0 && reconcile.unattributedHolds === 0,
    JSON.stringify(reconcile)
  );

  const blocking = race.lockWaits.filter(
    (sample) => race.readyPids.includes(sample.pid) && sample.blockers.some((pid) => race.readyPids.includes(pid))
  );

  const cleanup = await cleanupRun(prisma);
  const postCleanupReconcile = await runReconcile(url);
  record("repeatability: cleanup removes every row tagged with this run id", cleanup.leftovers === 0, JSON.stringify(cleanup));
  record(
    "repeatability: the books are CLEAN again after cleanup",
    postCleanupReconcile.status === "CLEAN" && postCleanupReconcile.mismatches === 0 && postCleanupReconcile.unattributedHolds === 0,
    JSON.stringify(postCleanupReconcile)
  );

  const report = {
    database: DB,
    runId: RUN_ID,
    command: "npx tsx scripts/wallet-partial-recovery-acceptance.ts",
    fixture: {
      availableAtStart: WALLET_FUNDING_KOBO.toString(),
      outstandingPerDebt: RECOVERY_DEBT_KOBO.toString(),
      debts: recoveryIds.length
    },
    race: {
      overlapMs: race.overlapMs,
      results: results.map((result) => ({
        role: result.role,
        recoveryId: result.recoveryId,
        durationMs: result.durationMs,
        startedAt: result.startedAt,
        endedAt: result.endedAt,
        backendPid: result.backendPidBefore,
        walletBefore: result.walletBefore,
        walletAfter: result.walletAfter,
        result: result.result,
        error: result.error
      })),
      lockContention: {
        observed: blocking.length > 0,
        samples: blocking.slice(0, 10),
        waitedPids: [...new Set(blocking.map((sample) => sample.pid))],
        blockerPids: [...new Set(blocking.flatMap((sample) => sample.blockers))],
        note:
          blocking.length > 0
            ? "A collector waited on a lock held by the other collector."
            : "No lock wait was captured by 4 ms pg_stat_activity sampling. Execution overlap alone is not proof of row-level contention."
      }
    },
    outcome: {
      collectedTotal: collectedTotal.toString(),
      availableAtStart: WALLET_FUNDING_KOBO.toString(),
      finalWallet: walletSnapshot(finalWallet),
      systemBefore: walletSnapshot(systemBefore),
      systemAfter: walletSnapshot(finalSystem),
      recoveries: recoveries.map((recovery) => ({
        id: recovery.id,
        amountKobo: recovery.amountKobo.toString(),
        collectedKobo: recovery.collectedKobo.toString(),
        offsetKobo: recovery.offsetKobo.toString(),
        outstandingKobo: (recovery.amountKobo - recovery.collectedKobo - recovery.offsetKobo).toString(),
        state: recovery.state,
        ledgerReference: recovery.ledgerReference
      })),
      journals: relevantTxns.map((txn) => ({
        reference: txn.reference,
        amountKobo: txn.amountKobo.toString(),
        legs: txn.ledger.map((leg) => `${leg.direction}:${leg.amountKobo}`)
      }))
    },
    cleanup,
    checks,
    failures,
    status: failures === 0 ? "PASS" : "FAIL"
  };
  console.log(JSON.stringify(report, bigintReplacer, 2));
}

/* ---------------------------------------------------------------- dispatch --- */

async function runAcceptance() {
  process.env.VALKEY_URL = "";
  await requireTestDatabase();
  const url = acceptanceUrl();
  const { prisma } = await import("../lib/prisma");
  try {
    await main(prisma, url);
  } catch (error) {
    try {
      const cleanup = await cleanupRun(prisma);
      process.stderr.write(`cleanup after failure: ${JSON.stringify(cleanup)}\n`);
    } catch (cleanupError) {
      process.stderr.write(`cleanup after failure failed: ${redact(String(cleanupError))}\n`);
    }
    throw error;
  }
}

if (process.env.WPR_WORKER === "1") {
  workerMain().catch((error) => {
    process.stderr.write(`${redact(String(error))}\n`);
    process.exit(4);
  });
} else {
  runAcceptance()
    .catch(async (error) => {
      process.stderr.write(`${redact(error instanceof Error ? error.stack ?? error.message : String(error))}\n`);
      process.exit(1);
    })
    .finally(async () => {
      try {
        const { prisma } = await import("../lib/prisma");
        await prisma.$disconnect();
      } catch {
        // Nothing to disconnect.
      }
    });
}
