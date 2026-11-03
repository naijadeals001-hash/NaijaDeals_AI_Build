import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { reviewRestaurantApplication } from "@/lib/services/core/restaurant.service";
import { ApiError, assertSameOrigin, jsonError, readJson, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("vendors:review");
    const body = await readJson<Record<string, unknown>>(request);
    const decision = body.decision === "approve" ? "approve" : body.decision === "reject" ? "reject" : null;
    if (!decision) throw new ApiError(400, "validation_error", "Decision must be approve or reject.");
    const result = await reviewRestaurantApplication({
      adminId: admin.id,
      applicationId: params.id,
      decision,
      note: typeof body.note === "string" ? body.note : undefined
    });
    return NextResponse.json(jsonSafe(result));
  } catch (error) {
    return jsonError(error);
  }
}
