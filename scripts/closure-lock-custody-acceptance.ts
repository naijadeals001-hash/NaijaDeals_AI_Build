/**
 * Closure, lock-order, physical-custody, seller-return and duplicate-payment
 * acceptance for NaijaShop.
 *
 * Executed against real business services on an explicitly named isolated TEST
 * database. No live provider is contacted: wallet payments and the local test
 * provider are the only payment paths, and the test-provider refund adapter is
 * temporarily replaced in-process to simulate a definitive provider rejection
 * (clearly labelled "simulated" in the check output).
 *
 * Covers:
 *  1. admin closure after a partial refund (remaining computed server-side);
 *  2. duplicate admin closure / concurrent remaining refunds;
 *  3. service-level admin permission and region-scope enforcement;
 *  4. refund after pickup (custody retained, no restock, courier blocked);
 *  5. courier-delivery vs refund races at in_transit;
 *  6. refund after delivered (no restock, history kept);
 *  7. assignment/cancellation race and stale-courier rejection;
 *  8. concurrent duplicate payment confirmations (one winner);
 *  9. seller return receipt after a definitive refund failure, retried with a
 *     persisted intent, plus crash-before-finalise recovery;
 * 10. cart mutation racing checkout (one order, consistent reservation);
 * 11. whole-book journals, wallet projections and reconciliation.
 *
 * Usage (the URL is supplied by the operator and never printed):
 *   TEST_DATABASE_URL=... ENABLE_TEST_PAYMENTS=true \
 *     npx tsx scripts/closure-lock-custody-acceptance.ts
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { requireTestDatabase, type VerifiedTestDatabase } from "./lib/test-db-guard";
import type { PrismaClient } from "@prisma/client";

const EXPECTED_DATABASE = "naijadeals_closure_lock_test";
const RUN_ID = `${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${randomBytes(4).toString("hex")}`;
const PRICE_KOBO = BigInt(300_000);
const DELIVERY_FEE_KOBO = BigInt(150_000);
const ESCROW_FEE_KOBO = BigInt(3_000);
const ORDER_TOTAL_KOBO = PRICE_KOBO + DELIVERY_FEE_KOBO + ESCROW_FEE_KOBO;
const TOP_UP_KOBO = BigInt(2_000_000);

type Check = { name: string; status: "PASS" | "FAIL"; detail: string };
const checks: Check[] = [];
let failures = 0;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function check(name: string, fn: () => Promise<string>) {
  try {
    checks.push({ name, status: "PASS", detail: await fn() });
  } catch (error) {
    failures += 1;
    checks.push({
      name,
      status: "FAIL",
      detail: (error instanceof Error ? error.message : String(error)).slice(0, 900)
    });
  }
}

const address = {
  contactName: "Isolated Closure Fixture",
  contactPhone: "08030000000",
  countryCode: "NG",
  state: "Lagos",
  city: "Lagos",
  line1: "1 Isolated Closure Way"
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

type RefundCompletion = {
  status: string;
  refundedKobo: string;
  refundId?: string;
  restocked?: boolean;
  deliveryCustody?: string | null;
};

type AdminClosureCompletion = {
  orderId: string;
  refundedKobo?: string;
  duplicate?: boolean;
  closure?: { remainingRefundableKobo: string };
};

function errorShape(error: unknown): { status: number; code: string; message: string } {
  const typed = error as { status?: unknown; code?: unknown; message?: unknown };
  return {
    status: typeof typed?.status === "number" ? typed.status : 0,
    code: typeof typed?.code === "string" ? typed.code : "unknown",
    message: typeof typed?.message === "string" ? typed.message : String(error)
  };
}

async function statusOf<T>(promise: Promise<T>): Promise<
  | { ok: true; value: T }
  | { ok: false; error: { status: number; code: string; message: string } }
> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    return { ok: false, error: errorShape(error) };
  }
}

async function createUser(
  db: PrismaClient,
  label: string,
  actorType: "CUSTOMER" | "ADMIN" | "COURIER" | "VENDOR" = "CUSTOMER",
  scopeCountryCode?: string
) {
  return db.user.create({
    data: {
      email: `clc-${RUN_ID}-${label}@example.test`.toLowerCase(),
      name: `Closure lock fixture ${label}`,
      actorType,
      scopeCountryCode: scopeCountryCode ?? null,
      ...(actorType === "COURIER" ? { verifiedAt: new Date() } : {})
    }
  });
}

async function attachRole(db: PrismaClient, userId: string, roleName: string) {
  const role = await db.role.upsert({
    where: { name: roleName },
    update: {},
    create: { name: roleName, description: `Fixture role ${roleName}` }
  });
  await db.userRole.upsert({
    where: { userId_roleId: { userId, roleId: role.id } },
    update: {},
    create: { userId, roleId: role.id }
  });
}

async function sessionActor(db: PrismaClient, userId: string) {
  return db.user.findUniqueOrThrow({
    where: { id: userId },
    include: { roles: { include: { role: true } }, vendors: true }
  });
}

async function createFixture(db: PrismaClient, label: string, quantity = 5): Promise<Fixture> {
  const user = await createUser(db, `${label}-buyer`);
  const vendorOwner = await createUser(db, `${label}-owner`, "VENDOR");
  const vendor = await db.vendor.create({
    data: {
      ownerId: vendorOwner.id,
      name: `Closure vendor ${RUN_ID} ${label}`,
      slug: `clc-vendor-${RUN_ID}-${label}`.toLowerCase(),
      market: "Isolated acceptance fixture market",
      description: "Isolated closure/custody fixture. Not a real vendor.",
      pickupAddress: "1 Isolated Closure Way, Lagos",
      pickupPhone: "+2348000000000",
      status: "VERIFIED",
      commissionBps: 1000
    }
  });
  const category = await db.category.create({
    data: { name: `CLC category ${RUN_ID} ${label}`, slug: `clc-category-${RUN_ID}-${label}`.toLowerCase() }
  });
  const product = await db.product.create({
    data: {
      vendorId: vendor.id,
      categoryId: category.id,
      name: `CLC product ${RUN_ID} ${label}`,
      slug: `clc-product-${RUN_ID}-${label}`.toLowerCase(),
      description: "Isolated closure/custody fixture product.",
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
  const key = `clc-${RUN_ID}-${fixture.label}`.toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 70);
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
    raw: { simulated: true, note: "Closure acceptance fixture funding. Not a real payment." }
  });
  assert(credited.status === "credited", `top-up was not credited (${credited.status})`);
  return wallet;
}

async function runCheckout(fixture: Fixture) {
  const { checkout } = await import("../lib/services/core/checkout.service");
  return checkout({ userId: fixture.userId, address });
}

async function payOrder(
  db: PrismaClient,
  input: { fixture: Fixture; order: { orderId: string; totalKobo: string }; provider: "wallet" | "test" }
): Promise<PaidOrder> {
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

async function createPaidOrder(db: PrismaClient, label: string, provider: "wallet" | "test" = "wallet") {
  const fixture = await createFixture(db, label);
  if (provider === "wallet") await fundWallet(db, fixture);
  const created = await runCheckout(fixture);
  assert(created.orders.length === 1, `${label}: checkout created ${created.orders.length} orders`);
  const paid = await payOrder(db, { fixture, order: created.orders[0], provider });
  return { fixture, paid };
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

async function walletSnapshot(db: PrismaClient, walletId: string) {
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

async function deliveryOf(db: PrismaClient, orderId: string) {
  return db.delivery.findFirst({
    where: { orderId },
    include: { trackingEvents: { orderBy: { createdAt: "asc" } } }
  });
}

async function stockOf(db: PrismaClient, productId: string) {
  return db.inventoryStock.findUniqueOrThrow({ where: { productId } });
}

async function completedRefundSum(db: PrismaClient, orderId: string) {
  const aggregate = await db.refund.aggregate({
    where: { orderId, status: "COMPLETED" },
    _sum: { amountKobo: true }
  });
  return aggregate._sum.amountKobo ?? BigInt(0);
}

async function createCourier(db: PrismaClient, label: string) {
  const user = await createUser(db, label, "COURIER");
  const courier = await db.courier.create({
    data: {
      userId: user.id,
      name: `CLC courier ${RUN_ID} ${label}`,
      phone: "+2348000000001",
      active: true,
      vehicleType: "motorcycle",
      serviceZone: "Lagos"
    }
  });
  return { user, courier };
}

async function advanceToReady(db: PrismaClient, fixture: Fixture, orderId: string) {
  const { updateOrderStatus } = await import("../lib/services/core/order.service");
  await db.$transaction(async (tx) => {
    for (const status of ["accepted", "preparing", "ready_for_pickup"] as const) {
      await updateOrderStatus({ tx, actorId: fixture.vendorOwnerId, orderId, status, note: "Closure fixture preparation." });
    }
  });
}

async function deliverOrder(input: {
  db: PrismaClient;
  fixture: Fixture;
  orderId: string;
  adminId: string;
  courierId: string;
  courierUserId: string;
}) {
  const { assignCourier } = await import("../lib/services/core/admin.service");
  const { updateCourierDelivery } = await import("../lib/services/core/courier.service");
  await advanceToReady(input.db, input.fixture, input.orderId);
  const delivery = await deliveryOf(input.db, input.orderId);
  assert(delivery, "paid fixture has no delivery row");
  await assignCourier({ adminId: input.adminId, deliveryId: delivery.id, courierId: input.courierId });
  for (const status of ["pickup_started", "picked_up", "in_transit"] as const) {
    await updateCourierDelivery({ userId: input.courierUserId, deliveryId: delivery.id, status });
  }
  await updateCourierDelivery({
    userId: input.courierUserId,
    deliveryId: delivery.id,
    status: "delivered",
    proofCode: `CLC-PROOF-${RUN_ID}`,
    note: "Closure acceptance delivery proof."
  });
  return delivery.id;
}

async function main() {
  const target: VerifiedTestDatabase = await requireTestDatabase();
  assert(
    target.databaseName === EXPECTED_DATABASE,
    `Refusing to run on ${target.databaseName}; expected the dedicated ${EXPECTED_DATABASE}`
  );
  assert(process.env.ENABLE_TEST_PAYMENTS === "true", "ENABLE_TEST_PAYMENTS=true is required for the local test provider fixtures.");

  const testUrl = new URL(target.url);
  if (!testUrl.searchParams.has("connection_limit")) testUrl.searchParams.set("connection_limit", "8");
  process.env.DATABASE_URL = testUrl.toString();

  const { prisma } = await import("../lib/prisma");
  const { refundPayment, ensureWallet } = await import("../lib/payments/service");
  const { adminUpdateOrderStatus, assignCourier } = await import("../lib/services/core/admin.service");
  const { updateCourierDelivery } = await import("../lib/services/core/courier.service");
  const { resolveReturn } = await import("../lib/services/core/seller.service");
  const { requestReturn } = await import("../lib/services/core/order.service");
  const { addCartItem } = await import("../lib/services/core/cart.service");
  const { reconcile } = await import("../lib/services/core/reconciliation-correct");
  const { adapters, PaymentProviderError } = await import("../lib/payments/adapters");

  try {
    const identity = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
    assert(identity[0]?.db === EXPECTED_DATABASE, `connected database ${identity[0]?.db} does not match the guard target`);
    await ensureWallet(prisma, { ownerType: "SYSTEM" });

    const adminUser = await createUser(prisma, "admin", "ADMIN");
    const { courier, user: courierUser } = await createCourier(prisma, "main");

    await check("1. Admin closure after a partial refund refunds only the remaining balance", async () => {
      const fixture = await createFixture(prisma, "admin-partial");
      const wallet = await fundWallet(prisma, fixture);
      const funded = await walletSnapshot(prisma, wallet.id);
      const created = await runCheckout(fixture);
      const paid = await payOrder(prisma, { fixture, order: created.orders[0], provider: "wallet" });
      const afterPayment = await walletSnapshot(prisma, wallet.id);
      assert(
        afterPayment.available === TOP_UP_KOBO - paid.totalKobo && afterPayment.held === paid.totalKobo,
        `after payment ${afterPayment.available}/${afterPayment.held}`
      );

      const partial = await refundPayment({
        orderId: paid.orderId,
        actorId: adminUser.id,
        reason: "Acceptance partial before admin closure.",
        amountKobo: BigInt(1_000)
      });
      assert(partial.status === "COMPLETED", `partial status ${partial.status}`);
      const afterPartial = await prisma.order.findUniqueOrThrow({ where: { id: paid.orderId } });
      assert(afterPartial.paymentStatus === "partially_refunded", `after partial ${afterPartial.paymentStatus}`);
      const stockAfterPartial = await stockOf(prisma, fixture.productId);
      assert(
        stockAfterPartial.quantity === fixture.originalQuantity - 1 && stockAfterPartial.reserved === 0,
        `partial refund changed stock: ${stockAfterPartial.quantity}/${stockAfterPartial.reserved}`
      );

      const closure = (await adminUpdateOrderStatus({
        adminId: adminUser.id,
        orderId: paid.orderId,
        status: "refunded",
        note: "Acceptance admin closure."
      })) as unknown as AdminClosureCompletion;
      assert(closure.refundedKobo === (paid.totalKobo - BigInt(1_000)).toString(), `closure refunded ${closure.refundedKobo}`);

      const order = await prisma.order.findUniqueOrThrow({
        where: { id: paid.orderId },
        include: { refunds: true, payments: true, deliveries: true, escrowHolds: true }
      });
      const refunds = await completedRefundSum(prisma, paid.orderId);
      const stock = await stockOf(prisma, fixture.productId);
      const buyer = await walletSnapshot(prisma, wallet.id);
      const vendor = await vendorWallet(prisma, fixture.vendorId);
      const delivery = await deliveryOf(prisma, paid.orderId);
      const journal = await assertOrderTransactionsBalanced(prisma, paid.orderId, "admin closure");

      assert(order.status === "refunded", `order status ${order.status}`);
      assert(order.paymentStatus === "refunded", `paymentStatus ${order.paymentStatus}`);
      assert(order.payments.every((row) => row.status === "REFUNDED"), "payment row not REFUNDED");
      assert(order.escrowHolds.every((row) => row.status === "refunded"), "escrow not refunded");
      assert(refunds === paid.totalKobo, `completed refunds ${refunds} != ${paid.totalKobo}`);
      assert(order.refunds.filter((row) => row.status === "COMPLETED").length === 2, `refund rows ${order.refunds.length}`);
      assert(order.refundedKobo === paid.totalKobo, `reserved refundedKobo ${order.refundedKobo}`);
      assert(
        buyer.available === funded.available && buyer.held === BigInt(0),
        `buyer ${buyer.available}/${buyer.held} vs funded ${funded.available}/${funded.held}`
      );
      assert(vendor.held === BigInt(0) && vendor.available === BigInt(0), `vendor ${vendor.available}/${vendor.held}`);
      assert(delivery?.status === "cancelled" && delivery.courierId === null, `delivery ${delivery?.status}/${delivery?.courierId}`);
      assert(stock.reserved === 0 && stock.quantity === fixture.originalQuantity, `stock ${stock.quantity}/${stock.reserved}`);
      assert(closure.closure?.remainingRefundableKobo === (paid.totalKobo - BigInt(1_000)).toString(), "closure remaining not reported");
      return `partial 1000 + remaining ${closure.refundedKobo} = ${refunds}; delivery cancelled; stock restored once; ${journal}`;
    });

    await check("1b. Partially-refunded admin cancellation uses the same closure workflow", async () => {
      const { fixture, paid } = await createPaidOrder(prisma, "admin-cancel-partial");
      const partial = await refundPayment({
        orderId: paid.orderId,
        actorId: adminUser.id,
        reason: "Acceptance cancellation baseline partial.",
        amountKobo: BigInt(500)
      });
      assert(partial.status === "COMPLETED", `cancellation partial ${partial.status}`);

      const closure = (await adminUpdateOrderStatus({
        adminId: adminUser.id,
        orderId: paid.orderId,
        status: "cancelled",
        note: "Acceptance partially-refunded cancellation."
      })) as unknown as AdminClosureCompletion;
      assert(closure.refundedKobo === (paid.totalKobo - BigInt(500)).toString(), `cancellation refunded ${closure.refundedKobo}`);
      const order = await prisma.order.findUniqueOrThrow({ where: { id: paid.orderId } });
      const refunds = await completedRefundSum(prisma, paid.orderId);
      const delivery = await deliveryOf(prisma, paid.orderId);
      const stock = await stockOf(prisma, fixture.productId);
      assert(order.status === "refunded" && order.paymentStatus === "refunded", `cancellation order ${order.status}/${order.paymentStatus}`);
      assert(refunds === paid.totalKobo, `cancellation refunds ${refunds} != ${paid.totalKobo}`);
      assert(delivery?.status === "cancelled", `cancellation delivery ${delivery?.status}`);
      assert(stock.quantity === fixture.originalQuantity && stock.reserved === 0, `cancellation stock ${stock.quantity}/${stock.reserved}`);
      await assertOrderTransactionsBalanced(prisma, paid.orderId, "partially-refunded cancellation");
      return `partial 500 + cancellation remaining ${closure.refundedKobo} = ${refunds}; delivery cancelled; stock restored once`;
    });

    await check("1c. A pending external refund claim blocks admin closure until reconciled", async () => {
      const { paid } = await createPaidOrder(prisma, "admin-pending-claim", "test");
      const { reserveExternalRefundClaim, reconcileExternalRefundOutcome } = await import("../lib/payments/service");
      const claim = await reserveExternalRefundClaim({
        orderId: paid.orderId,
        actorId: adminUser.id,
        reason: "Acceptance held external claim.",
        idempotencyKey: `clc-held-claim-${RUN_ID}`.toLowerCase(),
        amountKobo: BigInt(1_000)
      });
      const blocked = await statusOf(
        adminUpdateOrderStatus({
          adminId: adminUser.id,
          orderId: paid.orderId,
          status: "refunded",
          note: "Must not close around a pending claim."
        })
      );
      assert(!blocked.ok, "admin closure ignored a pending external refund claim");
      assert(blocked.error.status === 409 && blocked.error.code === "refund_pending", `pending claim response ${JSON.stringify(blocked)}`);
      const afterBlocked = await prisma.order.findUniqueOrThrow({ where: { id: paid.orderId } });
      const refundRowsBlocked = await prisma.refund.count({ where: { orderId: paid.orderId } });
      assert(afterBlocked.paymentStatus === "paid", `blocked closure changed ${afterBlocked.paymentStatus}`);
      assert(refundRowsBlocked === 1, `blocked closure created refund rows ${refundRowsBlocked}`);

      await reconcileExternalRefundOutcome({
        refundId: claim.refundId,
        actorId: adminUser.id,
        outcome: "failed",
        note: "Acceptance: claim was never submitted to the provider."
      });
      const released = await prisma.order.findUniqueOrThrow({ where: { id: paid.orderId } });
      assert(released.refundedKobo === BigInt(0), `released claim left reservation ${released.refundedKobo}`);

      const closure = (await adminUpdateOrderStatus({
        adminId: adminUser.id,
        orderId: paid.orderId,
        status: "refunded",
        note: "Acceptance closure after releasing the held claim."
      })) as unknown as AdminClosureCompletion;
      const refunds = await completedRefundSum(prisma, paid.orderId);
      const order = await prisma.order.findUniqueOrThrow({ where: { id: paid.orderId } });
      assert(closure.refundedKobo === paid.totalKobo.toString(), `post-reconcile closure ${closure.refundedKobo}`);
      assert(refunds === paid.totalKobo && order.paymentStatus === "refunded", `post-reconcile refunds ${refunds}/${order.paymentStatus}`);
      return `409 refund_pending while the claim was reserved; released claim then refunded ${refunds} and closed`;
    });

    await check("2. Duplicate admin closure is idempotent and concurrent closures settle once", async () => {
      const { fixture: duplicateFixture, paid: duplicateOrder } = await createPaidOrder(prisma, "admin-duplicate");
      const first = (await adminUpdateOrderStatus({
        adminId: adminUser.id,
        orderId: duplicateOrder.orderId,
        status: "refunded",
        note: "Acceptance first closure."
      })) as unknown as AdminClosureCompletion;
      assert(first.refundedKobo === duplicateOrder.totalKobo.toString(), `first closure ${first.refundedKobo}`);
      const rowsBefore = await prisma.refund.count({ where: { orderId: duplicateOrder.orderId } });
      const second = (await adminUpdateOrderStatus({
        adminId: adminUser.id,
        orderId: duplicateOrder.orderId,
        status: "refunded",
        note: "Acceptance duplicate closure."
      })) as unknown as AdminClosureCompletion;
      const rowsAfter = await prisma.refund.count({ where: { orderId: duplicateOrder.orderId } });
      assert(second.duplicate === true, `duplicate closure result ${JSON.stringify(second)}`);
      assert(rowsBefore === rowsAfter, `duplicate closure created refund rows ${rowsBefore} -> ${rowsAfter}`);
      const stockAfterDuplicate = await stockOf(prisma, duplicateFixture.productId);
      assert(stockAfterDuplicate.quantity === duplicateFixture.originalQuantity, `duplicate restocked to ${stockAfterDuplicate.quantity}`);

      const { fixture: raceFixture, paid: raceOrder } = await createPaidOrder(prisma, "admin-race");
      const partial = await refundPayment({
        orderId: raceOrder.orderId,
        actorId: adminUser.id,
        reason: "Acceptance race baseline partial.",
        amountKobo: BigInt(2_000)
      });
      assert(partial.status === "COMPLETED", `race partial ${partial.status}`);
      const [a, b] = await Promise.all([
        statusOf(adminUpdateOrderStatus({ adminId: adminUser.id, orderId: raceOrder.orderId, status: "refunded", note: "Concurrent closure A." })),
        statusOf(adminUpdateOrderStatus({ adminId: adminUser.id, orderId: raceOrder.orderId, status: "refunded", note: "Concurrent closure B." }))
      ]);
      const failures = [a, b].filter((result) => !result.ok);
      assert(failures.length === 0, `concurrent closure errors: ${JSON.stringify(failures)}`);
      const duplicates = [a, b].filter((result) => result.ok && (result.value as { duplicate?: boolean }).duplicate === true).length;
      assert(duplicates === 1, `expected one duplicate result, got ${duplicates}`);
      const refunds = await completedRefundSum(prisma, raceOrder.orderId);
      assert(refunds === raceOrder.totalKobo, `concurrent refunds ${refunds} != ${raceOrder.totalKobo}`);
      const completedRows = await prisma.refund.count({ where: { orderId: raceOrder.orderId, status: "COMPLETED" } });
      assert(completedRows === 2, `completed rows ${completedRows}, expected 2 (baseline + remaining)`);
      const stock = await stockOf(prisma, raceFixture.productId);
      assert(stock.quantity === raceFixture.originalQuantity && stock.reserved === 0, `race stock ${stock.quantity}/${stock.reserved}`);
      const buyer = await prisma.wallet.findFirstOrThrow({ where: { userId: raceFixture.userId, ownerType: "CUSTOMER" } });
      assert(buyer.availableKobo === TOP_UP_KOBO && buyer.heldKobo === BigInt(0), `race buyer ${buyer.availableKobo}/${buyer.heldKobo}`);
      await assertOrderTransactionsBalanced(prisma, raceOrder.orderId, "concurrent closure");
      return `duplicate replay moved no money; two concurrent closures -> 1 settled + 1 duplicate; refunds=${refunds}`;
    });

    await check("3. Admin closure enforces orders:write and region scope at the service boundary", async () => {
      const { paid } = await createPaidOrder(prisma, "admin-authz");
      await refundPayment({
        orderId: paid.orderId,
        actorId: adminUser.id,
        reason: "Acceptance authz partial.",
        amountKobo: BigInt(500)
      });

      const support = await createUser(prisma, "support", "ADMIN");
      await attachRole(prisma, support.id, "support");
      const supportActor = await sessionActor(prisma, support.id);
      const denied = await statusOf(
        adminUpdateOrderStatus({
          adminId: support.id,
          actor: supportActor,
          orderId: paid.orderId,
          status: "refunded",
          note: "Support should not close orders."
        })
      );
      assert(!denied.ok && denied.error.status === 403 && denied.error.code === "permission_denied", `support result ${JSON.stringify(denied)}`);
      const afterDenied = await prisma.order.findUniqueOrThrow({ where: { id: paid.orderId } });
      assert(afterDenied.paymentStatus === "partially_refunded", `denied closure changed ${afterDenied.paymentStatus}`);

      const ops = await createUser(prisma, "ops-gh", "ADMIN", "GH");
      await attachRole(prisma, ops.id, "ops");
      const opsActor = await sessionActor(prisma, ops.id);
      const outOfRegion = await statusOf(
        adminUpdateOrderStatus({
          adminId: ops.id,
          actor: opsActor,
          orderId: paid.orderId,
          status: "refunded",
          note: "Out-of-region closure."
        })
      );
      assert(
        !outOfRegion.ok && outOfRegion.error.status === 403 && outOfRegion.error.code === "region_forbidden",
        `region result ${JSON.stringify(outOfRegion)}`
      );

      const admin = await createUser(prisma, "admin-scoped", "ADMIN", "NG");
      await attachRole(prisma, admin.id, "admin");
      const adminActor = await sessionActor(prisma, admin.id);
      const allowed = (await adminUpdateOrderStatus({
        adminId: admin.id,
        actor: adminActor,
        orderId: paid.orderId,
        status: "refunded",
        note: "Authorised in-region closure."
      })) as unknown as AdminClosureCompletion;
      assert(allowed.orderId === paid.orderId && !allowed.duplicate, `authorised closure ${JSON.stringify(allowed)}`);
      const order = await prisma.order.findUniqueOrThrow({ where: { id: paid.orderId } });
      assert(order.paymentStatus === "refunded", `authorised closure left ${order.paymentStatus}`);
      return "support denied 403 permission_denied; GH-scoped ops denied 403 region_forbidden; NG admin closed successfully";
    });

    await check("4. Refund after pickup retains custody, does not restock and blocks delivery advance", async () => {
      const { fixture, paid } = await createPaidOrder(prisma, "custody-pickup");
      const admin = await createUser(prisma, "custody-admin", "ADMIN");
      await advanceToReady(prisma, fixture, paid.orderId);
      const delivery = await deliveryOf(prisma, paid.orderId);
      assert(delivery, "no delivery row");
      await assignCourier({ adminId: admin.id, deliveryId: delivery.id, courierId: courier.id });
      for (const status of ["pickup_started", "picked_up"] as const) {
        await updateCourierDelivery({ userId: courierUser.id, deliveryId: delivery.id, status });
      }
      const stockBefore = await stockOf(prisma, fixture.productId);

      const refund = (await refundPayment({
        orderId: paid.orderId,
        actorId: admin.id,
        reason: "Acceptance refund after pickup.",
        restock: true
      })) as unknown as RefundCompletion;
      assert(refund.status === "COMPLETED", `refund status ${refund.status}`);
      assert(refund.restocked === false, `refund restocked after pickup (${refund.restocked})`);
      assert(refund.deliveryCustody === "in_custody", `custody ${refund.deliveryCustody}`);

      const order = await prisma.order.findUniqueOrThrow({ where: { id: paid.orderId } });
      const heldDelivery = await deliveryOf(prisma, paid.orderId);
      const stockAfter = await stockOf(prisma, fixture.productId);
      assert(order.status === "refunded" && order.paymentStatus === "refunded", `order ${order.status}/${order.paymentStatus}`);
      assert(heldDelivery?.status === "picked_up", `delivery ${heldDelivery?.status}`);
      assert(heldDelivery?.courierId === courier.id, `custody courier ${heldDelivery?.courierId}`);
      assert(
        heldDelivery.trackingEvents.some((event) =>
          event.description.toLowerCase().includes("refund settled while the parcel was already collected")
        ),
        "custody tracking event missing"
      );
      const custodyAudit = await prisma.auditLog.count({
        where: { action: "delivery.custody_retained_on_refund", entityId: delivery.id }
      });
      assert(custodyAudit >= 1, "custody audit record missing");
      assert(stockAfter.quantity === stockBefore.quantity && stockAfter.reserved === 0, `stock ${stockBefore.quantity}->${stockAfter.quantity}`);

      const advance = await statusOf(
        updateCourierDelivery({ userId: courierUser.id, deliveryId: delivery.id, status: "in_transit" })
      );
      assert(!advance.ok && advance.error.status === 409 && advance.error.code === "order_refunded", `advance ${JSON.stringify(advance)}`);
      const failed = await updateCourierDelivery({
        userId: courierUser.id,
        deliveryId: delivery.id,
        status: "failed",
        note: "Custody recovery: parcel retained by courier."
      });
      assert(failed.status === "failed", `custody recovery status ${failed.status}`);
      await assertOrderTransactionsBalanced(prisma, paid.orderId, "refund after pickup");
      return `refund retained picked_up with courier ${courier.id.slice(0, 6)}; stock ${stockAfter.quantity}; forward advance 409 order_refunded; failed accepted as custody recovery`;
    });

    await check("5. Courier delivered racing a refund stays coherent at in_transit", async () => {
      const summaries: string[] = [];
      for (let iteration = 1; iteration <= 3; iteration += 1) {
        const { fixture, paid } = await createPaidOrder(prisma, `courier-race-${iteration}`);
        const admin = await createUser(prisma, `courier-race-admin-${iteration}`, "ADMIN");
        await advanceToReady(prisma, fixture, paid.orderId);
        const delivery = await deliveryOf(prisma, paid.orderId);
        assert(delivery, `race ${iteration}: no delivery`);
        await assignCourier({ adminId: admin.id, deliveryId: delivery.id, courierId: courier.id });
        for (const status of ["pickup_started", "picked_up", "in_transit"] as const) {
          await updateCourierDelivery({ userId: courierUser.id, deliveryId: delivery.id, status });
        }
        const stockBefore = await stockOf(prisma, fixture.productId);

        if (iteration === 1) {
          // Deterministic refund-first ordering: the courier must receive a
          // stable 409 and the collected parcel must remain visible.
          const refund = (await refundPayment({
            orderId: paid.orderId,
            actorId: admin.id,
            reason: "Acceptance refund before courier delivery.",
            restock: true
          })) as unknown as RefundCompletion;
          assert(refund.status === "COMPLETED" && refund.restocked === false, `refund-first restocked ${refund.restocked}`);
          const lateCourier = await statusOf(
            updateCourierDelivery({
              userId: courierUser.id,
              deliveryId: delivery.id,
              status: "delivered",
              proofCode: `CLC-LATE-${RUN_ID}`
            })
          );
          assert(!lateCourier.ok && lateCourier.error.status === 409 && lateCourier.error.code === "order_refunded", `late courier ${JSON.stringify(lateCourier)}`);
          const order = await prisma.order.findUniqueOrThrow({ where: { id: paid.orderId } });
          const finalDelivery = await deliveryOf(prisma, paid.orderId);
          const stock = await stockOf(prisma, fixture.productId);
          assert(order.status === "refunded" && finalDelivery?.status === "in_transit", `refund-first ${order.status}/${finalDelivery?.status}`);
          assert(finalDelivery?.courierId === courier.id, "refund-first lost the courier");
          assert(stock.quantity === stockBefore.quantity, `refund-first stock ${stock.quantity}`);
          await assertOrderTransactionsBalanced(prisma, paid.orderId, "courier/refund race 1");
          summaries.push("run 1: refund committed first, late courier 409 order_refunded, delivery retained in_transit");
          continue;
        }

        const [courierResult, refundResult] = await Promise.all([
          statusOf(
            updateCourierDelivery({
              userId: courierUser.id,
              deliveryId: delivery.id,
              status: "delivered",
              proofCode: `CLC-RACE-${RUN_ID}-${iteration}`
            })
          ),
          statusOf(
            refundPayment({
              orderId: paid.orderId,
              actorId: admin.id,
              reason: `Acceptance courier/refund race ${iteration}.`,
              restock: true
            })
          )
        ]);
        assert(refundResult.ok, `race ${iteration}: refund failed ${JSON.stringify(refundResult)}`);
        if (!courierResult.ok) {
          assert(
            courierResult.error.status === 409 && courierResult.error.code === "order_refunded",
            `race ${iteration}: courier error ${JSON.stringify(courierResult)}`
          );
        }

        const order = await prisma.order.findUniqueOrThrow({ where: { id: paid.orderId } });
        const finalDelivery = await deliveryOf(prisma, paid.orderId);
        const stock = await stockOf(prisma, fixture.productId);
        assert(order.status === "refunded" && order.paymentStatus === "refunded", `race ${iteration}: order ${order.status}/${order.paymentStatus}`);
        assert(finalDelivery?.status === "in_transit" || finalDelivery?.status === "delivered", `race ${iteration}: delivery ${finalDelivery?.status}`);
        assert(finalDelivery?.courierId === courier.id, `race ${iteration}: courier ${finalDelivery?.courierId}`);
        assert(stock.quantity === stockBefore.quantity && stock.reserved === 0, `race ${iteration}: stock ${stock.quantity}/${stock.reserved}`);
        assert(courierResult.ok ? finalDelivery?.status === "delivered" : finalDelivery?.status === "in_transit", `race ${iteration}: status mismatch`);
        await assertOrderTransactionsBalanced(prisma, paid.orderId, `courier/refund race ${iteration}`);
        summaries.push(
          `run ${iteration}: courier ${courierResult.ok ? "delivered first" : `409 ${courierResult.error.code}`}, final ${finalDelivery?.status}, stock ${stock.quantity}`
        );
      }
      return summaries.join("; ");
    });

    await check("6. Refund after delivery keeps delivered history and never restocks", async () => {
      const { fixture, paid } = await createPaidOrder(prisma, "delivered-refund", "test");
      const admin = await createUser(prisma, "delivered-admin", "ADMIN");
      const deliveryId = await deliverOrder({
        db: prisma,
        fixture,
        orderId: paid.orderId,
        adminId: admin.id,
        courierId: courier.id,
        courierUserId: courierUser.id
      });
      const stockBefore = await stockOf(prisma, fixture.productId);
      const refund = (await refundPayment({
        orderId: paid.orderId,
        actorId: admin.id,
        reason: "Acceptance refund after delivery.",
        restock: true
      })) as unknown as RefundCompletion;
      const order = await prisma.order.findUniqueOrThrow({ where: { id: paid.orderId } });
      const delivery = await deliveryOf(prisma, paid.orderId);
      const stock = await stockOf(prisma, fixture.productId);
      assert(refund.restocked === false, `delivered refund restocked ${refund.restocked}`);
      assert(refund.deliveryCustody === "delivered", `delivered custody ${refund.deliveryCustody}`);
      assert(order.status === "refunded" && order.paymentStatus === "refunded", `order ${order.status}/${order.paymentStatus}`);
      assert(delivery?.status === "delivered" && delivery.id === deliveryId, `delivery ${delivery?.status}`);
      assert(stock.quantity === stockBefore.quantity && stock.reserved === 0, `stock ${stockBefore.quantity}->${stock.quantity}`);
      const returnRow = await prisma.returnRequest.count({ where: { orderId: paid.orderId } });
      assert(returnRow === 0, `refund invented a return row (${returnRow})`);
      await assertOrderTransactionsBalanced(prisma, paid.orderId, "refund after delivered");
      return `external paid order stayed delivered; no restock; stock ${stock.quantity}; no return row invented`;
    });

    await check("7. Assignment racing cancellation and stale-courier rejection", async () => {
      const summaries: string[] = [];
      for (let iteration = 1; iteration <= 2; iteration += 1) {
        const { fixture, paid } = await createPaidOrder(prisma, `assign-cancel-${iteration}`);
        await advanceToReady(prisma, fixture, paid.orderId);
        const delivery = await deliveryOf(prisma, paid.orderId);
        assert(delivery, `assign race ${iteration}: no delivery`);
        const admin = await createUser(prisma, `assign-race-admin-${iteration}`, "ADMIN");
        const [assignment, cancellation] = await Promise.all([
          statusOf(assignCourier({ adminId: admin.id, deliveryId: delivery.id, courierId: courier.id })),
          statusOf(
            adminUpdateOrderStatus({
              adminId: admin.id,
              orderId: paid.orderId,
              status: "cancelled",
              note: `Acceptance assignment/cancellation race ${iteration}.`
            })
          )
        ]);
        assert(cancellation.ok, `assign race ${iteration}: cancellation failed ${JSON.stringify(cancellation)}`);
        if (!assignment.ok) {
          assert([409, 503].includes(assignment.error.status), `assign race ${iteration}: ${JSON.stringify(assignment)}`);
        }
        const order = await prisma.order.findUniqueOrThrow({ where: { id: paid.orderId } });
        const finalDelivery = await deliveryOf(prisma, paid.orderId);
        const stock = await stockOf(prisma, fixture.productId);
        assert(order.status === "refunded" && order.paymentStatus === "refunded", `assign race ${iteration}: order ${order.status}/${order.paymentStatus}`);
        assert(finalDelivery?.status === "cancelled" && finalDelivery.courierId === null, `assign race ${iteration}: delivery ${finalDelivery?.status}/${finalDelivery?.courierId}`);
        assert(stock.quantity === fixture.originalQuantity && stock.reserved === 0, `assign race ${iteration}: stock ${stock.quantity}/${stock.reserved}`);
        await assertOrderTransactionsBalanced(prisma, paid.orderId, `assign/cancel race ${iteration}`);
        summaries.push(`run ${iteration}: assignment ${assignment.ok ? "committed then cancelled" : `409 ${assignment.error.code}`}`);
      }

      const { fixture, paid } = await createPaidOrder(prisma, "stale-courier");
      const admin = await createUser(prisma, "stale-admin", "ADMIN");
      await advanceToReady(prisma, fixture, paid.orderId);
      const delivery = await deliveryOf(prisma, paid.orderId);
      assert(delivery, "stale courier: no delivery");
      const second = await createCourier(prisma, "second");
      await assignCourier({ adminId: admin.id, deliveryId: delivery.id, courierId: courier.id });
      await assignCourier({ adminId: admin.id, deliveryId: delivery.id, courierId: second.courier.id });
      const stale = await statusOf(
        updateCourierDelivery({ userId: courierUser.id, deliveryId: delivery.id, status: "pickup_started" })
      );
      assert(!stale.ok && stale.error.status === 403, `stale courier result ${JSON.stringify(stale)}`);
      const current = await updateCourierDelivery({
        userId: second.user.id,
        deliveryId: delivery.id,
        status: "pickup_started"
      });
      assert(current.status === "pickup_started", `current courier status ${current.status}`);
      summaries.push("reassigned courier accepted; stale courier 403");
      return summaries.join("; ");
    });

    await check("8. Concurrent duplicate payment confirmations return one settled and one duplicate", async () => {
      const summaries: string[] = [];
      for (const provider of ["wallet", "test"] as const) {
        const fixture = await createFixture(prisma, `dup-${provider}`);
        if (provider === "wallet") await fundWallet(prisma, fixture);
        const created = await runCheckout(fixture);
        const { initializePayment, confirmPayment } = await import("../lib/payments/service");
        const init = await initializePayment({
          orderId: created.orders[0].orderId,
          userId: fixture.userId,
          provider,
          callbackUrl: "http://localhost/orders/callback"
        });
        const [first, second] = await Promise.all([
          statusOf(confirmPayment({ reference: init.reference, provider })),
          statusOf(confirmPayment({ reference: init.reference, provider }))
        ]);
        assert(first.ok && second.ok, `duplicate ${provider} errors ${JSON.stringify([first, second])}`);
        const flags = [first.value.duplicate, second.value.duplicate].sort();
        assert(flags[0] === false && flags[1] === true, `duplicate ${provider} flags ${JSON.stringify(flags)}`);
        const retry = await confirmPayment({ reference: init.reference, provider });
        assert(retry.duplicate === true, `duplicate ${provider} retry flag ${retry.duplicate}`);
        const escrowCount = await prisma.escrowHold.count({ where: { orderId: created.orders[0].orderId } });
        const holdCount = await prisma.walletTransaction.count({
          where: { orderId: created.orders[0].orderId, type: "hold" }
        });
        const deliveryCount = await prisma.delivery.count({ where: { orderId: created.orders[0].orderId } });
        assert(escrowCount === 1, `duplicate ${provider} escrow rows ${escrowCount}`);
        assert(holdCount === 1, `duplicate ${provider} hold transactions ${holdCount}`);
        assert(deliveryCount === 1, `duplicate ${provider} deliveries ${deliveryCount}`);
        const order = await prisma.order.findUniqueOrThrow({ where: { id: created.orders[0].orderId } });
        assert(order.paymentStatus === "paid", `duplicate ${provider} order ${order.paymentStatus}`);
        await assertOrderTransactionsBalanced(prisma, order.id, `duplicate confirmation ${provider}`);
        summaries.push(`${provider}: one false + one true, retry true, escrow=1 hold=1 delivery=1`);
      }
      return summaries.join("; ");
    });

    await check("9. Seller return receipt survives a definitive refund failure and retries idempotently", async () => {
      const { fixture, paid } = await createPaidOrder(prisma, "seller-return", "test");
      const admin = await createUser(prisma, "return-admin", "ADMIN");
      await deliverOrder({
        db: prisma,
        fixture,
        orderId: paid.orderId,
        adminId: admin.id,
        courierId: courier.id,
        courierUserId: courierUser.id
      });
      const stockAfterDelivery = await stockOf(prisma, fixture.productId);
      const request = await requestReturn({
        userId: fixture.userId,
        orderId: paid.orderId,
        reason: "Acceptance return: item not as described.",
        detail: "Isolated fixture only."
      });
      const approved = await resolveReturn(fixture.vendorOwnerId, request.id, "approve");
      assert(approved.status === "APPROVED", `return approval ${approved.status}`);

      const otherOwner = await createUser(prisma, "other-seller", "VENDOR");
      await prisma.vendor.create({
        data: {
          ownerId: otherOwner.id,
          name: `Other seller ${RUN_ID}`,
          slug: `clc-other-${RUN_ID}`.toLowerCase(),
          market: "Isolated acceptance fixture market",
          description: "Isolated fixture vendor.",
          pickupAddress: "2 Isolated Closure Way",
          pickupPhone: "+2348000000002",
          status: "VERIFIED"
        }
      });
      const foreign = await statusOf(resolveReturn(otherOwner.id, request.id, "receive"));
      assert(!foreign.ok && foreign.error.status === 403, `foreign seller result ${JSON.stringify(foreign)}`);
      const stockAfterForeign = await stockOf(prisma, fixture.productId);
      assert(stockAfterForeign.quantity === stockAfterDelivery.quantity, "foreign seller changed stock");

      const adapter = adapters.test as { refund: (input: unknown) => Promise<unknown> };
      const originalRefund = adapter.refund;
      let providerRefundCalls = 0;
      adapter.refund = async () => {
        providerRefundCalls += 1;
        throw new PaymentProviderError("Simulated definitive provider rejection", 400);
      };
      const failed = await statusOf(resolveReturn(fixture.vendorOwnerId, request.id, "receive"));
      assert(!failed.ok, "simulated provider rejection unexpectedly succeeded");
      assert(failed.error.code === "refund_failed", `failure code ${failed.error.code}`);
      const afterFailure = await prisma.returnRequest.findUniqueOrThrow({ where: { id: request.id } });
      const stockAfterFailure = await stockOf(prisma, fixture.productId);
      const failedRefunds = await prisma.refund.findMany({
        where: { orderId: paid.orderId, status: "FAILED" },
        orderBy: { createdAt: "asc" }
      });
      const orderAfterFailure = await prisma.order.findUniqueOrThrow({ where: { id: paid.orderId } });
      assert(afterFailure.status === "RECEIVED" && afterFailure.restocked, `after failure ${afterFailure.status}/${afterFailure.restocked}`);
      assert(stockAfterFailure.quantity === fixture.originalQuantity, `after failure stock ${stockAfterFailure.quantity}`);
      assert(failedRefunds.length === 1 && failedRefunds[0].idempotencyKey === `return:${request.id}:1`, "attempt 1 not persisted as FAILED");
      assert(orderAfterFailure.refundedKobo === BigInt(0), `failure left reservation ${orderAfterFailure.refundedKobo}`);
      assert(providerRefundCalls === 1, `provider calls after failure ${providerRefundCalls}`);

      adapter.refund = originalRefund;
      const recovered = await resolveReturn(fixture.vendorOwnerId, request.id, "receive");
      assert(recovered.status === "REFUNDED", `recovered status ${recovered.status}`);
      const refunds = await prisma.refund.findMany({
        where: { orderId: paid.orderId },
        orderBy: { createdAt: "asc" }
      });
      const completed = await completedRefundSum(prisma, paid.orderId);
      const stockAfterRecovery = await stockOf(prisma, fixture.productId);
      const order = await prisma.order.findUniqueOrThrow({ where: { id: paid.orderId } });
      const delivery = await deliveryOf(prisma, paid.orderId);
      assert(refunds.length === 2, `expected 2 refund attempts, got ${refunds.length}`);
      assert(refunds[0].status === "FAILED" && refunds[0].idempotencyKey === `return:${request.id}:1`, "first attempt history lost");
      assert(refunds[1].status === "COMPLETED" && refunds[1].idempotencyKey === `return:${request.id}:2`, "second attempt not used");
      assert(completed === paid.totalKobo, `completed refunds ${completed} != ${paid.totalKobo}`);
      assert(stockAfterRecovery.quantity === fixture.originalQuantity, `recovery restocked twice: ${stockAfterRecovery.quantity}`);
      assert(order.status === "refunded" && order.paymentStatus === "refunded", `recovered order ${order.status}/${order.paymentStatus}`);
      assert(delivery?.status === "delivered", `recovered delivery ${delivery?.status}`);
      const intentEvents = await prisma.systemEvent.count({
        where: { type: "return.refund_intent", entity: "ReturnRequest", entityId: request.id }
      });
      assert(intentEvents === 2, `intent events ${intentEvents}, expected 2`);

      const idempotentReplay = await resolveReturn(fixture.vendorOwnerId, request.id, "receive");
      assert(idempotentReplay.status === "REFUNDED", `replay status ${idempotentReplay.status}`);
      const replayRows = await prisma.refund.count({ where: { orderId: paid.orderId } });
      assert(replayRows === 2, `replay created refund rows ${replayRows}`);

      // Simulate a crash after the provider/refund committed but before the
      // return status was finalised, by putting the isolated test row back into
      // RECEIVED. The retry must settle from stored evidence without a new
      // refund or provider call.
      await prisma.returnRequest.update({ where: { id: request.id }, data: { status: "RECEIVED" } });
      const callsBeforeRecovery = providerRefundCalls;
      const finalized = await resolveReturn(fixture.vendorOwnerId, request.id, "receive");
      const callsAfterRecovery = providerRefundCalls;
      const finalRows = await prisma.refund.count({ where: { orderId: paid.orderId } });
      assert(finalized.status === "REFUNDED", `crash recovery status ${finalized.status}`);
      assert(callsAfterRecovery === callsBeforeRecovery, `crash recovery called the provider ${callsAfterRecovery - callsBeforeRecovery} time(s)`);
      assert(finalRows === 2, `crash recovery created refund rows ${finalRows}`);
      await assertOrderTransactionsBalanced(prisma, paid.orderId, "seller return recovery");
      return `attempt 1 FAILED then attempt 2 COMPLETED; stock restored once; crash-before-finalise settled from evidence without a provider call`;
    });

    await check("10. Cart mutation racing checkout keeps one order and a consistent reservation", async () => {
      const { checkout } = await import("../lib/services/core/checkout.service");
      const summaries: string[] = [];
      for (let iteration = 1; iteration <= 2; iteration += 1) {
        const fixture = await createFixture(prisma, `cart-race-${iteration}`, 5);
        await fundWallet(prisma, fixture);
        const [checkoutResult, mutationResult] = await Promise.all([
          statusOf(checkout({ userId: fixture.userId, address })),
          statusOf(addCartItem({ userId: fixture.userId, productId: fixture.productId, quantity: 1 }))
        ]);
        assert(checkoutResult.ok, `cart race ${iteration}: checkout failed ${JSON.stringify(checkoutResult)}`);
        if (!mutationResult.ok) {
          assert([400, 404, 409].includes(mutationResult.error.status), `cart race ${iteration}: mutation ${JSON.stringify(mutationResult)}`);
        }
        const orders = await prisma.order.findMany({
          where: { cartId: fixture.cartId },
          include: { items: true }
        });
        assert(orders.length === 1, `cart race ${iteration}: ${orders.length} orders`);
        const orderedQuantity = orders[0].items.reduce((sum, item) => sum + item.quantity, 0);
        const stock = await stockOf(prisma, fixture.productId);
        assert(stock.reserved === orderedQuantity, `cart race ${iteration}: reserved ${stock.reserved} != ordered ${orderedQuantity}`);
        assert(orderedQuantity === 1 || orderedQuantity === 2, `cart race ${iteration}: ordered ${orderedQuantity}`);
        const orphanItems = await prisma.cartItem.count({
          where: { cart: { id: fixture.cartId, status: "CHECKED_OUT" } }
        });
        const retry = await statusOf(checkout({ userId: fixture.userId, address }));
        assert(!retry.ok && (retry.error.code === "checkout_already_completed" || retry.error.code === "empty_cart"), `cart race ${iteration}: retry ${JSON.stringify(retry)}`);
        // Leave no reservation behind from this acceptance fixture.
        const { cancelOrder } = await import("../lib/services/core/checkout.service");
        const cancelled = await cancelOrder({
          orderId: orders[0].id,
          userId: fixture.userId,
          reason: "Acceptance cart-race cleanup."
        });
        assert(cancelled.cancelled && !cancelled.refunded, `cart race ${iteration}: cleanup ${JSON.stringify(cancelled)}`);
        const released = await stockOf(prisma, fixture.productId);
        assert(released.reserved === 0, `cart race ${iteration}: cleanup left reserved ${released.reserved}`);
        summaries.push(`run ${iteration}: ordered ${orderedQuantity}, reserved ${stock.reserved}, mutation ${mutationResult.ok ? "applied" : `409 ${mutationResult.error.code}`}, checked-out cart items ${orphanItems}`);
      }
      return summaries.join("; ");
    });

    await check("11. Whole-book journals, wallet projections and reconciliation are clean", async () => {
      const wallets = await prisma.wallet.findMany({
        select: { id: true, ownerType: true, availableKobo: true, heldKobo: true }
      });
      // The SYSTEM wallet is intentionally negative on its available side while
      // it holds externally funded escrow (the counterpart credit is the
      // vendor's held payable). Customer/vendor/courier/driver wallets must
      // never be negative.
      const negative = wallets.filter(
        (wallet) =>
          wallet.ownerType !== "SYSTEM" &&
          (wallet.availableKobo < BigInt(0) || wallet.heldKobo < BigInt(0))
      );
      assert(negative.length === 0, `negative wallet projections: ${negative.map((wallet) => wallet.id).join(",")}`);

      const openReservations = await prisma.inventoryStock.findMany({ where: { reserved: { gt: 0 } } });
      assert(openReservations.length === 0, `unreleased reservations: ${openReservations.map((row) => row.productId).join(",")}`);

      const orders = await prisma.order.findMany({ select: { id: true } });
      for (const order of orders) {
        const txs = await prisma.walletTransaction.count({ where: { orderId: order.id } });
        if (txs > 0) await assertOrderTransactionsBalanced(prisma, order.id, "whole-book");
      }

      const report = await reconcile();
      assert(report.totals.differenceKobo === "0", `journal difference ${report.totals.differenceKobo}`);
      const serious = report.issues.filter((issue) => issue.severity === "broken" || issue.severity === "unexplained");
      assert(
        serious.length === 0,
        `reconciliation issues: ${serious
          .slice(0, 3)
          .map((issue) => `${issue.kind}/${issue.subject}: ${issue.detail}`)
          .join(" | ")}`
      );
      return `wallets=${wallets.length}, no negative projections, no open reservations, ${orders.length} orders balanced, difference=0, status=${report.status}, issues=${report.issues.length}`;
    });
  } finally {
    console.log(JSON.stringify({ database: EXPECTED_DATABASE, runId: RUN_ID, checks, failures }, null, 2));
    await prisma.$disconnect();
  }

  process.exit(failures ? 1 : 0);
}

main().catch(async (error) => {
  console.error("FATAL", error instanceof Error ? error.message : error);
  process.exit(1);
});
