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
      DRIVE_SWEEP_DISABLED: "1",
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

async function runRace(label: string, specs: WorkerSpec[]) {
  const barrierDir = fs.mkdtempSync(path.join(os.tmpdir(), `wc-spend-${label}-`));
  const url = acceptanceUrl(1);
  const workers = specs.map((spec) => spawnWorker(spec, barrierDir, url));
  let barrierOk = true;
  let releasedAt = 0;
  try {
    await waitForFiles(
      specs.map((spec) => path.join(barrierDir, `ready-${spec.role}`)),
      BARRIER_TIMEOUT_MS
    );
    releasedAt = Date.now();
    fs.writeFileSync(path.join(barrierDir, "go"), String(releasedAt));
  } catch {
    barrierOk = false;
    for (const worker of workers) worker.kill();
  }
  const results = await Promise.all(workers.map((worker) => worker.done));
  try {
    fs.rmSync(barrierDir, { recursive: true, force: true });
  } catch {
    // Temporary barrier files are harmless if cleanup races an open handle.
  }
  return { label, barrierOk, releasedAt, overlapMs: overlappingMs(results), results };
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
    fs.writeFileSync(path.join(barrierDir, `ready-${role}`), String(readyAt));
    await waitForFiles([path.join(barrierDir, "go")], BARRIER_TIMEOUT_MS);

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
  const openRides = await prisma.ride.findMany({
    where: { paymentMethod: "wallet", paymentStatus: "held" },
    select: { riderId: true, fareKobo: true }
  });
  const openEscrows = await prisma.escrowHold.findMany({
    where: { status: "held" },
    select: { buyerWalletId: true, vendorWalletId: true, amountKobo: true }
  });
  const customerByUser = new Map<string, string>();
  for (const wallet of wallets) {
    if (wallet.ownerType === "CUSTOMER" && wallet.userId) customerByUser.set(wallet.userId, wallet.id);
  }
  const systemId = wallets.find((wallet) => wallet.ownerType === "SYSTEM")?.id;
  const buyerHeld = new Map<string, bigint>();
  const counterpartyHeld = new Map<string, bigint>();
  const addHeld = (map: Map<string, bigint>, walletId: string | null | undefined, amount: bigint) => {
    if (!walletId) return;
    map.set(walletId, (map.get(walletId) ?? BigInt(0)) + amount);
  };
  for (const ride of openRides) {
    const riderWalletId = customerByUser.get(ride.riderId);
    if (!riderWalletId) continue;
    addHeld(buyerHeld, riderWalletId, ride.fareKobo);
    addHeld(counterpartyHeld, systemId, ride.fareKobo);
  }
  for (const escrow of openEscrows) {
    addHeld(buyerHeld, escrow.buyerWalletId, escrow.amountKobo);
    addHeld(counterpartyHeld, escrow.vendorWalletId, escrow.amountKobo);
  }

  const mismatched = wallets
    .map((wallet) => {
      const ledgerNet = net.get(wallet.id) ?? BigInt(0);
      const counterparty = counterpartyHeld.get(wallet.id) ?? BigInt(0);
      const expectedAvailable = ledgerNet - counterparty;
      const expectedHeld = (buyerHeld.get(wallet.id) ?? BigInt(0)) + counterparty;
      const availableDifference = wallet.availableKobo - expectedAvailable;
      const heldDifference = wallet.heldKobo - expectedHeld;
      return {
        walletId: wallet.id,
        ownerType: wallet.ownerType,
        available: wallet.availableKobo.toString(),
        held: wallet.heldKobo.toString(),
        expectedAvailable: expectedAvailable.toString(),
        expectedHeld: expectedHeld.toString(),
        availableDifference: availableDifference.toString(),
        heldDifference: heldDifference.toString(),
        ledger: ledgerNet.toString()
      };
    })
    .filter((row) => row.availableDifference !== "0" || row.heldDifference !== "0");
  return { wallets: wallets.length, mismatched };
}

async function runReconcile(url: string) {
  return new Promise<{ database?: string; status?: string; mismatches?: number; duplicateIdentities?: number; wallets?: number }>(
    (resolve, reject) => {
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
          resolve(JSON.parse(stdout.slice(start, end + 1)) as {
            database?: string;
            status?: string;
            mismatches?: number;
            duplicateIdentities?: number;
            wallets?: number;
          });
        } catch (error) {
          reject(new Error(`wallet-reconcile JSON could not be parsed: ${String(error)}`));
        }
      });
    }
  );
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
    backendPid: result.backendPidBefore,
    walletBefore: result.walletBefore,
    walletAfter: result.walletAfter,
    result: result.result,
    error: result.error
  };
}

/* --------------------------------------------------------------------- main --- */

async function main() {
  process.env.DRIVE_SWEEP_DISABLED = "1";
  const url = acceptanceUrl();
  process.env.DATABASE_URL = url;

  const { prisma } = await import("../lib/prisma");
  const { ensureWallet, initializePayment } = await import("../lib/payments/service");
  const { checkout } = await import("../lib/services/core/checkout.service");
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
  const cross = await runRace(
    "cross-service",
    [
      { role: "drive", kind: "drive", userId: customer.id, walletId: customerWallet.id },
      { role: "shop", kind: "shop", userId: customer.id, walletId: customerWallet.id, reference: initialized.reference }
    ]
  );
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
  const rideRace = await runRace("same-rider", [
    { role: "ride-a", kind: "ride", userId: rider.id, walletId: riderWallet.id },
    { role: "ride-b", kind: "ride", userId: rider.id, walletId: riderWallet.id }
  ]);  const riderAfter = await readWallet(prisma, riderWallet.id);
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
      projections: finalProjections,
      journalTotals: finalJournals,
      reconcile: reconcileFinal
    },
    checks,
    failures,
    status: failures === 0 ? "PASS" : "FAIL"
  };

  console.log(JSON.stringify(report, bigintReplacer, 2));
}

/* ---------------------------------------------------------------- dispatch --- */

if (process.env.WC_WORKER === "1") {
  workerMain().catch((error) => {
    process.stderr.write(`${redact(String(error))}\n`);
    process.exit(4);
  });
} else {
  main()
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
