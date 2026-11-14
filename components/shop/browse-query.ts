/**
 * URL state for the shop discovery grid.
 *
 * Filters live in the address bar so a search survives pagination, department
 * navigation, refresh and sharing. Invalid values are sanitised to safe
 * defaults here; the server still rejects bad API parameters independently.
 */

export const BROWSE_PAGE_SIZE = 24;

export const BROWSE_SORTS = ["featured", "newest", "price-asc", "price-desc", "name"] as const;
export type BrowseSort = (typeof BROWSE_SORTS)[number];

export type BrowseFilters = {
  q: string;
  sort: BrowseSort;
  /** Whole Naira amount, digits only. Empty means no cap. */
  maxPrice: string;
  page: number;
};

const MAX_QUERY_LENGTH = 120;
const MAX_PAGE = 10_000;

export function readBrowseFilters(
  params: URLSearchParams,
  options: { fallbackQuery?: string; defaultSort?: BrowseSort } = {}
): BrowseFilters {
  const requestedSort = params.get("sort");
  const sort = BROWSE_SORTS.includes(requestedSort as BrowseSort)
    ? (requestedSort as BrowseSort)
    : options.defaultSort ?? "featured";

  const q = (params.get("q") ?? options.fallbackQuery ?? "").trim().slice(0, MAX_QUERY_LENGTH);
  const maxPrice = (params.get("maxPrice") ?? "").replace(/\D/g, "").slice(0, 12);

  const pageRaw = params.get("page") ?? "";
  const parsedPage = /^\d+$/.test(pageRaw) ? Number(pageRaw) : 1;
  const page = Number.isSafeInteger(parsedPage) ? Math.min(Math.max(parsedPage, 1), MAX_PAGE) : 1;

  return { q, sort, maxPrice, page };
}

export function browseParams(filters: BrowseFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.maxPrice) params.set("maxPrice", filters.maxPrice);
  if (filters.sort !== "featured") params.set("sort", filters.sort);
  if (filters.page > 1) params.set("page", String(filters.page));
  return params;
}

export function browseHref(pathname: string, filters: BrowseFilters, overrides: Partial<BrowseFilters> = {}): string {
  const params = browseParams({ ...filters, ...overrides });
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** Parameters for the paginated catalogue API. */
export function browseApiParams(
  filters: BrowseFilters,
  categorySlug?: string,
  market?: { country?: string; city?: string }
): Record<string, string | undefined> {
  return {
    q: filters.q || undefined,
    category: categorySlug || undefined,
    sort: filters.sort,
    maxPrice: filters.maxPrice || undefined,
    country: market?.country || undefined,
    city: market?.city || undefined,
    page: String(filters.page),
    pageSize: String(BROWSE_PAGE_SIZE)
  };
}
