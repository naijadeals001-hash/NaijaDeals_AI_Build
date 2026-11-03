import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getFoodOrder, updateFoodOrderStatus } from "@/lib/services/core/eats-order.service";
import { prisma } from "@/lib/prisma";
import { ApiError, assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

const ALLOWED = ["kitchen_accepted", "preparing", "ready_for_pickup", "picked_up", "delivered", "cancelled"];

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const status = String(body.status ?? "");
    if (!ALLOWED.includes(status)) throw new ApiError(400, "validation_error", "Unsupported food-order status.");

    const order = await getFoodOrder(params.id);
    if (!order) return NextResponse.json({ error: "Food order not found.", code: "not_found" }, { status: 404 });

    let role: "restaurant" | "courier" | "customer" | "admin" = "customer";
    const owners = await prisma.$queryRaw<Array<{ ownerId: string }>>`
      SELECT "ownerId" FROM "Restaurant" WHERE id = ${order.restaurantId} LIMIT 1`;
    const couriers = order.courierId
      ? await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Courier" WHERE id = ${order.courierId} AND "userId" = ${user.id} LIMIT 1`
      : [];
    if (owners[0]?.ownerId === user.id) role = "restaurant";
    else if (couriers[0]) role = "courier";
    else if (order.customerId !== user.id) throw new ApiError(403, "forbidden", "You cannot update this order.");

    const updated = await updateFoodOrderStatus({
      actor: { id: user.id, role },
      orderId: order.id,
      status: status as Parameters<typeof updateFoodOrderStatus>[0]["status"],
      note: typeof body.note === "string" ? body.note : undefined
    });
    return NextResponse.json(jsonSafe(updated));
  } catch (error) {
    return jsonError(error);
  }
}
