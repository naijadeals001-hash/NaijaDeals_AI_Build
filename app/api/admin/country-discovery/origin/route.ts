import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission } from "@/lib/auth/guard";
import { assertProductRegion } from "@/lib/auth/scope";
import { jsonSafe } from "@/lib/services/core/serialize";
import { listProductsForOriginReview, updateProductOrigin } from "@/lib/services/countries/discovery.service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("countries:origin:review");
    const products = await listProductsForOriginReview(1000, admin.scopeCountryCode ?? null);
    return NextResponse.json(jsonSafe(products));
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("countries:origin:review");
    const body = await readJson<Record<string, unknown>>(request);
    const productId = String(body.productId ?? "").trim();
    if (!productId) return NextResponse.json({ error: "Product id is required.", code: "validation_error" }, { status: 400 });
    await assertProductRegion(admin, productId);
    const originCountryCode =
      body.originCountryCode === null || body.originCountryCode === ""
        ? null
        : String(body.originCountryCode ?? "").trim().toUpperCase();
    const originBasis =
      body.originBasis === null || body.originBasis === ""
        ? null
        : body.originBasis === "SELLER_DECLARED" || body.originBasis === "VERIFIED"
          ? body.originBasis
          : null;
    if (originCountryCode && !originBasis) {
      return NextResponse.json({ error: "Choose SELLER_DECLARED or VERIFIED.", code: "validation_error" }, { status: 400 });
    }
    const product = await updateProductOrigin(admin, {
      productId,
      originCountryCode,
      originBasis,
      originNote: typeof body.originNote === "string" ? body.originNote : null
    });
    return NextResponse.json(jsonSafe(product));
  } catch (error) {
    return jsonError(error);
  }
}
