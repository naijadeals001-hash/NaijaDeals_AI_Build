import { NextResponse } from "next/server";
import { updateSellerProduct } from "@/lib/services/core/seller.service";
import { ApiError, assertSameOrigin, jsonError, optionalString, readJson, requireActiveVendor } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { requestProductSync } from "@/lib/infra/search-sync";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireActiveVendor();
    const body = await readJson<Record<string, unknown>>(request);
    let priceKobo: bigint | undefined;
    if (body.priceKobo !== undefined) {
      const text = typeof body.priceKobo === "number" ? String(body.priceKobo) : String(body.priceKobo);
      if (!/^\d+$/.test(text)) throw new Error("Price must be a whole number of kobo.");
      priceKobo = BigInt(text);
    }
    if (body.status === "ACTIVE") {
      throw new ApiError(403, "admin_publication_required", "Only the Control Center can publish or reactivate a listing.");
    }
    const status = body.status === "DRAFT" || body.status === "ARCHIVED" ? body.status : undefined;
    const product = await updateSellerProduct(user.id, params.id, {
      name: optionalString(body.name, 160) ?? undefined,
      description: optionalString(body.description, 4000) ?? undefined,
      priceKobo,
      status,
      quantity: body.quantity === undefined ? undefined : Number(body.quantity),
      lowStockLevel: body.lowStockLevel === undefined ? undefined : Number(body.lowStockLevel),
      variants: Object.prototype.hasOwnProperty.call(body, "variants") ? body.variants : undefined,
      categoryId: optionalString(body.categoryId, 100) ?? undefined,
      attributes: body.attributes,
      imageUrl: typeof body.imageUrl === "string" ? body.imageUrl : undefined,
      imageAlt: typeof body.imageAlt === "string" ? body.imageAlt : undefined,
      images: Array.isArray(body.images) ? (body.images as Array<Record<string, unknown>>) : undefined
    });
    await requestProductSync(product.id);
    return NextResponse.json(jsonSafe(product));
  } catch (error) {
    if (error instanceof Error && /kobo|integer/.test(error.message)) {
      return NextResponse.json({ error: error.message, code: "validation_error" }, { status: 400 });
    }
    return jsonError(error);
  }
}
