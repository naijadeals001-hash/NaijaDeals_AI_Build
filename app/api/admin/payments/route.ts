import { NextResponse } from "next/server";
import { listAdminPayments } from "@/lib/services/core/admin.service";
import { jsonError, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminPermission("finance:read");
    return NextResponse.json(jsonSafe(await listAdminPayments()));
  } catch (error) {
    return jsonError(error);
  }
}
