import { NextResponse } from "next/server";
import type { ServiceMode, ServicePricingType } from "@prisma/client";
import { assertSameOrigin, jsonError, optionalString, readJson, requireString, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { createServiceListing, searchGigServices } from "@/lib/services/gigs/service";
import { oneOf, optionalMoney, pageParams } from "@/lib/gigs/input";
import { ApiError } from "@/lib/auth/api-error";

export const dynamic = "force-dynamic";

const MODES: readonly ServiceMode[] = ["LOCAL", "REMOTE", "PROJECT"];
const PRICING: readonly ServicePricingType[] = ["HOURLY", "FIXED", "QUOTE"];

export async function GET(request: Request) {
  try {
    const { params, page, pageSize } = pageParams(request.url);
    const mode = params.get("mode");
    const sort = params.get("sort");
    const result = await searchGigServices({
      q: params.get("q")?.slice(0, 120) || undefined,
      category: params.get("category") || undefined,
      mode: mode ? oneOf(mode, MODES, "Mode") : undefined,
      countryCode: params.get("countryCode")?.slice(0, 2).toUpperCase() || undefined,
      city: params.get("city")?.slice(0, 80) || undefined,
      sort: sort === "price_asc" || sort === "price_desc" ? sort : "recent",
      page,
      pageSize
    });
    return NextResponse.json(jsonSafe(result));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const pricingType = oneOf(body.pricingType, PRICING, "Pricing type");
    const priceKobo = optionalMoney(body.priceKobo, "Price");
    if (pricingType !== "QUOTE" && !priceKobo) throw new ApiError(400, "invalid_price", "Set a price for fixed or hourly services.");

    const listing = await createServiceListing(user.id, {
      categoryId: requireString(body.categoryId, "Category", 60),
      title: requireString(body.title, "Title", 140),
      summary: requireString(body.summary, "Summary", 280),
      description: requireString(body.description, "Description", 4000),
      mode: oneOf(body.mode, MODES, "Service mode"),
      pricingType,
      priceKobo,
      countryCode: requireString(body.countryCode ?? user.countryCode, "Country", 2).toUpperCase(),
      state: optionalString(body.state, 80),
      city: optionalString(body.city, 80),
      imageUrl: optionalString(body.imageUrl, 500)
    });
    return NextResponse.json(jsonSafe(listing), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
