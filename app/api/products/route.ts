import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { availableQuantity, isFixtureListing, listProducts, ratingSummary, saleModesFor } from "@/lib/services/core/catalog.service";
import { jsonSafe } from "@/lib/services/core/serialize";
import { searchProductIds } from "@/lib/infra/catalogue-index";
import { isSearchConfigured } from "@/lib/infra/search";

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
    // Meilisearch answers typo-tolerant queries when it is configured and
    // populated. Anything that makes the index untrustworthy (engine down,
    // empty index) returns null and the substring scan below runs instead, so
    // search is never less available than it was before the engine existed.
    const ranked = isSearchConfigured() ? await searchProductIds(query, { limit: 200 }) : null;
    if (ranked) {
      const rank = new Map(ranked.map((id, index) => [id, index]));
      products = products
        .filter((product) => rank.has(product.id))
        .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
    } else {
      products = products.filter((product) =>
        [product.name, product.description, product.brand, product.vendor.name, product.vendor.market, product.category.name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query)
      );
    }
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

  // Acceptance-suite rows ("Test checkout …", "Last Unit …") are database rows,
  // never storefront products, so they are stripped at the API boundary too.
  const FIXTURE = /^(variant fixture|test |upload test|last unit|product test)/i;
  products = products.filter((product) => !FIXTURE.test(product.name) && !/mw[0-9a-z]{8,}$/i.test(product.slug));

  const saleModes = await saleModesFor(products.map((product) => product.id));
  const payload = products.map((product) => ({
    ...product,
    isSample: isFixtureListing(product),
    saleMode: saleModes.get(product.id) ?? "escrow",
    available: availableQuantity(product),
    rating: ratingSummary(product.reviews)
  }));

  return NextResponse.json(jsonSafe(payload));
}
