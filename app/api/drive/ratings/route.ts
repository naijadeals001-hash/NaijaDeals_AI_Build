import { NextResponse } from "next/server";
import { submitRideRating } from "@/lib/services/core/drive.service";
import {
  assertSameOrigin,
  jsonError,
  optionalString,
  readJson,
  requireNumber,
  requireString,
  requireUser
} from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

/**
 * One rating per participant per completed trip. The participant role is derived
 * from the authenticated account, never from the request body.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const result = await submitRideRating({
      userId: user.id,
      rideId: requireString(body.rideId, "Ride", 80),
      score: requireNumber(body.score, "Rating", 1, 5),
      feedback: optionalString(body.feedback, 1000)
    });
    return NextResponse.json(jsonSafe(result), { status: result.idempotent ? 200 : 201 });
  } catch (error) {
    return jsonError(error);
  }
}
