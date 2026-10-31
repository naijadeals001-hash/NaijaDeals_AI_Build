import { randomBytes } from "node:crypto";
import type { Order, Payment, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCountry, commissionFor } from "@/lib/config/commerce";
import { ApiError } from "@/lib/auth/guard";
import { adapters, type AdapterId, isTestPaymentsEnabled } from "./adapters";
import type { PaymentVerifyResult } from "./types";
import { updateOrderStatus } from "@/lib/services/core/order.service";
import { recordAudit } from "@/lib/services/core/audit.service";
import { recordSystemEvent } from "@/lib/services/core/event.service";
import { createDelivery } from "@/lib/services/core/delivery.service";

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
  const existing = await tx.wallet.findFirst({
    where: input.userId ? { userId: input.userId } : input.vendorId ? { vendorId: input.vendorId } : { ownerType: "SYSTEM" }
  });
  if (existing) return existing;
  return tx.wallet.create({
    data: {
      ownerType: input.ownerType,
      userId: input.userId ?? null,
      vendorId: input.vendorId ?? null
    }
  });
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
    const platform = await ensureWallet(tx, { ownerType: "SYSTEM" });
    await tx.wallet.update({ where: { id: platform.id }, data: { availableKobo: { increment: amount } } });
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
  }

  return tx.escrowHold.create({
    data: {
      orderId: input.order.id,
      buyerWalletId: input.buyerWalletId,
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

  return { status: "COMPLETED" as const, orderId: payment.orderId, duplicate: false };
}

export async function refundPayment(input: { orderId: string; actorId: string; reason: string; restock?: boolean }) {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: { payments: true, escrowHolds: true }
  });
  if (!order) throw new ApiError(404, "order_not_found", "Order not found.");
  if (order.paymentStatus !== "paid") throw new ApiError(409, "not_paid", "Only paid orders can be refunded.");

  const completed = order.payments.find((payment) => payment.status === "COMPLETED");
  if (!completed) throw new ApiError(409, "no_payment", "No completed payment was found for this order.");

  const external = completed.provider !== "wallet";
  if (external) {
    const adapter = adapters[completed.provider as AdapterId];
    if (!adapter?.refund) {
      throw new ApiError(503, "refund_unsupported", `${completed.provider} refunds are not configured on this server.`);
    }
    const result = await adapter.refund({
      reference: completed.providerReference,
      amountMinor: order.totalKobo,
      currency: order.currency
    });
    if (result.status !== "COMPLETED") {
      throw new ApiError(
        502,
        "refund_pending",
        `${adapter.label} accepted the refund request but has not confirmed it. The order remains paid until reconciliation.`
      );
    }
  }

  const escrow = order.escrowHolds[0];
  const escrowReleased = escrow?.status === "released";
  const payable = order.subtotalKobo - order.commissionKobo + order.deliveryFeeKobo;
  const platformCut = order.totalKobo - payable;

  return prisma.$transaction(async (tx) => {
    const buyerWallet = await ensureWallet(tx, { userId: order.customerId, ownerType: "CUSTOMER" });
    const vendorWallet = await ensureWallet(tx, { vendorId: order.vendorId, ownerType: "VENDOR" });
    const platform = await ensureWallet(tx, { ownerType: "SYSTEM" });

    if (completed.provider === "wallet" && escrowReleased) {
      await tx.wallet.update({
        where: { id: buyerWallet.id },
        data: { availableKobo: { increment: order.totalKobo } }
      });
      const vendorDebit = await tx.wallet.updateMany({
        where: { id: vendorWallet.id, availableKobo: { gte: payable } },
        data: { availableKobo: { decrement: payable } }
      });
      if (vendorDebit.count === 0) throw new ApiError(409, "refund_conflict", "Seller payable is no longer available to reverse.");
      if (platformCut > BigInt(0)) {
        await tx.wallet.updateMany({
          where: { id: platform.id, availableKobo: { gte: platformCut } },
          data: { availableKobo: { decrement: platformCut } }
        });
      }
    } else if (completed.provider === "wallet") {
      const buyerHeld = await tx.wallet.updateMany({
        where: { id: buyerWallet.id, heldKobo: { gte: order.totalKobo } },
        data: { heldKobo: { decrement: order.totalKobo }, availableKobo: { increment: order.totalKobo } }
      });
      if (buyerHeld.count === 0) throw new ApiError(409, "refund_conflict", "Escrow hold is no longer available to refund.");
      await tx.wallet.updateMany({
        where: { id: vendorWallet.id, heldKobo: { gte: order.totalKobo } },
        data: { heldKobo: { decrement: order.totalKobo } }
      });
    } else if (escrowReleased) {
      const vendorDebit = await tx.wallet.updateMany({
        where: { id: vendorWallet.id, availableKobo: { gte: payable } },
        data: { availableKobo: { decrement: payable } }
      });
      if (vendorDebit.count === 0) throw new ApiError(409, "refund_conflict", "Seller payable is no longer available to reverse.");
      if (platformCut > BigInt(0)) {
        await tx.wallet.updateMany({
          where: { id: platform.id, availableKobo: { gte: platformCut } },
          data: { availableKobo: { decrement: platformCut } }
        });
      }
    } else {
      const platformDebit = await tx.wallet.updateMany({
        where: { id: platform.id, availableKobo: { gte: order.totalKobo } },
        data: { availableKobo: { decrement: order.totalKobo } }
      });
      if (platformDebit.count === 0) throw new ApiError(409, "refund_conflict", "Platform escrow balance is no longer available to refund.");
      await tx.wallet.updateMany({
        where: { id: vendorWallet.id, heldKobo: { gte: order.totalKobo } },
        data: { heldKobo: { decrement: order.totalKobo } }
      });
    }

    const ledgerEntries =
      completed.provider === "wallet"
        ? escrowReleased
          ? [
              { walletId: buyerWallet.id, direction: "CREDIT" as const, amountKobo: order.totalKobo, memo: "Buyer refund credited to wallet" },
              { walletId: vendorWallet.id, direction: "DEBIT" as const, amountKobo: payable, memo: "Seller payable reversed" },
              { walletId: platform.id, direction: "DEBIT" as const, amountKobo: platformCut, memo: "Commission and fee reversed" }
            ]
          : [
              { walletId: buyerWallet.id, direction: "CREDIT" as const, amountKobo: order.totalKobo, memo: "Escrow returned to buyer wallet" },
              { walletId: vendorWallet.id, direction: "DEBIT" as const, amountKobo: order.totalKobo, memo: "Vendor escrow payable reversed" }
            ]
        : escrowReleased
          ? [
              { walletId: vendorWallet.id, direction: "DEBIT" as const, amountKobo: payable, memo: "Seller payable reversed" },
              { walletId: platform.id, direction: "DEBIT" as const, amountKobo: platformCut, memo: "Commission and fee reversed" }
            ]
          : [
              { walletId: platform.id, direction: "DEBIT" as const, amountKobo: order.totalKobo, memo: "Refund paid to original payment method" },
              { walletId: vendorWallet.id, direction: "CREDIT" as const, amountKobo: order.totalKobo, memo: "Vendor escrow liability reversed" }
            ];

    await tx.walletTransaction.create({
      data: {
        walletId: completed.provider === "wallet" ? buyerWallet.id : platform.id,
        orderId: order.id,
        type: "refund",
        amountKobo: order.totalKobo,
        reference: `REFUND-${order.id}-${randomBytes(3).toString("hex")}`,
        description: `Refund for ${order.orderNumber}: ${input.reason}`,
        ledger: { create: ledgerEntries }
      }
    });

    await tx.payment.update({
      where: { id: completed.id },
      data: { status: "REFUNDED" }
    });
    await tx.order.update({
      where: { id: order.id },
      data: { paymentStatus: "refunded", refundedKobo: order.totalKobo }
    });
    if (escrow) {
      await tx.escrowHold.update({
        where: { id: escrow.id },
        data: { status: "refunded", events: { create: { from: escrow.status, to: "refunded", note: input.reason } } }
      });
    }
    if (input.restock) await restockOrderItems(tx, order.id);
    await updateOrderStatus({ tx, actorId: input.actorId, orderId: order.id, status: "refunded", note: `Refund issued: ${input.reason}` });

    await recordAudit({
      tx,
      actorId: input.actorId,
      action: "payment.refunded",
      entity: "Order",
      entityId: order.id,
      metadata: { amountKobo: order.totalKobo.toString(), reason: input.reason, provider: completed.provider, restocked: Boolean(input.restock) }
    });

    return { orderId: order.id, refundedKobo: order.totalKobo.toString() };
  });
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
