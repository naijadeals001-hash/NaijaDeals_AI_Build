import { NextResponse } from "next/server";
import { jsonError, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { adminGigOverview } from "@/lib/services/gigs/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const admin = await requireAdminPermission("gigs:read");
    return NextResponse.json(jsonSafe(await adminGigOverview(admin)));
  } catch (error) {
    return jsonError(error);
  }
}
