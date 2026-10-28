import { NextResponse } from "next/server";
import { cartTotals, getOrCreateActiveCart } from "@/lib/services/core/cart.service";
import { jsonError, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const cart = await getOrCreateActiveCart(user.id);
    return NextResponse.json(jsonSafe({ ...cart, totals: cartTotals(cart) }));
  } catch (error) {
    return jsonError(error);
  }
}
