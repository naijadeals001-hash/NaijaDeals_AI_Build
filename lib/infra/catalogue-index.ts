import {
  isFixtureListing,
  listProducts
} from "@/lib/services/core/catalog.service";
import { availabilityProjection } from "@/lib/services/core/availability";
import { cacheSetJson, cached } from "./cache";
import {
  deleteProducts,
  ensureProductIndex,
  indexDocumentCount,
  indexProducts,
  searchProducts,
  type ProductDocument
} from "./search";

/**
 * Projects the Postgres catalogue into the Meilisearch index.
 *
 * Postgres stays authoritative. The projection excludes the same fixture rows
 * the storefront API excludes, so a search hit can never surface an acceptance
 * fixture as a real listing.
 */

const FIXTURE_NAME = /^(variant fixture|test |upload test|last unit|product test)/i;
const FIXTURE_SLUG = /mw[0-9a-z]{8,}$/i;

type CatalogueRow = Awaited<ReturnType<typeof listProducts>>[number];

function toDocument(product: CatalogueRow): ProductDocument {
  return {
    id: product.id,
    title: product.name,
    description: product.description,
    vendorName: product.vendor.name,
    category: product.category?.name ?? null,
    // Meilisearch stores numbers; kobo values stay integers so no rounding occurs.
    priceKobo: Number(product.priceKobo),
    // One shared projection: variant stock wins and product stock is never
    // added to it. The storefront and search therefore agree on availability.
    inStock: availabilityProjection({ variants: product.variants, stock: product.stock }).available > 0,
    href: `/product/${product.id}`,
    updatedAt: product.updatedAt.toISOString()
  };
}

export function isIndexable(product: CatalogueRow): boolean {
  return !FIXTURE_NAME.test(product.name) && !FIXTURE_SLUG.test(product.slug) && !isFixtureListing(product);
}

export type ReindexResult = {
  indexed: number;
  skipped: number;
  order: number;
};

/** Rebuilds the index from the database. Safe to run while the site is live. */
export async function reindexCatalogue(): Promise<ReindexResult> {
  const ready = await ensureProductIndex();
  if (!ready) throw new Error("search_index_unavailable");

  const products = await listProducts();
  const documents = products.filter(isIndexable).map(toDocument);

  const batchSize = 500;
  let indexed = 0;
  for (let offset = 0; offset < documents.length; offset += batchSize) {
    const batch = documents.slice(offset, offset + batchSize);
    const ok = await indexProducts(batch);
    if (!ok) throw new Error("search_index_write_failed");
    indexed += batch.length;
  }

  await cacheSetJson("catalogue:index:stats", { indexed, at: new Date().toISOString() }, 300);

  return { indexed, skipped: products.length - documents.length, order: 1 };
}

/** Removes a product from the index after it is archived or deleted. */
export async function removeFromIndex(productId: string): Promise<boolean> {
  return deleteProducts([productId]);
}

/**
 * Returns product ids in relevance order, or `null` when the index cannot be
 * trusted (not configured, unreachable, or empty) so the caller falls back to
 * the Postgres scan.
 *
 * Only the id list is cached, never price or stock: those are read from the
 * database on every request, so a short TTL cannot serve a stale price. A
 * product deleted during the TTL simply drops out downstream, because the
 * caller filters ids against the live product rows.
 */
export async function searchProductIds(
  query: string,
  options: { limit?: number; filter?: string } = {}
): Promise<string[] | null> {
  const normalised = query.trim().toLowerCase();
  if (!normalised) return null;

  const cacheKey = `search:ids:${options.limit ?? 200}:${options.filter ?? "all"}:${normalised}`;
  return cached<string[]>(cacheKey, 20, async () => {
    const result = await searchProducts(query, options);
    if (!result) throw new SearchUnavailable();

    // An empty index produces an empty hit list for every query; that is a
    // configuration problem, not a genuine "no results" answer.
    const count = await indexDocumentCount();
    if (count === null || count === 0) throw new SearchUnavailable();

    return result.hits.map((hit) => hit.id);
  }).catch(() => null);
}

/** Thrown so the read-through helper does not cache an unavailable index. */
class SearchUnavailable extends Error {}
