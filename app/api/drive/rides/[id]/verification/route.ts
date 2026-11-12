import { NextResponse } from "next/server";
import { getRideVerificationCode } from "@/lib/services/core/drive.service";
import { jsonError, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

/**
 * The rider's own protected pickup code.
 *
 * Deliberately separate from the ride payload because the driver also reads that
 * payload; only the rider can retrieve this code. The code is derived with a
 * server-held key (HMAC-SHA256) from the per-ride salt and the record's
 * `keyVersion`; storage also keeps a keyed scrypt verifier. A database-only
 * reader cannot recover a usable code. A missing or retired key fails closed with
 * 503 `verification_key_unavailable` and never falls back to the old salt-only
 * derivation. Drivers and administrators are refused. A missing record on a
 * post-enforcement assignment is refused (409 verification_record_missing) and
 * goes through the audited support recovery action.
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
