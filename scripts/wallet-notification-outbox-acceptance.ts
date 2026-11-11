/**
 * Wallet notification outbox acceptance.
 *
 * Proves the payment transaction no longer depends on notification delivery and
 * no longer asks the global Prisma client for a connection while it holds a
 * transaction:
 *
 *   1. A real wallet checkout pays with `connection_limit=1` and commits.
 *   2. The vendor notification is a `NotificationIntent` row written by the same
 *      transaction, not a `PartnerNotification` row written by a nested client.
 *   3. A notification delivery failure does not undo or change the payment.
 *   4. Replaying the intent (worker crash/retry) produces one customer-visible
 *      feed row, not two.
 *   5. A rolled-back payment and a rolled-back status transaction leave no
 *      success intent and no success notification.
 *
 * Database safety: the URL is derived from .env by replacing only the database
 * path with `naijadeals_wallet_acceptance`; `current_database()` is the hard
 * guard. Valkey is disabled so no external queue participates. No real charge,
 * payout, push or deployment is involved.
 *
 * Usage:
 *   npx tsx scripts/wallet-notification-outbox-acceptance.ts
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";

const DB = "naijadeals_wallet_acceptance";
const RUN_ID = `${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${randomBytes(4).toString("hex")}`;
const FUNDING_KOBO = BigInt(175_000);
const REPO_ROOT = path.resolve(__dirname, "..");
const TSX_CLI = path.join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs");

type CheckResult = { name: string; pass: boolean; detail: string };
const checks: CheckResult[] = [];
let failures = 0;

function record(name: string, pass: boolean, detail: string) {
  checks.push({ name, pass, detail });
  if (!pass) failures += 1;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function acceptanceUrl(connectionLimit?: number) {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set in .env.");
  const url = new URL(raw);
  url.pathname = `/${DB}`;
  if (connectionLimit) url.searchParams.set("connection_limit", String(connectionLimit));
  return url.toString();
}

async function readWallet(prisma: PrismaClient, walletId: string) {
  return prisma.wallet.findUniqueOrThrow({
    where: { id: walletId },
    select: { id: true, ownerType: true, availableKobo: true, heldKobo: true }
  });
}

async function ensureCity(prisma: PrismaClient) {
  await prisma.citySetting.upsert({
    where: { countryCode_code: { countryCode: "NG", code: "lagos" } },
    update: { name: "Lagos", enabled: true },
    create: { countryCode: "NG", code: "lagos", name: "Lagos", enabled: true }
  });
}

async function fixture(prisma: PrismaClient, label: string) {
  const lower = RUN_ID.toLowerCase();
  const user = await prisma.user.create({
    data: {
      email: `wc-outbox-${RUN_ID}-${label}@example.test`,
      name: `WC outbox ${label}`,
      actorType: "CUSTOMER"
    }
  });
  const vendorOwner = await prisma.user.create({
    data: {
      email: `wc-outbox-${RUN_ID}-${label}-owner@example.test`,
      name: `WC outbox ${label} owner`,
      actorType: "VENDOR"
    }
  });
  const vendor = await prisma.vendor.create({
    data: {
      ownerId: vendorOwner.id,
      name: `WC outbox fixture vendor ${RUN_ID} ${label}`,
      slug: `wc-outbox-vendor-${lower}-${label}`,
      market: "Isolated acceptance fixture market",
      description: "Isolated notification outbox acceptance fixture. Not a real vendor.",
      pickupAddress: "1 Acceptance Fixture Way, Lagos",
      pickupPhone: "+2348000000000",
      status: "VERIFIED",
      commissionBps: 1000
    }
  });
  const category = await prisma.category.create({
    data: {
      name: `WC outbox fixture category ${RUN_ID} ${label}`,
      slug: `wc-outbox-category-${lower}-${label}`,
      description: "Isolated notification outbox acceptance fixture."
    }
  });
  const product = await prisma.product.create({
    data: {
      vendorId: vendor.id,
      categoryId: category.id,
      name: `WC outbox fixture product ${RUN_ID} ${label}`,
      slug: `wc-outbox-product-${lower}-${label}`,
      description: "Isolated notification outbox acceptance fixture product.",
      priceKobo: BigInt(4_951),
      status: "ACTIVE",
      isSample: false
    }
  });
  const stock = await prisma.inventoryStock.create({
    data: { productId: product.id, quantity: 5, reserved: 0 }
  });
  const cart = await prisma.cart.create({
    data: {
      userId: user.id,
      status: "ACTIVE",
      items: { create: { productId: product.id, quantity: 1 } }
    }
  });
  return { user, vendorOwner, vendor, category, product, stock, cart };
}

async function cleanupRun(prisma: PrismaClient) {
  const emailPrefix = `wc-outbox-${RUN_ID}-`;
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
  const carts = await prisma.cart.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
  const cartIds = carts.map((row) => row.id);
  const deliveries = await prisma.delivery.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } });
  const deliveryIds = deliveries.map((row) => row.id);
  const escrows = await prisma.escrowHold.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } });
  const escrowIds = escrows.map((row) => row.id);
  const wallets = await prisma.wallet.findMany({
    where: { OR: [{ userId: { in: userIds } }, { vendorId: { in: vendorIds } }] },
    select: { id: true }
  });
  const walletIds = wallets.map((row) => row.id);
  const topUps = await prisma.walletTopUp.findMany({ where: { walletId: { in: walletIds } }, select: { id: true } });
  const topUpIds = topUps.map((row) => row.id);
  const transactions = await prisma.walletTransaction.findMany({
    where: {
      OR: [
        { walletId: { in: walletIds } },
        { reference: { contains: RUN_ID } },
        { orderId: { in: orderIds } }
      ]
    },
    select: { id: true }
  });
  const transactionIds = transactions.map((row) => row.id);
  const intents = await prisma.notificationIntent.findMany({
    where: {
      OR: [
        { entityId: { in: [...orderIds, ...topUpIds] } },
        { dedupeKey: { contains: RUN_ID } },
        { recipientUserId: { in: userIds } }
      ]
    },
    select: { id: true }
  });
  const entityIds = [...orderIds, ...deliveryIds, ...escrowIds, ...productIds, ...vendorIds, ...categoryIds, ...transactionIds, ...topUpIds];

  // Reverse only the SYSTEM effects these fixtures created, before deleting the
  // journals. Top-ups debit SYSTEM available; wallet escrow holds credit SYSTEM
  // held. Nothing in this suite releases or refunds, so no other SYSTEM effect
  // exists.
  const system = await prisma.wallet.findFirst({ where: { ownerType: "SYSTEM" }, select: { id: true } });
  let systemAvailableDelta = BigInt(0);
  let systemHeldDelta = BigInt(0);
  if (system) {
    const fullTransactions = await prisma.walletTransaction.findMany({
      where: { id: { in: transactionIds } },
      include: { ledger: true }
    });
    for (const transaction of fullTransactions) {
      const legs = transaction.ledger.filter((leg) => leg.walletId === system.id);
      if (legs.length === 0) continue;
      if (transaction.type === "credit" && transaction.reference.includes(RUN_ID)) {
        const debit = legs.find((leg) => leg.direction === "DEBIT");
        systemAvailableDelta += debit?.amountKobo ?? BigInt(0);
      } else if (transaction.type === "hold" && transaction.reference.startsWith("ESCROW-HOLD-")) {
        const credit = legs.find((leg) => leg.direction === "CREDIT");
        systemHeldDelta -= credit?.amountKobo ?? BigInt(0);
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    if (system && (systemAvailableDelta !== BigInt(0) || systemHeldDelta !== BigInt(0))) {
      await tx.wallet.update({
        where: { id: system.id },
        data: { availableKobo: { increment: systemAvailableDelta }, heldKobo: { increment: systemHeldDelta } }
      });
    }
    await tx.notificationAttempt.deleteMany({ where: { notification: { OR: [{ userId: { in: userIds } }, { entityId: { in: entityIds } }] } } });
    await tx.notification.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { entityId: { in: entityIds } }] } });
    await tx.notificationIntent.deleteMany({ where: { id: { in: intents.map((row) => row.id) } } });
    await tx.partnerNotification.deleteMany({ where: { userId: { in: userIds } } });
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
    await tx.ledgerEntry.deleteMany({ where: { OR: [{ transactionId: { in: transactionIds } }, { walletId: { in: walletIds } }] } });
    await tx.walletTransaction.deleteMany({ where: { id: { in: transactionIds } } });
    await tx.order.deleteMany({ where: { id: { in: orderIds } } });
    await tx.cartItem.deleteMany({ where: { cartId: { in: cartIds } } });
    await tx.cart.deleteMany({ where: { id: { in: cartIds } } });
    await tx.walletTopUp.deleteMany({ where: { id: { in: topUpIds } } });
    await tx.wallet.deleteMany({ where: { id: { in: walletIds } } });
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
    (await prisma.order.count({ where: { id: { in: orderIds } } })) +
    (await prisma.notificationIntent.count({ where: { id: { in: intents.map((row) => row.id) } } }));
  return { users: userIds.length, wallets: walletIds.length, orders: orderIds.length, transactions: transactionIds.length, leftovers };
}

async function main(prisma: PrismaClient, url: string) {
  const { ensureWallet, initializePayment, confirmPayment } = await import("../lib/payments/service");
  const { checkout } = await import("../lib/services/core/checkout.service");
  const { updateOrderStatus } = await import("../lib/services/core/order.service");
  const { createTopUp, creditTopUp } = await import("../lib/services/core/topup.service");
  const { processIntents } = await import("../lib/notifications/intent.service");
  const { reconcile } = await import("../lib/services/core/reconciliation-correct");

  const db = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  assert(db[0]?.db === DB, `wrong database ${db[0]?.db ?? "unknown"}, expected ${DB}`);
  assert(url.includes("connection_limit=1"), "the acceptance URL must set connection_limit=1");

  await ensureCity(prisma);
  const system = await ensureWallet(prisma, { ownerType: "SYSTEM" });
  const systemBefore = await readWallet(prisma, system.id);
  const scenario = await fixture(prisma, "paid");

  const customerWallet = await ensureWallet(prisma, { userId: scenario.user.id, ownerType: "CUSTOMER" });
  const topUpKey = `outbox-topup-${RUN_ID}`;
  const topUp = await createTopUp(prisma, {
    walletId: customerWallet.id,
    amountKobo: FUNDING_KOBO,
    provider: "test",
    providerReference: `TEST-${topUpKey}`,
    idempotencyKey: topUpKey
  });
  const credited = await creditTopUp(prisma, {
    providerReference: topUp.topUp.providerReference,
    verifiedAmountKobo: FUNDING_KOBO,
    verifiedCurrency: "NGN",
    raw: { simulated: true, note: "Outbox acceptance TEST funding. Not a real payment." }
  });
  record(
    "real wallet funding credits exactly once through the funding service",
    credited.status === "credited" && (await readWallet(prisma, customerWallet.id)).availableKobo === FUNDING_KOBO,
    `top-up ${topUp.topUp.id} ${credited.status}`
  );

  const created = await checkout({
    userId: scenario.user.id,
    address: {
      contactName: "Outbox Acceptance",
      contactPhone: "08000000000",
      countryCode: "NG",
      state: "Lagos",
      city: "Lagos",
      line1: "1 Acceptance Fixture Way"
    }
  });
  const orderInfo = created.orders[0];
  assert(created.orders.length === 1, "checkout must create one order");
  assert(orderInfo.totalKobo === "155000", `expected the real 155,000-kobo total, got ${orderInfo.totalKobo}`);

  const init = await initializePayment({
    orderId: orderInfo.orderId,
    userId: scenario.user.id,
    provider: "wallet",
    callbackUrl: "http://localhost:3000/orders"
  });
  assert(init.reference.length > 0, "payment reference missing");

  const beforeIntents = await prisma.notificationIntent.count({ where: { entityId: orderInfo.orderId } });
  assert(beforeIntents === 0, "an unpaid order already has a notification intent");

  let paymentError: unknown = null;
  let paid: { status: string; orderId: string; duplicate: boolean } | null = null;
  // This call is the regression test for the P2028 nested-client failure: the
  // whole payment transaction runs while the pool has exactly one connection.
  try {
    paid = await confirmPayment({ reference: init.reference, provider: "wallet" });
  } catch (error) {
    paymentError = error;
  }
  const paidOrder = await prisma.order.findUniqueOrThrow({
    where: { id: orderInfo.orderId },
    include: { payments: true, escrowHolds: true, deliveries: true }
  });
  const intents = await prisma.notificationIntent.findMany({
    where: { entityId: orderInfo.orderId, eventType: "order.paid.vendor" }
  });
  record(
    "wallet payment commits with connection_limit=1 (no P2028 nested-client failure)",
    paymentError === null &&
      paid?.status === "COMPLETED" &&
      paidOrder.paymentStatus === "paid" &&
      paidOrder.payments.some((payment) => payment.status === "COMPLETED") &&
      paidOrder.escrowHolds.length === 1 &&
      paidOrder.deliveries.length === 1,
    paymentError
      ? `error ${(paymentError as { code?: string; message?: string }).code ?? ""} ${String((paymentError as { message?: string }).message).slice(0, 120)}`
      : `order ${paidOrder.paymentStatus}, escrow ${paidOrder.escrowHolds[0]?.status}, delivery ${paidOrder.deliveries[0]?.status}`
  );

  record(
    "the vendor notification is one durable intent addressed to the vendor owner",
    intents.length === 1 &&
      intents[0].status === "PENDING" &&
      intents[0].recipientUserId === scenario.vendorOwner.id &&
      String((intents[0].payload as { orderNumber?: string }).orderNumber) === orderInfo.orderNumber,
    intents.length === 0
      ? "no intent"
      : `intent ${intents[0].id.slice(0, 8)} ${intents[0].status} -> ${intents[0].recipientUserId === scenario.vendorOwner.id ? "vendor owner" : "wrong user"}`
  );
  const feedBeforeDelivery = await prisma.partnerNotification.count({ where: { userId: scenario.vendorOwner.id } });
  record(
    "no vendor feed row exists before the outbox worker runs",
    feedBeforeDelivery === 0,
    `feed rows ${feedBeforeDelivery}`
  );

  // A notification failure must not touch the committed payment. A synthetic
  // intent with a non-existent recipient forces the worker's notify() to fail;
  // the real payment and its intent are untouched.
  const failingKey = `outbox-failure-${RUN_ID}`;
  const failingIntent = await prisma.notificationIntent.create({
    data: {
      dedupeKey: failingKey,
      eventType: "order.paid.vendor",
      entityType: "Order",
      entityId: orderInfo.orderId,
      recipientUserId: `missing-${RUN_ID}`,
      payload: { orderNumber: orderInfo.orderNumber, href: "/seller" },
      // Due before the real intent so a limit-1 batch claims only the failing
      // row; the real delivery is asserted separately below.
      nextAttemptAt: new Date(Date.now() - 3_600_000)
    }
  });
  const failureRun = await processIntents(`outbox-failure-${process.pid}`, 1);
  const failedIntent = await prisma.notificationIntent.findUniqueOrThrow({ where: { id: failingIntent.id } });
  const paymentAfterFailure = await prisma.payment.findFirstOrThrow({
    where: { orderId: orderInfo.orderId, status: "COMPLETED" }
  });
  record(
    "a notification failure leaves the committed payment and escrow untouched",
    failureRun.retried >= 1 &&
      failedIntent.status === "PENDING" &&
      Boolean(failedIntent.lastError) &&
      paymentAfterFailure.status === "COMPLETED" &&
      (await prisma.escrowHold.count({ where: { orderId: orderInfo.orderId, status: "held" } })) === 1,
    `intent ${failedIntent.status} attempts ${failedIntent.attempts} error ${(failedIntent.lastError ?? "").slice(0, 60)}; payment ${paymentAfterFailure.status}`
  );
  await prisma.notificationIntent.delete({ where: { id: failingIntent.id } });

  const firstDelivery = await processIntents(`outbox-first-${process.pid}`, 5);
  const vendorFeed = await prisma.partnerNotification.findMany({ where: { userId: scenario.vendorOwner.id } });
  const vendorNotifications = await prisma.notification.findMany({
    where: { userId: scenario.vendorOwner.id, eventType: "order.paid.vendor" }
  });
  record(
    "the worker delivers exactly one vendor feed row and marks the intent processed",
    firstDelivery.processed >= 1 &&
      vendorFeed.length === 1 &&
      vendorNotifications.length === 1 &&
      vendorNotifications[0].status === "SENT" &&
      (await prisma.notificationIntent.findUniqueOrThrow({ where: { id: intents[0].id } })).status === "PROCESSED",
    `processed ${firstDelivery.processed}, feed ${vendorFeed.length}, notification ${vendorNotifications[0]?.status ?? "none"}`
  );

  // Simulate a worker that delivered but died before recording completion: the
  // intent is reset to PENDING and processed again. The notification dedupe key
  // and the delivery claim must keep the feed at one row.
  await prisma.notificationIntent.update({
    where: { id: intents[0].id },
    data: { status: "PENDING", processedAt: null, leaseOwner: null, leaseToken: null, leaseExpiresAt: null, nextAttemptAt: new Date() }
  });
  const replay = await processIntents(`outbox-replay-${process.pid}`, 5);
  const vendorFeedAfterReplay = await prisma.partnerNotification.count({ where: { userId: scenario.vendorOwner.id } });
  record(
    "replaying a delivered intent does not duplicate the customer-visible event",
    replay.processed >= 1 && vendorFeedAfterReplay === 1,
    `processed ${replay.processed}, feed rows ${vendorFeedAfterReplay}`
  );

  const duplicatePayment = await confirmPayment({ reference: init.reference, provider: "wallet" });
  const vendorFeedAfterDuplicatePayment = await prisma.partnerNotification.count({ where: { userId: scenario.vendorOwner.id } });
  record(
    "a duplicate payment confirmation adds no intent or feed row",
    duplicatePayment.duplicate === true &&
      vendorFeedAfterDuplicatePayment === 1 &&
      (await prisma.notificationIntent.count({ where: { entityId: orderInfo.orderId, eventType: "order.paid.vendor" } })) === 1,
    `duplicate ${duplicatePayment.duplicate}, feed ${vendorFeedAfterDuplicatePayment}`
  );

  // Rolled-back payment: an unfunded customer cannot pay, so the transaction
  // that would create the intent rolls back. No success notification may exist.
  const poor = await fixture(prisma, "poor");
  const poorCreated = await checkout({
    userId: poor.user.id,
    address: {
      contactName: "Outbox Poor",
      contactPhone: "08000000001",
      countryCode: "NG",
      state: "Lagos",
      city: "Lagos",
      line1: "2 Acceptance Fixture Way"
    }
  });
  const poorOrder = poorCreated.orders[0];
  const poorInit = await initializePayment({
    orderId: poorOrder.orderId,
    userId: poor.user.id,
    provider: "wallet",
    callbackUrl: "http://localhost:3000/orders"
  });
  let poorError: unknown = null;
  try {
    await confirmPayment({ reference: poorInit.reference, provider: "wallet" });
  } catch (error) {
    poorError = error;
  }
  const poorState = await prisma.order.findUniqueOrThrow({
    where: { id: poorOrder.orderId },
    include: { payments: true, escrowHolds: true }
  });
  record(
    "a rolled-back payment produces no success intent and no success notification",
    (poorError as { code?: string })?.code === "insufficient_wallet" &&
      poorState.paymentStatus === "pending" &&
      poorState.payments.every((payment) => payment.status !== "COMPLETED") &&
      poorState.escrowHolds.length === 0 &&
      (await prisma.notificationIntent.count({ where: { entityId: poorOrder.orderId } })) === 0 &&
      (await prisma.partnerNotification.count({ where: { userId: poor.vendorOwner.id } })) === 0,
    poorError ? `error ${(poorError as { code?: string }).code ?? "unknown"}` : "payment unexpectedly succeeded"
  );

  // Outbox transactionality on the status path itself: the status transition
  // and its intent commit or roll back together.
  await prisma.order.update({ where: { id: poorOrder.orderId }, data: { status: "escrow_held" } });
  let rolledBack = false;
  try {
    await prisma.$transaction(async (tx) => {
      await updateOrderStatus({
        tx,
        actorId: scenario.user.id,
        orderId: poorOrder.orderId,
        status: "vendor_notified",
        note: "Forced rollback acceptance check."
      });
      throw new Error("forced_rollback_after_intent");
    });
  } catch (error) {
    rolledBack = (error as Error).message === "forced_rollback_after_intent";
  }
  const orderAfterRollback = await prisma.order.findUniqueOrThrow({ where: { id: poorOrder.orderId } });
  record(
    "a rolled-back status transaction leaves no intent and no status change",
    rolledBack &&
      orderAfterRollback.status === "escrow_held" &&
      (await prisma.notificationIntent.count({ where: { entityId: poorOrder.orderId } })) === 0,
    `status ${orderAfterRollback.status}, intents ${await prisma.notificationIntent.count({ where: { entityId: poorOrder.orderId } })}`
  );

  const systemAfter = await readWallet(prisma, system.id);
  const cleanup = await cleanupRun(prisma);
  const systemRestored = await readWallet(prisma, system.id);
  const reconciliation = await reconcile();
  const reconcileCli = spawnSync(
    process.execPath,
    [TSX_CLI, path.join(REPO_ROOT, "scripts", "wallet-reconcile.ts")],
    {
      cwd: REPO_ROOT,
      env: { ...process.env, DATABASE_URL: url, RECONCILE_DB: DB, VALKEY_URL: "" },
      encoding: "utf8",
      timeout: 120_000
    }
  );
  let reconcileReport: { status?: string; mismatches?: number; duplicateIdentities?: number } = {};
  try {
    reconcileReport = JSON.parse(reconcileCli.stdout);
  } catch {
    reconcileReport = {};
  }
  record(
    "fixture cleanup removes every run row and restores the SYSTEM projection",
    cleanup.leftovers === 0 &&
      systemRestored.availableKobo === systemBefore.availableKobo &&
      systemRestored.heldKobo === systemBefore.heldKobo &&
      systemAfter.availableKobo !== systemRestored.availableKobo,
    `leftovers ${cleanup.leftovers}, SYSTEM ${systemBefore.availableKobo}/${systemBefore.heldKobo} -> after ${systemAfter.availableKobo}/${systemAfter.heldKobo} -> restored ${systemRestored.availableKobo}/${systemRestored.heldKobo}`
  );
  record(
    "books reconcile after cleanup",
    reconciliation.issues.length === 0 && reconcileReport.status === "CLEAN",
    `reconcile issues ${reconciliation.issues.length}, cli ${reconcileReport.status ?? reconcileCli.status}`
  );

  console.log(JSON.stringify({
    runId: RUN_ID,
    database: DB,
    checks,
    failures,
    cleanup,
    reconciliation: { issues: reconciliation.issues.length, totals: reconciliation.totals },
    reconcileCli: reconcileReport,
    status: failures === 0 ? "PASS" : "FAIL"
  }, (key, value) => (typeof value === "bigint" ? value.toString() : value), 2));
}

async function run() {
  process.env.VALKEY_URL = "";
  const url = acceptanceUrl(1);
  process.env.DATABASE_URL = url;
  const { prisma } = await import("../lib/prisma");
  try {
    await main(prisma, url);
  } catch (error) {
    try {
      await cleanupRun(prisma);
    } catch (cleanupError) {
      process.stderr.write(`cleanup after failure failed: ${String(cleanupError)}\n`);
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
