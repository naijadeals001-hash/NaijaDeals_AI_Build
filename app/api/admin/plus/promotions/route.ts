import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { createPromotion, listPromotions } from "@/lib/services/plus/promotion.service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAdminPermission("plus:content:read");
    const params = new URL(request.url).searchParams;
    return NextResponse.json(jsonSafe(await listPromotions({ status: params.get("status"), kind: params.get("kind") })));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdminPermission("plus:content:write");
    const body = await readJson(request);
    return NextResponse.json(jsonSafe(await createPromotion(actor, body)), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
