import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";
import { reviewStay } from "@/lib/services/stay/reservations";

export const dynamic = "force-dynamic";

/** One review per completed stay. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const rating = Number(body.rating ?? 0);
    if (!Number.isInteger(rating)) throw new ApiError(400, "invalid_rating", "Choose a rating from 1 to 5.");
    return NextResponse.json(jsonSafe(await reviewStay({ guestId: user.id, reservationId: params.id, rating, comment: typeof body.comment === "string" ? body.comment : undefined })), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
