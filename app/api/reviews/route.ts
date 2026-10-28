import { NextResponse } from "next/server";
import { createReview } from "@/lib/services/core/account.service";
import { assertSameOrigin, jsonError, readJson, requireNumber, requireString, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const review = await createReview(user.id, {
      orderId: requireString(body.orderId, "Order", 100),
      productId: requireString(body.productId, "Product", 100),
      rating: requireNumber(body.rating, "Rating", 1, 5),
      title: requireString(body.title, "Title", 120),
      body: requireString(body.body, "Review", 2000)
    });
    return NextResponse.json(jsonSafe(review), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
