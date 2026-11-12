/**
 * Reservation-aware escrow release acceptance — isolated database only.
 *
 * Database: `naijadeals_escrow_reservation_guard`, verified through the shared
 * fail-closed test-database guard and checked again with `current_database()`.
 * No shared, development or production database is touched. Every provider
 * response is intercepted; any non-Paystack URL aborts.
 *
 * This suite proves the release-side refund contract added for incident
 * ND-20261109-285D47:
 *
 *   1. reserved, submitted-with-acknowledgement, unknown and
 *      confirmed-but-unsettled refunds block both customer completion and
 *      dispute release, and neither operation moves a kobo while blocked.
 *   2. A released (FAILED) claim does not block release and is never counted as
 *      a completed refund.
 *   3. A `refundedKobo` reservation with no live refund row blocks release
 *      until it is reconciled, instead of paying the vendor the reserved money.
 *   4. Settled claims exceeding `refundedKobo` block release as a state conflict.
 *   5. A legacy escrow whose buyer of record is not the wallet that funded the
 *      hold refuses refunds before reserving or contacting the provider.
 *   6. After the blocking claim is resolved, the remaining obligation is
 *      released exactly once, every wallet delta matches the journal, and the
 *      whole book reconciles CLEAN.
 *
 * Prerequisite: the database is migrated to head and empty. Run
 * `prisma migrate deploy` (or reset) against it before each run; the suite
 * refuses to run when it finds pre-existing orders.
 *
 * Usage:
 *   DATABASE_URL=<isolated url ending /naijadeals_escrow_reservation_guard> \
 *     npx tsx scripts/escrow-refund-reservation-guard-acceptance.ts
 */
import "dotenv/config";
import { createHmac, randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { requireTestDatabase } from "./lib/test-db-guard";

const DB = "naijadeals_escrow_reservation_guard";
const RUN_ID = `${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${randomBytes(4).toString("hex")}`;
const PROVIDER_SECRET = `sk_test_reservation_guard_${RUN_ID}`;

const SUBTOTAL_KOBO = BigInt(4_951);
const DELIVERY_KOBO = BigInt(150_000);
const TOTAL_KOBO = BigInt(155_000);
const COMMISSION_KOBO = BigInt(495);
const PAYABLE_KOBO = SUBTOTAL_KOBO - COMMISSION_KOBO + DELIVERY_KOBO; // 154,456
const PARTIAL_KOBO = BigInt(1_000);

type Check = { name: string; pass: boolean; detail: string };
type WalletSnapshot = { available: string; held: string };
type WalletSet = { buyer: string; vendor: string; system: string };
type Snapshot = Record<keyof WalletSet, WalletSnapshot>;
type Scenario = {
  label: string;
  userId: string;
  vendorId: string;
  orderId: string;
  orderNumber: string;
  paymentId: string;
  reference: string;
  buyerWalletId: string;
  vendorWalletId: string;
  systemWalletId: string;
  /** External payments hold the escrow in the SYSTEM wallet, not the customer. */
  escrowBuyer: "SYSTEM" | "CUSTOMER";
  escrowId: string;
};

const checks: Check[] = [];
let failures = 0;
let DB_URL = "";
let ADMIN_ID = "";
let providerRefundCalls = 0;

function record(name: string, pass: boolean, detail: string) {
  checks.push({ name, pass, detail });
  if (!pass) failures += 1;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function acceptanceUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set in .env.");
  const url = new URL(raw);
  url.pathname = `/${DB}`;
  return url.toString();
}

/* ------------------------------------------------------------- provider --- */

type RefundMode = "completed" | "pending" | "rejected" | "network";
let refundMode: RefundMode = "completed";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

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
        data: { reference, authorization_url: `https://paystack.test/checkout/${encodeURIComponent(reference)}` }
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
      if (refundMode === "rejected") return json({ message: "Simulated provider rejection." }, 422);
      if (refundMode === "network") throw new TypeError("simulated network failure after submission");
      if (refundMode === "pending") {
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

async function createExternalOrder(prisma: PrismaClient, label: string): Promise<Scenario> {
  const { ensureWallet, initializePayment, processWebhook } = await import("../lib/payments/service");
  const { checkout } = await import("../lib/services/core/checkout.service");
  const lower = RUN_ID.toLowerCase();
  const user = await prisma.user.create({
    data: { email: `guard-${RUN_ID}-${label}@example.test`, name: `Guard ${label}`, actorType: "CUSTOMER" }
  });
  const vendorOwner = await prisma.user.create({
    data: { email: `guard-${RUN_ID}-${label}-owner@example.test`, name: `Guard ${label} owner`, actorType: "VENDOR" }
  });
  const vendor = await prisma.vendor.create({
    data: {
      ownerId: vendorOwner.id,
      name: `Guard vendor ${RUN_ID} ${label}`,
      slug: `guard-vendor-${lower}-${label}`,
      market: "Isolated guard fixture market",
      description: "Isolated reservation-guard fixture. Not a real vendor.",
      pickupAddress: "1 Guard Fixture Way, Lagos",
      pickupPhone: "+2348000000000",
      status: "VERIFIED",
      commissionBps: 1000
    }
  });
  const category = await prisma.category.create({
    data: { name: `Guard category ${RUN_ID} ${label}`, slug: `guard-category-${lower}-${label}` }
  });
  const product = await prisma.product.create({
    data: {
      vendorId: vendor.id,
      categoryId: category.id,
      name: `Guard product ${RUN_ID} ${label}`,
      slug: `guard-product-${lower}-${label}`,
      description: "Isolated reservation-guard fixture product.",
      priceKobo: SUBTOTAL_KOBO,
      status: "ACTIVE",
      isSample: false,
      stock: { create: { quantity: 5, reserved: 0 } }
    }
  });
  await prisma.cart.create({
    data: { userId: user.id, status: "ACTIVE", items: { create: { productId: product.id, quantity: 1 } } }
  });
  const buyerWallet = await ensureWallet(prisma, { userId: user.id, ownerType: "CUSTOMER" });
  const created = await checkout({
    userId: user.id,
    address: {
      contactName: `Guard ${label}`,
      contactPhone: "08000000000",
      countryCode: "NG",
      state: "Lagos",
      city: "Lagos",
      line1: "1 Guard Fixture Way"
    }
  });
  assert(created.orders.length === 1, `${label}: checkout must create one order`);
  const order = created.orders[0];
  assert(BigInt(order.totalKobo) === TOTAL_KOBO, `${label}: unexpected total ${order.totalKobo}`);
  const init = await initializePayment({
    orderId: order.orderId,
    userId: user.id,
    provider: "paystack",
    callbackUrl: "http://localhost/orders/callback"
  });
  const event = paystackEvent(init.reference, `${RUN_ID}-${label}-success`);
  await processWebhook("paystack", event.body, event.headers);

  const payment = await prisma.payment.findFirstOrThrow({
    where: { orderId: order.orderId, status: "COMPLETED" }
  });
  const escrow = await prisma.escrowHold.findFirstOrThrow({ where: { orderId: order.orderId } });
  const vendorWallet = await prisma.wallet.findFirstOrThrow({
    where: { vendorId: vendor.id, ownerType: "VENDOR" }
  });
  const systemWallet = await prisma.wallet.findFirstOrThrow({ where: { ownerType: "SYSTEM" } });

  return {
    label,
    userId: user.id,
    vendorId: vendor.id,
    orderId: order.orderId,
    orderNumber: order.orderNumber,
    paymentId: payment.id,
    reference: init.reference,
    buyerWalletId: buyerWallet.id,
    vendorWalletId: vendorWallet.id,
    systemWalletId: systemWallet.id,
    escrowBuyer: escrow.buyerWalletId === systemWallet.id ? "SYSTEM" : "CUSTOMER",
    escrowId: escrow.id
  };
}

async function deliver(prisma: PrismaClient, scenario: Scenario) {
  const { updateOrderStatus } = await import("../lib/services/core/order.service");
  const flow = ["accepted", "preparing", "ready_for_pickup", "courier_assigned", "picked_up", "in_transit", "delivered"] as const;
  for (const status of flow) {
    await updateOrderStatus({
      actorId: scenario.userId,
      orderId: scenario.orderId,
      status,
      note: `Reservation guard acceptance transition to ${status}.`
    });
  }
}

async function snapshot(prisma: PrismaClient, scenario: Scenario): Promise<Snapshot> {
  const ids: WalletSet = {
    buyer: scenario.buyerWalletId,
    vendor: scenario.vendorWalletId,
    system: scenario.systemWalletId
  };
  const result = {} as Snapshot;
  for (const key of Object.keys(ids) as Array<keyof WalletSet>) {
    const wallet = await prisma.wallet.findUniqueOrThrow({
      where: { id: ids[key] },
      select: { availableKobo: true, heldKobo: true }
    });
    result[key] = { available: wallet.availableKobo.toString(), held: wallet.heldKobo.toString() };
  }
  return result;
}

function sameSnapshot(left: Snapshot, right: Snapshot) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function snapshotText(value: Snapshot) {
  return `buyer ${value.buyer.available}/${value.buyer.held}, vendor ${value.vendor.available}/${value.vendor.held}, SYSTEM ${value.system.available}/${value.system.held}`;
}

async function outcome(promise: Promise<unknown>) {
  try {
    return { ok: true as const, value: await promise, code: "ok", status: 200, message: "" };
  } catch (error) {
    const typed = error as { status?: number; code?: string; message?: string };
    return {
      ok: false as const,
      value: null,
      status: typed.status ?? 500,
      code: typed.code ?? "unknown",
      message: (typed.message ?? String(error)).slice(0, 240)
    };
  }
}

async function expectBlocked(
  name: string,
  promise: Promise<unknown>,
  codes: string[]
) {
  const result = await outcome(promise);
  record(
    name,
    !result.ok && codes.includes(result.code),
    result.ok ? "unexpected success" : `${result.status} ${result.code}: ${result.message}`
  );
  return result;
}

async function expectSuccess(name: string, promise: Promise<unknown>) {
  const result = await outcome(promise);
  record(name, result.ok, result.ok ? "success" : `${result.status} ${result.code}: ${result.message}`);
  return result;
}

/* ----------------------------------------------------------- claim states --- */

async function makeReserved(scenario: Scenario, amountKobo?: bigint) {
  const { reserveExternalRefundClaim } = await import("../lib/payments/service");
  return reserveExternalRefundClaim({
    orderId: scenario.orderId,
    actorId: ADMIN_ID,
    reason: `Reservation guard ${scenario.label}`,
    idempotencyKey: `guard-${RUN_ID}-${scenario.label}-${amountKobo ?? "full"}`,
    amountKobo
  });
}

async function makeSubmittedAcknowledged(scenario: Scenario) {
  const { refundPayment } = await import("../lib/payments/service");
  refundMode = "pending";
  const result = await expectBlocked(
    `${scenario.label}: provider acknowledgement leaves the refund pending`,
    refundPayment({
      orderId: scenario.orderId,
      actorId: ADMIN_ID,
      reason: `Reservation guard pending ${scenario.label}`,
      idempotencyKey: `guard-${RUN_ID}-${scenario.label}-pending`
    }),
    ["refund_pending"]
  );
  refundMode = "completed";
  assert(!result.ok, `${scenario.label}: pending provider response did not settle`);
}

async function makeUnknown(scenario: Scenario) {
  const { refundPayment } = await import("../lib/payments/service");
  refundMode = "network";
  const result = await expectBlocked(
    `${scenario.label}: a transport failure leaves the refund outcome unknown`,
    refundPayment({
      orderId: scenario.orderId,
      actorId: ADMIN_ID,
      reason: `Reservation guard unknown ${scenario.label}`,
      idempotencyKey: `guard-${RUN_ID}-${scenario.label}-unknown`
    }),
    ["refund_unknown"]
  );
  refundMode = "completed";
  assert(!result.ok, `${scenario.label}: network failure did not leave an unknown outcome`);
}

async function makeConfirmed(
  prisma: PrismaClient,
  scenario: Scenario,
  amountKobo: bigint
) {
  const claimed = await makeReserved(scenario, amountKobo);
  const { recordRefundLifecycle, REFUND_LIFECYCLE_EVENT } = await import("../lib/payments/refund-lifecycle");
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${scenario.orderId} FOR UPDATE`;
    await recordRefundLifecycle(tx, {
      refundId: claimed.refundId,
      actorId: ADMIN_ID,
      payload: {
        state: "confirmed",
        provider: "paystack",
        providerReference: `TEST-CONFIRMED-${RUN_ID}-${scenario.label}`,
        providerStatus: "COMPLETED",
        amountKobo: amountKobo.toString(),
        note: "Reservation guard fixture: provider-confirmed but not settled"
      }
    });
  });
  const lifecycle = await prisma.systemEvent.count({
    where: { type: REFUND_LIFECYCLE_EVENT, entity: "Refund", entityId: claimed.refundId }
  });
  assert(lifecycle >= 2, `${scenario.label}: confirmed lifecycle was not recorded`);
  return claimed;
}

async function makeFailed(scenario: Scenario) {
  const { refundPayment } = await import("../lib/payments/service");
  refundMode = "rejected";
  const result = await expectBlocked(
    `${scenario.label}: a definitive provider rejection releases the reservation`,
    refundPayment({
      orderId: scenario.orderId,
      actorId: ADMIN_ID,
      reason: `Reservation guard rejected ${scenario.label}`,
      idempotencyKey: `guard-${RUN_ID}-${scenario.label}-rejected`
    }),
    ["refund_failed"]
  );
  refundMode = "completed";
  assert(!result.ok, `${scenario.label}: provider rejection did not fail the refund`);
}

async function releaseClaim(scenario: Scenario, refundId: string) {
  const { reconcileExternalRefundOutcome } = await import("../lib/payments/service");
  const result = await expectSuccess(
    `${scenario.label}: operator releases the unconfirmed reservation`,
    reconcileExternalRefundOutcome({
      refundId,
      actorId: ADMIN_ID,
      outcome: "failed",
      note: "Reservation guard acceptance: provider never processed it."
    })
  );
  assert(result.ok, `${scenario.label}: reservation release failed`);
}

async function settleConfirmed(scenario: Scenario, refundId: string) {
  const { settleConfirmedExternalRefund } = await import("../lib/payments/service");
  const result = await expectSuccess(
    `${scenario.label}: provider-confirmed refund settles locally`,
    settleConfirmedExternalRefund({
      refundId,
      actorId: ADMIN_ID,
      reason: `Reservation guard settle ${scenario.label}`
    })
  );
  assert(result.ok, `${scenario.label}: confirmed refund did not settle`);
}

/* ------------------------------------------------------------- accounting --- */

async function assertReleaseAccounting(
  prisma: PrismaClient,
  scenario: Scenario,
  before: Snapshot,
  release: { totalReleasedKobo: string; vendorProceedsKobo: string; platformShareKobo: string },
  stage: string
) {
  const after = await snapshot(prisma, scenario);
  const total = BigInt(release.totalReleasedKobo);
  const vendorProceeds = BigInt(release.vendorProceedsKobo);
  const platformShare = BigInt(release.platformShareKobo);
  const holderBefore = scenario.escrowBuyer === "SYSTEM" ? before.system : before.buyer;
  const holderAfter = scenario.escrowBuyer === "SYSTEM" ? after.system : after.buyer;
  record(
    `${stage}: the escrow buyer's held balance falls by the full release`,
    BigInt(holderBefore.held) - BigInt(holderAfter.held) === total,
    `${scenario.escrowBuyer} held ${holderBefore.held} -> ${holderAfter.held}, total ${total}`
  );
  record(
    `${stage}: the customer's spendable wallet is untouched by an external escrow release`,
    scenario.escrowBuyer === "SYSTEM"
      ? BigInt(before.buyer.available) === BigInt(after.buyer.available) &&
          BigInt(before.buyer.held) === BigInt(after.buyer.held)
      : BigInt(before.buyer.available) === BigInt(after.buyer.available),
    `customer ${before.buyer.available}/${before.buyer.held} -> ${after.buyer.available}/${after.buyer.held}`
  );
  record(
    `${stage}: vendor held falls by the full release and payable is credited exactly`,
    BigInt(before.vendor.held) - BigInt(after.vendor.held) === total &&
      BigInt(after.vendor.available) - BigInt(before.vendor.available) === vendorProceeds,
    `held ${before.vendor.held} -> ${after.vendor.held}, available ${before.vendor.available} -> ${after.vendor.available}, proceeds ${vendorProceeds}`
  );
  record(
    `${stage}: platform receives exactly its remaining share`,
    BigInt(after.system.available) - BigInt(before.system.available) === platformShare,
    `SYSTEM available ${before.system.available} -> ${after.system.available}, share ${platformShare}`
  );
  const transactions = await prisma.walletTransaction.findMany({
    where: { orderId: scenario.orderId },
    include: { ledger: true }
  });
  const unbalanced = transactions.filter((transaction) => {
    const debit = transaction.ledger
      .filter((leg) => leg.direction === "DEBIT")
      .reduce((sum, leg) => sum + leg.amountKobo, 0n);
    const credit = transaction.ledger
      .filter((leg) => leg.direction === "CREDIT")
      .reduce((sum, leg) => sum + leg.amountKobo, 0n);
    return debit !== credit;
  });
  record(
    `${stage}: every journal for the order balances`,
    unbalanced.length === 0,
    unbalanced.length === 0 ? `${transactions.length} transactions balanced` : unbalanced.map((row) => row.reference).join(", ")
  );
}

/* ------------------------------------------------------------------ cases --- */

async function blockedStateCase(
  prisma: PrismaClient,
  label: string,
  makeState: (scenario: Scenario) => Promise<{ refundId: string; amountKobo: bigint }>,
  settle: "release" | "settle",
  expectedTotal: (amountKobo: bigint) => bigint
) {
  const scenario = await createExternalOrder(prisma, label);
  await deliver(prisma, scenario);
  const state = await makeState(scenario);
  const before = await snapshot(prisma, scenario);
  const { getOrder } = await import("../lib/services/core/order.service");
  const detail = await getOrder(scenario.orderId);
  record(
    `${label}: the order API separates claimed from pending and settled refunds`,
    detail.refundSummary.claimedKobo === state.amountKobo.toString() &&
      detail.refundSummary.pendingClaimKobo === state.amountKobo.toString() &&
      detail.refundSummary.settledKobo === "0" &&
      detail.refundSummary.hasPendingClaims,
    `summary ${JSON.stringify(detail.refundSummary)}`
  );

  await expectBlocked(
    `${label}: completion is refused while the refund obligation exists`,
    (async () => {
      const { completeOrder } = await import("../lib/services/core/order.service");
      return completeOrder(scenario.userId, scenario.orderId);
    })(),
    ["refund_pending", "refund_state_conflict", "refund_reservation_unreconciled"]
  );
  await expectSuccess(
    `${label}: opening a dispute remains possible without moving money`,
    (async () => {
      const { openDispute } = await import("../lib/services/core/dispute.service");
      return openDispute({ actorId: ADMIN_ID, orderId: scenario.orderId, reason: `${label} dispute` });
    })()
  );
  await expectBlocked(
    `${label}: dispute release is refused while the same obligation exists`,
    (async () => {
      const { resolveDispute } = await import("../lib/services/core/dispute.service");
      return resolveDispute({ adminId: ADMIN_ID, disputeId: (await prisma.dispute.findFirstOrThrow({ where: { orderId: scenario.orderId } })).id, decision: "release" });
    })(),
    ["refund_pending", "refund_state_conflict", "refund_reservation_unreconciled"]
  );
  const stillBlocked = await snapshot(prisma, scenario);
  record(
    `${label}: both refused operations moved no money`,
    sameSnapshot(before, stillBlocked),
    `${snapshotText(before)} -> ${snapshotText(stillBlocked)}`
  );

  if (settle === "release") await releaseClaim(scenario, state.refundId);
  else await settleConfirmed(scenario, state.refundId);
  // A confirmed settlement moves buyer/vendor held balances before the release,
  // so accounting must be measured from that post-settlement position.
  const beforeRelease = settle === "settle" ? await snapshot(prisma, scenario) : before;

  const release = await outcome(
    (async () => {
      const { resolveDispute } = await import("../lib/services/core/dispute.service");
      const dispute = await prisma.dispute.findFirstOrThrow({ where: { orderId: scenario.orderId } });
      return resolveDispute({ adminId: ADMIN_ID, disputeId: dispute.id, decision: "release" });
    })()
  );
  record(`${label}: release succeeds after the claim is resolved`, release.ok, release.ok ? "success" : `${release.code}: ${release.message}`);
  if (!release.ok) return;
  const value = release.value as { totalReleasedKobo: string; vendorProceedsKobo: string; platformShareKobo: string };
  record(
    `${label}: release pays exactly the remaining obligation`,
    BigInt(value.totalReleasedKobo) === expectedTotal(state.amountKobo),
    `released ${value.totalReleasedKobo}, expected ${expectedTotal(state.amountKobo)}`
  );
  await assertReleaseAccounting(prisma, scenario, beforeRelease, value, `${label} after release`);
}

async function failedClaimCase(prisma: PrismaClient) {
  const scenario = await createExternalOrder(prisma, "failed-completion");
  await deliver(prisma, scenario);
  await makeFailed(scenario);
  const before = await snapshot(prisma, scenario);
  const { getOrder } = await import("../lib/services/core/order.service");
  const detail = await getOrder(scenario.orderId);
  record(
    "a failed claim is reported as failed, not as settled or claimed",
    detail.refundSummary.failedClaimKobo === TOTAL_KOBO.toString() &&
      detail.refundSummary.settledKobo === "0" &&
      detail.refundSummary.claimedKobo === "0" &&
      !detail.refundSummary.hasPendingClaims,
    `summary ${JSON.stringify(detail.refundSummary)}`
  );
  const completion = await expectSuccess(
    "a definitively failed claim does not block completion",
    (async () => {
      const { completeOrder } = await import("../lib/services/core/order.service");
      return completeOrder(scenario.userId, scenario.orderId);
    })()
  );
  if (completion.ok) {
    const value = completion.value as { totalReleasedKobo: string; vendorProceedsKobo: string; platformShareKobo: string };
    record(
      "a failed claim is not subtracted from the escrow obligation",
      BigInt(value.totalReleasedKobo) === TOTAL_KOBO,
      `released ${value.totalReleasedKobo}, expected ${TOTAL_KOBO}`
    );
    await assertReleaseAccounting(prisma, scenario, before, value, "failed claim completion");
  }

  const disputeScenario = await createExternalOrder(prisma, "failed-dispute");
  await deliver(prisma, disputeScenario);
  await makeFailed(disputeScenario);
  await expectSuccess(
    "a definitively failed claim does not block opening a dispute",
    (async () => {
      const { openDispute } = await import("../lib/services/core/dispute.service");
      return openDispute({ actorId: ADMIN_ID, orderId: disputeScenario.orderId, reason: "failed claim dispute" });
    })()
  );
  const beforeRelease = await snapshot(prisma, disputeScenario);
  const release = await expectSuccess(
    "a definitively failed claim does not block dispute release",
    (async () => {
      const { resolveDispute } = await import("../lib/services/core/dispute.service");
      const dispute = await prisma.dispute.findFirstOrThrow({ where: { orderId: disputeScenario.orderId } });
      return resolveDispute({ adminId: ADMIN_ID, disputeId: dispute.id, decision: "release" });
    })()
  );
  if (release.ok) {
    const value = release.value as { totalReleasedKobo: string; vendorProceedsKobo: string; platformShareKobo: string };
    record(
      "a failed claim does not reduce the dispute release",
      BigInt(value.totalReleasedKobo) === TOTAL_KOBO,
      `released ${value.totalReleasedKobo}, expected ${TOTAL_KOBO}`
    );
    await assertReleaseAccounting(prisma, disputeScenario, beforeRelease, value, "failed claim dispute release");
  }
}

async function lostReservationCase(prisma: PrismaClient) {
  const scenario = await createExternalOrder(prisma, "lost-reservation");
  await deliver(prisma, scenario);
  const before = await snapshot(prisma, scenario);
  await prisma.order.update({ where: { id: scenario.orderId }, data: { refundedKobo: PARTIAL_KOBO } });
  await expectBlocked(
    "lost reservation: completion is refused when refundedKobo has no refund row",
    (async () => {
      const { completeOrder } = await import("../lib/services/core/order.service");
      return completeOrder(scenario.userId, scenario.orderId);
    })(),
    ["refund_reservation_unreconciled"]
  );
  await expectSuccess(
    "lost reservation: a dispute can still be opened without moving money",
    (async () => {
      const { openDispute } = await import("../lib/services/core/dispute.service");
      return openDispute({ actorId: ADMIN_ID, orderId: scenario.orderId, reason: "lost reservation dispute" });
    })()
  );
  await expectBlocked(
    "lost reservation: dispute release is refused",
    (async () => {
      const { resolveDispute } = await import("../lib/services/core/dispute.service");
      const dispute = await prisma.dispute.findFirstOrThrow({ where: { orderId: scenario.orderId } });
      return resolveDispute({ adminId: ADMIN_ID, disputeId: dispute.id, decision: "release" });
    })(),
    ["refund_reservation_unreconciled"]
  );
  record(
    "lost reservation: refused operations moved no money",
    sameSnapshot(before, await snapshot(prisma, scenario)),
    `${snapshotText(before)} -> ${snapshotText(await snapshot(prisma, scenario))}`
  );
  await prisma.order.update({ where: { id: scenario.orderId }, data: { refundedKobo: 0n } });
  const release = await expectSuccess(
    "lost reservation: release succeeds after the projection is reconciled",
    (async () => {
      const { resolveDispute } = await import("../lib/services/core/dispute.service");
      const dispute = await prisma.dispute.findFirstOrThrow({ where: { orderId: scenario.orderId } });
      return resolveDispute({ adminId: ADMIN_ID, disputeId: dispute.id, decision: "release" });
    })()
  );
  if (release.ok) {
    await assertReleaseAccounting(
      prisma,
      scenario,
      before,
      release.value as { totalReleasedKobo: string; vendorProceedsKobo: string; platformShareKobo: string },
      "lost reservation after reconciliation"
    );
  }
}

async function excessSettlementCase(prisma: PrismaClient) {
  const scenario = await createExternalOrder(prisma, "excess-settlement");
  await deliver(prisma, scenario);
  const { refundPayment } = await import("../lib/payments/service");
  refundMode = "completed";
  const refund = await expectSuccess(
    "excess settlement fixture: a partial refund settles",
    refundPayment({
      orderId: scenario.orderId,
      actorId: ADMIN_ID,
      reason: "Excess settlement fixture partial refund",
      amountKobo: PARTIAL_KOBO,
      idempotencyKey: `guard-${RUN_ID}-excess-settlement`
    })
  );
  assert(refund.ok, "excess settlement fixture refund failed");
  const before = await snapshot(prisma, scenario);
  // Simulate a projection damaged after settlement: the completed row remains,
  // the order's claim cap no longer covers it.
  await prisma.order.update({ where: { id: scenario.orderId }, data: { refundedKobo: 0n } });
  await expectBlocked(
    "excess settlement: completion is refused when settled refunds exceed refundedKobo",
    (async () => {
      const { completeOrder } = await import("../lib/services/core/order.service");
      return completeOrder(scenario.userId, scenario.orderId);
    })(),
    ["refund_reservation_unreconciled"]
  );
  await prisma.order.update({ where: { id: scenario.orderId }, data: { refundedKobo: PARTIAL_KOBO } });
  const release = await expectSuccess(
    "excess settlement: completion succeeds after the cap is restored",
    (async () => {
      const { completeOrder } = await import("../lib/services/core/order.service");
      return completeOrder(scenario.userId, scenario.orderId);
    })()
  );
  if (release.ok) {
    const value = release.value as { totalReleasedKobo: string; vendorProceedsKobo: string; platformShareKobo: string };
    record(
      "excess settlement: release pays only the unrefunded obligation",
      BigInt(value.totalReleasedKobo) === TOTAL_KOBO - PARTIAL_KOBO,
      `released ${value.totalReleasedKobo}, expected ${TOTAL_KOBO - PARTIAL_KOBO}`
    );
    await assertReleaseAccounting(prisma, scenario, before, value, "excess settlement after repair");
  }
}

async function fundingSourceCase(prisma: PrismaClient) {
  const scenario = await createExternalOrder(prisma, "funding-source");
  await deliver(prisma, scenario);
  const before = await snapshot(prisma, scenario);
  const escrow = await prisma.escrowHold.findFirstOrThrow({ where: { orderId: scenario.orderId } });
  // Materialise the legacy incident shape: an external hold funded by SYSTEM
  // while the escrow names the customer as buyer of record.
  await prisma.escrowHold.update({ where: { id: escrow.id }, data: { buyerWalletId: scenario.buyerWalletId } });
  const { refundPayment, reserveExternalRefundClaim } = await import("../lib/payments/service");
  const refundsBefore = await prisma.refund.count();
  await expectBlocked(
    "funding source: a legacy mismatched escrow refuses to reserve a refund",
    reserveExternalRefundClaim({
      orderId: scenario.orderId,
      actorId: ADMIN_ID,
      reason: "Funding source mismatch fixture",
      idempotencyKey: `guard-${RUN_ID}-funding-source-reserve`
    }),
    ["refund_funding_source_mismatch"]
  );
  await expectBlocked(
    "funding source: a legacy mismatched escrow refuses to contact the provider",
    refundPayment({
      orderId: scenario.orderId,
      actorId: ADMIN_ID,
      reason: "Funding source mismatch fixture",
      idempotencyKey: `guard-${RUN_ID}-funding-source-pay`
    }),
    ["refund_funding_source_mismatch"]
  );
  const orderAfter = await prisma.order.findUniqueOrThrow({ where: { id: scenario.orderId } });
  record(
    "funding source: a refused refund creates no claim and moves no money",
    (await prisma.refund.count()) === refundsBefore &&
      orderAfter.refundedKobo === 0n &&
      sameSnapshot(before, await snapshot(prisma, scenario)),
    `refunds ${refundsBefore}, refundedKobo ${orderAfter.refundedKobo}`
  );
  await prisma.escrowHold.update({ where: { id: escrow.id }, data: { buyerWalletId: escrow.buyerWalletId } });
  const restored = await expectSuccess(
    "funding source: the refund works after the escrow buyer of record is corrected",
    refundPayment({
      orderId: scenario.orderId,
      actorId: ADMIN_ID,
      reason: "Funding source corrected fixture",
      amountKobo: PARTIAL_KOBO,
      idempotencyKey: `guard-${RUN_ID}-funding-source-corrected`
    })
  );
  record(
    "funding source: the corrected refund posts against SYSTEM, not the customer",
    restored.ok &&
      (await prisma.wallet.findUniqueOrThrow({ where: { id: scenario.buyerWalletId } })).availableKobo === BigInt(before.buyer.available) &&
      (await prisma.wallet.findUniqueOrThrow({ where: { id: scenario.systemWalletId } })).availableKobo > BigInt(before.system.available),
    `buyer available ${before.buyer.available} -> ${(await prisma.wallet.findUniqueOrThrow({ where: { id: scenario.buyerWalletId } })).availableKobo}`
  );
}

async function concurrentCompletionCase(prisma: PrismaClient) {
  const scenario = await createExternalOrder(prisma, "concurrent-guard");
  await deliver(prisma, scenario);
  const claim = await makeReserved(scenario);
  const { PrismaClient } = await import("@prisma/client");
  const second = new PrismaClient({ datasources: { db: { url: DB_URL } }, log: [] });
  const before = await snapshot(prisma, scenario);
  try {
    const { completeOrder } = await import("../lib/services/core/order.service");
    const [first, other] = await Promise.all([
      outcome(completeOrder(scenario.userId, scenario.orderId)),
      outcome(new Promise((resolve, reject) => {
        second.$transaction(async (tx) => {
          const locked = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM "Order" WHERE id = ${scenario.orderId} FOR UPDATE
          `;
          if (locked.length === 0) throw new Error("order disappeared");
          return resolve({ locked: true });
        }).catch(reject);
      }))
    ]);
    record(
      "two independent connections cannot release past a reserved claim",
      !first.ok && first.code === "refund_pending",
      first.ok ? "first completion unexpectedly succeeded" : `${first.code}: ${first.message}`
    );
    record(
      "the second connection observes the same order row lock",
      other.ok,
      other.ok ? "row lock acquired after the guard transaction" : other.code
    );
    record(
      "concurrent completion attempts moved no money",
      sameSnapshot(before, await snapshot(prisma, scenario)),
      `${snapshotText(before)} -> ${snapshotText(await snapshot(prisma, scenario))}`
    );
  } finally {
    await second.$disconnect();
  }
  await releaseClaim(scenario, claim.refundId);
  const release = await expectSuccess(
    "concurrent guard: completion succeeds after the claim is released",
    (async () => {
      const { completeOrder } = await import("../lib/services/core/order.service");
      return completeOrder(scenario.userId, scenario.orderId);
    })()
  );
  if (release.ok) {
    await assertReleaseAccounting(
      prisma,
      scenario,
      before,
      release.value as { totalReleasedKobo: string; vendorProceedsKobo: string; platformShareKobo: string },
      "concurrent guard after release"
    );
  }
}

/* ------------------------------------------------------------------ main --- */

async function main(prisma: PrismaClient, url: string) {
  const current = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  assert(current[0]?.db === DB, `wrong database ${current[0]?.db ?? "unknown"}, expected ${DB}`);
  assert((await prisma.order.count()) === 0, "the isolated database is not empty; reset it before running this suite");
  assert((await prisma.refund.count()) === 0, "the isolated database has refund rows; reset it before running this suite");
  await ensureCity(prisma);

  const admin = await prisma.user.create({
    data: { email: `guard-${RUN_ID}-admin@example.test`, name: "Reservation guard admin", actorType: "ADMIN" }
  });
  ADMIN_ID = admin.id;
  process.env.DISPUTE_RELEASE_ENABLED = "true";

  await blockedStateCase(
    prisma,
    "reserved",
    async (scenario) => {
      const claim = await makeReserved(scenario);
      return { refundId: claim.refundId, amountKobo: claim.requestedKobo };
    },
    "release",
    () => TOTAL_KOBO
  );

  await blockedStateCase(
    prisma,
    "submitted-acknowledged",
    async (scenario) => {
      await makeSubmittedAcknowledged(scenario);
      const refund = await prisma.refund.findFirstOrThrow({ where: { orderId: scenario.orderId }, orderBy: { createdAt: "desc" } });
      return { refundId: refund.id, amountKobo: refund.amountKobo };
    },
    "release",
    () => TOTAL_KOBO
  );

  await blockedStateCase(
    prisma,
    "unknown",
    async (scenario) => {
      await makeUnknown(scenario);
      const refund = await prisma.refund.findFirstOrThrow({ where: { orderId: scenario.orderId }, orderBy: { createdAt: "desc" } });
      return { refundId: refund.id, amountKobo: refund.amountKobo };
    },
    "release",
    () => TOTAL_KOBO
  );

  await blockedStateCase(
    prisma,
    "confirmed-unsettled",
    async (scenario) => {
      const claim = await makeConfirmed(prisma, scenario, PARTIAL_KOBO);
      return { refundId: claim.refundId, amountKobo: PARTIAL_KOBO };
    },
    "settle",
    (amount) => TOTAL_KOBO - amount
  );

  await failedClaimCase(prisma);
  await lostReservationCase(prisma);
  await excessSettlementCase(prisma);
  await fundingSourceCase(prisma);
  await concurrentCompletionCase(prisma);

  const { reconcile } = await import("../lib/services/core/reconciliation-correct");
  const book = await reconcile();
  record(
    "whole-book reconciliation is CLEAN after every claim is resolved",
    book.status === "CLEAN" && book.issues.length === 0 && book.totals.differenceKobo === "0",
    `status ${book.status}, issues ${book.issues.length}, difference ${book.totals.differenceKobo}, pending ${book.refunds.pendingObligationCount}, discrepancies ${book.refunds.discrepancyCount}`
  );

  console.log(
    JSON.stringify(
      {
        runId: RUN_ID,
        database: DB,
        checks,
        failures,
        providerRefundCalls,
        reconciliation: {
          status: book.status,
          issues: book.issues.length,
          totals: book.totals,
          refunds: {
            status: book.refunds.status,
            pendingObligationCount: book.refunds.pendingObligationCount,
            discrepancyCount: book.refunds.discrepancyCount
          }
        },
        status: failures === 0 ? "PASS" : "FAIL"
      },
      (key, value) => (typeof value === "bigint" ? value.toString() : value),
      2
    )
  );
  if (failures > 0) process.exitCode = 1;
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
  try {
    await main(prisma, DB_URL);
  } finally {
    await prisma.$disconnect();
  }
}

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
