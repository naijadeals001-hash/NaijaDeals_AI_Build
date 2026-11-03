import { NextResponse } from "next/server";
import { getFoodOrder } from "@/lib/services/core/eats-order.service";
import { prisma } from "@/lib/prisma";
import { jsonError, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const order = await getFoodOrder(params.id);
    if (!order) return NextResponse.json({ error: "Food order not found.", code: "not_found" }, { status: 404 });
    const restaurant = await prisma.restaurant.findUnique({ where: { id: order.restaurantId }, select: { ownerId: true } }).catch(() => null);
    const isOwner = restaurant?.ownerId === user.id;
    const isCourier = order.courierId ? (await prisma.courier.findFirst({ where: { id: order.courierId, userId: user.id } })) !== null : false;
    if (order.customerId !== user.id && !isOwner && !isCourier) {
      return NextResponse.json({ error: "This order belongs to another account.", code: "forbidden" }, { status: 403 });
    }
    return NextResponse.json(jsonSafe(order));
  } catch (error) {
    return jsonError(error);
  }
}
