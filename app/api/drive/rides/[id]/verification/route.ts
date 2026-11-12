import { NextResponse } from "next/server";
import { getRideVerificationCode } from "@/lib/services/core/drive.service";
import { jsonError, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

/**
 * The rider's own protected pickup code.
 *
 * Deliberately separate from the ride payload because the driver also reads that
 * payload; only the rider can retrieve this code. The code is derived from a
 * random per-ride salt in the dedicated RideVerification record and only its
 * salted scrypt hash is stored. Drivers and administrators are refused.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const result = await getRideVerificationCode({ userId: user.id, rideId: params.id });
    return NextResponse.json(jsonSafe(result), {
      headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" }
    });
  } catch (error) {
    return jsonError(error);
  }
}
