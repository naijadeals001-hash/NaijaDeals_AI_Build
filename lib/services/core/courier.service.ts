import type { DeliveryStatus, OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { updateDeliveryStatus } from "./delivery.service";
import { updateOrderStatus } from "./order.service";

const orderStatusForDelivery: Partial<Record<DeliveryStatus, OrderStatus>> = {
  picked_up: "picked_up",
  in_transit: "in_transit",
  delivered: "delivered"
};

const orderSequence: OrderStatus[] = [
  "created",
  "payment_pending",
  "escrow_held",
  "vendor_notified",
  "accepted",
  "preparing",
  "ready_for_pickup",
  "courier_assigned",
  "picked_up",
  "in_transit",
  "delivered",
  "completed"
];

/**
 * Move the order forward to match a verified delivery event. A courier cannot
 * skip seller preparation, but a courier pickup does advance
 * ready_for_pickup -> courier_assigned -> picked_up in one transaction.
 */
export async function syncOrderForDelivery(input: {
  tx: Prisma.TransactionClient;
  actorId: string;
  orderId: string;
  deliveryStatus: DeliveryStatus;
  note?: string;
}) {
  const target = orderStatusForDelivery[input.deliveryStatus];
  if (!target) return;
  const order = await input.tx.order.findUnique({ where: { id: input.orderId } });
  if (!order) return;
  const currentIndex = orderSequence.indexOf(order.status);
  const targetIndex = orderSequence.indexOf(target);
  if (currentIndex === -1 || targetIndex === -1) return;
  if (currentIndex >= targetIndex) return;
  if (currentIndex < orderSequence.indexOf("ready_for_pickup")) {
    throw new ApiError(409, "seller_not_ready", "The seller has not marked this order ready for pickup.");
  }

  for (let index = currentIndex + 1; index <= targetIndex; index += 1) {
    const next = orderSequence[index];
    await updateOrderStatus({
      tx: input.tx,
      actorId: input.actorId,
      orderId: order.id,
      status: next,
      note: input.note || `Delivery event advanced the order to ${next}.`
    });
  }
}

export async function getCourierForUser(userId: string) {
  const courier = await prisma.courier.findUnique({ where: { userId } });
  if (!courier || !courier.active) throw new ApiError(403, "not_a_courier", "No active courier profile is linked to this account.");
  return courier;
}

export async function listCourierDeliveries(userId: string) {
  const courier = await getCourierForUser(userId);
  return prisma.delivery.findMany({
    where: { courierId: courier.id },
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          contactName: true,
          contactPhone: true,
          deliveryAddress: true,
          vendor: { select: { name: true, pickupAddress: true, pickupPhone: true } },
          items: { select: { productName: true, quantity: true } }
        }
      },
      trackingEvents: { orderBy: { createdAt: "desc" } }
    },
    orderBy: { createdAt: "desc" }
  });
}

export async function updateCourierDelivery(input: {
  userId: string;
  deliveryId: string;
  status: DeliveryStatus;
  note?: string;
  proofCode?: string;
}) {
  const courier = await getCourierForUser(input.userId);
  const delivery = await prisma.delivery.findUnique({ where: { id: input.deliveryId }, include: { order: true } });
  if (!delivery) throw new ApiError(404, "delivery_not_found", "Delivery not found.");
  if (delivery.courierId !== courier.id) throw new ApiError(403, "forbidden", "This delivery is assigned to another courier.");
  if (input.status === "delivered" && !input.proofCode) {
    throw new ApiError(400, "proof_required", "A delivery proof code is required to mark an order delivered.");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await updateDeliveryStatus({
      tx,
      actorId: input.userId,
      deliveryId: delivery.id,
      status: input.status,
      note: input.note,
      proofCode: input.proofCode
    });
    await syncOrderForDelivery({
      tx,
      actorId: input.userId,
      orderId: delivery.orderId,
      deliveryStatus: input.status,
      note: input.note
    });
    return updated;
  });
}
