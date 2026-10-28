import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, jsonError, requireUser } from "@/lib/auth/guard";
import { isAdmin } from "@/lib/auth/session";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const delivery = await prisma.delivery.findFirst({
      where: { OR: [{ id: params.id }, { orderId: params.id }, { trackingNumber: params.id }] },
      include: {
        trackingEvents: { orderBy: { createdAt: "asc" } },
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            deliveryAddress: true,
            customerId: true,
            vendor: { select: { ownerId: true, name: true, pickupAddress: true } }
          }
        },
        courier: { select: { name: true, phone: true } }
      }
    });
    if (!delivery) throw new ApiError(404, "delivery_not_found", "Tracking record not found.");

    const courier = await prisma.courier.findUnique({ where: { userId: user.id } });
    const allowed =
      delivery.order.customerId === user.id ||
      delivery.order.vendor.ownerId === user.id ||
      courier?.id === delivery.courierId ||
      isAdmin(user);
    if (!allowed) throw new ApiError(403, "forbidden", "You do not have access to this delivery.");

    return NextResponse.json(
      jsonSafe({
        id: delivery.id,
        status: delivery.status,
        provider: delivery.provider,
        trackingNumber: delivery.trackingNumber,
        pickupAddress: delivery.pickupAddress,
        dropoffAddress: delivery.dropoffAddress,
        courier: delivery.courier,
        orderNumber: delivery.order.orderNumber,
        orderStatus: delivery.order.status,
        events: delivery.trackingEvents
      })
    );
  } catch (error) {
    return jsonError(error);
  }
}
