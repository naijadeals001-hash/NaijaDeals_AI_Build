import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { reorderContent } from "@/lib/services/plus/content.service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdminPermission("plus:content:write");
    const body = await readJson<{ ids?: unknown }>(request);
    return NextResponse.json(jsonSafe(await reorderContent(actor, body.ids)));
  } catch (error) {
    return jsonError(error);
  }
}
