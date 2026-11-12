import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { archivePromotion } from "@/lib/services/plus/promotion.service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdminPermission("plus:content:publish");
    return NextResponse.json(jsonSafe(await archivePromotion(actor, params.id)));
  } catch (error) {
    return jsonError(error);
  }
}
