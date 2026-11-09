import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";
import { createHold } from "@/lib/services/stay/reservations";

export const dynamic = "force-dynamic";

/** Creates a short-lived hold for the chosen dates. The price is computed here. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const propertyId = String(body.propertyId ?? "");
    const checkIn = String(body.checkIn ?? "");
    const checkOut = String(body.checkOut ?? "");
    if (!propertyId) throw new ApiError(400, "property_required", "Choose a property.");
    const { reservation, price } = await createHold({
      guestId: user.id,
      propertyId,
      checkIn,
      checkOut,
      guests: Number(body.guests ?? 1),
      guestName: String(body.guestName ?? ""),
      guestPhone: String(body.guestPhone ?? "")
    });
    return NextResponse.json(jsonSafe({ reservationId: reservation.id, reference: reservation.reference, holdExpiresAt: reservation.holdExpiresAt, price }), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
