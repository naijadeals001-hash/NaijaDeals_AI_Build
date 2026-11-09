import type { OrderStatus, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { recordAudit } from "./audit.service";
import { notifyVendorOwner } from "./notification.service";
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
    await notifyVendorOwner({
      tx: db,
      vendorId: order.vendorId,
      kind: "order_paid",
      title: "New paid order",
      body: `Order ${order.orderNumber} is ready to accept.`,
      href: "/seller"
    });
  }

  return order;
}

/**
 * Customer confirms receipt. Escrow is released to the seller net of commission.
 */
export async function completeOrder(userId: string, orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { escrowHolds: true, payments: true }
  });
  if (!order) throw new ApiError(404, "order_not_found", "Order not found.");
  if (order.customerId !== userId) throw new ApiError(403, "forbidden", "This order belongs to another account.");
  if (order.status !== "delivered") throw new ApiError(409, "not_delivered", "Only delivered orders can be completed.");

  return prisma.$transaction(async (tx) => {
    const escrow = order.escrowHolds[0];
    const completedPayment = order.payments.find((payment) => payment.status === "COMPLETED");
    const buyerWallet = await ensureWallet(tx, { userId: order.customerId, ownerType: "CUSTOMER" });
    const vendorWallet = await ensureWallet(tx, { vendorId: order.vendorId, ownerType: "VENDOR" });
    const payable = order.subtotalKobo - order.commissionKobo + order.deliveryFeeKobo;

    if (escrow) {
      const platformCut = escrow.amountKobo - payable;
      const platformWallet = await ensureWallet(tx, { ownerType: "SYSTEM" });
      // Each branch moves stored balances by exactly what its journal entries say
      // about that wallet. A stored/journal mismatch here is what previously left
      // the seller short by the commission and the platform overstating its cut.
      const entries = [
        { walletId: vendorWallet.id, direction: "DEBIT" as const, amountKobo: escrow.amountKobo, memo: "Escrow payable cleared" },
        { walletId: vendorWallet.id, direction: "CREDIT" as const, amountKobo: payable, memo: "Seller net proceeds credited" }
      ];

      if (completedPayment?.provider === "wallet") {
        const buyerRelease = await tx.wallet.updateMany({
          where: { id: buyerWallet.id, heldKobo: { gte: escrow.amountKobo } },
          data: { heldKobo: { decrement: escrow.amountKobo } }
        });
        if (buyerRelease.count !== 1) throw new ApiError(409, "escrow_conflict", "The buyer's escrow hold is no longer available to release.");
        // Seller: held -> zero for the escrow, payable becomes spendable.
        const sellerRelease = await tx.wallet.updateMany({
          where: { id: vendorWallet.id, heldKobo: { gte: escrow.amountKobo } },
          data: { heldKobo: { decrement: escrow.amountKobo }, availableKobo: { increment: payable } }
        });
        if (sellerRelease.count !== 1) throw new ApiError(409, "escrow_conflict", "The seller's escrow hold is no longer available to release.");
        // Platform: receives the commission, so both stored and journal credit it.
        if (platformCut > BigInt(0)) {
          await tx.wallet.update({ where: { id: platformWallet.id }, data: { availableKobo: { increment: platformCut } } });
          entries.push({ walletId: platformWallet.id, direction: "CREDIT" as const, amountKobo: platformCut, memo: "Commission retained by NaijaDeals" });
        }
      } else {
        // External payment: the platform already holds the full amount. Paying the
        // seller moves `payable` out of the platform wallet; the commission stays
        // behind, so the platform's stored balance only falls by `payable`.
        const platformDebit = await tx.wallet.updateMany({
          where: { id: platformWallet.id, availableKobo: { gte: payable } },
          data: { availableKobo: { decrement: payable } }
        });
        if (platformDebit.count !== 1) throw new ApiError(409, "escrow_conflict", "The platform's escrow balance is no longer available to release.");
        await tx.wallet.update({
          where: { id: vendorWallet.id },
          data: { heldKobo: { decrement: escrow.amountKobo }, availableKobo: { increment: payable } }
        });
        // Neutralise the platform's own commission leg: it debits the platform by
        // the same amount it credits, so the platform's journal matches its stored
        // balance change of -payable rather than jumping by the commission.
        if (platformCut > BigInt(0)) {
          entries.push({ walletId: platformWallet.id, direction: "DEBIT" as const, amountKobo: platformCut, memo: "Commission transfer within platform funds" });
          entries.push({ walletId: platformWallet.id, direction: "CREDIT" as const, amountKobo: platformCut, memo: "Commission retained by NaijaDeals" });
        }
      }

      await tx.walletTransaction.create({
        data: {
          walletId: vendorWallet.id,
          orderId: order.id,
          type: "release",
          amountKobo: payable,
          reference: `RELEASE-${order.id}`,
          description: `Escrow released for ${order.orderNumber}`,
          ledger: { create: entries }
        }
      });
      await tx.escrowHold.update({
        where: { id: escrow.id },
        data: { status: "released", events: { create: { from: escrow.status, to: "released", note: "Customer confirmed delivery." } } }
      });
    }

    await updateOrderStatus({ tx, actorId: userId, orderId: order.id, status: "completed", note: "Customer confirmed delivery; escrow released." });
    await recordAudit({
      tx,
      actorId: userId,
      action: "order.completed",
      entity: "Order",
      entityId: order.id,
      metadata: { payableKobo: payable.toString() }
    });
    return { orderId: order.id, status: "completed", payableKobo: payable.toString() };
  });
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
