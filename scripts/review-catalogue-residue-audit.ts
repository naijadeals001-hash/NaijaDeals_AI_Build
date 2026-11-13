/**
 * Read-only REVIEW catalogue residue audit.
 *
 * Purpose
 *   Inventory every non-public, run-tagged department and product left by the
 *   REVIEW Control Center acceptance workflows, prove that no such record is
 *   active or publicly discoverable, and record the active baseline after
 *   catalogue batches A and B.
 *
 * Safety
 *   This script never writes. It refuses to run unless:
 *     - REVIEW_DATABASE_URL is set explicitly (DATABASE_URL and any .env
 *       fallback are never used);
 *     - --expect-db=<name> is supplied explicitly;
 *     - the connected database name equals the expected name;
 *     - DatabaseClassification contains REVIEW.
 *   All SQL runs inside `BEGIN TRANSACTION READ ONLY` and ends with ROLLBACK.
 *   No record, image, stock, department or publication state is changed.
 *
 * Public-surface checks
 *   - `/api/products` total and every returned slug (counts, discovery);
 *   - `/api/categories` (public navigation);
 *   - every inactive department's category API and rendered category page;
 *   - every run-tag search query;
 *   - every non-active product's direct page (must be 404);
 *   - the marketplace storefront and all-departments page in Chromium.
 *
 * Usage
 *   REVIEW_DATABASE_URL=<review url> npx tsx scripts/review-catalogue-residue-audit.ts \
 *     --expect-db=naijadeals_review
 *
 * Optional: REVIEW_BASE_URL=http://localhost:3047
 */
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { chromium } from "playwright";

const BASE = (process.env.REVIEW_BASE_URL || "http://localhost:3047").replace(/\/+$/, "");
const CREDENTIAL_FILE = "qa-artifacts/review-basket/.admin-credential";
const REVIEW_NOTE = "REVIEW CATALOGUE — demonstration departments and products only. Not live supply.";
const EXPECTED_ACTIVE_DEPARTMENTS = 9;
const EXPECTED_ACTIVE_PRODUCTS = 41;
const EXPECTED_GROCERIES_PRODUCTS = 8;
const BATCH_A_SLUGS = [
  "demo-apple-iphone-5s",
  "demo-apple-iphone-6-silver",
  "demo-eizo-foris-fg2421-monitor",
  "demo-digital-slr-camera-with-zoom-lens",
  "demo-smartwatch-black-silicone-strap",
  "demo-red-patent-leather-baby-shoes"
];
const BATCH_B_SLUGS = [
  "demo-fresh-cabbage-1-head",
  "demo-fresh-carrots-1kg",
  "demo-fresh-cucumbers-1kg",
  "demo-apple-mangoes-1kg"
];
const EXPECTED_ACTIVE_DEPARTMENT_SLUGS = [
  "beauty-personal-care",
  "computers",
  "electronics-appliances",
  "fashion-accessories",
  "gaming",
  "groceries-household",
  "home-kitchen",
  "phones-tablets",
  "power-solar"
];
const EVIDENCE_FILE = "qa-artifacts/review-basket/catalogue-residue-audit.json";

type DepartmentRow = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  isDemo: boolean;
};

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  isDemo: boolean;
  isSample: boolean;
  price_kobo: string;
  category_slug: string;
  category_name: string;
  category_active: boolean;
};

type ResidueRecord = {
  kind: "department" | "product";
  id: string;
  name: string;
  slug: string;
  state: string;
  isDemo: boolean;
  categorySlug: string | null;
  runTag: string | null;
  family: string;
  ownerScript: string;
  runTagged: boolean;
  public: {
    directProductStatus?: number;
    directProductBodyContainsName?: boolean;
    nameSearchTotal?: number;
    categoryApiTotal?: number;
    categoryApiContainsSlug?: boolean;
    categoryPageCards?: string[];
    categoryPageMissingMessage?: boolean;
    searchTotal?: number;
    inPublicProductApi?: boolean;
    inCategoriesApi?: boolean;
  };
};

const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail = "") {
  checks.push({ name, ok: Boolean(ok), detail });
  return Boolean(ok);
}

function runTagFor(slug: string, name: string): string | null {
  const source = `${slug} ${name}`;
  const timestamp = source.match(/20\d{12}(?:-[a-z0-9]{4,8})?/i);
  if (timestamp) return timestamp[0].toLowerCase();
  const mwe = source.match(/mwe[0-9a-z]+/i);
  if (mwe) return mwe[0].toLowerCase();
  const legacy = slug.match(/(?:department|blender|probe)-([a-z0-9]{8,12})(?:-edited|-v2)?$/i);
  if (legacy) return legacy[1].toLowerCase();
  return null;
}

function familyFor(kind: "department" | "product", slug: string, name: string): string {
  if (/Alt probe/i.test(name)) return "alt-text probe department";
  if (/Review department/i.test(name)) return "workflow run department";
  if (/Acceptance lifecycle/i.test(name) || slug.startsWith("demo-acceptance-")) return "acceptance lifecycle product";
  if (/Incomplete workflow/i.test(name)) return "incomplete draft product";
  if (/Review workflow blender/i.test(name)) return "workflow publish/unpublish product";
  if (/Final acceptance/i.test(name)) {
    return kind === "department" ? "final acceptance department" : "final acceptance product";
  }
  if (/Independent workflow/i.test(name)) {
    return kind === "department" ? "independent workflow department" : "independent workflow product";
  }
  if (slug === "review-workflow-demo") return "earlier workflow demo department";
  if (slug === "demo-daily-sunscreen") return "unrelated archived demo";
  return kind === "department" ? "unclassified department" : "unclassified product";
}

function isRunTagged(record: Pick<ResidueRecord, "family" | "runTag">): boolean {
  return record.family !== "unrelated archived demo" && (record.runTag !== null || record.family !== "unclassified product");
}

function parseDatabaseName(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("REVIEW_DATABASE_URL is not a valid URL (value hidden).");
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error("REVIEW_DATABASE_URL must use the postgresql: protocol (value hidden).");
  }
  return decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
}

async function getJson(url: string) {
  const response = await fetch(url, { redirect: "manual" });
  const text = await response.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { status: response.status, headers: response.headers, body, text };
}

async function main() {
  const expectedArg = process.argv.find((arg) => arg.startsWith("--expect-db="));
  if (!expectedArg) {
    throw new Error("refusing: --expect-db=<database name> is required; there is no default database.");
  }
  const expectedDatabase = expectedArg.slice("--expect-db=".length).trim();
  if (!expectedDatabase) throw new Error("refusing: --expect-db= must name the intended database.");

  const reviewUrl = (process.env.REVIEW_DATABASE_URL || "").trim();
  if (!reviewUrl) {
    throw new Error(
      "refusing: REVIEW_DATABASE_URL must be set explicitly; DATABASE_URL and root .env are never used as a fallback."
    );
  }
  const urlDatabase = parseDatabaseName(reviewUrl);
  if (urlDatabase !== expectedDatabase) {
    throw new Error(`refusing: REVIEW_DATABASE_URL names ${urlDatabase}, expected ${expectedDatabase}.`);
  }

  const client = new Client({
    connectionString: reviewUrl,
    application_name: "naijadeals-review-residue-audit",
    connectionTimeoutMillis: 10_000
  });
  await client.connect();

  const departments: DepartmentRow[] = [];
  const products: ProductRow[] = [];
  let identity = { database: "", classifications: [] as string[] };

  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    await client.query("SET LOCAL statement_timeout = '30000ms'");

    const db = await client.query<{ database: string }>("select current_database() as database");
    const classifications = await client.query<{ id: string; classification: string }>(
      'select id, classification from "DatabaseClassification" order by id'
    );
    identity = {
      database: db.rows[0]?.database ?? "",
      classifications: classifications.rows.map((row) => row.classification)
    };
    check(
      "connected database matches the explicit expected name",
      identity.database === expectedDatabase,
      `database=${identity.database} expected=${expectedDatabase}`
    );
    check(
      "database is classified REVIEW",
      identity.classifications.includes("REVIEW"),
      `classifications=${identity.classifications.join(",") || "none"}`
    );
    if (identity.database !== expectedDatabase || !identity.classifications.includes("REVIEW")) {
      throw new Error("refusing: the connected database did not pass the explicit REVIEW identity guard.");
    }

    const departmentRows = await client.query<DepartmentRow>(
      'select id, name, slug, "isActive", "isDemo" from "Category" order by slug'
    );
    departments.push(...departmentRows.rows);

    const productRows = await client.query<ProductRow>(
      `select p.id, p.name, p.slug, p.status::text as status, p."isDemo", p."isSample",
              p."priceKobo"::text as price_kobo,
              c.slug as category_slug, c.name as category_name, c."isActive" as category_active
         from "Product" p
         join "Category" c on c.id = p."categoryId"
        order by p.slug`
    );
    products.push(...productRows.rows);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.end().catch(() => undefined);
  }

  const activeDepartments = departments.filter((row) => row.isActive);
  const inactiveDepartments = departments.filter((row) => !row.isActive);
  const activeProducts = products.filter((row) => row.status === "ACTIVE");
  const nonActiveProducts = products.filter((row) => row.status !== "ACTIVE");

  check(
    "active department count is the post-batch review baseline",
    activeDepartments.length === EXPECTED_ACTIVE_DEPARTMENTS,
    `${activeDepartments.length} active departments`
  );
  check(
    "active department slugs are exactly the approved nine",
    activeDepartments.map((row) => row.slug).sort().join(",") === EXPECTED_ACTIVE_DEPARTMENT_SLUGS.join(","),
    activeDepartments.map((row) => row.slug).sort().join(",")
  );
  check(
    "active product count is the post-batch A+B baseline",
    activeProducts.length === EXPECTED_ACTIVE_PRODUCTS,
    `${activeProducts.length} active products`
  );
  for (const slug of [...BATCH_A_SLUGS, ...BATCH_B_SLUGS]) {
    const row = products.find((product) => product.slug === slug);
    check(`baseline product is ACTIVE: ${slug}`, row?.status === "ACTIVE", row ? `status=${row.status}` : "missing");
  }
  check(
    "every active product belongs to an active department",
    activeProducts.every((row) => row.category_active),
    activeProducts.filter((row) => !row.category_active).map((row) => row.slug).join(",") || "none"
  );
  check(
    "every active product is explicitly DEMO and not a sample fixture",
    activeProducts.every((row) => row.isDemo && !row.isSample),
    activeProducts.filter((row) => !row.isDemo || row.isSample).map((row) => row.slug).join(",") || "none"
  );
  const groceries = activeProducts.filter((row) => row.category_slug === "groceries-household");
  check(
    "Groceries & Household Essentials has the four existing and four batch B products",
    groceries.length === EXPECTED_GROCERIES_PRODUCTS &&
      BATCH_B_SLUGS.every((slug) => groceries.some((row) => row.slug === slug)),
    `${groceries.length} products: ${groceries.map((row) => row.slug).sort().join(",")}`
  );

  const residue: ResidueRecord[] = [
    ...inactiveDepartments.map((row) => {
      const runTag = runTagFor(row.slug, row.name);
      const family = familyFor("department", row.slug, row.name);
      return {
        kind: "department" as const,
        id: row.id,
        name: row.name,
        slug: row.slug,
        state: "INACTIVE",
        isDemo: row.isDemo,
        categorySlug: null,
        runTag,
        family,
        ownerScript: runTag ? "scripts/review-catalogue-workflow.cjs" : "scripts/review-catalogue-workflow.cjs (earlier run)",
        runTagged: false,
        public: {}
      };
    }),
    ...nonActiveProducts.map((row) => {
      const runTag = runTagFor(row.slug, row.name);
      const family = familyFor("product", row.slug, row.name);
      return {
        kind: "product" as const,
        id: row.id,
        name: row.name,
        slug: row.slug,
        state: row.status,
        isDemo: row.isDemo,
        categorySlug: row.category_slug,
        runTag,
        family,
        ownerScript: runTag ? "scripts/review-catalogue-workflow.cjs" : "scripts/review-catalogue-workflow.cjs (earlier run)",
        runTagged: false,
        public: {}
      };
    })
  ].map((record) => ({ ...record, runTagged: isRunTagged(record) }));

  const runTagged = residue.filter((record) => record.runTagged);
  const runTaggedDepartments = runTagged.filter((record) => record.kind === "department");
  const runTaggedProducts = runTagged.filter((record) => record.kind === "product");
  const archivedWorkflowProducts = runTaggedProducts.filter(
    (record) => record.state === "ARCHIVED" && record.family !== "final acceptance product" && record.family !== "independent workflow product"
  );
  const draftWorkflowProducts = runTaggedProducts.filter((record) => record.state === "DRAFT");
  const unrelatedArchived = residue.filter((record) => !record.runTagged);

  check(
    "no run-tagged department is active",
    runTaggedDepartments.every((record) => record.state === "INACTIVE"),
    runTaggedDepartments.filter((record) => record.state !== "INACTIVE").map((record) => record.slug).join(",") || "none"
  );
  check(
    "no run-tagged product is ACTIVE",
    runTaggedProducts.every((record) => record.state !== "ACTIVE"),
    runTaggedProducts.filter((record) => record.state === "ACTIVE").map((record) => record.slug).join(",") || "none"
  );
  check(
    "run-tagged residue count is fully inventoried",
    runTagged.length === runTaggedDepartments.length + runTaggedProducts.length &&
      residue.length === runTagged.length + unrelatedArchived.length,
    `${runTagged.length} run-tagged records + ${unrelatedArchived.length} unrelated archived = ${residue.length} non-public records`
  );

  const byFamily: Record<string, number> = {};
  const byRunTag: Record<string, { departments: number; products: number; families: string[]; statuses: string[] }> = {};
  for (const record of runTagged) {
    byFamily[record.family] = (byFamily[record.family] ?? 0) + 1;
    const tag = record.runTag ?? "(unattributed earlier run)";
    if (!byRunTag[tag]) byRunTag[tag] = { departments: 0, products: 0, families: [], statuses: [] };
    if (record.kind === "department") byRunTag[tag].departments += 1;
    else byRunTag[tag].products += 1;
    if (!byRunTag[tag].families.includes(record.family)) byRunTag[tag].families.push(record.family);
    if (!byRunTag[tag].statuses.includes(record.state)) byRunTag[tag].statuses.push(record.state);
  }

  // -----------------------------------------------------------------------
  // Public surface checks (read-only HTTP).
  // -----------------------------------------------------------------------
  const shop = await fetch(`${BASE}/naijashop`, { redirect: "manual" });
  const shopHtml = await shop.text();
  check(
    "served build exposes the REVIEW catalogue indicator",
    shop.status === 200 && shopHtml.includes(REVIEW_NOTE),
    `status=${shop.status} indicator=${shopHtml.includes(REVIEW_NOTE)}`
  );

  const publicProducts = await getJson(`${BASE}/api/products?page=1&pageSize=60`);
  const publicItems: any[] = Array.isArray(publicProducts.body?.items) ? publicProducts.body.items : [];
  check(
    "public product API reports the active product count",
    publicProducts.status === 200 && publicProducts.body?.total === EXPECTED_ACTIVE_PRODUCTS,
    `status=${publicProducts.status} total=${publicProducts.body?.total ?? "none"}`
  );
  check(
    "public product API returns exactly the active set",
    publicItems.length === EXPECTED_ACTIVE_PRODUCTS &&
      publicItems.every((item) => activeProducts.some((row) => row.slug === item.slug)),
    `items=${publicItems.length} unmatched=${publicItems.filter((item) => !activeProducts.some((row) => row.slug === item.slug)).map((item) => item.slug).join(",") || "none"}`
  );
  check(
    "public product API contains no non-active residue",
    !publicItems.some((item) => residue.some((record) => record.slug === item.slug)),
    publicItems.filter((item) => residue.some((record) => record.slug === item.slug)).map((item) => item.slug).join(",") || "none"
  );
  check(
    "public product API excludes sample fixtures and inactive departments",
    publicItems.every((item) => item.isSample === false && activeDepartments.some((row) => row.slug === item.category?.slug)),
    publicItems.filter((item) => item.isSample === true || !activeDepartments.some((row) => row.slug === item.category?.slug)).map((item) => item.slug).join(",") || "none"
  );

  const publicCategories = await getJson(`${BASE}/api/categories`);
  const publicCategorySlugs: string[] = Array.isArray(publicCategories.body)
    ? publicCategories.body.map((row: any) => row.slug)
    : [];
  check(
    "public navigation exposes only the nine active departments",
    publicCategories.status === 200 &&
      publicCategorySlugs.length === EXPECTED_ACTIVE_DEPARTMENTS &&
      publicCategorySlugs.slice().sort().join(",") === EXPECTED_ACTIVE_DEPARTMENT_SLUGS.join(","),
    `status=${publicCategories.status} categories=${publicCategorySlugs.sort().join(",")}`
  );
  check(
    "public navigation contains no inactive department",
    !publicCategorySlugs.some((slug) => inactiveDepartments.some((row) => row.slug === slug)),
    publicCategorySlugs.filter((slug) => inactiveDepartments.some((row) => row.slug === slug)).join(",") || "none"
  );

  const groceriesApi = await getJson(`${BASE}/api/products?category=groceries-household&page=1&pageSize=60`);
  check(
    "Groceries public category count includes batch B",
    groceriesApi.status === 200 && groceriesApi.body?.total === EXPECTED_GROCERIES_PRODUCTS,
    `status=${groceriesApi.status} total=${groceriesApi.body?.total ?? "none"}`
  );

  // Every inactive department: category API empty, name search empty.
  for (const record of runTaggedDepartments) {
    const categoryApi = await getJson(
      `${BASE}/api/products?category=${encodeURIComponent(record.slug)}&page=1&pageSize=60`
    );
    record.public.categoryApiTotal = categoryApi.body?.total ?? null;
    record.public.categoryApiContainsSlug = (categoryApi.body?.items ?? []).some(
      (item: any) => item.category?.slug === record.slug
    );
    check(
      `inactive department category API is empty: ${record.slug}`,
      categoryApi.status === 200 && categoryApi.body?.total === 0 && !record.public.categoryApiContainsSlug,
      `status=${categoryApi.status} total=${categoryApi.body?.total ?? "none"}`
    );

    const nameSearch = await getJson(
      `${BASE}/api/products?q=${encodeURIComponent(record.name)}&page=1&pageSize=60`
    );
    check(
      `inactive department name search is empty: ${record.slug}`,
      nameSearch.status === 200 && nameSearch.body?.total === 0,
      `status=${nameSearch.status} total=${nameSearch.body?.total ?? "none"}`
    );
  }

  // Every run tag: search must return nothing.
  const runTagQueries = [...new Set(runTagged.map((record) => record.runTag).filter(Boolean))] as string[];
  for (const tag of runTagQueries) {
    const search = await getJson(`${BASE}/api/products?q=${encodeURIComponent(tag)}&page=1&pageSize=60`);
    check(
      `run-tag search is empty: ${tag}`,
      search.status === 200 && search.body?.total === 0,
      `status=${search.status} total=${search.body?.total ?? "none"}`
    );
  }

  // Every non-active product: direct page 404 and exact-name search cannot
  // return that slug.
  for (const record of residue.filter((entry) => entry.kind === "product")) {
    const direct = await fetch(`${BASE}/product/${encodeURIComponent(record.slug)}`, { redirect: "manual" });
    const directHtml = await direct.text();
    record.public.directProductStatus = direct.status;
    record.public.directProductBodyContainsName = directHtml.includes(record.name);
    check(
      `non-active product direct page is 404: ${record.slug}`,
      direct.status === 404 && !directHtml.includes(record.name),
      `status=${direct.status} bodyContainsName=${directHtml.includes(record.name)}`
    );

    const search = await getJson(
      `${BASE}/api/products?q=${encodeURIComponent(record.name)}&page=1&pageSize=60`
    );
    record.public.nameSearchTotal = search.body?.total ?? null;
    check(
      `non-active product name search returns no residue: ${record.slug}`,
      search.status === 200 &&
        !(search.body?.items ?? []).some((item: any) => item.slug === record.slug),
      `status=${search.status} total=${search.body?.total ?? "none"}`
    );
  }

  // -----------------------------------------------------------------------
  // Browser checks: storefront, all-departments page, rendered category pages.
  // -----------------------------------------------------------------------
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  async function goto(url: string, attempts = 3) {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        return { response, error: null, attempt };
      } catch (error) {
        lastError = error as Error;
        if (attempt < attempts) await page.waitForTimeout(400 * attempt);
      }
    }
    return { response: null, error: lastError, attempt: attempts };
  }

  const storefront = await goto(`${BASE}/naijashop`);
  check(
    "Chromium storefront responds 200",
    storefront.response?.status() === 200,
    `status=${storefront.response?.status() ?? "none"} error=${storefront.error?.message.split("\n")[0] ?? "none"}`
  );
  let storefrontCards: string[] = [];
  let storefrontCategoryLinks: string[] = [];
  if (!storefront.error) {
    try {
      await page.waitForSelector("[data-product]", { state: "attached", timeout: 20000 });
      storefrontCards = await page.$$eval("[data-product]", (nodes) =>
        nodes.map((node) => node.getAttribute("data-product") || "")
      );
      storefrontCategoryLinks = await page.$$eval('a[href^="/naijashop/c/"]', (nodes) =>
        nodes.map((node) => node.getAttribute("href") || "")
      );
    } catch {
      storefrontCards = [];
    }
  }
  check(
    "storefront shelves render active products",
    storefrontCards.length > 0 && storefrontCards.every((slug) => activeProducts.some((row) => row.slug === slug)),
    `${storefrontCards.length} cards; unknown=${storefrontCards.filter((slug) => !activeProducts.some((row) => row.slug === slug)).join(",") || "none"}`
  );
  check(
    "storefront shelves contain no residue record",
    !storefrontCards.some((slug) => residue.some((record) => record.slug === slug)),
    storefrontCards.filter((slug) => residue.some((record) => record.slug === slug)).join(",") || "none"
  );
  check(
    "storefront navigation links only active departments",
    storefrontCategoryLinks.every((href) => activeDepartments.some((row) => href.endsWith(`/c/${row.slug}`))),
    storefrontCategoryLinks.filter((href) => !activeDepartments.some((row) => href.endsWith(`/c/${row.slug}`))).join(",") || "none"
  );

  const allDepartments = await goto(`${BASE}/naijashop/categories`);
  check(
    "Chromium all-departments page responds 200",
    allDepartments.response?.status() === 200,
    `status=${allDepartments.response?.status() ?? "none"} error=${allDepartments.error?.message.split("\n")[0] ?? "none"}`
  );
  let departmentLinks: string[] = [];
  let departmentsCards: string[] = [];
  if (!allDepartments.error) {
    try {
      await page.waitForSelector('aside a[href^="/naijashop/c/"]', { state: "attached", timeout: 20000 });
      departmentLinks = await page.$$eval('aside a[href^="/naijashop/c/"]', (nodes) =>
        nodes.map((node) => node.getAttribute("href") || "")
      );
      departmentsCards = await page.$$eval("[data-product]", (nodes) =>
        nodes.map((node) => node.getAttribute("data-product") || "")
      );
    } catch {
      departmentLinks = [];
    }
  }
  check(
    "all-departments sidebar links only the nine active departments",
    departmentLinks.length === EXPECTED_ACTIVE_DEPARTMENTS &&
      departmentLinks.every((href) => activeDepartments.some((row) => href.endsWith(`/c/${row.slug}`))),
    `${departmentLinks.length} links: ${departmentLinks.join(",")}`
  );
  check(
    "all-departments product grid contains no residue",
    departmentsCards.every((slug) => activeProducts.some((row) => row.slug === slug)),
    departmentsCards.filter((slug) => !activeProducts.some((row) => row.slug === slug)).join(",") || "none"
  );

  // Render every inactive department page and assert it has no product cards.
  for (const record of runTaggedDepartments) {
    const navigation = await goto(`${BASE}/naijashop/c/${encodeURIComponent(record.slug)}`);
    let cards: string[] = [];
    let missingMessage = false;
    if (!navigation.error) {
      try {
        await page.waitForFunction(
          () => {
            const text = document.body.innerText || "";
            return (
              text.includes("couldn’t find that department") ||
              text.includes("couldn't find that department") ||
              text.includes("No products match") ||
              document.querySelectorAll("[data-product]").length > 0
            );
          },
          { timeout: 20000 }
        );
        cards = await page.$$eval("[data-product]", (nodes) =>
          nodes.map((node) => node.getAttribute("data-product") || "")
        );
        const bodyText = await page.locator("body").innerText();
        missingMessage =
          bodyText.includes("couldn’t find that department") ||
          bodyText.includes("couldn't find that department");
      } catch {
        cards = [];
        missingMessage = false;
      }
    }
    record.public.categoryPageCards = cards;
    record.public.categoryPageMissingMessage = missingMessage;
    check(
      `inactive department page renders no product cards: ${record.slug}`,
      navigation.response?.status() === 200 && cards.length === 0 && missingMessage,
      `status=${navigation.response?.status() ?? "none"} cards=${cards.join(",") || "none"} missingMessage=${missingMessage}`
    );
  }

  // Representative search page and direct product page checks in Chromium.
  const representativeTags = runTagQueries.filter((tag) =>
    ["20261113132509-gxctv6", "20261112220518-ji8qmn", "47590u35kn", "mwe1w12d"].includes(tag)
  );
  for (const tag of representativeTags.length ? representativeTags : runTagQueries.slice(0, 3)) {
    const navigation = await goto(`${BASE}/naijashop/search?q=${encodeURIComponent(tag)}`);
    let cards: string[] = [];
    let emptyMessage = false;
    if (!navigation.error) {
      try {
        await page.waitForFunction(
          () =>
            (document.body.innerText || "").includes("No products match") ||
            document.querySelectorAll("[data-product]").length > 0,
          { timeout: 20000 }
        );
        cards = await page.$$eval("[data-product]", (nodes) =>
          nodes.map((node) => node.getAttribute("data-product") || "")
        );
        emptyMessage = (await page.locator("body").innerText()).includes("No products match");
      } catch {
        cards = [];
      }
    }
    check(
      `run-tag search page renders no products: ${tag}`,
      navigation.response?.status() === 200 && cards.length === 0 && emptyMessage,
      `status=${navigation.response?.status() ?? "none"} cards=${cards.join(",") || "none"} empty=${emptyMessage}`
    );
  }

  const representativeProducts = [
    residue.find((record) => record.slug === "demo-daily-sunscreen"),
    residue.find((record) => record.slug === "demo-acceptance-20261113132509-gxctv6"),
    residue.find((record) => record.slug === "demo-incomplete-probe-20261113132509-gxctv6"),
    residue.find((record) => record.slug === "demo-final-acceptance-blender-mwe1wwfo-mwe1x2nf")
  ].filter(Boolean) as ResidueRecord[];
  for (const record of representativeProducts) {
    const response = await page.goto(`${BASE}/product/${encodeURIComponent(record.slug)}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    }).catch(() => null);
    const text = await page.locator("body").innerText().catch(() => "");
    check(
      `Chromium direct page is a not-found response: ${record.slug}`,
      response?.status() === 404 && !text.includes(record.name),
      `status=${response?.status() ?? "none"} bodyContainsName=${text.includes(record.name)}`
    );
  }

  await browser.close();

  const failed = checks.filter((entry) => !entry.ok);
  const output = {
    scope: "REVIEW catalogue residue audit — non-public run-tagged departments and products",
    baseUrl: BASE,
    database: identity,
    checkedAt: new Date().toISOString(),
    baseline: {
      activeDepartments: activeDepartments.length,
      activeProducts: activeProducts.length,
      groceriesProducts: groceries.length,
      batchA: BATCH_A_SLUGS.map((slug) => products.find((row) => row.slug === slug)?.status ?? "missing"),
      batchB: BATCH_B_SLUGS.map((slug) => products.find((row) => row.slug === slug)?.status ?? "missing")
    },
    residue: {
      totalNonPublic: residue.length,
      runTaggedTotal: runTagged.length,
      runTaggedDepartments: runTaggedDepartments.length,
      runTaggedProducts: runTaggedProducts.length,
      archivedWorkflowProducts: archivedWorkflowProducts.length,
      draftWorkflowProducts: draftWorkflowProducts.length,
      unrelatedArchived: unrelatedArchived.map((record) => ({ slug: record.slug, name: record.name, state: record.state })),
      byFamily,
      byRunTag,
      records: residue.map((record) => ({
        kind: record.kind,
        id: record.id,
        name: record.name,
        slug: record.slug,
        state: record.state,
        isDemo: record.isDemo,
        categorySlug: record.categorySlug,
        runTag: record.runTag,
        family: record.family,
        ownerScript: record.ownerScript,
        runTagged: record.runTagged,
        public: record.public
      }))
    },
    checks,
    passed: checks.length - failed.length,
    total: checks.length,
    ok: failed.length === 0
  };

  try {
    const evidencePath = path.resolve(EVIDENCE_FILE);
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
    fs.writeFileSync(evidencePath, `${JSON.stringify(output, null, 2)}\n`);
    (output as any).evidencePath = path.relative(process.cwd(), evidencePath);
  } catch {
    /* evidence file is best-effort */
  }

  console.log(
    JSON.stringify(
      {
        scope: output.scope,
        baseUrl: output.baseUrl,
        database: output.database,
        baseline: output.baseline,
        residue: {
          totalNonPublic: output.residue.totalNonPublic,
          runTaggedTotal: output.residue.runTaggedTotal,
          runTaggedDepartments: output.residue.runTaggedDepartments,
          runTaggedProducts: output.residue.runTaggedProducts,
          archivedWorkflowProducts: output.residue.archivedWorkflowProducts,
          draftWorkflowProducts: output.residue.draftWorkflowProducts,
          unrelatedArchived: output.residue.unrelatedArchived,
          byFamily: output.residue.byFamily,
          byRunTag: output.residue.byRunTag
        },
        passed: output.passed,
        total: output.total,
        ok: output.ok,
        failedChecks: failed.slice(0, 20),
        evidencePath: (output as any).evidencePath
      },
      null,
      2
    )
  );
  return failed.length ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    const failure = {
      scope: "REVIEW catalogue residue audit — non-public run-tagged departments and products",
      baseUrl: BASE,
      checkedAt: new Date().toISOString(),
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      passed: checks.filter((entry) => entry.ok).length,
      total: checks.length
    };
    try {
      const evidencePath = path.resolve(EVIDENCE_FILE);
      fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
      fs.writeFileSync(evidencePath, `${JSON.stringify(failure, null, 2)}\n`);
    } catch {
      /* evidence file is best-effort */
    }
    console.error(JSON.stringify(failure, null, 2));
    process.exit(2);
  });
