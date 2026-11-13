import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getProduct, getPublicProductDetail } from "@/lib/services/core/catalog.service";
import { jsonSafe } from "@/lib/services/core/serialize";
import { getSessionUser } from "@/lib/auth/session";
import { jsonError } from "@/lib/auth/guard";
import {
  assertVerticalAccess,
  canPreviewVertical
} from "@/lib/services/core/vertical-activation.service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  let product;
  try {
    // The raw row is read only to learn its country; no field is returned until
    // the Shop gate and the existing public-visibility checks both pass.
    product = await getProduct(params.id);
  } catch {
    return NextResponse.json({ error: "Product not found.", code: "not_found" }, { status: 404 });
  }

  const sessionUser = await getSessionUser().catch(() => null);
  const previewAuthorized = canPreviewVertical(sessionUser);
  try {
    await assertVerticalAccess("shop", {
      countryCode: product.countryCode,
      previewAuthorized
    });
  } catch (error) {
    return jsonError(error);
  }

  try {
    const detail = await getPublicProductDetail(params.id, {
      countryCode: product.countryCode,
      previewAuthorized
    });
    if (!detail) {
      return NextResponse.json({ error: "This product is not available.", code: "product_unavailable" }, { status: 404 });
    }
    return NextResponse.json(jsonSafe(detail), {
      headers: {
        // A cached detail response must never outlive an image, price or
        // description correction made by the seller.
        "Cache-Control": "no-store"
      }
    });
  } catch {
    return NextResponse.json({ error: "Product not found.", code: "not_found" }, { status: 404 });
  }
}
