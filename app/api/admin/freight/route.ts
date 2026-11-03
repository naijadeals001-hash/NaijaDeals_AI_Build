import { NextResponse } from "next/server";
import { listFreightForAdmin } from "@/lib/services/core/freight.service";
import { jsonError, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminPermission("deliveries:read");
    return NextResponse.json(jsonSafe(await listFreightForAdmin()));
  } catch (error) {
    return jsonError(error);
  }
}
