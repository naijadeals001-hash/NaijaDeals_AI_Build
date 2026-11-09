import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";
import { createFreshOrder, listCustomerOrders, type CheckoutLine } from "@/lib/services/fresh/orders";
import { clearFreshFarmBasket } from "@/lib/services/fresh/cart";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(jsonSafe(await listCustomerOrders(user.id)));
  } catch (error) {
    return jsonError(error);
  }
}

/** Checkout of one farm's basket lines. One order per farm. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const farmId = String(body.farmId ?? "");
    if (!farmId) throw new ApiError(400, "farm_required", "farmId is required.");
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) throw new ApiError(400, "empty_order", "Add at least one item.");
    const orderKind = body.orderKind === "business" ? "business" : "customer";
    const order = await createFreshOrder({
      customerId: user.id,
      farmId,
      orderKind,
      lines: items.map((item): CheckoutLine => {
        const row = item as Record<string, unknown>;
        return { listingId: String(row.listingId ?? ""), quantity: Number(row.quantity ?? 0) };
      }),
      deliveryAddress: String(body.deliveryAddress ?? ""),
      contactName: String(body.contactName ?? ""),
      contactPhone: String(body.contactPhone ?? ""),
      notes: typeof body.notes === "string" ? body.notes : undefined
    });
    await clearFreshFarmBasket(user.id, farmId).catch((error) => {
      console.error("fresh_basket_clear_failed", String(error).slice(0, 120));
    });
    return NextResponse.json(jsonSafe(order), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
