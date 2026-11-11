import { NextResponse } from "next/server";
import { getRideVerificationCode } from "@/lib/services/core/drive.service";
import { jsonError, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

/**
 * The rider's own 4-digit passenger-verification code.
 *
 * Deliberately separate from the ride payload because the driver also reads that
 * payload; only the rider can retrieve this code. The code is derived from a
 * per-ride random salt held in the server-side event log, so it is not stored in
 * plain text.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const result = await getRideVerificationCode({ userId: user.id, rideId: params.id });
    return NextResponse.json(jsonSafe(result), {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return jsonError(error);
  }
}
