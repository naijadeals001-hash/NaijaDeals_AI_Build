import { NextResponse } from "next/server";
import { reviewSellerApplication } from "@/lib/services/core/admin.service";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission, requireString } from "@/lib/auth/guard";
import { assertApplicationRegion } from "@/lib/auth/scope";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("vendors:review");
    await assertApplicationRegion(admin, params.id);
    const body = await readJson<Record<string, unknown>>(request);
    const decision = requireString(body.decision, "Decision", 20);
    if (decision !== "approve" && decision !== "reject") {
      return NextResponse.json({ error: "Decision must be approve or reject.", code: "invalid_decision" }, { status: 400 });
    }
    const result = await reviewSellerApplication({
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
