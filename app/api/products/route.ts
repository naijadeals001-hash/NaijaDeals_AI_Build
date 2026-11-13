import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  availableQuantity,
  CatalogQueryError,
  isFixtureListing,
  parseCatalogQuery,
  queryCatalogProducts,
  ratingSummary,
  saleModesFor
} from "@/lib/services/core/catalog.service";
import { jsonSafe } from "@/lib/services/core/serialize";
import { searchProductIds } from "@/lib/infra/catalogue-index";
import { isSearchConfigured } from "@/lib/infra/search";
import { getSessionUser } from "@/lib/auth/session";
import { jsonError } from "@/lib/auth/guard";
import {
  assertVerticalAccess,
  canPreviewVertical
} from "@/lib/services/core/vertical-activation.service";

export const dynamic = "force-dynamic";

/**
 * Public catalogue/search endpoint.
 *
 * Paginated callers (`page` or `pageSize` present) receive
 * `{ items, total, page, pageSize, totalPages, hasMore, sort, query }`.
 * Legacy callers that omit both still receive the historical JSON array, with
 * pagination facts in `X-Total-Count` / `X-Page` / `X-Page-Size` headers, so
 * existing marketplace scripts keep working.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  let parsed: ReturnType<typeof parseCatalogQuery>;
  try {
    parsed = parseCatalogQuery(searchParams);
  } catch (error) {
    if (error instanceof CatalogQueryError) {
      return NextResponse.json({ error: error.message, code: error.code, field: error.field }, { status: 400 });
    }
    throw error;
  }

  // Activation is checked before any product row is read. A DISABLED Shop is a
  // 404 with a stable code (not an empty catalogue that looks like "no stock");
  // PREVIEW is reachable only by an authenticated Control Center user.
  const sessionUser = await getSessionUser().catch(() => null);
  const previewAuthorized = canPreviewVertical(sessionUser);
  try {
    await assertVerticalAccess("shop", {
      countryCode: parsed.query.country ?? "NG",
      previewAuthorized
    });
  } catch (error) {
    return jsonError(error);
  }

  // Meilisearch answers typo-tolerant queries when it is configured and
  // populated. Anything that makes the index untrustworthy (engine down,
  // empty index) returns null and the substring scan inside the service runs
  // instead, so search is never less available than it was before the engine
  // existed.
  const rankedIds =
    parsed.query.q && isSearchConfigured()
      ? await searchProductIds(parsed.query.q, { limit: 200 })
      : null;

  const result = await queryCatalogProducts(parsed.query, { rankedIds, previewAuthorized });
  const saleModes = await saleModesFor(result.items.map((product) => product.id));
  const items = result.items.map((product) => ({
    ...product,
    isSample: isFixtureListing(product),
    saleMode: saleModes.get(product.id) ?? "escrow",
    available: availableQuantity(product),
    rating: ratingSummary(product.reviews)
  }));

  const headers = {
    "Cache-Control": "no-store",
    "X-Total-Count": String(result.total),
    "X-Page": String(result.page),
    "X-Page-Size": String(result.pageSize ?? result.total),
    "X-Total-Pages": String(result.totalPages)
  };

  if (!parsed.paginated) {
    return NextResponse.json(jsonSafe(items), { headers });
  }

  return NextResponse.json(
    jsonSafe({
      items,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
      hasMore: result.hasMore,
      sort: parsed.query.sort,
      query: parsed.query.q
    }),
    { headers }
  );
}
