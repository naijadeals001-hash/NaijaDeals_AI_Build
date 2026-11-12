import type { DisputeStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { refundPayment } from "@/lib/payments/service";
import { recordAudit } from "./audit.service";
import { recordSystemEvent } from "./event.service";
import {
  loadOrderReleaseState,
  postEscrowRelease,
  readRecordedRelease,
  updateOrderStatus
} from "./order.service";

const CLOSED_DISPUTE_STATUSES: DisputeStatus[] = ["resolved_refund", "resolved_release", "rejected"];

/** Escrow states that still hold buyer money and can be frozen by a dispute. */
const FREEZABLE_ESCROW_STATUSES = ["pending", "held", "release_eligible", "reserved"];

/** Escrow states whose money has already left and must never be disputed again. */
const TERMINAL_ESCROW_STATUSES = ["released", "refunded"];

/**
 * Disputed release is fail-closed on the server.
 *
 * The old implementation released `escrow.amountKobo` and ignored refunds, so it
 * could pay a seller money the buyer had already received back. The corrected
 * path shares `postEscrowRelease` with customer completion and is covered by the
 * isolated acceptance suite, but enabling it in a live environment is an
 * operator decision: set `DISPUTE_RELEASE_ENABLED=true` deliberately. Any unset
 * or misspelled value leaves the release decision unavailable while the refund
 * decision keeps working.
 */
export function disputeReleaseEnabled() {
  return process.env.DISPUTE_RELEASE_ENABLED === "true";
}

async function lockOrderRow(tx: Prisma.TransactionClient, orderId: string) {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE
  `;
  if (locked.length === 0) throw new ApiError(404, "order_not_found", "Order not found.");
}

export async function openDispute(input: { actorId: string; orderId: string; reason: string }) {
  return prisma.$transaction(async (tx) => {
    await lockOrderRow(tx, input.orderId);
    const order = await tx.order.findUniqueOrThrow({ where: { id: input.orderId }, include: { escrowHolds: true } });
    // A terminal order must not be dragged back to `disputed`: completion and
    // refund are already final, and reopening one would corrupt its history.
    if (["completed", "refunded", "cancelled"].includes(order.status)) {
      throw new ApiError(409, "order_closed", `A ${order.status.replace(/_/g, " ")} order cannot be disputed.`);
    }
    const hold = order.escrowHolds[0];
    if (hold && TERMINAL_ESCROW_STATUSES.includes(hold.status)) {
      throw new ApiError(409, "escrow_not_disputable", "This escrow has already been settled and cannot be disputed.");
    }
    const existing = await tx.dispute.findFirst({
      where: { orderId: order.id, status: { notIn: CLOSED_DISPUTE_STATUSES } },
      select: { id: true }
    });
    if (existing) {
      throw new ApiError(409, "dispute_exists", "This order already has an open dispute.");
    }

    const dispute = await tx.dispute.create({
      data: {
        orderId: order.id,
        customerId: order.customerId,
        vendorId: order.vendorId,
        escrowId: hold?.id,
        reason: input.reason
      }
    });
    await tx.order.update({ where: { id: order.id }, data: { status: "disputed" } });
    // Only escrow that still holds funds can be frozen. A released/refunded hold is
    // historical: disputing it must not make the money releasable a second time.
    const frozen = Boolean(hold && FREEZABLE_ESCROW_STATUSES.includes(hold.status));
    if (hold && frozen) {
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
        before: { orderStatus: order.status, escrowStatus: hold?.status ?? null },
        after: { orderStatus: "disputed", escrowStatus: frozen ? "disputed" : hold?.status ?? null }
      }
    });
    return dispute;
  });
}

/**
 * Resolve an open dispute by refunding the buyer or releasing escrow to the seller.
 *
 * Both money paths are idempotent at the order/escrow level. The release path
 * re-reads everything under the order row lock and posts through the same
 * refund-aware helper as `completeOrder`, so a partially refunded order releases
 * only what is still owed and a duplicate or racing resolution moves nothing
 * twice.
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
    select: { id: true, orderId: true, status: true }
  });
  if (!dispute) throw new ApiError(404, "dispute_not_found", "Dispute not found.");

  if (input.decision === "refund") {
    if (CLOSED_DISPUTE_STATUSES.includes(dispute.status)) {
      throw new ApiError(409, "dispute_closed", "This dispute is already closed.");
    }
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: dispute.orderId },
      include: { escrowHolds: true, payments: true }
    });
    const note = input.note?.trim() || "Dispute resolution refund";
    if (!["paid", "partially_refunded", "refund_pending"].includes(order.paymentStatus)) {
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

  if (!disputeReleaseEnabled()) {
    throw new ApiError(
      409,
      "dispute_release_disabled",
      "Releasing escrow from a dispute is disabled on this server until its acceptance evidence is renewed."
    );
  }

  return prisma.$transaction(async (tx) => {
    // Serialise with completeOrder and refundPayment. The dispute row itself is
    // re-read after the lock, so a concurrent resolution sees the winner's state.
    await lockOrderRow(tx, dispute.orderId);
    const current = await tx.dispute.findUnique({
      where: { id: dispute.id },
      include: { order: true, escrow: true }
    });
    if (!current) throw new ApiError(404, "dispute_not_found", "Dispute not found.");

    if (CLOSED_DISPUTE_STATUSES.includes(current.status)) {
      if (current.status === "resolved_release") {
        const recorded = await readRecordedRelease(tx, current.orderId, `DISPUTE-RELEASE-${current.id}`);
        if (recorded) {
          return {
            disputeId: current.id,
            status: current.status,
            orderId: current.orderId,
            duplicate: true,
            totalReleasedKobo: recorded.totalReleasedKobo.toString(),
            remainingEscrowObligationKobo: "0",
            vendorProceedsKobo: recorded.vendorProceedsKobo.toString(),
            platformShareKobo: recorded.platformShareKobo.toString(),
            otherAllocatedKobo: "0",
            previouslyReleasedKobo: recorded.previouslyReleasedKobo.toString()
          };
        }
      }
      throw new ApiError(409, "dispute_closed", "This dispute is already closed.");
    }

    const note = input.note?.trim() || current.reason;
    const releaseState = await loadOrderReleaseState(tx, current.orderId);
    // An unconfirmed external refund has moved no money but its reservation
    // already caps the order. Releasing during that window would strand the
    // reservation, so the release waits for the refund to settle.
    if (releaseState.pendingRefundCount > 0) {
      throw new ApiError(409, "refund_pending", "A refund on this order is still awaiting provider confirmation. Retry after it settles.");
    }
    const escrow = releaseState.escrow ?? current.escrow;
    if (!escrow) throw new ApiError(409, "no_escrow", "This order has no escrow hold to release.");
    if (escrow.status !== "disputed") {
      throw new ApiError(409, "escrow_not_releasable", `Escrow is ${escrow.status} and cannot be released by a dispute.`);
    }
    const completedPayment = await tx.payment.findFirst({
      where: { orderId: current.orderId, status: "COMPLETED" },
      select: { id: true }
    });
    if (!completedPayment) throw new ApiError(409, "no_payment", "No completed payment was found for this order.");

    const breakdown = await postEscrowRelease(tx, {
      order: releaseState.order,
      escrow,
      completedRefundKobo: releaseState.completedRefundKobo,
      previouslyReleasedKobo: releaseState.previouslyReleasedKobo,
      previouslyReleasedPayableKobo: releaseState.previouslyReleasedPayableKobo,
      frozenPayableKobo: releaseState.frozenPayableKobo,
      orderTotalKobo: releaseState.order.totalKobo,
      allowedStatuses: ["disputed"],
      reference: `DISPUTE-RELEASE-${current.id}`,
      description: `Dispute release for ${releaseState.order.orderNumber}`,
      note: `Dispute released: ${note}`,
      actorId: input.adminId
    });

    const updated = await tx.dispute.update({ where: { id: current.id }, data: { status: "resolved_release" } });
    await updateOrderStatus({
      tx,
      actorId: input.adminId,
      orderId: current.orderId,
      status: "completed",
      note: `Dispute released to seller: ${note}`
    });
    await recordAudit({
      tx,
      actorId: input.adminId,
      action: "dispute.resolved",
      entity: "Dispute",
      entityId: current.id,
      metadata: {
        decision: "release",
        before: {
          disputeStatus: current.status,
          orderStatus: releaseState.order.status,
          escrowStatus: escrow.status
        },
        after: { disputeStatus: updated.status, orderStatus: "completed", escrowStatus: "released" },
        completedRefundKobo: releaseState.completedRefundKobo.toString(),
        totalReleasedKobo: breakdown.totalReleasedKobo.toString(),
        remainingEscrowObligationKobo: breakdown.remainingEscrowObligationKobo.toString(),
        vendorProceedsKobo: breakdown.vendorProceedsKobo.toString(),
        platformShareKobo: breakdown.platformShareKobo.toString(),
        otherAllocatedKobo: "0",
        note
      }
    });

    return {
      disputeId: current.id,
      status: updated.status,
      orderId: current.orderId,
      duplicate: false,
      totalReleasedKobo: breakdown.totalReleasedKobo.toString(),
      remainingEscrowObligationKobo: breakdown.remainingEscrowObligationKobo.toString(),
      vendorProceedsKobo: breakdown.vendorProceedsKobo.toString(),
      platformShareKobo: breakdown.platformShareKobo.toString(),
      otherAllocatedKobo: "0",
      previouslyReleasedKobo: breakdown.previouslyReleasedKobo.toString()
    };
  });
}
