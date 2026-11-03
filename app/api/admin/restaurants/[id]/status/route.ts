import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { setRestaurantStatus } from "@/lib/services/core/restaurant.service";
import { ApiError, assertSameOrigin, jsonError, readJson, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("vendors:review");
    const body = await readJson<Record<string, unknown>>(request);
    const status = body.status === "SUSPENDED" ? "SUSPENDED" : body.status === "VERIFIED" ? "VERIFIED" : null;
    if (!status) throw new ApiError(400, "validation_error", "Status must be VERIFIED or SUSPENDED.");
    const restaurant = await setRestaurantStatus({
      adminId: admin.id,
      restaurantId: params.id,
      status,
      reason: typeof body.reason === "string" ? body.reason : undefined
    });
    return NextResponse.json(jsonSafe(restaurant));
  } catch (error) {
    return jsonError(error);
  }
}
