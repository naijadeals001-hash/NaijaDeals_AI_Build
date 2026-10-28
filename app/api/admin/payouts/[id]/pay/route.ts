import { NextResponse } from "next/server";
import { markPayoutPaid } from "@/lib/services/core/admin.service";
import { assertSameOrigin, jsonError, requireAdmin } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const payout = await markPayoutPaid({ adminId: admin.id, payoutId: params.id });
    return NextResponse.json(jsonSafe(payout));
  } catch (error) {
    return jsonError(error);
  }
}
