import { NextResponse } from "next/server";
import { getRideVerificationCode } from "@/lib/services/core/drive.service";
import { jsonError, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

/**
 * The rider's own protected pickup code.
 *
 * Deliberately separate from the ride payload because the driver also reads that
 * payload; only the rider can retrieve this code. Storage holds the random
 * per-ride salt and a salted scrypt hash, and this endpoint recomputes the code
 * from the salt and ride id. That means the code is recoverable by anyone with
 * database read access plus the derivation; it is not encrypted and must never be
 * described as non-recoverable. Drivers and administrators are refused, which is
 * the boundary this endpoint enforces. A missing record on a post-enforcement
 * assignment is refused (409 verification_record_missing) and goes through the
 * audited support recovery action.
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
