import { NextResponse } from "next/server";
import { listSavedItems, toggleSavedItem } from "@/lib/services/core/account.service";
import { assertSameOrigin, jsonError, readJson, requireString, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

/**
 * Saved items are a customer read, not an admin projection. The optional
 * `country`/`city` query parameters select the market the account page is
 * showing; the service validates them and applies the same public eligibility
 * rules as the catalogue and checkout. Unavailable items remain in the list with
 * a truthful reason instead of leaking raw product/variant rows.
 */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const items = await listSavedItems(user.id, {
      countryCode: url.searchParams.get("country"),
      cityCode: url.searchParams.get("city")
    });
    return NextResponse.json(jsonSafe(items), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const result = await toggleSavedItem(user.id, requireString(body.productId, "Product", 100));
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
