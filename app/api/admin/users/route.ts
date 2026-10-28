import { NextResponse } from "next/server";
import { getAdminUsers, getAuditLogs } from "@/lib/services/core/admin.service";
import { jsonError, requireAdmin } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    if (url.searchParams.get("include") === "audit") {
      return NextResponse.json(jsonSafe(await getAuditLogs()));
    }
    return NextResponse.json(jsonSafe(await getAdminUsers()));
  } catch (error) {
    return jsonError(error);
  }
}
