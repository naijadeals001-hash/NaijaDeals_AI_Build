import { randomBytes } from "node:crypto";
import type { Order, Payment, Prisma, PrismaClient, Refund } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCountry, commissionFor } from "@/lib/config/commerce";
import { ApiError } from "@/lib/auth/guard";
import { adapters, type AdapterId, isTestPaymentsEnabled } from "./adapters";
import type { PaymentVerifyResult } from "./types";
import { updateOrderStatus } from "@/lib/services/core/order.service";
import { recordAudit } from "@/lib/services/core/audit.service";
import { recordSystemEvent } from "@/lib/services/core/event.service";
import { createDelivery } from "@/lib/services/core/delivery.service";
import { notifyOrderPaid } from "@/lib/notifications/domain-events";
import { recordConversion } from "@/lib/services/affiliate/service";
import { log } from "@/lib/infra/logger";

type Db = PrismaClient | Prisma.TransactionClient;

export type AvailableMethod = {
  id: AdapterId;
  label: string;
  description: string;
  configured: boolean;
  supportsCountry: boolean;
  reason?: string;
};

export function listPaymentMethods(countryCode: string): AvailableMethod[] {
  return (Object.keys(adapters) as AdapterId[]).map((id) => {
    const adapter = adapters[id];
    const supportsCountry = adapter.supportsCountry(countryCode);
    const configured = adapter.isConfigured();
    let reason: string | undefined;
    if (!supportsCountry) reason = `Not supported in ${getCountry(countryCode).name}.`;
    else if (!configured) {
      if (id === "paystack") reason = "PAYSTACK_SECRET_KEY is not configured.";
      else if (id === "flutterwave") reason = "FLUTTERWAVE_SECRET_KEY is not configured.";
      else if (id === "test") reason = "Set ENABLE_TEST_PAYMENTS=true in a non-production environment.";
    }
    return { id, label: adapter.label, description: adapter.description, configured, supportsCountry, reason };
  });
}

export function availablePaymentMethods(countryCode: string) {
  return listPaymentMethods(countryCode).filter((method) => method.configured && method.supportsCountry);
}

export async function ensureWallet(tx: Db, input: { userId?: string; vendorId?: string; ownerType: "CUSTOMER" | "VENDOR" | "COURIER" | "DRIVER" | "SYSTEM" }) {
  // Ownership rules: SYSTEM is platform-wide, VENDOR belongs to a vendor row,
  // and every personal wallet belongs to a user. Reject mixed or missing ids.
  if (input.ownerType === "SYSTEM") {
    if (input.userId || input.vendorId) throw new ApiError(400, "invalid_wallet_identity", "The platform wallet cannot belong to a user or vendor.");
  } else if (input.ownerType === "VENDOR") {
    if (!input.vendorId || input.userId) throw new ApiError(400, "invalid_wallet_identity", "A vendor wallet requires a vendorId and no userId.");
  } else if (!input.userId || input.vendorId) {
    throw new ApiError(400, "invalid_wallet_identity", "A personal wallet requires a userId and no vendorId.");
  }
  // Resolve by owner type as well as identity: one user can hold CUSTOMER,
  // DRIVER and COURIER wallets, and paying the wrong one is a financial bug.
  const identity = input.userId
    ? { userId: input.userId, ownerType: input.ownerType }
    : input.vendorId
      ? { vendorId: input.vendorId, ownerType: input.ownerType }
      : { ownerType: "SYSTEM" as const };
  const existing = await tx.wallet.findFirst({ where: identity });
  if (existing) return existing;
  try {
    return await tx.wallet.create({
      data: {
        ownerType: input.ownerType,
        userId: input.userId ?? null,
        vendorId: input.vendorId ?? null
      }
    });
  } catch (error) {
    // Partial unique indexes are the authority: a concurrent creator won, so
    // return its canonical row instead of failing the caller or making a second.
    if ((error as { code?: string }).code === "P2002") {
      const winner = await tx.wallet.findFirst({ where: identity });
      if (winner) return winner;
    }
    throw error;
  }
}

async function getPaymentByReference(reference: string) {
  const payment = await prisma.payment.findUnique({
    where: { providerReference: reference },
    include: { order: { include: { items: true, vendor: true, customer: true } } }
  });
  if (!payment) throw new ApiError(404, "payment_not_found", "Payment reference was not found.");
  return payment;
}

export async function initializePayment(input: {
  orderId: string;
  userId: string;
  provider: AdapterId;
  callbackUrl: string;
}) {
  const adapter = adapters[input.provider];
  if (!adapter) throw new ApiError(400, "unknown_provider", "Unknown payment provider.");

  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: { customer: true, payments: true }
  });
  if (!order) throw new ApiError(404, "order_not_found", "Order not found.");
  if (order.customerId !== input.userId) throw new ApiError(403, "forbidden", "This order belongs to another account.");
  if (order.paymentStatus === "paid") throw new ApiError(409, "already_paid", "This order is already paid.");
  if (["cancelled", "refunded"].includes(order.status)) throw new ApiError(409, "order_closed", "This order is closed.");

  if (!adapter.supportsCountry(order.countryCode)) {
    throw new ApiError(400, "provider_unsupported", `${adapter.label} does not support ${order.countryCode}.`);
  }
  if (!adapter.isConfigured()) {
    throw new ApiError(503, "provider_unconfigured", `${adapter.label} is not configured on this server.`);
  }

  const existing = order.payments.find(
    (payment) => payment.provider === input.provider && payment.status === "PENDING"
  );
  if (existing) {
    const raw = existing.raw as { data?: { authorization_url?: unknown; link?: unknown } } | null;
    let redirectUrl =
      input.provider === "paystack" && typeof raw?.data?.authorization_url === "string"
        ? raw.data.authorization_url
        : input.provider === "flutterwave" && typeof raw?.data?.link === "string"
          ? raw.data.link
          : null;

    // If the stored provider response did not include a checkout URL, ask the
    // provider to initialize the same reference again rather than silently
    // returning a payment that the customer cannot complete.
    if (!redirectUrl && (input.provider === "paystack" || input.provider === "flutterwave")) {
      const retried = await adapter.initialize({
        reference: existing.providerReference,
        amountMinor: order.totalKobo,
        currency: order.currency,
        email: order.customer.email,
        orderNumber: order.orderNumber,
        callbackUrl: input.callbackUrl,
        metadata: { orderId: order.id, customerId: input.userId }
      });
      redirectUrl = retried.redirectUrl ?? null;
      if (retried.raw !== undefined) {
        await prisma.payment.update({
          where: { id: existing.id },
          data: { raw: JSON.parse(JSON.stringify(retried.raw)) }
        });
      }
    }

    return {
      paymentId: existing.id,
      reference: existing.providerReference,
      provider: existing.provider,
      redirectUrl,
      instructions: existing.provider === "wallet"
        ? "Confirm to debit your NaijaPay wallet."
        : existing.provider === "test"
          ? "Local test provider: confirm on this page to simulate a verified payment for testing only."
          : "Continue with the payment provider to finish this payment."
    };
  }

  const reference = `NDP-${order.orderNumber}-${randomBytes(4).toString("hex").toUpperCase()}`;
  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      provider: input.provider,
      providerReference: reference,
      idempotencyKey: `${order.id}:${input.provider}:${randomBytes(8).toString("hex")}`,
      amountKobo: order.totalKobo,
      currency: order.currency,
      status: "PENDING"
    }
  });

  try {
    const result = await adapter.initialize({
      reference,
      amountMinor: order.totalKobo,
      currency: order.currency,
      email: order.customer.email,
      orderNumber: order.orderNumber,
      callbackUrl: input.callbackUrl,
      metadata: { orderId: order.id, customerId: input.userId }
    });
    if (result.raw !== undefined) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { raw: JSON.parse(JSON.stringify(result.raw)) }
      });
    }
    return {
      paymentId: payment.id,
      reference,
      provider: input.provider,
      redirectUrl: result.redirectUrl ?? null,
      instructions: result.instructions ?? null
    };
  } catch (error) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        failureReason: error instanceof Error ? error.message : "Provider initialization failed."
      }
    });
    throw new ApiError(502, "provider_error", error instanceof Error ? error.message : "Payment provider failed.");
  }
}

async function commitReservedStock(tx: Db, orderId: string) {
  const items = await tx.orderItem.findMany({ where: { orderId } });
  for (const item of items) {
    if (item.variantId) {
      const updated = await tx.productVariant.updateMany({
        where: { id: item.variantId, reserved: { gte: item.quantity } },
        data: { stock: { decrement: item.quantity }, reserved: { decrement: item.quantity } }
      });
      if (updated.count === 0) throw new ApiError(409, "stock_conflict", "Reserved stock is no longer available.");
    } else {
      const updated = await tx.inventoryStock.updateMany({
        where: { productId: item.productId, reserved: { gte: item.quantity } },
        data: { quantity: { decrement: item.quantity }, reserved: { decrement: item.quantity } }
      });
      if (updated.count === 0) throw new ApiError(409, "stock_conflict", "Reserved stock is no longer available.");
    }
  }
}

export async function releaseReservedStock(tx: Db, orderId: string) {
  const items = await tx.orderItem.findMany({ where: { orderId } });
  for (const item of items) {
    if (item.variantId) {
      await tx.productVariant.updateMany({
        where: { id: item.variantId, reserved: { gte: item.quantity } },
        data: { reserved: { decrement: item.quantity } }
      });
    } else {
      await tx.inventoryStock.updateMany({
        where: { productId: item.productId, reserved: { gte: item.quantity } },
        data: { reserved: { decrement: item.quantity } }
      });
    }
  }
}

/** Put committed units back on sale after a paid order is cancelled or returned. */
async function restockOrderItems(tx: Db, orderId: string) {
  const items = await tx.orderItem.findMany({ where: { orderId } });
  for (const item of items) {
    if (item.variantId) {
      await tx.productVariant.update({
        where: { id: item.variantId },
        data: { stock: { increment: item.quantity } }
      });
    } else {
      await tx.inventoryStock.update({
        where: { productId: item.productId },
        data: { quantity: { increment: item.quantity } }
      });
    }
  }
}

/**
 * Mark a payment failed exactly once. Reserved stock is released and an
 * unpaid order is cancelled, so a failed attempt cannot strand inventory.
 */
async function markPaymentFailed(input: {
  paymentId: string;
  orderId: string;
  reason: string;
  raw?: unknown;
}) {
  await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ status: string }>>`
      SELECT status FROM "Payment" WHERE id = ${input.paymentId} FOR UPDATE
    `;
    if (locked[0]?.status === "COMPLETED") return;
    await tx.payment.update({
      where: { id: input.paymentId },
      data: {
        status: "FAILED",
        failureReason: input.reason,
        raw: input.raw ? JSON.parse(JSON.stringify(input.raw)) : undefined
      }
    });
    const order = await tx.order.findUnique({ where: { id: input.orderId } });
    if (order && ["created", "payment_pending"].includes(order.status)) {
      await releaseReservedStock(tx, order.id);
      await updateOrderStatus({
        tx,
        actorId: null,
        orderId: order.id,
        status: "cancelled",
        note: "Payment failed; reserved stock released."
      });
    }
  });
}

async function recordEscrow(tx: Db, input: {
  order: Order;
  buyerWalletId: string;
  vendorWalletId: string;
  walletDebit: boolean;
  actorId: string;
}) {
  const amount = input.order.totalKobo;
  let escrowBuyerWalletId = input.buyerWalletId;
  if (input.walletDebit) {
    const locked = await tx.$queryRaw<Array<{ availableKobo: bigint }>>`
      SELECT "availableKobo" FROM "Wallet" WHERE id = ${input.buyerWalletId} FOR UPDATE
    `;
    if (!locked[0] || locked[0].availableKobo < amount) {
      throw new ApiError(402, "insufficient_wallet", "NaijaPay wallet balance is insufficient for this order.");
    }
    await tx.wallet.update({
      where: { id: input.buyerWalletId },
      data: { availableKobo: { decrement: amount }, heldKobo: { increment: amount } }
    });
    await tx.wallet.update({ where: { id: input.vendorWalletId }, data: { heldKobo: { increment: amount } } });
    await tx.walletTransaction.create({
      data: {
        walletId: input.buyerWalletId,
        orderId: input.order.id,
        type: "hold",
        amountKobo: amount,
        reference: `ESCROW-HOLD-${input.order.id}`,
        description: `Escrow hold for ${input.order.orderNumber}`,
        ledger: {
          create: [
            { walletId: input.buyerWalletId, direction: "DEBIT", amountKobo: amount, memo: "Buyer wallet moved to escrow" },
            { walletId: input.vendorWalletId, direction: "CREDIT", amountKobo: amount, memo: "Vendor payable held in escrow" }
          ]
        }
      }
    });
  } else {
    // The platform is the buyer of record for an external payment: no customer
    // wallet was debited, so the customer cannot be the holder. The journal posts
    // a platform DEBIT (external funds entering the escrow) against the vendor
    // CREDIT (payable held); the platform's stored position must move with that
    // journal exactly — `availableKobo` down and `heldKobo` up by the same amount.
    // Incrementing `availableKobo` here previously left the projection 2× the
    // amount away from the journal, and the vendor's release could not reconcile.
    const platform = await ensureWallet(tx, { ownerType: "SYSTEM" });
    await tx.wallet.update({
      where: { id: platform.id },
      data: { availableKobo: { decrement: amount }, heldKobo: { increment: amount } }
    });
    await tx.wallet.update({ where: { id: input.vendorWalletId }, data: { heldKobo: { increment: amount } } });
    await tx.walletTransaction.create({
      data: {
        walletId: platform.id,
        orderId: input.order.id,
        type: "hold",
        amountKobo: amount,
        reference: `ESCROW-HOLD-${input.order.id}`,
        description: `Verified external payment held for ${input.order.orderNumber}`,
        ledger: {
          create: [
            { walletId: platform.id, direction: "DEBIT", amountKobo: amount, memo: "External payment received into escrow" },
            { walletId: input.vendorWalletId, direction: "CREDIT", amountKobo: amount, memo: "Vendor payable held in escrow" }
          ]
        }
      }
    });
    escrowBuyerWalletId = platform.id;
  }

  return tx.escrowHold.create({
    data: {
      orderId: input.order.id,
      buyerWalletId: escrowBuyerWalletId,
      vendorWalletId: input.vendorWalletId,
      amountKobo: amount,
      status: "held",
      reason: `Payment verified for ${input.order.orderNumber}`,
      events: { create: { from: "pending", to: "held", note: "Payment verified server-side; funds held in escrow." } }
    }
  });
}

async function finalizePaidOrder(tx: Db, input: { order: Order; payment: Payment; walletDebit: boolean; actorId: string }) {
  const { order } = input;
  const buyerWallet = await ensureWallet(tx, { userId: order.customerId, ownerType: "CUSTOMER" });
  const vendorWallet = await ensureWallet(tx, { vendorId: order.vendorId, ownerType: "VENDOR" });

  await recordEscrow(tx, {
    order,
    buyerWalletId: buyerWallet.id,
    vendorWalletId: vendorWallet.id,
    walletDebit: input.walletDebit,
    actorId: input.actorId
  });

  await commitReservedStock(tx, order.id);

  const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: order.vendorId } });
  await tx.order.update({
    where: { id: order.id },
    data: {
      paymentStatus: "paid",
      commissionKobo: commissionFor(order.subtotalKobo, vendor.commissionBps)
    }
  });
  if (order.status === "created") {
    await updateOrderStatus({ tx, actorId: input.actorId, orderId: order.id, status: "payment_pending", note: "Payment initialized." });
  }
  await updateOrderStatus({ tx, actorId: input.actorId, orderId: order.id, status: "escrow_held", note: "Payment verified; escrow hold created." });

  await createDelivery({
    tx,
    actorId: input.actorId,
    orderId: order.id,
    pickupAddress: vendor.pickupAddress,
    dropoffAddress: order.deliveryAddress,
    feeKobo: order.deliveryFeeKobo
  });
  await updateOrderStatus({ tx, actorId: input.actorId, orderId: order.id, status: "vendor_notified", note: "Seller notified to accept the order." });

  await recordAudit({
    tx,
    actorId: input.actorId,
    action: "payment.verified",
    entity: "Payment",
    entityId: input.payment.id,
    metadata: { reference: input.payment.providerReference, amountKobo: input.payment.amountKobo.toString(), provider: input.payment.provider }
  });
}

export async function confirmPayment(input: { reference: string; provider: AdapterId; rawWebhook?: unknown }) {
  const payment = await getPaymentByReference(input.reference);
  if (payment.provider !== input.provider) {
    throw new ApiError(400, "provider_mismatch", "Payment reference does not belong to this provider.");
  }
  if (payment.status === "COMPLETED") {
    return { status: "COMPLETED" as const, orderId: payment.orderId, duplicate: true };
  }
  if (payment.status === "FAILED") {
    throw new ApiError(409, "payment_failed", "This payment attempt has already failed. Start a new payment.");
  }
  if (payment.order.paymentStatus === "paid") {
    return { status: "COMPLETED" as const, orderId: payment.orderId, duplicate: true };
  }

  let verification: PaymentVerifyResult | null = null;

  if (input.provider === "wallet") {
    verification = {
      status: "COMPLETED",
      amountMinor: payment.amountKobo,
      currency: payment.currency,
      providerReference: payment.providerReference
    };
  } else if (input.provider === "test") {
    if (!isTestPaymentsEnabled()) {
      throw new ApiError(503, "provider_unconfigured", "Local test payments are disabled.");
    }
    verification = {
      status: "COMPLETED",
      amountMinor: payment.amountKobo,
      currency: payment.currency,
      providerReference: payment.providerReference,
      raw: { simulated: true, note: "Local test provider verification. Not a real payment." }
    };
  } else {
    verification = await adapters[input.provider].verify(payment.providerReference);
  }

  if (!verification || verification.status !== "COMPLETED") {
    await markPaymentFailed({
      paymentId: payment.id,
      orderId: payment.orderId,
      reason: verification?.failureReason || "Payment was not completed by the provider.",
      raw: input.rawWebhook
    });
    throw new ApiError(402, "payment_failed", verification?.failureReason || "Payment failed.");
  }

  if (verification.amountMinor !== payment.amountKobo || verification.currency !== payment.currency) {
    await markPaymentFailed({
      paymentId: payment.id,
      orderId: payment.orderId,
      reason: `Amount/currency mismatch: expected ${payment.amountKobo} ${payment.currency}, received ${verification.amountMinor} ${verification.currency}.`
    });
    throw new ApiError(409, "amount_mismatch", "Verified payment amount does not match the order total.");
  }

  try {
    await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ status: string }>>`
        SELECT status FROM "Payment" WHERE id = ${payment.id} FOR UPDATE
      `;
      if (locked[0]?.status === "COMPLETED") return;
      if (locked[0]?.status === "FAILED") throw new ApiError(409, "payment_failed", "Payment already failed.");

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "COMPLETED",
          verifiedAt: new Date(),
          raw: input.rawWebhook
            ? JSON.parse(JSON.stringify(input.rawWebhook))
            : verification.raw
              ? JSON.parse(JSON.stringify(verification.raw))
              : undefined
        }
      });
      await finalizePaidOrder(tx, {
        order: payment.order,
        payment,
        walletDebit: input.provider === "wallet",
        actorId: payment.order.customerId
      });
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw error;
  }

  // Post-commit: a notification failure must never undo a verified payment.
  await notifyOrderPaid({
    id: payment.orderId,
    orderNumber: payment.order.orderNumber,
    totalKobo: payment.order.totalKobo,
    customerId: payment.order.customerId
  });

  // Commission is created from the attribution frozen at checkout, never from a
  // cookie or request value. It runs after the payment transaction commits: a
  // commission failure must not undo a verified payment, and the frozen row and
  // the unique dedupe key make a retry safe.
  try {
    const attribution = await prisma.orderAttribution.findUnique({ where: { orderId: payment.orderId } });
    if (attribution) {
      const outcome = await recordConversion({
        entityType: "Order",
        entityId: payment.orderId,
        attributionTouchId: attribution.touchId,
        customerId: payment.order.customerId,
        basisKobo: payment.order.totalKobo,
        subtotalKobo: payment.order.subtotalKobo,
        totalKobo: payment.order.totalKobo
      });
      if (!outcome.created) {
        log.warn("affiliate.conversion_not_created", { orderId: payment.orderId, reason: outcome.reason });
      }
    }
  } catch (error) {
    log.warn("affiliate.conversion_failed", {
      orderId: payment.orderId,
      error: error instanceof Error ? error.message.slice(0, 160) : "unknown"
    });
  }

  return { status: "COMPLETED" as const, orderId: payment.orderId, duplicate: false };
}

/**
 * Split a refund between the seller and the platform.
 *
 * The split is the *increment* of each party's cumulative share, not a fresh
 * proportional calculation for every request. Two independent floor divisions
 * (one per refund) can allocate one kobo more than the released payable over a
 * sequence of refunds, which matters because the refund path only has the
 * released payable and platform cut to reverse. The cumulative form makes the
 * shares of a fully refunded order add up exactly to `payableKobo` and
 * `totalKobo - payableKobo`.
 */
export function allocateRefundShares(input: {
  totalKobo: bigint;
  payableKobo: bigint;
  alreadyRefundedKobo: bigint;
  requestedKobo: bigint;
}) {
  const { totalKobo, payableKobo, alreadyRefundedKobo, requestedKobo } = input;
  if (totalKobo <= BigInt(0)) {
    return { vendorShareKobo: BigInt(0), platformShareKobo: requestedKobo };
  }
  const priorVendor = (payableKobo * alreadyRefundedKobo) / totalKobo;
  const cumulativeVendor = (payableKobo * (alreadyRefundedKobo + requestedKobo)) / totalKobo;
  const vendorShareKobo = cumulativeVendor - priorVendor;
  return { vendorShareKobo, platformShareKobo: requestedKobo - vendorShareKobo };
}

type LockedRefundOrder = Awaited<ReturnType<typeof lockAndReadRefundOrder>>;

type RefundBasis = {
  alreadyRefundedKobo: bigint;
  requestedKobo: bigint;
  isFullRefund: boolean;
};

/**
 * Take the order row lock every money-moving refund and completion needs, then
 * read the authoritative payment and escrow state under that lock. Postgres row
 * locks make the later conditional wallet updates refuse instead of overdrawing
 * when another writer changed the order first.
 */
async function lockAndReadRefundOrder(tx: Prisma.TransactionClient, orderId: string) {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE
  `;
  if (locked.length === 0) throw new ApiError(404, "order_not_found", "Order not found.");
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { payments: true, escrowHolds: { orderBy: { createdAt: "asc" } } }
  });
  const completedPayment = order.payments.find((payment) => payment.status === "COMPLETED");
  if (!completedPayment) throw new ApiError(409, "no_payment", "No completed payment was found for this order.");
  return { order, completedPayment, escrow: order.escrowHolds[0] ?? null };
}

function computeRefundBasis(
  order: { paymentStatus: string; refundedKobo: bigint; totalKobo: bigint },
  requestedKobo: bigint | undefined,
  mode: "initial" | "locked"
): RefundBasis {
  if (order.paymentStatus === "refunded") {
    throw new ApiError(409, "already_refunded", "This order has already been fully refunded.");
  }
  if (!["paid", "partially_refunded", "refund_pending"].includes(order.paymentStatus)) {
    throw new ApiError(409, "not_paid", "Only paid orders can be refunded.");
  }
  const alreadyRefundedKobo = order.refundedKobo ?? BigInt(0);
  const remainingKobo = order.totalKobo - alreadyRefundedKobo;
  if (remainingKobo <= BigInt(0)) {
    throw new ApiError(409, "already_refunded", "This order has already been fully refunded.");
  }
  const requested = requestedKobo ?? remainingKobo;
  if (requested <= BigInt(0) || requested > remainingKobo) {
    // Inside the lock the only way this fails is that another request changed
    // the order after the caller read it, so it is a conflict, not bad input.
    if (mode === "locked") {
      throw new ApiError(409, "refund_conflict", "Another refund changed this order. Reload and try again.");
    }
    throw new ApiError(400, "invalid_refund_amount", `Refund must be between 1 and ${remainingKobo} kobo.`);
  }
  return {
    alreadyRefundedKobo,
    requestedKobo: requested,
    isFullRefund: requested === remainingKobo
  };
}

async function claimRefund(
  tx: Prisma.TransactionClient,
  input: { orderId: string; paymentId: string; actorId: string; reason: string; idempotencyKey: string },
  basis: RefundBasis
) {
  const claim = await tx.order.updateMany({
    where: { id: input.orderId, refundedKobo: basis.alreadyRefundedKobo },
    data: { refundedKobo: { increment: basis.requestedKobo } }
  });
  if (claim.count === 0) {
    throw new ApiError(409, "refund_conflict", "Another refund changed this order. Reload and try again.");
  }
  return tx.refund.create({
    data: {
      orderId: input.orderId,
      paymentId: input.paymentId,
      actorId: input.actorId,
      amountKobo: basis.requestedKobo,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      status: "PENDING"
    }
  });
}

/**
 * Move the money for a claimed refund and close the claim.
 *
 * The buyer of record is the escrow's `buyerWalletId`: the customer for a wallet
 * payment, the platform for a verified external payment. That keeps stored
 * balances and the journal on the same side of every movement.
 */
async function settleRefund(
  tx: Prisma.TransactionClient,
  input: {
    locked: LockedRefundOrder;
    basis: RefundBasis;
    escrowReleased: boolean;
    refund: Refund;
    providerReference?: string;
    reason: string;
    restock?: boolean;
  }
) {
  const { locked, basis, refund } = input;
  const { order, completedPayment, escrow } = locked;
  const requested = basis.requestedKobo;
  const vendorWallet = await ensureWallet(tx, { vendorId: order.vendorId, ownerType: "VENDOR" });
  const platform = await ensureWallet(tx, { ownerType: "SYSTEM" });
  const buyerWalletId = escrow
    ? escrow.buyerWalletId
    : (await ensureWallet(tx, { userId: order.customerId, ownerType: "CUSTOMER" })).id;
  const payable = order.subtotalKobo - order.commissionKobo + order.deliveryFeeKobo;
  const { vendorShareKobo: vendorShare, platformShareKobo: platformShare } = allocateRefundShares({
    totalKobo: order.totalKobo,
    payableKobo: payable,
    alreadyRefundedKobo: basis.alreadyRefundedKobo,
    requestedKobo: requested
  });

  if (input.escrowReleased) {
    // Money already left escrow: reverse each recipient's spendable balance.
    if (completedPayment.provider === "wallet") {
      await tx.wallet.update({ where: { id: buyerWalletId }, data: { availableKobo: { increment: requested } } });
    }
    if (vendorShare > BigInt(0)) {
      const debit = await tx.wallet.updateMany({
        where: { id: vendorWallet.id, availableKobo: { gte: vendorShare } },
        data: { availableKobo: { decrement: vendorShare } }
      });
      if (debit.count === 0) throw new ApiError(409, "refund_conflict", "Seller payable is no longer available to reverse.");
    }
    if (platformShare > BigInt(0)) {
      const debit = await tx.wallet.updateMany({
        where: { id: platform.id, availableKobo: { gte: platformShare } },
        data: { availableKobo: { decrement: platformShare } }
      });
      if (debit.count === 0) throw new ApiError(409, "refund_conflict", "Platform fee balance is no longer available to reverse.");
    }
  } else {
    // The escrow is still open: return the refunded amount from the buyer's hold
    // and reduce the vendor's payable hold. Both parties held `requested` after
    // the previous partial refunds, so the conditional updates cannot overdraw.
    const buyer = await tx.wallet.updateMany({
      where: { id: buyerWalletId, heldKobo: { gte: requested } },
      data: { heldKobo: { decrement: requested }, availableKobo: { increment: requested } }
    });
    if (buyer.count === 0) throw new ApiError(409, "refund_conflict", "The remaining escrow hold is no longer available to refund.");
    const vendor = await tx.wallet.updateMany({
      where: { id: vendorWallet.id, heldKobo: { gte: requested } },
      data: { heldKobo: { decrement: requested } }
    });
    if (vendor.count === 0) throw new ApiError(409, "refund_conflict", "Seller escrow hold is no longer available to reverse.");
  }

  const ledgerEntries = input.escrowReleased
    ? completedPayment.provider === "wallet"
      ? [
          { walletId: buyerWalletId, direction: "CREDIT" as const, amountKobo: requested, memo: "Buyer partial refund credited to wallet" },
          { walletId: vendorWallet.id, direction: "DEBIT" as const, amountKobo: vendorShare, memo: "Seller payable reversed" },
          { walletId: platform.id, direction: "DEBIT" as const, amountKobo: platformShare, memo: "Commission and fee reversed" }
        ]
      : [
          { walletId: vendorWallet.id, direction: "DEBIT" as const, amountKobo: vendorShare, memo: "Seller payable reversed" },
          { walletId: platform.id, direction: "DEBIT" as const, amountKobo: platformShare, memo: "Commission and fee reversed" }
        ]
    : [
        { walletId: buyerWalletId, direction: "CREDIT" as const, amountKobo: requested, memo: "Escrow returned to the buyer of record" },
        { walletId: vendorWallet.id, direction: "DEBIT" as const, amountKobo: requested, memo: "Vendor escrow payable reversed" }
      ];

  await tx.walletTransaction.create({
    data: {
      walletId: buyerWalletId,
      orderId: order.id,
      type: "refund",
      amountKobo: requested,
      reference: `REFUND-${refund.id}`,
      description: `${basis.isFullRefund ? "Refund" : "Partial refund"} for ${order.orderNumber}: ${input.reason}`,
      ledger: { create: ledgerEntries.filter((entry) => entry.amountKobo > BigInt(0)) }
    }
  });

  await tx.refund.update({
    where: { id: refund.id },
    data: { status: "COMPLETED", completedAt: new Date(), providerReference: input.providerReference ?? null }
  });

  // Durable affiliate reversal intent, written in the same transaction as the
  // confirmed refund. A crash cannot lose it and a rollback cannot leave one.
  // The worker processes it independently, so an affiliate failure can never
  // fail or roll back the customer's refund.
  // Allocate the eligible portion from the conversion's frozen snapshot. Only
  // the part of the refund that falls inside the commission basis can reduce
  // commission; when the basis is SUBTOTAL the delivery component is excluded.
  const conversion = await tx.affiliateConversion.findFirst({
    where: { entityType: "Order", entityId: order.id },
    orderBy: { createdAt: "desc" }
  });
  let eligibleKobo: bigint | null = null;
  let allocationPolicy: string | null = null;

  if (!conversion) {
    // Nothing was ever commissioned on this order, so there is nothing to adjust.
    eligibleKobo = 0n;
    allocationPolicy = "no_conversion_v1";
  } else if (!conversion.basisType) {
    // Historical row with no frozen basis: the eligible portion is unknowable and
    // must be reviewed rather than guessed from the editable campaign.
    eligibleKobo = null;
    allocationPolicy = null;
  } else {
    const priorIntents = await tx.affiliateReversalIntent.findMany({
      where: { orderId: order.id, eligibleKobo: { not: null } },
      select: { eligibleKobo: true }
    });
    const priorEligible = priorIntents.reduce((sum, row) => sum + (row.eligibleKobo ?? 0n), 0n);
    // Cumulative proportional allocation, not "consume the subtotal first".
    // A refund of the whole order includes delivery, and only the part that is
    // inside the basis may reduce commission: eligible = requested x basis / paid.
    const paid = order.totalKobo > 0n ? order.totalKobo : conversion.basisKobo;
    const priorGross = await tx.affiliateReversalIntent.aggregate({
      where: { orderId: order.id },
      _sum: { amountKobo: true }
    });
    const cumulativeGross = (priorGross._sum.amountKobo ?? 0n) + requested;
    const cumulativeEligible = (cumulativeGross * conversion.basisKobo) / paid;
    const delta = cumulativeEligible - priorEligible;
    const remainingBasis = conversion.basisKobo - priorEligible;
    const capped = remainingBasis > 0n ? remainingBasis : 0n;
    eligibleKobo = delta < capped ? delta : capped;
    allocationPolicy = `proportional_${conversion.basisType.toLowerCase()}_v1`;
  }

  await tx.affiliateReversalIntent.upsert({
    where: { dedupeKey: `refund:${refund.id}` },
    create: {
      dedupeKey: `refund:${refund.id}`,
      refundId: refund.id,
      orderId: order.id,
      amountKobo: requested,
      eligibleKobo,
      allocationPolicy
    },
    update: {}
  });

  if (basis.isFullRefund) {
    await tx.payment.update({ where: { id: completedPayment.id }, data: { status: "REFUNDED" } });
    // The order-level payment state must move with the payment record, or a
    // fully refunded order keeps reporting `paymentStatus: "paid"`.
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "refunded" } });
    // A hold that was already released keeps its real history; the refund is
    // recorded on the order and the refund row instead.
    if (escrow && !input.escrowReleased) {
      await tx.escrowHold.update({
        where: { id: escrow.id },
        data: { status: "refunded", events: { create: { from: escrow.status, to: "refunded", note: input.reason } } }
      });
    }
    if (input.restock) await restockOrderItems(tx, order.id);
    await updateOrderStatus({
      tx,
      actorId: refund.actorId,
      orderId: order.id,
      status: "refunded",
      note: `Refund issued: ${input.reason}`
    });
  } else {
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "partially_refunded" } });
  }

  await recordAudit({
    tx,
    actorId: refund.actorId,
    action: basis.isFullRefund ? "payment.refunded" : "payment.partially_refunded",
    entity: "Order",
    entityId: order.id,
    metadata: {
      refundId: refund.id,
      idempotencyKey: refund.idempotencyKey,
      before: {
        paymentStatus: order.paymentStatus,
        orderStatus: order.status,
        refundedKobo: basis.alreadyRefundedKobo.toString()
      },
      after: {
        paymentStatus: basis.isFullRefund ? "refunded" : "partially_refunded",
        refundedKobo: (basis.alreadyRefundedKobo + requested).toString()
      },
      amountKobo: requested.toString(),
      reason: input.reason,
      provider: completedPayment.provider,
      restocked: Boolean(input.restock) && basis.isFullRefund
    }
  });

  return {
    orderId: order.id,
    refundedKobo: requested.toString(),
    totalRefundedKobo: (basis.alreadyRefundedKobo + requested).toString(),
    refundId: refund.id
  };
}

export async function refundPayment(input: {
  orderId: string;
  actorId: string;
  reason: string;
  restock?: boolean;
  /** Partial refund in kobo. Omit to refund the remaining balance. */
  amountKobo?: bigint;
  /** Caller-supplied retry key; the same key never calls the provider twice. */
  idempotencyKey?: string;
}) {
  const idempotencyKey = input.idempotencyKey ?? `refund:${input.orderId}:${randomBytes(10).toString("hex")}`;
  const prior = await prisma.refund.findUnique({ where: { idempotencyKey } });
  if (prior) {
    if (prior.status === "COMPLETED") {
      return { orderId: prior.orderId, refundedKobo: prior.amountKobo.toString(), idempotent: true, refundId: prior.id };
    }
    throw new ApiError(409, prior.status === "PENDING" ? "refund_pending" : "refund_failed",
      prior.status === "PENDING" ? "This refund is awaiting provider reconciliation." : "This refund attempt failed. Use a new idempotency key.");
  }

  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: { payments: true, escrowHolds: true }
  });
  if (!order) throw new ApiError(404, "order_not_found", "Order not found.");
  // Validate before reserving anything. The same checks run again under the
  // order lock, where a mismatch means a concurrent writer changed the order.
  const initialBasis = computeRefundBasis(order, input.amountKobo, "initial");
  if (input.restock && !initialBasis.isFullRefund) {
    throw new ApiError(400, "invalid_restock", "Stock can only be restocked on a full refund.");
  }
  const completed = order.payments.find((payment) => payment.status === "COMPLETED");
  if (!completed) throw new ApiError(409, "no_payment", "No completed payment was found for this order.");
  const external = completed.provider !== "wallet";

  const revertClaim = async (refundId: string, requested: bigint) => {
    await prisma.$transaction([
      prisma.refund.update({ where: { id: refundId }, data: { status: "FAILED" } }),
      prisma.order.update({ where: { id: order.id }, data: { refundedKobo: { decrement: requested } } })
    ]);
  };

  try {
    if (external) {
      // External providers keep the reservation separate from settlement because
      // the provider call must happen between them. Completion refuses while a
      // PENDING claim exists, so the reserved amount cannot be released early.
      const claimed = await prisma.$transaction(async (tx) => {
        const locked = await lockAndReadRefundOrder(tx, order.id);
        const basis = computeRefundBasis(locked.order, input.amountKobo, "locked");
        if (input.restock && !basis.isFullRefund) {
          throw new ApiError(400, "invalid_restock", "Stock can only be restocked on a full refund.");
        }
        const refund = await claimRefund(
          tx,
          {
            orderId: order.id,
            paymentId: locked.completedPayment.id,
            actorId: input.actorId,
            reason: input.reason,
            idempotencyKey
          },
          basis
        );
        return { refundId: refund.id, basis, escrowReleased: locked.escrow?.status === "released" };
      });

      const adapter = adapters[completed.provider as AdapterId];
      if (!adapter?.refund) {
        await revertClaim(claimed.refundId, claimed.basis.requestedKobo);
        throw new ApiError(503, "refund_unsupported", `${completed.provider} refunds are not configured on this server.`);
      }
      let result;
      try {
        result = await adapter.refund({
          reference: completed.providerReference,
          amountMinor: claimed.basis.requestedKobo,
          currency: order.currency,
          idempotencyKey
        });
      } catch (error) {
        await revertClaim(claimed.refundId, claimed.basis.requestedKobo);
        throw error;
      }
      if (result.status !== "COMPLETED") {
        await prisma.refund.update({
          where: { id: claimed.refundId },
          data: { providerReference: result.providerReference, status: "PENDING" }
        });
        throw new ApiError(502, "refund_pending", `${adapter.label} has not confirmed this refund. The amount stays reserved for reconciliation.`);
      }

      return await prisma.$transaction(async (tx) => {
        const locked = await lockAndReadRefundOrder(tx, order.id);
        const refundRow = await tx.refund.findUniqueOrThrow({ where: { id: claimed.refundId } });
        if (refundRow.status === "COMPLETED") {
          return { orderId: order.id, refundedKobo: refundRow.amountKobo.toString(), idempotent: true, refundId: refundRow.id };
        }
        if (refundRow.status !== "PENDING") {
          throw new ApiError(409, "refund_failed", "This refund attempt failed. Use a new idempotency key.");
        }
        return settleRefund(tx, {
          locked,
          basis: claimed.basis,
          // A claim made against an already-released hold is a post-release
          // refund; a completion cannot move the escrow after the claim.
          escrowReleased: claimed.escrowReleased || locked.escrow?.status === "released",
          refund: refundRow,
          providerReference: result.providerReference,
          reason: input.reason,
          restock: input.restock
        });
      });
    }

    // Wallet refunds claim and settle in one transaction: a refused movement
    // rolls the claim and the PENDING row back with it, so the order never
    // reports money returned that never moved.
    return await prisma.$transaction(async (tx) => {
      const locked = await lockAndReadRefundOrder(tx, order.id);
      const basis = computeRefundBasis(locked.order, input.amountKobo, "locked");
      if (input.restock && !basis.isFullRefund) {
        throw new ApiError(400, "invalid_restock", "Stock can only be restocked on a full refund.");
      }
      const refund = await claimRefund(
        tx,
        {
          orderId: order.id,
          paymentId: locked.completedPayment.id,
          actorId: input.actorId,
          reason: input.reason,
          idempotencyKey
        },
        basis
      );
      return settleRefund(tx, {
        locked,
        basis,
        escrowReleased: !locked.escrow || locked.escrow.status === "released",
        refund,
        reason: input.reason,
        restock: input.restock
      });
    });
  } catch (error) {
    // Two concurrent requests can carry the same idempotency key. The order-row
    // claim (or the unique Refund key) lets exactly one win; the loser must
    // return the winner's result instead of surfacing a raw constraint error.
    // A conflict caused by a *different* refund has no row under this key and is
    // rethrown unchanged.
    const sameKeyConflict = (error as { code?: string }).code === "P2002" ||
      (!external && error instanceof ApiError && error.code === "refund_conflict");
    if (sameKeyConflict) {
      const raced = await prisma.refund.findUnique({ where: { idempotencyKey } });
      if (raced?.status === "COMPLETED") {
        return { orderId: raced.orderId, refundedKobo: raced.amountKobo.toString(), idempotent: true, refundId: raced.id };
      }
      if (raced?.status === "PENDING") {
        throw new ApiError(409, "refund_pending", "An identical refund request is still being settled. Reload before retrying.");
      }
      if (raced?.status === "FAILED") {
        throw new ApiError(409, "refund_failed", "This refund attempt failed. Use a new idempotency key.");
      }
    }
    throw error;
  }
}

export async function processWebhook(provider: "paystack" | "flutterwave", rawBody: string, headers: Headers) {
  const adapter = adapters[provider];
  if (!adapter.verifyWebhook) throw new ApiError(400, "webhook_unsupported", "This provider does not accept webhooks.");
  const verified = await adapter.verifyWebhook(rawBody, headers);
  if (!verified) throw new ApiError(401, "invalid_signature", "Webhook signature verification failed.");

  const eventKey = { provider, eventId: verified.eventId };
  const existing = await prisma.webhookEvent.findUnique({ where: { provider_eventId: eventKey } });
  if (existing?.status === "processed") {
    return { received: true, duplicate: true };
  }

  if (existing) {
    // A previous attempt failed. Retry processing the same event instead of
    // treating the provider's retry as a duplicate and leaving it stuck.
    await prisma.webhookEvent.update({
      where: { provider_eventId: eventKey },
      data: { status: "received", payload: JSON.parse(JSON.stringify(verified.raw)) }
    });
  } else {
    try {
      await prisma.webhookEvent.create({
        data: { provider, eventId: verified.eventId, payload: JSON.parse(JSON.stringify(verified.raw)) }
      });
    } catch {
      return { received: true, duplicate: true };
    }
  }

  try {
    if (verified.status === "COMPLETED") {
      await confirmPayment({ reference: verified.reference, provider, rawWebhook: verified.raw });
    } else if (verified.status === "FAILED") {
      const payment = await prisma.payment.findUnique({ where: { providerReference: verified.reference } });
      if (payment) {
        await markPaymentFailed({
          paymentId: payment.id,
          orderId: payment.orderId,
          reason: "Provider reported the payment as failed.",
          raw: verified.raw
        });
      }
    }
    await prisma.webhookEvent.update({
      where: { provider_eventId: eventKey },
      data: { status: "processed", processedAt: new Date() }
    });
    return { received: true, duplicate: false };
  } catch (error) {
    await prisma.webhookEvent.update({
      where: { provider_eventId: eventKey },
      data: { status: "failed", processedAt: new Date() }
    });
    throw error;
  }
}

export { getPaymentByReference };
