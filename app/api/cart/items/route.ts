import { NextResponse } from "next/server";
import { addCartItem, cartTotals } from "@/lib/services/core/cart.service";
import { assertSameOrigin, jsonError, readJson, requireNumber, requireString, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { prisma } from "@/lib/prisma";
import {
  assertVerticalAccess,
  previewAuthorizationForRequest
} from "@/lib/services/core/vertical-activation.service";

export const dynamic = "force-dynamic";

/**
 * Adding a new item is a forward commitment and is gated by Shop activation.
 *
 * Cart-add policy while the effective state is DISABLED or PREVIEW:
 *  - the public (and an unauthorized signed-in customer) receives 409
 *    `vertical_unavailable` and no cart row is written;
 *  - an authorized Control Center preview user may add items during PREVIEW,
 *    because PREVIEW exists to exercise the real journey;
 *  - GET /api/cart, PATCH/DELETE on existing items, order history, support,
 *    returns and refunds remain available. This route is the only cart
 *    enforcement point; it never deletes or rewrites an existing cart.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const productId = requireString(body.productId, "Product", 100);
    const variantId = typeof body.variantId === "string" && body.variantId ? body.variantId : null;
    const quantity = requireNumber(body.quantity ?? 1, "Quantity", 1, 10);

    // Read only the market needed by the resolver; no product field is returned.
    const target = await prisma.product
      .findUnique({ where: { id: productId }, select: { countryCode: true } })
      .catch(() => null);
    const { previewAuthorized } = await previewAuthorizationForRequest();
    await assertVerticalAccess("shop", {
      countryCode: target?.countryCode ?? "NG",
      previewAuthorized,
      statusCode: 409,
      message:
        "Shop is not accepting new cart additions in this market right now. Your cart, existing orders, receipts and support remain available."
    });

    const cart = await addCartItem({ userId: user.id, productId, variantId, quantity });
    return NextResponse.json(jsonSafe({ ...cart, totals: cartTotals(cart) }), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
