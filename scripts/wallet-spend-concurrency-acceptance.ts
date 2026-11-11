/**
 * Cross-service wallet-spend concurrency acceptance.
 *
 * One CUSTOMER wallet is funded through a balanced ledger journal against the
 * SYSTEM wallet. Two real services then try to reserve the same funds at the
 * same moment on independent database connections:
 *
 *   A. NaijaDrive `requestRide` with a wallet fare hold.
 *   B. NaijaShop `checkout` -> `initializePayment` -> `confirmPayment` (wallet
 *      escrow debit).
 *
 * Exactly one must commit. The other must fail with its real
 * `insufficient_wallet` domain error and leave no committed financial effect.
 *
 * The same file also exercises two simultaneous `requestRide` calls from one
 * rider: the active-ride rule must let exactly one through.
 *
 * Database safety:
 *   - The URL is derived from .env by replacing only the database path with
 *     `naijadeals_wallet_acceptance`. Credentials are never printed.
 *   - `select current_database()` is the hard guard.
 *   - No production database, real charge, payout or deployment is touched.
 *
 * Amount derivation (verified against the shipped code, not invented):
 *   - `quoteDrive` rounds to the nearest 5,000 kobo. No shipped
 *     place/vehicle-class pair quotes exactly 80,000 kobo.
 *   - A real checkout total is `subtotal + delivery zone fee + 1% escrow fee`.
 *     The cheapest Nigerian zone is 150,000 kobo, so an 80,000-kobo checkout
 *     total is arithmetically impossible. The smallest colliding amount that is
 *     real on both services is 155,000 kobo:
 *       drive: Surulere -> Apapa, bike = 155,000
 *       shop : subtotal 4,951 + delivery 150,000 + escrow 49 = 155,000
 *   - Funding is 175,000 kobo so a single winner leaves exactly 20,000 kobo,
 *     preserving the requested remainder invariant at the real amounts.
 *
 * Usage:
 *   npx tsx scripts/wallet-spend-concurrency-acceptance.ts
 *
 * Optional worker mode is internal (set by the parent process); do not call it
 * directly. `DRIVE_SWEEP_DISABLED=1` prevents the fallback sweeper from adding
 * stdout noise or background work to the acceptance processes.
 */
import "dotenv/config";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";

const DB = "naijadeals_wallet_acceptance";
const RUN_ID = `${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${randomBytes(4).toString("hex")}`;
const DEMAND_KOBO = BigInt(155_000);
const FUNDING_KOBO = BigInt(175_000);
const EXPECTED_AVAILABLE_KOBO = BigInt(20_000);
const SHOP_SUBTOTAL_KOBO = BigInt(4_951);
const DRIVE_ROUTE = { pickupId: "surulere", dropoffId: "apapa", vehicleClassId: "bike" };
const REPO_ROOT = path.resolve(__dirname, "..");
const SELF = __filename;
const TSX_CLI = path.join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const WORKER_TIMEOUT_MS = 60_000;
const BARRIER_TIMEOUT_MS = 20_000;
const SERVICE_TIMEOUT_MS = 30_000;

type CheckResult = { name: string; pass: boolean; detail: string };
type WalletSnapshot = { available: string; held: string };
type JsonRecord = Record<string, unknown>;

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
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set in .env.");
  const url = new URL(raw);
  url.pathname = `/${DB}`;
  if (connectionLimit) url.searchParams.set("connection_limit", String(connectionLimit));
  return url.toString();
}

function snapshot(wallet: { availableKobo: bigint; heldKobo: bigint }): WalletSnapshot {
  return { available: wallet.availableKobo.toString(), held: wallet.heldKobo.toString() };
}

async function readWallet(prisma: PrismaClient, walletId: string) {
  return prisma.wallet.findUniqueOrThrow({
    where: { id: walletId },
    select: {
      id: true,
      ownerType: true,
      currency: true,
      availableKobo: true,
      heldKobo: true,
      userId: true,
      vendorId: true
    }
  });
}

async function backendPid(prisma: PrismaClient) {
  const rows = await prisma.$queryRawUnsafe<Array<{ pid: number }>>("select pg_backend_pid() as pid");
  return Number(rows[0]?.pid ?? 0);
}

async function createFixtureUser(prisma: PrismaClient, label: string) {
  return prisma.user.create({
    data: {
      email: `wc-spend-${RUN_ID}-${label}@example.test`,
      name: `WC spend acceptance ${label}`,
      actorType: "CUSTOMER"
    }
  });
}

async function fundCustomer(prisma: PrismaClient, input: {
  customerWalletId: string;
  systemWalletId: string;
  amountKobo: bigint;
  reference: string;
}) {
  const { postBalancedTransaction } = await import("../lib/services/core/wallet.service");
  await prisma.$transaction(async (tx) => {
    // Funding follows the same test-funding identity as creditTopUp and
    // premium-demo-funding: the SYSTEM wallet is debited and the customer
    // wallet credited in one journal. On a TEST database SYSTEM may go
    // negative; its stored projection and ledger net stay equal, so
    // reconciliation remains clean.
    await tx.wallet.update({
      where: { id: input.customerWalletId },
      data: { availableKobo: { increment: input.amountKobo } }
    });
    await tx.wallet.update({
      where: { id: input.systemWalletId },
      data: { availableKobo: { decrement: input.amountKobo } }
    });
    await postBalancedTransaction({
      tx,
      actorId: null,
      walletId: input.customerWalletId,
      type: "credit",
      amountKobo: input.amountKobo,
      reference: input.reference,
      description: "Isolated wallet acceptance funding: TEST funds, balanced against SYSTEM.",
      entries: [
        {
          walletId: input.systemWalletId,
          direction: "DEBIT",
          amountKobo: input.amountKobo,
          memo: "Wallet acceptance TEST funding"
        },
        {
          walletId: input.customerWalletId,
          direction: "CREDIT",
          amountKobo: input.amountKobo,
          memo: "Wallet acceptance TEST funding"
        }
      ]
    });
  });
}

/* ------------------------------------------------------------------ workers --- */

type WorkerSpec = {
  role: string;
  kind: "drive" | "shop" | "ride";
  userId: string;
  walletId: string;
  reference?: string;
  /** Milliseconds to wait after the shared release before starting the service call. */
  delayMs?: number;
};

type WorkerOutput = {
  __wc: "result";
  role: string;
  kind: string;
  ok: boolean;
  harnessError: boolean;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  readyAt: number;
  pid: number;
  database: string | null;
  walletId: string | null;
  backendPidBefore: number;
  backendPidAfter: number;
  walletBefore: WalletSnapshot | null;
  walletAfter: WalletSnapshot | null;
  result: JsonRecord | null;
  error: { name: string; status: number | null; code: string | null; message: string } | null;
  exitCode?: number | null;
  stderr?: string;
};

type WorkerHandle = { role: string; done: Promise<WorkerOutput>; kill: () => void };

function harnessOutput(role: string, kind: string, pid: number, message: string): WorkerOutput {
  return {
    __wc: "result",
    role,
    kind,
    ok: false,
    harnessError: true,
    startedAt: 0,
    endedAt: 0,
    durationMs: 0,
    readyAt: 0,
    pid,
    database: null,
    walletId: null,
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
      if (parsed.__wc === "result") return parsed as WorkerOutput;
    } catch {
      // Ignore non-JSON lines from Node/Prisma diagnostics.
    }
  }
  return null;
}

function spawnWorker(spec: WorkerSpec, barrierDir: string, url: string): WorkerHandle {
  const child = spawn(process.execPath, [TSX_CLI, SELF], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      DATABASE_URL: url,
      WC_WORKER: "1",
      WC_KIND: spec.kind,
      WC_ROLE: spec.role,
      WC_USER_ID: spec.userId,
      WC_WALLET_ID: spec.walletId,
      WC_PAYMENT_REFERENCE: spec.reference ?? "",
      WC_BARRIER_DIR: barrierDir,
      WC_DB: DB,
      WC_DELAY_MS: String(spec.delayMs ?? 0),
      DRIVE_SWEEP_DISABLED: "1",
      // No queue backend is part of this isolated run. Emptying VALKEY_URL makes
      // scheduleDelivery a no-op instead of letting BullMQ wait forever on an
      // absent Valkey while the payment's post-commit notification runs.
      VALKEY_URL: "",
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
      finish(harnessOutput(spec.role, spec.kind, child.pid ?? 0, `worker timed out after ${WORKER_TIMEOUT_MS} ms`));
    }, WORKER_TIMEOUT_MS);
    child.on("error", (error) => {
      finish(harnessOutput(spec.role, spec.kind, child.pid ?? 0, `worker spawn failed: ${String(error)}`));
    });
    child.on("exit", (code, signal) => {
      const payload = extractWorkerOutput(stdout);
      if (payload) {
        payload.exitCode = code;
        payload.stderr = redact(stderr).slice(0, 400);
        finish(payload);
        return;
      }
      finish(
        harnessOutput(
          spec.role,
          spec.kind,
          child.pid ?? 0,
          `worker produced no result (exit ${code ?? signal ?? "unknown"}): ${redact(stderr || stdout).slice(0, 400)}`
        )
      );
    });
  });

  return {
    role: spec.role,
    done,
    kill: () => {
      try {
        child.kill();
      } catch {
        // The process may already have exited.
      }
    }
  };
}

async function waitForFiles(paths: string[], timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (paths.every((candidate) => fs.existsSync(candidate))) return;
    await sleep(2);
  }
  throw new Error(`barrier timeout waiting for ${paths.map((candidate) => path.basename(candidate)).join(", ")}`);
}

function overlappingMs(results: WorkerOutput[]) {
  if (results.length < 2) return 0;
  const starts = results.map((result) => result.startedAt).filter((value) => value > 0);
  const ends = results.map((result) => result.endedAt).filter((value) => value > 0);
  if (starts.length !== results.length || ends.length !== results.length) return 0;
  return Math.max(0, Math.min(...ends) - Math.max(...starts));
}

type LockWaitSample = {
  at: number;
  pid: number;
  waitEventType: string | null;
  waitEvent: string | null;
  blockers: number[];
};

/**
 * Watch the two worker backends while they run. A row lock held by one
 * transaction makes the other wait on `transactionid`; `pg_blocking_pids` names
 * the holder. This distinguishes real database lock contention from mere
 * wall-clock overlap in the harness.
 */
function startLockMonitor(prisma: PrismaClient, pids: number[]) {
  const watched = pids.filter((pid) => Number.isInteger(pid) && pid > 0);
  const samples = new Map<string, LockWaitSample>();
  let polling = false;
  const timer = setInterval(() => {
    if (polling || watched.length === 0) return;
    polling = true;
    const list = watched.join(", ");
    prisma
      .$queryRawUnsafe<Array<{ pid: number; waitEventType: string | null; waitEvent: string | null; blockers: number[] }>>(
        `select pid, wait_event_type as "waitEventType", wait_event as "waitEvent", pg_blocking_pids(pid) as "blockers" from pg_stat_activity where pid in (${list})`
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
      .catch(() => {
        // Monitoring must never fail the race it observes.
      })
      .finally(() => {
        polling = false;
      });
  }, 4);
  timer.unref?.();
  return {
    async stop(): Promise<LockWaitSample[]> {
      clearInterval(timer);
      const stopAt = Date.now() + 250;
      while (polling && Date.now() < stopAt) await sleep(5);
      return [...samples.values()].sort((a, b) => a.at - b.at);
    }
  };
}

async function runRace(prisma: PrismaClient, label: string, specs: WorkerSpec[]) {
  const barrierDir = fs.mkdtempSync(path.join(os.tmpdir(), `wc-spend-${label}-`));
  // Two connections per worker: a payment transaction calls notifyVendorOwner,
  // which reads the vendor through the global client (a real defect: it should
  // use the transaction client). With connection_limit=1 that query waits for
  // the connection the transaction itself holds and the payment times out at
  // Prisma's 5 s transaction limit. Two connections keeps the worker independent
  // without masking the wallet row lock that this race is meant to exercise.
  const url = acceptanceUrl(2);
  const workers = specs.map((spec) => spawnWorker(spec, barrierDir, url));
  let barrierOk = true;
  let releasedAt = 0;
  let readyPids: number[] = [];
  let lockWaits: LockWaitSample[] = [];
  let monitor: ReturnType<typeof startLockMonitor> | null = null;
  try {
    await waitForFiles(
      specs.map((spec) => path.join(barrierDir, `ready-${spec.role}`)),
      BARRIER_TIMEOUT_MS
    );
    readyPids = specs.map((spec) => {
      try {
        const ready = JSON.parse(fs.readFileSync(path.join(barrierDir, `ready-${spec.role}`), "utf8")) as { backendPid?: number };
        return Number(ready.backendPid ?? 0);
      } catch {
        return 0;
      }
    });
    monitor = startLockMonitor(prisma, readyPids);
    releasedAt = Date.now();
    fs.writeFileSync(path.join(barrierDir, "go"), String(releasedAt));
    const results = await Promise.all(workers.map((worker) => worker.done));
    lockWaits = await monitor.stop();
    return { label, barrierOk, releasedAt, overlapMs: overlappingMs(results), results, readyPids, lockWaits };
  } catch (error) {
    barrierOk = false;
    for (const worker of workers) worker.kill();
    const results = await Promise.all(workers.map((worker) => worker.done));
    if (monitor) lockWaits = await monitor.stop();
    return { label, barrierOk, releasedAt, overlapMs: overlappingMs(results), results, readyPids, lockWaits };
  } finally {
    try {
      fs.rmSync(barrierDir, { recursive: true, force: true });
    } catch {
      // Temporary barrier files are harmless if cleanup races an open handle.
    }
  }
}

async function buildServiceCall(kind: WorkerSpec["kind"], input: { userId: string; reference: string }) {
  if (kind === "shop") {
    const { confirmPayment } = await import("../lib/payments/service");
    return async (): Promise<JsonRecord> => {
      const outcome = await confirmPayment({ reference: input.reference, provider: "wallet" });
      return { status: outcome.status, orderId: outcome.orderId, duplicate: outcome.duplicate };
    };
  }
  if (kind === "drive" || kind === "ride") {
    const { requestRide } = await import("../lib/services/core/drive.service");
    return async (): Promise<JsonRecord> => {
      const ride = await requestRide({
        riderId: input.userId,
        pickupId: DRIVE_ROUTE.pickupId,
        dropoffId: DRIVE_ROUTE.dropoffId,
        vehicleClassId: DRIVE_ROUTE.vehicleClassId,
        paymentMethod: "wallet"
      });
      return {
        rideId: ride.id,
        rideNumber: ride.rideNumber,
        fareKobo: ride.fareKobo.toString(),
        paymentStatus: ride.paymentStatus,
        paymentReference: ride.paymentReference
      };
    };
  }
  throw new Error(`Unknown worker kind: ${kind}`);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(`service call exceeded ${timeoutMs} ms`);
      error.name = "TimeoutError";
      (error as Error & { code?: string }).code = "harness_timeout";
      reject(error);
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function workerMain() {
  const role = requiredEnv("WC_ROLE");
  const kind = requiredEnv("WC_KIND") as WorkerSpec["kind"];
  const userId = requiredEnv("WC_USER_ID");
  const walletId = requiredEnv("WC_WALLET_ID");
  const barrierDir = requiredEnv("WC_BARRIER_DIR");
  const reference = process.env.WC_PAYMENT_REFERENCE ?? "";
  const expectedDb = process.env.WC_DB ?? DB;

  const { prisma } = await import("../lib/prisma");
  try {
    const db = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
    if (db[0]?.db !== expectedDb) {
      throw new Error(`worker database mismatch: ${db[0]?.db ?? "unknown"}, expected ${expectedDb}`);
    }
    const wallet = await readWallet(prisma, walletId);
    if (wallet.ownerType !== "CUSTOMER" || wallet.userId !== userId || wallet.currency !== "NGN") {
      throw new Error("worker wallet is not the expected CUSTOMER NGN wallet");
    }
    const backendPidBefore = await backendPid(prisma);
    // Import the real service before the barrier so the release is immediately
    // followed by the call, not by module loading.
    const call = await buildServiceCall(kind, { userId, reference });

    const readyAt = Date.now();
    fs.writeFileSync(
      path.join(barrierDir, `ready-${role}`),
      JSON.stringify({ readyAt, backendPid: backendPidBefore })
    );
    await waitForFiles([path.join(barrierDir, "go")], BARRIER_TIMEOUT_MS);

    const delayMs = Number(process.env.WC_DELAY_MS ?? 0);
    if (Number.isFinite(delayMs) && delayMs > 0) await sleep(delayMs);

    const startedAt = Date.now();
    fs.writeFileSync(path.join(barrierDir, `started-${role}`), String(startedAt));

    let result: JsonRecord | null = null;
    let error: WorkerOutput["error"] = null;
    try {
      result = await withTimeout(call(), SERVICE_TIMEOUT_MS);
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
    const timedOut = error?.code === "harness_timeout";
    const walletAfter = timedOut ? null : snapshot(await readWallet(prisma, walletId));
    const backendPidAfter = timedOut ? 0 : await backendPid(prisma);

    const payload: WorkerOutput = {
      __wc: "result",
      role,
      kind,
      ok: error === null,
      harnessError: timedOut,
      startedAt,
      endedAt,
      durationMs: endedAt - startedAt,
      readyAt,
      pid: process.pid,
      database: db[0]?.db ?? expectedDb,
      walletId,
      backendPidBefore,
      backendPidAfter,
      walletBefore: snapshot(wallet),
      walletAfter,
      result,
      error
    };
    process.stdout.write(`${JSON.stringify(payload, bigintReplacer)}\n`);
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

/* ------------------------------------------------------------------ reports --- */

async function journalTotals(prisma: PrismaClient) {
  const entries = await prisma.ledgerEntry.findMany({
    select: { direction: true, amountKobo: true, wallet: { select: { currency: true } } }
  });
  const byCurrency = new Map<string, bigint>();
  for (const entry of entries) {
    const delta = entry.direction === "CREDIT" ? entry.amountKobo : -entry.amountKobo;
    byCurrency.set(entry.wallet.currency, (byCurrency.get(entry.wallet.currency) ?? BigInt(0)) + delta);
  }
  return {
    entries: entries.length,
    byCurrency: [...byCurrency.entries()].map(([currency, net]) => ({ currency, net: net.toString() })),
    balanced: [...byCurrency.values()].every((net) => net === BigInt(0))
  };
}

async function projectionCheck(prisma: PrismaClient) {
  const wallets = await prisma.wallet.findMany({
    select: { id: true, ownerType: true, currency: true, availableKobo: true, heldKobo: true, userId: true, vendorId: true }
  });
  const legs = await prisma.ledgerEntry.groupBy({
    by: ["walletId", "direction"],
    _sum: { amountKobo: true }
  });
  const net = new Map<string, bigint>();
  for (const leg of legs) {
    const amount = leg._sum.amountKobo ?? BigInt(0);
    net.set(leg.walletId, (net.get(leg.walletId) ?? BigInt(0)) + (leg.direction === "CREDIT" ? amount : -amount));
  }

  // The two stored balances reconcile separately: available to the ledger net
  // less counterparty hold credits, held to the open reservations themselves.
  // The interpretation is imported from the Control Center reconciliation module
  // so this harness cannot drift from the checker it is validating.
  const { compareWalletProjection, loadOpenHoldLedger } = await import("../lib/services/core/reconciliation-correct");
  const holds = await loadOpenHoldLedger(prisma);

  const mismatched = wallets
    .map((wallet) => {
      const ledgerNet = net.get(wallet.id) ?? BigInt(0);
      const projection = compareWalletProjection({
        walletId: wallet.id,
        availableKobo: wallet.availableKobo,
        heldKobo: wallet.heldKobo,
        ledgerNetKobo: ledgerNet,
        holds
      });
      return {
        walletId: wallet.id,
        ownerType: wallet.ownerType,
        available: wallet.availableKobo.toString(),
        held: wallet.heldKobo.toString(),
        expectedAvailable: projection.expectedAvailableKobo.toString(),
        expectedHeld: projection.expectedHeldKobo.toString(),
        availableDifference: projection.availableDifferenceKobo.toString(),
        heldDifference: projection.heldDifferenceKobo.toString(),
        ledger: ledgerNet.toString()
      };
    })
    .filter((row) => row.availableDifference !== "0" || row.heldDifference !== "0");
  return { wallets: wallets.length, mismatched, unattributed: holds.unattributed.length };
}

type ReconcileReport = {
  database?: string;
  status?: string;
  wallets?: number;
  openRides?: number;
  openEscrows?: number;
  unattributedRides?: number;
  unattributedHolds?: number;
  mismatches?: number;
  duplicateIdentities?: number;
  mismatchRows?: Array<Record<string, unknown>>;
};

async function runReconcile(url: string): Promise<ReconcileReport> {
  return new Promise<ReconcileReport>((resolve, reject) => {
    const child = spawn(process.execPath, [TSX_CLI, path.join(REPO_ROOT, "scripts", "wallet-reconcile.ts")], {
      cwd: REPO_ROOT,
      env: { ...process.env, DATABASE_URL: url, RECONCILE_DB: DB, NODE_ENV: "test" },
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
        resolve(JSON.parse(stdout.slice(start, end + 1)) as ReconcileReport);
      } catch (error) {
        reject(new Error(`wallet-reconcile JSON could not be parsed: ${String(error)}`));
      }
    });
  });
}

/* ------------------------------------------------------------- fixtures --- */

const CHECKOUT_ADDRESS = {
  label: "WC acceptance fixture address",
  contactName: "WC acceptance customer",
  contactPhone: "+2348000000000",
  countryCode: "NG",
  state: "Lagos",
  city: "Lagos",
  line1: "1 Acceptance Fixture Way",
  line2: null,
  postalCode: null
};

/**
 * One complete real shop checkout: vendor, category, product with stock, cart,
 * checkout and a wallet payment initialized but not confirmed. Every slug and
 * identity is tagged with RUN_ID so cleanup can remove exactly this run.
 */
async function createShopFixture(
  prisma: PrismaClient,
  input: { customerId: string; label: string; stockQuantity?: number; priceKobo?: bigint }
) {
  const { checkout } = await import("../lib/services/core/checkout.service");
  const { initializePayment } = await import("../lib/payments/service");
  const slug = `wc-spend-${input.label}-${RUN_ID.toLowerCase()}`;
  const owner = await createFixtureUser(prisma, `vendor-${input.label}`);
  const vendor = await prisma.vendor.create({
    data: {
      ownerId: owner.id,
      name: `WC spend ${input.label} vendor ${RUN_ID}`,
      slug,
      market: "Isolated acceptance fixture market",
      description: "Isolated wallet-concurrency acceptance fixture. Not a real vendor.",
      pickupAddress: "1 Acceptance Fixture Way, Lagos",
      pickupPhone: "+2348000000000",
      status: "VERIFIED",
      commissionBps: 1000
    }
  });
  const category = await prisma.category.create({
    data: {
      name: `WC spend ${input.label} category ${RUN_ID}`,
      slug: `wc-spend-category-${input.label}-${RUN_ID.toLowerCase()}`,
      description: "Isolated wallet-concurrency acceptance fixture."
    }
  });
  const product = await prisma.product.create({
    data: {
      vendorId: vendor.id,
      categoryId: category.id,
      name: `WC acceptance ${input.label} item ${RUN_ID}`,
      slug: `wc-accept-item-${input.label}-${RUN_ID.toLowerCase()}`,
      description: "Isolated wallet-concurrency acceptance fixture. Not a real listing.",
      priceKobo: input.priceKobo ?? SHOP_SUBTOTAL_KOBO,
      status: "ACTIVE",
      isSample: false,
      stock: { create: { quantity: input.stockQuantity ?? 3, reserved: 0 } }
    }
  });
  await prisma.cart.create({ data: { userId: input.customerId, items: { create: { productId: product.id, quantity: 1 } } } });
  const checkoutResult = await checkout({ userId: input.customerId, address: CHECKOUT_ADDRESS, saveAddress: false });
  assert(checkoutResult.orders.length === 1, `${input.label}: expected one vendor order, got ${checkoutResult.orders.length}`);
  const orderId = checkoutResult.orders[0].orderId;
  const initialized = await initializePayment({
    orderId,
    userId: input.customerId,
    provider: "wallet",
    callbackUrl: "http://localhost/wallet"
  });
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { payments: true, escrowHolds: true, deliveries: true }
  });
  assert(order.totalKobo === DEMAND_KOBO, `${input.label}: checkout total ${order.totalKobo}, expected ${DEMAND_KOBO}`);
  return { owner, vendor, category, product, order, orderId, initialized, paymentId: initialized.paymentId };
}

/**
 * Delete only the rows this run created. Everything is selected by the RUN_ID
 * identity (`wc-spend-${RUN_ID}-...`) or by the run's own wallet/order/ride IDs,
 * so a concurrent or earlier run is never touched.
 */
async function cleanupRun(prisma: PrismaClient, runId: string = RUN_ID) {
  const emailPrefix = `wc-spend-${runId}-`;
  const runSlug = runId.toLowerCase();
  const users = await prisma.user.findMany({ where: { email: { startsWith: emailPrefix } }, select: { id: true } });
  const userIds = users.map((user) => user.id);
  if (userIds.length === 0) {
    return { users: 0, wallets: 0, orders: 0, rides: 0, transactions: 0, leftovers: 0 };
  }
  const vendors = await prisma.vendor.findMany({
    where: { OR: [{ ownerId: { in: userIds } }, { slug: { contains: runSlug } }] },
    select: { id: true }
  });
  const vendorIds = vendors.map((vendor) => vendor.id);
  const products = await prisma.product.findMany({
    where: { OR: [{ vendorId: { in: vendorIds } }, { slug: { contains: runSlug } }] },
    select: { id: true }
  });
  const productIds = products.map((product) => product.id);
  const categories = await prisma.category.findMany({ where: { slug: { contains: runSlug } }, select: { id: true } });
  const categoryIds = categories.map((category) => category.id);
  const orders = await prisma.order.findMany({
    where: { customerId: { in: userIds } },
    select: { id: true }
  });
  const orderIds = orders.map((order) => order.id);
  const carts = await prisma.cart.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
  const cartIds = carts.map((cart) => cart.id);
  const rides = await prisma.ride.findMany({ where: { riderId: { in: userIds } }, select: { id: true } });
  const rideIds = rides.map((ride) => ride.id);
  const deliveries = await prisma.delivery.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } });
  const deliveryIds = deliveries.map((delivery) => delivery.id);
  const escrows = await prisma.escrowHold.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } });
  const escrowIds = escrows.map((escrow) => escrow.id);
  const wallets = await prisma.wallet.findMany({
    where: { OR: [{ userId: { in: userIds } }, { vendorId: { in: vendorIds } }] },
    select: { id: true }
  });
  const walletIds = wallets.map((wallet) => wallet.id);
  const transactions = await prisma.walletTransaction.findMany({
    where: {
      OR: [
        { walletId: { in: walletIds } },
        { reference: { contains: runId } },
        { orderId: { in: orderIds } }
      ]
    },
    select: { id: true }
  });
  const transactionIds = transactions.map((transaction) => transaction.id);
  const entityIds = [
    ...orderIds,
    ...rideIds,
    ...deliveryIds,
    ...escrowIds,
    ...productIds,
    ...vendorIds,
    ...categoryIds,
    ...transactionIds
  ];

  /**
   * Our journals also moved the shared SYSTEM wallet (funding debits, ride hold
   * credits, ride releases and platform commission). Deleting those ledger rows
   * without reversing the stored projection would leave SYSTEM permanently out
   * of balance, so compute the exact inverse of each transaction's stored effect
   * before deleting anything. Only RUN_ID-tagged funding and our own rides and
   * releases are touched.
   */
  const systemWallet = await prisma.wallet.findFirst({ where: { ownerType: "SYSTEM" }, select: { id: true } });
  let systemAvailableDelta = BigInt(0);
  let systemHeldDelta = BigInt(0);
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
      if (transaction.type === "credit" && transaction.reference.includes(runId)) {
        // Funding debited SYSTEM available in the same journal as the customer credit.
        systemAvailableDelta += debit?.amountKobo ?? BigInt(0);
      } else if (transaction.type === "hold" && transaction.reference.startsWith("RIDE-")) {
        systemHeldDelta -= credit?.amountKobo ?? BigInt(0);
      } else if (transaction.type === "release" && transaction.reference.startsWith("RIDE-")) {
        systemHeldDelta += debit?.amountKobo ?? BigInt(0);
      } else if (transaction.type === "refund" && transaction.reference.startsWith("RIDE-")) {
        systemHeldDelta += debit?.amountKobo ?? BigInt(0);
      } else if (transaction.type === "fee" && transaction.reference.startsWith("RIDE-")) {
        systemHeldDelta += debit?.amountKobo ?? BigInt(0);
        systemAvailableDelta -= credit?.amountKobo ?? BigInt(0);
      } else if (transaction.type === "release" && transaction.reference.startsWith("RELEASE-")) {
        systemAvailableDelta -= credit?.amountKobo ?? BigInt(0);
      } else if (transaction.type === "refund" && transaction.reference.startsWith("REFUND-")) {
        systemAvailableDelta += debit?.amountKobo ?? BigInt(0);
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    if (systemWallet && (systemAvailableDelta !== BigInt(0) || systemHeldDelta !== BigInt(0))) {
      await tx.wallet.update({
        where: { id: systemWallet.id },
        data: {
          availableKobo: { increment: systemAvailableDelta },
          heldKobo: { increment: systemHeldDelta }
        }
      });
    }
    await tx.trackingEvent.deleteMany({ where: { deliveryId: { in: deliveryIds } } });
    await tx.delivery.deleteMany({ where: { id: { in: deliveryIds } } });
    await tx.dispute.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.refund.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.escrowEvent.deleteMany({ where: { escrowId: { in: escrowIds } } });
    await tx.escrowHold.deleteMany({ where: { id: { in: escrowIds } } });
    await tx.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.orderStatusEvent.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.orderAttribution.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.ledgerEntry.deleteMany({
      where: { OR: [{ transactionId: { in: transactionIds } }, { walletId: { in: walletIds } }] }
    });
    await tx.walletTransaction.deleteMany({ where: { id: { in: transactionIds } } });
    await tx.order.deleteMany({ where: { id: { in: orderIds } } });
    await tx.cartItem.deleteMany({ where: { cartId: { in: cartIds } } });
    await tx.cart.deleteMany({ where: { id: { in: cartIds } } });
    await tx.rideEvent.deleteMany({ where: { rideId: { in: rideIds } } });
    await tx.ride.deleteMany({ where: { id: { in: rideIds } } });
    await tx.wallet.deleteMany({ where: { id: { in: walletIds } } });
    await tx.auditLog.deleteMany({ where: { OR: [{ actorId: { in: userIds } }, { entityId: { in: entityIds } }] } });
    await tx.systemEvent.deleteMany({ where: { OR: [{ actorId: { in: userIds } }, { entityId: { in: entityIds } }] } });
    await tx.inventoryStock.deleteMany({ where: { productId: { in: productIds } } });
    await tx.productImage.deleteMany({ where: { productId: { in: productIds } } });
    await tx.product.deleteMany({ where: { id: { in: productIds } } });
    await tx.vendor.deleteMany({ where: { id: { in: vendorIds } } });
    await tx.category.deleteMany({ where: { id: { in: categoryIds } } });
    await tx.notificationAttempt.deleteMany({
      where: { notification: { OR: [{ userId: { in: userIds } }, { entityId: { in: entityIds } }] } }
    });
    // Paid shop orders now write a durable vendor notification intent inside the
    // payment transaction. It is this run's row, so cleanup removes it too.
    await tx.notificationIntent.deleteMany({
      where: { OR: [{ entityId: { in: entityIds } }, { dedupeKey: { contains: runId } }] }
    });
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
    orders: orderIds.length,
    rides: rideIds.length,
    transactions: transactionIds.length,
    leftovers
  };
}

function walletMismatchRows(report: ReconcileReport, walletId: string) {
  return (report.mismatchRows ?? []).filter((row) => row.walletId === walletId);
}

/**
 * Did one worker's transaction actually wait on a lock held by the other?
 * A 4 ms `pg_stat_activity` sample can miss short waits, so absence is reported
 * as "not observed" instead of being presented as either proof or disproof.
 */
function summarizeLocks(race: { lockWaits: LockWaitSample[]; readyPids: number[] }) {
  const relevant = race.lockWaits.filter(
    (sample) => race.readyPids.includes(sample.pid) && sample.blockers.some((pid) => race.readyPids.includes(pid))
  );
  return {
    observed: relevant.length > 0,
    samples: relevant.slice(0, 10),
    waitedPids: [...new Set(relevant.map((sample) => sample.pid))],
    blockerPids: [...new Set(relevant.flatMap((sample) => sample.blockers))],
    note:
      relevant.length > 0
        ? "At least one worker backend waited on a lock held by the other worker."
        : "No lock wait was captured by 4 ms pg_stat_activity sampling. Execution overlap alone is not proof of row-level contention."
  };
}

function winnerReference(result: WorkerOutput | null) {
  if ((result?.kind === "drive" || result?.kind === "ride") && typeof result.result?.rideId === "string") {
    return `RIDE-${result.result.rideId}-HOLD`;
  }
  if (result?.kind === "shop" && typeof result.result?.orderId === "string") {
    return `ESCROW-HOLD-${result.result.orderId}`;
  }
  return null;
}

function describeWorker(result: WorkerOutput) {
  return {
    role: result.role,
    kind: result.kind,
    ok: result.ok,
    harnessError: result.harnessError,
    durationMs: result.durationMs,
    startedAt: result.startedAt,
    endedAt: result.endedAt,
    pid: result.pid,
    database: result.database,
    walletId: result.walletId,
    backendPid: result.backendPidBefore,
    walletBefore: result.walletBefore,
    walletAfter: result.walletAfter,
    result: result.result,
    error: result.error
  };
}

/* --------------------------------------------------------------------- main --- */

async function main(prisma: PrismaClient, url: string) {
  const { ensureWallet, initializePayment, confirmPayment, refundPayment } = await import("../lib/payments/service");
  const { checkout, cancelOrder } = await import("../lib/services/core/checkout.service");
  const { getQuote } = await import("../lib/services/core/drive.service");

  const db = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  assert(db[0]?.db === DB, `wrong database ${db[0]?.db ?? "unknown"}, expected ${DB}`);

  const driveQuote = getQuote({
    pickupId: DRIVE_ROUTE.pickupId,
    dropoffId: DRIVE_ROUTE.dropoffId,
    vehicleClassId: DRIVE_ROUTE.vehicleClassId
  });
  assert(BigInt(driveQuote.fareKobo) === DEMAND_KOBO, `drive fare is ${driveQuote.fareKobo}, expected ${DEMAND_KOBO}`);

  const system = await ensureWallet(prisma, { ownerType: "SYSTEM" });
  const systemWallet = await readWallet(prisma, system.id);
  assert(systemWallet.ownerType === "SYSTEM", "SYSTEM wallet resolved to the wrong owner type");
  const systemBeforeFunding = snapshot(systemWallet);

  await prisma.citySetting.upsert({
    where: { countryCode_code: { countryCode: "NG", code: "lagos" } },
    update: { name: "Lagos", enabled: true },
    create: { countryCode: "NG", code: "lagos", name: "Lagos", enabled: true }
  });

  const customer = await createFixtureUser(prisma, "customer");
  const customerWallet = await ensureWallet(prisma, { userId: customer.id, ownerType: "CUSTOMER" });
  const beforeFunding = snapshot(await readWallet(prisma, customerWallet.id));
  const fundingReference = `WC-SPEND-FUND-${RUN_ID}`;
  await fundCustomer(prisma, {
    customerWalletId: customerWallet.id,
    systemWalletId: system.id,
    amountKobo: FUNDING_KOBO,
    reference: fundingReference
  });
  const afterFundingCustomer = await readWallet(prisma, customerWallet.id);
  const afterFundingSystem = await readWallet(prisma, system.id);
  record(
    "funding credits the customer exactly 175,000 kobo in one balanced journal",
    afterFundingCustomer.availableKobo === FUNDING_KOBO &&
      afterFundingCustomer.heldKobo === BigInt(0) &&
      afterFundingSystem.availableKobo === BigInt(systemBeforeFunding.available) - FUNDING_KOBO &&
      afterFundingSystem.heldKobo === BigInt(systemBeforeFunding.held) &&
      (await prisma.walletTransaction.count({ where: { reference: fundingReference } })) === 1,
    `customer ${JSON.stringify(snapshot(afterFundingCustomer))}, SYSTEM ${systemBeforeFunding.available}->${afterFundingSystem.availableKobo}, funding ref ${fundingReference}`
  );

  /* ---- Operation B fixtures: real checkout -> wallet payment ---- */
  const vendorOwner = await createFixtureUser(prisma, "vendor-owner");
  const lowerRun = RUN_ID.toLowerCase();
  const vendor = await prisma.vendor.create({
    data: {
      ownerId: vendorOwner.id,
      name: `WC spend fixture vendor ${RUN_ID}`,
      slug: `wc-spend-vendor-${lowerRun}`,
      market: "Isolated acceptance fixture market",
      description: "Isolated wallet-concurrency acceptance fixture. Not a real vendor.",
      pickupAddress: "1 Acceptance Fixture Way, Lagos",
      pickupPhone: "+2348000000000",
      status: "VERIFIED",
      commissionBps: 1000
    }
  });
  const category = await prisma.category.create({
    data: {
      name: `WC spend fixture category ${RUN_ID}`,
      slug: `wc-spend-category-${lowerRun}`,
      description: "Isolated wallet-concurrency acceptance fixture."
    }
  });
  const product = await prisma.product.create({
    data: {
      vendorId: vendor.id,
      categoryId: category.id,
      name: `WC acceptance fixture item ${RUN_ID}`,
      slug: `wc-accept-item-${lowerRun}`,
      description: "Isolated wallet-concurrency acceptance fixture. Not a real listing.",
      priceKobo: SHOP_SUBTOTAL_KOBO,
      status: "ACTIVE",
      isSample: false,
      stock: { create: { quantity: 5, reserved: 0 } }
    }
  });
  await prisma.cart.create({
    data: {
      userId: customer.id,
      items: { create: { productId: product.id, quantity: 1 } }
    }
  });
  const checkoutResult = await checkout({
    userId: customer.id,
    address: {
      label: "WC acceptance fixture address",
      contactName: "WC acceptance customer",
      contactPhone: "+2348000000000",
      countryCode: "NG",
      state: "Lagos",
      city: "Lagos",
      line1: "1 Acceptance Fixture Way",
      line2: null,
      postalCode: null
    },
    saveAddress: false
  });
  assert(checkoutResult.orders.length === 1, `expected one vendor order, got ${checkoutResult.orders.length}`);
  const checkoutOrder = checkoutResult.orders[0];
  const orderId = checkoutOrder.orderId;
  const orderRow = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { payments: true, escrowHolds: true, deliveries: true }
  });
  assert(orderRow.totalKobo === DEMAND_KOBO, `checkout total ${orderRow.totalKobo}, expected ${DEMAND_KOBO}`);
  assert(orderRow.subtotalKobo === SHOP_SUBTOTAL_KOBO, `checkout subtotal ${orderRow.subtotalKobo}`);
  assert(orderRow.deliveryFeeKobo === BigInt(150_000), `checkout delivery ${orderRow.deliveryFeeKobo}`);
  assert(orderRow.escrowFeeKobo === BigInt(49), `checkout escrow fee ${orderRow.escrowFeeKobo}`);
  assert(orderRow.currency === "NGN", `checkout currency ${orderRow.currency}`);
  assert(orderRow.paymentStatus === "pending", `checkout paymentStatus ${orderRow.paymentStatus}`);
  assert(orderRow.escrowHolds.length === 0, "checkout must not create an escrow hold before payment");
  assert(orderRow.deliveries.length === 0, "checkout must not create a delivery before payment");
  const inventoryBefore = await prisma.inventoryStock.findUniqueOrThrow({ where: { productId: product.id } });
  assert(inventoryBefore.quantity === 5 && inventoryBefore.reserved === 1, "checkout did not reserve exactly one unit");

  const initialized = await initializePayment({
    orderId,
    userId: customer.id,
    provider: "wallet",
    callbackUrl: "http://localhost/wallet"
  });
  const pendingPayment = await prisma.payment.findFirstOrThrow({ where: { orderId } });
  assert(pendingPayment.status === "PENDING", `payment fixture status ${pendingPayment.status}`);
  assert(pendingPayment.amountKobo === DEMAND_KOBO, `payment fixture amount ${pendingPayment.amountKobo}`);
  record(
    "shop fixture uses the real checkout total of 155,000 kobo",
    orderRow.subtotalKobo === SHOP_SUBTOTAL_KOBO &&
      orderRow.deliveryFeeKobo === BigInt(150_000) &&
      orderRow.escrowFeeKobo === BigInt(49) &&
      orderRow.totalKobo === DEMAND_KOBO,
    `subtotal ${orderRow.subtotalKobo} + delivery ${orderRow.deliveryFeeKobo} + escrow ${orderRow.escrowFeeKobo} = ${orderRow.totalKobo}`
  );

  /* ---- Cross-service race: requestRide vs confirmPayment ---- */
  const crossBefore = snapshot(await readWallet(prisma, customerWallet.id));
  const systemBeforeCrossRace = await readWallet(prisma, system.id);
  const cross = await runRace(prisma, "cross-service", [
    { role: "drive", kind: "drive", userId: customer.id, walletId: customerWallet.id },
    { role: "shop", kind: "shop", userId: customer.id, walletId: customerWallet.id, reference: initialized.reference }
  ]);
  const crossCustomer = await readWallet(prisma, customerWallet.id);
  const crossSystem = await readWallet(prisma, system.id);
  const crossVendorWallet = await prisma.wallet.findFirst({
    where: { vendorId: vendor.id, ownerType: "VENDOR" }
  });
  const crossRides = await prisma.ride.findMany({
    where: { riderId: customer.id },
    include: { events: true },
    orderBy: { createdAt: "asc" }
  });
  const crossOrder = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { payments: true, escrowHolds: true, deliveries: true }
  });
  const crossInventory = await prisma.inventoryStock.findUniqueOrThrow({ where: { productId: product.id } });
  const crossCustomerTxns = await prisma.walletTransaction.findMany({
    where: { walletId: customerWallet.id },
    include: { ledger: true },
    orderBy: { createdAt: "asc" }
  });
  const crossSuccesses = cross.results.filter((result) => result.ok && !result.harnessError);
  const crossFailures = cross.results.filter((result) => !result.ok && !result.harnessError);
  const crossWinner = crossSuccesses.length === 1 ? crossSuccesses[0] : null;
  const crossLoser = crossFailures.length === 1 ? crossFailures[0] : null;
  const crossWinnerRef = winnerReference(crossWinner);
  const crossHoldRefs = crossCustomerTxns.filter(
    (txn) => txn.reference.startsWith("RIDE-") || txn.reference.startsWith("ESCROW-HOLD-")
  );

  record(
    "cross-service: the two real calls actually overlapped",
    cross.barrierOk && cross.overlapMs > 0,
    `barrier=${cross.barrierOk}, overlap=${cross.overlapMs}ms, releases=${cross.releasedAt}`
  );
  record(
    "cross-service: workers used independent database connections",
    new Set(cross.results.map((result) => result.backendPidBefore)).size === cross.results.length &&
      cross.results.every((result) => result.backendPidBefore > 0),
    cross.results.map((result) => `${result.role}:pid=${result.pid}/backend=${result.backendPidBefore}`).join(", ")
  );
  record(
    "cross-service: both workers targeted the same database and wallet",
    cross.results.every((result) => result.database === DB && result.walletId === customerWallet.id),
    cross.results.map((result) => `${result.role}:${result.database}/${result.walletId}`).join(", ")
  );
  record(
    "cross-service: exactly one financial operation commits",
    crossSuccesses.length === 1 && crossFailures.length === 1,
    cross.results
      .map((result) => `${result.role}:${result.ok ? "COMMITTED" : `FAILED ${result.error?.code ?? "unknown"}`}`)
      .join(", ")
  );
  record(
    "cross-service: the loser fails with its real insufficient_wallet (402)",
    crossLoser?.error?.code === "insufficient_wallet" && crossLoser?.error?.status === 402,
    crossLoser
      ? `${crossLoser.role}: ${crossLoser.error?.status ?? "?"} ${crossLoser.error?.code ?? "?"} ${crossLoser.error?.message ?? ""}`
      : "no single loser"
  );
  record(
    "cross-service: customer available ends at exactly 20,000 kobo",
    crossCustomer.availableKobo === EXPECTED_AVAILABLE_KOBO,
    `available ${crossCustomer.availableKobo}, held ${crossCustomer.heldKobo}`
  );
  record(
    "cross-service: customer holds exactly the winner's 155,000 kobo",
    crossCustomer.heldKobo === DEMAND_KOBO,
    `held ${crossCustomer.heldKobo}`
  );
  record(
    "cross-service: exactly one hold/escrow journal exists",
    crossCustomerTxns.length === 2 &&
      crossCustomerTxns.some((txn) => txn.reference === fundingReference) &&
      crossHoldRefs.length === 1 &&
      crossWinnerRef !== null &&
      crossHoldRefs[0]?.reference === crossWinnerRef,
    `references ${crossCustomerTxns.map((txn) => txn.reference).join(", ")}`
  );
  record(
    "cross-service: no duplicate or unexpected financial posting",
    new Set(crossCustomerTxns.map((txn) => txn.reference)).size === crossCustomerTxns.length &&
      crossCustomerTxns.every((txn) => {
        const debits = txn.ledger.filter((leg) => leg.direction === "DEBIT").reduce((sum, leg) => sum + leg.amountKobo, BigInt(0));
        const credits = txn.ledger.filter((leg) => leg.direction === "CREDIT").reduce((sum, leg) => sum + leg.amountKobo, BigInt(0));
        return debits === credits && debits === txn.amountKobo;
      }),
    crossCustomerTxns.map((txn) => `${txn.reference}:${txn.ledger.length} legs`).join(", ")
  );

  if (crossWinner?.kind === "drive") {
    const rideId = typeof crossWinner.result?.rideId === "string" ? crossWinner.result.rideId : "";
    const ride = crossRides.find((row) => row.id === rideId) ?? null;
    record(
      "cross-service: the winning drive ride holds 155,000 kobo",
      ride !== null &&
        ride.fareKobo === DEMAND_KOBO &&
        ride.paymentStatus === "held" &&
        ride.paymentReference === crossWinnerRef &&
        ride.events.length === 1,
      ride ? `ride ${ride.rideNumber}, fare ${ride.fareKobo}, payment ${ride.paymentStatus}, events ${ride.events.length}` : "ride missing"
    );
    record(
      "cross-service: the losing shop payment left no escrow, delivery or wallet debit",
      crossOrder.escrowHolds.length === 0 &&
        crossOrder.deliveries.length === 0 &&
        crossOrder.paymentStatus === "pending" &&
        crossOrder.status === "payment_pending" &&
        crossOrder.payments.length === 1 &&
        crossOrder.payments[0]?.status === "PENDING" &&
        crossOrder.payments[0]?.failureReason === null,
      `order ${crossOrder.status}/${crossOrder.paymentStatus}, payment ${crossOrder.payments[0]?.status ?? "none"}, escrow ${crossOrder.escrowHolds.length}, deliveries ${crossOrder.deliveries.length}`
    );
    record(
      "cross-service: the losing shop checkout left stock reserved, not committed",
      crossInventory.quantity === 5 && crossInventory.reserved === 1,
      `quantity ${crossInventory.quantity}, reserved ${crossInventory.reserved}`
    );
    record(
      "cross-service: SYSTEM holds the fare and the vendor holds nothing",
      crossSystem.heldKobo === systemBeforeCrossRace.heldKobo + DEMAND_KOBO &&
        (crossVendorWallet?.heldKobo ?? BigInt(0)) === BigInt(0),
      `SYSTEM held ${systemBeforeCrossRace.heldKobo}->${crossSystem.heldKobo} available ${crossSystem.availableKobo}, vendor held ${crossVendorWallet?.heldKobo?.toString() ?? "no wallet"}`
    );
    record(
      "cross-service: the losing drive request left no ride row",
      crossRides.length === 1,
      `${crossRides.length} ride row(s)`
    );
  } else if (crossWinner?.kind === "shop") {
    const escrow = crossOrder.escrowHolds[0];
    record(
      "cross-service: the winning shop order is paid and escrow-held",
      crossOrder.paymentStatus === "paid" &&
        crossOrder.status === "vendor_notified" &&
        crossOrder.payments.length === 1 &&
        crossOrder.payments[0]?.status === "COMPLETED" &&
        crossOrder.escrowHolds.length === 1 &&
        escrow?.amountKobo === DEMAND_KOBO &&
        escrow?.status === "held" &&
        crossOrder.deliveries.length === 1,
      `order ${crossOrder.status}/${crossOrder.paymentStatus}, payment ${crossOrder.payments[0]?.status ?? "none"}, escrow ${escrow?.status ?? "none"} ${escrow?.amountKobo ?? 0}, deliveries ${crossOrder.deliveries.length}`
    );
    record(
      "cross-service: the winning shop checkout committed the reserved unit exactly once",
      crossInventory.quantity === 4 && crossInventory.reserved === 0,
      `quantity ${crossInventory.quantity}, reserved ${crossInventory.reserved}`
    );
    record(
      "cross-service: the vendor holds the escrow and SYSTEM's held balance is unchanged",
      crossSystem.heldKobo === systemBeforeCrossRace.heldKobo &&
        (crossVendorWallet?.heldKobo ?? BigInt(0)) === DEMAND_KOBO,
      `SYSTEM held ${systemBeforeCrossRace.heldKobo}->${crossSystem.heldKobo}, vendor held ${crossVendorWallet?.heldKobo?.toString() ?? "no wallet"}`
    );
    record(
      "cross-service: the losing drive request left no ride row",
      crossRides.length === 0,
      `${crossRides.length} ride row(s)`
    );
  } else {
    record("cross-service: one drive or shop operation wins", false, "no single winner");
    record("cross-service: winner-specific side effects are inspectable", false, "no single winner");
  }

  record(
    "cross-service: SYSTEM projection reflects the funding and winner allocation",
    crossSystem.availableKobo === systemBeforeCrossRace.availableKobo &&
      crossSystem.heldKobo ===
        systemBeforeCrossRace.heldKobo + (crossWinner?.kind === "drive" ? DEMAND_KOBO : BigInt(0)),
    `SYSTEM available ${systemBeforeCrossRace.availableKobo}->${crossSystem.availableKobo}, held ${systemBeforeCrossRace.heldKobo}->${crossSystem.heldKobo}`
  );

  const crossJournals = await journalTotals(prisma);
  record("journals balance per currency after the cross-service race", crossJournals.balanced, JSON.stringify(crossJournals.byCurrency));
  const crossProjections = await projectionCheck(prisma);
  record(
    "stored wallet projections agree with the ledger after the cross-service race",
    crossProjections.mismatched.length === 0,
    `${crossProjections.wallets} wallets, ${crossProjections.mismatched.length} mismatch(es)`
  );
  const reconcileAfterCross = await runReconcile(url);
  record(
    "wallet-reconcile reports CLEAN after the cross-service race",
    reconcileAfterCross.database === DB &&
      reconcileAfterCross.status === "CLEAN" &&
      reconcileAfterCross.mismatches === 0 &&
      reconcileAfterCross.duplicateIdentities === 0,
    JSON.stringify(reconcileAfterCross)
  );

  /* ---- Same-rider concurrent requestRide ---- */
  const rider = await createFixtureUser(prisma, "same-rider");
  const riderWallet = await ensureWallet(prisma, { userId: rider.id, ownerType: "CUSTOMER" });
  const riderBeforeFunding = snapshot(await readWallet(prisma, riderWallet.id));
  const rideFundingReference = `WC-SPEND-RIDE-FUND-${RUN_ID}`;
  await fundCustomer(prisma, {
    customerWalletId: riderWallet.id,
    systemWalletId: system.id,
    amountKobo: FUNDING_KOBO,
    reference: rideFundingReference
  });
  const riderAfterFunding = await readWallet(prisma, riderWallet.id);
  record(
    "same-rider: funding credits exactly 175,000 kobo",
    riderAfterFunding.availableKobo === FUNDING_KOBO && riderAfterFunding.heldKobo === BigInt(0),
    `available ${riderAfterFunding.availableKobo}, held ${riderAfterFunding.heldKobo}`
  );

  const systemBeforeRideRace = await readWallet(prisma, system.id);
  const rideRace = await runRace(prisma, "same-rider", [
    { role: "ride-a", kind: "ride", userId: rider.id, walletId: riderWallet.id },
    { role: "ride-b", kind: "ride", userId: rider.id, walletId: riderWallet.id }
  ]);
  const riderAfter = await readWallet(prisma, riderWallet.id);
  const systemAfterRide = await readWallet(prisma, system.id);
  const riderRides = await prisma.ride.findMany({
    where: { riderId: rider.id },
    include: { events: true }
  });
  const riderTxns = await prisma.walletTransaction.findMany({
    where: { walletId: riderWallet.id },
    include: { ledger: true }
  });
  const rideSuccesses = rideRace.results.filter((result) => result.ok && !result.harnessError);
  const rideFailures = rideRace.results.filter((result) => !result.ok && !result.harnessError);
  const rideWinner = rideSuccesses.length === 1 ? rideSuccesses[0] : null;
  const rideWinnerRef = winnerReference(rideWinner);
  const rideRefs = riderTxns.filter((txn) => txn.reference.startsWith("RIDE-"));

  record(
    "same-rider: the two requestRide calls actually overlapped",
    rideRace.barrierOk && rideRace.overlapMs > 0,
    `barrier=${rideRace.barrierOk}, overlap=${rideRace.overlapMs}ms`
  );
  record(
    "same-rider: workers used independent database connections",
    new Set(rideRace.results.map((result) => result.backendPidBefore)).size === rideRace.results.length &&
      rideRace.results.every((result) => result.backendPidBefore > 0),
    rideRace.results.map((result) => `${result.role}:backend=${result.backendPidBefore}`).join(", ")
  );
  record(
    "same-rider: both workers targeted the same database and wallet",
    rideRace.results.every((result) => result.database === DB && result.walletId === riderWallet.id),
    rideRace.results.map((result) => `${result.role}:${result.database}/${result.walletId}`).join(", ")
  );
  record(
    "same-rider: exactly one ride commits",
    rideSuccesses.length === 1 && rideFailures.length === 1 && riderRides.length === 1,
    rideRace.results
      .map((result) => `${result.role}:${result.ok ? "COMMITTED" : `FAILED ${result.error?.code ?? "unknown"}`}`)
      .join(", ")
  );
  record(
    "same-rider: the second request is refused by the active-ride rule",
    rideFailures[0]?.error?.code === "active_ride_exists" && rideFailures[0]?.error?.status === 409,
    rideFailures[0]
      ? `${rideFailures[0].role}: ${rideFailures[0].error?.status ?? "?"} ${rideFailures[0].error?.code ?? "?"}`
      : "no single loser"
  );
  record(
    "same-rider: exactly one fare hold is posted",
    riderTxns.length === 2 &&
      riderTxns.some((txn) => txn.reference === rideFundingReference) &&
      rideRefs.length === 1 &&
      rideWinnerRef !== null &&
      rideRefs[0]?.reference === rideWinnerRef,
    `transactions ${riderTxns.map((txn) => txn.reference).join(", ")}`
  );
  record(
    "same-rider: the committed ride holds 155,000 kobo and has one event",
    rideWinner !== null &&
      riderRides[0]?.fareKobo === DEMAND_KOBO &&
      riderRides[0]?.paymentStatus === "held" &&
      riderRides[0]?.paymentReference === rideWinnerRef &&
      riderRides[0]?.events.length === 1,
    riderRides[0]
      ? `ride ${riderRides[0].rideNumber}, fare ${riderRides[0].fareKobo}, payment ${riderRides[0].paymentStatus}, events ${riderRides[0].events.length}`
      : "ride missing"
  );
  record(
    "same-rider: customer available ends at exactly 20,000 kobo",
    riderAfter.availableKobo === EXPECTED_AVAILABLE_KOBO && riderAfter.heldKobo === DEMAND_KOBO,
    `available ${riderAfter.availableKobo}, held ${riderAfter.heldKobo}`
  );
  record(
    "same-rider: SYSTEM holds the fare and its funding projection stays consistent",
    systemAfterRide.availableKobo === systemBeforeRideRace.availableKobo &&
      systemAfterRide.heldKobo === systemBeforeRideRace.heldKobo + DEMAND_KOBO,
    `SYSTEM available ${systemBeforeRideRace.availableKobo}->${systemAfterRide.availableKobo}, held ${systemBeforeRideRace.heldKobo}->${systemAfterRide.heldKobo}`
  );

  const finalJournals = await journalTotals(prisma);
  record("journals balance per currency after the same-rider race", finalJournals.balanced, JSON.stringify(finalJournals.byCurrency));
  const finalProjections = await projectionCheck(prisma);
  record(
    "stored wallet projections agree with the ledger after the same-rider race",
    finalProjections.mismatched.length === 0,
    `${finalProjections.wallets} wallets, ${finalProjections.mismatched.length} mismatch(es)`
  );
  const reconcileFinal = await runReconcile(url);
  record(
    "wallet-reconcile reports CLEAN after both races",
    reconcileFinal.database === DB &&
      reconcileFinal.status === "CLEAN" &&
      reconcileFinal.mismatches === 0 &&
      reconcileFinal.duplicateIdentities === 0,
    JSON.stringify(reconcileFinal)
  );

  /* ---- Controlled winners, failed-checkout lifecycle and checker accuracy ---- */

  const reconciliationModule = await import("../lib/services/core/reconciliation-correct");
  const readOrder = (orderId: string) =>
    prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { payments: true, escrowHolds: true, deliveries: true }
    });
  const readStock = (productId: string) =>
    prisma.inventoryStock.findUniqueOrThrow({ where: { productId } });
  const vendorWalletOf = (vendorId: string) =>
    prisma.wallet.findFirst({ where: { vendorId, ownerType: "VENDOR" } });

  /**
   * A legitimate lifecycle state must reconcile CLEAN through both the checker
   * script and the Control Center module. This asserts the whole books, not only
   * the fixture wallet, so an unrelated regression is visible too.
   */
  const checkpoint = async (label: string, walletIds: string[]) => {
    const report = await runReconcile(url);
    const fixtureRows = walletIds.flatMap((walletId) => walletMismatchRows(report, walletId));
    const issues = await reconciliationModule.reconcile();
    record(
      `${label}: wallet-reconcile is CLEAN`,
      report.status === "CLEAN" && report.mismatches === 0 && report.unattributedHolds === 0 && fixtureRows.length === 0,
      `status ${report.status}, wallets ${report.wallets}, mismatches ${report.mismatches}, unattributed ${report.unattributedHolds}`
    );
    record(
      `${label}: reconciliation-correct reports no issue`,
      issues.issues.length === 0,
      issues.issues.map((issue) => `${issue.kind}:${issue.subject}`).join(", ") || "0 issues"
    );
  };

  /* ---- Controlled Drive-wins: drive released first, shop 500 ms later ---- */
  const dwCustomer = await createFixtureUser(prisma, "drive-wins");
  const dwWallet = await ensureWallet(prisma, { userId: dwCustomer.id, ownerType: "CUSTOMER" });
  await fundCustomer(prisma, {
    customerWalletId: dwWallet.id,
    systemWalletId: system.id,
    amountKobo: FUNDING_KOBO,
    reference: `WC-SPEND-DW-FUND-${RUN_ID}`
  });
  const dwAfterFunding = await readWallet(prisma, dwWallet.id);
  const dwFixture = await createShopFixture(prisma, { customerId: dwCustomer.id, label: "drive-wins" });
  const dwRace = await runRace(prisma, "drive-wins", [
    { role: "drive", kind: "drive", userId: dwCustomer.id, walletId: dwWallet.id, delayMs: 0 },
    {
      role: "shop",
      kind: "shop",
      userId: dwCustomer.id,
      walletId: dwWallet.id,
      reference: dwFixture.initialized.reference,
      delayMs: 500
    }
  ]);
  const dwDrive = dwRace.results.find((result) => result.role === "drive") ?? null;
  const dwShop = dwRace.results.find((result) => result.role === "shop") ?? null;
  const dwAfterRace = await readWallet(prisma, dwWallet.id);
  const dwOrderAfterRace = await readOrder(dwFixture.orderId);
  const dwStockAfterRace = await readStock(dwFixture.product.id);
  record(
    "drive-wins (controlled): the real ride hold commits",
    dwDrive?.ok === true && !dwDrive.harnessError,
    dwDrive ? `${dwDrive.role}: ${JSON.stringify(dwDrive.result)}` : "drive result missing"
  );
  record(
    "drive-wins (controlled): the real shop payment is refused 402 insufficient_wallet",
    dwShop?.error?.status === 402 && dwShop?.error?.code === "insufficient_wallet",
    dwShop ? `${dwShop.error?.status ?? "?"} ${dwShop.error?.code ?? "?"}` : "shop result missing"
  );
  record(
    "drive-wins (controlled): the losing checkout keeps only its deliberate reservation",
    dwOrderAfterRace.status === "payment_pending" &&
      dwOrderAfterRace.paymentStatus === "pending" &&
      dwOrderAfterRace.payments.length === 1 &&
      dwOrderAfterRace.payments[0]?.status === "PENDING" &&
      dwOrderAfterRace.escrowHolds.length === 0 &&
      dwOrderAfterRace.deliveries.length === 0 &&
      dwStockAfterRace.quantity === 3 &&
      dwStockAfterRace.reserved === 1,
    `order ${dwOrderAfterRace.status}/${dwOrderAfterRace.paymentStatus}, payment ${dwOrderAfterRace.payments[0]?.status}, escrow ${dwOrderAfterRace.escrowHolds.length}, stock ${dwStockAfterRace.quantity}/${dwStockAfterRace.reserved}`
  );
  record(
    "drive-wins (controlled): wallet ends 20,000 available and 155,000 held",
    dwAfterRace.availableKobo === EXPECTED_AVAILABLE_KOBO && dwAfterRace.heldKobo === DEMAND_KOBO,
    `available ${dwAfterRace.availableKobo}, held ${dwAfterRace.heldKobo}`
  );
  await checkpoint("drive-wins hold", [dwWallet.id]);

  /* ---- Safe retry of the losing shop payment after funding ---- */
  await fundCustomer(prisma, {
    customerWalletId: dwWallet.id,
    systemWalletId: system.id,
    amountKobo: DEMAND_KOBO,
    reference: `WC-SPEND-DW-RETRY-${RUN_ID}`
  });
  const dwRetry = await confirmPayment({ reference: dwFixture.initialized.reference, provider: "wallet" });
  const dwAfterRetry = await readWallet(prisma, dwWallet.id);
  const dwOrderPaid = await readOrder(dwFixture.orderId);
  const dwStockRetry = await readStock(dwFixture.product.id);
  const dwHoldJournal = await prisma.walletTransaction.count({
    where: { walletId: dwWallet.id, reference: `ESCROW-HOLD-${dwFixture.orderId}` }
  });
  record(
    "drive-wins retry: the pending shop payment completes once",
    dwRetry.duplicate === false &&
      dwRetry.status === "COMPLETED" &&
      dwOrderPaid.paymentStatus === "paid" &&
      dwOrderPaid.payments[0]?.status === "COMPLETED" &&
      dwOrderPaid.escrowHolds.length === 1 &&
      dwOrderPaid.escrowHolds[0]?.status === "held" &&
      dwOrderPaid.deliveries.length === 1 &&
      dwStockRetry.quantity === 2 &&
      dwStockRetry.reserved === 0 &&
      dwHoldJournal === 1,
    `duplicate ${dwRetry.duplicate}, order ${dwOrderPaid.paymentStatus}, escrow ${dwOrderPaid.escrowHolds[0]?.status ?? "none"}, stock ${dwStockRetry.quantity}/${dwStockRetry.reserved}, hold journals ${dwHoldJournal}`
  );
  record(
    "drive-wins retry: wallet 20,000 available and 310,000 held (ride + escrow)",
    dwAfterRetry.availableKobo === EXPECTED_AVAILABLE_KOBO && dwAfterRetry.heldKobo === DEMAND_KOBO * BigInt(2),
    `available ${dwAfterRetry.availableKobo}, held ${dwAfterRetry.heldKobo}`
  );
  const dwRetryAgain = await confirmPayment({ reference: dwFixture.initialized.reference, provider: "wallet" });
  const dwAfterRetryAgain = await readWallet(prisma, dwWallet.id);
  const dwHoldJournalAgain = await prisma.walletTransaction.count({
    where: { walletId: dwWallet.id, reference: `ESCROW-HOLD-${dwFixture.orderId}` }
  });
  record(
    "drive-wins retry: a replay is a duplicate with no second debit",
    dwRetryAgain.duplicate === true &&
      dwAfterRetryAgain.availableKobo === dwAfterRetry.availableKobo &&
      dwAfterRetryAgain.heldKobo === dwAfterRetry.heldKobo &&
      dwHoldJournalAgain === 1,
    `duplicate ${dwRetryAgain.duplicate}, available ${dwAfterRetryAgain.availableKobo}, held ${dwAfterRetryAgain.heldKobo}, hold journals ${dwHoldJournalAgain}`
  );
  await checkpoint("two legitimate open holds", [dwWallet.id]);

  /* ---- Partial refund against an open escrow ---- */
  const dwPartial = await refundPayment({
    orderId: dwFixture.orderId,
    actorId: dwCustomer.id,
    reason: "Acceptance partial refund before release",
    amountKobo: 55_000n
  });
  const dwAfterPartial = await readWallet(prisma, dwWallet.id);
  const dwOrderAfterPartial = await readOrder(dwFixture.orderId);
  const dwVendorAfterPartial = await vendorWalletOf(dwFixture.vendor.id);
  record(
    "drive-wins refund: a 55,000 partial refund reduces both sides of the open escrow",
    dwPartial.refundedKobo === "55000" &&
      dwAfterPartial.availableKobo === BigInt(75_000) &&
      dwAfterPartial.heldKobo === BigInt(255_000) &&
      dwOrderAfterPartial.refundedKobo === BigInt(55_000) &&
      dwOrderAfterPartial.escrowHolds[0]?.status === "held" &&
      (dwVendorAfterPartial?.heldKobo ?? BigInt(-1)) === BigInt(100_000),
    `refunded ${dwPartial.refundedKobo}, wallet ${dwAfterPartial.availableKobo}/${dwAfterPartial.heldKobo}, order refunded ${dwOrderAfterPartial.refundedKobo}, escrow ${dwOrderAfterPartial.escrowHolds[0]?.status}, vendor held ${dwVendorAfterPartial?.heldKobo?.toString() ?? "none"}`
  );
  await checkpoint("partial refund against an open escrow", [dwWallet.id]);

  /* ---- Full refund of the remainder ---- */
  const dwFull = await refundPayment({
    orderId: dwFixture.orderId,
    actorId: dwCustomer.id,
    reason: "Acceptance full refund before release",
    amountKobo: 100_000n
  });
  const dwAfterFull = await readWallet(prisma, dwWallet.id);
  const dwOrderAfterFull = await readOrder(dwFixture.orderId);
  const dwVendorAfterFull = await vendorWalletOf(dwFixture.vendor.id);
  record(
    "drive-wins refund: the remainder closes the escrow and leaves only the ride hold",
    dwFull.refundedKobo === "100000" &&
      dwAfterFull.availableKobo === BigInt(175_000) &&
      dwAfterFull.heldKobo === DEMAND_KOBO &&
      dwOrderAfterFull.paymentStatus === "refunded" &&
      dwOrderAfterFull.escrowHolds[0]?.status === "refunded" &&
      (dwVendorAfterFull?.heldKobo ?? BigInt(-1)) === BigInt(0),
    `refunded ${dwFull.refundedKobo}, wallet ${dwAfterFull.availableKobo}/${dwAfterFull.heldKobo}, order ${dwOrderAfterFull.paymentStatus}, escrow ${dwOrderAfterFull.escrowHolds[0]?.status}, vendor held ${dwVendorAfterFull?.heldKobo?.toString() ?? "none"}`
  );
  await checkpoint("full refund against an open escrow", [dwWallet.id]);

  /* ---- Ride cancellation releases the remaining hold ---- */
  const { cancelRide } = await import("../lib/services/core/drive.service");
  const dwRide = await prisma.ride.findFirstOrThrow({
    where: { riderId: dwCustomer.id, paymentStatus: "held" }
  });
  await cancelRide({
    actorId: dwCustomer.id,
    isAdmin: false,
    rideId: dwRide.id,
    reason: "Acceptance release of the drive hold"
  });
  const dwAfterCancel = await readWallet(prisma, dwWallet.id);
  const dwRideAfter = await prisma.ride.findUniqueOrThrow({ where: { id: dwRide.id } });
  record(
    "drive-wins cancel: the ride hold returns to the rider exactly once",
    dwAfterCancel.availableKobo === BigInt(330_000) &&
      dwAfterCancel.heldKobo === BigInt(0) &&
      dwRideAfter.paymentStatus === "refunded",
    `available ${dwAfterCancel.availableKobo}, held ${dwAfterCancel.heldKobo}, ride ${dwRideAfter.paymentStatus}`
  );
  await checkpoint("ride cancel", [dwWallet.id]);

  /* ---- Controlled Shop-wins: shop released first, drive 500 ms later ---- */
  const swCustomer = await createFixtureUser(prisma, "shop-wins");
  const swWallet = await ensureWallet(prisma, { userId: swCustomer.id, ownerType: "CUSTOMER" });
  await fundCustomer(prisma, {
    customerWalletId: swWallet.id,
    systemWalletId: system.id,
    amountKobo: FUNDING_KOBO,
    reference: `WC-SPEND-SW-FUND-${RUN_ID}`
  });
  const swAfterFunding = await readWallet(prisma, swWallet.id);
  const swFixture = await createShopFixture(prisma, { customerId: swCustomer.id, label: "shop-wins" });
  const swSystemBeforeRace = await readWallet(prisma, system.id);
  const swRace = await runRace(prisma, "shop-wins", [
    {
      role: "shop",
      kind: "shop",
      userId: swCustomer.id,
      walletId: swWallet.id,
      reference: swFixture.initialized.reference,
      delayMs: 0
    },
    { role: "drive", kind: "drive", userId: swCustomer.id, walletId: swWallet.id, delayMs: 500 }
  ]);
  const swShop = swRace.results.find((result) => result.role === "shop") ?? null;
  const swDrive = swRace.results.find((result) => result.role === "drive") ?? null;
  if (!swShop?.ok) {
    process.stderr.write(
      `shop-wins diagnostics: ${JSON.stringify(
        {
          releasedAt: swRace.releasedAt,
          shop: swShop ? describeWorker(swShop) : null,
          drive: swDrive ? describeWorker(swDrive) : null
        },
        bigintReplacer
      )}\n`
    );
  }
  const swAfterRace = await readWallet(prisma, swWallet.id);
  const swOrder = await readOrder(swFixture.orderId);
  const swStock = await readStock(swFixture.product.id);
  const swVendorWallet = await vendorWalletOf(swFixture.vendor.id);
  const swSystemAfterRace = await readWallet(prisma, system.id);
  const swRides = await prisma.ride.count({ where: { riderId: swCustomer.id } });
  record(
    "shop-wins (controlled): the real shop payment commits and Drive is refused",
    swShop?.ok === true &&
      !swShop.harnessError &&
      swDrive?.error?.status === 402 &&
      swDrive?.error?.code === "insufficient_wallet",
    `shop ${swShop?.ok ? "COMMITTED" : swShop?.error?.code ?? "missing"}, drive ${swDrive?.error?.status ?? "?"} ${swDrive?.error?.code ?? "?"}`
  );
  record(
    "shop-wins (controlled): order paid, escrow held, delivery created, stock committed",
    swOrder.paymentStatus === "paid" &&
      swOrder.status === "vendor_notified" &&
      swOrder.payments[0]?.status === "COMPLETED" &&
      swOrder.escrowHolds.length === 1 &&
      swOrder.escrowHolds[0]?.status === "held" &&
      swOrder.escrowHolds[0]?.amountKobo === DEMAND_KOBO &&
      swOrder.deliveries.length === 1 &&
      swStock.quantity === 2 &&
      swStock.reserved === 0,
    `order ${swOrder.status}/${swOrder.paymentStatus}, escrow ${swOrder.escrowHolds[0]?.status}, deliveries ${swOrder.deliveries.length}, stock ${swStock.quantity}/${swStock.reserved}`
  );
  record(
    "shop-wins (controlled): wallet 20,000 available, vendor holds 155,000, no ride row",
    swAfterRace.availableKobo === EXPECTED_AVAILABLE_KOBO &&
      swAfterRace.heldKobo === DEMAND_KOBO &&
      (swVendorWallet?.heldKobo ?? BigInt(-1)) === DEMAND_KOBO &&
      swSystemAfterRace.heldKobo === swSystemBeforeRace.heldKobo &&
      swRides === 0,
    `customer ${swAfterRace.availableKobo}/${swAfterRace.heldKobo}, vendor held ${swVendorWallet?.heldKobo?.toString() ?? "none"}, SYSTEM held ${swSystemAfterRace.heldKobo}, rides ${swRides}`
  );
  await checkpoint("shop escrow hold", [swWallet.id]);
  const swDuplicate = await confirmPayment({ reference: swFixture.initialized.reference, provider: "wallet" }).then(
    (result) => result,
    (error: unknown) => ({ duplicate: false, error: String(error) })
  );
  const swAfterDuplicate = await readWallet(prisma, swWallet.id);
  record(
    "shop-wins retry: confirming the paid order again is a duplicate with no debit",
    swDuplicate.duplicate === true &&
      swAfterDuplicate.availableKobo === swAfterRace.availableKobo &&
      swAfterDuplicate.heldKobo === swAfterRace.heldKobo,
    `duplicate ${swDuplicate.duplicate}, wallet ${swAfterDuplicate.availableKobo}/${swAfterDuplicate.heldKobo}${"error" in swDuplicate ? `, error ${swDuplicate.error}` : ""}`
  );

  /* ---- Escrow release, then a full refund after release ---- */
  const { completeOrder } = await import("../lib/services/core/order.service");
  const platformBeforeRelease = await readWallet(prisma, system.id);
  // Fixture precondition: the delivery service has already delivered the order.
  await prisma.order.update({ where: { id: swFixture.orderId }, data: { status: "delivered" } });
  await completeOrder(swCustomer.id, swFixture.orderId);
  const swAfterRelease = await readWallet(prisma, swWallet.id);
  const swOrderAfterRelease = await readOrder(swFixture.orderId);
  const swVendorAfterRelease = await vendorWalletOf(swFixture.vendor.id);
  const swSystemAfterRelease = await readWallet(prisma, system.id);
  const swPayable = swOrder.subtotalKobo - swOrder.commissionKobo + swOrder.deliveryFeeKobo;
  const swPlatformCut = swOrder.totalKobo - swPayable;
  record(
    "shop release: escrow moves to the seller net of commission exactly once",
    swAfterRelease.availableKobo === EXPECTED_AVAILABLE_KOBO &&
      swAfterRelease.heldKobo === BigInt(0) &&
      swOrderAfterRelease.status === "completed" &&
      swOrderAfterRelease.escrowHolds[0]?.status === "released" &&
      (swVendorAfterRelease?.availableKobo ?? BigInt(-1)) === swPayable &&
      (swVendorAfterRelease?.heldKobo ?? BigInt(-1)) === BigInt(0) &&
      swSystemAfterRelease.availableKobo === platformBeforeRelease.availableKobo + swPlatformCut,
    `buyer ${swAfterRelease.availableKobo}/${swAfterRelease.heldKobo}, order ${swOrderAfterRelease.status}, escrow ${swOrderAfterRelease.escrowHolds[0]?.status}, vendor ${swVendorAfterRelease?.availableKobo?.toString() ?? "none"}/${swVendorAfterRelease?.heldKobo?.toString() ?? "none"}, platform +${swSystemAfterRelease.availableKobo - platformBeforeRelease.availableKobo}`
  );
  await checkpoint("escrow release", [swWallet.id, swVendorWallet?.id ?? ""].filter(Boolean));
  // A full refund after release must debit the seller's payable and the
  // platform's commission/fee. The TEST SYSTEM wallet is negative because every
  // test funding debits it, so the guarded platform-share debit must refuse
  // instead of overdrawing. The claim and the PENDING refund row are written in
  // the same transaction as the wallet movement, so a refusal leaves nothing
  // claimed: refundedKobo, refund rows, journals and wallets must be unchanged.
  const swRefundKey = `wc-spend-refund-${RUN_ID}`;
  const swRefundError = await refundPayment({
    orderId: swFixture.orderId,
    actorId: swCustomer.id,
    reason: "Acceptance full refund after release",
    idempotencyKey: swRefundKey
  }).then(
    () => null,
    (error: unknown) => error as { status?: number; code?: string; message?: string }
  );
  const swAfterRefundAttempt = await readWallet(prisma, swWallet.id);
  const swVendorAfterRefundAttempt = await vendorWalletOf(swFixture.vendor.id);
  const swOrderAfterRefundAttempt = await readOrder(swFixture.orderId);
  const swRefundRows = await prisma.refund.count({ where: { orderId: swFixture.orderId } });
  const swRefundJournals = await prisma.walletTransaction.count({
    where: { orderId: swFixture.orderId, reference: { startsWith: "REFUND-" } }
  });
  record(
    "shop refund after release: the guarded platform-share debit refuses instead of overdrawing SYSTEM",
    swRefundError?.status === 409 &&
      swRefundError?.code === "refund_conflict" &&
      swAfterRefundAttempt.availableKobo === swAfterRelease.availableKobo &&
      swAfterRefundAttempt.heldKobo === BigInt(0) &&
      (swVendorAfterRefundAttempt?.availableKobo ?? BigInt(-1)) === swPayable &&
      swOrderAfterRefundAttempt.refundedKobo === BigInt(0) &&
      swOrderAfterRefundAttempt.paymentStatus === "paid" &&
      swRefundRows === 0 &&
      swRefundJournals === 0,
    `${swRefundError?.status ?? "?"} ${swRefundError?.code ?? "?"}, buyer ${swAfterRefundAttempt.availableKobo}/${swAfterRefundAttempt.heldKobo}, vendor ${swVendorAfterRefundAttempt?.availableKobo?.toString() ?? "none"}, refundedKobo ${swOrderAfterRefundAttempt.refundedKobo}, refund rows ${swRefundRows}, journals ${swRefundJournals}`
  );
  await checkpoint("refused refund after release", [swWallet.id, swVendorWallet?.id ?? ""].filter(Boolean));

  /* ---- Unpaid checkout cancellation releases the reservation ---- */
  const cancelCustomer = await createFixtureUser(prisma, "cancel-checkout");
  const cancelFixture = await createShopFixture(prisma, { customerId: cancelCustomer.id, label: "cancel-checkout" });
  const cancelStockBefore = await readStock(cancelFixture.product.id);
  const cancelOutcome = await cancelOrder({
    orderId: cancelFixture.orderId,
    userId: cancelCustomer.id,
    reason: "Acceptance cancellation before payment"
  });
  const cancelOrderRow = await readOrder(cancelFixture.orderId);
  const cancelStockAfter = await readStock(cancelFixture.product.id);
  const cancelJournals = await prisma.walletTransaction.count({ where: { orderId: cancelFixture.orderId } });
  const cancelRetry = await confirmPayment({ reference: cancelFixture.initialized.reference, provider: "wallet" }).then(
    () => null,
    (error: unknown) => error as { status?: number; code?: string }
  );
  record(
    "checkout cancel: reserved stock is released and the order closes without money moving",
    cancelStockBefore.quantity === 3 &&
      cancelStockBefore.reserved === 1 &&
      cancelStockAfter.quantity === 3 &&
      cancelStockAfter.reserved === 0 &&
      cancelOrderRow.status === "cancelled" &&
      cancelOrderRow.paymentStatus === "pending" &&
      cancelOrderRow.payments[0]?.status === "FAILED" &&
      cancelOrderRow.escrowHolds.length === 0 &&
      cancelOrderRow.deliveries.length === 0 &&
      cancelJournals === 0,
    `stock ${cancelStockBefore.quantity}/${cancelStockBefore.reserved} -> ${cancelStockAfter.quantity}/${cancelStockAfter.reserved}, order ${cancelOrderRow.status}, payment ${cancelOrderRow.payments[0]?.status}, journals ${cancelJournals}, cancelled ${cancelOutcome.cancelled}`
  );
  record(
    "checkout cancel: confirming the cancelled payment is refused",
    cancelRetry?.status === 409 && cancelRetry?.code === "payment_failed",
    `${cancelRetry?.status ?? "?"} ${cancelRetry?.code ?? "?"}`
  );

  /* ---- Abandoned checkout expiry ---- */
  const { expireAbandonedCheckouts } = await import("../lib/services/core/checkout.service");
  const expireCustomer = await createFixtureUser(prisma, "expire-checkout");
  const expireFixture = await createShopFixture(prisma, { customerId: expireCustomer.id, label: "expire-checkout" });
  const backdate = new Date(Date.now() - 2 * 60 * 60 * 1000);
  await prisma.$executeRaw`UPDATE "Order" SET "createdAt" = ${backdate}, "updatedAt" = ${backdate} WHERE id = ${expireFixture.orderId}`;
  const sweep = await expireAbandonedCheckouts({
    olderThanMs: 60 * 60 * 1000,
    limit: 10,
    orderIds: [expireFixture.orderId]
  });
  const expireOrderRow = await readOrder(expireFixture.orderId);
  const expireStock = await readStock(expireFixture.product.id);
  const expireJournals = await prisma.walletTransaction.count({ where: { orderId: expireFixture.orderId } });
  const sweepAgain = await expireAbandonedCheckouts({
    olderThanMs: 60 * 60 * 1000,
    limit: 10,
    orderIds: [expireFixture.orderId]
  });
  record(
    "checkout expiry: an abandoned order is cancelled and its reserved stock released",
    sweep.expired.some((row) => row.orderId === expireFixture.orderId) &&
      expireOrderRow.status === "cancelled" &&
      expireOrderRow.payments[0]?.status === "FAILED" &&
      expireStock.quantity === 3 &&
      expireStock.reserved === 0 &&
      expireOrderRow.escrowHolds.length === 0 &&
      expireOrderRow.deliveries.length === 0 &&
      expireJournals === 0 &&
      sweepAgain.expired.length === 0,
    `expired ${sweep.expired.length}, second sweep ${sweepAgain.expired.length}, order ${expireOrderRow.status}, payment ${expireOrderRow.payments[0]?.status}, stock ${expireStock.quantity}/${expireStock.reserved}, journals ${expireJournals}`
  );

  /* ---- Expiry must never touch a paid order ---- */
  const guardCustomer = await createFixtureUser(prisma, "expiry-paid-guard");
  const guardWallet = await ensureWallet(prisma, { userId: guardCustomer.id, ownerType: "CUSTOMER" });
  await fundCustomer(prisma, {
    customerWalletId: guardWallet.id,
    systemWalletId: system.id,
    amountKobo: DEMAND_KOBO,
    reference: `WC-SPEND-GUARD-FUND-${RUN_ID}`
  });
  const guardFixture = await createShopFixture(prisma, { customerId: guardCustomer.id, label: "expiry-paid-guard" });
  await confirmPayment({ reference: guardFixture.initialized.reference, provider: "wallet" });
  await prisma.$executeRaw`UPDATE "Order" SET "createdAt" = ${backdate}, "updatedAt" = ${backdate} WHERE id = ${guardFixture.orderId}`;
  const guardSweep = await expireAbandonedCheckouts({
    olderThanMs: 60 * 60 * 1000,
    limit: 10,
    orderIds: [guardFixture.orderId]
  });
  const guardOrderRow = await readOrder(guardFixture.orderId);
  const guardStock = await readStock(guardFixture.product.id);
  record(
    "checkout expiry: a paid order is never expired or restocked",
    guardSweep.inspected === 0 &&
      guardSweep.expired.length === 0 &&
      guardOrderRow.paymentStatus === "paid" &&
      guardOrderRow.escrowHolds[0]?.status === "held" &&
      guardOrderRow.deliveries.length === 1 &&
      guardStock.quantity === 2 &&
      guardStock.reserved === 0,
    `inspected ${guardSweep.inspected}, expired ${guardSweep.expired.length}, order ${guardOrderRow.paymentStatus}, escrow ${guardOrderRow.escrowHolds[0]?.status}, stock ${guardStock.quantity}/${guardStock.reserved}`
  );

  /* ---- Expiry racing the payment that makes the order paid ---- */
  const raceCustomer = await createFixtureUser(prisma, "expiry-payment-race");
  const raceWallet = await ensureWallet(prisma, { userId: raceCustomer.id, ownerType: "CUSTOMER" });
  await fundCustomer(prisma, {
    customerWalletId: raceWallet.id,
    systemWalletId: system.id,
    amountKobo: DEMAND_KOBO,
    reference: `WC-SPEND-EXPIRY-RACE-FUND-${RUN_ID}`
  });
  const raceFixture = await createShopFixture(prisma, { customerId: raceCustomer.id, label: "expiry-payment-race" });
  await prisma.$executeRaw`UPDATE "Order" SET "createdAt" = ${backdate}, "updatedAt" = ${backdate} WHERE id = ${raceFixture.orderId}`;
  const [racePayment, raceSweep] = await Promise.allSettled([
    confirmPayment({ reference: raceFixture.initialized.reference, provider: "wallet" }),
    expireAbandonedCheckouts({ olderThanMs: 60 * 1000, limit: 10, orderIds: [raceFixture.orderId] })
  ]);
  const racedOrder = await readOrder(raceFixture.orderId);
  const racedStock = await readStock(raceFixture.product.id);
  const racedWallet = await readWallet(prisma, raceWallet.id);
  const racedPayment = racedOrder.payments[0];
  const paid = racedOrder.paymentStatus === "paid";
  const cancelled = racedOrder.status === "cancelled";
  record(
    "expiry/payment race: exactly one terminal outcome, never both",
    (paid || cancelled) && !(paid && cancelled) && raceSweep.status === "fulfilled",
    `order ${racedOrder.status}/${racedOrder.paymentStatus}, payment ${racedPayment?.status}, sweep ${raceSweep.status}, pay ${racePayment.status}`
  );
  record(
    "expiry/payment race: a paid order keeps escrow, delivery and committed stock",
    !paid ||
      (racedPayment?.status === "COMPLETED" &&
        racedOrder.escrowHolds.length === 1 &&
        racedOrder.escrowHolds[0]?.status === "held" &&
        racedOrder.deliveries.length === 1 &&
        racedStock.quantity === 2 &&
        racedStock.reserved === 0 &&
        racedWallet.availableKobo === BigInt(0) &&
        racedWallet.heldKobo === DEMAND_KOBO),
    `order ${racedOrder.paymentStatus}, escrow ${racedOrder.escrowHolds.length}, deliveries ${racedOrder.deliveries.length}, stock ${racedStock.quantity}/${racedStock.reserved}, wallet ${racedWallet.availableKobo}/${racedWallet.heldKobo}`
  );
  record(
    "expiry/payment race: a cancelled order releases stock with no escrow, delivery or debit",
    !cancelled ||
      (racedPayment?.status === "FAILED" &&
        racedOrder.escrowHolds.length === 0 &&
        racedOrder.deliveries.length === 0 &&
        racedStock.quantity === 3 &&
        racedStock.reserved === 0 &&
        racedWallet.availableKobo === DEMAND_KOBO &&
        racedWallet.heldKobo === BigInt(0)),
    `order ${racedOrder.status}, payment ${racedPayment?.status}, escrow ${racedOrder.escrowHolds.length}, deliveries ${racedOrder.deliveries.length}, stock ${racedStock.quantity}/${racedStock.reserved}, wallet ${racedWallet.availableKobo}/${racedWallet.heldKobo}`
  );

  /* ---- Checker accuracy: deliberately corrupted fixtures must be REVIEW ---- */
  const corruptCustomer = await createFixtureUser(prisma, "corrupt-available");
  const corruptWallet = await ensureWallet(prisma, { userId: corruptCustomer.id, ownerType: "CUSTOMER" });
  await fundCustomer(prisma, {
    customerWalletId: corruptWallet.id,
    systemWalletId: system.id,
    amountKobo: BigInt(100_000),
    reference: `WC-SPEND-CORRUPT-AVAILABLE-${RUN_ID}`
  });
  await prisma.wallet.update({ where: { id: corruptWallet.id }, data: { availableKobo: { increment: 7_777n } } });
  const corruptAvailableReport = await runReconcile(url);
  const corruptAvailableRow = walletMismatchRows(corruptAvailableReport, corruptWallet.id)[0];
  const corruptAvailableIssues = await reconciliationModule.reconcile();
  const availableIssue = corruptAvailableIssues.issues.find(
    (issue) => issue.subject === corruptWallet.id && issue.kind === "wallet_available_delta"
  );
  record(
    "checker accuracy: an altered available projection is REVIEW, not CLEAN",
    corruptAvailableReport.status === "REVIEW" &&
      corruptAvailableReport.mismatches !== 0 &&
      Number(corruptAvailableRow?.availableDifference) === 7_777,
    `status ${corruptAvailableReport.status}, mismatches ${corruptAvailableReport.mismatches}, row ${JSON.stringify(corruptAvailableRow ?? null)}`
  );
  record(
    "checker accuracy: reconciliation-correct emits wallet_available_delta for the altered projection",
    availableIssue !== undefined && availableIssue.severity === "broken" && Number(availableIssue.deltaKobo) === 7_777,
    availableIssue ? `${availableIssue.kind}/${availableIssue.severity} ${availableIssue.deltaKobo}` : "no issue"
  );
  await prisma.wallet.update({ where: { id: corruptWallet.id }, data: { availableKobo: { decrement: 7_777n } } });

  const orphanCustomer = await createFixtureUser(prisma, "corrupt-orphan-hold");
  const orphanWallet = await ensureWallet(prisma, { userId: orphanCustomer.id, ownerType: "CUSTOMER" });
  await fundCustomer(prisma, {
    customerWalletId: orphanWallet.id,
    systemWalletId: system.id,
    amountKobo: FUNDING_KOBO,
    reference: `WC-SPEND-CORRUPT-HOLD-${RUN_ID}`
  });
  const { requestRide } = await import("../lib/services/core/drive.service");
  await requestRide({
    riderId: orphanCustomer.id,
    pickupId: DRIVE_ROUTE.pickupId,
    dropoffId: DRIVE_ROUTE.dropoffId,
    vehicleClassId: DRIVE_ROUTE.vehicleClassId,
    paymentMethod: "wallet"
  });
  const orphanRide = await prisma.ride.findFirstOrThrow({ where: { riderId: orphanCustomer.id } });
  // The wallet still holds 155,000 and the journal still exists; only the
  // business record that justifies the hold is removed. This is the corruption
  // fixture: the checker must notice the held balance has no open record.
  await prisma.ride.delete({ where: { id: orphanRide.id } });
  const orphanReport = await runReconcile(url);
  const orphanRow = walletMismatchRows(orphanReport, orphanWallet.id)[0];
  const orphanIssues = await reconciliationModule.reconcile();
  const orphanHeldIssue = orphanIssues.issues.find(
    (issue) => issue.subject === orphanWallet.id && issue.kind === "wallet_held_delta"
  );
  record(
    "checker accuracy: a held balance without its business record is REVIEW, not CLEAN",
    orphanReport.status === "REVIEW" &&
      orphanReport.mismatches !== 0 &&
      Number(orphanRow?.heldDifference) === 155_000 &&
      Number(orphanRow?.availableDifference) === 0,
    `status ${orphanReport.status}, mismatches ${orphanReport.mismatches}, row ${JSON.stringify(orphanRow ?? null)}`
  );
  record(
    "checker accuracy: reconciliation-correct emits wallet_held_delta for the orphaned hold",
    orphanHeldIssue !== undefined &&
      orphanHeldIssue.severity === "unexplained" &&
      Number(orphanHeldIssue.deltaKobo) === 155_000,
    orphanHeldIssue ? `${orphanHeldIssue.kind}/${orphanHeldIssue.severity} ${orphanHeldIssue.deltaKobo}` : "no issue"
  );

  /* ---- Repeatability: remove every fixture this run created ---- */
  const cleanup = await cleanupRun(prisma);
  const postCleanupReport = await runReconcile(url);
  const postCleanupIssues = await reconciliationModule.reconcile();
  record(
    "repeatability: cleanup removes every row tagged with this run id",
    cleanup.leftovers === 0,
    JSON.stringify(cleanup)
  );
  record(
    "repeatability: the books are CLEAN again after cleanup",
    postCleanupReport.status === "CLEAN" &&
      postCleanupReport.mismatches === 0 &&
      postCleanupReport.unattributedHolds === 0 &&
      postCleanupIssues.issues.length === 0,
    `reconcile ${postCleanupReport.status}/${postCleanupReport.mismatches}, issues ${postCleanupIssues.issues.length}`
  );

  const report = {
    database: DB,
    runId: RUN_ID,
    command: "npx tsx scripts/wallet-spend-concurrency-acceptance.ts",
    amountDerivation: {
      requestedOperationKobo: "80000",
      requestedFundingKobo: "100000",
      selectedOperationKobo: DEMAND_KOBO.toString(),
      selectedFundingKobo: FUNDING_KOBO.toString(),
      expectedRemainderKobo: EXPECTED_AVAILABLE_KOBO.toString(),
      drive: {
        route: `${DRIVE_ROUTE.pickupId} -> ${DRIVE_ROUTE.dropoffId} (${DRIVE_ROUTE.vehicleClassId})`,
        authoritativeFareKobo: driveQuote.fareKobo,
        distanceMeters: driveQuote.distanceMeters,
        durationMinutes: driveQuote.durationMinutes,
        noShippedQuoteAt80000: true,
        reason:
          "quoteDrive rounds to the nearest 5,000 kobo; no shipped place/vehicle-class pair quotes 80,000."
      },
      shop: {
        subtotalKobo: orderRow.subtotalKobo.toString(),
        deliveryFeeKobo: orderRow.deliveryFeeKobo.toString(),
        escrowFeeKobo: orderRow.escrowFeeKobo.toString(),
        totalKobo: orderRow.totalKobo.toString(),
        reason:
          "A real checkout total includes the cheapest Lagos delivery fee of 150,000 kobo, so 80,000 is arithmetically impossible; 4,951 + 150,000 + 49 = 155,000."
      },
      fundingIdentity:
        "SYSTEM debited in the same balanced journal as the customer credit (same TEST-funding identity used by creditTopUp and premium-demo-funding). SYSTEM may go negative on a TEST database; stored projections and ledger net stay equal."
    },
    crossService: {
      beforeFunding,
      afterFunding: snapshot(afterFundingCustomer),
      beforeRace: crossBefore,
      afterRace: snapshot(crossCustomer),
      winner: crossWinner?.role ?? null,
      winnerKind: crossWinner?.kind ?? null,
      winnerReference: crossWinnerRef,
      loser: crossLoser?.role ?? null,
      loserError: crossLoser?.error ?? null,
      releasedAt: cross.releasedAt,
      overlapMs: cross.overlapMs,
      results: cross.results.map(describeWorker),
      lockContention: summarizeLocks(cross),
      shopFixture: {
        orderId,
        paymentId: pendingPayment.id,
        paymentReference: initialized.reference,
        subtotalKobo: orderRow.subtotalKobo.toString(),
        deliveryFeeKobo: orderRow.deliveryFeeKobo.toString(),
        escrowFeeKobo: orderRow.escrowFeeKobo.toString(),
        totalKobo: orderRow.totalKobo.toString()
      },
      projections: crossProjections,
      journalTotals: crossJournals,
      reconcile: reconcileAfterCross
    },
    sameRider: {
      beforeFunding: riderBeforeFunding,
      afterFunding: snapshot(riderAfterFunding),
      afterRace: snapshot(riderAfter),
      winner: rideWinner?.role ?? null,
      winnerReference: rideWinnerRef,
      loser: rideFailures[0]?.role ?? null,
      loserError: rideFailures[0]?.error ?? null,
      releasedAt: rideRace.releasedAt,
      overlapMs: rideRace.overlapMs,
      results: rideRace.results.map(describeWorker),
      lockContention: summarizeLocks(rideRace),
      projections: finalProjections,
      journalTotals: finalJournals,
      reconcile: reconcileFinal
    },
    controlledWinners: {
      driveWins: {
        afterFunding: snapshot(dwAfterFunding),
        afterRace: snapshot(dwAfterRace),
        afterRetry: snapshot(dwAfterRetry),
        afterPartialRefund: snapshot(dwAfterPartial),
        afterFullRefund: snapshot(dwAfterFull),
        afterRideCancel: snapshot(dwAfterCancel),
        drive: dwDrive ? describeWorker(dwDrive) : null,
        shop: dwShop ? describeWorker(dwShop) : null,
        loserOrder: {
          orderId: dwFixture.orderId,
          status: dwOrderAfterRace.status,
          paymentStatus: dwOrderAfterRace.paymentStatus,
          paymentStatusRow: dwOrderAfterRace.payments[0]?.status ?? null,
          reservedStock: dwStockAfterRace.reserved
        },
        lockContention: summarizeLocks(dwRace)
      },
      shopWins: {
        afterFunding: snapshot(swAfterFunding),
        afterRace: snapshot(swAfterRace),
        afterRelease: snapshot(swAfterRelease),
        afterRefundAttempt: snapshot(swAfterRefundAttempt),
        refundRefusal: swRefundError,
        refundRowsAfterRefusal: swRefundRows,
        shop: swShop ? describeWorker(swShop) : null,
        drive: swDrive ? describeWorker(swDrive) : null,
        vendorHeldAfterHold: swVendorWallet?.heldKobo?.toString() ?? null,
        vendorAvailableAfterRelease: swVendorAfterRelease?.availableKobo?.toString() ?? null,
        payableKobo: swPayable.toString(),
        platformCutKobo: swPlatformCut.toString(),
        lockContention: summarizeLocks(swRace)
      }
    },
    failedCheckout: {
      retry: {
        walletBeforeRetry: snapshot(dwAfterRace),
        walletAfterRetry: snapshot(dwAfterRetry),
        walletAfterReplay: snapshot(dwAfterRetryAgain),
        orderStatusAfterRetry: dwOrderPaid.status,
        paymentStatusAfterRetry: dwOrderPaid.paymentStatus,
        escrowStatus: dwOrderPaid.escrowHolds[0]?.status ?? null,
        deliveries: dwOrderPaid.deliveries.length,
        stock: `${dwStockRetry.quantity}/${dwStockRetry.reserved}`,
        holdJournals: dwHoldJournal
      },
      cancellation: {
        orderStatus: cancelOrderRow.status,
        paymentStatus: cancelOrderRow.payments[0]?.status ?? null,
        stockBefore: `${cancelStockBefore.quantity}/${cancelStockBefore.reserved}`,
        stockAfter: `${cancelStockAfter.quantity}/${cancelStockAfter.reserved}`,
        walletJournals: cancelJournals,
        confirmAfterCancel: cancelRetry
      },
      expiry: {
        expired: sweep.expired.length,
        secondSweepExpired: sweepAgain.expired.length,
        orderStatus: expireOrderRow.status,
        paymentStatus: expireOrderRow.payments[0]?.status ?? null,
        stock: `${expireStock.quantity}/${expireStock.reserved}`,
        walletJournals: expireJournals
      },
      paidOrderGuard: {
        inspected: guardSweep.inspected,
        expired: guardSweep.expired.length,
        orderPaymentStatus: guardOrderRow.paymentStatus,
        escrowStatus: guardOrderRow.escrowHolds[0]?.status ?? null,
        deliveries: guardOrderRow.deliveries.length,
        stock: `${guardStock.quantity}/${guardStock.reserved}`
      },
      expiryPaymentRace: {
        orderStatus: racedOrder.status,
        paymentStatus: racedOrder.paymentStatus,
        paymentRowStatus: racedPayment?.status ?? null,
        escrow: racedOrder.escrowHolds.length,
        deliveries: racedOrder.deliveries.length,
        stock: `${racedStock.quantity}/${racedStock.reserved}`,
        wallet: snapshot(racedWallet),
        sweep: raceSweep.status,
        payment: racePayment.status
      }
    },
    checkerAccuracy: {
      alteredAvailable: {
        reportStatus: corruptAvailableReport.status,
        row: corruptAvailableRow ?? null,
        issue: availableIssue ? { kind: availableIssue.kind, severity: availableIssue.severity, deltaKobo: availableIssue.deltaKobo } : null
      },
      orphanedHold: {
        reportStatus: orphanReport.status,
        row: orphanRow ?? null,
        issue: orphanHeldIssue
          ? { kind: orphanHeldIssue.kind, severity: orphanHeldIssue.severity, deltaKobo: orphanHeldIssue.deltaKobo }
          : null
      }
    },
    repeatability: {
      runId: RUN_ID,
      cleanup,
      postCleanup: {
        reconcileStatus: postCleanupReport.status,
        mismatches: postCleanupReport.mismatches,
        unattributedHolds: postCleanupReport.unattributedHolds,
        issues: postCleanupIssues.issues.length
      }
    },
    checks,
    failures,
    status: failures === 0 ? "PASS" : "FAIL"
  };

  console.log(JSON.stringify(report, bigintReplacer, 2));
}

/* ---------------------------------------------------------------- dispatch --- */

/**
 * Recovery path for a run whose process died before cleanup. The run id is the
 * identity tag every fixture carries, so this removes exactly that run and no
 * other. cleanupRun reverses the shared SYSTEM wallet's stored effect first, so
 * deleting the journals cannot leave SYSTEM out of balance.
 */
async function runCleanupOnly() {
  const runId = process.env.WC_CLEANUP_RUN_ID;
  if (!runId) throw new Error("WC_CLEANUP_RUN_ID is required when WC_CLEANUP_ONLY=1.");
  process.env.VALKEY_URL = "";
  const url = acceptanceUrl();
  process.env.DATABASE_URL = url;
  const { prisma } = await import("../lib/prisma");
  try {
    const db = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
    assert(db[0]?.db === DB, `wrong database ${db[0]?.db ?? "unknown"}, expected ${DB}`);
    const cleanup = await cleanupRun(prisma, runId);
    console.log(JSON.stringify({ mode: "cleanup-only", database: DB, runId, ...cleanup }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

async function runAcceptance() {
  process.env.DRIVE_SWEEP_DISABLED = "1";
  // Post-commit notifications must not wait on an absent Valkey in this isolated
  // run; the financial services under test are unchanged.
  process.env.VALKEY_URL = "";
  const url = acceptanceUrl();
  process.env.DATABASE_URL = url;
  const { prisma } = await import("../lib/prisma");
  try {
    await main(prisma, url);
  } catch (error) {
    // Best-effort cleanup of this run's fixtures; never mask the original failure.
    try {
      const cleanup = await cleanupRun(prisma);
      process.stderr.write(`cleanup after failure: ${JSON.stringify(cleanup)}\n`);
    } catch (cleanupError) {
      process.stderr.write(`cleanup after failure failed: ${redact(String(cleanupError))}\n`);
    }
    throw error;
  }
}

if (process.env.WC_WORKER === "1") {
  workerMain().catch((error) => {
    process.stderr.write(`${redact(String(error))}\n`);
    process.exit(4);
  });
} else if (process.env.WC_CLEANUP_ONLY === "1") {
  runCleanupOnly().catch((error) => {
    process.stderr.write(`${redact(error instanceof Error ? error.stack ?? error.message : String(error))}\n`);
    process.exit(1);
  });
} else {
  runAcceptance()
    .catch(async (error) => {
      process.stderr.write(`${redact(error instanceof Error ? error.stack ?? error.message : String(error))}\n`);
      process.exit(1);
    })
    .finally(async () => {
      // The parent may have opened Prisma; disconnect if it was loaded.
      try {
        const { prisma } = await import("../lib/prisma");
        await prisma.$disconnect();
      } catch {
        // Nothing to disconnect.
      }
    });
}
