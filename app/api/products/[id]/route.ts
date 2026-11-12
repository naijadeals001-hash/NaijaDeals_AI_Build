import { NextResponse } from "next/server";
import { getPublicProductDetail } from "@/lib/services/core/catalog.service";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const product = await getPublicProductDetail(params.id);
    if (!product) {
      return NextResponse.json({ error: "This product is not available.", code: "product_unavailable" }, { status: 404 });
    }
    return NextResponse.json(jsonSafe(product), {
      headers: {
        // A cached detail response must never outlive an image, price or
        // description correction made by the seller.
        "Cache-Control": "no-store"
      }
    });
  } catch {
    return NextResponse.json({ error: "Product not found.", code: "not_found" }, { status: 404 });
  }
}
