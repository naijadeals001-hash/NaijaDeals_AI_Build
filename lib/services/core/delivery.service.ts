import type { DeliveryStatus, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { recordAudit } from "./audit.service";
import { recordSystemEvent } from "./event.service";
import { assertDeliveryTransition } from "./state-machines";
import { createTrackingEvent } from "./tracking.service";
import {
  classifyDeliveryCustody,
  COLLECTED_DELIVERY_STATUSES,
  lockOrderRow,
  PRE_COLLECTION_DELIVERY_STATUSES,
  type DeliveryCustodyClass,
  type DeliveryCustodyDecision
} from "./order.service";

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

/**
 * Only parcels that never left the seller can be cancelled.
 *
 * A collected parcel is physical custody, not a queue entry. Cancelling its
 * delivery row used to null the courier and overwrite `picked_up`/`in_transit`,
 * which erased the only operational trace that goods were still in the field.
 * Collected parcels are retained and audited instead; their recovery is a
 * separate physical return, not an administrative status edit.
 *
 * The status list is read inside the cancellation function rather than copied
 * at module initialisation. `order.service` imports `payments/service`, which
 * imports this module, so a top-level read of an `order.service` binding throws
 * a temporal-dead-zone error whenever an order API is the first entry point.
 */

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

/**
 * Resolve a delivery's order without locking the delivery first.
 *
 * The order is the serialisation point (Order -> Delivery everywhere), so the
 * order id is read as a routing hint, the order row is locked, and only then is
 * the delivery re-read under its own lock.
 */
async function orderIdForDelivery(db: Db, deliveryId: string): Promise<string> {
  const hint = await db.delivery.findUnique({ where: { id: deliveryId }, select: { orderId: true } });
  if (!hint) throw new ApiError(404, "delivery_not_found", "Delivery not found.");
  return hint.orderId;
}

type LockedDelivery = {
  id: string;
  status: DeliveryStatus;
  courierId: string | null;
  orderId: string;
};

async function lockDeliveryRow(db: Db, deliveryId: string): Promise<LockedDelivery> {
  const locked = await db.$queryRaw<LockedDelivery[]>`
    SELECT id, status, "courierId", "orderId"
    FROM "Delivery"
    WHERE id = ${deliveryId}
    FOR UPDATE
  `;
  if (!locked[0]) throw new ApiError(404, "delivery_not_found", "Delivery not found.");
  return locked[0];
}

/** Statuses a refunded order may still record, because they describe custody. */
const CUSTODY_RECOVERY_STATUSES: readonly DeliveryStatus[] = ["returned", "failed"];

export async function updateDeliveryStatus(input: {
  tx?: Db;
  actorId?: string | null;
  deliveryId: string;
  status: DeliveryStatus;
  note?: string;
  proofCode?: string;
}) {
  if (input.tx) return updateDeliveryStatusTx(input.tx, input);
  // Tracking, order and audit rows must commit or roll back together. A caller
  // without a transaction gets one here instead of four independent writes.
  return prisma.$transaction((tx) => updateDeliveryStatusTx(tx, input));
}

async function updateDeliveryStatusTx(
  db: Db,
  input: {
    actorId?: string | null;
    deliveryId: string;
    status: DeliveryStatus;
    note?: string;
    proofCode?: string;
  }
) {
  const orderId = await orderIdForDelivery(db, input.deliveryId);
  await lockOrderRow(db, orderId);
  const current = await lockDeliveryRow(db, input.deliveryId);

  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
  if (
    ["cancelled", "refunded"].includes(order.status) &&
    !CUSTODY_RECOVERY_STATUSES.includes(input.status)
  ) {
    throw new ApiError(
      409,
      order.status === "refunded" ? "order_refunded" : "order_closed",
      order.status === "refunded"
        ? "This order has been refunded, so the delivery cannot advance. Collected parcels stay visible under the return/recovery path."
        : "This order is cancelled and its delivery cannot advance."
    );
  }

  assertDeliveryTransition(current.status, input.status);
  // Compare-and-set on the status read under the lock. The order lock already
  // serialises refunds, assignment and cancellation; the CAS is the second
  // guard for a writer that skipped the lock.
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
  const hint = await db.delivery.findUnique({ where: { id: input.deliveryId }, select: { orderId: true } });
  if (!hint) return { deliveryId: input.deliveryId, from: null, outcome: "closed" };
  // Order before delivery: the same order the refund/cancellation path locked.
  await lockOrderRow(db, hint.orderId);
  // Lock the row and read the status actually being cancelled. A plain read
  // could describe a pre-assignment state while the conditional update below
  // cancels the newer, assigned row, making the tracking/audit "from" wrong.
  const current = await lockDeliveryRow(db, input.deliveryId);
  if (current.status === "cancelled") {
    return { deliveryId: current.id, from: null, outcome: "already_cancelled" };
  }
  if (terminalDeliveryStatuses.includes(current.status)) {
    return { deliveryId: current.id, from: current.status, outcome: "closed" };
  }
  if (COLLECTED_DELIVERY_STATUSES.includes(current.status)) {
    // Never erase physical custody through the cancellation path.
    return { deliveryId: current.id, from: current.status, outcome: "closed" };
  }

  const updated = await db.delivery.updateMany({
    where: { id: current.id, status: { in: [...PRE_COLLECTION_DELIVERY_STATUSES] } },
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
 * Cancel every uncollected delivery for an order. Used by order cancellation,
 * where the goods never left the seller. Collected parcels are deliberately
 * skipped and left for `settleRefundDeliveryCustody`.
 *
 * Idempotent: an already-cancelled delivery, a collected one, or one that
 * reached delivered or returned is reported and left unchanged.
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

export type RefundCustodyOutcome = {
  deliveryId: string;
  status: DeliveryStatus;
  courierId: string | null;
  decision: "cancelled" | "already_cancelled" | "retained_in_custody" | "kept_delivered" | "kept_returned" | "kept_closed";
};

export type RefundCustodyResult = DeliveryCustodyDecision & {
  outcomes: RefundCustodyOutcome[];
};

/**
 * Apply a full refund to the order's delivery rows without destroying custody.
 *
 * Rules:
 *  - uncollected (pending_assignment/assigned/pickup_started): cancel and
 *    release the courier, because the goods are still with the seller;
 *  - collected (picked_up/in_transit/delivery_attempted/failed): keep the row,
 *    status and courier assignment, and append a tracking event plus
 *    system/audit records that say the refund settled while the parcel was in
 *    custody. Operations can still see and recover the parcel;
 *  - delivered/returned: keep the real history; no delivery transition is
 *    invented by a refund;
 *  - already cancelled: leave it.
 *
 * The returned `restockable` decision is computed from the pre-refund custody
 * and is the only authority for restoring stock on a full refund. The caller
 * holds the order row lock, so a concurrent pickup either committed before
 * this read (and is visible as custody) or waits until the refund commits.
 */
export async function settleRefundDeliveryCustody(input: {
  tx: Db;
  actorId?: string | null;
  orderId: string;
  reason: string;
  refundId?: string;
}): Promise<RefundCustodyResult> {
  await lockOrderRow(input.tx, input.orderId);
  const rows = await input.tx.delivery.findMany({
    where: { orderId: input.orderId },
    select: { id: true, status: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });
  const decision = classifyDeliveryCustody(rows.map((row) => row.status));
  const outcomes: RefundCustodyOutcome[] = [];
  const auditAction = "delivery.custody_retained_on_refund";

  for (const row of rows) {
    const current = await lockDeliveryRow(input.tx, row.id);
    if (current.status === "cancelled") {
      outcomes.push({ deliveryId: current.id, status: current.status, courierId: current.courierId, decision: "already_cancelled" });
      continue;
    }
    if (PRE_COLLECTION_DELIVERY_STATUSES.includes(current.status)) {
      const cancelled = await cancelOneDelivery(input.tx, {
        actorId: input.actorId,
        deliveryId: current.id,
        reason: `${input.reason} (uncollected parcel cancelled by refund)`
      });
      outcomes.push({
        deliveryId: current.id,
        status: "cancelled",
        courierId: null,
        decision: cancelled.outcome === "already_cancelled" ? "already_cancelled" : "cancelled"
      });
      continue;
    }
    if (COLLECTED_DELIVERY_STATUSES.includes(current.status)) {
      // Custody history: a same-status tracking event with an explicit refund
      // note keeps the parcel in the operational timeline without pretending
      // that a delivery transition happened.
      await createTrackingEvent({
        tx: input.tx,
        actorId: input.actorId ?? null,
        deliveryId: current.id,
        status: current.status,
        label: `${statusLabel[current.status]} (refunded in custody)`,
        description: `Refund settled while the parcel was already collected (${current.status}). The delivery and courier assignment are retained; a physical return or recovery is required. ${input.reason}`
      });
      await recordSystemEvent({
        tx: input.tx,
        type: "delivery.custody_retained_on_refund",
        actorId: input.actorId ?? null,
        entity: "Delivery",
        entityId: current.id,
        payload: {
          orderId: input.orderId,
          refundId: input.refundId ?? null,
          status: current.status,
          courierId: current.courierId,
          reason: input.reason
        }
      });
      await recordAudit({
        tx: input.tx,
        actorId: input.actorId ?? null,
        action: auditAction,
        entity: "Delivery",
        entityId: current.id,
        metadata: {
          orderId: input.orderId,
          refundId: input.refundId ?? null,
          before: { status: current.status, courierId: current.courierId },
          after: { status: current.status, courierId: current.courierId },
          custody: "in_custody",
          reason: input.reason
        }
      });
      outcomes.push({
        deliveryId: current.id,
        status: current.status,
        courierId: current.courierId,
        decision: "retained_in_custody"
      });
      continue;
    }
    // delivered / returned: keep the physical outcome; record that the refund
    // did not alter it so an operator can reconstruct the timeline.
    await recordSystemEvent({
      tx: input.tx,
      type: "delivery.custody_unchanged_on_refund",
      actorId: input.actorId ?? null,
      entity: "Delivery",
      entityId: current.id,
      payload: {
        orderId: input.orderId,
        refundId: input.refundId ?? null,
        status: current.status,
        courierId: current.courierId,
        reason: input.reason
      }
    });
    await recordAudit({
      tx: input.tx,
      actorId: input.actorId ?? null,
      action: "delivery.custody_unchanged_on_refund",
      entity: "Delivery",
      entityId: current.id,
      metadata: {
        orderId: input.orderId,
        refundId: input.refundId ?? null,
        status: current.status,
        courierId: current.courierId,
        reason: input.reason
      }
    });
    outcomes.push({
      deliveryId: current.id,
      status: current.status,
      courierId: current.courierId,
      decision: current.status === "delivered" ? "kept_delivered" : "kept_returned"
    });
  }

  return { ...decision, outcomes };
}
