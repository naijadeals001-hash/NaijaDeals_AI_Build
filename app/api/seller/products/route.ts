import { NextResponse } from "next/server";
import { createSellerProduct } from "@/lib/services/core/seller.service";
import { assertSameOrigin, jsonError, optionalString, readJson, requireString, requireActiveVendor } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

function parseMoney(value: unknown, field: string): bigint {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value : "";
  if (!/^\d+$/.test(text)) throw new Error(`${field} must be a whole number of kobo.`);
  return BigInt(text);
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireActiveVendor();
    const body = await readJson<Record<string, unknown>>(request);
    const priceKobo = parseMoney(body.priceKobo, "Price");
    const quantity = Number(body.quantity ?? 0);
    if (!Number.isInteger(quantity) || quantity < 0) throw new Error("Stock must be a non-negative integer.");
    const product = await createSellerProduct(user.id, {
      name: requireString(body.name, "Product name", 160),
      description: requireString(body.description, "Description", 4000),
      categoryId: requireString(body.categoryId, "Category", 100),
      priceKobo,
      compareAtKobo: body.compareAtKobo ? parseMoney(body.compareAtKobo, "Compare-at price") : null,
      brand: optionalString(body.brand, 100),
      condition: optionalString(body.condition, 30) ?? "NEW",
      weightGrams: body.weightGrams ? Number(body.weightGrams) : 500,
      imageUrl: requireString(body.imageUrl, "Image", 500),
      quantity,
      lowStockLevel: body.lowStockLevel ? Number(body.lowStockLevel) : 3
    });
    return NextResponse.json(jsonSafe(product), { status: 201 });
  } catch (error) {
    if (error instanceof Error && /kobo|integer/.test(error.message)) {
      return NextResponse.json({ error: error.message, code: "validation_error" }, { status: 400 });
    }
    return jsonError(error);
  }
}
