import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getPublicLevelOneCategories } from "@/lib/services/taxonomy/public";
import { jsonError } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

/**
 * Lightweight browsing-rail projection: every active, reachable level-1
 * category with `browsingVisible` on, in merchandising order, carrying its
 * image/alt, country publication state and aggregated product counts.
 *
 * Departments and level-2 leaves are intentionally absent so a client does not
 * have to flatten the full tree to render a category rail. `browsingVisible`
 * filters this endpoint only; `/api/taxonomy` keeps the same nodes published.
 */
export async function GET(request: NextRequest) {
  try {
    const country = request.nextUrl.searchParams.get("country");
    return NextResponse.json(jsonSafe(await getPublicLevelOneCategories({ countryCode: country })));
  } catch (error) {
    return jsonError(error);
  }
}
