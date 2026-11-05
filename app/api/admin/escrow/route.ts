import { NextResponse } from "next/server";
import { jsonError, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { listAdminEscrowHolds } from "@/lib/services/core/admin.service";

export const dynamic = "force-dynamic";

/** Escrow holds with latest event, for the Control Center finance views (finance:read). */
export async function GET() {
  try {
    await requireAdminPermission("finance:read");
    return NextResponse.json(jsonSafe(await listAdminEscrowHolds()));
  } catch (error) {
    return jsonError(error);
  }
}
