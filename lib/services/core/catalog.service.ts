import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { COUNTRIES } from "@/lib/config/commerce";
import { effectivePublishRule, isReachable, sortCategoryRows } from "@/lib/services/taxonomy/shared";
import { verticalAccess } from "./vertical-activation.service";
import { listReviews } from "./account.service";

/**
 * Shop activation gate for reads.
 *
 * Every public catalogue read passes through here. A DISABLED Shop returns an
 * empty result rather than rows; PREVIEW is visible only to an authenticated
 * Control Center caller that explicitly passes `previewAuthorized`. Internal
 * admin/seller reads use their own services and are not routed through this
 * helper.
 */
async function shopReadAllowed(options: {
  countryCode?: string | null;
  cityCode?: string | null;
  previewAuthorized?: boolean;
  fresh?: boolean;
} = {}): Promise<boolean> {
  const { accessible } = await verticalAccess("shop", {
    countryCode: options.countryCode ?? "NG",
    cityCode: options.cityCode ?? null,
    previewAuthorized: options.previewAuthorized,
    fresh: options.fresh
  });
  return accessible;
}


const productInclude = {
  category: true,
  vendor: { select: { id: true, name: true, slug: true, market: true, status: true, trustScore: true } },
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
export async function listProducts(options: { previewAuthorized?: boolean } = {}) {
  if (!(await shopReadAllowed({ previewAuthorized: options.previewAuthorized }))) return [];
  return prisma.product.findMany({
    where: {
      status: "ACTIVE",
      isSample: false,
      category: { isActive: true, deprecatedAt: null },
      vendor: { status: "VERIFIED" }
    },
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
export async function getPublicProductDetail(
  idOrSlug: string,
  access: { countryCode?: string | null; cityCode?: string | null; previewAuthorized?: boolean; fresh?: boolean } = {}
) {
  const product = await getProduct(idOrSlug);
  // Evaluate the module before exposing any product field. A DISABLED Shop
  // returns `null`, which the page/API renders as 404 without leaking drafts.
  const allowed = await shopReadAllowed({
    countryCode: access.countryCode ?? product.countryCode,
    cityCode: access.cityCode,
    previewAuthorized: access.previewAuthorized,
    fresh: access.fresh
  });
  if (!allowed) return null;
  if (product.status !== "ACTIVE" || product.vendor.status !== "VERIFIED") return null;

  // A selected market is a real publication boundary: a product listed in
  // another country, or in a category whose eligibility is unresolved for the
  // visitor's market, is not a public detail page.
  const visitorCountry = access.countryCode?.trim().toUpperCase();
  if (visitorCountry && !access.previewAuthorized) {
    if (product.countryCode.trim().toUpperCase() !== visitorCountry) return null;
    const tree = await loadPublicCategoryTree(visitorCountry);
    if (!tree.visibleById.has(product.categoryId) || tree.restricted.has(product.categoryId)) return null;
  }

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
export async function listRelatedProducts(
  categorySlug: string,
  excludeId: string,
  limit = 4,
  access: { previewAuthorized?: boolean; countryCode?: string | null } = {}
) {
  const page = await queryCatalogProducts(
    {
      q: null,
      category: categorySlug,
      market: null,
      country: access.countryCode ?? null,
      vendor: null,
      price: null,
      maxPriceKobo: null,
      sort: "trust",
      page: 1,
      pageSize: null
    },
    { previewAuthorized: access.previewAuthorized }
  );
  return page.items.filter((product) => product.id !== excludeId).slice(0, limit);
}

/** Acceptance-suite categories are database rows, never public departments. */
const CATEGORY_FIXTURE = /^(refund cat|test category|fixture category)\b|^ri-cat-/i;

/** Public browsing defaults to the catalogue's home market when none is named. */
const DEFAULT_PUBLIC_COUNTRY = "NG";

type CategoryTreeRow = {
  id: string;
  key: string | null;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  parentId: string | null;
  level: number;
  isActive: boolean;
  isSelectable: boolean;
  showOnHomepage: boolean;
  sortOrder: number;
  deprecatedAt: Date | null;
  isRegulated: boolean;
};

type PublicCategoryTree = {
  visibleById: Map<string, CategoryTreeRow>;
  visible: CategoryTreeRow[];
  childrenByParent: Map<string, CategoryTreeRow[]>;
  roots: CategoryTreeRow[];
  /** Nodes publish-restricted for the requested country; their subtree is excluded. */
  restricted: Set<string>;
};

/**
 * Loads the public category tree once so slug resolution, descendant
 * aggregation and product counts all use exactly the same rows.
 *
 * A node is browsable only when it is active, not deprecated, not an
 * acceptance fixture, and every ancestor is active and not deprecated. Country
 * publication rules are evaluated along the ancestor chain: a restricted leaf
 * is hidden together with its subtree, so a stale product row in a
 * non-publishable leaf cannot leak into a parent listing.
 */
async function loadPublicCategoryTree(countryCode: string): Promise<PublicCategoryTree> {
  const country = countryCode.trim().toUpperCase() || DEFAULT_PUBLIC_COUNTRY;
  const rows = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
    select: {
      id: true,
      key: true,
      name: true,
      slug: true,
      description: true,
      imageUrl: true,
      imageAlt: true,
      parentId: true,
      level: true,
      isActive: true,
      isSelectable: true,
      showOnHomepage: true,
      sortOrder: true,
      deprecatedAt: true,
      isRegulated: true
    }
  });

  // Fixture-named rows count as unavailable when walking ancestors, so an
  // active child of an acceptance-fixture parent cannot leak into navigation.
  const reachabilityById = new Map(
    rows.map((row) => [
      row.id,
      {
        ...row,
        isActive: row.isActive && !CATEGORY_FIXTURE.test(row.name) && !CATEGORY_FIXTURE.test(row.slug)
      }
    ])
  );
  const visible = rows.filter(
    (row) =>
      row.isActive &&
      !row.deprecatedAt &&
      !CATEGORY_FIXTURE.test(row.name) &&
      !CATEGORY_FIXTURE.test(row.slug) &&
      isReachable(row, reachabilityById)
  );
  const visibleById = new Map(visible.map((row) => [row.id, row]));

  const childrenByParent = new Map<string, CategoryTreeRow[]>();
  for (const row of visible) {
    if (!row.parentId || !visibleById.has(row.parentId)) continue;
    const list = childrenByParent.get(row.parentId) ?? [];
    list.push(row);
    childrenByParent.set(row.parentId, list);
  }
  for (const [parentId, children] of childrenByParent) {
    childrenByParent.set(parentId, sortCategoryRows(children));
  }

  const restricted = new Set<string>();
  const rules = await prisma.categoryCountryRule.findMany({
    where: { countryCode: country },
    select: { categoryId: true, countryCode: true, canPublish: true, note: true }
  });
  // Evaluate every node even when this market has no rule rows at all:
  // a regulated node without a rule is unresolved, not permitted.
  const ruleMap = new Map(rules.map((rule) => [`${rule.categoryId}:${country}`, rule]));
  for (const row of visible) {
    const effective = effectivePublishRule({
      categoryId: row.id,
      byId: visibleById,
      rules: ruleMap,
      countryCode: country
    });
    if (!effective.canPublish) restricted.add(row.id);
  }

  return {
    visibleById,
    visible,
    childrenByParent,
    roots: sortCategoryRows(visible.filter((row) => !row.parentId)),
    restricted
  };
}

/**
 * Selectable ids in a node's subtree. Non-selectable parents (departments and
 * most level-1 categories) contribute their selectable descendants; a
 * restricted node contributes nothing at all. Each row is visited once, so a
 * product cannot be counted twice through two branches.
 */
function subtreeIds(tree: PublicCategoryTree, root: CategoryTreeRow): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const queue: CategoryTreeRow[] = [root];
  while (queue.length > 0) {
    const current = queue.shift() as CategoryTreeRow;
    if (seen.has(current.id)) continue;
    seen.add(current.id);
    if (tree.restricted.has(current.id)) continue;
    if (current.isSelectable) ids.push(current.id);
    for (const child of tree.childrenByParent.get(current.id) ?? []) queue.push(child);
  }
  return ids;
}

export type CategoryScope = {
  matchedId: string | null;
  matchedSlug: string | null;
  matchedName: string | null;
  countryCode: string;
  categoryIds: string[];
};

function findPublicCategory(tree: PublicCategoryTree, term: string): CategoryTreeRow | undefined {
  const needle = term.trim().toLowerCase();
  if (!needle) return undefined;
  return (
    tree.visible.find((row) => row.slug.toLowerCase() === needle) ??
    tree.visible.find((row) => row.name.toLowerCase() === needle)
  );
}

/**
 * Resolve a category slug (or case-insensitive name) to every selectable
 * category id whose products belong on that page.
 *
 * - A department/root returns products from its whole active subtree.
 * - A leaf returns only that leaf.
 * - An unknown slug returns no ids (an honest empty result, not "no filter").
 */
export async function resolveCategoryScope(
  term: string,
  options: { countryCode?: string | null } = {}
): Promise<CategoryScope> {
  const countryCode = (options.countryCode ?? DEFAULT_PUBLIC_COUNTRY).toUpperCase();
  const tree = await loadPublicCategoryTree(countryCode);
  const match = findPublicCategory(tree, term);
  return {
    matchedId: match?.id ?? null,
    matchedSlug: match?.slug ?? null,
    matchedName: match?.name ?? null,
    countryCode,
    categoryIds: match ? subtreeIds(tree, match) : []
  };
}

/** Selectable ids across the whole public tree; archived/restricted rows are absent. */
async function allPublicCategoryIds(countryCode: string): Promise<string[]> {
  const tree = await loadPublicCategoryTree(countryCode);
  return tree.visible
    .filter((row) => row.isSelectable && !tree.restricted.has(row.id))
    .map((row) => row.id);
}

/**
 * Browsing roots for the Shop shell and the public directory.
 *
 * The contract requires the same active roots that `/api/taxonomy` returns.
 * `productCount` is the number of distinct publicly eligible products in the
 * root's subtree; a product is counted once even when nested categories overlap
 * in navigation. Prices, stock and fixture filtering stay in the catalogue
 * query, so this count describes the unfiltered browsing scope the root opens.
 */
export async function getCategories(
  options: { previewAuthorized?: boolean; countryCode?: string | null; cityCode?: string | null } = {}
) {
  const countryCode = (options.countryCode ?? DEFAULT_PUBLIC_COUNTRY).trim().toUpperCase() || DEFAULT_PUBLIC_COUNTRY;
  if (
    !(await shopReadAllowed({
      countryCode,
      cityCode: options.cityCode,
      previewAuthorized: options.previewAuthorized
    }))
  ) {
    return [];
  }
  const tree = await loadPublicCategoryTree(countryCode);
  const scopes = tree.roots.map((root) => ({ root, ids: subtreeIds(tree, root) }));
  const ids = [...new Set(scopes.flatMap((scope) => scope.ids))];

  const rows =
    ids.length > 0
      ? await prisma.product.findMany({
          where: {
            status: "ACTIVE",
            isSample: false,
            countryCode,
            categoryId: { in: ids },
            vendor: { status: "VERIFIED" }
          },
          select: { id: true, name: true, slug: true, categoryId: true }
        })
      : [];
  const visibleProducts = rows.filter((row) => !STORE_FIXTURE.test(row.name) && !STORE_FIXTURE.test(row.slug));

  return scopes.map(({ root, ids: scopeIds }) => {
    const wanted = new Set(scopeIds);
    const distinct = new Set(
      visibleProducts.filter((product) => wanted.has(product.categoryId)).map((product) => product.id)
    );
    return {
      id: root.id,
      key: root.key,
      name: root.name,
      slug: root.slug,
      description: root.description,
      imageUrl: root.imageUrl,
      imageAlt: root.imageAlt,
      level: root.level,
      isSelectable: root.isSelectable,
      showOnHomepage: root.showOnHomepage,
      productCount: distinct.size
    };
  });
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

async function buildWhere(query: CatalogQuery): Promise<Prisma.ProductWhereInput> {
  // Category pages aggregate the selected node's whole active subtree. The
  // browser never receives a product whose category is inactive, deprecated,
  // a test fixture, publish-restricted or detached from a live ancestor.
  const categoryIds = query.category
    ? (await resolveCategoryScope(query.category, { countryCode: query.country })).categoryIds
    : await allPublicCategoryIds(query.country ?? DEFAULT_PUBLIC_COUNTRY);

  const where: Prisma.ProductWhereInput = {
    status: "ACTIVE",
    isSample: false,
    category: { id: { in: categoryIds } },
    vendor: {
      status: "VERIFIED",
      ...(query.market ? { market: { contains: query.market, mode: "insensitive" as const } } : {}),
      ...(query.vendor ? { slug: query.vendor } : {})
    }
  };

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
  const haystack = [product.name, product.description, product.brand, product.vendor.name, product.vendor.market, product.category.name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const tokens = needle.split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => haystack.includes(token));
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
  options: { rankedIds?: string[] | null; previewAuthorized?: boolean; fresh?: boolean } = {}
): Promise<CatalogPage> {
  if (
    !(await shopReadAllowed({
      countryCode: query.country ?? DEFAULT_PUBLIC_COUNTRY,
      previewAuthorized: options.previewAuthorized,
      fresh: options.fresh
    }))
  ) {
    return {
      items: [],
      total: 0,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: 1,
      hasMore: false
    };
  }

  const rows = await prisma.product.findMany({
    where: await buildWhere(query),
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
