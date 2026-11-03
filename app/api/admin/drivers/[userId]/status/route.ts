import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { setDriverStatus } from "@/lib/services/core/admin.service";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { userId: string } }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("rides:write");
    const body = await readJson<Record<string, unknown>>(request);
    if (body.status !== "approved" && body.status !== "suspended") {
      return NextResponse.json({ error: "status must be approved or suspended.", code: "validation_error" }, { status: 400 });
    }
    const profile = await setDriverStatus({
      adminId: admin.id,
      userId: params.userId,
      status: body.status,
      reason: typeof body.reason === "string" ? body.reason : undefined
    });
    return NextResponse.json(jsonSafe(profile));
  } catch (error) {
    return jsonError(error);
  }
}
