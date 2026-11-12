import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, readJson } from "@/lib/auth/guard";
import { requireAnyAdminPermission } from "../../_helpers";
import { jsonSafe } from "@/lib/services/core/serialize";
import { updateBenefit } from "@/lib/services/plus/benefit.service";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const actor = await requireAnyAdminPermission(["plus:content:write", "plus:content:publish"]);
    const body = await readJson(request);
    return NextResponse.json(jsonSafe(await updateBenefit(actor, params.id, body)));
  } catch (error) {
    return jsonError(error);
  }
}
