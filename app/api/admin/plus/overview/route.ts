import { NextResponse } from "next/server";
import { jsonError, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { getPlusOverview } from "@/lib/services/plus/overview.service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminPermission("plus:content:read");
    return NextResponse.json(jsonSafe(await getPlusOverview()));
  } catch (error) {
    return jsonError(error);
  }
}
