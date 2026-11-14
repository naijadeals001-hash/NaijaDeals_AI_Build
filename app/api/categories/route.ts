import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCategories } from "@/lib/services/core/catalog.service";
import { ApiError, jsonError } from "@/lib/auth/guard";
import { isCountryCode, resolveCity } from "@/lib/config/regions";
import { readLocale } from "@/lib/i18n/server";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

/**
 * Legacy Shop department roots, now explicitly market-scoped.
 *
 * The effective market is the validated `country`/`city` query pair, or the
 * visitor's shared locale (`readLocale`) when the query omits them. The service
 * no longer applies an implicit NG fallback, so every response is computed from
 * the selected market's published tree and product counts. Browsing counts are
 * selected-market scoped; delivery/checkout eligibility is a separate concern
 * and is never inferred from this browsing projection.
 *
 * The response is always uncached: switching market must never reuse another
 * market's roots or counts.
 */
function resolveMarket(request: NextRequest): { country: string; city: string | null } {
  const params = request.nextUrl.searchParams;
  const rawCountry = params.get("country")?.trim().toUpperCase() ?? "";
  const rawCity = params.get("city")?.trim() ?? "";
  const locale = readLocale();

  if (rawCountry && !isCountryCode(rawCountry)) {
    throw new ApiError(400, "invalid_market", `"${rawCountry}" is not a supported market country.`);
  }

  const country = rawCountry || locale.country;
  // An explicit country wins over the locale; its city must belong to it. When
  // no country is supplied, an explicit valid city still wins over the locale
  // city, and the locale city is used only as the shared default.
  const requestedCity = rawCity || (rawCountry ? "" : locale.city);
  const city = requestedCity ? resolveCity(country, requestedCity) : "";
  if (requestedCity && !city) {
    throw new ApiError(400, "invalid_city", `"${requestedCity}" is not a supported city in ${country}.`);
  }

  return { country, city: city || null };
}

export async function GET(request: NextRequest) {
  let response: NextResponse;
  try {
    const market = resolveMarket(request);
    response = NextResponse.json(
      jsonSafe(await getCategories({ countryCode: market.country, cityCode: market.city }))
    );
  } catch (error) {
    response = jsonError(error);
  }
  response.headers.set("Cache-Control", "no-store");
  return response;
}
