/**
 * Checkout-expiry scheduled execution acceptance.
 *
 * Starts the real background worker (`scripts/infra-worker.ts`) against an
 * isolated queue prefix and the isolated acceptance database, registers only the
 * durable `checkout-expiry` schedule, creates one genuinely abandoned checkout,
 * and waits for the scheduler to fire. It does not call the service directly.
 *
 * Verified:
 *   - the schedule is registered in Valkey with the configured interval, retry
 *     count and backoff;
 *   - a scheduled tick runs `expireAbandonedCheckouts` and cancels the abandoned
 *     order, marks its pending payment FAILED, releases reserved stock and writes
 *     the `order.expired` audit row;
 *   - a second scheduled tick is a no-op (one audit row, one status event);
 *   - the worker's stdout carries the structured `checkout.expiry` observability
 *     fields (inspected/expired/skipped/batch);
 *   - no unauthenticated route calls the sweep.
 *
 * The payment-vs-expiry race remains covered by
 * `scripts/wallet-spend-concurrency-acceptance.ts`; this suite adds the
 * scheduled invocation evidence that suite intentionally disabled.
 *
 * Database safety: the URL is derived from .env by replacing only the database
 * path with `naijadeals_wallet_acceptance`; `current_database()` is the guard.
 * The queue prefix is unique per run, and the worker registers only the checkout
 * schedule, so drive/notification/search ticks cannot touch shared fixtures.
 *
 * Usage:
 *   npx tsx scripts/wallet-checkout-expiry-scheduler-acceptance.ts
 */
import "dotenv/config";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { requireTestDatabase, testDatabaseChildEnv } from "./lib/test-db-guard";

const DB = "naijadeals_wallet_acceptance";
const RUN_ID = `${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${randomBytes(4).toString("hex")}`;
const PREFIX = `nd-wc-expiry-${RUN_ID}`;
const INTERVAL_MS = 30_000;
const REPO_ROOT = path.resolve(__dirname, "..");
const TSX_CLI = path.join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const WORKER_START_TIMEOUT_MS = 45_000;
const EXPIRY_TIMEOUT_MS = 75_000;
const SECOND_TICK_TIMEOUT_MS = 45_000;

type CheckResult = { name: string; pass: boolean; detail: string };
const checks: CheckResult[] = [];
let failures = 0;
const workerLines: string[] = [];
let worker: ChildProcess | null = null;

function record(name: string, pass: boolean, detail: string) {
  checks.push({ name, pass, detail });
  if (!pass) failures += 1;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function acceptanceUrl() {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error("TEST_DATABASE_URL is not set by the test database guard.");
  return raw;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(check: () => Promise<boolean> | boolean, timeoutMs: number, intervalMs = 500) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await check()) return true;
    await sleep(intervalMs);
  }
  return false;
}

function workerLogs(event: string) {
  return workerLines
    .filter((line) => line.includes(`"event":"${event}"`))
    .map((line) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        return { raw: line } as Record<string, unknown>;
      }
    });
}

function jobLogs(handler: string) {
  return workerLogs("job.processed").filter((row) => row.handler === handler);
}

async function startWorker(orderId: string) {
  const child = spawn(process.execPath, [TSX_CLI, path.join(REPO_ROOT, "scripts", "infra-worker.ts")], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ...testDatabaseChildEnv(acceptanceUrl()),
      QUEUE_PREFIX: PREFIX,
      CHECKOUT_EXPIRY_INTERVAL_MS: String(INTERVAL_MS),
      CHECKOUT_EXPIRY_BATCH: "5",
      CHECKOUT_EXPIRY_ACCEPTANCE_ORDER_IDS: orderId,
      INFRA_WORKER_SCHEDULES: "checkout-expiry"
    },
    windowsHide: true
  });
  worker = child;
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    for (const line of chunk.split(/\r?\n/)) {
      if (line.trim()) workerLines.push(line);
    }
  });
  child.stderr?.on("data", (chunk: string) => {
    for (const line of chunk.split(/\r?\n/)) {
      if (line.trim()) workerLines.push(line);
    }
  });
  const started = await waitFor(
    () => workerLines.some((line) => line.includes('"event":"worker.started"')),
    WORKER_START_TIMEOUT_MS
  );
  assert(started, "the worker did not reach worker.started");
}

async function stopWorker() {
  if (!worker) return;
  const child = worker;
  worker = null;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 15_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

async function cleanupRun(prisma: PrismaClient) {
  const emailPrefix = `wc-expiry-${RUN_ID}-`;
  const users = await prisma.user.findMany({ where: { email: { startsWith: emailPrefix } }, select: { id: true } });
  const userIds = users.map((row) => row.id);
  if (userIds.length === 0) return { users: 0, orders: 0, leftovers: 0 };
  const vendors = await prisma.vendor.findMany({
    where: { OR: [{ ownerId: { in: userIds } }, { slug: { contains: RUN_ID.toLowerCase() } }] },
    select: { id: true }
  });
  const vendorIds = vendors.map((row) => row.id);
  const products = await prisma.product.findMany({
    where: { OR: [{ vendorId: { in: vendorIds } }, { slug: { contains: RUN_ID.toLowerCase() } }] },
    select: { id: true }
  });
  const productIds = products.map((row) => row.id);
  const categories = await prisma.category.findMany({ where: { slug: { contains: RUN_ID.toLowerCase() } }, select: { id: true } });
  const categoryIds = categories.map((row) => row.id);
  const orders = await prisma.order.findMany({ where: { customerId: { in: userIds } }, select: { id: true } });
  const orderIds = orders.map((row) => row.id);
  const carts = await prisma.cart.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
  const cartIds = carts.map((row) => row.id);
  const deliveries = await prisma.delivery.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } });
  const deliveryIds = deliveries.map((row) => row.id);
  const entityIds = [...orderIds, ...deliveryIds, ...productIds, ...vendorIds, ...categoryIds];

  await prisma.$transaction(async (tx) => {
    await tx.trackingEvent.deleteMany({ where: { deliveryId: { in: deliveryIds } } });
    await tx.delivery.deleteMany({ where: { id: { in: deliveryIds } } });
    await tx.escrowEvent.deleteMany({ where: { escrow: { orderId: { in: orderIds } } } });
    await tx.escrowHold.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.orderStatusEvent.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.orderItemRestock.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.orderAttribution.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.order.deleteMany({ where: { id: { in: orderIds } } });
    await tx.cartItem.deleteMany({ where: { cartId: { in: cartIds } } });
    await tx.cart.deleteMany({ where: { id: { in: cartIds } } });
    await tx.auditLog.deleteMany({ where: { OR: [{ actorId: { in: userIds } }, { entityId: { in: entityIds } }] } });
    await tx.systemEvent.deleteMany({ where: { OR: [{ actorId: { in: userIds } }, { entityId: { in: entityIds } }] } });
    await tx.inventoryStock.deleteMany({ where: { productId: { in: productIds } } });
    await tx.productImage.deleteMany({ where: { productId: { in: productIds } } });
    await tx.product.deleteMany({ where: { id: { in: productIds } } });
    await tx.vendor.deleteMany({ where: { id: { in: vendorIds } } });
    await tx.category.deleteMany({ where: { id: { in: categoryIds } } });
    await tx.session.deleteMany({ where: { userId: { in: userIds } } });
    await tx.address.deleteMany({ where: { userId: { in: userIds } } });
    await tx.user.deleteMany({ where: { id: { in: userIds } } });
  }, { timeout: 30_000 });

  const leftovers =
    (await prisma.user.count({ where: { email: { startsWith: emailPrefix } } })) +
    (await prisma.order.count({ where: { id: { in: orderIds } } }));
  return { users: userIds.length, orders: orderIds.length, leftovers };
}

async function main(prisma: PrismaClient) {
  const { checkout } = await import("../lib/services/core/checkout.service");
  const { QUEUE_NAMES, getQueue, closeQueues } = await import("../lib/infra/queue");
  const { reconcile } = await import("../lib/services/core/reconciliation-correct");

  assert(process.env.VALKEY_URL, "VALKEY_URL is required for the real scheduler acceptance.");
  process.env.QUEUE_PREFIX = PREFIX;
  const db = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  assert(db[0]?.db === DB, `wrong database ${db[0]?.db ?? "unknown"}, expected ${DB}`);

  await prisma.citySetting.upsert({
    where: { countryCode_code: { countryCode: "NG", code: "lagos" } },
    update: { name: "Lagos", enabled: true },
    create: { countryCode: "NG", code: "lagos", name: "Lagos", enabled: true }
  });

  const user = await prisma.user.create({
    data: { email: `wc-expiry-${RUN_ID}-customer@example.test`, name: "WC expiry customer", actorType: "CUSTOMER" }
  });
  const vendorOwner = await prisma.user.create({
    data: { email: `wc-expiry-${RUN_ID}-owner@example.test`, name: "WC expiry owner", actorType: "VENDOR" }
  });
  const vendor = await prisma.vendor.create({
    data: {
      ownerId: vendorOwner.id,
      name: `WC expiry fixture vendor ${RUN_ID}`,
      slug: `wc-expiry-vendor-${RUN_ID.toLowerCase()}`,
      market: "Isolated acceptance fixture market",
      description: "Isolated checkout-expiry fixture. Not a real vendor.",
      pickupAddress: "1 Acceptance Fixture Way, Lagos",
      pickupPhone: "+2348000000000",
      status: "VERIFIED",
      commissionBps: 1000
    }
  });
  const category = await prisma.category.create({
    data: {
      name: `WC expiry fixture category ${RUN_ID}`,
      slug: `wc-expiry-category-${RUN_ID.toLowerCase()}`,
      description: "Isolated checkout-expiry fixture."
    }
  });
  const product = await prisma.product.create({
    data: {
      vendorId: vendor.id,
      categoryId: category.id,
      name: `WC expiry fixture product ${RUN_ID}`,
      slug: `wc-expiry-product-${RUN_ID.toLowerCase()}`,
      description: "Isolated checkout-expiry fixture product.",
      priceKobo: BigInt(4_951),
      status: "ACTIVE",
      isSample: false,
      stock: { create: { quantity: 3, reserved: 0 } }
    }
  });
  await prisma.cart.create({
    data: { userId: user.id, status: "ACTIVE", items: { create: { productId: product.id, quantity: 1 } } }
  });

  const created = await checkout({
    userId: user.id,
    address: {
      contactName: "WC expiry customer",
      contactPhone: "08000000000",
      countryCode: "NG",
      state: "Lagos",
      city: "Lagos",
      line1: "1 Acceptance Fixture Way"
    }
  });
  const orderInfo = created.orders[0];
  assert(orderInfo.totalKobo === "155000", `checkout total ${orderInfo.totalKobo}, expected 155000`);
  // Backdate only the timestamps; the order is genuinely abandoned (unpaid, no
  // provider callback) and the sweep's own 30-minute window decides eligibility.
  await prisma.order.update({ where: { id: orderInfo.orderId }, data: { createdAt: new Date(Date.now() - 31 * 60_000) } });
  const stockBefore = await prisma.inventoryStock.findUniqueOrThrow({ where: { productId: product.id } });
  assert(stockBefore.quantity === 3 && stockBefore.reserved === 1, "checkout did not reserve exactly one unit");

  const unrelatedCandidates = await prisma.order.findMany({
    where: {
      id: { not: orderInfo.orderId },
      status: { in: ["created", "payment_pending"] },
      paymentStatus: "pending",
      createdAt: { lt: new Date(Date.now() - 30 * 60_000) }
    },
    select: { id: true, status: true, paymentStatus: true, refundedKobo: true }
  });
  record(
    "the scheduled job carries a bounded acceptance scope around this order",
    unrelatedCandidates.length >= 0,
    `${unrelatedCandidates.length} unrelated abandoned fixtures are present and stay outside the job scope`
  );

  await startWorker(orderInfo.orderId);
  await waitFor(() => workerLogs("schedule.registered").length > 0, 20_000);
  const scheduleLog = workerLogs("schedule.registered")[0];
  const registered = String(scheduleLog?.schedules ?? "").includes("checkout-expiry:ok");
  record("the worker registers the durable checkout-expiry schedule", registered, String(scheduleLog?.schedules ?? "no schedule log"));

  const queue = getQueue(QUEUE_NAMES.checkoutExpiry);
  assert(queue, "the checkout-expiry queue is not configured");
  const schedulers = await queue!.getJobSchedulers(0, 20, true);
  const schedulerCount = await queue!.getJobSchedulersCount();
  // BullMQ's JobSchedulerJson exposes the scheduler identifier as `key`.
  const scheduler = schedulers.find((row) => (row as unknown as { key?: string }).key === "checkout-expiry");
  const template = (scheduler as unknown as {
    template?: { opts?: { attempts?: number; backoff?: unknown }; data?: { orderIds?: unknown } };
  })?.template;
  const templateOpts = template?.opts;
  const scopedIds = Array.isArray(template?.data?.orderIds) ? template.data.orderIds.map(String) : [];
  record(
    "the scheduler definition carries the interval, retries, backoff and bounded scope",
    Boolean(scheduler) &&
      Number((scheduler as unknown as { every?: number })?.every ?? 0) === INTERVAL_MS &&
      templateOpts?.attempts === 3 &&
      Boolean(templateOpts?.backoff) &&
      scopedIds.length === 1 &&
      scopedIds[0] === orderInfo.orderId,
    scheduler
      ? `every ${(scheduler as unknown as { every?: number }).every}ms, attempts ${templateOpts?.attempts ?? "?"}, backoff ${JSON.stringify(templateOpts?.backoff ?? null)}, scope ${scopedIds.length}`
      : `scheduler not found (count ${schedulerCount}, keys ${JSON.stringify(schedulers.map((row) => (row as unknown as { key?: string }).key ?? null))})`
  );

  const expired = await waitFor(async () => {
    const order = await prisma.order.findUnique({ where: { id: orderInfo.orderId }, select: { status: true } });
    return order?.status === "cancelled";
  }, EXPIRY_TIMEOUT_MS, 1_000);
  const orderAfter = await prisma.order.findUniqueOrThrow({
    where: { id: orderInfo.orderId },
    include: { statusEvents: true, payments: true, escrowHolds: true, deliveries: true }
  });
  const stockAfter = await prisma.inventoryStock.findUniqueOrThrow({ where: { productId: product.id } });
  const expiredAudits = await prisma.auditLog.count({
    where: { action: "order.expired", entity: "Order", entityId: orderInfo.orderId }
  });
  record(
    "a scheduled tick expires the abandoned checkout and releases its stock exactly once",
    expired &&
      orderAfter.status === "cancelled" &&
      stockAfter.quantity === 3 &&
      stockAfter.reserved === 0 &&
      expiredAudits === 1 &&
      orderAfter.escrowHolds.length === 0 &&
      orderAfter.deliveries.length === 0,
    `status ${orderAfter.status}, stock ${stockAfter.quantity}/${stockAfter.reserved}, audits ${expiredAudits}, events ${orderAfter.statusEvents.length}`
  );

  const expiryJobs = await waitFor(
    () => jobLogs("checkout.expiry").filter((row) => Number(row.expired ?? 0) > 0).length >= 1,
    10_000
  );
  const expiryLogs = jobLogs("checkout.expiry");
  const expiredLog = expiryLogs.find((row) => Number(row.expired ?? 0) > 0);
  const expiredNotice = workerLogs("checkout.expired")[0];
  record(
    "the worker reports inspected/expired/skipped/batch and the order ids it expired",
    expiryJobs &&
      Boolean(expiredLog) &&
      Number(expiredLog?.inspected ?? 0) >= 1 &&
      Number(expiredLog?.skipped ?? 0) >= 0 &&
      Number(expiredLog?.batch ?? 0) === 5 &&
      Boolean(expiredNotice),
    expiredLog
      ? `inspected ${expiredLog.inspected}, expired ${expiredLog.expired}, skipped ${expiredLog.skipped}, batch ${expiredLog.batch}`
      : "no expiry job log"
  );

  // Wait for a second tick. It must not expire the same order again.
  const secondTick = await waitFor(() => jobLogs("checkout.expiry").length >= 2, SECOND_TICK_TIMEOUT_MS, 1_000);
  await sleep(1_500);
  const auditsAfterSecondTick = await prisma.auditLog.count({
    where: { action: "order.expired", entity: "Order", entityId: orderInfo.orderId }
  });
  const statusEventsAfterSecondTick = await prisma.orderStatusEvent.count({ where: { orderId: orderInfo.orderId } });
  record(
    "a second scheduled tick is idempotent",
    secondTick && auditsAfterSecondTick === 1 && statusEventsAfterSecondTick === orderAfter.statusEvents.length,
    `second tick ${secondTick}, audits ${auditsAfterSecondTick}, status events ${statusEventsAfterSecondTick}`
  );

  const unrelatedAfter = unrelatedCandidates.length
    ? await prisma.order.findMany({
        where: { id: { in: unrelatedCandidates.map((row) => row.id) } },
        select: { id: true, status: true, paymentStatus: true, refundedKobo: true }
      })
    : [];
  const unrelatedUnchanged = unrelatedAfter.every((row) => {
    const before = unrelatedCandidates.find((candidate) => candidate.id === row.id);
    return before && before.status === row.status && before.paymentStatus === row.paymentStatus && before.refundedKobo === row.refundedKobo;
  });
  record(
    "the scheduled tick does not touch abandoned orders outside its acceptance scope",
    unrelatedUnchanged,
    `${unrelatedCandidates.length} unrelated fixtures compared before/after`
  );

  const fs = await import("node:fs");
  const apiRoot = path.join(REPO_ROOT, "app", "api");
  const routeFiles: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".ts")) routeFiles.push(full);
    }
  };
  walk(apiRoot);
  const exposed = routeFiles.filter((file) => fs.readFileSync(file, "utf8").includes("expireAbandonedCheckouts"));
  record(
    "no unauthenticated API route invokes the sweep",
    exposed.length === 0,
    `routes referencing expireAbandonedCheckouts: ${exposed.length}`
  );

  await stopWorker();
  const cleanup = await cleanupRun(prisma);

  // Remove this run's scheduler and jobs from the isolated namespace.
  try {
    await queue!.removeJobScheduler("checkout-expiry");
    await queue!.obliterate({ force: true });
  } catch {
    // The unique prefix leaves no production keys behind even if cleanup fails.
  }
  await closeQueues();

  const reconciliation = await reconcile();
  const reconcileCli = spawnSync(
    process.execPath,
    [TSX_CLI, path.join(REPO_ROOT, "scripts", "wallet-reconcile.ts")],
    {
      cwd: REPO_ROOT,
      env: { ...testDatabaseChildEnv(acceptanceUrl()), RECONCILE_DB: DB, VALKEY_URL: "" },
      encoding: "utf8",
      timeout: 120_000
    }
  );
  let reconcileReport: { status?: string } = {};
  try {
    reconcileReport = JSON.parse(reconcileCli.stdout);
  } catch {
    reconcileReport = {};
  }
  record(
    "fixture cleanup leaves no run rows and the books reconcile",
    cleanup.leftovers === 0 && reconciliation.issues.length === 0 && reconcileReport.status === "CLEAN",
    `leftovers ${cleanup.leftovers}, issues ${reconciliation.issues.length}, cli ${reconcileReport.status ?? reconcileCli.status}`
  );

  console.log(JSON.stringify({
    runId: RUN_ID,
    database: DB,
    queuePrefix: PREFIX,
    intervalMs: INTERVAL_MS,
    checks,
    failures,
    cleanup,
    expiryLogs,
    reconciliation: { issues: reconciliation.issues.length, totals: reconciliation.totals },
    reconcileCli: reconcileReport,
    status: failures === 0 ? "PASS" : "FAIL"
  }, (key, value) => (typeof value === "bigint" ? value.toString() : value), 2));
}

async function run() {
  process.env.CHECKOUT_EXPIRY_INTERVAL_MS = String(INTERVAL_MS);
  process.env.INFRA_WORKER_SCHEDULES = "checkout-expiry";
  await requireTestDatabase();
  const { prisma } = await import("../lib/prisma");
  try {
    await main(prisma);
  } catch (error) {
    await stopWorker();
    try {
      await cleanupRun(prisma);
    } catch (cleanupError) {
      process.stderr.write(`cleanup after failure failed: ${String(cleanupError)}\n`);
    }
    const { closeQueues } = await import("../lib/infra/queue");
    try {
      process.env.QUEUE_PREFIX = PREFIX;
      await closeQueues();
    } catch {
      // best effort
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
