import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getStorefrontConfig, updateStorefrontConfig } from "@/lib/services/core/storefront.service";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminPermission("products:moderate");
    return NextResponse.json(jsonSafe(await getStorefrontConfig()));
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("products:moderate");
    const body = await readJson<Record<string, unknown>>(request);
    return NextResponse.json(jsonSafe(await updateStorefrontConfig(admin.id, body)));
  } catch (error) {
    return jsonError(error);
  }
}
