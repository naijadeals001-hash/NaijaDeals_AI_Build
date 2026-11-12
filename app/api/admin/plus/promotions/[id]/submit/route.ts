import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, jsonError } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { submitPromotion } from "@/lib/services/plus/promotion.service";
import { requirePromotionPermission } from "../../../_helpers";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const { actor } = await requirePromotionPermission(params.id, {
      house: "plus:content:publish",
      sponsored: "plus:content:write"
    });
    return NextResponse.json(jsonSafe(await submitPromotion(actor, params.id)));
  } catch (error) {
    return jsonError(error);
  }
}
