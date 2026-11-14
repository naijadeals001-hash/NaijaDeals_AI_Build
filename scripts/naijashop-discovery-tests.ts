/**
 * NaijaShop public-discovery acceptance tests.
 *
 * Scope: catalogue filtering, sorting, pagination, search, URL persistence,
 * demo-inventory exclusion, empty/typo states and country/market scope.
 * No payment, order, wallet or seller-admin row is written.
 *
 * Run only against a disposable isolated database:
 *   TEST_DATABASE_URL=postgresql://... npx tsx scripts/naijashop-discovery-tests.ts
 *
 * The fail-closed guard verifies the explicit URL, actual current_database(),
 * the deny list, required tables and the TEST marker before the first query.
 * Fixtures use a random suffix and are deleted in a finally block.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { DEFAULT_REQUIRED_TABLES, requireTestDatabase } from "./lib/test-db-guard";
import type { CatalogQuery } from "../lib/services/core/catalog.service";

type CheckResult = { name: string; status: "PASS" | "FAIL"; detail: string };
const results: CheckResult[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function check(name: string, fn: () => Promise<string>) {
  try {
    const detail = await fn();
    results.push({ name, status: "PASS", detail });
    console.log(`PASS  ${name} — ${detail}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, status: "FAIL", detail });
    console.error(`FAIL  ${name}\n      ${detail}`);
  }
}

function idsOf(items: Array<{ id: string }>) {
  return items.map((item) => item.id);
}

async function main() {
  const target = await requireTestDatabase({
    requiredTables: [...DEFAULT_REQUIRED_TABLES, "Product", "ProductImage", "ProductVariant", "InventoryStock", "Vendor", "Category", "Review", "CartItem", "User"]
  });

  // Import after the guard has pointed DATABASE_URL at the verified target.
  const { prisma } = await import("../lib/prisma");
  const {
    CatalogQueryError,
    getCategories,
    getProduct,
    isFixtureListing,
    parseCatalogQuery,
    queryCatalogProducts
  } = await import("../lib/services/core/catalog.service");
  const { GET } = await import("../app/api/products/route");
  const { NextRequest } = await import("next/server");
  const { browseApiParams, browseHref, readBrowseFilters } = await import("../components/shop/browse-query");

  const suffix = randomUUID().replace(/-/g, "").slice(0, 10).toLowerCase();
  const created = {
    userId: "",
    categoryId: "",
    extraCategoryIds: [] as string[],
    vendorIds: [] as string[],
    productIds: [] as string[]
  };

  async function cleanup() {
    if (created.productIds.length > 0) {
      const productId = { in: created.productIds };
      await prisma.review.deleteMany({ where: { productId } }).catch(() => undefined);
      await prisma.cartItem.deleteMany({ where: { productId } }).catch(() => undefined);
      await prisma.productVariant.deleteMany({ where: { productId } }).catch(() => undefined);
      await prisma.inventoryStock.deleteMany({ where: { productId } }).catch(() => undefined);
      await prisma.productImage.deleteMany({ where: { productId } }).catch(() => undefined);
      await prisma.product.deleteMany({ where: { id: { in: created.productIds } } }).catch(() => undefined);
    }
    if (created.categoryId || created.extraCategoryIds.length > 0) {
      await prisma.category
        .deleteMany({ where: { id: { in: [created.categoryId, ...created.extraCategoryIds].filter(Boolean) } } })
        .catch(() => undefined);
    }
    if (created.vendorIds.length > 0) {
      await prisma.vendor.deleteMany({ where: { id: { in: created.vendorIds } } }).catch(() => undefined);
    }
    if (created.userId) {
      await prisma.user.deleteMany({ where: { id: created.userId } }).catch(() => undefined);
    }
  }

  try {
    console.log(`TEST database verified (${target.databaseName}); marker ${target.marker}`);
    console.log(`Fixture suffix ${suffix}`);

    const owner = await prisma.user.create({
      data: {
        email: `naijashop-discovery-${suffix}@example.test`,
        name: "NaijaShop Discovery Tester",
        actorType: "CUSTOMER"
      }
    });
    created.userId = owner.id;

    const vendorNg = await prisma.vendor.create({
      data: {
        ownerId: owner.id,
        name: `Discovery Lagos ${suffix}`,
        slug: `discovery-lagos-${suffix}`,
        market: "Lagos Island, Lagos",
        pickupAddress: "1 Discovery Way, Lagos",
        pickupPhone: "+2348000000001",
        countryCode: "NG",
        status: "VERIFIED",
        trustScore: 90
      }
    });
    const vendorGh = await prisma.vendor.create({
      data: {
        ownerId: owner.id,
        name: `Discovery Accra ${suffix}`,
        slug: `discovery-accra-${suffix}`,
        market: "Accra, Greater Accra",
        pickupAddress: "2 Discovery Road, Accra",
        pickupPhone: "+233200000002",
        countryCode: "GH",
        status: "VERIFIED",
        trustScore: 40
      }
    });
    created.vendorIds = [vendorNg.id, vendorGh.id];

    const category = await prisma.category.create({
      data: {
        name: `Discovery Category ${suffix}`,
        slug: `discovery-category-${suffix}`,
        description: "Isolated fixture category for NaijaShop discovery tests.",
        sortOrder: 9_999,
        isActive: true
      }
    });
    created.categoryId = category.id;

    const refundCategory = await prisma.category.create({
      data: {
        name: `Refund Cat ${suffix}`,
        slug: `ri-cat-${suffix}`,
        description: "Acceptance fixture category that must not be advertised.",
        sortOrder: 9_998,
        isActive: true
      }
    });
    created.extraCategoryIds.push(refundCategory.id);

    async function createProduct(input: {
      name: string;
      slug: string;
      priceKobo: bigint;
      vendorId: string;
      countryCode?: string;
      brand?: string;
      isSample?: boolean;
      status?: "ACTIVE" | "DRAFT" | "SUSPENDED" | "ARCHIVED";
      quantity?: number;
    }) {
      const product = await prisma.product.create({
        data: {
          vendorId: input.vendorId,
          categoryId: category.id,
          name: input.name,
          slug: input.slug,
          description: `${input.name} isolated discovery fixture.`,
          brand: input.brand ?? null,
          priceKobo: input.priceKobo,
          countryCode: input.countryCode ?? "NG",
          status: input.status ?? "ACTIVE",
          isSample: input.isSample ?? false
        }
      });
      created.productIds.push(product.id);
      await prisma.inventoryStock.create({
        data: { productId: product.id, quantity: input.quantity ?? 5, reserved: 0 }
      });
      return product;
    }

    const alpha = await createProduct({
      name: `Discovery ${suffix} Alpha Phone`,
      slug: `discovery-${suffix}-alpha-phone`,
      priceKobo: BigInt(4_000_000),
      vendorId: vendorNg.id,
      brand: "Alphacore",
      quantity: 5
    });
    const beta = await createProduct({
      name: `Discovery ${suffix} Beta Laptop`,
      slug: `discovery-${suffix}-beta-laptop`,
      priceKobo: BigInt(15_000_000),
      vendorId: vendorNg.id,
      brand: "Betatech",
      quantity: 2
    });
    const delta = await createProduct({
      name: `Discovery ${suffix} Delta Solar Kit`,
      slug: `discovery-${suffix}-delta-solar-kit`,
      priceKobo: BigInt(30_000_000),
      vendorId: vendorGh.id,
      countryCode: "GH",
      quantity: 1
    });
    const accra = await createProduct({
      name: `Discovery ${suffix} Accra Widget`,
      slug: `discovery-${suffix}-accra-widget`,
      priceKobo: BigInt(3_000_000),
      vendorId: vendorGh.id,
      countryCode: "GH",
      quantity: 4
    });
    const sample = await createProduct({
      name: `Discovery ${suffix} Sample Watch`,
      slug: `discovery-${suffix}-sample-watch`,
      priceKobo: BigInt(1_000_000),
      vendorId: vendorNg.id,
      isSample: true,
      quantity: 9
    });
    const suspended = await createProduct({
      name: `Discovery ${suffix} Suspended Speaker`,
      slug: `discovery-${suffix}-suspended-speaker`,
      priceKobo: BigInt(2_000_000),
      vendorId: vendorNg.id,
      status: "SUSPENDED",
      quantity: 3
    });
    const refundFixture = await createProduct({
      name: `Refund Product ${suffix}`,
      slug: `ri-prod-${suffix}`,
      priceKobo: BigInt(1_200_000),
      vendorId: vendorNg.id,
      quantity: 1
    });

    const baseQuery = (overrides: Partial<CatalogQuery> = {}): CatalogQuery => ({
      q: null,
      category: category.slug,
      market: null,
      country: null,
      vendor: null,
      price: null,
      maxPriceKobo: null,
      sort: "price-asc",
      page: 1,
      pageSize: 50,
      ...overrides
    });

    await check("catalogue filter returns only the department's visible products", async () => {
      const page = await queryCatalogProducts(baseQuery());
      const ids = idsOf(page.items);
      assert(page.total === 4, `expected 4 visible products, got ${page.total}`);
      assert(ids.includes(alpha.id) && ids.includes(beta.id) && ids.includes(delta.id) && ids.includes(accra.id), `missing expected ids: ${ids.join(",")}`);
      return `${page.total} visible department products`;
    });

    await check("demo, acceptance-fixture and non-ACTIVE inventory never enter discovery", async () => {
      const page = await queryCatalogProducts(baseQuery());
      const ids = idsOf(page.items);
      assert(!ids.includes(sample.id), "sample product leaked into discovery");
      assert(!ids.includes(suspended.id), "suspended product leaked into discovery");
      assert(!ids.includes(refundFixture.id), "refund acceptance fixture leaked into discovery");
      const direct = await getProduct(sample.slug);
      assert(direct.id === sample.id, "sample detail row is missing");
      assert(isFixtureListing(direct), "sample detail is not labelled as sample");
      return "sample + acceptance fixture + suspended excluded; direct sample detail still labelled";
    });

    await check("acceptance fixture categories are not advertised as departments", async () => {
      const categories = await getCategories({ countryCode: "NG" });
      assert(categories.some((item) => item.id === category.id), "real category missing from departments");
      assert(!categories.some((item) => item.id === refundCategory.id), "refund fixture category leaked into departments");
      return "fixture category hidden; real category listed";
    });

    await check("category roots require an explicit market instead of defaulting to NG", async () => {
      let rejected: unknown = null;
      try {
        await getCategories({ countryCode: "  " });
      } catch (error) {
        rejected = error;
      }
      assert(rejected, "getCategories accepted a request without a market country");
      const status = (rejected as { status?: number }).status;
      const code = (rejected as { code?: string }).code;
      assert(status === 400 && code === "market_required", `missing-market error status=${String(status)} code=${String(code)}`);
      return "blank market rejected with market_required";
    });

    await check("price bucket filters apply server-side", async () => {
      const under = await queryCatalogProducts(baseQuery({ price: "under-50k" }));
      assert(under.total === 2, `under-50k expected 2, got ${under.total}`);
      assert(idsOf(under.items).includes(alpha.id) && idsOf(under.items).includes(accra.id), "under-50k rows are wrong");

      const middle = await queryCatalogProducts(baseQuery({ price: "50k-200k" }));
      assert(middle.total === 1 && middle.items[0].id === beta.id, `50k-200k expected beta only, got ${middle.total}`);

      const high = await queryCatalogProducts(baseQuery({ price: "200k-plus" }));
      assert(high.total === 1 && high.items[0].id === delta.id, `200k-plus expected delta only, got ${high.total}`);
      return "under-50k=2, 50k-200k=beta, 200k-plus=delta";
    });

    await check("maximum-price filter applies server-side", async () => {
      const page = await queryCatalogProducts(baseQuery({ maxPriceKobo: BigInt(4_500_000) }));
      assert(page.total === 2, `expected 2 products at or below ₦45,000, got ${page.total}`);
      assert(idsOf(page.items).sort().join(",") === [alpha.id, accra.id].sort().join(","), "maximum-price rows are wrong");
      return "2 products at or below ₦45,000";
    });

    await check("sort options change result order", async () => {
      const ascending = await queryCatalogProducts(baseQuery({ sort: "price-asc" }));
      assert(
        idsOf(ascending.items).join(",") === [accra.id, alpha.id, beta.id, delta.id].join(","),
        `price-asc order wrong: ${idsOf(ascending.items).join(",")}`
      );

      const descending = await queryCatalogProducts(baseQuery({ sort: "price-desc" }));
      assert(
        idsOf(descending.items).join(",") === [delta.id, beta.id, alpha.id, accra.id].join(","),
        `price-desc order wrong: ${idsOf(descending.items).join(",")}`
      );

      const byName = await queryCatalogProducts(baseQuery({ sort: "name" }));
      const names = byName.items.map((product) => product.name);
      assert([...names].sort((a, b) => a.localeCompare(b)).join("|") === names.join("|"), `name order wrong: ${names.join("|")}`);

      const byTrust = await queryCatalogProducts(baseQuery({ sort: "trust" }));
      assert(byTrust.items[0].id === alpha.id && byTrust.items[1].id === beta.id, `trust order wrong: ${idsOf(byTrust.items).join(",")}`);
      return "price asc/desc, name and seller trust orders verified";
    });

    await check("pagination returns truthful metadata and slices", async () => {
      const first = await queryCatalogProducts(baseQuery({ pageSize: 2, page: 1 }));
      assert(
        first.total === 4 && first.totalPages === 2 && first.hasMore,
        `page 1 metadata wrong: total=${first.total} pages=${first.totalPages} hasMore=${first.hasMore}`
      );
      assert(idsOf(first.items).join(",") === [accra.id, alpha.id].join(","), "page 1 slice is wrong");

      const second = await queryCatalogProducts(baseQuery({ pageSize: 2, page: 2 }));
      assert(!second.hasMore && idsOf(second.items).join(",") === [beta.id, delta.id].join(","), "page 2 slice is wrong");

      const beyond = await queryCatalogProducts(baseQuery({ pageSize: 2, page: 3 }));
      assert(beyond.total === 4 && beyond.items.length === 0 && !beyond.hasMore, "out-of-range page must be empty, not a new total");
      return "page 1/2 slices correct; page 3 empty with total retained";
    });

    await check("search filters and paginates over the same catalogue", async () => {
      const first = await queryCatalogProducts(baseQuery({ q: suffix, sort: "price-asc", page: 1, pageSize: 2 }));
      assert(first.total === 4, `search should find 4 visible products, got ${first.total}`);
      assert(idsOf(first.items).join(",") === [accra.id, alpha.id].join(","), "search page 1 order is wrong");

      const second = await queryCatalogProducts(baseQuery({ q: suffix, sort: "price-asc", page: 2, pageSize: 2 }));
      assert(idsOf(second.items).join(",") === [beta.id, delta.id].join(","), "search page 2 order is wrong");

      const none = await queryCatalogProducts(baseQuery({ q: `no-such-product-${suffix}` }));
      assert(none.total === 0 && none.items.length === 0, "empty search should return an empty page");
      return "search page 2 keeps the query and correct slice; empty search honest";
    });

    await check("search/filter state persists in pagination and category links", async () => {
      const filters = readBrowseFilters(new URLSearchParams("q=phone&sort=price-asc&maxPrice=50000&page=2"));
      assert(filters.q === "phone" && filters.maxPrice === "50000" && filters.page === 2, "URL filters not parsed");

      const nextPage = new URL(browseHref("/naijashop/c/fashion", filters, { page: 3 }), "https://naijadeals.test");
      assert(nextPage.pathname === "/naijashop/c/fashion", "category path lost");
      assert(nextPage.searchParams.get("q") === "phone", "search query lost on pagination");
      assert(nextPage.searchParams.get("maxPrice") === "50000", "max price lost on pagination");
      assert(nextPage.searchParams.get("sort") === "price-asc", "sort lost on pagination");
      assert(nextPage.searchParams.get("page") === "3", "page not carried");

      const categoryLink = new URL(browseHref("/naijashop/c/phones-tablets", filters, { page: 1 }), "https://naijadeals.test");
      assert(categoryLink.searchParams.get("q") === "phone", "search query lost on category navigation");
      assert(categoryLink.searchParams.get("maxPrice") === "50000", "max price lost on category navigation");
      assert(categoryLink.searchParams.get("page") === null, "category navigation must reset the page");

      const api = browseApiParams(filters, "fashion");
      assert(api.q === "phone" && api.category === "fashion" && api.page === "2" && api.pageSize === "24", "API params lost state");
      return "q/maxPrice/sort survive pagination and category navigation; page resets on category change";
    });

    await check("country, market and vendor scopes filter listings", async () => {
      const nigeria = await queryCatalogProducts(baseQuery({ country: "NG" }));
      assert(nigeria.total === 2 && idsOf(nigeria.items).every((id) => id === alpha.id || id === beta.id), "NG scope wrong");

      const ghana = await queryCatalogProducts(baseQuery({ country: "GH" }));
      assert(ghana.total === 2 && idsOf(ghana.items).every((id) => id === accra.id || id === delta.id), "GH scope wrong");

      const accraMarket = await queryCatalogProducts(baseQuery({ market: "accra" }));
      assert(accraMarket.total === 2, `market scope expected 2, got ${accraMarket.total}`);

      const vendorScope = await queryCatalogProducts(baseQuery({ vendor: vendorGh.slug }));
      assert(vendorScope.total === 2, `vendor scope expected 2, got ${vendorScope.total}`);
      return "NG=2, GH=2, Accra market=2, GH vendor=2";
    });

    await check("well-formed unknown category is an empty state, not an error", async () => {
      const parsed = parseCatalogQuery(new URLSearchParams("category=does-not-exist"));
      const page = await queryCatalogProducts(parsed.query);
      assert(parsed.paginated === false, "legacy request should not be paginated");
      assert(page.total === 0 && page.items.length === 0, "unknown category should be empty");
      return "unknown slug returns 0 products";
    });

    await check("invalid filter values are rejected with the offending field", async () => {
      const cases: Array<[string, string]> = [
        ["sort=explode", "sort"],
        ["price=free", "price"],
        ["page=0", "page"],
        ["pageSize=61", "pageSize"],
        ["maxPrice=abc", "maxPrice"],
        ["country=ZZ", "country"],
        ["category=Not A Slug", "category"],
        ["vendor=UPPER CASE", "vendor"]
      ];
      for (const [search, field] of cases) {
        let error: unknown = null;
        try {
          parseCatalogQuery(new URLSearchParams(search));
        } catch (caught) {
          error = caught;
        }
        assert(error instanceof CatalogQueryError, `${search} was not rejected`);
        assert(error.field === field, `${search} rejected as ${error.field}, expected ${field}`);
      }
      return `${cases.length} invalid parameter sets rejected before any query`;
    });

    await check("legacy 'all' filter sentinels remain no-ops", async () => {
      const parsed = parseCatalogQuery(new URLSearchParams("category=all&market=all&vendor=all"));
      assert(parsed.query.category === null, "category=all should clear the filter");
      assert(parsed.query.market === null, "market=all should clear the filter");
      assert(parsed.query.vendor === null, "vendor=all should clear the filter");
      return "category/market/vendor=all parse as no filter";
    });

    await check("HTTP route returns 400 for invalid parameters", async () => {
      const response = await GET(new NextRequest("http://localhost/api/products?sort=explode"));
      assert(response.status === 400, `expected 400, got ${response.status}`);
      const body = (await response.json()) as { code?: string; field?: string };
      assert(body.code === "invalid_query" && body.field === "sort", `unexpected body ${JSON.stringify(body)}`);
      return "sort=explode -> 400 invalid_query(sort)";
    });

    await check("HTTP route serves a paginated, filtered envelope", async () => {
      const response = await GET(
        new NextRequest(
          `http://localhost/api/products?category=${encodeURIComponent(category.slug)}&country=NG&sort=price-asc&page=1&pageSize=1`
        )
      );
      assert(response.status === 200, `expected 200, got ${response.status}`);
      const body = (await response.json()) as {
        items: Array<{ id: string }>;
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
        hasMore: boolean;
      };
      assert(body.total === 2 && body.items.length === 1 && body.page === 1 && body.pageSize === 1, `unexpected envelope ${JSON.stringify(body)}`);
      assert(body.totalPages === 2 && body.hasMore, "pagination metadata is wrong");
      assert(body.items[0].id === alpha.id, "first NG product should be alpha at price-asc");
      assert(response.headers.get("x-total-count") === "2", "X-Total-Count header is wrong");
      return "200 envelope: total=2, pageSize=1, totalPages=2, X-Total-Count=2";
    });

    await check("HTTP route keeps the legacy unpaginated array contract", async () => {
      const response = await GET(
        new NextRequest(`http://localhost/api/products?category=${encodeURIComponent(category.slug)}&sort=price-asc`)
      );
      assert(response.status === 200, `expected 200, got ${response.status}`);
      const body = (await response.json()) as Array<{ id: string }>;
      assert(Array.isArray(body) && body.length === 4, `legacy array expected, got ${JSON.stringify(body).slice(0, 80)}`);
      assert(response.headers.get("x-total-count") === "4", "legacy total header is wrong");
      assert(body[0].id === accra.id, "legacy order is wrong");
      return "array body with 4 rows and X-Total-Count=4";
    });

    await check("HTTP search pagination works when the search engine is unavailable", async () => {
      const savedUrl = process.env.MEILISEARCH_URL;
      const savedKey = process.env.MEILISEARCH_API_KEY;
      process.env.MEILISEARCH_URL = "";
      process.env.MEILISEARCH_API_KEY = "";
      try {
        const response = await GET(
          new NextRequest(
            `http://localhost/api/products?q=${encodeURIComponent(suffix)}&sort=price-asc&page=2&pageSize=2`
          )
        );
        assert(response.status === 200, `expected 200, got ${response.status}`);
        const body = (await response.json()) as {
          items: Array<{ id: string }>;
          total: number;
          page: number;
          query: string | null;
        };
        assert(body.total === 4 && body.page === 2 && body.query === suffix, `unexpected search envelope ${JSON.stringify(body)}`);
        assert(idsOf(body.items).join(",") === [beta.id, delta.id].join(","), "search fallback page 2 is wrong");
        return "fallback search returns page 2 of 4 with the query echoed";
      } finally {
        if (savedUrl === undefined) delete process.env.MEILISEARCH_URL;
        else process.env.MEILISEARCH_URL = savedUrl;
        if (savedKey === undefined) delete process.env.MEILISEARCH_API_KEY;
        else process.env.MEILISEARCH_API_KEY = savedKey;
      }
    });
  } finally {
    await cleanup();
    console.log("Fixtures cleaned up.");
    await prisma.$disconnect().catch(() => undefined);
  }

  const failed = results.filter((result) => result.status === "FAIL");
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    console.error("FAILED:");
    for (const result of failed) console.error(`- ${result.name}: ${result.detail}`);
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(`BLOCKED/FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
