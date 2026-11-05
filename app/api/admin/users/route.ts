import { NextResponse } from "next/server";
import { getAdminUsers, getAuditLogs } from "@/lib/services/core/admin.service";
import { ApiError, jsonError, requireAdminPermission } from "@/lib/auth/guard";
import { hasPermission } from "@/lib/auth/permissions";
import { assertPlatformWideAuditAccess } from "@/lib/auth/scope";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const admin = await requireAdminPermission("users:read");
    const url = new URL(request.url);
    if (url.searchParams.get("include") === "audit") {
      // Reading the audit trail is a separate capability from reading accounts.
      if (!hasPermission(admin, "audit:read")) {
        throw new ApiError(403, "permission_denied", "The \"audit:read\" permission is required for this action.");
      }
      assertPlatformWideAuditAccess(admin);
      return NextResponse.json(jsonSafe(await getAuditLogs()));
    }
    return NextResponse.json(jsonSafe(await getAdminUsers()));
  } catch (error) {
    return jsonError(error);
  }
}
