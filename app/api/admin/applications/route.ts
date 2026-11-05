import { NextResponse } from "next/server";
import { listSellerApplications } from "@/lib/services/core/admin.service";
import { jsonError, requireAdminPermission } from "@/lib/auth/guard";
import { countryScopeWhere } from "@/lib/auth/scope";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const admin = await requireAdminPermission("vendors:read");
    return NextResponse.json(jsonSafe(await listSellerApplications(countryScopeWhere(admin))));
  } catch (error) {
    return jsonError(error);
  }
}
