import { NextResponse } from "next/server";
import { getAdminDisputes } from "@/lib/services/core/admin.service";
import { jsonError, requireAdminPermission } from "@/lib/auth/guard";
import { resolveAdminRegion } from "@/lib/admin/region";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const admin = await requireAdminPermission("disputes:read");
    const { region } = resolveAdminRegion(null, admin.scopeCountryCode);
    const rows = await getAdminDisputes({ countryCode: region === "ALL" ? undefined : region });
    return NextResponse.json(jsonSafe(rows));
  } catch (error) {
    return jsonError(error);
  }
}
