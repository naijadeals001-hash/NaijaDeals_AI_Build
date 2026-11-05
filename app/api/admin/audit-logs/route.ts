import { NextResponse } from "next/server";
import { getAuditLogs } from "@/lib/services/core/admin.service";
import { jsonError, requireAdminPermission } from "@/lib/auth/guard";
import { assertPlatformWideAuditAccess } from "@/lib/auth/scope";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const admin = await requireAdminPermission("audit:read");
    assertPlatformWideAuditAccess(admin);
    return NextResponse.json(jsonSafe(await getAuditLogs()));
  } catch (error) {
    return jsonError(error);
  }
}
