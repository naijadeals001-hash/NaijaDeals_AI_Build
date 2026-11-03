import { NextResponse } from "next/server";
import { listRestaurantApplications } from "@/lib/services/core/restaurant.service";
import { jsonError, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminPermission("vendors:review");
    return NextResponse.json(jsonSafe(await listRestaurantApplications()));
  } catch (error) {
    return jsonError(error);
  }
}
