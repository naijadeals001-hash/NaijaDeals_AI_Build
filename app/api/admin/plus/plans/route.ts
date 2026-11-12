import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { createPlan, listPlans } from "@/lib/services/plus/plan.service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminPermission("plus:content:read");
    return NextResponse.json(jsonSafe(await listPlans()));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdminPermission("plus:membership:configure");
    const body = await readJson(request);
    return NextResponse.json(jsonSafe(await createPlan(actor, body)), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
