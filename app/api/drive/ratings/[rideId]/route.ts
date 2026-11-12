import { NextResponse } from "next/server";
import { getRideRatingState } from "@/lib/services/core/drive.service";
import { jsonError, requireUser } from "@/lib/auth/guard";
import { isAdmin } from "@/lib/auth/session";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

/**
 * The caller's own rating state for one trip, plus aggregate summaries computed
 * from real rating rows. It never exposes the other participant's feedback.
 */
export async function GET(_request: Request, { params }: { params: { rideId: string } }) {
  try {
    const user = await requireUser();
    const state = await getRideRatingState({
      userId: user.id,
      isAdmin: isAdmin(user),
      rideId: params.rideId
    });
    return NextResponse.json(jsonSafe(state), {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return jsonError(error);
  }
}
