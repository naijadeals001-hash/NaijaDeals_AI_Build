/**
 * Post-release refund and SYSTEM-position acceptance.
 *
 * Part 1 traces every SYSTEM wallet posting and reconciles the stored position
 * against the shared journal/hold interpretation. The current acceptance
 * database has a negative SYSTEM balance because TEST funding is issued from
 * SYSTEM; this section proves whether that is a broken projection, an invalid
 * fixture or the account model.
 *
 * Part 2 runs a legitimately funded wallet cycle through the real services:
 *
 *   creditTopUp -> checkout -> wallet payment -> escrow -> delivered ->
 *   completeOrder (release) -> post-release partial refund.
 *
 * The post-release refund is expected to be refused while SYSTEM is negative:
 * the seller's payable is still available, but the platform-share reversal has
 * no platform liquidity because every TEST kobo was issued out of SYSTEM. The
 * refusal must leave no claim, no Refund row, no journal and no wallet change.
 *
 * Part 3 runs the same recovery against an open escrow (before release), where
 * it is funded by the seller's held payable and therefore must succeed:
 * partial refund -> remaining refund, buyer credited exactly, seller hold
 * reduced exactly, platform untouched.
 *
 * Part 4 exercises duplicate, retried, concurrent and invalid refund requests,
 * including two concurrent requests carrying the same idempotency key.
 *
 * Database safety: the URL is derived from .env by replacing only the database
 * path with `naijadeals_wallet_acceptance`; `current_database()` is the guard.
 * Valkey is disabled. No real charge, payout, push or deployment is involved.
 *
 * Usage:
 *   npx tsx scripts/wallet-post-release-refund-acceptance.ts
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";

const DB = "naijadeals_wallet_acceptance";
const RUN_ID = `${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${randomBytes(4).toString("hex")}`;
const REPO_ROOT = path.resolve(__dirname, "..");
const TSX_CLI = path.join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const SHOP_SUBTOTAL_KOBO = BigInt(4_951);
const ORDER_TOTAL_KOBO = BigInt(155_000);

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
  totalKobo: bigint;
  payableKobo?: bigint;
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

function acceptanceUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set in .env.");
  const url = new URL(raw);
  url.pathname = `/${DB}`;
  return url.toString();
}

function snapshot(wallet: { availableKobo: bigint; heldKobo: bigint }): WalletSnapshot {
  return { available: wallet.availableKobo.toString(), held: wallet.heldKobo.toString() };
}

async function readWallet(prisma: PrismaClient, walletId: string) {
  return prisma.wallet.findUniqueOrThrow({
    where: { id: walletId },
    select: { id: true, ownerType: true, availableKobo: true, heldKobo: true }
  });
}

async function walletFor(prisma: PrismaClient, scenario: Scenario) {
  return readWallet(prisma, scenario.walletId);
}

async function vendorWalletFor(prisma: PrismaClient, scenario: Scenario) {
  const wallet = await prisma.wallet.findFirst({ where: { vendorId: scenario.vendorId, ownerType: "VENDOR" } });
  if (!wallet) throw new Error("vendor wallet missing");
  return readWallet(prisma, wallet.id);
}

async function statusOf(promise: Promise<unknown>) {
  try {
    await promise;
    return { ok: true as const, status: 200, code: "ok", message: "" };
  } catch (error) {
    const typed = error as { status?: number; code?: string; message?: string };
    return {
      ok: false as const,
      status: typed.status ?? 500,
      code: typed.code ?? "unknown",
      message: (typed.message ?? String(error)).slice(0, 160)
    };
  }
}

async function ensureCity(prisma: PrismaClient) {
  await prisma.citySetting.upsert({
    where: { countryCode_code: { countryCode: "NG", code: "lagos" } },
    update: { name: "Lagos", enabled: true },
    create: { countryCode: "NG", code: "lagos", name: "Lagos", enabled: true }
  });
}

/* ------------------------------------------------------------- forensics --- */

const FUNDING_PATTERN = /^(WC-SPEND-FUND-|WC-SPEND-RIDE-FUND-|TOPUP-|STREAM-PREMIUM-TEST-TOPUP-|.*ACCEPTANCE-FUND-)/;

type SystemUsage = {
  bucket: string;
  count: number;
  debitKobo: string;
  creditKobo: string;
  examples: string[];
};

async function systemForensics(prisma: PrismaClient) {
  const { loadOpenHoldLedger, compareWalletProjection } = await import("../lib/services/core/reconciliation-correct");
  const system = await prisma.wallet.findFirstOrThrow({ where: { ownerType: "SYSTEM" } });
  const legs = await prisma.ledgerEntry.findMany({
    where: { walletId: system.id },
    include: { transaction: { select: { reference: true, type: true } } }
  });

  const buckets = new Map<string, { count: number; debit: bigint; credit: bigint; examples: string[] }>();
  const add = (bucket: string, reference: string, direction: string, amount: bigint) => {
    const row = buckets.get(bucket) ?? { count: 0, debit: BigInt(0), credit: BigInt(0), examples: [] };
    row.count += 1;
    if (direction === "DEBIT") row.debit += amount;
    else row.credit += amount;
    if (row.examples.length < 3) row.examples.push(reference);
    buckets.set(bucket, row);
  };

  for (const leg of legs) {
    const { reference, type } = leg.transaction;
    if (type === "credit" && FUNDING_PATTERN.test(reference)) {
      add("TEST funding issued (SYSTEM source)", reference, leg.direction, leg.amountKobo);
    } else if (type === "hold" && /^RIDE-.*-HOLD$/.test(reference)) {
      add("Ride fare hold counterparty (held)", reference, leg.direction, leg.amountKobo);
    } else if (type === "release" && reference.startsWith("RELEASE-")) {
      add("Platform commission/fee revenue", reference, leg.direction, leg.amountKobo);
    } else if (type === "hold" && reference.startsWith("ESCROW-HOLD-")) {
      add("External escrow clearing", reference, leg.direction, leg.amountKobo);
    } else if (type === "refund" && reference.startsWith("REFUND-")) {
      add("Refund reversal (platform share)", reference, leg.direction, leg.amountKobo);
    } else if (type === "payout" && reference.startsWith("PAYOUT-")) {
      add("Payout clearing", reference, leg.direction, leg.amountKobo);
    } else if (type === "fee" && reference.startsWith("RIDE-")) {
      add("Ride cancellation fee", reference, leg.direction, leg.amountKobo);
    } else {
      add(`UNCLASSIFIED:${type}:${reference}`, reference, leg.direction, leg.amountKobo);
    }
  }

  const usage: SystemUsage[] = [...buckets.entries()].map(([bucket, row]) => ({
    bucket,
    count: row.count,
    debitKobo: row.debit.toString(),
    creditKobo: row.credit.toString(),
    examples: row.examples
  }));
  const unclassified = usage.filter((row) => row.bucket.startsWith("UNCLASSIFIED"));

  const net = legs.reduce((sum, leg) => sum + (leg.direction === "CREDIT" ? leg.amountKobo : -leg.amountKobo), BigInt(0));
  const holds = await loadOpenHoldLedger(prisma);
  const projection = compareWalletProjection({
    walletId: system.id,
    availableKobo: system.availableKobo,
    heldKobo: system.heldKobo,
    ledgerNetKobo: net,
    holds
  });
  const fundingDebit = [...buckets.entries()]
    .filter(([bucket]) => bucket.startsWith("TEST funding"))
    .reduce((sum, [, row]) => sum + row.debit, BigInt(0));
  const revenueCredit = [...buckets.entries()]
    .filter(([bucket]) => bucket.startsWith("Platform commission"))
    .reduce((sum, [, row]) => sum + row.credit, BigInt(0));
  const refundDebit = [...buckets.entries()]
    .filter(([bucket]) => bucket.startsWith("Refund reversal"))
    .reduce((sum, [, row]) => sum + row.debit, BigInt(0));

  return {
    wallet: { id: system.id, available: system.availableKobo.toString(), held: system.heldKobo.toString() },
    ledgerNetKobo: net.toString(),
    projection: {
      expectedAvailableKobo: projection.expectedAvailableKobo.toString(),
      expectedHeldKobo: projection.expectedHeldKobo.toString(),
      availableDifferenceKobo: projection.availableDifferenceKobo.toString(),
      heldDifferenceKobo: projection.heldDifferenceKobo.toString(),
      openCounterpartyHeldKobo: projection.openCounterpartyHeldKobo.toString()
    },
    usage,
    unclassified,
    components: {
      testFundingDebitKobo: fundingDebit.toString(),
      platformRevenueCreditKobo: revenueCredit.toString(),
      refundReversalDebitKobo: refundDebit.toString()
    }
  };
}

/* ------------------------------------------------------------- scenarios --- */

async function createScenario(
  prisma: PrismaClient,
  label: string,
  options: { fundKobo: bigint; pay: boolean }
): Promise<Scenario> {
  const { ensureWallet, initializePayment, confirmPayment } = await import("../lib/payments/service");
  const { checkout } = await import("../lib/services/core/checkout.service");
  const { createTopUp, creditTopUp } = await import("../lib/services/core/topup.service");
  const lower = RUN_ID.toLowerCase();

  const user = await prisma.user.create({
    data: {
      email: `wc-refund-${RUN_ID}-${label}@example.test`,
      name: `WC refund ${label}`,
      actorType: "CUSTOMER"
    }
  });
  const vendorOwner = await prisma.user.create({
    data: {
      email: `wc-refund-${RUN_ID}-${label}-owner@example.test`,
      name: `WC refund ${label} owner`,
      actorType: "VENDOR"
    }
  });
  const vendor = await prisma.vendor.create({
    data: {
      ownerId: vendorOwner.id,
      name: `WC refund fixture vendor ${RUN_ID} ${label}`,
      slug: `wc-refund-vendor-${lower}-${label}`,
      market: "Isolated acceptance fixture market",
      description: "Isolated post-release refund fixture. Not a real vendor.",
      pickupAddress: "1 Acceptance Fixture Way, Lagos",
      pickupPhone: "+2348000000000",
      status: "VERIFIED",
      commissionBps: 1000
    }
  });
  const category = await prisma.category.create({
    data: {
      name: `WC refund fixture category ${RUN_ID} ${label}`,
      slug: `wc-refund-category-${lower}-${label}`,
      description: "Isolated post-release refund fixture."
    }
  });
  const product = await prisma.product.create({
    data: {
      vendorId: vendor.id,
      categoryId: category.id,
      name: `WC refund fixture product ${RUN_ID} ${label}`,
      slug: `wc-refund-product-${lower}-${label}`,
      description: "Isolated post-release refund fixture product.",
      priceKobo: SHOP_SUBTOTAL_KOBO,
      status: "ACTIVE",
      isSample: false,
      stock: { create: { quantity: 5, reserved: 0 } }
    }
  });
  const cart = await prisma.cart.create({
    data: { userId: user.id, status: "ACTIVE", items: { create: { productId: product.id, quantity: 1 } } }
  });
  const wallet = await ensureWallet(prisma, { userId: user.id, ownerType: "CUSTOMER" });
  if (options.fundKobo > BigInt(0)) {
    const key = `postrelease-topup-${RUN_ID}-${label}`;
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
      raw: { simulated: true, note: "Post-release refund acceptance TEST funding. Not a real payment." }
    });
    assert(credited.status === "credited", `funding ${label} was not credited`);
  }

  const created = await checkout({
    userId: user.id,
    address: {
      contactName: `WC refund ${label}`,
      contactPhone: "08000000000",
      countryCode: "NG",
      state: "Lagos",
      city: "Lagos",
      line1: "1 Acceptance Fixture Way"
    }
  });
  assert(created.orders.length === 1, `${label}: checkout must create one order`);
  const order = created.orders[0];
  assert(BigInt(order.totalKobo) === ORDER_TOTAL_KOBO, `${label}: checkout total ${order.totalKobo}`);

  let paymentId = "";
  if (options.pay) {
    const init = await initializePayment({
      orderId: order.orderId,
      userId: user.id,
      provider: "wallet",
      callbackUrl: "http://localhost/orders"
    });
    const paid = await confirmPayment({ reference: init.reference, provider: "wallet" });
    assert(paid.status === "COMPLETED", `${label}: wallet payment did not complete`);
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.orderId, status: "COMPLETED" } });
    paymentId = payment.id;
  }

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
    paymentId,
    totalKobo: BigInt(order.totalKobo)
  };
}

async function deliverAndRelease(prisma: PrismaClient, scenario: Scenario) {
  const { updateOrderStatus, completeOrder } = await import("../lib/services/core/order.service");
  const flow = ["accepted", "preparing", "ready_for_pickup", "courier_assigned", "picked_up", "in_transit", "delivered"] as const;
  for (const status of flow) {
    await updateOrderStatus({
      actorId: scenario.userId,
      orderId: scenario.orderId,
      status,
      note: `Post-release acceptance transition to ${status}.`
    });
  }
  const result = await completeOrder(scenario.userId, scenario.orderId);
  return result;
}

async function orderState(prisma: PrismaClient, orderId: string) {
  return prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { payments: true, escrowHolds: true, refunds: true, statusEvents: true }
  });
}

/* --------------------------------------------------------------- cleanup --- */

async function cleanupRun(prisma: PrismaClient) {
  const emailPrefix = `wc-refund-${RUN_ID}-`;
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
    where: { OR: [{ entityId: { in: [...orderIds, ...topUpIds] } }, { dedupeKey: { contains: RUN_ID } }] },
    select: { id: true }
  });
  const entityIds = [...orderIds, ...deliveryIds, ...escrowIds, ...refundIds, ...productIds, ...vendorIds, ...categoryIds, ...transactionIds, ...topUpIds];

  // Reverse the SYSTEM effects created by these fixtures before deleting the
  // journals: top-ups debit SYSTEM available; releases credit the platform cut.
  // Open-escrow refunds move buyer/vendor funds only, so they have no SYSTEM leg.
  const system = await prisma.wallet.findFirst({ where: { ownerType: "SYSTEM" }, select: { id: true } });
  let systemAvailableDelta = BigInt(0);
  if (system) {
    const fullTransactions = await prisma.walletTransaction.findMany({
      where: { id: { in: transactionIds } },
      include: { ledger: true }
    });
    for (const transaction of fullTransactions) {
      const legs = transaction.ledger.filter((leg) => leg.walletId === system.id);
      if (legs.length === 0) continue;
      if (transaction.type === "credit" && transaction.reference.startsWith("TOPUP-")) {
        const debit = legs.find((leg) => leg.direction === "DEBIT");
        systemAvailableDelta += debit?.amountKobo ?? BigInt(0);
      } else if (transaction.type === "release" && transaction.reference.startsWith("RELEASE-")) {
        const credit = legs.find((leg) => leg.direction === "CREDIT");
        systemAvailableDelta -= credit?.amountKobo ?? BigInt(0);
      } else if (transaction.type === "refund" && transaction.reference.startsWith("REFUND-")) {
        const debit = legs.find((leg) => leg.direction === "DEBIT");
        systemAvailableDelta += debit?.amountKobo ?? BigInt(0);
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    if (system && systemAvailableDelta !== BigInt(0)) {
      await tx.wallet.update({ where: { id: system.id }, data: { availableKobo: { increment: systemAvailableDelta } } });
    }
    await tx.notificationAttempt.deleteMany({
      where: { notification: { OR: [{ userId: { in: userIds } }, { entityId: { in: entityIds } }] } }
    });
    await tx.notification.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { entityId: { in: entityIds } }] } });
    await tx.notificationIntent.deleteMany({ where: { id: { in: intents.map((row) => row.id) } } });
    await tx.partnerNotification.deleteMany({ where: { userId: { in: userIds } } });
    await tx.trackingEvent.deleteMany({ where: { deliveryId: { in: deliveryIds } } });
    await tx.delivery.deleteMany({ where: { id: { in: deliveryIds } } });
    await tx.dispute.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.affiliateReversalIntent.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.refund.deleteMany({ where: { id: { in: refundIds } } });
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
  }, { timeout: 60_000 });

  const leftovers =
    (await prisma.user.count({ where: { email: { startsWith: emailPrefix } } })) +
    (await prisma.order.count({ where: { id: { in: orderIds } } })) +
    (await prisma.notificationIntent.count({ where: { id: { in: intents.map((row) => row.id) } } })) +
    (await prisma.walletTopUp.count({ where: { id: { in: topUpIds } } }));
  return {
    users: userIds.length,
    wallets: walletIds.length,
    orders: orderIds.length,
    refunds: refundIds.length,
    transactions: transactionIds.length,
    leftovers
  };
}

/* ------------------------------------------------------------------ main --- */

async function main(prisma: PrismaClient, url: string) {
  const { ensureWallet, refundPayment, allocateRefundShares } = await import("../lib/payments/service");
  const { reconcile } = await import("../lib/services/core/reconciliation-correct");

  const db = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  assert(db[0]?.db === DB, `wrong database ${db[0]?.db ?? "unknown"}, expected ${DB}`);
  await ensureCity(prisma);

  const system = await ensureWallet(prisma, { ownerType: "SYSTEM" });
  const systemBefore = await readWallet(prisma, system.id);

  /* ---- Part 1: SYSTEM forensics (read-only) ---- */
  const forensics = await systemForensics(prisma);
  record(
    "SYSTEM stored position reconciles exactly with the journal and open holds",
    forensics.projection.availableDifferenceKobo === "0" &&
      forensics.projection.heldDifferenceKobo === "0" &&
      forensics.projection.expectedAvailableKobo === forensics.wallet.available &&
      forensics.projection.expectedHeldKobo === forensics.wallet.held,
    `available ${forensics.wallet.available} (expected ${forensics.projection.expectedAvailableKobo}), held ${forensics.wallet.held} (expected ${forensics.projection.expectedHeldKobo}), ledger net ${forensics.ledgerNetKobo}, open counterparty holds ${forensics.projection.openCounterpartyHeldKobo}`
  );
  record(
    "every SYSTEM posting is classified; the deficit is TEST funding, not an unexplained delta",
    forensics.unclassified.length === 0 &&
      BigInt(forensics.components.testFundingDebitKobo) > BigInt(0) &&
      forensics.wallet.available === (-BigInt(forensics.components.testFundingDebitKobo) + BigInt(forensics.components.platformRevenueCreditKobo) - BigInt(forensics.components.refundReversalDebitKobo)).toString(),
    `funding ${forensics.components.testFundingDebitKobo}, revenue ${forensics.components.platformRevenueCreditKobo}, refund reversal ${forensics.components.refundReversalDebitKobo}, unclassified ${forensics.unclassified.length}`
  );
  /* ---- Part 2: funded release, then the post-release refusal ---- */
  const releaseScenario = await createScenario(prisma, "release", { fundKobo: BigInt(175_000), pay: true });
  const releaseWalletBefore = await walletFor(prisma, releaseScenario);
  const releaseVendorBefore = await vendorWalletFor(prisma, releaseScenario);
  // Funding debits SYSTEM; compare the release against the post-funding,
  // pre-release position so the 544-kobo platform cut is the only delta.
  const systemAfterPayment = await readWallet(prisma, system.id);
  const release = await deliverAndRelease(prisma, releaseScenario);
  releaseScenario.payableKobo = BigInt(release.payableKobo);
  const releaseOrder = await orderState(prisma, releaseScenario.orderId);
  const releaseWalletAfter = await walletFor(prisma, releaseScenario);
  const releaseVendorAfter = await vendorWalletFor(prisma, releaseScenario);
  const systemAfterRelease = await readWallet(prisma, system.id);
  const platformCut = releaseScenario.totalKobo - BigInt(release.payableKobo);
  record(
    "wallet payment -> escrow -> release moves the exact payable and platform cut",
    releaseOrder.status === "completed" &&
      releaseOrder.paymentStatus === "paid" &&
      releaseOrder.escrowHolds[0]?.status === "released" &&
      releaseWalletAfter.availableKobo === BigInt(20_000) &&
      releaseWalletAfter.heldKobo === BigInt(0) &&
      releaseVendorAfter.availableKobo === BigInt(release.payableKobo) &&
      releaseVendorAfter.heldKobo === BigInt(0) &&
      systemAfterRelease.availableKobo === systemAfterPayment.availableKobo + platformCut,
    `buyer ${JSON.stringify(snapshot(releaseWalletBefore))} -> ${JSON.stringify(snapshot(releaseWalletAfter))}, vendor ${JSON.stringify(snapshot(releaseVendorBefore))} -> ${JSON.stringify(snapshot(releaseVendorAfter))}, SYSTEM after funding ${systemAfterPayment.availableKobo} -> ${systemAfterRelease.availableKobo} (cut ${platformCut})`
  );

  // A release credits the platform cut into the same SYSTEM wallet that funded
  // every TEST kobo. This is the direct evidence for the overloaded-account
  // finding, observed rather than inferred from the code.
  const forensicsAfterRelease = await systemForensics(prisma);
  const bucketsAfterRelease = forensicsAfterRelease.usage.map((row) => row.bucket);
  record(
    "SYSTEM is an overloaded account: TEST funding, ride escrow counterparty and platform revenue all post to it",
    bucketsAfterRelease.some((bucket) => bucket.startsWith("TEST funding")) &&
      bucketsAfterRelease.some((bucket) => bucket.startsWith("Ride fare hold")) &&
      bucketsAfterRelease.some((bucket) => bucket.startsWith("Platform commission")),
    `buckets after the release: ${bucketsAfterRelease.join(" | ")}`
  );

  const refusedKey = `postrelease-refused-${RUN_ID}`;
  const refusedPartial = await statusOf(refundPayment({
    orderId: releaseScenario.orderId,
    actorId: releaseScenario.userId,
    reason: "Post-release refund requires platform liquidity.",
    amountKobo: BigInt(55_000),
    idempotencyKey: refusedKey
  }));
  const releasedOrderAfterRefusal = await orderState(prisma, releaseScenario.orderId);
  const releasedWalletAfterRefusal = await walletFor(prisma, releaseScenario);
  const releasedVendorAfterRefusal = await vendorWalletFor(prisma, releaseScenario);
  const releaseSystemAfterRefusal = await readWallet(prisma, system.id);
  const refundJournals = await prisma.walletTransaction.count({
    where: { orderId: releaseScenario.orderId, type: "refund" }
  });
  record(
    "post-release partial refund is refused with no claim, row, journal or balance change",
    refusedPartial.status === 409 &&
      refusedPartial.code === "refund_conflict" &&
      releasedOrderAfterRefusal.refundedKobo === BigInt(0) &&
      releasedOrderAfterRefusal.paymentStatus === "paid" &&
      releasedOrderAfterRefusal.refunds.length === 0 &&
      releasedWalletAfterRefusal.availableKobo === releaseWalletAfter.availableKobo &&
      releasedWalletAfterRefusal.heldKobo === releaseWalletAfter.heldKobo &&
      releasedVendorAfterRefusal.availableKobo === releaseVendorAfter.availableKobo &&
      releasedVendorAfterRefusal.heldKobo === releaseVendorAfter.heldKobo &&
      releaseSystemAfterRefusal.availableKobo === systemAfterRelease.availableKobo &&
      refundJournals === 0,
    `${refusedPartial.status} ${refusedPartial.code}, buyer ${releasedWalletAfterRefusal.availableKobo}/${releasedWalletAfterRefusal.heldKobo}, vendor ${releasedVendorAfterRefusal.availableKobo}/${releasedVendorAfterRefusal.heldKobo}, SYSTEM ${releaseSystemAfterRefusal.availableKobo}, refunds ${releasedOrderAfterRefusal.refunds.length}, journals ${refundJournals}`
  );
  const refusedFull = await statusOf(refundPayment({
    orderId: releaseScenario.orderId,
    actorId: releaseScenario.userId,
    reason: "Post-release full refund requires platform liquidity.",
    idempotencyKey: `postrelease-refused-full-${RUN_ID}`
  }));
  const releasedOrderAfterFull = await orderState(prisma, releaseScenario.orderId);
  record(
    "the full post-release refund is refused by the same platform-share guard",
    refusedFull.status === 409 &&
      refusedFull.code === "refund_conflict" &&
      releasedOrderAfterFull.refundedKobo === BigInt(0) &&
      releasedOrderAfterFull.refunds.length === 0 &&
      (await readWallet(prisma, system.id)).availableKobo === systemAfterRelease.availableKobo,
    `${refusedFull.status} ${refusedFull.code}, refundedKobo ${releasedOrderAfterFull.refundedKobo}, refund rows ${releasedOrderAfterFull.refunds.length}`
  );
  const retrySameKey = await statusOf(refundPayment({
    orderId: releaseScenario.orderId,
    actorId: releaseScenario.userId,
    reason: "Retry the refused refund with the same key.",
    amountKobo: BigInt(55_000),
    idempotencyKey: refusedKey
  }));
  const releasedOrderAfterRetry = await orderState(prisma, releaseScenario.orderId);
  record(
    "a refused refund leaves no idempotency row, so a later retry is not blocked by a phantom claim",
    retrySameKey.status === 409 &&
      retrySameKey.code === "refund_conflict" &&
      releasedOrderAfterRetry.refunds.length === 0 &&
      releasedOrderAfterRetry.refundedKobo === BigInt(0),
    `${retrySameKey.status} ${retrySameKey.code}, refund rows ${releasedOrderAfterRetry.refunds.length}`
  );

  /* ---- Part 3: recovery from an open escrow (the policy-supported path) ---- */
  const openScenario = await createScenario(prisma, "open", { fundKobo: ORDER_TOTAL_KOBO, pay: true });
  const openWalletAfterPay = await walletFor(prisma, openScenario);
  const openSystemBeforeRefund = await readWallet(prisma, system.id);
  const openPartial = await refundPayment({
    orderId: openScenario.orderId,
    actorId: openScenario.userId,
    reason: "Open-escrow partial refund.",
    amountKobo: BigInt(55_000),
    idempotencyKey: `postrelease-open-partial-${RUN_ID}`
  });
  const openOrderAfterPartial = await orderState(prisma, openScenario.orderId);
  const openWalletAfterPartial = await walletFor(prisma, openScenario);
  const openVendorAfterPartial = await vendorWalletFor(prisma, openScenario);
  const openSystemAfterPartial = await readWallet(prisma, system.id);
  record(
    "open-escrow partial refund credits the buyer and reduces the seller hold, platform untouched",
    openPartial.refundedKobo === "55000" &&
      openWalletAfterPay.availableKobo === BigInt(0) &&
      openWalletAfterPay.heldKobo === ORDER_TOTAL_KOBO &&
      openWalletAfterPartial.availableKobo === BigInt(55_000) &&
      openWalletAfterPartial.heldKobo === BigInt(100_000) &&
      openVendorAfterPartial.heldKobo === BigInt(100_000) &&
      openSystemAfterPartial.availableKobo === openSystemBeforeRefund.availableKobo &&
      openOrderAfterPartial.paymentStatus === "partially_refunded" &&
      openOrderAfterPartial.escrowHolds[0]?.status === "held",
    `buyer ${openWalletAfterPay.availableKobo}/${openWalletAfterPay.heldKobo} -> ${openWalletAfterPartial.availableKobo}/${openWalletAfterPartial.heldKobo}, vendor held ${openVendorAfterPartial.heldKobo}, order ${openOrderAfterPartial.paymentStatus}, escrow ${openOrderAfterPartial.escrowHolds[0]?.status}`
  );
  const openRemaining = await refundPayment({
    orderId: openScenario.orderId,
    actorId: openScenario.userId,
    reason: "Open-escrow remaining refund.",
    idempotencyKey: `postrelease-open-remaining-${RUN_ID}`
  });
  const openOrderFinal = await orderState(prisma, openScenario.orderId);
  const openWalletFinal = await walletFor(prisma, openScenario);
  const openVendorFinal = await vendorWalletFor(prisma, openScenario);
  const openSystemFinal = await readWallet(prisma, system.id);
  record(
    "the remaining open-escrow refund restores the buyer exactly and closes the escrow",
    openRemaining.refundedKobo === "100000" &&
      openOrderFinal.paymentStatus === "refunded" &&
      openOrderFinal.refunds.length === 2 &&
      openOrderFinal.refunds.every((refund) => refund.status === "COMPLETED") &&
      openOrderFinal.escrowHolds[0]?.status === "refunded" &&
      openWalletFinal.availableKobo === ORDER_TOTAL_KOBO &&
      openWalletFinal.heldKobo === BigInt(0) &&
      openVendorFinal.heldKobo === BigInt(0) &&
      openSystemFinal.availableKobo === openSystemBeforeRefund.availableKobo,
    `refunds ${openOrderFinal.refunds.length}, buyer ${openWalletFinal.availableKobo}/${openWalletFinal.heldKobo}, vendor held ${openVendorFinal.heldKobo}, escrow ${openOrderFinal.escrowHolds[0]?.status}, SYSTEM ${openSystemFinal.availableKobo}`
  );
  const openJournals = await prisma.walletTransaction.findMany({
    where: { orderId: openScenario.orderId, type: "refund" },
    include: { ledger: true }
  });
  record(
    "each open-escrow refund journal balances and debits exactly the seller hold",
    openJournals.length === 2 &&
      openJournals.every((transaction) => {
        const debit = transaction.ledger.filter((leg) => leg.direction === "DEBIT").reduce((sum, leg) => sum + leg.amountKobo, BigInt(0));
        const credit = transaction.ledger.filter((leg) => leg.direction === "CREDIT").reduce((sum, leg) => sum + leg.amountKobo, BigInt(0));
        return debit === credit && debit === transaction.amountKobo;
      }),
    openJournals.map((transaction) => `${transaction.amountKobo}`).join(",")
  );

  /* ---- Part 4: duplicate, concurrent and invalid refund requests ---- */
  const concurrencyScenario = await createScenario(prisma, "concurrent", { fundKobo: ORDER_TOTAL_KOBO, pay: true });
  const firstPartial = await refundPayment({
    orderId: concurrencyScenario.orderId,
    actorId: concurrencyScenario.userId,
    reason: "Idempotent partial refund.",
    amountKobo: BigInt(40_000),
    idempotencyKey: `postrelease-idem-${RUN_ID}`
  });
  const replay = await refundPayment({
    orderId: concurrencyScenario.orderId,
    actorId: concurrencyScenario.userId,
    reason: "Replay of the same partial refund.",
    amountKobo: BigInt(40_000),
    idempotencyKey: `postrelease-idem-${RUN_ID}`
  });
  const afterReplay = await orderState(prisma, concurrencyScenario.orderId);
  const replayWallet = await walletFor(prisma, concurrencyScenario);
  record(
    "the same idempotency key returns the original refund without a second movement",
    firstPartial.refundedKobo === "40000" &&
      ("idempotent" in replay ? replay.idempotent === true : false) &&
      replay.refundId === firstPartial.refundId &&
      afterReplay.refundedKobo === BigInt(40_000) &&
      afterReplay.refunds.length === 1 &&
      replayWallet.availableKobo === BigInt(40_000) &&
      replayWallet.heldKobo === BigInt(115_000),
    `refund ${firstPartial.refundId.slice(0, 8)}, replay ${"idempotent" in replay ? replay.idempotent : false}, refundedKobo ${afterReplay.refundedKobo}, buyer ${replayWallet.availableKobo}/${replayWallet.heldKobo}`
  );

  const invalid = await statusOf(refundPayment({
    orderId: concurrencyScenario.orderId,
    actorId: concurrencyScenario.userId,
    reason: "More than remains.",
    amountKobo: BigInt(200_000),
    idempotencyKey: `postrelease-invalid-${RUN_ID}`
  }));
  const afterInvalid = await orderState(prisma, concurrencyScenario.orderId);
  record(
    "a refund above the remaining amount is rejected with no side effects",
    invalid.status === 400 &&
      invalid.code === "invalid_refund_amount" &&
      afterInvalid.refundedKobo === BigInt(40_000) &&
      afterInvalid.refunds.length === 1,
    `${invalid.status} ${invalid.code}, refundedKobo ${afterInvalid.refundedKobo}`
  );

  const concurrentKeyA = `postrelease-race-a-${RUN_ID}`;
  const concurrentKeyB = `postrelease-race-b-${RUN_ID}`;
  const race = await Promise.allSettled([
    refundPayment({
      orderId: concurrencyScenario.orderId,
      actorId: concurrencyScenario.userId,
      reason: "Concurrent refund A.",
      amountKobo: BigInt(80_000),
      idempotencyKey: concurrentKeyA
    }),
    refundPayment({
      orderId: concurrencyScenario.orderId,
      actorId: concurrencyScenario.userId,
      reason: "Concurrent refund B.",
      amountKobo: BigInt(80_000),
      idempotencyKey: concurrentKeyB
    })
  ]);
  const fulfilled = race.filter((result) => result.status === "fulfilled");
  const rejected = race.filter((result) => result.status === "rejected") as PromiseRejectedResult[];
  const rejectedCodes = rejected.map((result) => (result.reason as { code?: string }).code ?? "unknown");
  const afterRace = await orderState(prisma, concurrencyScenario.orderId);
  const raceWallet = await walletFor(prisma, concurrencyScenario);
  record(
    "two concurrent refunds with different keys move money at most once",
    fulfilled.length === 1 &&
      rejected.length === 1 &&
      rejectedCodes[0] === "refund_conflict" &&
      afterRace.refundedKobo === BigInt(120_000) &&
      afterRace.refunds.length === 2 &&
      raceWallet.availableKobo === BigInt(120_000) &&
      raceWallet.heldKobo === BigInt(35_000),
    `fulfilled ${fulfilled.length}, rejected ${rejected.length} (${rejectedCodes.join(",")}), refundedKobo ${afterRace.refundedKobo}, buyer ${raceWallet.availableKobo}/${raceWallet.heldKobo}`
  );
  const raceRemaining = await refundPayment({
    orderId: concurrencyScenario.orderId,
    actorId: concurrencyScenario.userId,
    reason: "Close the order after the race.",
    idempotencyKey: `postrelease-race-close-${RUN_ID}`
  });
  const closedRaceOrder = await orderState(prisma, concurrencyScenario.orderId);
  record(
    "the winner's refund plus the remainder refund the order exactly",
    raceRemaining.refundedKobo === "35000" &&
      closedRaceOrder.paymentStatus === "refunded" &&
      closedRaceOrder.refunds.length === 3 &&
      (await walletFor(prisma, concurrencyScenario)).availableKobo === ORDER_TOTAL_KOBO &&
      (await walletFor(prisma, concurrencyScenario)).heldKobo === BigInt(0) &&
      (await vendorWalletFor(prisma, concurrencyScenario)).heldKobo === BigInt(0),
    `remaining ${raceRemaining.refundedKobo}, refunds ${closedRaceOrder.refunds.length}, buyer ${(await walletFor(prisma, concurrencyScenario)).availableKobo}/${(await walletFor(prisma, concurrencyScenario)).heldKobo}`
  );

  const sameKeyScenario = await createScenario(prisma, "samekey", { fundKobo: ORDER_TOTAL_KOBO, pay: true });
  const sameKey = `postrelease-samekey-${RUN_ID}`;
  const sameKeyRace = await Promise.allSettled([
    refundPayment({
      orderId: sameKeyScenario.orderId,
      actorId: sameKeyScenario.userId,
      reason: "Same-key concurrent refund A.",
      amountKobo: BigInt(50_000),
      idempotencyKey: sameKey
    }),
    refundPayment({
      orderId: sameKeyScenario.orderId,
      actorId: sameKeyScenario.userId,
      reason: "Same-key concurrent refund B.",
      amountKobo: BigInt(50_000),
      idempotencyKey: sameKey
    })
  ]);
  const sameKeyFulfilled = sameKeyRace.filter((result) => result.status === "fulfilled") as PromiseFulfilledResult<{ idempotent?: boolean }>[];
  const sameKeyRejected = sameKeyRace.filter((result) => result.status === "rejected") as PromiseRejectedResult[];
  const sameKeyOrder = await orderState(prisma, sameKeyScenario.orderId);
  const sameKeyWallet = await walletFor(prisma, sameKeyScenario);
  const sameKeyRows = await prisma.refund.count({ where: { orderId: sameKeyScenario.orderId } });
  record(
    "two concurrent requests with the same key settle once and never surface a constraint error",
    sameKeyRows === 1 &&
      sameKeyOrder.refundedKobo === BigInt(50_000) &&
      sameKeyWallet.availableKobo === BigInt(50_000) &&
      sameKeyWallet.heldKobo === BigInt(105_000) &&
      (sameKeyFulfilled.length === 2 ||
        (sameKeyFulfilled.length === 1 &&
          sameKeyRejected.length === 1 &&
          ["refund_pending", "refund_conflict"].includes((sameKeyRejected[0].reason as { code?: string }).code ?? ""))),
    `rows ${sameKeyRows}, fulfilled ${sameKeyFulfilled.length}, rejected ${sameKeyRejected.map((row) => (row.reason as { code?: string }).code ?? "?").join(",")}, refundedKobo ${sameKeyOrder.refundedKobo}, buyer ${sameKeyWallet.availableKobo}/${sameKeyWallet.heldKobo}`
  );
  const sameKeyRemainder = await refundPayment({
    orderId: sameKeyScenario.orderId,
    actorId: sameKeyScenario.userId,
    reason: "Close the same-key order.",
    idempotencyKey: `postrelease-samekey-close-${RUN_ID}`
  });
  record(
    "the same-key order can be closed after the race with no duplicate debit",
    sameKeyRemainder.refundedKobo === "105000" &&
      (await vendorWalletFor(prisma, sameKeyScenario)).heldKobo === BigInt(0) &&
      (await walletFor(prisma, sameKeyScenario)).availableKobo === ORDER_TOTAL_KOBO,
    `remainder ${sameKeyRemainder.refundedKobo}, vendor held ${(await vendorWalletFor(prisma, sameKeyScenario)).heldKobo}`
  );

  const unpaidScenario = await createScenario(prisma, "unpaid", { fundKobo: BigInt(0), pay: false });
  const unpaidRefund = await statusOf(refundPayment({
    orderId: unpaidScenario.orderId,
    actorId: unpaidScenario.userId,
    reason: "Unpaid order refund.",
    idempotencyKey: `postrelease-unpaid-${RUN_ID}`
  }));
  record(
    "an unpaid order cannot be refunded",
    unpaidRefund.status === 409 && unpaidRefund.code === "not_paid" && (await orderState(prisma, unpaidScenario.orderId)).refunds.length === 0,
    `${unpaidRefund.status} ${unpaidRefund.code}`
  );

  /* ---- allocation regression: no 1-kobo drift across refunds ---- */
  const first = allocateRefundShares({
    totalKobo: ORDER_TOTAL_KOBO,
    payableKobo: BigInt(154_456),
    alreadyRefundedKobo: BigInt(0),
    requestedKobo: BigInt(55_000)
  });
  const second = allocateRefundShares({
    totalKobo: ORDER_TOTAL_KOBO,
    payableKobo: BigInt(154_456),
    alreadyRefundedKobo: BigInt(55_000),
    requestedKobo: BigInt(100_000)
  });
  const split = [BigInt(1_000), BigInt(50_000), BigInt(104_000)].reduce(
    (acc, requested) => {
      const share = allocateRefundShares({
        totalKobo: ORDER_TOTAL_KOBO,
        payableKobo: BigInt(154_456),
        alreadyRefundedKobo: acc.refunded,
        requestedKobo: requested
      });
      return {
        refunded: acc.refunded + requested,
        vendor: acc.vendor + share.vendorShareKobo,
        platform: acc.platform + share.platformShareKobo
      };
    },
    { refunded: BigInt(0), vendor: BigInt(0), platform: BigInt(0) }
  );
  record(
    "cumulative refund allocation sums exactly to the released payable and platform cut",
    first.vendorShareKobo === BigInt(54_806) &&
      first.platformShareKobo === BigInt(194) &&
      second.vendorShareKobo === BigInt(99_650) &&
      second.platformShareKobo === BigInt(350) &&
      first.vendorShareKobo + second.vendorShareKobo === BigInt(154_456) &&
      first.platformShareKobo + second.platformShareKobo === BigInt(544) &&
      split.vendor === BigInt(154_456) &&
      split.platform === BigInt(544) &&
      split.refunded === ORDER_TOTAL_KOBO,
    `55k+100k vendor ${first.vendorShareKobo}+${second.vendorShareKobo}=${first.vendorShareKobo + second.vendorShareKobo}, platform ${first.platformShareKobo}+${second.platformShareKobo}=${first.platformShareKobo + second.platformShareKobo}; 3-way vendor ${split.vendor}, platform ${split.platform}`
  );

  /* ---- cleanup and whole-book reconciliation ---- */
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
  let reconcileReport: { status?: string; mismatches?: number } = {};
  try {
    reconcileReport = JSON.parse(reconcileCli.stdout);
  } catch {
    reconcileReport = {};
  }
  record(
    "fixture cleanup removes every run row and restores the exact SYSTEM position",
    cleanup.leftovers === 0 &&
      systemRestored.availableKobo === systemBefore.availableKobo &&
      systemRestored.heldKobo === systemBefore.heldKobo,
    `leftovers ${cleanup.leftovers}, SYSTEM ${systemBefore.availableKobo}/${systemBefore.heldKobo} -> after ${systemAfter.availableKobo}/${systemAfter.heldKobo} -> restored ${systemRestored.availableKobo}/${systemRestored.heldKobo}`
  );
  record(
    "whole-book reconciliation is clean after cleanup",
    reconciliation.issues.length === 0 && reconcileReport.status === "CLEAN",
    `issues ${reconciliation.issues.length}, cli ${reconcileReport.status ?? reconcileCli.status}`
  );

  const theVerdict =
    "The negative SYSTEM balance is not an invalid fixture row and not a projection-maintenance bug: " +
    "the stored available/held position reconciles to the journal and live holds with a 0-kobo difference. " +
    "It is an overloaded account model. SYSTEM is simultaneously (a) the source of every TEST-funded kobo, " +
    "(b) the platform revenue account for commission/fees, (c) the counterparty for ride fare holds, and " +
    "(d) payout/escrow clearing. Issuing test funds as a SYSTEM debit therefore makes the same account " +
    "look insolvent, and a post-release platform-share reversal is refused. The seller's released payable " +
    "and the buyer's wallet are sufficient; only the platform's historically overdrawn funding account is not. " +
    "A dedicated funding/equity account (or a separate platform revenue wallet) is required before " +
    "post-release refunds can be funded from revenue; no direct balance repair is a valid production method.";

  console.log(JSON.stringify({
    runId: RUN_ID,
    database: DB,
    forensics,
    forensicsAfterRelease,
    verdict: theVerdict,
    balances: {
      systemBefore: snapshot(systemBefore),
      systemAfterPayment: snapshot(systemAfterPayment),
      systemAfterRelease: snapshot(systemAfterRelease),
      systemAfter: snapshot(systemAfter),
      systemRestored: snapshot(systemRestored),
      releasedBuyer: { before: snapshot(releaseWalletBefore), afterRelease: snapshot(releaseWalletAfter), afterRefusal: snapshot(releasedWalletAfterRefusal) },
      releasedVendor: { before: snapshot(releaseVendorBefore), afterRelease: snapshot(releaseVendorAfter), afterRefusal: snapshot(releasedVendorAfterRefusal) },
      openEscrowBuyer: { afterPay: snapshot(openWalletAfterPay), afterPartial: snapshot(openWalletAfterPartial), final: snapshot(openWalletFinal) }
    },
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
  const url = acceptanceUrl();
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
