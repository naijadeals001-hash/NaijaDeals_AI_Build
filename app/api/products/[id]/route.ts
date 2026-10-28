import { NextResponse } from "next/server";
import { availableQuantity, getProduct, ratingSummary } from "@/lib/services/core/catalog.service";
import { listReviews } from "@/lib/services/core/account.service";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const product = await getProduct(params.id);
    if (product.status !== "ACTIVE" || product.vendor.status !== "VERIFIED") {
      return NextResponse.json({ error: "This product is not available.", code: "product_unavailable" }, { status: 404 });
    }
    const reviews = await listReviews(product.id);
    return NextResponse.json(
      jsonSafe({
        ...product,
        available: availableQuantity(product),
        rating: ratingSummary(product.reviews),
        reviews
      })
    );
  } catch {
    return NextResponse.json({ error: "Product not found.", code: "not_found" }, { status: 404 });
  }
}
