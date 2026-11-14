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
 * Browsing and publishing are separate: a country-restricted category remains
 * here with `canPublish:false`, its restriction note and a zero listing count;
 * it is not silently removed. `browsingVisible=false` filters this endpoint
 * only; `/api/taxonomy` keeps the same nodes published.
 */
export async function GET(request: NextRequest) {
  try {
    const country = request.nextUrl.searchParams.get("country");
    const city = request.nextUrl.searchParams.get("city");
    return NextResponse.json(jsonSafe(await getPublicLevelOneCategories({ countryCode: country, city })));
  } catch (error) {
    return jsonError(error);
  }
}
