import { NextResponse } from "next/server";
import { jsonError, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { walletReconciliation } from "@/lib/services/core/reconciliation.service";

export const dynamic = "force-dynamic";

/** Read-only wallet/ledger reconciliation for the Control Center (finance:read). */
export async function GET() {
  try {
    await requireAdminPermission("finance:read");
    return NextResponse.json(jsonSafe(await walletReconciliation()));
  } catch (error) {
    return jsonError(error);
  }
}
