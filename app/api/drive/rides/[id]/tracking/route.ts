import { NextResponse } from "next/server";
import { getRideTracking } from "@/lib/services/core/drive.service";
import { jsonError, requireUser } from "@/lib/auth/guard";
import { isAdmin } from "@/lib/auth/session";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

/**
 * Tracking state for one ride.
 *
 * Authorised to the rider, the assigned driver or an admin. Completed or cancelled
 * rides return `closed: true` with no coordinates, and a requested ride returns no
 * position because nobody is assigned yet. Other accounts get 403 before any fix is
 * read.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const tracking = await getRideTracking({
      userId: user.id,
      isAdmin: isAdmin(user),
      rideId: params.id
    });
    return NextResponse.json(jsonSafe(tracking), {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return jsonError(error);
  }
}
