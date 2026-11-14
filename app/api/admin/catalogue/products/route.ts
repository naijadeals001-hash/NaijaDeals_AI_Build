import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import {
  archiveProduct,
  createProduct,
  publishProduct,
  unpublishProduct,
  updateProduct,
  validateProduct,
  type CatalogueImageInput
} from "@/lib/services/core/catalogue-admin.service";

export const dynamic = "force-dynamic";

function readImages(body: Record<string, unknown>): CatalogueImageInput[] | undefined {
  if (!Array.isArray(body.images)) return undefined;
  return body.images.map((entry) =>
    entry && typeof entry === "object" ? (entry as CatalogueImageInput) : { url: entry }
  );
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("products:moderate");
    const body = await readJson<Record<string, unknown>>(request);
    const product = await createProduct({
      actor: admin,
      name: String(body.name ?? ""),
      slug: typeof body.slug === "string" ? body.slug : undefined,
      description: String(body.description ?? ""),
      priceKobo: body.priceKobo,
      currency: typeof body.currency === "string" ? body.currency : undefined,
      countryCode: typeof body.countryCode === "string" ? body.countryCode : undefined,
      categoryId: String(body.categoryId ?? ""),
      attributes: body.attributes,
      quantity: body.quantity,
      lowStockLevel: body.lowStockLevel,
      variants: Object.prototype.hasOwnProperty.call(body, "variants") ? body.variants : undefined,
      images: readImages(body),
      imageUrl: typeof body.imageUrl === "string" ? body.imageUrl : undefined,
      imageAlt: typeof body.imageAlt === "string" ? body.imageAlt : undefined,
      isDemo: Boolean(body.isDemo)
    });
    return NextResponse.json(jsonSafe(product), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("products:moderate");
    const body = await readJson<Record<string, unknown>>(request);
    const id = String(body.id ?? "");
    const action = typeof body.action === "string" ? body.action : "";
    if (action === "validate") return NextResponse.json(jsonSafe(await validateProduct(admin, id)));
    if (action === "publish") return NextResponse.json(jsonSafe(await publishProduct({ actor: admin, id })));
    if (action === "unpublish") return NextResponse.json(jsonSafe(await unpublishProduct({ actor: admin, id })));
    if (action === "archive") return NextResponse.json(jsonSafe(await archiveProduct({ actor: admin, id })));
    if (action) return NextResponse.json({ error: "Unsupported action.", code: "invalid_action" }, { status: 400 });
    const product = await updateProduct({
      actor: admin,
      id,
      name: typeof body.name === "string" ? body.name : undefined,
      slug: typeof body.slug === "string" ? body.slug : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
      priceKobo: body.priceKobo,
      currency: typeof body.currency === "string" ? body.currency : undefined,
      countryCode: typeof body.countryCode === "string" ? body.countryCode : undefined,
      categoryId: typeof body.categoryId === "string" ? body.categoryId : undefined,
      attributes: body.attributes,
      quantity: body.quantity,
      lowStockLevel: body.lowStockLevel,
      variants: Object.prototype.hasOwnProperty.call(body, "variants") ? body.variants : undefined,
      images: readImages(body),
      imageUrl: typeof body.imageUrl === "string" ? body.imageUrl : undefined,
      imageAlt: typeof body.imageAlt === "string" ? body.imageAlt : undefined,
      isDemo: typeof body.isDemo === "boolean" ? body.isDemo : undefined
    });
    return NextResponse.json(jsonSafe(product));
  } catch (error) {
    return jsonError(error);
  }
}
