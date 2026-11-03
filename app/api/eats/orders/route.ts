import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createFoodOrder, listFoodOrdersForCustomer } from "@/lib/services/core/eats-order.service";
import { ApiError, assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(jsonSafe(await listFoodOrdersForCustomer(user.id)));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) throw new ApiError(400, "empty_order", "Add at least one item.");
    const order = await createFoodOrder({
      customerId: user.id,
      restaurantId: String(body.restaurantId ?? ""),
      items: items.map((item) => {
        const row = item as Record<string, unknown>;
        return {
          menuItemId: String(row.menuItemId ?? ""),
          quantity: Number(row.quantity ?? 1),
          notes: typeof row.notes === "string" ? row.notes : undefined
        };
      }),
      deliveryAddress: String(body.deliveryAddress ?? ""),
      contactName: String(body.contactName ?? ""),
      contactPhone: String(body.contactPhone ?? ""),
      notes: typeof body.notes === "string" ? body.notes : undefined
    });
    return NextResponse.json(jsonSafe(order), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
