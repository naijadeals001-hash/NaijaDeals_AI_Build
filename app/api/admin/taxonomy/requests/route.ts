import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jsonError, requireAdminPermission } from "@/lib/auth/guard";
import { listAdminCategoryRequests } from "@/lib/services/taxonomy/admin";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminPermission("products:read");
    const status = request.nextUrl.searchParams.get("status");
    return NextResponse.json(jsonSafe(await listAdminCategoryRequests(admin, status)));
  } catch (error) {
    return jsonError(error);
  }
}
