import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCategories } from "@/lib/services/core/catalog.service";
import { jsonError } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

/**
 * Legacy Shop department roots, now market-scoped. The response uses the
 * selected country's category tree, publication rules and product counts; a
 * caller that omits `country` keeps the documented NG default, while all Shop
 * clients pass the visitor's selected market.
 */
export async function GET(request: NextRequest) {
  try {
    const country = request.nextUrl.searchParams.get("country");
    const city = request.nextUrl.searchParams.get("city");
    return NextResponse.json(jsonSafe(await getCategories({ countryCode: country, cityCode: city })));
  } catch (error) {
    return jsonError(error);
  }
}
