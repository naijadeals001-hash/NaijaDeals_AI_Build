import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";
import { prisma } from "@/lib/prisma";
import { transitionShipment } from "@/lib/services/send/state-machine";

export const dynamic = "force-dynamic";

/**
 * Transporter navigation actions for a shipment the caller is ASSIGNED to.
 *
 * Authorisation comes from the assignment record, not from the caller being a
 * provider: `transitionShipment` resolves the assignment and refuses anyone
 * else. Every action needs the version the client saw and an idempotency key.
 *
 * Pickup and delivery additionally require the PIN the customer/sender holds;
 * without a unique pickup row the shipment can never be marked picked up twice.
 */
const PROVIDER_ACTIONS = new Set(["en_route_to_pickup", "arrived_at_pickup", "picked_up", "in_transit", "out_for_delivery", "arrived_at_destination", "delivered", "delayed", "delivery_failed"]);

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const to = String(body.to ?? "");
    if (!PROVIDER_ACTIONS.has(to)) throw new ApiError(400, "invalid_action", "That action is not a transporter navigation step.");

    const shipment = await prisma.logisticsShipment.findUnique({ where: { id: params.id }, select: { id: true, version: true } });
    if (!shipment) throw new ApiError(404, "shipment_not_found", "Shipment not found.");

    const result = await transitionShipment({
      shipmentId: shipment.id,
      to,
      actor: { kind: "provider", userId: user.id },
      expectedVersion: Number(body.version ?? -1),
      idempotencyKey: String(body.idempotencyKey ?? ""),
      pin: typeof body.pin === "string" ? body.pin : undefined,
      note: typeof body.note === "string" ? body.note.slice(0, 300) : undefined
    });
    return NextResponse.json(jsonSafe(result));
  } catch (error) {
    return jsonError(error);
  }
}
