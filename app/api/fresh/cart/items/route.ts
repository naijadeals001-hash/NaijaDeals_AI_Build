import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";
import { addFreshItem } from "@/lib/services/fresh/cart";

export const dynamic = "force-dynamic";

/** Add produce to the signed-in account's basket. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const listingId = String(body.listingId ?? "");
    if (!listingId) throw new ApiError(400, "listing_required", "listingId is required.");
    const basket = await addFreshItem(user.id, listingId, Number(body.quantity ?? 1));
    return NextResponse.json(jsonSafe(basket), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
