import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";
import { addToBasket } from "@/lib/services/eats/cart";

export const dynamic = "force-dynamic";

/** Add a dish to the signed-in account's basket. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const menuItemId = String(body.menuItemId ?? "");
    if (!menuItemId) throw new ApiError(400, "item_required", "menuItemId is required.");
    const quantity = Number(body.quantity ?? 1);
    const notes = typeof body.notes === "string" ? body.notes.slice(0, 300) : undefined;
    return NextResponse.json(jsonSafe(await addToBasket(user.id, menuItemId, quantity, notes)), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
