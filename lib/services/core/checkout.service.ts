import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { commissionFor, deliveryQuote, escrowFee, getCountry } from "@/lib/config/commerce";
import { recordAudit } from "./audit.service";
import { recordSystemEvent } from "./event.service";
import { updateOrderStatus } from "./order.service";
import { availablePaymentMethods } from "@/lib/payments/service";
import { activationFor } from "./country.service";
import { resolveCheckoutAttribution } from "@/lib/services/affiliate/service";

export type CheckoutAddress = {
  label?: string;
  contactName: string;
  contactPhone: string;
  countryCode: string;
  state: string;
  city: string;
  line1: string;
  line2?: string | null;
  postalCode?: string | null;
};

function formatAddress(address: CheckoutAddress) {
  return [address.line1, address.line2, address.city, address.state, address.countryCode]
    .filter((part) => Boolean(part && String(part).trim()))
    .join(", ");
}

export async function checkout(input: {
  userId: string;
  address: CheckoutAddress;
  saveAddress?: boolean;
  /** Visitor key issued by middleware; never supplied by the client. */
  visitorKey?: string | null;
}) {
  const country = getCountry(input.address.countryCode);
  // Runtime activation overrides the static catalogue; absent rows fall back to config.
  const activation = await activationFor(country.code);
  const countryEnabled = activation?.enabled ?? country.enabled;
  const deliveryEnabled = activation?.deliveryEnabled ?? country.deliveryEnabled;
  if (!countryEnabled) throw new ApiError(400, "country_disabled", `${country.name} is not open for checkout yet.`);
  if (!deliveryEnabled) {
    throw new ApiError(503, "delivery_unconfigured", `Delivery is not configured for ${country.name}. No order was created.`);
  }

  const cart = await prisma.cart.findFirst({
    where: { userId: input.userId, status: "ACTIVE" },
    include: {
      items: {
        include: {
          product: {
            include: {
              vendor: true,
              images: { orderBy: { sortOrder: "asc" }, take: 1 },
              variants: { where: { isActive: true } }
            }
          },
          variant: true
        }
      }
    }
  });
  if (!cart || cart.items.length === 0) throw new ApiError(400, "empty_cart", "Your cart is empty.");

  const demoItem = cart.items.find((item) => item.product.isSample);
  if (demoItem) {
    throw new ApiError(409, "demo_inventory", "Demo inventory is for visual review only and cannot be purchased. Remove demo items before checking out.");
  }

  const unavailable = cart.items.find(
    (item) =>
      item.product.status !== "ACTIVE" ||
      item.product.vendor.status !== "VERIFIED" ||
      (item.variantId && (!item.variant || !item.variant.isActive)) ||
      (!item.variantId && item.product.variants.length > 0)
  );
  if (unavailable) {
    throw new ApiError(409, "item_unavailable", `${unavailable.product.name} is no longer available. Remove it from the cart.`);
  }

  const deliveryAddress = formatAddress(input.address);
  const byVendor = new Map<string, typeof cart.items>();
  for (const item of cart.items) {
    const group = byVendor.get(item.product.vendorId) ?? [];
    group.push(item);
    byVendor.set(item.product.vendorId, group);
  }

  // Resolved server-side before the order exists. The frozen row below is the
  // only thing payment-time commission creation reads.
  const attribution = await resolveCheckoutAttribution({ userId: input.userId, visitorKey: input.visitorKey ?? null });

  const created = await prisma.$transaction(async (tx) => {
    const orders: Array<{
      orderId: string;
      orderNumber: string;
      vendorId: string;
      vendorName: string;
      subtotalKobo: string;
      deliveryFeeKobo: string;
      escrowFeeKobo: string;
      totalKobo: string;
      currency: string;
    }> = [];

    for (const [vendorId, items] of byVendor) {
      const subtotalKobo = items.reduce((total, item) => {
        const unit = item.variant ? item.variant.priceKobo : item.product.priceKobo;
        return total + unit * BigInt(item.quantity);
      }, BigInt(0));

      const quote = deliveryQuote({
        countryCode: input.address.countryCode,
        state: input.address.state,
        city: input.address.city,
        subtotalKobo
      });
      const feeKobo = escrowFee(subtotalKobo);
      const totalKobo = subtotalKobo + quote.feeKobo + feeKobo;

      // Atomic reservation: the WHERE clause guarantees we never oversell, even
      // when two checkouts race for the last unit.
      for (const item of items) {
        if (item.variantId) {
          const rows = await tx.$queryRaw<Array<{ id: string }>>`
            UPDATE "ProductVariant"
            SET reserved = reserved + ${item.quantity}
            WHERE id = ${item.variantId} AND stock - reserved >= ${item.quantity}
            RETURNING id
          `;
          if (rows.length === 0) {
            throw new ApiError(409, "insufficient_stock", `${item.product.name} does not have enough stock.`);
          }
        } else {
          const rows = await tx.$queryRaw<Array<{ id: string }>>`
            UPDATE "InventoryStock"
            SET reserved = reserved + ${item.quantity}
            WHERE "productId" = ${item.productId} AND quantity - reserved >= ${item.quantity}
            RETURNING id
          `;
          if (rows.length === 0) {
            throw new ApiError(409, "insufficient_stock", `${item.product.name} does not have enough stock.`);
          }
        }
      }

      const vendor = items[0].product.vendor;
      const orderNumber = `ND-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomBytes(3).toString("hex").toUpperCase()}`;
      const order = await tx.order.create({
        data: {
          orderNumber,
          customerId: input.userId,
          vendorId,
          cartId: cart.id,
          status: "created",
          paymentStatus: "pending",
          subtotalKobo,
          deliveryFeeKobo: quote.feeKobo,
          escrowFeeKobo: feeKobo,
          commissionKobo: commissionFor(subtotalKobo, vendor.commissionBps),
          totalKobo,
          currency: country.currency,
          countryCode: country.code,
          deliveryAddress,
          deliveryZone: quote.zone.id,
          contactName: input.address.contactName,
          contactPhone: input.address.contactPhone,
          items: {
            create: items.map((item) => {
              const unit = item.variant ? item.variant.priceKobo : item.product.priceKobo;
              return {
                productId: item.productId,
                variantId: item.variantId,
                quantity: item.quantity,
                unitKobo: unit,
                totalKobo: unit * BigInt(item.quantity),
                productName: item.product.name,
                variantName: item.variant?.name ?? null,
                imageUrl: item.product.images[0]?.url ?? null
              };
            })
          },
          statusEvents: { create: { from: null, to: "created", note: "Checkout created order and reserved stock." } }
        }
      });

      await updateOrderStatus({
        tx,
        actorId: input.userId,
        orderId: order.id,
        status: "payment_pending",
        note: "Awaiting verified payment."
      });

      await recordSystemEvent({
        tx,
        type: "order.created",
        actorId: input.userId,
        entity: "Order",
        entityId: order.id,
        payload: { orderNumber, totalKobo: totalKobo.toString(), vendorId }
      });
      await recordAudit({
        tx,
        actorId: input.userId,
        action: "order.created",
        entity: "Order",
        entityId: order.id,
        metadata: { orderNumber, totalKobo: totalKobo.toString(), vendorId }
      });

      if (attribution) {
        await tx.orderAttribution.create({
          data: {
            orderId: order.id,
            touchId: attribution.id,
            linkId: attribution.linkId,
            affiliateId: attribution.link.affiliateId,
            campaignId: attribution.link.campaignId,
            expiresAt: attribution.expiresAt
          }
        });
      }

      orders.push({
        orderId: order.id,
        orderNumber,
        vendorId,
        vendorName: vendor.name,
        subtotalKobo: subtotalKobo.toString(),
        deliveryFeeKobo: quote.feeKobo.toString(),
        escrowFeeKobo: feeKobo.toString(),
        totalKobo: totalKobo.toString(),
        currency: country.currency
      });
    }

    await tx.cart.update({ where: { id: cart.id }, data: { status: "CHECKED_OUT" } });

    if (input.saveAddress) {
      await tx.address.create({
        data: {
          userId: input.userId,
          label: input.address.label || "Checkout address",
          countryCode: input.address.countryCode,
          state: input.address.state,
          city: input.address.city,
          line1: input.address.line1,
          line2: input.address.line2 ?? null,
          phone: input.address.contactPhone,
          postalCode: input.address.postalCode ?? null
        }
      });
    }

    return orders;
  });

  return {
    orders: created,
    paymentMethods: availablePaymentMethods(country.code),
    attributed: Boolean(attribution)
  };
}

const DEFAULT_ABANDON_AFTER_MS = 30 * 60 * 1000;
const MIN_ABANDON_AFTER_MS = 60 * 1000;
const MAX_SWEEP_BATCH = 100;

class ExpirySkip extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "ExpirySkip";
  }
}

export type AbandonedCheckoutSweep = {
  inspected: number;
  expired: Array<{ orderId: string; orderNumber: string }>;
  skipped: Array<{ orderId: string; reason: string }>;
};

/**
 * Release reservations held by checkouts that were never paid.
 *
 * The payment retry/cancel paths already release stock (`markPaymentFailed`,
 * `cancelOrder`). This bounded sweep closes the third path: a checkout that was
 * abandoned with no provider callback at all. It is deliberately conservative:
 *
 *  - only `created`/`payment_pending` orders whose `paymentStatus` is still
 *    `pending` are candidates;
 *  - the payment rows are locked first (the same order `confirmPayment` uses),
 *    then the order row, so an in-flight payment either commits before the
 *    sweep and makes it skip, or is marked FAILED by the sweep and its
 *    confirmation is refused;
 *  - an order with any COMPLETED payment, escrow hold or delivery is never
 *    cancelled or restocked;
 *  - stock is released once through the shared `releaseReservedStock` helper.
 *
 * It is a service function, not a timer: no scheduler is wired to it yet.
 */
export async function expireAbandonedCheckouts(
  input: { olderThanMs?: number; limit?: number; orderIds?: string[] } = {}
): Promise<AbandonedCheckoutSweep> {
  const olderThanMs = input.olderThanMs ?? DEFAULT_ABANDON_AFTER_MS;
  if (!Number.isFinite(olderThanMs) || olderThanMs < MIN_ABANDON_AFTER_MS) {
    throw new ApiError(400, "invalid_expiry_window", "The abandonment window must be at least one minute.");
  }
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 25), 1), MAX_SWEEP_BATCH);
  const cutoff = new Date(Date.now() - olderThanMs);
  // A scheduler sweeps globally. `orderIds` is a bounded support/manual scope so
  // an operator or an acceptance run cannot expire unrelated orders.
  const scope = input.orderIds?.length ? { id: { in: input.orderIds } } : {};

  const candidates = await prisma.order.findMany({
    where: {
      ...scope,
      status: { in: ["created", "payment_pending"] },
      paymentStatus: "pending",
      createdAt: { lt: cutoff }
    },
    select: { id: true, orderNumber: true },
    orderBy: { createdAt: "asc" },
    take: limit
  });

  const { releaseReservedStock } = await import("@/lib/payments/service");
  const sweep: AbandonedCheckoutSweep = { inspected: candidates.length, expired: [], skipped: [] };

  for (const candidate of candidates) {
    try {
      await prisma.$transaction(async (tx) => {
        // Lock payments before the order, matching confirmPayment's write order so
        // the two transactions cannot deadlock and a paid attempt always wins.
        const lockedPayments = await tx.$queryRaw<Array<{ id: string; status: string }>>`
          SELECT id, status FROM "Payment" WHERE "orderId" = ${candidate.id} FOR UPDATE
        `;
        if (lockedPayments.some((payment) => payment.status === "COMPLETED")) {
          throw new ExpirySkip("payment_completed");
        }
        const completed = await tx.payment.count({ where: { orderId: candidate.id, status: "COMPLETED" } });
        if (completed > 0) throw new ExpirySkip("payment_completed");

        const lockedOrder = await tx.$queryRaw<Array<{ status: string; paymentStatus: string }>>`
          SELECT status, "paymentStatus" FROM "Order" WHERE id = ${candidate.id} FOR UPDATE
        `;
        const current = lockedOrder[0];
        if (!current) throw new ExpirySkip("order_missing");
        if (!["created", "payment_pending"].includes(current.status)) {
          throw new ExpirySkip(`status_${current.status}`);
        }
        if (current.paymentStatus !== "pending") {
          throw new ExpirySkip(`payment_${current.paymentStatus}`);
        }

        const [escrowCount, deliveryCount] = await Promise.all([
          tx.escrowHold.count({ where: { orderId: candidate.id } }),
          tx.delivery.count({ where: { orderId: candidate.id } })
        ]);
        if (escrowCount > 0) throw new ExpirySkip("escrow_exists");
        if (deliveryCount > 0) throw new ExpirySkip("delivery_exists");

        await releaseReservedStock(tx, candidate.id);
        await tx.payment.updateMany({
          where: { orderId: candidate.id, status: "PENDING" },
          data: { status: "FAILED", failureReason: "Checkout expired before payment." }
        });
        await updateOrderStatus({
          tx,
          actorId: null,
          orderId: candidate.id,
          status: "cancelled",
          note: `Checkout abandoned for ${Math.round(olderThanMs / 60000)} minutes; reserved stock released.`
        });
        await recordAudit({
          tx,
          actorId: null,
          action: "order.expired",
          entity: "Order",
          entityId: candidate.id,
          metadata: {
            orderNumber: candidate.orderNumber,
            abandonedAfterMs: olderThanMs,
            releasedStock: true
          }
        });
      });
      sweep.expired.push({ orderId: candidate.id, orderNumber: candidate.orderNumber });
    } catch (error) {
      if (error instanceof ExpirySkip) {
        sweep.skipped.push({ orderId: candidate.id, reason: error.reason });
        continue;
      }
      throw error;
    }
  }

  return sweep;
}

export async function cancelOrder(input: { orderId: string; userId: string; reason: string }) {
  const order = await prisma.order.findUnique({ where: { id: input.orderId }, include: { payments: true } });
  if (!order) throw new ApiError(404, "order_not_found", "Order not found.");
  if (order.customerId !== input.userId) throw new ApiError(403, "forbidden", "This order belongs to another account.");
  if (!["created", "payment_pending", "vendor_notified"].includes(order.status)) {
    throw new ApiError(409, "not_cancellable", "This order can no longer be cancelled by the customer.");
  }

  if (order.paymentStatus === "paid") {
    const { refundPayment } = await import("@/lib/payments/service");
    await refundPayment({ orderId: order.id, actorId: input.userId, reason: input.reason, restock: true });
    return { orderId: order.id, cancelled: true, refunded: true };
  }

  const { releaseReservedStock } = await import("@/lib/payments/service");
  await prisma.$transaction(async (tx) => {
    await releaseReservedStock(tx, order.id);
    await tx.payment.updateMany({
      where: { orderId: order.id, status: "PENDING" },
      data: { status: "FAILED", failureReason: "Order cancelled before payment." }
    });
    await updateOrderStatus({ tx, actorId: input.userId, orderId: order.id, status: "cancelled", note: input.reason });
    await recordAudit({
      tx,
      actorId: input.userId,
      action: "order.cancelled",
      entity: "Order",
      entityId: order.id,
      metadata: { reason: input.reason }
    });
  });
  return { orderId: order.id, cancelled: true, refunded: false };
}
