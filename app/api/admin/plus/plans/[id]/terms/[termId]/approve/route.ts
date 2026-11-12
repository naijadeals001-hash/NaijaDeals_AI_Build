import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { approvePlanTerm } from "@/lib/services/plus/plan.service";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; termId: string } }
) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdminPermission("plus:membership:configure");
    return NextResponse.json(jsonSafe(await approvePlanTerm(actor, params.id, params.termId)));
  } catch (error) {
    return jsonError(error);
  }
}
