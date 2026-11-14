import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getProduct, getPublicProductDetail } from "@/lib/services/core/catalog.service";
import { jsonSafe } from "@/lib/services/core/serialize";
import { jsonError } from "@/lib/auth/guard";
import { readLocale } from "@/lib/i18n/server";
import {
  assertVerticalAccess,
  previewAuthorizationForRequest
} from "@/lib/services/core/vertical-activation.service";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Confirm the row exists before evaluating the visitor's market. No field is
    // returned until the Shop gate and the public-visibility checks both pass.
    await getProduct(params.id);
  } catch {
    return NextResponse.json(
      { error: "Product not found.", code: "not_found" },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  const { previewAuthorized } = await previewAuthorizationForRequest();
  // Validate the market exactly like the server page: an unknown country falls
  // back to the home market and a city that belongs to another country is not
  // treated as selected.
  const { country, city } = readLocale();
  const countryCode = country;
  const cityCode = city || null;
  try {
    await assertVerticalAccess("shop", {
      countryCode,
      cityCode,
      previewAuthorized
    });
  } catch (error) {
    const response = jsonError(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  try {
    const detail = await getPublicProductDetail(params.id, {
      countryCode,
      cityCode,
      previewAuthorized
    });
    if (!detail) {
      return NextResponse.json(
        { error: "This product is not available.", code: "product_unavailable" },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json(jsonSafe(detail), {
      headers: {
        // A cached detail response must never outlive an image, price or
        // description correction made by the seller.
        "Cache-Control": "no-store"
      }
    });
  } catch {
    return NextResponse.json(
      { error: "Product not found.", code: "not_found" },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }
}
