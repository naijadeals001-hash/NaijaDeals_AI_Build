import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { updateBenefit } from "@/lib/services/plus/benefit.service";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdminPermission("plus:content:write");
    const body = await readJson(request);
    return NextResponse.json(jsonSafe(await updateBenefit(actor, params.id, body)));
  } catch (error) {
    return jsonError(error);
  }
}
