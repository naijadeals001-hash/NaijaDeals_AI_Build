import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { ensureWallet, refundPayment } from "@/lib/payments/service";
import { recordAudit } from "./audit.service";
import { recordSystemEvent } from "./event.service";
import { updateOrderStatus } from "./order.service";

export async function openDispute(input: { actorId: string; orderId: string; reason: string }) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: input.orderId }, include: { escrowHolds: true } });
    const dispute = await tx.dispute.create({
      data: {
        orderId: order.id,
        customerId: order.customerId,
        vendorId: order.vendorId,
        escrowId: order.escrowHolds[0]?.id,
        reason: input.reason
      }
    });
    await tx.order.update({ where: { id: order.id }, data: { status: "disputed" } });
    // Only escrow that still holds funds can be frozen. A released/refunded hold is
    // historical: disputing it must not make the money releasable a second time.
    const hold = order.escrowHolds[0];
    if (hold && ["pending", "held"].includes(hold.status)) {
      await tx.escrowHold.update({ where: { id: hold.id }, data: { status: "disputed" } });
    }
    await recordSystemEvent({ tx, type: "dispute.opened", actorId: input.actorId, entity: "Dispute", entityId: dispute.id, payload: { orderId: order.id } });
    await recordAudit({
      tx,
      actorId: input.actorId,
      action: "dispute.opened",
      entity: "Dispute",
      entityId: dispute.id,
      metadata: {
        orderId: order.id,
        before: { orderStatus: order.status, escrowStatus: order.escrowHolds[0]?.status ?? null },
        after: { orderStatus: "disputed", escrowStatus: order.escrowHolds[0] ? "disputed" : null }
      }
    });
    return dispute;
  });
}

const CLOSED_DISPUTE_STATUSES = ["resolved_refund", "resolved_release", "rejected"];

/**
 * Resolve an open dispute by refunding the buyer or releasing escrow to the seller.
 *
 * Dismissal is intentionally not exposed: the order status machine cannot restore
 * an arbitrary pre-dispute status, so a "reject" path would leave the order stuck.
 */
export async function resolveDispute(input: {
  adminId: string;
  disputeId: string;
  decision: "refund" | "release";
  note?: string;
}) {
  const dispute = await prisma.dispute.findUnique({
    where: { id: input.disputeId },
    include: {
      order: { include: { escrowHolds: true, payments: true } },
      escrow: true
    }
  });
  if (!dispute) throw new ApiError(404, "dispute_not_found", "Dispute not found.");
  if (CLOSED_DISPUTE_STATUSES.includes(dispute.status)) {
    throw new ApiError(409, "dispute_closed", "This dispute is already closed.");
  }

  const order = dispute.order;
  const note = input.note?.trim() || dispute.reason;

  if (input.decision === "refund") {
    if (order.paymentStatus !== "paid") {
      throw new ApiError(409, "not_paid", "Only paid orders can be refunded to the buyer.");
    }
    const result = await refundPayment({
      orderId: order.id,
      actorId: input.adminId,
      reason: `Dispute resolution: ${note}`,
      restock: false
    });
    const updated = await prisma.dispute.update({ where: { id: dispute.id }, data: { status: "resolved_refund" } });
    await recordAudit({
      actorId: input.adminId,
      action: "dispute.resolved",
      entity: "Dispute",
      entityId: dispute.id,
      metadata: {
        decision: "refund",
        before: { disputeStatus: dispute.status, orderStatus: order.status, paymentStatus: order.paymentStatus },
        after: { disputeStatus: updated.status, orderStatus: "refunded", paymentStatus: "refunded" },
        refundedKobo: result.refundedKobo,
        note
      }
    });
    return { disputeId: dispute.id, status: updated.status, orderId: order.id, refundedKobo: result.refundedKobo };
  }

  const escrow = dispute.escrow ?? order.escrowHolds[0];
  if (!escrow) throw new ApiError(409, "no_escrow", "This order has no escrow hold to release.");
  if (!["held", "disputed"].includes(escrow.status)) {
    throw new ApiError(409, "escrow_not_releasable", `Escrow is ${escrow.status} and cannot be released.`);
  }
  const completed = order.payments.find((payment) => payment.status === "COMPLETED");
  if (!completed) throw new ApiError(409, "no_payment", "No completed payment was found for this order.");
  const payable = order.subtotalKobo - order.commissionKobo + order.deliveryFeeKobo;

  return prisma.$transaction(async (tx) => {
    const buyerWallet = await ensureWallet(tx, { userId: order.customerId, ownerType: "CUSTOMER" });
    const vendorWallet = await ensureWallet(tx, { vendorId: order.vendorId, ownerType: "VENDOR" });
    const platform = await ensureWallet(tx, { ownerType: "SYSTEM" });

    if (completed.provider === "wallet") {
      await tx.wallet.update({ where: { id: buyerWallet.id }, data: { heldKobo: { decrement: escrow.amountKobo } } });
      await tx.wallet.update({
        where: { id: vendorWallet.id },
        data: { heldKobo: { decrement: escrow.amountKobo }, availableKobo: { increment: payable } }
      });
      const platformCut = escrow.amountKobo - payable;
      if (platformCut > BigInt(0)) {
        await tx.wallet.update({ where: { id: platform.id }, data: { availableKobo: { increment: platformCut } } });
      }
    } else {
      await tx.wallet.update({ where: { id: platform.id }, data: { availableKobo: { decrement: payable } } });
      await tx.wallet.update({
        where: { id: vendorWallet.id },
        data: { heldKobo: { decrement: escrow.amountKobo }, availableKobo: { increment: payable } }
      });
    }

    await tx.walletTransaction.create({
      data: {
        walletId: vendorWallet.id,
        orderId: order.id,
        type: "release",
        amountKobo: payable,
        reference: `DISPUTE-RELEASE-${dispute.id}`,
        description: `Dispute release for ${order.orderNumber}`,
        ledger: {
          create: [
            { walletId: vendorWallet.id, direction: "DEBIT", amountKobo: escrow.amountKobo, memo: "Escrow payable cleared by dispute release" },
            { walletId: vendorWallet.id, direction: "CREDIT", amountKobo: payable, memo: "Seller net proceeds credited" },
            { walletId: vendorWallet.id, direction: "CREDIT", amountKobo: escrow.amountKobo - payable, memo: "Commission retained by NaijaDeals" }
          ]
        }
      }
    });
    await tx.escrowHold.update({
      where: { id: escrow.id },
      data: { status: "released", events: { create: { from: escrow.status, to: "released", note: `Dispute released: ${note}` } } }
    });
    const updated = await tx.dispute.update({ where: { id: dispute.id }, data: { status: "resolved_release" } });
    await updateOrderStatus({
      tx,
      actorId: input.adminId,
      orderId: order.id,
      status: "completed",
      note: `Dispute released to seller: ${note}`
    });
    await recordAudit({
      tx,
      actorId: input.adminId,
      action: "dispute.resolved",
      entity: "Dispute",
      entityId: dispute.id,
      metadata: {
        decision: "release",
        before: { disputeStatus: dispute.status, orderStatus: order.status, escrowStatus: escrow.status },
        after: { disputeStatus: updated.status, orderStatus: "completed", escrowStatus: "released" },
        payableKobo: payable.toString(),
        note
      }
    });
    return { disputeId: dispute.id, status: updated.status, orderId: order.id, payableKobo: payable.toString() };
  });
}
