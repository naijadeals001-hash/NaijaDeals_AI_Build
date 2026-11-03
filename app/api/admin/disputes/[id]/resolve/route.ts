import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveDispute } from "@/lib/services/core/dispute.service";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("disputes:write");
    const body = await readJson<Record<string, unknown>>(request);
    const decision = body.decision;
    if (decision !== "refund" && decision !== "release") {
      return NextResponse.json({ error: "decision must be \"refund\" or \"release\".", code: "validation_error" }, { status: 400 });
    }
    const result = await resolveDispute({
      adminId: admin.id,
      disputeId: params.id,
      decision,
      note: typeof body.note === "string" ? body.note : undefined
    });
    return NextResponse.json(jsonSafe(result));
  } catch (error) {
    return jsonError(error);
  }
}
