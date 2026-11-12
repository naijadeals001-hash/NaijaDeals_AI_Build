import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { COUNTRIES } from "@/lib/config/commerce";
import { listReviews } from "./account.service";

const productInclude = {
  category: true,
  vendor: { select: { id: true, name: true, slug: true, market: true, status: true, trustScore: true, pickupPhone: true } },
  // `sortOrder` alone is not a total order: seeded galleries often share a
  // sortOrder, and Postgres may return those rows in any order. A stable
  // secondary key keeps the detail gallery on the same image every request.
  images: { orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }] },
  stock: true,
  variants: { where: { isActive: true }, orderBy: { name: "asc" as const } },
  reviews: { where: { status: "APPROVED" as const }, select: { rating: true } }
};

export type CatalogProduct = Awaited<ReturnType<typeof listProducts>>[number];

/**
 * Every publicly listable product. Sample/fixture inventory is never part of
 * public discovery: the database `isSample` column is the authority, so a demo
 * row cannot leak into the storefront, search or sitemap by being unflagged in
 * an older code path.
 */
export async function listProducts() {
  return prisma.product.findMany({
    where: { status: "ACTIVE", isSample: false, vendor: { status: "VERIFIED" } },
    include: productInclude,
    orderBy: { createdAt: "desc" }
  });
}

export async function getProduct(idOrSlug: string) {
  const key = idOrSlug.trim();
  return prisma.product.findFirstOrThrow({
    // Slugs are canonical lowercase, but shared/copied links can arrive
    // uppercased. Compare the slug case-insensitively while keeping id matches
    // exact so a cuid can never be confused with another row's slug.
    where: { OR: [{ id: key }, { slug: { equals: key, mode: "insensitive" } }] },
    include: productInclude
  });
}

/**
 * Everything the public product page and its JSON endpoint expose.
 *
 * The product row, its reviews, sale mode and calculated availability are
 * loaded together so both entry points (server render and client retry) show
 * the same images, description, price and stock. Returns `null` for products
 * that are not publicly purchasable rather than leaking a draft/suspended row.
 */
export async function getPublicProductDetail(idOrSlug: string) {
  const product = await getProduct(idOrSlug);
  if (product.status !== "ACTIVE" || product.vendor.status !== "VERIFIED") return null;

  const [reviews, saleMode] = await Promise.all([listReviews(product.id), saleModeFor(product.id)]);
  return {
    ...product,
    isSample: isFixtureListing(product),
    saleMode,
    available: availableQuantity(product),
    rating: ratingSummary(product.reviews),
    reviews
  };
}

/**
 * Products from the same department for the detail page's "More in …" rail.
 * Discovery visibility rules and the trust ordering are shared with the
 * catalogue endpoint; the current product is always excluded.
 */
export async function listRelatedProducts(categorySlug: string, excludeId: string, limit = 4) {
  const page = await queryCatalogProducts({
    q: null,
    category: categorySlug,
    market: null,
    country: null,
    vendor: null,
    price: null,
    maxPriceKobo: null,
    sort: "trust",
    page: 1,
    pageSize: null
  });
  return page.items.filter((product) => product.id !== excludeId).slice(0, limit);
}

/** Acceptance-suite categories are database rows, never public departments. */
const CATEGORY_FIXTURE = /^(refund cat|test category|fixture category)\b|^ri-cat-/i;

export async function getCategories() {
  const categories = await prisma.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
  return categories.filter((category) => !CATEGORY_FIXTURE.test(category.name) && !CATEGORY_FIXTURE.test(category.slug));
}

/**
 * Fixture listings are seeded demo rows. The database column is authoritative;
 * the vendor/image check is a fallback for a running dev server whose generated
 * Prisma client predates the column.
 */
const FIXTURE_VENDOR_SLUGS = new Set(["ikeja-mobile-hub", "yaba-home-living"]);

export function isFixtureListing(product: CatalogProduct): boolean {
  const flag = (product as { isSample?: boolean }).isSample;
  if (typeof flag === "boolean") return flag;
  return (
    FIXTURE_VENDOR_SLUGS.has(product.vendor.slug) &&
    product.images.some((image) => image.url.startsWith("/products/"))
  );
}

export function ratingSummary(reviews: Array<{ rating: number }>) {
  if (reviews.length === 0) return { average: null, count: 0 };
  const total = reviews.reduce((sum, review) => sum + review.rating, 0);
  return { average: Math.round((total / reviews.length) * 10) / 10, count: reviews.length };
}

export function availableQuantity(product: {
  stock: { quantity: number; reserved: number } | null;
  variants: Array<{ stock: number; reserved: number }>;
}) {
  if (product.variants.length > 0) {
    return product.variants.reduce((total, variant) => total + Math.max(variant.stock - variant.reserved, 0), 0);
  }
  return product.stock ? Math.max(product.stock.quantity - product.stock.reserved, 0) : 0;
}


export const CATALOG_SORTS = ["featured", "newest", "price-asc", "price-desc", "trust", "name"] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

export const CATALOG_PRICE_BUCKETS = ["under-50k", "50k-200k", "200k-plus"] as const;
export type CatalogPriceBucket = (typeof CATALOG_PRICE_BUCKETS)[number];

/**
 * A validated public-catalogue query. Every value here has already passed the
 * allowlists below; callers must not construct it from unvalidated input.
 */
export type CatalogQuery = {
  q: string | null;
  category: string | null;
  market: string | null;
  country: string | null;
  vendor: string | null;
  price: CatalogPriceBucket | null;
  maxPriceKobo: bigint | null;
  sort: CatalogSort;
  page: number;
  /** `null` means the caller asked for the legacy unpaginated array. */
  pageSize: number | null;
};

export type CatalogPage = {
  items: CatalogProduct[];
  total: number;
  page: number;
  pageSize: number | null;
  totalPages: number;
  hasMore: boolean;
};

/** Safe, field-specific rejection for invalid discovery parameters. */
export class CatalogQueryError extends Error {
  readonly code = "invalid_query";
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "CatalogQueryError";
    this.field = field;
  }
}

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_PAGE = 10_000;
const MAX_PAGE_SIZE = 60;
const DEFAULT_PAGE_SIZE = 24;
const MAX_SEARCH_LENGTH = 120;

/** Acceptance fixtures are database rows but never public listings. */
const STORE_FIXTURE =
  /^(variant fixture|test |upload test|last unit|product test|refund product|refund vendor)\b|-mw[0-9a-z]{8,}$|^ri-(prod|vendor)-/i;

function isStorefrontVisible(product: CatalogProduct) {
  return !STORE_FIXTURE.test(product.name) && !STORE_FIXTURE.test(product.slug);
}

function readText(params: URLSearchParams, field: string, maxLength: number): string | null {
  if (!params.has(field)) return null;
  const value = (params.get(field) ?? "").trim();
  if (!value) return null;
  if (value.length > maxLength) throw new CatalogQueryError(field, `${field} is too long.`);
  if (CONTROL_CHARACTERS.test(value)) throw new CatalogQueryError(field, `${field} contains invalid characters.`);
  return value;
}

function readPositiveInteger(
  params: URLSearchParams,
  field: string,
  options: { min: number; max: number }
): number | null {
  const raw = params.get(field);
  if (raw === null) return null;
  const value = raw.trim();
  if (!value) return null;
  if (!/^\d+$/.test(value)) throw new CatalogQueryError(field, `${field} must be a whole number.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < options.min || parsed > options.max) {
    throw new CatalogQueryError(field, `${field} must be between ${options.min} and ${options.max}.`);
  }
  return parsed;
}

function readSlug(params: URLSearchParams, field: string): string | null {
  const value = readText(params, field, 80)?.toLowerCase() ?? null;
  if (value && !SLUG_PATTERN.test(value)) {
    throw new CatalogQueryError(field, `${field} must be a lowercase slug.`);
  }
  return value;
}

/**
 * Parse and validate discovery parameters before any database work.
 *
 * Sort, price bucket, page, page-size, country and slug formats are closed
 * allowlists: an unsupported value is a 400, not a silently ignored filter.
 * A well-formed but unknown category/vendor slug is a legitimate empty result
 * (typo state), not an error.
 */
export function parseCatalogQuery(params: URLSearchParams): { query: CatalogQuery; paginated: boolean } {
  const q = readText(params, "q", MAX_SEARCH_LENGTH);

  const sortValue = (readText(params, "sort", 32) ?? "featured").toLowerCase();
  if (!CATALOG_SORTS.includes(sortValue as CatalogSort)) {
    throw new CatalogQueryError("sort", `Sort must be one of: ${CATALOG_SORTS.join(", ")}.`);
  }

  const priceValue = (readText(params, "price", 32) ?? "").toLowerCase();
  if (priceValue && !CATALOG_PRICE_BUCKETS.includes(priceValue as CatalogPriceBucket)) {
    throw new CatalogQueryError("price", `Price must be one of: ${CATALOG_PRICE_BUCKETS.join(", ")}.`);
  }

  const countryRaw = readText(params, "country", 2);
  const country = countryRaw ? countryRaw.toUpperCase() : null;
  if (country && !COUNTRIES[country]) {
    throw new CatalogQueryError("country", "country must be an enabled two-letter country code.");
  }

  const page = readPositiveInteger(params, "page", { min: 1, max: MAX_PAGE }) ?? 1;
  const pageSize = readPositiveInteger(params, "pageSize", { min: 1, max: MAX_PAGE_SIZE });
  const paginated = params.has("page") || params.has("pageSize");

  let maxPriceKobo: bigint | null = null;
  const maxPriceRaw = params.get("maxPrice");
  if (maxPriceRaw !== null && maxPriceRaw.trim() !== "") {
    const value = maxPriceRaw.trim();
    if (!/^\d{1,12}$/.test(value)) {
      throw new CatalogQueryError("maxPrice", "maxPrice must be a positive whole Naira amount.");
    }
    const naira = BigInt(value);
    if (naira <= BigInt(0)) {
      throw new CatalogQueryError("maxPrice", "maxPrice must be greater than zero.");
    }
    maxPriceKobo = naira * BigInt(100);
  }

  // `all` is the historical "no filter" sentinel used by the legacy search
  // form; keep it working instead of treating it as a department name.
  const category = readSlug(params, "category");
  const market = readText(params, "market", 80);
  const vendor = readSlug(params, "vendor");

  return {
    query: {
      q,
      category: category === "all" ? null : category,
      market: market?.toLowerCase() === "all" ? null : market,
      country,
      vendor: vendor === "all" ? null : vendor,
      price: priceValue ? (priceValue as CatalogPriceBucket) : null,
      maxPriceKobo,
      sort: sortValue as CatalogSort,
      page,
      pageSize: paginated ? pageSize ?? DEFAULT_PAGE_SIZE : null
    },
    paginated
  };
}

function buildWhere(query: CatalogQuery): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {
    status: "ACTIVE",
    isSample: false,
    category: { isActive: true },
    vendor: {
      status: "VERIFIED",
      ...(query.market ? { market: { contains: query.market, mode: "insensitive" as const } } : {}),
      ...(query.vendor ? { slug: query.vendor } : {})
    }
  };

  if (query.category) {
    where.category = {
      isActive: true,
      OR: [
        { slug: query.category },
        { name: { equals: query.category, mode: "insensitive" } }
      ]
    };
  }
  if (query.country) where.countryCode = query.country;

  const priceConditions: Prisma.ProductWhereInput[] = [];
  if (query.price === "under-50k") priceConditions.push({ priceKobo: { lt: BigInt(5_000_000) } });
  if (query.price === "50k-200k") {
    priceConditions.push({ priceKobo: { gte: BigInt(5_000_000), lt: BigInt(20_000_000) } });
  }
  if (query.price === "200k-plus") priceConditions.push({ priceKobo: { gte: BigInt(20_000_000) } });
  if (query.maxPriceKobo !== null) priceConditions.push({ priceKobo: { lte: query.maxPriceKobo } });
  if (priceConditions.length === 1) Object.assign(where, priceConditions[0]);
  if (priceConditions.length > 1) where.AND = priceConditions;

  return where;
}

function orderByFor(sort: CatalogSort): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case "newest":
      return [{ createdAt: "desc" }, { id: "asc" }];
    case "price-asc":
      return [{ priceKobo: "asc" }, { id: "asc" }];
    case "price-desc":
      return [{ priceKobo: "desc" }, { id: "asc" }];
    case "name":
      return [{ name: "asc" }, { id: "asc" }];
    case "trust":
      return [{ vendor: { trustScore: "desc" } }, { id: "asc" }];
    case "featured":
    default:
      return [{ vendor: { trustScore: "desc" } }, { createdAt: "desc" }, { id: "asc" }];
  }
}

function matchesText(product: CatalogProduct, needle: string) {
  return [product.name, product.description, product.brand, product.vendor.name, product.vendor.market, product.category.name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

/**
 * Read a page of the public catalogue.
 *
 * Fixture rows are stripped in JavaScript as well as by the `isSample` column
 * because acceptance scripts have historically created ordinary-looking rows.
 * Pagination therefore runs after that visibility filter so page counts stay
 * truthful; the catalogue is loaded in one query today (as it was before this
 * function existed) and can move to SQL pagination once fixture rows no longer
 * exist in any environment.
 */
export async function queryCatalogProducts(
  query: CatalogQuery,
  options: { rankedIds?: string[] | null } = {}
): Promise<CatalogPage> {
  const rows = await prisma.product.findMany({
    where: buildWhere(query),
    include: productInclude,
    orderBy: orderByFor(query.sort)
  });

  let items = rows.filter(isStorefrontVisible);

  if (query.q) {
    const needle = query.q.toLowerCase();
    if (Array.isArray(options.rankedIds)) {
      const rank = new Map(options.rankedIds.map((id, index) => [id, index]));
      items = items
        .filter((product) => rank.has(product.id))
        .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
    } else {
      items = items.filter((product) => matchesText(product, needle));
    }
  }

  const total = items.length;

  if (query.pageSize === null) {
    return { items, total, page: 1, pageSize: null, totalPages: 1, hasMore: false };
  }

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const start = (query.page - 1) * query.pageSize;
  return {
    items: items.slice(start, start + query.pageSize),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages,
    hasMore: start + query.pageSize < total
  };
}

export async function saleModesFor(ids: string[]): Promise<Map<string, "escrow" | "contact">> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, saleMode: true }
  });
  return new Map(rows.map((row) => [row.id, row.saleMode === "contact" ? "contact" : "escrow"]));
}

export async function saleModeFor(id: string): Promise<"escrow" | "contact"> {
  const modes = await saleModesFor([id]);
  return modes.get(id) ?? "escrow";
}
