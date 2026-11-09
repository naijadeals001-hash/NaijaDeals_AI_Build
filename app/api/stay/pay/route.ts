import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";
import { payReservation } from "@/lib/services/stay/reservations";

export const dynamic = "force-dynamic";

/** Pays a held reservation from the guest's NaijaPay wallet. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const reservationId = String(body.reservationId ?? "");
    if (!reservationId) throw new ApiError(400, "reservation_required", "Choose a reservation.");
    return NextResponse.json(jsonSafe(await payReservation({ guestId: user.id, reservationId })));
  } catch (error) {
    return jsonError(error);
  }
}
