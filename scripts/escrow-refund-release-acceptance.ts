/**
 * Refund-aware escrow release acceptance — isolated database only.
 *
 * Database: `naijadeals_escrow_release_acceptance`, verified through the shared
 * fail-closed test-database guard and checked again with `current_database()`.
 * No production database, real charge, payout, push or deployment is touched.
 * Every provider response is intercepted; any non-Paystack URL aborts.
 *
 * Cases:
 *   1. The single release calculation: no refund, partial, multiple, full,
 *      over-refund, prior release, and conservation of the remaining obligation.
 *   2. Wallet payment -> one/two partial refunds -> completion.
 *   3. Full refund -> completion attempt and dispute release attempt are refused.
 *   4. Dispute release is disabled server-side until explicitly enabled; then a
 *      partial refund -> dispute release pays only the remaining obligation.
 *   5. Duplicate and simultaneous dispute resolutions post one release.
 *   6. Completion racing dispute release posts exactly one release.
 *   7. A pending external refund blocks completion and dispute release; after it
 *      settles, release pays the remainder.
 *   8. External payment: full refund, post-release refunds, balanced journals.
 *   9. Odd-kobo cumulative refund allocations, including an out-of-order failed
 *      reservation that must not over-allocate the vendor share.
 *  10. External refund lifecycle: reserved recovery, submitted-without-ack
 *      interruption/recovery, confirmed-before-settlement interruption/recovery,
 *      acknowledged pending, definitive rejection and unknown outcome.
 *
 * Usage: npx tsx scripts/escrow-refund-release-acceptance.ts
 */
import "dotenv/config";
import { createHmac, randomBytes } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { requireTestDatabase } from "./lib/test-db-guard";

const DB = "naijadeals_escrow_release_acceptance";
const RUN_ID = `${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${randomBytes(4).toString("hex")}`;
const REPO_ROOT = path.resolve(__dirname, "..");
const TSX_CLI = path.join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs");

const SUBTOTAL_KOBO = BigInt(4_951);
const DELIVERY_KOBO = BigInt(150_000);
const TOTAL_KOBO = BigInt(155_000);
const COMMISSION_KOBO = BigInt(495);
const PAYABLE_KOBO = SUBTOTAL_KOBO - COMMISSION_KOBO + DELIVERY_KOBO; // 154,456
const FUNDING_KOBO = BigInt(175_000);
const PROVIDER_SECRET = `sk_test_escrow_refund_release_${RUN_ID}`;

type CheckResult = { name: string; pass: boolean; detail: string };
type WalletSnapshot = { available: string; held: string };
type Scenario = {
  label: string;
  userId: string;
  walletId: string;
  vendorOwnerId: string;
  vendorId: string;
  categoryId: string;
  productId: string;
  cartId: string;
  orderId: string;
  orderNumber: string;
  paymentId: string;
  reference: string;
  provider: "wallet" | "paystack";
  totalKobo: bigint;
};

const checks: CheckResult[] = [];
const releases: Array<Record<string, string>> = [];
let failures = 0;
let providerRefundCalls = 0;
let DB_URL = "";
let ADMIN_ID = "";

function record(name: string, pass: boolean, detail: string) {
  checks.push({ name, pass, detail });
  if (!pass) failures += 1;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function snapshot(wallet: { availableKobo: bigint; heldKobo: bigint }): WalletSnapshot {
  return { available: wallet.availableKobo.toString(), held: wallet.heldKobo.toString() };
}

function acceptanceUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set in .env.");
  const url = new URL(raw);
  url.pathname = `/${DB}`;
  return url.toString();
}

/* ------------------------------------------------------------ provider --- */

type RefundMode = "completed" | "pending" | "rejected" | "network" | "gate";
let refundMode: RefundMode = "completed";
type RefundGate = { promise: Promise<void>; release: () => void };
let refundGate: RefundGate | null = null;

function holdRefundResponses() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = () => {
      refundGate = null;
      resolve();
    };
  });
  refundGate = { promise, release };
}

function releaseRefundResponses() {
  refundGate?.release();
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

/** Deterministic Paystack double. No other host is reachable from this test. */
function installProviderMock() {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    if (!url.startsWith("https://api.paystack.co")) {
      throw new Error(`Blocked non-provider network call: ${method} ${url}`);
    }

    if (url.startsWith("https://api.paystack.co/transaction/initialize")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { reference?: string };
      const reference = String(body.reference ?? "");
      return json({
        status: true,
        data: {
          reference,
          authorization_url: `https://paystack.test/checkout/${encodeURIComponent(reference)}`
        }
      });
    }

    if (url.startsWith("https://api.paystack.co/transaction/verify/")) {
      const reference = decodeURIComponent(url.split("/transaction/verify/")[1] ?? "");
      return json({
        status: true,
        data: { status: "success", reference, amount: Number(TOTAL_KOBO), currency: "NGN" }
      });
    }

    if (url.startsWith("https://api.paystack.co/refund")) {
      providerRefundCalls += 1;
      const mode = refundMode;
      if (mode === "gate") {
        if (refundGate) await refundGate.promise;
        return json({ status: true, data: { status: "processed", id: `refund-${RUN_ID}-${providerRefundCalls}` } });
      }
      if (mode === "rejected") {
        return json({ message: "Simulated provider rejection." }, 422);
      }
      if (mode === "network") {
        throw new TypeError("simulated network failure after submission");
      }
      if (mode === "pending") {
        return json({ status: true, data: { status: "pending", id: `refund-pending-${RUN_ID}-${providerRefundCalls}` } });
      }
      return json({ status: true, data: { status: "processed", id: `refund-${RUN_ID}-${providerRefundCalls}` } });
    }

    throw new Error(`Unhandled provider fixture: ${method} ${url}`);
  }) as typeof fetch;
}

function paystackSignature(body: string) {
  return createHmac("sha512", PROVIDER_SECRET).update(body).digest("hex");
}

function paystackEvent(reference: string, eventId: string) {
  const body = JSON.stringify({
    event: "charge.success",
    data: { id: eventId, reference, amount: Number(TOTAL_KOBO), currency: "NGN", status: "success" }
  });
  return { body, headers: new Headers({ "x-paystack-signature": paystackSignature(body) }) };
}

/* ------------------------------------------------------------- fixtures --- */

async function ensureCity(prisma: PrismaClient) {
  await prisma.citySetting.upsert({
    where: { countryCode_code: { countryCode: "NG", code: "lagos" } },
    update: { name: "Lagos", enabled: true },
    create: { countryCode: "NG", code: "lagos", name: "Lagos", enabled: true }
  });
}

async function createScenario(
  prisma: PrismaClient,
  label: string,
  options: { fundKobo?: bigint; provider: "wallet" | "paystack" }
): Promise<Scenario> {
  const { ensureWallet, initializePayment, confirmPayment, processWebhook } = await import("../lib/payments/service");
  const { checkout } = await import("../lib/services/core/checkout.service");
  const { createTopUp, creditTopUp } = await import("../lib/services/core/topup.service");
  const lower = RUN_ID.toLowerCase();

  const user = await prisma.user.create({
    data: { email: `err-${RUN_ID}-${label}@example.test`, name: `Escrow release ${label}`, actorType: "CUSTOMER" }
  });
  const vendorOwner = await prisma.user.create({
    data: { email: `err-${RUN_ID}-${label}-owner@example.test`, name: `Escrow release ${label} owner`, actorType: "VENDOR" }
  });
  const vendor = await prisma.vendor.create({
    data: {
      ownerId: vendorOwner.id,
      name: `Escrow release vendor ${RUN_ID} ${label}`,
      slug: `err-vendor-${lower}-${label}`,
      market: "Isolated acceptance fixture market",
      description: "Isolated escrow release fixture. Not a real vendor.",
      pickupAddress: "1 Acceptance Fixture Way, Lagos",
      pickupPhone: "+2348000000000",
      status: "VERIFIED",
      commissionBps: 1000
    }
  });
  const category = await prisma.category.create({
    data: { name: `Escrow release category ${RUN_ID} ${label}`, slug: `err-category-${lower}-${label}` }
  });
  const product = await prisma.product.create({
    data: {
      vendorId: vendor.id,
      categoryId: category.id,
      name: `Escrow release product ${RUN_ID} ${label}`,
      slug: `err-product-${lower}-${label}`,
      description: "Isolated escrow release fixture product.",
      priceKobo: SUBTOTAL_KOBO,
      status: "ACTIVE",
      isSample: false,
      stock: { create: { quantity: 5, reserved: 0 } }
    }
  });
  const cart = await prisma.cart.create({
    data: { userId: user.id, status: "ACTIVE", items: { create: { productId: product.id, quantity: 1 } } }
  });
  const wallet = await ensureWallet(prisma, { userId: user.id, ownerType: "CUSTOMER" });

  if (options.fundKobo && options.fundKobo > BigInt(0)) {
    const key = `err-topup-${RUN_ID}-${label}`;
    const topUp = await createTopUp(prisma, {
      walletId: wallet.id,
      amountKobo: options.fundKobo,
      provider: "test",
      providerReference: `TEST-${key}`,
      idempotencyKey: key
    });
    const credited = await creditTopUp(prisma, {
      providerReference: topUp.topUp.providerReference,
      verifiedAmountKobo: options.fundKobo,
      verifiedCurrency: "NGN",
      raw: { simulated: true, note: "Escrow release acceptance TEST funding. Not a real payment." }
    });
    assert(credited.status === "credited", `${label}: funding was not credited`);
  }

  const created = await checkout({
    userId: user.id,
    address: {
      contactName: `Escrow release ${label}`,
      contactPhone: "08000000000",
      countryCode: "NG",
      state: "Lagos",
      city: "Lagos",
      line1: "1 Acceptance Fixture Way"
    }
  });
  assert(created.orders.length === 1, `${label}: checkout must create one order`);
  const order = created.orders[0];
  assert(BigInt(order.totalKobo) === TOTAL_KOBO, `${label}: checkout total ${order.totalKobo}`);

  const init = await initializePayment({
    orderId: order.orderId,
    userId: user.id,
    provider: options.provider,
    callbackUrl: "http://localhost/orders/callback"
  });

  if (options.provider === "wallet") {
    const paid = await confirmPayment({ reference: init.reference, provider: "wallet" });
    assert(paid.status === "COMPLETED", `${label}: wallet payment did not complete`);
  } else {
    const event = paystackEvent(init.reference, `${RUN_ID}-${label}-success`);
    await processWebhook("paystack", event.body, event.headers);
  }

  const payment = await prisma.payment.findFirstOrThrow({
    where: { orderId: order.orderId, status: "COMPLETED" }
  });

  return {
    label,
    userId: user.id,
    walletId: wallet.id,
    vendorOwnerId: vendorOwner.id,
    vendorId: vendor.id,
    categoryId: category.id,
    productId: product.id,
    cartId: cart.id,
    orderId: order.orderId,
    orderNumber: order.orderNumber,
    paymentId: payment.id,
    reference: init.reference,
    provider: options.provider,
    totalKobo: BigInt(order.totalKobo)
  };
}

async function readWallet(prisma: PrismaClient, walletId: string) {
  return prisma.wallet.findUniqueOrThrow({
    where: { id: walletId },
    select: { id: true, availableKobo: true, heldKobo: true }
  });
}

async function vendorWallet(prisma: PrismaClient, scenario: Scenario) {
  const wallet = await prisma.wallet.findFirstOrThrow({
    where: { vendorId: scenario.vendorId, ownerType: "VENDOR" }
  });
  return readWallet(prisma, wallet.id);
}

async function orderState(prisma: PrismaClient, orderId: string) {
  return prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { payments: true, escrowHolds: true, refunds: true, disputes: true, statusEvents: true }
  });
}

async function deliverOrder(prisma: PrismaClient, scenario: Scenario) {
  const { updateOrderStatus } = await import("../lib/services/core/order.service");
  const flow = ["accepted", "preparing", "ready_for_pickup", "courier_assigned", "picked_up", "in_transit", "delivered"] as const;
  for (const status of flow) {
    await updateOrderStatus({
      actorId: scenario.userId,
      orderId: scenario.orderId,
      status,
      note: `Escrow release acceptance transition to ${status}.`
    });
  }
}

function statusOf(promise: Promise<unknown>) {
  return promise.then(
    (value) => ({ ok: true as const, status: 200, code: "ok", value, message: "" }),
    (error: { status?: number; code?: string; message?: string }) => ({
      ok: false as const,
      status: error.status ?? 500,
      code: error.code ?? "unknown",
      value: null,
      message: (error.message ?? String(error)).slice(0, 240)
    })
  );
}

/* ---------------------------------------------------------- projections --- */

async function assertProjections(prisma: PrismaClient, stage: string, walletIds: string[]) {
  const { loadOpenHoldLedger, compareWalletProjection } = await import(
    "../lib/services/core/reconciliation-correct"
  );
  const holds = await loadOpenHoldLedger(prisma);
  const results: Array<{ walletId: string; availableDiff: bigint; heldDiff: bigint; held: bigint }> = [];
  for (const walletId of walletIds) {
    const wallet = await readWallet(prisma, walletId);
    const entries = await prisma.ledgerEntry.findMany({
      where: { walletId },
      select: { direction: true, amountKobo: true }
    });
    const ledgerNet = entries.reduce(
      (sum, entry) => sum + (entry.direction === "CREDIT" ? entry.amountKobo : -entry.amountKobo),
      BigInt(0)
    );
    const projection = compareWalletProjection({
      walletId,
      availableKobo: wallet.availableKobo,
      heldKobo: wallet.heldKobo,
      ledgerNetKobo: ledgerNet,
      holds
    });
    results.push({
      walletId,
      availableDiff: projection.availableDifferenceKobo,
      heldDiff: projection.heldDifferenceKobo,
      held: wallet.heldKobo
    });
  }
  const bad = results.filter((row) => row.availableDiff !== BigInt(0) || row.heldDiff !== BigInt(0));
  record(
    `${stage}: every involved wallet stores the ledger-projected position`,
    bad.length === 0,
    bad.map((row) => `${row.walletId.slice(-8)} available diff ${row.availableDiff}, held diff ${row.heldDiff}`).join("; ") ||
      `${results.length} wallets, 0 kobo difference`
  );
  const negative = results.filter((row) => row.held < BigInt(0));
  record(
    `${stage}: no wallet holds a negative amount`,
    negative.length === 0,
    negative.map((row) => `${row.walletId.slice(-8)} ${row.held}`).join(", ") || "all held >= 0"
  );
}

async function assertReconciliation(
  prisma: PrismaClient,
  stage: string,
  expected: "CLEAN" | "PENDING" | "REVIEW"
) {
  const { reconcile } = await import("../lib/services/core/reconciliation-correct");
  const book = await reconcile();
  record(
    `${stage}: reconciliation reports ${expected}, not a weaker status`,
    book.status === expected,
    `status ${book.status}, pending ${book.refunds.pendingObligationCount}, uncertain ${book.refunds.uncertainCount}, discrepancies ${book.refunds.discrepancyCount}, issues ${book.issues.length}`
  );
  if (expected === "CLEAN") {
    record(
      `${stage}: whole-book reconciliation has no issues and a zero journal difference`,
      book.issues.length === 0 && book.totals.differenceKobo === "0",
      `issues ${book.issues.length}, difference ${book.totals.differenceKobo}`
    );
  }
  return book;
}

async function assertOrderJournalsBalanced(prisma: PrismaClient, orderId: string, stage: string) {
  const transactions = await prisma.walletTransaction.findMany({
    where: { orderId },
    include: { ledger: true }
  });
  const unbalanced = transactions.filter((transaction) => {
    const debit = transaction.ledger
      .filter((leg) => leg.direction === "DEBIT")
      .reduce((sum, leg) => sum + leg.amountKobo, BigInt(0));
    const credit = transaction.ledger
      .filter((leg) => leg.direction === "CREDIT")
      .reduce((sum, leg) => sum + leg.amountKobo, BigInt(0));
    return debit !== credit;
  });
  record(
    `${stage}: every journal transaction for the order balances`,
    unbalanced.length === 0,
    unbalanced.length === 0
      ? `${transactions.length} transactions balanced`
      : unbalanced.map((row) => row.reference).join(", ")
  );
}

async function releaseRows(prisma: PrismaClient, orderId: string) {
  return prisma.walletTransaction.findMany({
    where: { orderId, type: "release" },
    include: { ledger: true }
  });
}

function rememberRelease(
  label: string,
  result: {
    totalReleasedKobo?: string;
    vendorProceedsKobo?: string;
    platformShareKobo?: string;
    otherAllocatedKobo?: string;
    remainingEscrowObligationKobo?: string;
    previouslyReleasedKobo?: string;
  }
) {
  releases.push({
    label,
    totalReleasedKobo: result.totalReleasedKobo ?? "0",
    vendorProceedsKobo: result.vendorProceedsKobo ?? "0",
    platformShareKobo: result.platformShareKobo ?? "0",
    otherAllocatedKobo: result.otherAllocatedKobo ?? "0",
    remainingEscrowObligationKobo: result.remainingEscrowObligationKobo ?? "0",
    previouslyReleasedKobo: result.previouslyReleasedKobo ?? "0"
  });
}

function assertRelease(
  label: string,
  result: unknown,
  expected: { total: bigint; vendor: bigint; platform: bigint }
) {
  const row = result as {
    totalReleasedKobo?: string;
    vendorProceedsKobo?: string;
    platformShareKobo?: string;
    otherAllocatedKobo?: string;
    remainingEscrowObligationKobo?: string;
  };
  const total = BigInt(row.totalReleasedKobo ?? "0");
  const vendor = BigInt(row.vendorProceedsKobo ?? "0");
  const platform = BigInt(row.platformShareKobo ?? "0");
  const other = BigInt(row.otherAllocatedKobo ?? "0");
  const remaining = BigInt(row.remainingEscrowObligationKobo ?? "0");
  record(
    `${label}: release reports remaining obligation / vendor / platform / other separately and conserves them`,
    total === expected.total &&
      vendor === expected.vendor &&
      platform === expected.platform &&
      other === BigInt(0) &&
      remaining === total &&
      total === vendor + platform + other,
    `total ${total}, vendor ${vendor}, platform ${platform}, other ${other}, remaining ${remaining}`
  );
  rememberRelease(label, row);
}

async function platformCredits(prisma: PrismaClient, orderId: string, systemWalletId: string) {
  const transactions = await releaseRows(prisma, orderId);
  return transactions
    .flatMap((transaction) => transaction.ledger)
    .filter((leg) => leg.direction === "CREDIT" && leg.walletId === systemWalletId)
    .reduce((sum, leg) => sum + leg.amountKobo, BigInt(0));
}

type DisputeReleaseResult = {
  duplicate?: boolean;
  totalReleasedKobo?: string;
  vendorProceedsKobo?: string;
  platformShareKobo?: string;
  otherAllocatedKobo?: string;
  remainingEscrowObligationKobo?: string;
  previouslyReleasedKobo?: string;
};

/** `resolveDispute` also serves the refund decision; release assertions narrow here. */
function asReleaseResult(value: unknown): DisputeReleaseResult {
  return value as DisputeReleaseResult;
}

/* ------------------------------------------------------- lifecycle probes --- */

const STATE_PRIORITY: Record<string, number> = {
  reserved: 0,
  submitted: 1,
  unknown: 2,
  failed: 3,
  confirmed: 4
};

async function refundLifecycle(prisma: PrismaClient, refundId: string) {
  const events = await prisma.systemEvent.findMany({
    where: { type: "refund.lifecycle", entity: "Refund", entityId: refundId },
    orderBy: { createdAt: "asc" }
  });
  let state: string | null = null;
  let acknowledged = false;
  let providerReference: string | null = null;
  for (const event of events) {
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const next = typeof payload.state === "string" ? payload.state : null;
    if (next && (state === null || (STATE_PRIORITY[next] ?? -1) > (STATE_PRIORITY[state] ?? -1))) {
      state = next;
    }
    if (next === "submitted" && payload.acknowledged === true) acknowledged = true;
    if (typeof payload.providerReference === "string" && payload.providerReference.length > 0) {
      providerReference = payload.providerReference;
    }
  }
  return { state, acknowledged, providerReference, eventCount: events.length };
}

async function refundByKey(prisma: PrismaClient, idempotencyKey: string) {
  return prisma.refund.findUnique({ where: { idempotencyKey } });
}

/* -------------------------------------------------------------- cleanup --- */

function tempCounterPath(tag: string) {
  return path.join(os.tmpdir(), `nd-escrow-release-${RUN_ID}-${tag}.log`);
}

function counterLines(file: string) {
  try {
    return readFileSync(file, "utf8").trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function cleanupTempFiles() {
  for (const tag of ["submitted", "confirmed"]) {
    rmSync(tempCounterPath(tag), { force: true });
  }
}

async function cleanupRun(prisma: PrismaClient, systemSnapshot: WalletSnapshot) {
  const emailPrefix = `err-${RUN_ID}-`;
  const lower = RUN_ID.toLowerCase();
  const users = await prisma.user.findMany({ where: { email: { startsWith: emailPrefix } }, select: { id: true } });
  const userIds = users.map((row) => row.id);
  if (userIds.length === 0) return { users: 0, leftovers: 0 };
  const vendors = await prisma.vendor.findMany({
    where: { OR: [{ ownerId: { in: userIds } }, { slug: { contains: lower } }] },
    select: { id: true }
  });
  const vendorIds = vendors.map((row) => row.id);
  const products = await prisma.product.findMany({
    where: { OR: [{ vendorId: { in: vendorIds } }, { slug: { contains: lower } }] },
    select: { id: true }
  });
  const productIds = products.map((row) => row.id);
  const categories = await prisma.category.findMany({ where: { slug: { contains: lower } }, select: { id: true } });
  const categoryIds = categories.map((row) => row.id);
  const orders = await prisma.order.findMany({ where: { customerId: { in: userIds } }, select: { id: true } });
  const orderIds = orders.map((row) => row.id);
  const payments = await prisma.payment.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } });
  const paymentIds = payments.map((row) => row.id);
  const carts = await prisma.cart.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
  const cartIds = carts.map((row) => row.id);
  const deliveries = await prisma.delivery.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } });
  const deliveryIds = deliveries.map((row) => row.id);
  const escrows = await prisma.escrowHold.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } });
  const escrowIds = escrows.map((row) => row.id);
  const refunds = await prisma.refund.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } });
  const refundIds = refunds.map((row) => row.id);
  const wallets = await prisma.wallet.findMany({
    where: { OR: [{ userId: { in: userIds } }, { vendorId: { in: vendorIds } }] },
    select: { id: true }
  });
  const walletIds = wallets.map((row) => row.id);
  const topUps = await prisma.walletTopUp.findMany({ where: { walletId: { in: walletIds } }, select: { id: true } });
  const topUpIds = topUps.map((row) => row.id);
  const transactions = await prisma.walletTransaction.findMany({
    where: {
      OR: [{ walletId: { in: walletIds } }, { reference: { contains: RUN_ID } }, { orderId: { in: orderIds } }]
    },
    select: { id: true }
  });
  const transactionIds = transactions.map((row) => row.id);
  const intents = await prisma.notificationIntent.findMany({
    where: { OR: [{ entityId: { in: [...orderIds, ...topUpIds] } }, { dedupeKey: { contains: RUN_ID } }] },
    select: { id: true }
  });
  const entityIds = [
    ...orderIds,
    ...paymentIds,
    ...deliveryIds,
    ...escrowIds,
    ...refundIds,
    ...productIds,
    ...vendorIds,
    ...categoryIds,
    ...transactionIds,
    ...topUpIds,
    ...walletIds
  ];

  const system = await prisma.wallet.findFirstOrThrow({ where: { ownerType: "SYSTEM" }, select: { id: true } });

  await prisma.$transaction(async (tx) => {
    await tx.notificationAttempt.deleteMany({
      where: { notification: { OR: [{ userId: { in: userIds } }, { entityId: { in: entityIds } }] } }
    });
    await tx.notification.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { entityId: { in: entityIds } }] } });
    await tx.notificationIntent.deleteMany({ where: { id: { in: intents.map((row) => row.id) } } });
    await tx.partnerNotification.deleteMany({ where: { userId: { in: userIds } } });
    await tx.webhookEvent.deleteMany({ where: { eventId: { contains: RUN_ID } } });
    await tx.trackingEvent.deleteMany({ where: { deliveryId: { in: deliveryIds } } });
    await tx.delivery.deleteMany({ where: { id: { in: deliveryIds } } });
    await tx.dispute.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.affiliateReversalIntent.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.review.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.returnRequest.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.refund.deleteMany({ where: { id: { in: refundIds } } });
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
    await tx.walletTopUp.deleteMany({ where: { id: { in: topUpIds } } });
    await tx.wallet.deleteMany({ where: { id: { in: walletIds } } });
    await tx.auditLog.deleteMany({
      where: { OR: [{ actorId: { in: userIds } }, { entityId: { in: entityIds } }] }
    });
    await tx.systemEvent.deleteMany({
      where: { OR: [{ actorId: { in: userIds } }, { entityId: { in: entityIds } }] }
    });
    await tx.inventoryStock.deleteMany({ where: { productId: { in: productIds } } });
    await tx.productImage.deleteMany({ where: { productId: { in: productIds } } });
    await tx.product.deleteMany({ where: { id: { in: productIds } } });
    await tx.vendor.deleteMany({ where: { id: { in: vendorIds } } });
    await tx.category.deleteMany({ where: { id: { in: categoryIds } } });
    await tx.session.deleteMany({ where: { userId: { in: userIds } } });
    await tx.address.deleteMany({ where: { userId: { in: userIds } } });
    await tx.user.deleteMany({ where: { id: { in: userIds } } });
    // Test-fixture isolation: restore the platform wallet captured before the
    // run, exactly. Cleanup of test money, never a production repair.
    await tx.wallet.update({
      where: { id: system.id },
      data: { availableKobo: BigInt(systemSnapshot.available), heldKobo: BigInt(systemSnapshot.held) }
    });
  }, { timeout: 120_000 });

  const leftovers =
    (await prisma.user.count({ where: { email: { startsWith: emailPrefix } } })) +
    (await prisma.order.count({ where: { id: { in: orderIds } } })) +
    (await prisma.walletTransaction.count({ where: { id: { in: transactionIds } } })) +
    (await prisma.refund.count({ where: { id: { in: refundIds } } })) +
    (await prisma.dispute.count({ where: { orderId: { in: orderIds } } }));
  return { users: userIds.length, wallets: walletIds.length, orders: orderIds.length, refunds: refundIds.length, leftovers };
}

/* ------------------------------------------------------------- the cases --- */

async function releaseMath() {
  const { releaseObligation } = await import("../lib/services/core/order.service");
  const base = {
    escrowAmountKobo: TOTAL_KOBO,
    orderTotalKobo: TOTAL_KOBO,
    payableKobo: PAYABLE_KOBO
  };
  const clean = releaseObligation({ ...base, completedRefundKobo: BigInt(0) });
  const partial = releaseObligation({ ...base, completedRefundKobo: BigInt(55_000) });
  const two = releaseObligation({ ...base, completedRefundKobo: BigInt(70_000) });
  const odd = releaseObligation({ ...base, completedRefundKobo: BigInt(99_999) });
  const full = releaseObligation({ ...base, completedRefundKobo: TOTAL_KOBO });
  const over = releaseObligation({ ...base, completedRefundKobo: TOTAL_KOBO + BigInt(1) });
  const prior = releaseObligation({
    ...base,
    completedRefundKobo: BigInt(0),
    previouslyReleasedKobo: BigInt(100_000),
    previouslyReleasedPayableKobo: BigInt(99_650)
  });
  const rows = [clean, partial, two, odd, full, over, prior];
  record(
    "release math: clean, partial, multiple, odd, full and over-refund amounts are exact",
    clean.totalReleasedKobo === BigInt(155_000) &&
      clean.vendorProceedsKobo === PAYABLE_KOBO &&
      clean.platformShareKobo === BigInt(544) &&
      partial.totalReleasedKobo === BigInt(100_000) &&
      partial.vendorProceedsKobo === BigInt(99_650) &&
      partial.platformShareKobo === BigInt(350) &&
      two.totalReleasedKobo === BigInt(85_000) &&
      two.vendorProceedsKobo === BigInt(84_702) &&
      two.platformShareKobo === BigInt(298) &&
      odd.totalReleasedKobo === BigInt(55_001) &&
      odd.vendorProceedsKobo === BigInt(54_808) &&
      odd.platformShareKobo === BigInt(193) &&
      full.totalReleasedKobo === BigInt(0) &&
      full.vendorProceedsKobo === BigInt(0) &&
      full.platformShareKobo === BigInt(0) &&
      over.totalReleasedKobo === BigInt(0) &&
      prior.totalReleasedKobo === BigInt(55_000) &&
      prior.vendorProceedsKobo === BigInt(54_806) &&
      prior.platformShareKobo === BigInt(194),
    rows
      .map(
        (row) =>
          `${row.totalReleasedKobo}/${row.vendorProceedsKobo}/${row.platformShareKobo}`
      )
      .join(" ")
  );
  record(
    "release math: every row allocates its whole remaining obligation, no other bucket and no negative value",
    rows.every(
      (row) =>
        row.totalReleasedKobo === row.vendorProceedsKobo + row.platformShareKobo + row.otherAllocatedKobo &&
        row.totalReleasedKobo >= BigInt(0) &&
        row.vendorProceedsKobo >= BigInt(0) &&
        row.platformShareKobo >= BigInt(0) &&
        row.otherAllocatedKobo === BigInt(0)
    ),
    rows
      .map(
        (row) =>
          `total ${row.totalReleasedKobo} = vendor ${row.vendorProceedsKobo} + platform ${row.platformShareKobo} + other ${row.otherAllocatedKobo}`
      )
      .join("; ")
  );
}

async function walletPartialCompletion(prisma: PrismaClient, systemId: string) {
  const { completeOrder } = await import("../lib/services/core/order.service");
  const { refundPayment } = await import("../lib/payments/service");
  const scenario = await createScenario(prisma, "wallet-partial", { fundKobo: FUNDING_KOBO, provider: "wallet" });
  const vendorId = (await vendorWallet(prisma, scenario)).id;
  const walletIds = [scenario.walletId, vendorId, systemId];

  const paid = await readWallet(prisma, scenario.walletId);
  record(
    `${scenario.label}: payment holds the full total and leaves the funded remainder spendable`,
    paid.availableKobo === BigInt(20_000) && paid.heldKobo === TOTAL_KOBO && (await vendorWallet(prisma, scenario)).heldKobo === TOTAL_KOBO,
    `buyer ${JSON.stringify(snapshot(paid))}, vendor held ${(await vendorWallet(prisma, scenario)).heldKobo}`
  );

  await refundPayment({
    orderId: scenario.orderId,
    actorId: scenario.userId,
    reason: "Wallet partial before completion.",
    amountKobo: BigInt(55_000),
    idempotencyKey: `err-wallet-partial-${RUN_ID}`
  });
  const afterRefund = await orderState(prisma, scenario.orderId);
  record(
    `${scenario.label}: a settled partial refund reduces both holds and leaves the escrow amount frozen`,
    afterRefund.refundedKobo === BigInt(55_000) &&
      afterRefund.escrowHolds[0]?.amountKobo === TOTAL_KOBO &&
      afterRefund.escrowHolds[0]?.status === "held" &&
      afterRefund.refunds.filter((refund) => refund.status === "COMPLETED").length === 1,
    `refunded ${afterRefund.refundedKobo}, escrow ${afterRefund.escrowHolds[0]?.amountKobo}/${afterRefund.escrowHolds[0]?.status}`
  );
  await assertProjections(prisma, `${scenario.label} after partial refund`, walletIds);
  await assertReconciliation(prisma, `${scenario.label} after partial refund`, "CLEAN");

  await deliverOrder(prisma, scenario);
  const completion = await completeOrder(scenario.userId, scenario.orderId);
  assertRelease(`${scenario.label} completion`, completion, {
    total: BigInt(100_000),
    vendor: BigInt(99_650),
    platform: BigInt(350)
  });
  const after = await orderState(prisma, scenario.orderId);
  const buyerAfter = await readWallet(prisma, scenario.walletId);
  const vendorAfter = await readWallet(prisma, vendorId);
  const releasesForOrder = await releaseRows(prisma, scenario.orderId);
  const platform = await platformCredits(prisma, scenario.orderId, systemId);
  record(
    `${scenario.label}: completion pays the remaining vendor share and retains the remaining platform share`,
    buyerAfter.availableKobo === BigInt(75_000) &&
      buyerAfter.heldKobo === BigInt(0) &&
      vendorAfter.availableKobo === BigInt(99_650) &&
      vendorAfter.heldKobo === BigInt(0) &&
      platform === BigInt(350) &&
      after.escrowHolds[0]?.status === "released" &&
      releasesForOrder.length === 1,
    `buyer ${JSON.stringify(snapshot(buyerAfter))}, vendor ${JSON.stringify(snapshot(vendorAfter))}, platform ${platform}, escrow ${after.escrowHolds[0]?.status}, release rows ${releasesForOrder.length}`
  );
  record(
    `${scenario.label}: release conserves the funded amount with no double earnings`,
    buyerAfter.availableKobo + vendorAfter.availableKobo + platform === FUNDING_KOBO &&
      releasesForOrder.reduce((sum, row) => sum + row.amountKobo, BigInt(0)) === BigInt(99_650),
    `buyer ${buyerAfter.availableKobo} + vendor ${vendorAfter.availableKobo} + platform ${platform} = ${buyerAfter.availableKobo + vendorAfter.availableKobo + platform}`
  );
  await assertOrderJournalsBalanced(prisma, scenario.orderId, `${scenario.label} after completion`);
  await assertProjections(prisma, `${scenario.label} after completion`, walletIds);
  await assertReconciliation(prisma, `${scenario.label} after completion`, "CLEAN");

  const replay = await completeOrder(scenario.userId, scenario.orderId);
  const replayVendor = await readWallet(prisma, vendorId);
  record(
    `${scenario.label}: duplicate completion returns the recorded release and moves nothing`,
    replay.duplicate === true &&
      replay.totalReleasedKobo === "100000" &&
      replay.vendorProceedsKobo === "99650" &&
      replay.platformShareKobo === "350" &&
      replayVendor.availableKobo === BigInt(99_650) &&
      (await releaseRows(prisma, scenario.orderId)).length === 1,
    `duplicate ${replay.duplicate}, total ${replay.totalReleasedKobo}, vendor ${replayVendor.availableKobo}`
  );
  await assertReconciliation(prisma, `${scenario.label} after duplicate completion`, "CLEAN");
}

async function walletMultipleCompletion(prisma: PrismaClient, systemId: string) {
  const { completeOrder } = await import("../lib/services/core/order.service");
  const { refundPayment } = await import("../lib/payments/service");
  const scenario = await createScenario(prisma, "wallet-multi", { fundKobo: FUNDING_KOBO, provider: "wallet" });
  const vendorId = (await vendorWallet(prisma, scenario)).id;
  const walletIds = [scenario.walletId, vendorId, systemId];

  await refundPayment({
    orderId: scenario.orderId,
    actorId: scenario.userId,
    reason: "First wallet partial.",
    amountKobo: BigInt(40_000),
    idempotencyKey: `err-wallet-multi-a-${RUN_ID}`
  });
  await refundPayment({
    orderId: scenario.orderId,
    actorId: scenario.userId,
    reason: "Second wallet partial.",
    amountKobo: BigInt(30_000),
    idempotencyKey: `err-wallet-multi-b-${RUN_ID}`
  });
  const afterRefunds = await orderState(prisma, scenario.orderId);
  record(
    `${scenario.label}: two settled partial refunds accumulate while the escrow stays frozen`,
    afterRefunds.refundedKobo === BigInt(70_000) &&
      afterRefunds.paymentStatus === "partially_refunded" &&
      afterRefunds.escrowHolds[0]?.status === "held",
    `refunded ${afterRefunds.refundedKobo}, payment ${afterRefunds.paymentStatus}, escrow ${afterRefunds.escrowHolds[0]?.status}`
  );
  await assertProjections(prisma, `${scenario.label} after refunds`, walletIds);

  await deliverOrder(prisma, scenario);
  const completion = await completeOrder(scenario.userId, scenario.orderId);
  assertRelease(`${scenario.label} completion`, completion, {
    total: BigInt(85_000),
    vendor: BigInt(84_702),
    platform: BigInt(298)
  });
  const vendorAfter = await readWallet(prisma, vendorId);
  const buyerAfter = await readWallet(prisma, scenario.walletId);
  const platform = await platformCredits(prisma, scenario.orderId, systemId);
  record(
    `${scenario.label}: multiple refunds release only the remainder with exact kobo conservation`,
    buyerAfter.availableKobo === BigInt(90_000) &&
      buyerAfter.heldKobo === BigInt(0) &&
      vendorAfter.availableKobo === BigInt(84_702) &&
      vendorAfter.heldKobo === BigInt(0) &&
      platform === BigInt(298) &&
      buyerAfter.availableKobo + vendorAfter.availableKobo + platform === FUNDING_KOBO,
    `buyer ${JSON.stringify(snapshot(buyerAfter))}, vendor ${JSON.stringify(snapshot(vendorAfter))}, platform ${platform}`
  );
  await assertOrderJournalsBalanced(prisma, scenario.orderId, `${scenario.label} after completion`);
  await assertReconciliation(prisma, `${scenario.label} after completion`, "CLEAN");
}

async function walletFullRefundDisputeBlocked(prisma: PrismaClient) {
  const { completeOrder } = await import("../lib/services/core/order.service");
  const { refundPayment } = await import("../lib/payments/service");
  const { openDispute, resolveDispute } = await import("../lib/services/core/dispute.service");
  const scenario = await createScenario(prisma, "wallet-full", { fundKobo: FUNDING_KOBO, provider: "wallet" });
  const vendorId = (await vendorWallet(prisma, scenario)).id;
  await deliverOrder(prisma, scenario);
  const dispute = await openDispute({
    actorId: scenario.userId,
    orderId: scenario.orderId,
    reason: "Full-refund release attempt fixture."
  });

  await refundPayment({
    orderId: scenario.orderId,
    actorId: ADMIN_ID,
    reason: "Close the order before any release.",
    idempotencyKey: `err-wallet-full-${RUN_ID}`
  });
  const refunded = await orderState(prisma, scenario.orderId);
  record(
    `${scenario.label}: the full refund closes payment, order and escrow`,
    refunded.paymentStatus === "refunded" &&
      refunded.status === "refunded" &&
      refunded.escrowHolds[0]?.status === "refunded" &&
      refunded.refundedKobo === TOTAL_KOBO,
    `order ${refunded.status}/${refunded.paymentStatus}, escrow ${refunded.escrowHolds[0]?.status}, refunded ${refunded.refundedKobo}`
  );

  const releaseAttempt = await statusOf(
    resolveDispute({ adminId: ADMIN_ID, disputeId: dispute.id, decision: "release", note: "Attempt after full refund." })
  );
  const completionAttempt = await statusOf(completeOrder(scenario.userId, scenario.orderId));
  const releasesForOrder = await releaseRows(prisma, scenario.orderId);
  const buyer = await readWallet(prisma, scenario.walletId);
  const vendor = await readWallet(prisma, vendorId);
  record(
    `${scenario.label}: neither dispute release nor completion posts anything after a full refund`,
    releaseAttempt.status === 409 &&
      ["escrow_not_releasable", "no_escrow"].includes(releaseAttempt.code) &&
      completionAttempt.status === 409 &&
      releasesForOrder.length === 0 &&
      buyer.availableKobo === FUNDING_KOBO &&
      buyer.heldKobo === BigInt(0) &&
      vendor.availableKobo === BigInt(0) &&
      vendor.heldKobo === BigInt(0),
    `release ${releaseAttempt.status} ${releaseAttempt.code}, completion ${completionAttempt.status} ${completionAttempt.code}, release rows ${releasesForOrder.length}`
  );
  await assertProjections(prisma, `${scenario.label} after refused release`, [scenario.walletId, vendorId]);
  await assertReconciliation(prisma, `${scenario.label} after refused release`, "CLEAN");
}

async function disputeGateAndDuplicate(prisma: PrismaClient) {
  const { openDispute, resolveDispute, disputeReleaseEnabled } = await import("../lib/services/core/dispute.service");
  const scenario = await createScenario(prisma, "dispute-gate", { fundKobo: FUNDING_KOBO, provider: "wallet" });
  const vendorId = (await vendorWallet(prisma, scenario)).id;
  await deliverOrder(prisma, scenario);
  const dispute = await openDispute({ actorId: scenario.userId, orderId: scenario.orderId, reason: "Gate fixture." });

  const previous = process.env.DISPUTE_RELEASE_ENABLED;
  delete process.env.DISPUTE_RELEASE_ENABLED;
  record(
    `${scenario.label}: the dispute release gate is off unless explicitly enabled`,
    disputeReleaseEnabled() === false,
    `DISPUTE_RELEASE_ENABLED=${process.env.DISPUTE_RELEASE_ENABLED ?? "unset"}`
  );
  const disabled = await statusOf(
    resolveDispute({ adminId: ADMIN_ID, disputeId: dispute.id, decision: "release", note: "Gate still off." })
  );
  const escrowAfterDisabled = (await orderState(prisma, scenario.orderId)).escrowHolds[0];
  record(
    `${scenario.label}: a disabled disputed release fails closed and moves nothing`,
    disabled.status === 409 && disabled.code === "dispute_release_disabled" && escrowAfterDisabled?.status === "disputed" && (await releaseRows(prisma, scenario.orderId)).length === 0,
    `${disabled.status} ${disabled.code}, escrow ${escrowAfterDisabled?.status}`
  );

  process.env.DISPUTE_RELEASE_ENABLED = "true";
  const resolved = await resolveDispute({
    adminId: ADMIN_ID,
    disputeId: dispute.id,
    decision: "release",
    note: "Gate enabled after acceptance."
  });
  assertRelease(`${scenario.label} release`, resolved, {
    total: TOTAL_KOBO,
    vendor: PAYABLE_KOBO,
    platform: BigInt(544)
  });
  const vendorAfter = await readWallet(prisma, vendorId);
  const buyerAfter = await readWallet(prisma, scenario.walletId);
  const escrowAfter = (await orderState(prisma, scenario.orderId)).escrowHolds[0];
  record(
    `${scenario.label}: enabled dispute release credits the vendor once and closes the order`,
    vendorAfter.availableKobo === PAYABLE_KOBO &&
      vendorAfter.heldKobo === BigInt(0) &&
      buyerAfter.availableKobo === BigInt(20_000) &&
      buyerAfter.heldKobo === BigInt(0) &&
      escrowAfter?.status === "released" &&
      (await releaseRows(prisma, scenario.orderId)).length === 1,
    `vendor ${JSON.stringify(snapshot(vendorAfter))}, buyer ${JSON.stringify(snapshot(buyerAfter))}, escrow ${escrowAfter?.status}`
  );
  await assertProjections(prisma, `${scenario.label} after release`, [scenario.walletId, vendorId]);
  await assertReconciliation(prisma, `${scenario.label} after release`, "CLEAN");

  const duplicate = asReleaseResult(await resolveDispute({
    adminId: ADMIN_ID,
    disputeId: dispute.id,
    decision: "release",
    note: "Duplicate resolution."
  }));
  record(
    `${scenario.label}: a duplicate resolution returns the recorded release with no second credit`,
    duplicate.duplicate === true &&
      duplicate.totalReleasedKobo === TOTAL_KOBO.toString() &&
      duplicate.vendorProceedsKobo === PAYABLE_KOBO.toString() &&
      (await releaseRows(prisma, scenario.orderId)).length === 1 &&
      (await readWallet(prisma, vendorId)).availableKobo === PAYABLE_KOBO,
    `duplicate ${duplicate.duplicate}, total ${duplicate.totalReleasedKobo}, vendor ${(await readWallet(prisma, vendorId)).availableKobo}`
  );
  process.env.DISPUTE_RELEASE_ENABLED = previous ?? "true";
}

async function disputePartialAndMulti(prisma: PrismaClient) {
  const { refundPayment } = await import("../lib/payments/service");
  const { openDispute, resolveDispute } = await import("../lib/services/core/dispute.service");

  for (const variant of [
    { label: "dispute-partial", amounts: [BigInt(55_000)], total: BigInt(100_000), vendor: BigInt(99_650), platform: BigInt(350) },
    { label: "dispute-multi", amounts: [BigInt(40_000), BigInt(30_000)], total: BigInt(85_000), vendor: BigInt(84_702), platform: BigInt(298) }
  ]) {
    const scenario = await createScenario(prisma, variant.label, { fundKobo: FUNDING_KOBO, provider: "wallet" });
    const vendorId = (await vendorWallet(prisma, scenario)).id;
    for (let index = 0; index < variant.amounts.length; index += 1) {
      await refundPayment({
        orderId: scenario.orderId,
        actorId: scenario.userId,
        reason: `Dispute fixture refund ${index + 1}.`,
        amountKobo: variant.amounts[index],
        idempotencyKey: `err-${variant.label}-${index}-${RUN_ID}`
      });
    }
    await deliverOrder(prisma, scenario);
    const dispute = await openDispute({ actorId: scenario.userId, orderId: scenario.orderId, reason: "Partial-refund dispute." });
    const resolved = await resolveDispute({
      adminId: ADMIN_ID,
      disputeId: dispute.id,
      decision: "release",
      note: "Release the unrefunded remainder."
    });
    assertRelease(`${scenario.label} release`, resolved, {
      total: variant.total,
      vendor: variant.vendor,
      platform: variant.platform
    });
    const vendorAfter = await readWallet(prisma, vendorId);
    const buyerAfter = await readWallet(prisma, scenario.walletId);
    const orderAfter = await orderState(prisma, scenario.orderId);
    record(
      `${scenario.label}: the refunded amount is not paid to the vendor a second time`,
      vendorAfter.availableKobo === variant.vendor &&
        vendorAfter.heldKobo === BigInt(0) &&
        buyerAfter.heldKobo === BigInt(0) &&
        buyerAfter.availableKobo === BigInt(20_000) + variant.amounts.reduce((sum, amount) => sum + amount, BigInt(0)) &&
        orderAfter.escrowHolds[0]?.status === "released" &&
        orderAfter.disputes[0]?.status === "resolved_release",
      `vendor ${JSON.stringify(snapshot(vendorAfter))}, buyer ${JSON.stringify(snapshot(buyerAfter))}, escrow ${orderAfter.escrowHolds[0]?.status}, dispute ${orderAfter.disputes[0]?.status}`
    );
    await assertOrderJournalsBalanced(prisma, scenario.orderId, `${scenario.label} after release`);
    await assertReconciliation(prisma, `${scenario.label} after release`, "CLEAN");
  }
}

async function concurrentDisputeResolutions(prisma: PrismaClient) {
  const { openDispute, resolveDispute } = await import("../lib/services/core/dispute.service");
  const scenario = await createScenario(prisma, "dispute-concurrent", { fundKobo: FUNDING_KOBO, provider: "wallet" });
  const vendorId = (await vendorWallet(prisma, scenario)).id;
  await deliverOrder(prisma, scenario);
  const dispute = await openDispute({ actorId: scenario.userId, orderId: scenario.orderId, reason: "Concurrent resolution." });

  const [first, second] = await Promise.allSettled([
    resolveDispute({ adminId: ADMIN_ID, disputeId: dispute.id, decision: "release", note: "Concurrent A." }),
    resolveDispute({ adminId: ADMIN_ID, disputeId: dispute.id, decision: "release", note: "Concurrent B." })
  ]);
  const fulfilled = [first, second].filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof resolveDispute>>> => result.status === "fulfilled");
  const duplicates = fulfilled.filter((result) => asReleaseResult(result.value).duplicate === true).length;
  const vendorAfter = await readWallet(prisma, vendorId);
  record(
    `${scenario.label}: simultaneous duplicate resolutions post exactly one release and one vendor credit`,
    fulfilled.length === 2 &&
      duplicates === 1 &&
      (await releaseRows(prisma, scenario.orderId)).length === 1 &&
      vendorAfter.availableKobo === PAYABLE_KOBO &&
      vendorAfter.heldKobo === BigInt(0),
    `fulfilled ${fulfilled.length}, duplicates ${duplicates}, release rows ${(await releaseRows(prisma, scenario.orderId)).length}, vendor ${vendorAfter.availableKobo}`
  );
  await assertReconciliation(prisma, `${scenario.label} after concurrent resolutions`, "CLEAN");
}

async function completionRacingDispute(prisma: PrismaClient) {
  const { completeOrder } = await import("../lib/services/core/order.service");
  const { openDispute, resolveDispute } = await import("../lib/services/core/dispute.service");
  const scenario = await createScenario(prisma, "completion-vs-dispute", { fundKobo: FUNDING_KOBO, provider: "wallet" });
  const vendorId = (await vendorWallet(prisma, scenario)).id;
  await deliverOrder(prisma, scenario);

  const [completion, disputeChain] = await Promise.allSettled([
    completeOrder(scenario.userId, scenario.orderId),
    (async () => {
      const dispute = await openDispute({ actorId: scenario.userId, orderId: scenario.orderId, reason: "Racing completion." });
      return resolveDispute({ adminId: ADMIN_ID, disputeId: dispute.id, decision: "release", note: "Racing release." });
    })()
  ]);
  const rows = await releaseRows(prisma, scenario.orderId);
  const vendorAfter = await readWallet(prisma, vendorId);
  const escrow = (await orderState(prisma, scenario.orderId)).escrowHolds[0];
  record(
    `${scenario.label}: completion and dispute release cannot both move the escrow`,
    rows.length === 1 &&
      rows[0].reference.startsWith("RELEASE-") !== rows[0].reference.startsWith("DISPUTE-RELEASE-") &&
      vendorAfter.availableKobo === PAYABLE_KOBO &&
      vendorAfter.heldKobo === BigInt(0) &&
      escrow?.status === "released",
    `completion ${completion.status}, dispute chain ${disputeChain.status}, release ${rows.map((row) => row.reference).join(",") || "none"}, vendor ${vendorAfter.availableKobo}`
  );
  record(
    `${scenario.label}: the losing path fails closed instead of reusing the escrow`,
    (completion.status === "fulfilled" && disputeChain.status === "rejected") ||
      (completion.status === "rejected" && disputeChain.status === "fulfilled"),
    `completion ${completion.status}, dispute chain ${disputeChain.status}`
  );
  await assertProjections(prisma, `${scenario.label} after race`, [scenario.walletId, vendorId]);
  await assertReconciliation(prisma, `${scenario.label} after race`, "CLEAN");
}

async function pendingExternalRefundRacingDispute(prisma: PrismaClient) {
  const { refundPayment } = await import("../lib/payments/service");
  const { openDispute, resolveDispute } = await import("../lib/services/core/dispute.service");
  const scenario = await createScenario(prisma, "external-pending-dispute", { provider: "paystack" });
  const vendorId = (await vendorWallet(prisma, scenario)).id;
  await deliverOrder(prisma, scenario);
  const dispute = await openDispute({ actorId: scenario.userId, orderId: scenario.orderId, reason: "Pending refund race." });

  refundMode = "gate";
  holdRefundResponses();
  const refundPromise = refundPayment({
    orderId: scenario.orderId,
    actorId: scenario.userId,
    reason: "External refund held at the provider.",
    amountKobo: BigInt(55_000),
    idempotencyKey: `err-external-pending-${RUN_ID}`
  });
  const pending = await waitFor(
    async () => {
      const row = await refundByKey(prisma, `err-external-pending-${RUN_ID}`);
      if (!row) return null;
      const state = await refundLifecycle(prisma, row.id);
      return state.state === "submitted" && providerRefundCalls > 0 ? { row, state } : null;
    },
    10_000,
    "pending external refund submission"
  );
  const refund = pending.row;
  const lifecycle = pending.state;
  const blocked = await statusOf(
    resolveDispute({ adminId: ADMIN_ID, disputeId: dispute.id, decision: "release", note: "Release while refund pending." })
  );
  record(
    `${scenario.label}: a submitted-but-unacknowledged refund blocks dispute release and is never CLEAN`,
    blocked.status === 409 &&
      blocked.code === "refund_pending" &&
      lifecycle.state === "submitted" &&
      lifecycle.acknowledged === false &&
      (await releaseRows(prisma, scenario.orderId)).length === 0,
    `${blocked.status} ${blocked.code}, lifecycle ${lifecycle.state} acknowledged=${lifecycle.acknowledged}`
  );
  const pendingBook = await assertReconciliation(prisma, `${scenario.label} while provider call is open`, "REVIEW");
  record(
    `${scenario.label}: the open submission is classified as an uncertain outcome, never a clean pending obligation`,
    pendingBook.refunds.uncertainCount === 1 &&
      pendingBook.refunds.pendingObligationCount === 0 &&
      pendingBook.refunds.rows[0]?.classification === "uncertain_outcome",
    `uncertain ${pendingBook.refunds.uncertainCount}, pending ${pendingBook.refunds.pendingObligationCount}, class ${pendingBook.refunds.rows[0]?.classification}`
  );

  releaseRefundResponses();
  const settled = (await refundPromise) as { refundedKobo: string };
  const afterSettle = await refundLifecycle(prisma, refund.id);
  record(
    `${scenario.label}: the released provider response settles the refund once`,
    settled.refundedKobo === "55000" &&
      afterSettle.state === "confirmed" &&
      (await orderState(prisma, scenario.orderId)).refunds.filter((row) => row.status === "COMPLETED").length === 1,
    `refunded ${settled.refundedKobo}, lifecycle ${afterSettle.state}`
  );

  const resolved = await resolveDispute({
    adminId: ADMIN_ID,
    disputeId: dispute.id,
    decision: "release",
    note: "Release after the pending refund settled."
  });
  assertRelease(`${scenario.label} release`, resolved, {
    total: BigInt(100_000),
    vendor: BigInt(99_650),
    platform: BigInt(350)
  });
  const vendorAfter = await readWallet(prisma, vendorId);
  record(
    `${scenario.label}: after settlement the dispute release pays only the remainder`,
    vendorAfter.availableKobo === BigInt(99_650) &&
      vendorAfter.heldKobo === BigInt(0) &&
      (await releaseRows(prisma, scenario.orderId)).length === 1,
    `vendor ${JSON.stringify(snapshot(vendorAfter))}, release rows ${(await releaseRows(prisma, scenario.orderId)).length}`
  );
  await assertProjections(prisma, `${scenario.label} after release`, [scenario.walletId, vendorId]);
  await assertReconciliation(prisma, `${scenario.label} after release`, "CLEAN");
  refundMode = "completed";
}

async function externalFullRefund(prisma: PrismaClient, systemId: string) {
  const { refundPayment } = await import("../lib/payments/service");
  const { openDispute, resolveDispute } = await import("../lib/services/core/dispute.service");
  const { completeOrder } = await import("../lib/services/core/order.service");
  const systemPrePayment = await readWallet(prisma, systemId);
  const scenario = await createScenario(prisma, "external-full", { provider: "paystack" });
  const vendorId = (await vendorWallet(prisma, scenario)).id;
  const systemBefore = snapshot(await readWallet(prisma, systemId));
  await deliverOrder(prisma, scenario);
  const dispute = await openDispute({ actorId: scenario.userId, orderId: scenario.orderId, reason: "External full refund." });

  await refundPayment({
    orderId: scenario.orderId,
    actorId: ADMIN_ID,
    reason: "External partial toward full.",
    amountKobo: BigInt(100_000),
    idempotencyKey: `err-external-full-a-${RUN_ID}`
  });
  await refundPayment({
    orderId: scenario.orderId,
    actorId: ADMIN_ID,
    reason: "External remaining refund.",
    idempotencyKey: `err-external-full-b-${RUN_ID}`
  });
  const orderAfter = await orderState(prisma, scenario.orderId);
  const systemAfter = await readWallet(prisma, systemId);
  const vendorAfter = await readWallet(prisma, vendorId);
  record(
    `${scenario.label}: a full external refund restores the platform position and closes escrow`,
    orderAfter.paymentStatus === "refunded" &&
      orderAfter.status === "refunded" &&
      orderAfter.escrowHolds[0]?.status === "refunded" &&
      systemAfter.availableKobo === systemPrePayment.availableKobo &&
      systemAfter.heldKobo === systemPrePayment.heldKobo &&
      vendorAfter.heldKobo === BigInt(0) &&
      vendorAfter.availableKobo === BigInt(0),
    `order ${orderAfter.status}/${orderAfter.paymentStatus}, escrow ${orderAfter.escrowHolds[0]?.status}, SYSTEM ${JSON.stringify(snapshot(systemAfter))} (pre-payment ${JSON.stringify(snapshot(systemPrePayment))}, post-payment ${JSON.stringify(systemBefore)}), vendor ${JSON.stringify(snapshot(vendorAfter))}`
  );
  await assertOrderJournalsBalanced(prisma, scenario.orderId, `${scenario.label} after full refund`);
  await assertReconciliation(prisma, `${scenario.label} after full refund`, "CLEAN");

  const releaseAttempt = await statusOf(
    resolveDispute({ adminId: ADMIN_ID, disputeId: dispute.id, decision: "release", note: "Release after external full refund." })
  );
  const completionAttempt = await statusOf(completeOrder(scenario.userId, scenario.orderId));
  record(
    `${scenario.label}: neither release path posts after the external full refund`,
    releaseAttempt.status === 409 &&
      ["escrow_not_releasable", "no_escrow"].includes(releaseAttempt.code) &&
      completionAttempt.status === 409 &&
      (await releaseRows(prisma, scenario.orderId)).length === 0,
    `release ${releaseAttempt.status} ${releaseAttempt.code}, completion ${completionAttempt.status} ${completionAttempt.code}`
  );
  await assertReconciliation(prisma, `${scenario.label} after refused releases`, "CLEAN");
}

async function externalPostReleaseRefunds(prisma: PrismaClient, systemId: string) {
  const { completeOrder } = await import("../lib/services/core/order.service");
  const { refundPayment } = await import("../lib/payments/service");
  const systemAtStart = await readWallet(prisma, systemId);
  const scenario = await createScenario(prisma, "external-post-release", { provider: "paystack" });
  const vendorId = (await vendorWallet(prisma, scenario)).id;
  await deliverOrder(prisma, scenario);
  const completion = await completeOrder(scenario.userId, scenario.orderId);
  assertRelease(`${scenario.label} completion`, completion, {
    total: TOTAL_KOBO,
    vendor: PAYABLE_KOBO,
    platform: BigInt(544)
  });
  const vendorReleased = await readWallet(prisma, vendorId);
  const systemReleased = await readWallet(prisma, systemId);
  record(
    `${scenario.label}: the external release credits the vendor and retains the platform share`,
    vendorReleased.availableKobo === PAYABLE_KOBO &&
      vendorReleased.heldKobo === BigInt(0) &&
      systemReleased.availableKobo === systemAtStart.availableKobo - PAYABLE_KOBO &&
      systemReleased.heldKobo === BigInt(0),
    `vendor ${JSON.stringify(snapshot(vendorReleased))}, SYSTEM ${JSON.stringify(snapshot(systemReleased))} (start ${JSON.stringify(snapshot(systemAtStart))})`
  );

  await refundPayment({
    orderId: scenario.orderId,
    actorId: scenario.userId,
    reason: "Post-release external partial refund.",
    amountKobo: BigInt(55_000),
    idempotencyKey: `err-external-post-a-${RUN_ID}`
  });
  const afterPartial = await orderState(prisma, scenario.orderId);
  const vendorAfterPartial = await readWallet(prisma, vendorId);
  const systemAfterPartial = await readWallet(prisma, systemId);
  const partialRefundTx = await prisma.walletTransaction.findFirstOrThrow({
    where: { orderId: scenario.orderId, type: "refund" },
    include: { ledger: true }
  });
  const partialDebit = partialRefundTx.ledger
    .filter((leg) => leg.direction === "DEBIT")
    .reduce((sum, leg) => sum + leg.amountKobo, BigInt(0));
  const partialCredit = partialRefundTx.ledger
    .filter((leg) => leg.direction === "CREDIT")
    .reduce((sum, leg) => sum + leg.amountKobo, BigInt(0));
  record(
    `${scenario.label}: a post-release external refund reverses the vendor share and balances through the platform`,
    afterPartial.escrowHolds[0]?.status === "released" &&
      vendorAfterPartial.availableKobo === BigInt(99_650) &&
      vendorAfterPartial.heldKobo === BigInt(0) &&
      systemAfterPartial.availableKobo === systemAtStart.availableKobo - BigInt(99_650) &&
      systemAfterPartial.heldKobo === BigInt(0) &&
      partialDebit === partialCredit &&
      partialDebit === BigInt(55_000),
    `vendor ${vendorAfterPartial.availableKobo}, SYSTEM ${JSON.stringify(snapshot(systemAfterPartial))}, journal ${partialDebit}/${partialCredit}`
  );

  await refundPayment({
    orderId: scenario.orderId,
    actorId: scenario.userId,
    reason: "Post-release external remaining refund.",
    idempotencyKey: `err-external-post-b-${RUN_ID}`
  });
  const finalOrder = await orderState(prisma, scenario.orderId);
  const vendorFinal = await readWallet(prisma, vendorId);
  const systemFinal = await readWallet(prisma, systemId);
  record(
    `${scenario.label}: the remaining external post-release refund restores every balance to zero`,
    finalOrder.paymentStatus === "refunded" &&
      vendorFinal.availableKobo === BigInt(0) &&
      vendorFinal.heldKobo === BigInt(0) &&
      systemFinal.availableKobo === systemAtStart.availableKobo &&
      systemFinal.heldKobo === systemAtStart.heldKobo,
    `payment ${finalOrder.paymentStatus}, vendor ${JSON.stringify(snapshot(vendorFinal))}, SYSTEM ${JSON.stringify(snapshot(systemFinal))}`
  );
  await assertOrderJournalsBalanced(prisma, scenario.orderId, `${scenario.label} after post-release refunds`);
  await assertProjections(prisma, `${scenario.label} after post-release refunds`, [scenario.walletId, vendorId, systemId]);
  await assertReconciliation(prisma, `${scenario.label} after post-release refunds`, "CLEAN");
}

async function oddKoboWallet(prisma: PrismaClient, systemId: string) {
  const { completeOrder } = await import("../lib/services/core/order.service");
  const { refundPayment } = await import("../lib/payments/service");
  const scenario = await createScenario(prisma, "odd-kobo", { fundKobo: FUNDING_KOBO, provider: "wallet" });
  const vendorId = (await vendorWallet(prisma, scenario)).id;
  for (let index = 0; index < 3; index += 1) {
    await refundPayment({
      orderId: scenario.orderId,
      actorId: scenario.userId,
      reason: `Odd-kobo partial ${index + 1}.`,
      amountKobo: BigInt(33_333),
      idempotencyKey: `err-odd-kobo-${index}-${RUN_ID}`
    });
  }
  const afterRefunds = await orderState(prisma, scenario.orderId);
  const settledRefunds = afterRefunds.refunds
    .filter((refund) => refund.status === "COMPLETED")
    .reduce((sum, refund) => sum + refund.amountKobo, BigInt(0));
  record(
    `${scenario.label}: three odd-kobo refunds settle without exceeding the order`,
    afterRefunds.refundedKobo === BigInt(99_999) &&
      settledRefunds === BigInt(99_999) &&
      afterRefunds.escrowHolds[0]?.status === "held",
    `reserved ${afterRefunds.refundedKobo}, settled ${settledRefunds}, escrow ${afterRefunds.escrowHolds[0]?.status}`
  );

  await deliverOrder(prisma, scenario);
  const completion = await completeOrder(scenario.userId, scenario.orderId);
  assertRelease(`${scenario.label} completion`, completion, {
    total: BigInt(55_001),
    vendor: BigInt(54_808),
    platform: BigInt(193)
  });
  const vendorAfter = await readWallet(prisma, vendorId);
  const buyerAfter = await readWallet(prisma, scenario.walletId);
  const platform = await platformCredits(prisma, scenario.orderId, systemId);
  record(
    `${scenario.label}: the cumulative allocation keeps every kobo and over-releases nothing`,
    buyerAfter.availableKobo === BigInt(119_999) &&
      buyerAfter.heldKobo === BigInt(0) &&
      vendorAfter.availableKobo === BigInt(54_808) &&
      vendorAfter.heldKobo === BigInt(0) &&
      platform === BigInt(193) &&
      buyerAfter.availableKobo + vendorAfter.availableKobo + platform === FUNDING_KOBO,
    `buyer ${buyerAfter.availableKobo}, vendor ${vendorAfter.availableKobo}, platform ${platform}, sum ${buyerAfter.availableKobo + vendorAfter.availableKobo + platform}`
  );
  await assertReconciliation(prisma, `${scenario.label} after completion`, "CLEAN");
}

async function oddKoboOutOfOrderExternal(prisma: PrismaClient, systemId: string) {
  const { reserveExternalRefundClaim, refundPayment, reconcileExternalRefundOutcome } = await import(
    "../lib/payments/service"
  );
  const { completeOrder } = await import("../lib/services/core/order.service");
  const scenario = await createScenario(prisma, "external-out-of-order", { provider: "paystack" });
  const vendorId = (await vendorWallet(prisma, scenario)).id;
  const callsBefore = providerRefundCalls;

  const first = await reserveExternalRefundClaim({
    orderId: scenario.orderId,
    actorId: scenario.userId,
    reason: "Reserved first, then abandoned.",
    amountKobo: BigInt(50_000),
    idempotencyKey: `err-out-of-order-a-${RUN_ID}`
  });
  const second = await reserveExternalRefundClaim({
    orderId: scenario.orderId,
    actorId: scenario.userId,
    reason: "Reserved second, settles first.",
    amountKobo: BigInt(50_000),
    idempotencyKey: `err-out-of-order-b-${RUN_ID}`
  });
  const reserved = await orderState(prisma, scenario.orderId);
  record(
    `${scenario.label}: two external claims reserve against the order before any provider call`,
    reserved.refundedKobo === BigInt(100_000) &&
      reserved.refunds.filter((refund) => refund.status === "PENDING").length === 2 &&
      providerRefundCalls === callsBefore,
    `reserved ${reserved.refundedKobo}, pending rows ${reserved.refunds.filter((refund) => refund.status === "PENDING").length}, provider calls ${providerRefundCalls}`
  );
  const reservedBook = await assertReconciliation(prisma, `${scenario.label} with two reservations`, "PENDING");
  record(
    `${scenario.label}: reservations alone are pending obligations, not a wallet discrepancy`,
    reservedBook.refunds.pendingObligationCount === 2 && reservedBook.issues.length === 2,
    `pending ${reservedBook.refunds.pendingObligationCount}, issues ${reservedBook.issues.length}`
  );

  const failed = await reconcileExternalRefundOutcome({
    refundId: first.refundId,
    actorId: ADMIN_ID,
    outcome: "failed",
    note: "Provider confirmed the first reservation was never submitted."
  });
  const afterFailure = await orderState(prisma, scenario.orderId);
  const firstLifecycle = await refundLifecycle(prisma, first.refundId);
  record(
    `${scenario.label}: releasing a never-submitted reservation restores its cap exactly`,
    failed.status === "FAILED" &&
      afterFailure.refundedKobo === BigInt(50_000) &&
      firstLifecycle.state === "failed" &&
      (await refundByKey(prisma, `err-out-of-order-a-${RUN_ID}`))?.status === "FAILED",
    `reservation ${afterFailure.refundedKobo}, lifecycle ${firstLifecycle.state}`
  );

  await refundPayment({
    orderId: scenario.orderId,
    actorId: scenario.userId,
    reason: "Resume the surviving reservation.",
    idempotencyKey: `err-out-of-order-b-${RUN_ID}`
  });
  const afterSecond = await orderState(prisma, scenario.orderId);
  const secondRefund = await refundByKey(prisma, `err-out-of-order-b-${RUN_ID}`);
  record(
    `${scenario.label}: the surviving reservation settles once at its exact amount`,
    afterSecond.refundedKobo === BigInt(50_000) &&
      secondRefund?.status === "COMPLETED" &&
      secondRefund?.amountKobo === BigInt(50_000) &&
      providerRefundCalls === callsBefore + 1,
    `refunded ${afterSecond.refundedKobo}, status ${secondRefund?.status}, provider calls ${providerRefundCalls}`
  );

  await deliverOrder(prisma, scenario);
  const completion = await completeOrder(scenario.userId, scenario.orderId);
  assertRelease(`${scenario.label} completion`, completion, {
    total: BigInt(105_000),
    vendor: BigInt(104_632),
    platform: BigInt(368)
  });
  const vendorAfter = await readWallet(prisma, vendorId);
  const systemAfter = await readWallet(prisma, systemId);
  record(
    `${scenario.label}: the failed reservation never inflated the settlement split by a kobo`,
    vendorAfter.availableKobo === BigInt(104_632) &&
      vendorAfter.heldKobo === BigInt(0) &&
      systemAfter.heldKobo === BigInt(0) &&
      (await platformCredits(prisma, scenario.orderId, systemId)) === BigInt(368),
    `vendor ${vendorAfter.availableKobo}, SYSTEM held ${systemAfter.heldKobo}, platform ${await platformCredits(prisma, scenario.orderId, systemId)}`
  );
  await assertProjections(prisma, `${scenario.label} after completion`, [scenario.walletId, vendorId, systemId]);
  await assertReconciliation(prisma, `${scenario.label} after completion`, "CLEAN");
}

/* --------------------------------------------------- interruption fixtures --- */

function waitFor<T>(probe: () => Promise<T | null | undefined>, timeoutMs: number, label: string): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  return new Promise<T>((resolve, reject) => {
    const tick = async () => {
      try {
        const value = await probe();
        if (value) return resolve(value);
        if (Date.now() > deadline) return reject(new Error(`Timed out waiting for ${label}.`));
        setTimeout(tick, 25);
      } catch (error) {
        reject(error);
      }
    };
    void tick();
  });
}

async function spawnRefundChild(mode: "hang" | "complete", orderId: string, key: string, counterPath: string, actorId: string) {
  const child = spawn(
    process.execPath,
    [
      TSX_CLI,
      path.join(REPO_ROOT, "scripts", "escrow-refund-interruption-child.ts"),
      mode,
      orderId,
      key,
      counterPath,
      "55000"
    ],
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        DATABASE_URL: DB_URL,
        TEST_DATABASE_URL: DB_URL,
        NAIJADEALS_TEST_DATABASE: DB,
        VALKEY_URL: "",
        PAYSTACK_SECRET_KEY: PROVIDER_SECRET,
        CHILD_ACTOR_ID: actorId
      },
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });
  return { child, stderr: () => stderr };
}

function killChild(child: ChildProcess) {
  return new Promise<void>((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      return resolve();
    }
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 5_000);
    timer.unref();
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill();
  });
}

async function submittedWithoutAcknowledgement(prisma: PrismaClient, systemId: string) {
  const { completeOrder } = await import("../lib/services/core/order.service");
  const { refundPayment, reconcileExternalRefundOutcome } = await import("../lib/payments/service");
  const scenario = await createScenario(prisma, "external-submitted-crash", { provider: "paystack" });
  const vendorId = (await vendorWallet(prisma, scenario)).id;
  await deliverOrder(prisma, scenario);
  const counterPath = tempCounterPath("submitted");
  const key = `err-submitted-crash-${RUN_ID}`;
  const { child, stderr } = await spawnRefundChild("hang", scenario.orderId, key, counterPath, scenario.userId);

  let refundId = "";
  try {
    const refund = await waitFor(() => refundByKey(prisma, key), 15_000, "the child's refund claim");
    refundId = refund!.id;
    await waitFor(
      async () => {
        const lifecycle = await refundLifecycle(prisma, refundId);
        return lifecycle.state === "submitted" && counterLines(counterPath).length === 1 ? lifecycle : null;
      },
      15_000,
      "the submitted lifecycle event and provider request"
    );
    await killChild(child);
  } finally {
    if (!child.killed) await killChild(child);
  }

  const crashed = await prisma.refund.findUniqueOrThrow({ where: { id: refundId } });
  const lifecycle = await refundLifecycle(prisma, refundId);
  const callsAfterCrash = counterLines(counterPath).length;
  record(
    `${scenario.label}: killing the process after submission leaves an unacknowledged submitted attempt`,
    crashed.status === "PENDING" &&
      lifecycle.state === "submitted" &&
      lifecycle.acknowledged === false &&
      callsAfterCrash === 1 &&
      (await orderState(prisma, scenario.orderId)).refundedKobo === BigInt(55_000),
    `status ${crashed.status}, lifecycle ${lifecycle.state} acknowledged=${lifecycle.acknowledged}, provider requests ${callsAfterCrash}${stderr() ? `, stderr ${stderr().slice(0, 80)}` : ""}`
  );
  const crashBook = await assertReconciliation(prisma, `${scenario.label} after crash`, "REVIEW");
  record(
    `${scenario.label}: reconciliation calls the interrupted submission uncertain, not clean and not an ordinary pending refund`,
    crashBook.refunds.uncertainCount === 1 &&
      crashBook.refunds.pendingObligationCount === 0 &&
      crashBook.refunds.rows[0]?.classification === "uncertain_outcome",
    `uncertain ${crashBook.refunds.uncertainCount}, pending ${crashBook.refunds.pendingObligationCount}, class ${crashBook.refunds.rows[0]?.classification}`
  );

  const retry = await statusOf(refundPayment({
    orderId: scenario.orderId,
    actorId: scenario.userId,
    reason: "Retry after interruption.",
    amountKobo: BigInt(55_000),
    idempotencyKey: key
  }));
  record(
    `${scenario.label}: the retry refuses to resubmit and makes no second provider request`,
    retry.status === 409 && retry.code === "refund_unknown" && counterLines(counterPath).length === 1,
    `${retry.status} ${retry.code}, provider requests ${counterLines(counterPath).length}`
  );
  const blockedCompletion = await statusOf(completeOrder(scenario.userId, scenario.orderId));
  record(
    `${scenario.label}: the uncertain reservation blocks completion`,
    blockedCompletion.status === 409 && blockedCompletion.code === "refund_pending" && (await releaseRows(prisma, scenario.orderId)).length === 0,
    `${blockedCompletion.status} ${blockedCompletion.code}`
  );

  // Operator recovery: the provider dashboard shows the refund completed.
  const recovered = await reconcileExternalRefundOutcome({
    refundId,
    actorId: ADMIN_ID,
    outcome: "confirmed",
    note: "Provider dashboard shows the interrupted refund as processed."
  });
  const recoveredLifecycle = await refundLifecycle(prisma, refundId);
  record(
    `${scenario.label}: an operator-confirmed outcome settles locally without calling the provider again`,
    (recovered as { refundedKobo?: string }).refundedKobo === "55000" &&
      (await prisma.refund.findUniqueOrThrow({ where: { id: refundId } })).status === "COMPLETED" &&
      recoveredLifecycle.state === "confirmed" &&
      counterLines(counterPath).length === 1,
    `refunded ${(recovered as { refundedKobo?: string }).refundedKobo}, lifecycle ${recoveredLifecycle.state}, provider requests ${counterLines(counterPath).length}`
  );
  const completion = await completeOrder(scenario.userId, scenario.orderId);
  assertRelease(`${scenario.label} completion`, completion, {
    total: BigInt(100_000),
    vendor: BigInt(99_650),
    platform: BigInt(350)
  });
  await assertProjections(prisma, `${scenario.label} after recovery`, [scenario.walletId, vendorId, systemId]);
  await assertReconciliation(prisma, `${scenario.label} after recovery`, "CLEAN");
  rmSync(counterPath, { force: true });
}

async function holdVendorWallet(prismaUrl: string, vendorWalletId: string) {
  const { PrismaClient } = await import("@prisma/client");
  const lockPrisma = new PrismaClient({ datasources: { db: { url: prismaUrl } } });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let acquired!: () => void;
  const acquiredPromise = new Promise<void>((resolve) => {
    acquired = resolve;
  });
  const transaction = lockPrisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ${vendorWalletId} FOR UPDATE`;
      acquired();
      await gate;
    },
    { timeout: 120_000, maxWait: 15_000 }
  );
  await acquiredPromise;
  return {
    release: async () => {
      release();
      await transaction;
      await lockPrisma.$disconnect();
    }
  };
}

async function confirmedBeforeSettlement(prisma: PrismaClient, systemId: string) {
  const { completeOrder } = await import("../lib/services/core/order.service");
  const { refundPayment } = await import("../lib/payments/service");
  const scenario = await createScenario(prisma, "external-confirmed-crash", { provider: "paystack" });
  const vendorId = (await vendorWallet(prisma, scenario)).id;
  await deliverOrder(prisma, scenario);
  const counterPath = tempCounterPath("confirmed");
  const key = `err-confirmed-crash-${RUN_ID}`;
  const lock = await holdVendorWallet(DB_URL, (await readWallet(prisma, vendorId)).id);

  let refundId = "";
  let child: ChildProcess | null = null;
  try {
    const spawned = await spawnRefundChild("complete", scenario.orderId, key, counterPath, scenario.userId);
    child = spawned.child;
    const refund = await waitFor(() => refundByKey(prisma, key), 15_000, "the child's confirmed refund claim");
    refundId = refund!.id;
    await waitFor(
      async () => {
        const lifecycle = await refundLifecycle(prisma, refundId);
        return lifecycle.state === "confirmed" && counterLines(counterPath).length === 1 ? lifecycle : null;
      },
      15_000,
      "the provider confirmation before local settlement"
    );
    await killChild(child);
  } finally {
    await lock.release();
    if (child) await killChild(child);
  }

  const crashed = await prisma.refund.findUniqueOrThrow({ where: { id: refundId } });
  const lifecycle = await refundLifecycle(prisma, refundId);
  const refundTxAfterCrash = await prisma.walletTransaction.findFirst({ where: { reference: `REFUND-${refundId}` } });
  record(
    `${scenario.label}: killing the process between confirmation and settlement leaves the refund unposted`,
    crashed.status === "PENDING" &&
      lifecycle.state === "confirmed" &&
      refundTxAfterCrash === null &&
      counterLines(counterPath).length === 1,
    `status ${crashed.status}, lifecycle ${lifecycle.state}, refund tx ${refundTxAfterCrash ? "present" : "absent"}, provider requests ${counterLines(counterPath).length}`
  );
  const crashBook = await assertReconciliation(prisma, `${scenario.label} after crash`, "REVIEW");
  record(
    `${scenario.label}: a provider-confirmed but unposted refund is a genuine discrepancy, not a pending obligation`,
    crashBook.refunds.discrepancyCount === 1 &&
      crashBook.refunds.pendingObligationCount === 0 &&
      crashBook.refunds.rows[0]?.classification === "confirmed_not_settled",
    `discrepancies ${crashBook.refunds.discrepancyCount}, pending ${crashBook.refunds.pendingObligationCount}, class ${crashBook.refunds.rows[0]?.classification}`
  );

  const retry = await refundPayment({
    orderId: scenario.orderId,
    actorId: scenario.userId,
    reason: "Retry after the settlement crash.",
    amountKobo: BigInt(55_000),
    idempotencyKey: key
  });
  const settled = await prisma.refund.findUniqueOrThrow({ where: { id: refundId } });
  record(
    `${scenario.label}: the retry settles from stored confirmation without a second provider request`,
    (retry as { refundedKobo?: string }).refundedKobo === "55000" &&
      settled.status === "COMPLETED" &&
      counterLines(counterPath).length === 1,
    `refunded ${(retry as { refundedKobo?: string }).refundedKobo}, status ${settled.status}, provider requests ${counterLines(counterPath).length}`
  );
  const completion = await completeOrder(scenario.userId, scenario.orderId);
  assertRelease(`${scenario.label} completion`, completion, {
    total: BigInt(100_000),
    vendor: BigInt(99_650),
    platform: BigInt(350)
  });
  await assertProjections(prisma, `${scenario.label} after recovery`, [scenario.walletId, vendorId, systemId]);
  await assertReconciliation(prisma, `${scenario.label} after recovery`, "CLEAN");
  rmSync(counterPath, { force: true });
}

async function pendingAcknowledgedAndDefinitiveFailure(prisma: PrismaClient, systemId: string) {
  const { refundPayment, reconcileExternalRefundOutcome } = await import("../lib/payments/service");
  const { completeOrder } = await import("../lib/services/core/order.service");

  // Provider acknowledges the refund as pending.
  const pendingScenario = await createScenario(prisma, "external-provider-pending", { provider: "paystack" });
  await deliverOrder(prisma, pendingScenario);
  refundMode = "pending";
  const pendingAttempt = await statusOf(refundPayment({
    orderId: pendingScenario.orderId,
    actorId: pendingScenario.userId,
    reason: "Provider pending fixture.",
    amountKobo: BigInt(55_000),
    idempotencyKey: `err-provider-pending-${RUN_ID}`
  }));
  const pendingRefund = await refundByKey(prisma, `err-provider-pending-${RUN_ID}`);
  const pendingLifecycle = await refundLifecycle(prisma, pendingRefund!.id);
  record(
    `${pendingScenario.label}: a provider-acknowledged pending refund stays reserved and is reported as pending`,
    pendingAttempt.status === 502 &&
      pendingAttempt.code === "refund_pending" &&
      pendingRefund?.status === "PENDING" &&
      pendingLifecycle.state === "submitted" &&
      pendingLifecycle.acknowledged === true &&
      (await orderState(prisma, pendingScenario.orderId)).refundedKobo === BigInt(55_000),
    `${pendingAttempt.status} ${pendingAttempt.code}, lifecycle ${pendingLifecycle.state} ack=${pendingLifecycle.acknowledged}`
  );
  const pendingBook = await assertReconciliation(prisma, `${pendingScenario.label} while pending`, "PENDING");
  record(
    `${pendingScenario.label}: an acknowledged pending refund is a correctly accounted obligation, not CLEAN`,
    pendingBook.refunds.pendingObligationCount === 1 &&
      pendingBook.refunds.uncertainCount === 0 &&
      pendingBook.refunds.rows[0]?.classification === "pending_obligation",
    `pending ${pendingBook.refunds.pendingObligationCount}, uncertain ${pendingBook.refunds.uncertainCount}`
  );
  const blocked = await statusOf(completeOrder(pendingScenario.userId, pendingScenario.orderId));
  record(
    `${pendingScenario.label}: completion refuses while the provider has not completed the refund`,
    blocked.status === 409 && blocked.code === "refund_pending" && (await releaseRows(prisma, pendingScenario.orderId)).length === 0,
    `${blocked.status} ${blocked.code}`
  );
  await reconcileExternalRefundOutcome({
    refundId: pendingRefund!.id,
    actorId: ADMIN_ID,
    outcome: "confirmed",
    note: "Provider dashboard now shows the pending refund completed."
  });
  record(
    `${pendingScenario.label}: operator confirmation settles the acknowledged pending refund`,
    (await refundByKey(prisma, `err-provider-pending-${RUN_ID}`))?.status === "COMPLETED" &&
      (await refundLifecycle(prisma, pendingRefund!.id)).state === "confirmed",
    `status ${(await refundByKey(prisma, `err-provider-pending-${RUN_ID}`))?.status}`
  );
  await assertReconciliation(prisma, `${pendingScenario.label} after settlement`, "CLEAN");
  refundMode = "completed";

  // Provider definitively rejects the request.
  const rejectedScenario = await createScenario(prisma, "external-rejected", { provider: "paystack" });
  const rejectedSystemBefore = await readWallet(prisma, systemId);
  await deliverOrder(prisma, rejectedScenario);
  refundMode = "rejected";
  const rejectedAttempt = await statusOf(refundPayment({
    orderId: rejectedScenario.orderId,
    actorId: rejectedScenario.userId,
    reason: "Provider rejection fixture.",
    amountKobo: BigInt(55_000),
    idempotencyKey: `err-provider-rejected-${RUN_ID}`
  }));
  const rejectedRefund = await refundByKey(prisma, `err-provider-rejected-${RUN_ID}`);
  const rejectedLifecycle = await refundLifecycle(prisma, rejectedRefund!.id);
  const rejectedOrder = await orderState(prisma, rejectedScenario.orderId);
  const rejectedSystemAfter = await readWallet(prisma, systemId);
  record(
    `${rejectedScenario.label}: a definitive rejection fails the refund and releases its reservation exactly`,
    rejectedAttempt.status === 502 &&
      rejectedAttempt.code === "refund_failed" &&
      rejectedRefund?.status === "FAILED" &&
      rejectedLifecycle.state === "failed" &&
      rejectedOrder.refundedKobo === BigInt(0) &&
      rejectedSystemAfter.availableKobo === rejectedSystemBefore.availableKobo &&
      rejectedSystemAfter.heldKobo === rejectedSystemBefore.heldKobo,
    `${rejectedAttempt.status} ${rejectedAttempt.code}, refund ${rejectedRefund?.status}, lifecycle ${rejectedLifecycle.state}, reservation ${rejectedOrder.refundedKobo}`
  );
  await assertReconciliation(prisma, `${rejectedScenario.label} after rejection`, "CLEAN");
  const completion = await completeOrder(rejectedScenario.userId, rejectedScenario.orderId);
  assertRelease(`${rejectedScenario.label} completion`, completion, {
    total: TOTAL_KOBO,
    vendor: PAYABLE_KOBO,
    platform: BigInt(544)
  });
  await assertReconciliation(prisma, `${rejectedScenario.label} after completion`, "CLEAN");
  refundMode = "completed";
}

async function unknownOutcomeAndManualFailure(prisma: PrismaClient) {
  const { refundPayment, reconcileExternalRefundOutcome } = await import("../lib/payments/service");
  const { completeOrder } = await import("../lib/services/core/order.service");
  const scenario = await createScenario(prisma, "external-unknown", { provider: "paystack" });
  await deliverOrder(prisma, scenario);
  const callsBefore = providerRefundCalls;
  refundMode = "network";
  const attempt = await statusOf(refundPayment({
    orderId: scenario.orderId,
    actorId: scenario.userId,
    reason: "Ambiguous transport failure fixture.",
    amountKobo: BigInt(55_000),
    idempotencyKey: `err-unknown-${RUN_ID}`
  }));
  const refund = await refundByKey(prisma, `err-unknown-${RUN_ID}`);
  const lifecycle = await refundLifecycle(prisma, refund!.id);
  record(
    `${scenario.label}: an ambiguous transport failure keeps the reservation and records an unknown outcome`,
    attempt.status === 502 &&
      attempt.code === "refund_unknown" &&
      refund?.status === "PENDING" &&
      lifecycle.state === "unknown" &&
      (await orderState(prisma, scenario.orderId)).refundedKobo === BigInt(55_000) &&
      providerRefundCalls === callsBefore + 1,
    `${attempt.status} ${attempt.code}, lifecycle ${lifecycle.state}, provider calls ${providerRefundCalls}`
  );
  const book = await assertReconciliation(prisma, `${scenario.label} after ambiguous failure`, "REVIEW");
  record(
    `${scenario.label}: an unknown outcome is reported as uncertain, never as clean pending work`,
    book.refunds.uncertainCount === 1 && book.refunds.rows[0]?.classification === "uncertain_outcome",
    `uncertain ${book.refunds.uncertainCount}, class ${book.refunds.rows[0]?.classification}`
  );
  const retry = await statusOf(refundPayment({
    orderId: scenario.orderId,
    actorId: scenario.userId,
    reason: "Retry after unknown outcome.",
    amountKobo: BigInt(55_000),
    idempotencyKey: `err-unknown-${RUN_ID}`
  }));
  record(
    `${scenario.label}: the ambiguous refund is never resubmitted`,
    retry.status === 409 && retry.code === "refund_unknown" && providerRefundCalls === callsBefore + 1,
    `${retry.status} ${retry.code}, provider calls ${providerRefundCalls}`
  );

  const failed = await reconcileExternalRefundOutcome({
    refundId: refund!.id,
    actorId: ADMIN_ID,
    outcome: "failed",
    note: "Provider dashboard shows no refund was created."
  });
  const failedOrder = await orderState(prisma, scenario.orderId);
  record(
    `${scenario.label}: an operator-recorded failure releases the reservation without a provider call`,
    failed.status === "FAILED" &&
      failedOrder.refundedKobo === BigInt(0) &&
      (await refundByKey(prisma, `err-unknown-${RUN_ID}`))?.status === "FAILED" &&
      providerRefundCalls === callsBefore + 1,
    `status ${failed.status}, reservation ${failedOrder.refundedKobo}, provider calls ${providerRefundCalls}`
  );
  await assertReconciliation(prisma, `${scenario.label} after operator failure`, "CLEAN");
  const completion = await completeOrder(scenario.userId, scenario.orderId);
  assertRelease(`${scenario.label} completion`, completion, {
    total: TOTAL_KOBO,
    vendor: PAYABLE_KOBO,
    platform: BigInt(544)
  });
  refundMode = "completed";
}

async function reservationRecovery(prisma: PrismaClient, systemId: string) {
  const { reserveExternalRefundClaim, refundPayment } = await import("../lib/payments/service");
  const { completeOrder } = await import("../lib/services/core/order.service");
  const scenario = await createScenario(prisma, "external-reserved", { provider: "paystack" });
  const vendorId = (await vendorWallet(prisma, scenario)).id;
  await deliverOrder(prisma, scenario);
  const callsBefore = providerRefundCalls;

  const reserved = await reserveExternalRefundClaim({
    orderId: scenario.orderId,
    actorId: scenario.userId,
    reason: "Reserved and then the caller died.",
    amountKobo: BigInt(55_000),
    idempotencyKey: `err-reserved-${RUN_ID}`
  });
  const reservedRefund = await prisma.refund.findUniqueOrThrow({ where: { id: reserved.refundId } });
  const reservedLifecycle = await refundLifecycle(prisma, reserved.refundId);
  record(
    `${scenario.label}: a reservation commits with no provider request and a frozen cap`,
    reservedRefund.status === "PENDING" &&
      reservedLifecycle.state === "reserved" &&
      providerRefundCalls === callsBefore &&
      (await orderState(prisma, scenario.orderId)).refundedKobo === BigInt(55_000),
    `status ${reservedRefund.status}, lifecycle ${reservedLifecycle.state}, provider calls ${providerRefundCalls}`
  );
  const reservedBook = await assertReconciliation(prisma, `${scenario.label} while reserved`, "PENDING");
  record(
    `${scenario.label}: an untouched reservation is a pending obligation, not a discrepancy and not CLEAN`,
    reservedBook.refunds.pendingObligationCount === 1 && reservedBook.issues.length === 1,
    `pending ${reservedBook.refunds.pendingObligationCount}, issues ${reservedBook.issues.length}`
  );
  const blocked = await statusOf(completeOrder(scenario.userId, scenario.orderId));
  record(
    `${scenario.label}: completion refuses while the reservation is unfinished`,
    blocked.status === 409 && blocked.code === "refund_pending" && (await releaseRows(prisma, scenario.orderId)).length === 0,
    `${blocked.status} ${blocked.code}`
  );

  const resumed = await refundPayment({
    orderId: scenario.orderId,
    actorId: scenario.userId,
    reason: "Resume the untouched reservation.",
    amountKobo: BigInt(55_000),
    idempotencyKey: `err-reserved-${RUN_ID}`
  });
  const resumedRefund = await prisma.refund.findUniqueOrThrow({ where: { id: reserved.refundId } });
  const resumedLifecycle = await refundLifecycle(prisma, reserved.refundId);
  record(
    `${scenario.label}: resuming a reserved attempt submits once and settles without a duplicate claim`,
    (resumed as { refundedKobo?: string }).refundedKobo === "55000" &&
      resumedRefund.status === "COMPLETED" &&
      resumedLifecycle.state === "confirmed" &&
      providerRefundCalls === callsBefore + 1 &&
      (await orderState(prisma, scenario.orderId)).refunds.length === 1,
    `refunded ${(resumed as { refundedKobo?: string }).refundedKobo}, status ${resumedRefund.status}, provider calls ${providerRefundCalls}`
  );
  const completion = await completeOrder(scenario.userId, scenario.orderId);
  assertRelease(`${scenario.label} completion`, completion, {
    total: BigInt(100_000),
    vendor: BigInt(99_650),
    platform: BigInt(350)
  });
  await assertProjections(prisma, `${scenario.label} after completion`, [scenario.walletId, vendorId, systemId]);
  await assertReconciliation(prisma, `${scenario.label} after completion`, "CLEAN");
}

/* ------------------------------------------------------------------ main --- */

async function main(prisma: PrismaClient, url: string) {
  const { ensureWallet } = await import("../lib/payments/service");
  const { reconcile } = await import("../lib/services/core/reconciliation-correct");

  const current = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  assert(current[0]?.db === DB, `wrong database ${current[0]?.db ?? "unknown"}, expected ${DB}`);
  await ensureCity(prisma);

  const admin = await prisma.user.create({
    data: { email: `err-${RUN_ID}-admin@example.test`, name: "Escrow release acceptance admin", actorType: "ADMIN" }
  });
  ADMIN_ID = admin.id;

  const system = await ensureWallet(prisma, { ownerType: "SYSTEM" });
  const systemSnapshot = snapshot(await readWallet(prisma, system.id));
  const systemId = system.id;
  process.env.DISPUTE_RELEASE_ENABLED = "true";

  try {
    const cases: Array<[string, () => Promise<unknown>]> = [
      ["releaseMath", () => releaseMath()],
      ["walletPartialCompletion", () => walletPartialCompletion(prisma, systemId)],
      ["walletMultipleCompletion", () => walletMultipleCompletion(prisma, systemId)],
      ["walletFullRefundDisputeBlocked", () => walletFullRefundDisputeBlocked(prisma)],
      ["disputeGateAndDuplicate", () => disputeGateAndDuplicate(prisma)],
      ["disputePartialAndMulti", () => disputePartialAndMulti(prisma)],
      ["concurrentDisputeResolutions", () => concurrentDisputeResolutions(prisma)],
      ["completionRacingDispute", () => completionRacingDispute(prisma)],
      ["pendingExternalRefundRacingDispute", () => pendingExternalRefundRacingDispute(prisma)],
      ["externalFullRefund", () => externalFullRefund(prisma, systemId)],
      ["externalPostReleaseRefunds", () => externalPostReleaseRefunds(prisma, systemId)],
      ["oddKoboWallet", () => oddKoboWallet(prisma, systemId)],
      ["oddKoboOutOfOrderExternal", () => oddKoboOutOfOrderExternal(prisma, systemId)],
      ["reservationRecovery", () => reservationRecovery(prisma, systemId)],
      ["submittedWithoutAcknowledgement", () => submittedWithoutAcknowledgement(prisma, systemId)],
      ["confirmedBeforeSettlement", () => confirmedBeforeSettlement(prisma, systemId)],
      ["pendingAcknowledgedAndDefinitiveFailure", () => pendingAcknowledgedAndDefinitiveFailure(prisma, systemId)],
      ["unknownOutcomeAndManualFailure", () => unknownOutcomeAndManualFailure(prisma)]
    ];
    for (const [, runCase] of cases) {
      await runCase();
    }
  } finally {
    // The caller (run) owns cleanup so a thrown case still restores the DB.
  }

  const cleanup = await cleanupRun(prisma, systemSnapshot);
  const systemAfter = await readWallet(prisma, systemId);
  const book = await reconcile();
  const reconcileCli = spawnSync(
    process.execPath,
    [TSX_CLI, path.join(REPO_ROOT, "scripts", "wallet-reconcile.ts")],
    {
      cwd: REPO_ROOT,
      env: { ...process.env, DATABASE_URL: url, RECONCILE_DB: DB, VALKEY_URL: "" },
      encoding: "utf8",
      timeout: 180_000
    }
  );
  let reconcileReport: { status?: string; mismatches?: number; refundAccounting?: { status?: string; rows?: unknown[] } } = {};
  try {
    const parsed = JSON.parse(reconcileCli.stdout);
    reconcileReport = parsed;
  } catch {
    reconcileReport = {};
  }
  record(
    "fixture cleanup removes every run row and restores the exact SYSTEM position",
    cleanup.leftovers === 0 &&
      systemAfter.availableKobo === BigInt(systemSnapshot.available) &&
      systemAfter.heldKobo === BigInt(systemSnapshot.held),
    `leftovers ${cleanup.leftovers}, SYSTEM ${JSON.stringify(systemSnapshot)} -> ${JSON.stringify(snapshot(systemAfter))}`
  );
  record(
    "whole-book reconciliation is CLEAN after cleanup",
    book.status === "CLEAN" &&
      book.issues.length === 0 &&
      reconcileReport.status === "CLEAN" &&
      reconcileReport.refundAccounting?.status === "CLEAN" &&
      (reconcileReport.refundAccounting?.rows?.length ?? 0) === 0,
    `in-process ${book.status}/${book.issues.length} issues, cli ${reconcileReport.status ?? reconcileCli.status}, refund rows ${reconcileReport.refundAccounting?.rows?.length ?? "?"}`
  );

  console.log(
    JSON.stringify(
      {
        runId: RUN_ID,
        database: DB,
        checks,
        failures,
        releases,
        cleanup,
        system: { before: systemSnapshot, after: snapshot(systemAfter) },
        reconciliation: { status: book.status, issues: book.issues.length, totals: book.totals },
        reconcileCli: reconcileReport,
        status: failures === 0 ? "PASS" : "FAIL"
      },
      (key, value) => (typeof value === "bigint" ? value.toString() : value),
      2
    )
  );
}

async function run() {
  process.env.VALKEY_URL = "";
  process.env.PAYSTACK_SECRET_KEY = PROVIDER_SECRET;
  installProviderMock();
  const target = await requireTestDatabase({ url: acceptanceUrl() });
  assert(target.databaseName === DB, `guard verified ${target.databaseName}, expected ${DB}`);
  DB_URL = target.url;
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
  const { ensureWallet } = await import("../lib/payments/service");
  const system = await ensureWallet(prisma, { ownerType: "SYSTEM" });
  const systemSnapshot = snapshot(await readWallet(prisma, system.id));
  try {
    await main(prisma, DB_URL);
  } catch (error) {
    try {
      await cleanupRun(prisma, systemSnapshot);
    } catch (cleanupError) {
      process.stderr.write(`cleanup after failure failed: ${String(cleanupError)}\n`);
    }
    throw error;
  } finally {
    await prisma.$disconnect();
    cleanupTempFiles();
  }
}

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
