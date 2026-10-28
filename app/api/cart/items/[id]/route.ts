import { NextResponse } from "next/server";
import { cartTotals, deleteCartItem, updateCartItem } from "@/lib/services/core/cart.service";
import { assertSameOrigin, jsonError, readJson, requireNumber, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const quantity = requireNumber(body.quantity, "Quantity", 0, 10);
    const savedForLater = typeof body.savedForLater === "boolean" ? body.savedForLater : undefined;
    const cart = await updateCartItem({ userId: user.id, itemId: params.id, quantity, savedForLater });
    return NextResponse.json(jsonSafe({ ...cart, totals: cartTotals(cart) }));
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const cart = await deleteCartItem({ userId: user.id, itemId: params.id });
    return NextResponse.json(jsonSafe({ ...cart, totals: cartTotals(cart) }));
  } catch (error) {
    return jsonError(error);
  }
}
