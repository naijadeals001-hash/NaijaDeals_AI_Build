import { NextResponse } from "next/server";
import { ApiError, jsonError, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * The order's pickup and delivery PINs, visible only to the customer who placed
 * it. The pickup PIN is shown so the customer can pass it to the rider at the
 * door if needed; the delivery PIN proves the handoff happened.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const order = await prisma.foodOrder.findUnique({ where: { id: params.id }, select: { customerId: true, orderNumber: true } });
    if (!order) throw new ApiError(404, "order_not_found", "Food order not found.");
    if (order.customerId !== user.id) throw new ApiError(403, "forbidden", "This is not your order.");
    const dispatch = await prisma.foodDispatch.findUnique({ where: { orderId: params.id }, select: { pickupPin: true, deliveryPin: true, status: true, assignedType: true, assignedId: true } });
    return NextResponse.json(jsonSafe({ orderNumber: order.orderNumber, ...(dispatch ?? {}) }));
  } catch (error) {
    return jsonError(error);
  }
}
