import type { DeliveryStatus, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordSystemEvent } from "./event.service";

type Db = PrismaClient | Prisma.TransactionClient;

export async function createTrackingEvent(input: {
  tx?: Db;
  actorId?: string | null;
  deliveryId: string;
  status: DeliveryStatus;
  label: string;
  description: string;
  proofCode?: string | null;
}) {
  const db = input.tx ?? prisma;
  const event = await db.trackingEvent.create({
    data: {
      deliveryId: input.deliveryId,
      status: input.status,
      label: input.label,
      description: input.description,
      proofCode: input.proofCode ?? null
    }
  });
  await recordSystemEvent({
    tx: db,
    type: "tracking.event_created",
    actorId: input.actorId,
    entity: "TrackingEvent",
    entityId: event.id,
    payload: { deliveryId: input.deliveryId, status: input.status }
  });
  return event;
}

export async function getTracking(deliveryOrOrderId: string) {
  return prisma.delivery.findFirstOrThrow({
    where: { OR: [{ id: deliveryOrOrderId }, { orderId: deliveryOrOrderId }] },
    include: { order: true, courier: true, trackingEvents: { orderBy: { createdAt: "asc" } } }
  });
}
