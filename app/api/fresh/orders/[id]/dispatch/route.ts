import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";
import { prisma } from "@/lib/prisma";
import { acceptFreshOffer, confirmFreshDelivery, confirmFreshPickup, declineFreshOffer, openFreshDispatch } from "@/lib/services/fresh/dispatch";
import { transitionFreshOrder } from "@/lib/services/fresh/orders";

export const dynamic = "force-dynamic";

/**
 * Farm and courier dispatch actions for one order.
 *
 * - The farm owner calls `open` once produce is ready for pickup.
 * - A courier/driver accepts or declines their own offer.
 * - Pickup and delivery are PIN-gated.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const action = String(body.action ?? "");

    const order = await prisma.freshOrder.findUnique({
      where: { id: params.id },
      select: { id: true, farm: { select: { ownerId: true } } }
    });
    if (!order) throw new ApiError(404, "order_not_found", "Order not found.");

    if (action === "open") {
      if (order.farm.ownerId !== user.id) throw new ApiError(403, "forbidden", "Only the farm owner can dispatch this order.");
      return NextResponse.json(jsonSafe(await openFreshDispatch(order.id, user.id)));
    }
    if (action === "advance") {
      if (order.farm.ownerId !== user.id) throw new ApiError(403, "forbidden", "Only the farm owner can advance this order.");
      const status = String(body.status ?? "");
      return NextResponse.json(jsonSafe(await transitionFreshOrder({ actor: { id: user.id, role: "farm" }, orderId: order.id, status })));
    }
    if (action === "accept" || action === "decline") {
      const provider = await resolveProvider(user.id);
      const offerId = String(body.offerId ?? "");
      if (!offerId) throw new ApiError(400, "offer_required", "offerId is required.");
      const result = action === "accept" ? await acceptFreshOffer(provider.type, provider.id, offerId, user.id) : await declineFreshOffer(provider.type, provider.id, offerId);
      return NextResponse.json(jsonSafe(result));
    }
    if (action === "pickup" || action === "deliver") {
      const provider = await resolveProvider(user.id);
      const dispatchId = String(body.dispatchId ?? "");
      const pin = String(body.pin ?? "");
      if (!dispatchId || !pin) throw new ApiError(400, "validation_error", "dispatchId and pin are required.");
      const result =
        action === "pickup"
          ? await confirmFreshPickup({ providerType: provider.type, providerId: provider.id, dispatchId, pin, actorId: user.id })
          : await confirmFreshDelivery({ providerType: provider.type, providerId: provider.id, dispatchId, pin, actorId: user.id });
      return NextResponse.json(jsonSafe(result));
    }
    throw new ApiError(400, "invalid_action", "action must be open, accept, decline, pickup or deliver.");
  } catch (error) {
    return jsonError(error);
  }
}

async function resolveProvider(userId: string): Promise<{ type: "courier" | "driver"; id: string }> {
  const [courier, driver] = await Promise.all([
    prisma.courier.findFirst({ where: { userId }, select: { id: true } }),
    prisma.driverProfile.findFirst({ where: { userId }, select: { id: true } })
  ]);
  if (courier) return { type: "courier", id: courier.id };
  if (driver) return { type: "driver", id: driver.id };
  throw new ApiError(403, "not_a_provider", "This account is not a NaijaSend courier or NaijaDrive driver.");
}
