import { NextResponse } from "next/server";
import { getRideReceipt } from "@/lib/services/core/drive.service";
import { jsonError, requireUser } from "@/lib/auth/guard";
import { isAdmin } from "@/lib/auth/session";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

/**
 * The participant's receipt. Fare components are rebuilt server-side from the
 * recorded ride and every total is integer kobo. The rider and the assigned
 * driver may read it; an unrelated account is refused.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const receipt = await getRideReceipt({ userId: user.id, isAdmin: isAdmin(user), rideId: params.id });
    return NextResponse.json(jsonSafe(receipt), {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return jsonError(error);
  }
}
