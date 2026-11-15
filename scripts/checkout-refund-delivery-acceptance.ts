/**
 * Checkout concurrency and refund/delivery cancellation acceptance.
 *
 * Verifies two independent P1/P2 findings on the real business services:
 *
 *  1. Two simultaneous checkouts of one cart produce exactly one order set and
 *     one reservation. A 10-request burst has no 500s, and a retry of a claimed
 *     cart returns a coherent 409 rather than creating another order.
 *  2. A full refund (wallet or local test provider) and a paid-order customer
 *     cancellation cancel any open delivery in the same transaction, so it
 *     leaves the courier queue and tracking shows `cancelled`. A partial refund
 *     leaves the active delivery alone. Cancellation racing courier assignment
 *     always ends in a cancelled delivery.
 *
 * Evidence includes balanced journals per order transaction, wallet-position
 * conservation, refund totals, and a reconciliation run scoped to the dedicated
 * database.
 *
 * Database safety: requires an explicit TEST_DATABASE_URL/NAIJADEALS_TEST_
 * DATABASE_URL named exactly `naijadeals_checkout_refund_test` and marked TEST.
 * `naijadeals_core` is denied by the guard. The local test provider is the only
 * external provider used; no live charge, payout or network provider call is
 * involved.
 *
 * Usage (the URL is supplied by the operator, never committed):
 *   TEST_DATABASE_URL=... npx tsx scripts/checkout-refund-delivery-acceptance.ts
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { requireTestDatabase, type VerifiedTestDatabase } from "./lib/test-db-guard";
import { cleanupCheckoutRefundFixtures } from "./lib/checkout-refund-fixture-cleanup";
import type { PrismaClient } from "@prisma/client";

const EXPECTED_DATABASE = "naijadeals_checkout_refund_test";
const RUN_ID = `${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${randomBytes(4).toString("hex")}`;
const PRICE_KOBO = BigInt(300_000);
const DELIVERY_FEE_KOBO = BigInt(150_000);
const ESCROW_FEE_KOBO = BigInt(3_000);
const ORDER_TOTAL_KOBO = PRICE_KOBO + DELIVERY_FEE_KOBO + ESCROW_FEE_KOBO;
const TOP_UP_KOBO = BigInt(1_000_000);

type Check = { name: string; status: "PASS" | "FAIL"; detail: string };
const checks: Check[] = [];
let failures = 0;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// This suite exercises financial services directly, not the optional queue
// worker. An unreachable local Valkey must not hang refunds; the durable
// notification row remains the source of truth.
process.env.VALKEY_URL = "";
delete process.env.REDIS_URL;

const CHECK_TIMEOUT_MS = Number(process.env.CHECKOUT_ACCEPTANCE_CHECK_TIMEOUT_MS ?? 120_000);
const OVERALL_TIMEOUT_MS = Number(process.env.CHECKOUT_ACCEPTANCE_TIMEOUT_MS ?? 15 * 60_000);

function bounded<T>(promise: Promise<T>, label: string, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms);
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

async function check(name: string, fn: () => Promise<string>) {
  const started = Date.now();
  console.log(`START ${name}`);
  try {
    const detail = await bounded(fn(), name, CHECK_TIMEOUT_MS);
    checks.push({ name, status: "PASS", detail });
    console.log(`PASS ${name} (${Date.now() - started}ms) — ${detail}`);
  } catch (error) {
    failures += 1;
    const detail = (error instanceof Error ? error.message : String(error)).slice(0, 700);
    checks.push({ name, status: "FAIL", detail });
    console.error(`FAIL ${name} (${Date.now() - started}ms) — ${detail}`);
  }
}

const address = {
  contactName: "Acceptance Fixture",
  contactPhone: "08030000000",
  countryCode: "NG",
  state: "Lagos",
  city: "Lagos",
  line1: "1 Isolated Acceptance Way"
};

type Fixture = {
  label: string;
  userId: string;
  vendorOwnerId: string;
  vendorId: string;
  categoryId: string;
  productId: string;
  cartId: string;
  originalQuantity: number;
};

type PaidOrder = {
  orderId: string;
  orderNumber: string;
  totalKobo: bigint;
  reference: string;
};

function errorShape(error: unknown): { status: number; code: string; message: string } {
  const typed = error as { status?: unknown; code?: unknown; message?: unknown };
  return {
    status: typeof typed?.status === "number" ? typed.status : 0,
    code: typeof typed?.code === "string" ? typed.code : "unknown",
    message: typeof typed?.message === "string" ? typed.message : String(error)
  };
}

async function createUser(db: PrismaClient, label: string, actorType: "CUSTOMER" | "ADMIN" | "COURIER" | "VENDOR" = "CUSTOMER") {
  return db.user.create({
    data: {
      email: `crf-${RUN_ID}-${label}@example.test`.toLowerCase(),
      name: `Checkout refund fixture ${label}`,
      actorType,
      ...(actorType === "COURIER" ? { verifiedAt: new Date() } : {})
    }
  });
}

async function createFixture(db: PrismaClient, label: string, quantity = 5): Promise<Fixture> {
  const user = await createUser(db, `${label}-buyer`, "CUSTOMER");
  const vendorOwner = await createUser(db, `${label}-owner`, "VENDOR");
  const vendor = await db.vendor.create({
    data: {
      ownerId: vendorOwner.id,
      name: `Checkout refund vendor ${RUN_ID} ${label}`,
      slug: `crf-vendor-${RUN_ID}-${label}`.toLowerCase(),
      market: "Isolated acceptance fixture market",
      description: "Isolated checkout/refund fixture. Not a real vendor.",
      pickupAddress: "1 Isolated Acceptance Way, Lagos",
      pickupPhone: "+2348000000000",
      status: "VERIFIED",
      commissionBps: 1000
    }
  });
  const category = await db.category.create({
    data: { name: `CRF category ${RUN_ID} ${label}`, slug: `crf-category-${RUN_ID}-${label}`.toLowerCase() }
  });
  const product = await db.product.create({
    data: {
      vendorId: vendor.id,
      categoryId: category.id,
      name: `CRF product ${RUN_ID} ${label}`,
      slug: `crf-product-${RUN_ID}-${label}`.toLowerCase(),
      description: "Isolated checkout/refund fixture product.",
      priceKobo: PRICE_KOBO,
      status: "ACTIVE",
      isSample: false,
      stock: { create: { quantity, reserved: 0 } }
    }
  });
  const cart = await db.cart.create({
    data: { userId: user.id, status: "ACTIVE", items: { create: { productId: product.id, quantity: 1 } } }
  });
  return {
    label,
    userId: user.id,
    vendorOwnerId: vendorOwner.id,
    vendorId: vendor.id,
    categoryId: category.id,
    productId: product.id,
    cartId: cart.id,
    originalQuantity: quantity
  };
}

async function fundWallet(db: PrismaClient, fixture: Fixture) {
  const { ensureWallet } = await import("../lib/payments/service");
  const { createTopUp, creditTopUp } = await import("../lib/services/core/topup.service");
  const wallet = await ensureWallet(db, { userId: fixture.userId, ownerType: "CUSTOMER" });
  const key = `crf-${RUN_ID}-${fixture.label}`.toLowerCase();
  const reference = `TEST-${key}`;
  await createTopUp(db, {
    walletId: wallet.id,
    amountKobo: TOP_UP_KOBO,
    provider: "test",
    providerReference: reference,
    idempotencyKey: key
  });
  const credited = await creditTopUp(db, {
    providerReference: reference,
    verifiedAmountKobo: TOP_UP_KOBO,
    verifiedCurrency: "NGN",
    raw: { simulated: true, note: "Checkout/refund acceptance fixture funding. Not a real payment." }
  });
  assert(credited.status === "credited", `top-up was not credited (${credited.status})`);
  return wallet;
}

async function runCheckout(fixture: Fixture) {
  const { checkout } = await import("../lib/services/core/checkout.service");
  return checkout({ userId: fixture.userId, address });
}

async function payOrder(db: PrismaClient, input: { fixture: Fixture; order: { orderId: string; totalKobo: string }; provider: "wallet" | "test" }): Promise<PaidOrder> {
  const { initializePayment, confirmPayment } = await import("../lib/payments/service");
  const init = await initializePayment({
    orderId: input.order.orderId,
    userId: input.fixture.userId,
    provider: input.provider,
    callbackUrl: "http://localhost/orders/callback"
  });
  const confirmed = await confirmPayment({ reference: init.reference, provider: input.provider });
  assert(confirmed.status === "COMPLETED", `payment did not complete for ${input.order.orderId}`);
  const order = await db.order.findUniqueOrThrow({ where: { id: input.order.orderId } });
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    totalKobo: order.totalKobo,
    reference: init.reference
  };
}

async function assertOrderTransactionsBalanced(db: PrismaClient, orderId: string, context: string) {
  const transactions = await db.walletTransaction.findMany({
    where: { orderId },
    include: { ledger: true },
    orderBy: { createdAt: "asc" }
  });
  assert(transactions.length > 0, `${context}: no wallet transactions for order ${orderId}`);
  let net = BigInt(0);
  for (const transaction of transactions) {
    assert(transaction.ledger.length >= 2, `${context}: transaction ${transaction.reference} has ${transaction.ledger.length} legs`);
    const debit = transaction.ledger
      .filter((entry) => entry.direction === "DEBIT")
      .reduce((sum, entry) => sum + entry.amountKobo, BigInt(0));
    const credit = transaction.ledger
      .filter((entry) => entry.direction === "CREDIT")
      .reduce((sum, entry) => sum + entry.amountKobo, BigInt(0));
    assert(debit > BigInt(0), `${context}: ${transaction.reference} has no debit leg`);
    assert(debit === credit, `${context}: ${transaction.reference} is unbalanced ${debit} vs ${credit}`);
    net += credit - debit;
  }
  assert(net === BigInt(0), `${context}: order journal net ${net} is not zero`);
  return `${transactions.length} balanced transactions`;
}

async function walletSnapshots(db: PrismaClient, walletId: string) {
  const wallet = await db.wallet.findUniqueOrThrow({
    where: { id: walletId },
    select: { availableKobo: true, heldKobo: true }
  });
  return { available: wallet.availableKobo, held: wallet.heldKobo };
}

async function vendorWallet(db: PrismaClient, vendorId: string) {
  const wallet = await db.wallet.findFirstOrThrow({
    where: { vendorId, ownerType: "VENDOR" },
    select: { id: true, availableKobo: true, heldKobo: true }
  });
  return { id: wallet.id, available: wallet.availableKobo, held: wallet.heldKobo };
}

async function platformWallet(db: PrismaClient) {
  const wallet = await db.wallet.findFirstOrThrow({
    where: { ownerType: "SYSTEM" },
    select: { id: true, availableKobo: true, heldKobo: true }
  });
  return { id: wallet.id, available: wallet.availableKobo, held: wallet.heldKobo };
}

async function deliveryState(db: PrismaClient, orderId: string) {
  return db.delivery.findFirst({
    where: { orderId },
    include: { trackingEvents: { orderBy: { createdAt: "asc" } } }
  });
}

async function transitionToReady(db: PrismaClient, orderId: string, actorId: string) {
  const { updateOrderStatus } = await import("../lib/services/core/order.service");
  await db.$transaction(async (tx) => {
    for (const status of ["accepted", "preparing", "ready_for_pickup"] as const) {
      await updateOrderStatus({ tx, actorId, orderId, status, note: "Acceptance fixture preparation." });
    }
  });
}

async function main() {
  const target: VerifiedTestDatabase = await requireTestDatabase();
  assert(
    target.databaseName === EXPECTED_DATABASE,
    `Refusing to run on ${target.databaseName}; expected the dedicated ${EXPECTED_DATABASE}`
  );
  assert(process.env.ENABLE_TEST_PAYMENTS === "true", "ENABLE_TEST_PAYMENTS is required for local test-provider fixtures.");
  const watchdog = setTimeout(() => {
    console.error(`FATAL checkout acceptance exceeded ${OVERALL_TIMEOUT_MS}ms; last started stage is in the log.`);
    process.exit(124);
  }, OVERALL_TIMEOUT_MS);
  watchdog.unref();

  // Keep the acceptance pool small so concurrent checkouts exercise the
  // application's conflict mapping instead of exhausting PostgreSQL's
  // max_connections on a developer machine.
  const testUrl = new URL(target.url);
  if (!testUrl.searchParams.has("connection_limit")) testUrl.searchParams.set("connection_limit", "5");
  process.env.DATABASE_URL = testUrl.toString();

  const { prisma } = await import("../lib/prisma");
  const { refundPayment, ensureWallet } = await import("../lib/payments/service");
  const { cancelOrder } = await import("../lib/services/core/checkout.service");
  const { assignCourier } = await import("../lib/services/core/admin.service");
  const { reconcile } = await import("../lib/services/core/reconciliation-correct");

  try {
    const identity = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
    assert(identity[0]?.db === EXPECTED_DATABASE, `connected database ${identity[0]?.db} does not match the guard target`);

    // These suites deliberately open many concurrent auth/checkout services.
    // A small pool proves the stable-conflict path instead of exhausting the
    // local server's max_connections (the sold-out race is the point, not a
    // connection flood).
    await ensureWallet(prisma, { ownerType: "SYSTEM" });

    const concurrency = await createFixture(prisma, "concurrent", 5);
    const burst = await createFixture(prisma, "burst", 5);

    await check("1. Two concurrent checkouts create one order set and one reservation", async () => {
      const results = await Promise.allSettled([runCheckout(concurrency), runCheckout(concurrency)]);
      const wins = results.filter((result) => result.status === "fulfilled");
      const losses = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
      assert(wins.length === 1, `expected exactly one successful checkout, got ${wins.length}`);
      assert(losses.length === 1, `expected exactly one rejected checkout, got ${losses.length}`);
      const loss = errorShape(losses[0].reason);
      assert(loss.status === 409, `loser status was ${loss.status} (${loss.code}), expected 409`);
      assert(
        ["checkout_already_completed", "checkout_conflict"].includes(loss.code),
        `loser code was ${loss.code}`
      );

      const cart = await prisma.cart.findUniqueOrThrow({ where: { id: concurrency.cartId } });
      const orders = await prisma.order.findMany({
        where: { cartId: concurrency.cartId },
        include: { items: true }
      });
      const stock = await prisma.inventoryStock.findUniqueOrThrow({ where: { productId: concurrency.productId } });
      assert(cart.status === "CHECKED_OUT", `cart status is ${cart.status}`);
      assert(orders.length === 1, `cart produced ${orders.length} orders`);
      assert(orders[0].items.length === 1, `order has ${orders[0].items.length} item lines`);
      assert(orders[0].totalKobo === ORDER_TOTAL_KOBO, `order total ${orders[0].totalKobo} != ${ORDER_TOTAL_KOBO}`);
      assert(stock.reserved === 1, `reserved ${stock.reserved}, expected 1`);
      assert(stock.quantity === concurrency.originalQuantity, `quantity ${stock.quantity} changed unexpectedly`);
      return `one 201-equivalent result, one 409 ${loss.code}, 1 order, reserved=${stock.reserved}`;
    });

    await check("2. Ten-request burst has no 500 and still creates one order", async () => {
      const results = await Promise.allSettled(Array.from({ length: 10 }, () => runCheckout(burst)));
      const wins = results.filter((result) => result.status === "fulfilled");
      const losses = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
      assert(wins.length === 1, `expected one successful checkout, got ${wins.length}`);
      assert(losses.length === 9, `expected nine rejected checkouts, got ${losses.length}`);
      const shapes = losses.map((loss) => errorShape(loss.reason));
      const bad = shapes.filter((shape) => shape.status !== 409 && shape.status !== 503);
      assert(bad.length === 0, `non-retryable statuses: ${JSON.stringify(bad)}`);
      const serverErrors = shapes.filter((shape) => shape.status === 500 || shape.status === 0);
      assert(serverErrors.length === 0, `raw/500 failures: ${JSON.stringify(serverErrors)}`);

      const orders = await prisma.order.count({ where: { cartId: burst.cartId } });
      const stock = await prisma.inventoryStock.findUniqueOrThrow({ where: { productId: burst.productId } });
      assert(orders === 1, `burst produced ${orders} orders`);
      assert(stock.reserved === 1, `reserved ${stock.reserved}, expected 1`);
      return `1 success, ${shapes.filter((shape) => shape.status === 409).length} x 409, ${shapes.filter((shape) => shape.status === 503).length} x 503, orders=1, reserved=1`;
    });

    await check("3. Duplicate retry of a claimed cart is a coherent 409", async () => {
      let caught: unknown = null;
      try {
        await runCheckout(concurrency);
      } catch (error) {
        caught = error;
      }
      assert(caught, "duplicate checkout unexpectedly succeeded");
      const shape = errorShape(caught);
      assert(shape.status === 409, `duplicate retry status ${shape.status}`);
      assert(shape.code === "checkout_already_completed", `duplicate retry code ${shape.code}`);
      const details = (caught as { details?: { orderCount?: number } }).details;
      assert(details?.orderCount === 1, `duplicate retry reported orderCount ${details?.orderCount}`);
      const orders = await prisma.order.count({ where: { cartId: concurrency.cartId } });
      const stock = await prisma.inventoryStock.findUniqueOrThrow({ where: { productId: concurrency.productId } });
      assert(orders === 1 && stock.reserved === 1, `duplicate retry changed state: orders=${orders} reserved=${stock.reserved}`);
      return `409 ${shape.code}, orderCount=${details.orderCount}, state unchanged`;
    });

    await check("4. Wallet partial refund keeps the active delivery", async () => {
      const fixture = await createFixture(prisma, "wallet-partial-full", 5);
      const wallet = await fundWallet(prisma, fixture);
      const funded = await walletSnapshots(prisma, wallet.id);
      const created = await runCheckout(fixture);
      assert(created.orders.length === 1, `checkout created ${created.orders.length} orders`);
      const paid = await payOrder(prisma, { fixture, order: created.orders[0], provider: "wallet" });
      const buyer = await walletSnapshots(prisma, wallet.id);
      const vendor = await vendorWallet(prisma, fixture.vendorId);
      const delivery = await deliveryState(prisma, paid.orderId);
      assert(buyer.available === funded.available - paid.totalKobo, `buyer available ${buyer.available}`);
      assert(buyer.held === paid.totalKobo, `buyer held ${buyer.held}`);
      assert(vendor.held === paid.totalKobo, `vendor held ${vendor.held}`);
      assert(delivery?.status === "pending_assignment", `delivery status ${delivery?.status}`);
      const order = await prisma.order.findUniqueOrThrow({ where: { id: paid.orderId } });
      assert(order.status === "vendor_notified" && order.paymentStatus === "paid", `order ${order.status}/${order.paymentStatus}`);

      const partial = await refundPayment({
        orderId: paid.orderId,
        actorId: fixture.userId,
        reason: "Acceptance partial refund.",
        amountKobo: BigInt(1_000)
      });
      const afterPartialOrder = await prisma.order.findUniqueOrThrow({ where: { id: paid.orderId } });
      const afterPartialBuyer = await walletSnapshots(prisma, wallet.id);
      const afterPartialVendor = await vendorWallet(prisma, fixture.vendorId);
      const afterPartialDelivery = await deliveryState(prisma, paid.orderId);
      const refundTx = await prisma.walletTransaction.findFirst({
        where: { orderId: paid.orderId, type: "refund" },
        include: { ledger: true }
      });
      const refundBalanced = refundTx
        ? refundTx.ledger.filter((e) => e.direction === "DEBIT").reduce((s, e) => s + e.amountKobo, BigInt(0)) ===
          refundTx.ledger.filter((e) => e.direction === "CREDIT").reduce((s, e) => s + e.amountKobo, BigInt(0))
        : false;
      assert(partial.status === "COMPLETED", `partial refund status ${partial.status}`);
      assert(afterPartialOrder.paymentStatus === "partially_refunded", `paymentStatus ${afterPartialOrder.paymentStatus}`);
      assert(afterPartialOrder.status === "vendor_notified", `order status ${afterPartialOrder.status}`);
      assert(afterPartialDelivery?.status === "pending_assignment", `delivery moved to ${afterPartialDelivery?.status}`);
      assert(
        !afterPartialDelivery.trackingEvents.some((event) => event.status === "cancelled"),
        "partial refund wrote a cancelled tracking event"
      );
      assert(afterPartialBuyer.available === funded.available - paid.totalKobo + BigInt(1_000), `buyer available ${afterPartialBuyer.available}`);
      assert(afterPartialBuyer.held === paid.totalKobo - BigInt(1_000), `buyer held ${afterPartialBuyer.held}`);
      assert(afterPartialVendor.held === paid.totalKobo - BigInt(1_000), `vendor held ${afterPartialVendor.held}`);
      assert(refundBalanced, "partial refund journal is unbalanced");
      return `partial 1000 kobo settled, delivery still pending_assignment, buyer held ${afterPartialBuyer.held}`;
    });

    await check("5. Wallet full refund cancels the delivery and conserves funds", async () => {
      const fixture = await createFixture(prisma, "wallet-full", 5);
      const wallet = await fundWallet(prisma, fixture);
      const funded = await walletSnapshots(prisma, wallet.id);
      const created = await runCheckout(fixture);
      const paid = await payOrder(prisma, { fixture, order: created.orders[0], provider: "wallet" });
      const vendorBefore = await vendorWallet(prisma, fixture.vendorId);
      const journalBefore = await assertOrderTransactionsBalanced(prisma, paid.orderId, "wallet paid order");

      const full = await refundPayment({
        orderId: paid.orderId,
        actorId: fixture.userId,
        reason: "Acceptance full refund.",
        restock: true
      });
      const order = await prisma.order.findUniqueOrThrow({
        where: { id: paid.orderId },
        include: { payments: true, escrowHolds: true, refunds: true, deliveries: true }
      });
      const buyerAfter = await walletSnapshots(prisma, wallet.id);
      const vendorAfter = await vendorWallet(prisma, fixture.vendorId);
      const delivery = await deliveryState(prisma, paid.orderId);
      const stock = await prisma.inventoryStock.findUniqueOrThrow({ where: { productId: fixture.productId } });
      const completedRefunds = order.refunds
        .filter((refund) => refund.status === "COMPLETED")
        .reduce((sum, refund) => sum + refund.amountKobo, BigInt(0));
      const journalAfter = await assertOrderTransactionsBalanced(prisma, paid.orderId, "wallet refunded order");

      assert(full.status === "COMPLETED", `refund status ${full.status}`);
      assert(order.status === "refunded", `order status ${order.status}`);
      assert(order.paymentStatus === "refunded", `paymentStatus ${order.paymentStatus}`);
      assert(order.payments.every((payment) => payment.status === "REFUNDED"), "payment row was not marked REFUNDED");
      assert(order.escrowHolds.every((escrow) => escrow.status === "refunded"), "escrow was not marked refunded");
      assert(order.refundedKobo === paid.totalKobo, `refundedKobo ${order.refundedKobo} != ${paid.totalKobo}`);
      assert(completedRefunds === paid.totalKobo, `completed refunds ${completedRefunds} != ${paid.totalKobo}`);
      assert(buyerAfter.available === funded.available, `buyer available ${buyerAfter.available} != ${funded.available}`);
      assert(buyerAfter.held === BigInt(0), `buyer held ${buyerAfter.held}`);
      assert(vendorAfter.held === BigInt(0), `vendor held ${vendorAfter.held}`);
      assert(vendorAfter.available === vendorBefore.available, `vendor available changed from ${vendorBefore.available} to ${vendorAfter.available}`);
      assert(delivery, "full refund left no delivery row to inspect");
      assert(delivery.status === "cancelled", `delivery status ${delivery.status}`);
      assert(delivery.courierId === null, `cancelled delivery still has courier ${delivery.courierId}`);
      assert(
        delivery.trackingEvents.filter((event) => event.status === "cancelled").length === 1,
        "expected exactly one cancelled tracking event"
      );
      assert(stock.reserved === 0 && stock.quantity === fixture.originalQuantity, `stock reserved=${stock.reserved} quantity=${stock.quantity}`);
      return `refunded ${paid.totalKobo} kobo; delivery cancelled; ${journalBefore} + ${journalAfter}; stock restored`;
    });

    await check("6. External (local test provider) partial and full refund cancel on full settlement", async () => {
      const fixture = await createFixture(prisma, "external-full", 5);
      const platformBeforePayment = await platformWallet(prisma);
      const created = await runCheckout(fixture);
      const paid = await payOrder(prisma, { fixture, order: created.orders[0], provider: "test" });
      const platformAfterPayment = await platformWallet(prisma);
      const vendorAfterPayment = await vendorWallet(prisma, fixture.vendorId);
      const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: paid.orderId, status: "COMPLETED" } });
      assert(payment.provider === "test", `external fixture provider ${payment.provider}`);
      assert(
        platformAfterPayment.available === platformBeforePayment.available - paid.totalKobo &&
          platformAfterPayment.held === platformBeforePayment.held + paid.totalKobo,
        `external hold did not move the platform position: ${platformAfterPayment.available}/${platformAfterPayment.held}`
      );
      assert(vendorAfterPayment.held === paid.totalKobo, `external vendor held ${vendorAfterPayment.held}`);

      const partial = await refundPayment({
        orderId: paid.orderId,
        actorId: fixture.userId,
        reason: "Acceptance external partial refund.",
        amountKobo: BigInt(2_000)
      });
      const platformPartial = await platformWallet(prisma);
      const afterPartialDelivery = await deliveryState(prisma, paid.orderId);
      assert(partial.status === "COMPLETED", `external partial status ${partial.status}`);
      assert(afterPartialDelivery?.status === "pending_assignment", `external partial moved delivery to ${afterPartialDelivery?.status}`);
      assert(
        platformPartial.held === platformAfterPayment.held - BigInt(2_000),
        `platform held ${platformPartial.held} != ${platformAfterPayment.held - BigInt(2_000)}`
      );
      assert(
        platformPartial.available === platformAfterPayment.available + BigInt(2_000),
        `platform available ${platformPartial.available} != ${platformAfterPayment.available + BigInt(2_000)}`
      );

      const remaining = paid.totalKobo - BigInt(2_000);
      const full = await refundPayment({
        orderId: paid.orderId,
        actorId: fixture.userId,
        reason: "Acceptance external remainder.",
        amountKobo: remaining,
        restock: true
      });
      const order = await prisma.order.findUniqueOrThrow({
        where: { id: paid.orderId },
        include: { payments: true, escrowHolds: true, refunds: true }
      });
      const platformAfter = await platformWallet(prisma);
      const vendorAfter = await vendorWallet(prisma, fixture.vendorId);
      const delivery = await deliveryState(prisma, paid.orderId);
      const stock = await prisma.inventoryStock.findUniqueOrThrow({ where: { productId: fixture.productId } });
      const refunds = order.refunds
        .filter((refund) => refund.status === "COMPLETED")
        .reduce((sum, refund) => sum + refund.amountKobo, BigInt(0));
      const journal = await assertOrderTransactionsBalanced(prisma, paid.orderId, "external refunded order");

      assert(full.status === "COMPLETED", `external full status ${full.status}`);
      assert(order.status === "refunded" && order.paymentStatus === "refunded", `order ${order.status}/${order.paymentStatus}`);
      assert(order.payments.every((row) => row.status === "REFUNDED"), "external payment row not REFUNDED");
      assert(order.escrowHolds.every((row) => row.status === "refunded"), "external escrow not refunded");
      assert(refunds === paid.totalKobo, `external refunds ${refunds} != ${paid.totalKobo}`);
      assert(
        platformAfter.available === platformBeforePayment.available && platformAfter.held === platformBeforePayment.held,
        `platform position not restored: ${platformAfter.available}/${platformAfter.held} vs ${platformBeforePayment.available}/${platformBeforePayment.held}`
      );
      assert(vendorAfter.held === BigInt(0), `external vendor held ${vendorAfter.held}`);
      assert(delivery, "external refund left no delivery row to inspect");
      assert(delivery.status === "cancelled", `external delivery ${delivery.status}`);
      assert(delivery.courierId === null, "external cancelled delivery still has a courier");
      assert(stock.reserved === 0 && stock.quantity === fixture.originalQuantity, `external stock reserved=${stock.reserved} quantity=${stock.quantity}`);
      const refundRef = await prisma.refund.findFirstOrThrow({
        where: { orderId: paid.orderId, status: "COMPLETED" },
        orderBy: { amountKobo: "desc" }
      });
      return `provider=test (local simulator), partial 2000 + full ${remaining}, delivery cancelled, ${journal}, platform position restored, refund ref ${refundRef.providerReference ?? "none"}`;
    });

    await check("7. Paid customer cancellation refunds and cancels the delivery", async () => {
      const fixture = await createFixture(prisma, "cancel-paid", 5);
      const wallet = await fundWallet(prisma, fixture);
      const funded = await walletSnapshots(prisma, wallet.id);
      const created = await runCheckout(fixture);
      const paid = await payOrder(prisma, { fixture, order: created.orders[0], provider: "wallet" });
      const result = await cancelOrder({
        orderId: paid.orderId,
        userId: fixture.userId,
        reason: "Acceptance customer cancellation."
      });
      const order = await prisma.order.findUniqueOrThrow({ where: { id: paid.orderId } });
      const delivery = await deliveryState(prisma, paid.orderId);
      const buyer = await walletSnapshots(prisma, wallet.id);
      assert(result.cancelled && result.refunded, `cancelOrder returned ${JSON.stringify(result)}`);
      assert(order.status === "refunded" && order.paymentStatus === "refunded", `order ${order.status}/${order.paymentStatus}`);
      assert(delivery?.status === "cancelled", `delivery ${delivery?.status}`);
      assert(buyer.available === funded.available && buyer.held === BigInt(0), `buyer ${buyer.available}/${buyer.held}`);
      return `cancelOrder refunded ${paid.totalKobo} kobo and cancelled the delivery`;
    });

    await check("8. Unpaid customer cancellation releases the reservation and has no delivery", async () => {
      const fixture = await createFixture(prisma, "cancel-unpaid", 5);
      const created = await runCheckout(fixture);
      const order = created.orders[0];
      const result = await cancelOrder({
        orderId: order.orderId,
        userId: fixture.userId,
        reason: "Acceptance unpaid cancellation."
      });
      const stored = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });
      const stock = await prisma.inventoryStock.findUniqueOrThrow({ where: { productId: fixture.productId } });
      const deliveries = await prisma.delivery.count({ where: { orderId: order.orderId } });
      assert(result.cancelled && !result.refunded, `cancelOrder returned ${JSON.stringify(result)}`);
      assert(stored.status === "cancelled", `order status ${stored.status}`);
      assert(stock.reserved === 0 && stock.quantity === fixture.originalQuantity, `stock reserved=${stock.reserved} quantity=${stock.quantity}`);
      assert(deliveries === 0, `${deliveries} deliveries exist for an unpaid order`);
      return `cancelled, reserved released, no delivery`;
    });

    await check("9. Cancellation racing courier assignment always ends cancelled", async () => {
      const admin = await createUser(prisma, "race-admin", "ADMIN");
      const courierUser = await createUser(prisma, "race-courier", "COURIER");
      const courier = await prisma.courier.create({
        data: {
          userId: courierUser.id,
          name: `CRF courier ${RUN_ID}`,
          phone: "+2348000000001",
          active: true,
          vehicleType: "motorcycle",
          serviceZone: "Lagos"
        }
      });
      const summaries: string[] = [];
      for (let iteration = 1; iteration <= 3; iteration += 1) {
        const fixture = await createFixture(prisma, `race-${iteration}`, 5);
        const wallet = await fundWallet(prisma, fixture);
        const created = await runCheckout(fixture);
        const paid = await payOrder(prisma, { fixture, order: created.orders[0], provider: "wallet" });
        await transitionToReady(prisma, paid.orderId, fixture.vendorOwnerId);
        const delivery = await deliveryState(prisma, paid.orderId);
        assert(delivery, `race fixture ${iteration}: no delivery row`);
        assert(delivery.status === "pending_assignment", `race fixture delivery ${delivery.status}`);

        const [assignment, refund] = await Promise.allSettled([
          assignCourier({ adminId: admin.id, deliveryId: delivery.id, courierId: courier.id }),
          refundPayment({
            orderId: paid.orderId,
            actorId: admin.id,
            reason: `Acceptance cancellation race ${iteration}.`,
            restock: true
          })
        ]);
        const refundError = refund.status === "rejected" ? errorShape(refund.reason) : null;
        assert(!refundError, `refund lost the race: ${JSON.stringify(refundError)}`);
        const assignmentError = assignment.status === "rejected" ? errorShape(assignment.reason) : null;
        if (assignmentError) {
          assert(
            [409, 503].includes(assignmentError.status),
            `assignment failed with ${JSON.stringify(assignmentError)}`
          );
        }

        const finalDelivery = await deliveryState(prisma, paid.orderId);
        const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: paid.orderId } });
        assert(finalOrder.status === "refunded", `race ${iteration}: order ${finalOrder.status}`);
        assert(finalDelivery, `race ${iteration}: no delivery row`);
        assert(finalDelivery.status === "cancelled", `race ${iteration}: delivery ${finalDelivery.status}`);
        assert(finalDelivery.courierId === null, `race ${iteration}: cancelled delivery still assigned to ${finalDelivery.courierId}`);
        const last = finalDelivery.trackingEvents.at(-1);
        assert(last?.status === "cancelled", `race ${iteration}: last tracking event ${last?.status}`);
        await assertOrderTransactionsBalanced(prisma, paid.orderId, `race ${iteration}`);
        summaries.push(
          `run ${iteration}: refund won, assignment ${assignmentError ? `rejected ${assignmentError.status}/${assignmentError.code}` : "committed then cancelled"}`
        );
      }
      return summaries.join("; ");
    });

    await check("10. Journals, reservations and reconciliation are clean", async () => {
      // Cancel the two unpaid concurrency fixtures so no reservation is left
      // behind by the acceptance run.
      const winnerA = await prisma.order.findFirstOrThrow({ where: { cartId: concurrency.cartId } });
      const winnerB = await prisma.order.findFirstOrThrow({ where: { cartId: burst.cartId } });
      await cancelOrder({ orderId: winnerA.id, userId: concurrency.userId, reason: "Acceptance cleanup." });
      await cancelOrder({ orderId: winnerB.id, userId: burst.userId, reason: "Acceptance cleanup." });

      const productIds = await prisma.product.findMany({
        where: { slug: { startsWith: `crf-product-${RUN_ID}` } },
        select: { id: true }
      });
      const stocks = await prisma.inventoryStock.findMany({ where: { productId: { in: productIds.map((p) => p.id) } } });
      assert(stocks.every((stock) => stock.reserved === 0), `unreleased reservations: ${stocks.map((s) => `${s.productId}:${s.reserved}`).join(",")}`);

      const report = await reconcile();
      assert(report.totals.differenceKobo === "0", `whole-book journal difference ${report.totals.differenceKobo}`);
      const orderCount = await prisma.order.count();
      assert(orderCount > 0, "no orders found while collecting reconciliation evidence");
      return `reservations=0; journal difference=${report.totals.differenceKobo}; reconcile status=${report.status}; issues=${report.issues.length}`;
    });
  } finally {
    const cleanup = await cleanupCheckoutRefundFixtures(prisma, RUN_ID).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
    console.log(JSON.stringify({ database: EXPECTED_DATABASE, runId: RUN_ID, checks, failures, cleanup }, null, 2));
    clearTimeout(watchdog);
    await prisma.$disconnect();
  }

  process.exit(failures ? 1 : 0);
}

main().catch(async (error) => {
  console.error("FATAL", error instanceof Error ? error.message : error);
  process.exit(1);
});
