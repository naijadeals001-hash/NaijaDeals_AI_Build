import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { advanceLeg } from "@/lib/services/send/shipments";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/api-error";

export const dynamic = "force-dynamic";

/**
 * Provider-only leg progression. The caller must be the owner of the provider
 * that was booked for this shipment; only then may they mark pickup, transit or
 * arrival. Air and sea milestones are flagged `simulated` because no live carrier
 * integration exists.
 */
export async function POST(request: Request, { params }: { params: { id: string; legId: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const leg = await prisma.shipmentLeg.findUnique({
      where: { id: params.legId },
      select: { id: true, shipmentId: true, providerId: true, mode: true }
    });
    if (!leg || leg.shipmentId !== params.id) throw new ApiError(404, "leg_not_found", "Shipment leg not found.");
    const provider = leg.providerId
      ? await prisma.logisticsProvider.findUnique({ where: { id: leg.providerId }, select: { ownerId: true } })
      : null;
    if (!provider || provider.ownerId !== user.id) throw new ApiError(403, "forbidden", "Only the booked provider can update this leg.");

    const status = String(body.status ?? "");
    if (!["in_transit", "arrived"].includes(status)) throw new ApiError(400, "invalid_status", "status must be in_transit or arrived.");
    const simulated = leg.mode === "air" || leg.mode === "sea" || leg.mode === "rail";
    const result = await advanceLeg({
      actorId: user.id,
      shipmentId: params.id,
      legId: leg.id,
      status,
      note: typeof body.note === "string" ? body.note : undefined,
      pin: typeof body.pin === "string" ? body.pin : undefined,
      simulated
    });
    return NextResponse.json(jsonSafe(result));
  } catch (error) {
    return jsonError(error);
  }
}
