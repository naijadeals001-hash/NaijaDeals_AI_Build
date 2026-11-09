import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { cancelReservation } from "@/lib/services/stay/reservations";

export const dynamic = "force-dynamic";

/** Guest or host cancels; the refund follows the policy snapshot stored at booking. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await readJson<Record<string, unknown>>(request).catch(() => ({}));
    const result = await cancelReservation({ userId: user.id, reservationId: params.id });
    return NextResponse.json(jsonSafe({ cancelled: result.cancelled, refundPercent: result.refundPercent, refundKobo: result.refundKobo }));
  } catch (error) {
    return jsonError(error);
  }
}
