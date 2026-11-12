import type { DeliveryStatus, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { recordAudit } from "./audit.service";
import { recordSystemEvent } from "./event.service";
import { assertDeliveryTransition } from "./state-machines";
import { createTrackingEvent } from "./tracking.service";

type Db = PrismaClient | Prisma.TransactionClient;

const statusLabel: Record<DeliveryStatus, string> = {
  pending_assignment: "Delivery pending assignment",
  assigned: "Courier assigned",
  pickup_started: "Courier heading to pickup",
  picked_up: "Package picked up",
  in_transit: "Package in transit",
  delivery_attempted: "Delivery attempted",
  delivered: "Delivered",
  failed: "Delivery failed",
  returned: "Returned",
  cancelled: "Delivery cancelled"
};

const terminalDeliveryStatuses: DeliveryStatus[] = ["delivered", "returned", "cancelled"];

const cancellableDeliveryStatuses: DeliveryStatus[] = [
  "pending_assignment",
  "assigned",
  "pickup_started",
  "picked_up",
  "in_transit",
  "delivery_attempted",
  "failed"
];

export async function createDelivery(input: {
  tx: Db;
  actorId: string;
  orderId: string;
  courierId?: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  feeKobo: bigint;
}) {
  const delivery = await input.tx.delivery.create({
    data: {
      orderId: input.orderId,
      courierId: input.courierId ?? null,
      status: input.courierId ? "assigned" : "pending_assignment",
      pickupAddress: input.pickupAddress,
      dropoffAddress: input.dropoffAddress,
      feeKobo: input.feeKobo
    }
  });
  await createTrackingEvent({
    tx: input.tx,
    actorId: input.actorId,
    deliveryId: delivery.id,
    status: delivery.status,
    label: statusLabel[delivery.status],
    description: input.courierId ? "Courier assignment created during checkout." : "Delivery created and awaiting courier assignment."
  });
  await recordSystemEvent({
    tx: input.tx,
    type: "delivery.created",
    actorId: input.actorId,
    entity: "Delivery",
    entityId: delivery.id,
    payload: { orderId: input.orderId, status: delivery.status }
  });
  await recordAudit({
    tx: input.tx,
    actorId: input.actorId,
    action: "delivery.created",
    entity: "Delivery",
    entityId: delivery.id,
    metadata: { orderId: input.orderId, status: delivery.status }
  });
  return delivery;
}

export async function updateDeliveryStatus(input: {
  tx?: Db;
  actorId?: string | null;
  deliveryId: string;
  status: DeliveryStatus;
  note?: string;
  proofCode?: string;
}) {
  const db = input.tx ?? prisma;
  const current = await db.delivery.findUniqueOrThrow({ where: { id: input.deliveryId } });
  assertDeliveryTransition(current.status, input.status);
  // Compare-and-set on the status we validated. Without it, a concurrent
  // cancellation could be overwritten by a stale read (for example a courier
  // marking a delivery delivered after the order was refunded).
  const claimed = await db.delivery.updateMany({
    where: { id: input.deliveryId, status: current.status },
    data: { status: input.status }
  });
  if (claimed.count !== 1) {
    throw new ApiError(
      409,
      "delivery_conflict",
      "This delivery changed while it was being updated. Reload it before retrying."
    );
  }
  const delivery = await db.delivery.findUniqueOrThrow({ where: { id: input.deliveryId } });
  await createTrackingEvent({
    tx: db,
    actorId: input.actorId,
    deliveryId: delivery.id,
    status: input.status,
    label: statusLabel[input.status],
    description: input.note ?? `Delivery status changed from ${current.status} to ${input.status}.`,
    proofCode: input.proofCode
  });
  await recordSystemEvent({
    tx: db,
    type: "delivery.status_changed",
    actorId: input.actorId,
    entity: "Delivery",
    entityId: delivery.id,
    payload: { from: current.status, to: input.status }
  });
  await recordAudit({
    tx: db,
    actorId: input.actorId,
    action: "delivery.status_changed",
    entity: "Delivery",
    entityId: delivery.id,
    metadata: { from: current.status, to: input.status }
  });
  return delivery;
}

export async function createDeliveryRequest(input: {
  actorId: string;
  orderId: string;
  pickupAddress: string;
  dropoffAddress: string;
  feeKobo?: bigint;
}) {
  return prisma.$transaction(async (tx) =>
    createDelivery({
      tx,
      actorId: input.actorId,
      orderId: input.orderId,
      pickupAddress: input.pickupAddress,
      dropoffAddress: input.dropoffAddress,
      feeKobo: input.feeKobo ?? BigInt(250000)
    })
  );
}

export type DeliveryCancellation = {
  deliveryId: string;
  from: DeliveryStatus | null;
  outcome: "cancelled" | "already_cancelled" | "closed";
};

/**
 * Cancel a delivery and release its courier assignment.
 *
 * The write is a conditional `UPDATE ... WHERE status IN (cancellable)`, so a
 * courier transition racing this call cannot be overwritten by a stale read:
 * whichever row lock is taken first decides, and a later cancellation still
 * wins over an assignment because every non-terminal state is cancellable.
 * Terminal deliveries keep their real history and are skipped.
 */
async function cancelOneDelivery(
  db: Db,
  input: { actorId?: string | null; deliveryId: string; reason: string }
): Promise<DeliveryCancellation> {
  // Lock the row and read the status actually being cancelled. A plain read
  // could describe a pre-assignment state while the conditional update below
  // cancels the newer, assigned row, making the tracking/audit "from" wrong.
  const locked = await db.$queryRaw<
    Array<{ id: string; status: DeliveryStatus; courierId: string | null; orderId: string }>
  >`
    SELECT id, status, "courierId", "orderId"
    FROM "Delivery"
    WHERE id = ${input.deliveryId}
    FOR UPDATE
  `;
  const current = locked[0];
  if (!current) return { deliveryId: input.deliveryId, from: null, outcome: "closed" };
  if (current.status === "cancelled") {
    return { deliveryId: current.id, from: null, outcome: "already_cancelled" };
  }
  if (terminalDeliveryStatuses.includes(current.status)) {
    return { deliveryId: current.id, from: current.status, outcome: "closed" };
  }

  const updated = await db.delivery.updateMany({
    where: { id: current.id, status: { in: cancellableDeliveryStatuses } },
    data: { status: "cancelled", courierId: null }
  });
  if (updated.count !== 1) {
    // The row changed after the lock read. A cancellation or a terminal
    // delivery is a complete outcome; anything else is a conflict the caller
    // must resolve rather than silently overwrite.
    const fresh = await db.delivery.findUnique({ where: { id: current.id }, select: { status: true } });
    if (fresh?.status === "cancelled") {
      return { deliveryId: current.id, from: null, outcome: "already_cancelled" };
    }
    if (!fresh || terminalDeliveryStatuses.includes(fresh.status)) {
      return { deliveryId: current.id, from: current.status, outcome: "closed" };
    }
    throw new ApiError(
      409,
      "delivery_conflict",
      "This delivery changed while it was being cancelled. Reload it before retrying."
    );
  }

  await createTrackingEvent({
    tx: db,
    actorId: input.actorId ?? null,
    deliveryId: current.id,
    status: "cancelled",
    label: statusLabel.cancelled,
    description: input.reason
  });
  await recordSystemEvent({
    tx: db,
    type: "delivery.cancelled",
    actorId: input.actorId ?? null,
    entity: "Delivery",
    entityId: current.id,
    payload: {
      orderId: current.orderId,
      from: current.status,
      to: "cancelled",
      previousCourierId: current.courierId
    }
  });
  await recordAudit({
    tx: db,
    actorId: input.actorId ?? null,
    action: "delivery.cancelled",
    entity: "Delivery",
    entityId: current.id,
    metadata: {
      orderId: current.orderId,
      before: { status: current.status, courierId: current.courierId },
      after: { status: "cancelled", courierId: null },
      reason: input.reason
    }
  });
  return { deliveryId: current.id, from: current.status, outcome: "cancelled" };
}

/**
 * Cancel every open delivery for an order. Called inside the full-refund
 * transaction so the courier queue and customer tracking cannot disagree with
 * the order/payment state once the refund commits.
 *
 * Idempotent: an already-cancelled delivery, or one that reached delivered or
 * returned before the refund, is reported and left unchanged.
 */
export async function cancelOrderDeliveries(input: {
  tx: Db;
  actorId?: string | null;
  orderId: string;
  reason: string;
}): Promise<DeliveryCancellation[]> {
  const deliveries = await input.tx.delivery.findMany({
    where: { orderId: input.orderId },
    select: { id: true, status: true },
    orderBy: { createdAt: "asc" }
  });
  const results: DeliveryCancellation[] = [];
  for (const delivery of deliveries) {
    if (terminalDeliveryStatuses.includes(delivery.status)) {
      results.push({ deliveryId: delivery.id, from: delivery.status, outcome: "closed" });
      continue;
    }
    results.push(
      await cancelOneDelivery(input.tx, {
        actorId: input.actorId,
        deliveryId: delivery.id,
        reason: input.reason
      })
    );
  }
  return results;
}
