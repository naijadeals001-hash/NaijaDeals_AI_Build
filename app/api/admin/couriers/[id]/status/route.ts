import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { setCourierStatus } from "@/lib/services/core/admin.service";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("deliveries:write");
    const body = await readJson<Record<string, unknown>>(request);
    if (typeof body.active !== "boolean") {
      return NextResponse.json({ error: "active must be a boolean.", code: "validation_error" }, { status: 400 });
    }
    const courier = await setCourierStatus({
      adminId: admin.id,
      courierId: params.id,
      active: body.active,
      reason: typeof body.reason === "string" ? body.reason : undefined
    });
    return NextResponse.json(jsonSafe(courier));
  } catch (error) {
    return jsonError(error);
  }
}
