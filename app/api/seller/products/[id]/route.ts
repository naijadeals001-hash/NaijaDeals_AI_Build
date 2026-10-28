import { NextResponse } from "next/server";
import { updateSellerProduct } from "@/lib/services/core/seller.service";
import { assertSameOrigin, jsonError, optionalString, readJson, requireVendor } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireVendor();
    const body = await readJson<Record<string, unknown>>(request);
    let priceKobo: bigint | undefined;
    if (body.priceKobo !== undefined) {
      const text = typeof body.priceKobo === "number" ? String(body.priceKobo) : String(body.priceKobo);
      if (!/^\d+$/.test(text)) throw new Error("Price must be a whole number of kobo.");
      priceKobo = BigInt(text);
    }
    const status = body.status === "DRAFT" || body.status === "ACTIVE" || body.status === "ARCHIVED" ? body.status : undefined;
    const product = await updateSellerProduct(user.id, params.id, {
      name: optionalString(body.name, 160) ?? undefined,
      description: optionalString(body.description, 4000) ?? undefined,
      priceKobo,
      status,
      quantity: body.quantity === undefined ? undefined : Number(body.quantity),
      lowStockLevel: body.lowStockLevel === undefined ? undefined : Number(body.lowStockLevel)
    });
    return NextResponse.json(jsonSafe(product));
  } catch (error) {
    if (error instanceof Error && /kobo|integer/.test(error.message)) {
      return NextResponse.json({ error: error.message, code: "validation_error" }, { status: 400 });
    }
    return jsonError(error);
  }
}
