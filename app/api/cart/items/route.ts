import { NextResponse } from "next/server";
import { addCartItem, cartTotals } from "@/lib/services/core/cart.service";
import { assertSameOrigin, jsonError, readJson, requireNumber, requireString, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const productId = requireString(body.productId, "Product", 100);
    const variantId = typeof body.variantId === "string" && body.variantId ? body.variantId : null;
    const quantity = requireNumber(body.quantity ?? 1, "Quantity", 1, 10);
    const cart = await addCartItem({ userId: user.id, productId, variantId, quantity });
    return NextResponse.json(jsonSafe({ ...cart, totals: cartTotals(cart) }), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
