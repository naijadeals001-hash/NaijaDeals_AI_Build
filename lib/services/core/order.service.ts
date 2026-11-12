import type { OrderStatus, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { recordAudit } from "./audit.service";
import { enqueueVendorNotification } from "./notification.service";
import { notifyEscrowReleased, notifyOrderStatus } from "@/lib/notifications/domain-events";
import { recordSystemEvent } from "./event.service";
import { assertOrderTransition } from "./state-machines";
import { ensureWallet } from "@/lib/payments/service";

type Db = PrismaClient | Prisma.TransactionClient;

export async function getOrders(userId?: string) {
  return prisma.order.findMany({
    where: userId ? { customerId: userId } : undefined,
    include: {
      items: true,
      statusEvents: { orderBy: { createdAt: "asc" } },
      deliveries: { include: { trackingEvents: { orderBy: { createdAt: "asc" } } } },
      escrowHolds: true,
      payments: { select: { id: true, provider: true, status: true, amountKobo: true, verifiedAt: true } },
      vendor: { select: { id: true, name: true, market: true } },
      returnRequests: true,
      reviews: true
    },
    orderBy: { createdAt: "desc" }
  });
}

export async function getOrder(id: string) {
  return prisma.order.findUniqueOrThrow({
    where: { id },
    include: {
      items: true,
      statusEvents: { orderBy: { createdAt: "asc" } },
      deliveries: { include: { trackingEvents: { orderBy: { createdAt: "asc" } }, courier: true } },
      escrowHolds: { include: { events: true } },
      payments: true,
      vendor: true,
      customer: { select: { id: true, name: true, email: true, phone: true } },
      returnRequests: true,
      reviews: true
    }
  });
}

export async function updateOrderStatus(input: {
  tx?: Db;
  actorId?: string | null;
  orderId: string;
  status: OrderStatus;
  note?: string;
}) {
  const db = input.tx ?? prisma;
  const current = await db.order.findUniqueOrThrow({ where: { id: input.orderId } });
  assertOrderTransition(current.status, input.status);
  const order = await db.order.update({
    where: { id: input.orderId },
    data: {
      status: input.status,
      statusEvents: { create: { from: current.status, to: input.status, note: input.note } }
    },
    include: { statusEvents: true }
  });

  await recordSystemEvent({
    tx: db,
    type: "order.status_changed",
    actorId: input.actorId,
    entity: "Order",
    entityId: order.id,
    payload: { from: current.status, to: input.status }
  });
  await recordAudit({
    tx: db,
    actorId: input.actorId,
    action: "order.status_changed",
    entity: "Order",
    entityId: order.id,
    metadata: { from: current.status, to: input.status }
  });

  if (input.status === "vendor_notified") {
    // Durable outbox: the intent is written in this transaction, so a rollback
    // removes it and a committed payment always has exactly one delivery job.
    // No notification is sent while the financial transaction holds its
    // connection, which keeps connection_limit=1 pools deadlock-free.
    await enqueueVendorNotification({
      tx: db,
      vendorId: order.vendorId,
      eventType: "order.paid.vendor",
      dedupeKey: `order.paid.vendor:${order.id}`,
      entityType: "Order",
      entityId: order.id,
      orderNumber: order.orderNumber,
      href: "/seller"
    });
  }

  return order;
}

/**
 * The remaining amount an escrow release may still pay out.
 *
 * `EscrowHold.amountKobo` is frozen when payment is verified. A partial refund
 * reduces the money actually held (`Order.refundedKobo`) but leaves the hold row
 * at its original amount, so releasing `escrow.amountKobo` after a refund would
 * pay out money the buyer already received back. The seller's share is the
 * unrefunded part of the frozen payable, using the same cumulative proportional
 * split as `allocateRefundShares`, never the live fare/commission configuration.
 */
export function releaseObligation(input: {
  escrowAmountKobo: bigint;
  orderTotalKobo: bigint;
  payableKobo: bigint;
  refundedKobo: bigint;
}) {
  const basePayable = input.payableKobo > BigInt(0) ? input.payableKobo : BigInt(0);
  const refunded = input.refundedKobo > BigInt(0) ? input.refundedKobo : BigInt(0);
  const cappedRefunded = refunded > input.escrowAmountKobo ? input.escrowAmountKobo : refunded;
  const releasableKobo = input.escrowAmountKobo - cappedRefunded;
  const shareRefunded = cappedRefunded > input.orderTotalKobo ? input.orderTotalKobo : cappedRefunded;
  const reversedPayableKobo =
    input.orderTotalKobo > BigInt(0) ? (basePayable * shareRefunded) / input.orderTotalKobo : basePayable;
  let payableKobo = basePayable - reversedPayableKobo;
  if (payableKobo < BigInt(0)) payableKobo = BigInt(0);
  if (payableKobo > releasableKobo) payableKobo = releasableKobo;
  return {
    releasableKobo,
    payableKobo,
    platformKobo: releasableKobo - payableKobo
  };
}

/**
 * Customer confirms receipt. Escrow is released to the seller net of commission.
 *
 * Authoritative state is re-read under an order row lock inside the transaction,
 * so a concurrent refund and a concurrent completion cannot both spend the same
 * escrowed balance. A duplicate completion is idempotent: it returns the release
 * already recorded and moves no money a second time.
 */
export async function completeOrder(userId: string, orderId: string) {
  const pre = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, customerId: true } });
  if (!pre) throw new ApiError(404, "order_not_found", "Order not found.");
  if (pre.customerId !== userId) throw new ApiError(403, "forbidden", "This order belongs to another account.");

  const result = await prisma.$transaction(async (tx) => {
    // Serialise with refundPayment, which takes the same lock before touching
    // the order's escrow balances.
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE
    `;
    if (locked.length === 0) throw new ApiError(404, "order_not_found", "Order not found.");

    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        escrowHolds: { orderBy: { createdAt: "asc" } },
        refunds: { where: { status: "PENDING" }, select: { id: true } }
      }
    });
    if (order.customerId !== userId) throw new ApiError(403, "forbidden", "This order belongs to another account.");

    const escrow = order.escrowHolds[0];
    const frozenPayable = order.subtotalKobo - order.commissionKobo + order.deliveryFeeKobo;
    const obligation = escrow
      ? releaseObligation({
          escrowAmountKobo: escrow.amountKobo,
          orderTotalKobo: order.totalKobo,
          payableKobo: frozenPayable,
          refundedKobo: order.refundedKobo
        })
      : {
          releasableKobo: BigInt(0),
          payableKobo: frozenPayable > BigInt(0) ? frozenPayable : BigInt(0),
          platformKobo: BigInt(0)
        };

    if (order.status === "completed") {
      if (escrow && escrow.status !== "released") {
        throw new ApiError(409, "escrow_not_released", "This order is completed but its escrow state is inconsistent. Contact support.");
      }
      const release = await tx.walletTransaction.findFirst({
        where: { orderId: order.id, reference: `RELEASE-${order.id}` },
        select: { amountKobo: true }
      });
      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        totalKobo: order.totalKobo,
        status: "completed" as const,
        payableKobo: (release?.amountKobo ?? obligation.payableKobo).toString(),
        duplicate: true
      };
    }
    if (order.status !== "delivered") throw new ApiError(409, "not_delivered", "Only delivered orders can be completed.");
    // An external refund reserves `refundedKobo` before its provider call. Until
    // that call settles, the held amount has no open record to attribute it to,
    // so completion must wait rather than release or strand it.
    if (order.refunds.length > 0) {
      throw new ApiError(409, "refund_pending", "A refund is still awaiting provider confirmation. Retry completion after it settles.");
    }

    if (escrow) {
      if (!["held", "release_eligible"].includes(escrow.status)) {
        throw new ApiError(409, "escrow_not_releasable", `Escrow is ${escrow.status} and cannot be released.`);
      }
      if (obligation.releasableKobo <= BigInt(0)) {
        throw new ApiError(409, "escrow_conflict", "The escrow has no releasable balance after its refunds.");
      }

      const claimed = await tx.escrowHold.updateMany({
        where: { id: escrow.id, status: { in: ["held", "release_eligible"] } },
        data: { status: "released" }
      });
      if (claimed.count !== 1) {
        throw new ApiError(409, "escrow_conflict", "The escrow changed while completing this order. Reload and try again.");
      }

      const vendorWallet = await ensureWallet(tx, { vendorId: order.vendorId, ownerType: "VENDOR" });
      // The buyer of record is the wallet that actually holds the escrow: the
      // customer for wallet payments, the platform for verified external payments.
      const buyerRelease = await tx.wallet.updateMany({
        where: { id: escrow.buyerWalletId, heldKobo: { gte: obligation.releasableKobo } },
        data: { heldKobo: { decrement: obligation.releasableKobo } }
      });
      if (buyerRelease.count !== 1) {
        throw new ApiError(409, "escrow_conflict", "The remaining escrow hold is no longer available to release.");
      }
      const sellerRelease = await tx.wallet.updateMany({
        where: { id: vendorWallet.id, heldKobo: { gte: obligation.releasableKobo } },
        data: {
          heldKobo: { decrement: obligation.releasableKobo },
          availableKobo: { increment: obligation.payableKobo }
        }
      });
      if (sellerRelease.count !== 1) {
        throw new ApiError(409, "escrow_conflict", "The seller's remaining escrow hold is no longer available to release.");
      }

      const entries = [
        { walletId: vendorWallet.id, direction: "DEBIT" as const, amountKobo: obligation.releasableKobo, memo: "Remaining escrow payable cleared" },
        { walletId: vendorWallet.id, direction: "CREDIT" as const, amountKobo: obligation.payableKobo, memo: "Seller net proceeds credited" }
      ];
      if (obligation.platformKobo > BigInt(0)) {
        const platformWallet = await ensureWallet(tx, { ownerType: "SYSTEM" });
        await tx.wallet.update({
          where: { id: platformWallet.id },
          data: { availableKobo: { increment: obligation.platformKobo } }
        });
        entries.push({
          walletId: platformWallet.id,
          direction: "CREDIT" as const,
          amountKobo: obligation.platformKobo,
          memo: "Remaining commission and fees retained by NaijaDeals"
        });
      }

      const debitKobo = entries.filter((entry) => entry.direction === "DEBIT").reduce((sum, entry) => sum + entry.amountKobo, BigInt(0));
      const creditKobo = entries.filter((entry) => entry.direction === "CREDIT").reduce((sum, entry) => sum + entry.amountKobo, BigInt(0));
      if (debitKobo !== creditKobo) throw new Error("Escrow release journal does not balance.");

      await tx.walletTransaction.create({
        data: {
          walletId: vendorWallet.id,
          orderId: order.id,
          type: "release",
          amountKobo: obligation.payableKobo,
          reference: `RELEASE-${order.id}`,
          description: `Escrow released for ${order.orderNumber}`,
          ledger: { create: entries }
        }
      });
      await tx.escrowEvent.create({
        data: { escrowId: escrow.id, from: escrow.status, to: "released", note: "Customer confirmed delivery." }
      });
    }

    await updateOrderStatus({ tx, actorId: userId, orderId: order.id, status: "completed", note: "Customer confirmed delivery; escrow released." });
    await recordAudit({
      tx,
      actorId: userId,
      action: "order.completed",
      entity: "Order",
      entityId: order.id,
      metadata: {
        payableKobo: obligation.payableKobo.toString(),
        releasableKobo: obligation.releasableKobo.toString(),
        platformKobo: obligation.platformKobo.toString(),
        refundedKobo: order.refundedKobo.toString()
      }
    });
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalKobo: order.totalKobo,
      status: "completed" as const,
      payableKobo: obligation.payableKobo.toString(),
      duplicate: false
    };
  });

  // Post-commit: the customer is told the escrow moved and the order closed. An
  // idempotent replay must not send a second notification for the same release.
  if (!result.duplicate) {
    const facts = {
      id: result.orderId,
      orderNumber: result.orderNumber,
      totalKobo: result.totalKobo,
      customerId: userId
    };
    await notifyEscrowReleased(facts, BigInt(result.payableKobo));
    await notifyOrderStatus(facts, "completed");
  }

  return result;
}

export async function requestReturn(input: { userId: string; orderId: string; reason: string; detail?: string }) {
  const order = await prisma.order.findUnique({ where: { id: input.orderId }, include: { returnRequests: true } });
  if (!order) throw new ApiError(404, "order_not_found", "Order not found.");
  if (order.customerId !== input.userId) throw new ApiError(403, "forbidden", "This order belongs to another account.");
  if (!["delivered", "completed"].includes(order.status)) {
    throw new ApiError(409, "not_returnable", "Returns open after delivery.");
  }
  if (order.returnRequests.some((request) => ["REQUESTED", "APPROVED", "RECEIVED"].includes(request.status))) {
    throw new ApiError(409, "return_exists", "A return is already open for this order.");
  }
  const ageDays = (Date.now() - order.updatedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays > 14) throw new ApiError(409, "return_window_closed", "The 14-day return window has closed.");

  return prisma.$transaction(async (tx) => {
    const request = await tx.returnRequest.create({
      data: {
        orderId: order.id,
        userId: input.userId,
        vendorId: order.vendorId,
        reason: input.reason,
        detail: input.detail ?? null,
        refundKobo: order.totalKobo
      }
    });
    await recordAudit({
      tx,
      actorId: input.userId,
      action: "return.requested",
      entity: "ReturnRequest",
      entityId: request.id,
      metadata: { orderId: order.id, reason: input.reason }
    });
    return request;
  });
}
