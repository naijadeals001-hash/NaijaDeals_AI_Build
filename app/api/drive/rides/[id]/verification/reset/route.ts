import { NextResponse } from "next/server";
import { resetRideVerificationByRider } from "@/lib/services/core/drive.service";
import { assertSameOrigin, jsonError, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

/**
 * Rider-initiated reset for an expired or locked pickup code.
 *
 * Only the ride's rider may call this. The response contains verification state,
 * never the code; the rider's GET verification endpoint returns the new code.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const result = await resetRideVerificationByRider({ userId: user.id, rideId: params.id });
    return NextResponse.json(jsonSafe(result), {
      headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" }
    });
  } catch (error) {
    return jsonError(error);
  }
}
