import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission } from "@/lib/auth/guard";
import { updateCategoryNode } from "@/lib/services/taxonomy/nodes";
import { jsonSafe } from "@/lib/services/core/serialize";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("products:moderate");
    if (admin.scopeCountryCode) {
      const rule = await prisma.categoryCountryRule.findUnique({
        where: { categoryId_countryCode: { categoryId: params.id, countryCode: admin.scopeCountryCode.toUpperCase() } }
      });
      if (!rule) throw new ApiError(403, "region_forbidden", "This taxonomy node is outside your administrative country scope.");
    }
    const body = await readJson<Record<string, unknown>>(request);
    return NextResponse.json(jsonSafe(await updateCategoryNode(admin, params.id, body)));
  } catch (error) {
    return jsonError(error);
  }
}
