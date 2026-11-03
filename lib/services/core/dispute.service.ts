import { prisma } from "@/lib/prisma";
import { recordAudit } from "./audit.service";
import { recordSystemEvent } from "./event.service";

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
    if (order.escrowHolds[0]) await tx.escrowHold.update({ where: { id: order.escrowHolds[0].id }, data: { status: "disputed" } });
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
