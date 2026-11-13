import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission } from "@/lib/auth/guard";
import { getAdminTaxonomy } from "@/lib/services/taxonomy/admin";
import { createCategoryNode } from "@/lib/services/taxonomy/nodes";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const admin = await requireAdminPermission("products:read");
    return NextResponse.json(jsonSafe(await getAdminTaxonomy(admin)));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("products:moderate");
    const body = await readJson<Record<string, unknown>>(request);
    if (admin.scopeCountryCode) {
      const rules = Array.isArray(body.countryRules) ? body.countryRules : [];
      const inScope = rules.some((rule) => {
        const entry = rule as { countryCode?: unknown };
        return typeof entry.countryCode === "string" && entry.countryCode.toUpperCase() === admin.scopeCountryCode?.toUpperCase();
      });
      if (!inScope) {
        throw new ApiError(403, "region_forbidden", "Scoped administrators must attach a country rule for their own country when creating taxonomy nodes.");
      }
    }
    return NextResponse.json(jsonSafe(await createCategoryNode(admin, body)), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
