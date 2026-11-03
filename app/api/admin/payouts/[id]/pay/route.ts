import { NextResponse } from "next/server";
import { markPayoutPaid } from "@/lib/services/core/admin.service";
import { assertLiveFinancialOperations } from "@/lib/payments/boundary";
import { assertSameOrigin, jsonError, requireAdminPermission } from "@/lib/auth/guard";
import { assertPayoutRegion } from "@/lib/auth/scope";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("finance:payouts:write");
    assertLiveFinancialOperations("Vendor payout settlement");
    await assertPayoutRegion(admin, params.id);
    const payout = await markPayoutPaid({ adminId: admin.id, payoutId: params.id });
    return NextResponse.json(jsonSafe(payout));
  } catch (error) {
    return jsonError(error);
  }
}
