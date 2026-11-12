import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, readJson } from "@/lib/auth/guard";
import { requireAnyAdminPermission } from "../../_helpers";
import { jsonSafe } from "@/lib/services/core/serialize";
import { updateContent } from "@/lib/services/plus/content.service";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const actor = await requireAnyAdminPermission(["plus:content:write", "plus:content:publish"]);
    const body = await readJson(request);
    const card = await updateContent(actor, params.id, body);
    return NextResponse.json(jsonSafe(card));
  } catch (error) {
    return jsonError(error);
  }
}
