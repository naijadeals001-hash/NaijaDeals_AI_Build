import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { createBenefit, listBenefits } from "@/lib/services/plus/benefit.service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAdminPermission("plus:content:read");
    const status = new URL(request.url).searchParams.get("status");
    return NextResponse.json(jsonSafe(await listBenefits({ status })));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdminPermission("plus:content:write");
    const body = await readJson(request);
    return NextResponse.json(jsonSafe(await createBenefit(actor, body)), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
