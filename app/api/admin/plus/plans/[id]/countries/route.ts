import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { setPlanCountry } from "@/lib/services/plus/plan.service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdminPermission("plus:membership:configure");
    const body = await readJson(request);
    return NextResponse.json(jsonSafe(await setPlanCountry(actor, params.id, body)));
  } catch (error) {
    return jsonError(error);
  }
}
