import { NextResponse } from "next/server";
import { getAdminOverview } from "@/lib/services/core/admin.service";
import { jsonError, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminPermission("dashboard:read");
    return NextResponse.json(jsonSafe(await getAdminOverview()));
  } catch (error) {
    return jsonError(error);
  }
}
