import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";
import { prisma } from "@/lib/prisma";
import { dispatchForOrder, openDispatch } from "@/lib/services/eats/dispatch";

export const dynamic = "force-dynamic";

/** Kitchen triggers dispatch once food is ready (also runs automatically). */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const orderId = String(body.orderId ?? "");
    const order = await prisma.foodOrder.findUnique({ where: { id: orderId }, select: { restaurantId: true } });
    if (!order) throw new ApiError(404, "order_not_found", "Food order not found.");
    const owned = await prisma.restaurant.findFirst({ where: { id: order.restaurantId, ownerId: user.id }, select: { id: true } });
    if (!owned) throw new ApiError(403, "forbidden", "This order belongs to another kitchen.");
    return NextResponse.json(jsonSafe(await openDispatch(orderId)), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET(request: Request) {
  try {
    await requireUser();
    const orderId = new URL(request.url).searchParams.get("orderId") ?? "";
    if (!orderId) throw new ApiError(400, "order_required", "orderId is required.");
    return NextResponse.json(jsonSafe({ dispatch: await dispatchForOrder(orderId) }));
  } catch (error) {
    return jsonError(error);
  }
}
