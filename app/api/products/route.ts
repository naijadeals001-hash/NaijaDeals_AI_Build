import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { availableQuantity, isFixtureListing, listProducts, ratingSummary } from "@/lib/services/core/catalog.service";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q")?.trim().toLowerCase();
  const category = searchParams.get("category")?.trim().toLowerCase();
  const market = searchParams.get("market")?.trim().toLowerCase();
  const price = searchParams.get("price");
  const sort = searchParams.get("sort");
  const vendor = searchParams.get("vendor");

  let products = await listProducts();

  if (query) {
    products = products.filter((product) =>
      [product.name, product.description, product.brand, product.vendor.name, product.vendor.market, product.category.name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }
  if (category && category !== "all") {
    products = products.filter(
      (product) => product.category.slug.toLowerCase() === category || product.category.name.toLowerCase() === category
    );
  }
  if (market && market !== "all") {
    products = products.filter((product) => product.vendor.market.toLowerCase().includes(market));
  }
  if (vendor) products = products.filter((product) => product.vendor.slug === vendor);
  if (price === "under-50k") products = products.filter((product) => product.priceKobo < BigInt(5000000));
  if (price === "50k-200k") products = products.filter((product) => product.priceKobo >= BigInt(5000000) && product.priceKobo < BigInt(20000000));
  if (price === "200k-plus") products = products.filter((product) => product.priceKobo >= BigInt(20000000));

  if (sort === "price-asc") products = [...products].sort((a, b) => Number(a.priceKobo - b.priceKobo));
  if (sort === "price-desc") products = [...products].sort((a, b) => Number(b.priceKobo - a.priceKobo));
  if (sort === "trust") products = [...products].sort((a, b) => b.vendor.trustScore - a.vendor.trustScore);

  const payload = products.map((product) => ({
    ...product,
    isSample: isFixtureListing(product),
    available: availableQuantity(product),
    rating: ratingSummary(product.reviews)
  }));

  return NextResponse.json(jsonSafe(payload));
}
