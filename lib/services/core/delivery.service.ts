import type { DeliveryStatus, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
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
  returned: "Returned"
};

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
  const delivery = await db.delivery.update({ where: { id: input.deliveryId }, data: { status: input.status } });
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
