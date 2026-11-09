import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";
import { transitionFreshOrder } from "@/lib/services/fresh/orders";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Customer-initiated transitions only. Cancellation is allowed while the farm
 * has not accepted; every other step is driven by the farm or courier routes.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const status = String(body.status ?? "");
    const order = await prisma.freshOrder.findUnique({ where: { id: params.id }, select: { customerId: true } });
    if (!order) throw new ApiError(404, "order_not_found", "Order not found.");
    if (order.customerId !== user.id) throw new ApiError(403, "forbidden", "This order belongs to another account.");
    if (status !== "cancelled") throw new ApiError(403, "not_allowed", "Only the farm or courier can move this order forward.");
    return NextResponse.json(jsonSafe(await transitionFreshOrder({ actor: { id: user.id, role: "customer" }, orderId: params.id, status })));
  } catch (error) {
    return jsonError(error);
  }
}
