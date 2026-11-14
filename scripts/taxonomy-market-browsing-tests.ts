#!/usr/bin/env node
/**
 * REVIEW taxonomy market, browsing and regulated-eligibility acceptance.
 *
 * Proves against an explicit REVIEW database and an isolated HTTP server:
 *   - the level-1 browsing projection follows the selected country/city and is
 *     derived from the database (no fixed 37-category client constant);
 *   - `browsingVisible=false` hides a category only from the rail/directory
 *     projection, never from `/api/taxonomy`, seller selection, category pages
 *     or product listings;
 *   - admin browsing/order/image edits flow to the rail/directory response and
 *     leave append-only audit evidence;
 *   - a regulated node with no explicit country rule is not publishable
 *     (`market_eligibility_unresolved`), while an explicit allow/deny rule
 *     resolves it for that country;
 *   - seller eligibility and admin publication gate on the same server rule.
 *
 * Usage:
 *   REVIEW_DATABASE_URL=postgresql://... \
 *     npx tsx scripts/taxonomy-market-browsing-tests.ts \
 *       --expect-db=naijadeals_review \
 *       --base-url=http://localhost:3062
 *
 * Run-owned categories, products, rules and sessions are removed in a finally
 * block. Audit/SystemEvent rows are append-only evidence and are retained.
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

type Json = Record<string, unknown>;

type CategoryRow = {
  id: string;
  key: string | null;
  name: string;
  slug: string;
  parentId: string | null;
  level: number;
  isActive: boolean;
  isSelectable: boolean;
  showOnHomepage: boolean;
  browsingVisible: boolean;
  isRegulated: boolean;
  deprecatedAt: Date | null;
  sortOrder: number;
};

type RuleRow = { categoryId: string; countryCode: string; canPublish: boolean; note: string | null };
type NodeLike = {
  id: string;
  slug: string;
  name: string;
  level: number;
  sortOrder: number;
  browsingVisible: boolean;
  canPublish: boolean;
  restrictionNote: string | null;
  restrictionReason: string | null;
  isRegulated: boolean;
  productCount: number;
  subtreeProductCount: number;
  parentId?: string | null;
  parentName?: string | null;
  children: NodeLike[];
};

const RUN_PREFIX = "taxmkt_";
let failures = 0;
let passes = 0;

function fail(message: string): never {
  console.error(`FAIL: ${sanitize(message)}`);
  process.exit(2);
}

function sanitize(message: string): string {
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "postgresql://[redacted]")
    .replace(/\b(password|passwd|pwd)\s*=\s*[^;\s"'`]+/gi, "$1=[redacted]")
    .slice(0, 900);
}

function parseExpectedDatabase(argv: string[]): string {
  const arg = argv.find((value) => value.startsWith("--expect-db="));
  const expected = arg?.slice("--expect-db=".length).trim();
  if (!expected) fail("--expect-db=<database-name> is required so the target cannot be guessed");
  if (!/^[A-Za-z0-9_]+$/.test(expected)) fail("--expect-db must contain only letters, digits and underscores");
  return expected;
}

function parseBaseUrl(argv: string[]): string {
  const arg = argv.find((value) => value.startsWith("--base-url="));
  if (!arg) fail("--base-url=http://localhost:<port> is required for the isolated HTTP checks");
  const value = arg.slice("--base-url=".length).trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(value)) fail("--base-url must be an http(s) URL");
  return value;
}

function resolveReviewUrl(expectedDb: string): string {
  const url = process.env.REVIEW_DATABASE_URL;
  if (!url) fail("REVIEW_DATABASE_URL is required; DATABASE_URL is never used as a fallback");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    fail("REVIEW_DATABASE_URL is not a valid URL");
  }
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) fail("REVIEW_DATABASE_URL must be a postgresql:// connection");
  const urlDatabase = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (urlDatabase !== expectedDb) fail(`REVIEW_DATABASE_URL points at ${urlDatabase || "(no database)"} but --expect-db=${expectedDb}`);
  return url;
}

async function step(name: string, fn: () => Promise<void>) {
  const started = Date.now();
  try {
    await fn();
    passes += 1;
    console.log(`PASS  ${name} — ${Date.now() - started}ms`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL  ${name} — ${sanitize(error instanceof Error ? error.message : String(error))}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectStatus(result: { status: number; body: unknown }, expected: number, label: string) {
  assert(
    result.status === expected,
    `${label}: expected HTTP ${expected}, got ${result.status} ${JSON.stringify(result.body).slice(0, 300)}`
  );
}

function asRecord(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function flattenNodes(nodes: unknown[]): NodeLike[] {
  const rows: NodeLike[] = [];
  const walk = (value: unknown) => {
    const node = asRecord(value);
    if (typeof node.id !== "string") return;
    rows.push(node as unknown as NodeLike);
    for (const child of asArray(node.children)) walk(child);
  };
  for (const node of nodes) walk(node);
  return rows;
}

function findNode(nodes: unknown[], value: string): NodeLike | null {
  return flattenNodes(nodes).find((node) => node.id === value || node.slug === value) ?? null;
}

function sortedRows<T extends { sortOrder: number; name: string; id: string }>(rows: T[]): T[] {
  return [...rows].sort(
    (left, right) =>
      left.sortOrder - right.sortOrder || left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
  );
}

/**
 * Independent expected browsing set from raw database rows. Deliberately does
 * not import the service: reachability, browsing visibility and per-country
 * regulated/rule semantics are recomputed here.
 */
function expectedBrowsingLevelOne(
  categories: CategoryRow[],
  rules: RuleRow[],
  countryCode: string
): CategoryRow[] {
  const byId = new Map(categories.map((row) => [row.id, row]));
  const rulesByKey = new Map(rules.map((rule) => [`${rule.categoryId}:${rule.countryCode.toUpperCase()}`, rule]));
  const reachable = (row: CategoryRow): boolean => {
    const seen = new Set<string>();
    let current: CategoryRow | undefined = row;
    while (current) {
      if (seen.has(current.id)) return false;
      seen.add(current.id);
      if (!current.isActive || current.deprecatedAt) return false;
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return true;
  };
  const publishable = (row: CategoryRow): boolean => {
    const seen = new Set<string>();
    let current: CategoryRow | undefined = row;
    while (current) {
      if (seen.has(current.id)) break;
      seen.add(current.id);
      const rule = rulesByKey.get(`${current.id}:${countryCode}`);
      if (rule) {
        if (!rule.canPublish) return false;
      } else if (current.isRegulated) {
        return false;
      }
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return true;
  };
  const eligible = new Set(
    categories
      .filter(
        (row) =>
          row.level === 1 && row.isActive && !row.deprecatedAt && row.browsingVisible && reachable(row) && publishable(row)
      )
      .map((row) => row.id)
  );
  const childrenByParent = new Map<string, CategoryRow[]>();
  for (const row of categories) {
    if (!row.parentId || !row.isActive || row.deprecatedAt) continue;
    const list = childrenByParent.get(row.parentId) ?? [];
    list.push(row);
    childrenByParent.set(row.parentId, list);
  }
  const roots = sortedRows(
    categories.filter((row) => row.level === 0 && !row.parentId && row.isActive && !row.deprecatedAt)
  );
  const ordered: CategoryRow[] = [];
  for (const root of roots) {
    for (const child of sortedRows(childrenByParent.get(root.id) ?? [])) {
      if (eligible.has(child.id)) ordered.push(child);
    }
  }
  return ordered;
}

async function getJson(url: string, cookie?: string): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { Origin: new URL(url).origin };
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000), cache: "no-store" });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 400) };
  }
  return { status: response.status, body };
}

class Http {
  private cookies = new Map<string, string>();
  constructor(private readonly base: string) {}

  cookieHeader() {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  async request(
    pathName: string,
    options: { method?: "GET" | "POST" | "PATCH"; body?: unknown; cookie?: string } = {}
  ): Promise<{ status: number; body: unknown; text: string }> {
    const headers: Record<string, string> = { Origin: this.base };
    const cookie = options.cookie ?? this.cookieHeader();
    if (cookie) headers.Cookie = cookie;
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(`${this.base}${pathName}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(60_000)
    });
    for (const entry of response.headers.getSetCookie?.() ?? []) {
      const [pair] = entry.split(";");
      const index = pair.indexOf("=");
      if (index > 0) this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    const text = await response.text();
    let body: unknown = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text.slice(0, 400) };
    }
    return { status: response.status, body, text };
  }

  get(pathName: string, cookie?: string) {
    return this.request(pathName, { cookie });
  }

  patch(pathName: string, body: unknown, cookie?: string) {
    return this.request(pathName, { method: "PATCH", body, cookie });
  }
}

function chromeExecutable(): string {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe"
  ].filter((value): value is string => Boolean(value));
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) fail("No Chromium browser found for the browser checks. Set CHROME_PATH.");
  return found;
}

async function browserWithLocale(
  browser: Browser,
  baseUrl: string,
  viewport: { width: number; height: number },
  country: string,
  city: string
): Promise<BrowserContext> {
  const context = await browser.newContext({ serviceWorkers: "block", viewport });
  const domain = new URL(baseUrl).hostname;
  await context.addCookies([
    { name: "nd_country", value: country, domain, path: "/" },
    { name: "nd_city", value: city, domain, path: "/" }
  ]);
  return context;
}

async function waitForRail(page: Page) {
  await page.waitForSelector("[data-category-rail]", { timeout: 150000 });
  await page.waitForFunction(
    () => document.querySelector("[data-category-rail-section]")?.getAttribute("data-counts-status") === "ready",
    null,
    { timeout: 90_000 }
  );
}

async function createSession(client: Client, email: string): Promise<{ id: string; token: string }> {
  const found = await client.query<{ id: string }>(`select id from "User" where email = $1`, [email]);
  const userId = found.rows[0]?.id;
  if (!userId) throw new Error(`run-owned session fixture user ${email} is missing from the REVIEW database`);
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const id = `txmkt-session-${randomBytes(8).toString("hex")}`;
  await client.query(
    `insert into "Session" (id, "userId", "tokenHash", "expiresAt")
     values ($1, $2, $3, $4)`,
    [id, userId, tokenHash, new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)]
  );
  return { id, token };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const expectedDb = parseExpectedDatabase(argv);
  const baseUrl = parseBaseUrl(argv);
  const reviewUrl = resolveReviewUrl(expectedDb);
  const runId = `TAXMKT-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString("hex").toUpperCase()}`;
  const runSlug = runId.toLowerCase();
  const runKey = `${RUN_PREFIX}${runId.toLowerCase().replace(/-/g, "_")}`;
  const runRegulatedKey = `${RUN_PREFIX}reg_${runId.toLowerCase().replace(/-/g, "_")}`;

  const client = new Client({
    connectionString: reviewUrl,
    connectionTimeoutMillis: 8000,
    application_name: "naijadeals-taxonomy-market-tests"
  });
  const http = new Http(baseUrl);
  const created = {
    browsingCategoryId: null as string | null,
    regulatedCategoryId: null as string | null,
    productId: null as string | null,
    sessionIds: [] as string[],
    marker: runId
  };

  try {
    await client.connect();
    const identity = await client.query<{ database: string }>("select current_database() as database");
    const actualDb = identity.rows[0]?.database ?? "";
    if (actualDb !== expectedDb) fail(`connected to ${actualDb || "(unknown)"} instead of ${expectedDb}`);
    const classification = await client.query<{ classification: string }>(
      'select classification from "DatabaseClassification"'
    );
    if (!classification.rows.some((row) => row.classification === "REVIEW")) {
      fail(`${actualDb} is not classified REVIEW`);
    }

    const columns = await client.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_name = 'Category' and column_name in ('browsingVisible','isRegulated')`
    );
    const columnNames = new Set(columns.rows.map((row) => row.column_name));
    assert(columnNames.has("browsingVisible"), "Category.browsingVisible is not migrated in REVIEW");
    assert(columnNames.has("isRegulated"), "Category.isRegulated is not migrated in REVIEW");

    const categories = await client.query<CategoryRow>(
      `select id, key, name, slug, "parentId", level, "isActive", "isSelectable", "showOnHomepage",
              "browsingVisible", "isRegulated", "deprecatedAt", "sortOrder"
         from "Category"`
    );
    const rules = await client.query<RuleRow>(
      `select "categoryId", "countryCode", "canPublish", note from "CategoryCountryRule"`
    );

    // ---- fixtures -------------------------------------------------------
    const department = categories.rows.find((row) => row.level === 0 && row.slug === "home-living");
    assert(department, "canonical home-living department is missing from REVIEW");
    const leafParent = categories.rows.find(
      (row) => row.level === 1 && row.parentId && row.isActive && !row.deprecatedAt && !row.isRegulated
    );
    assert(leafParent, "no canonical level-1 parent is available for the regulated fixture");

    const browsingCategory = await client.query<{ id: string }>(
      `insert into "Category"
         (id, key, name, slug, "parentId", level, "isActive", "isSelectable", "showOnHomepage",
          "browsingVisible", "isRegulated", "sortOrder", "createdAt")
       values ($1, $2, $3, $4, $5, 1, true, true, false, true, false, 100000, now())
       returning id`,
      [`txmkt${randomBytes(10).toString("hex")}`, runKey, `${runId} Browsing Category`, runSlug, department.id]
    );
    created.browsingCategoryId = browsingCategory.rows[0]?.id ?? null;
    assert(created.browsingCategoryId, "run-owned browsing category was not created");

    const regulatedCategory = await client.query<{ id: string }>(
      `insert into "Category"
         (id, key, name, slug, "parentId", level, "isActive", "isSelectable", "showOnHomepage",
          "browsingVisible", "isRegulated", "sortOrder", "createdAt")
       values ($1, $2, $3, $4, $5, 2, true, true, false, true, true, 100001, now())
       returning id`,
      [
        `txmktreg${randomBytes(10).toString("hex")}`,
        runRegulatedKey,
        `${runId} Regulated Leaf`,
        `${runSlug}-regulated`,
        leafParent.id
      ]
    );
    created.regulatedCategoryId = regulatedCategory.rows[0]?.id ?? null;
    assert(created.regulatedCategoryId, "run-owned regulated category was not created");

    // The service reads DATABASE_URL; point it at the verified REVIEW URL only
    // after the direct-pg guard has passed.
    process.env.DATABASE_URL = reviewUrl;
    const publicService = await import("../lib/services/taxonomy/public");
    const eligibilityService = await import("../lib/services/taxonomy/eligibility");

    const readCategories = async () => {
      const rows = await client.query<CategoryRow>(
        `select id, key, name, slug, "parentId", level, "isActive", "isSelectable", "showOnHomepage",
                "browsingVisible", "isRegulated", "deprecatedAt", "sortOrder"
           from "Category"`
      );
      const ruleRows = await client.query<RuleRow>(
        `select "categoryId", "countryCode", "canPublish", note from "CategoryCountryRule"`
      );
      return { categories: rows.rows, rules: ruleRows.rows };
    };

    // ---- service-level market projection --------------------------------
    await step("public tree exposes isRegulated and country-specific restriction reasons", async () => {
      const ngTree = await publicService.getPublicTaxonomy({ countryCode: "NG", city: "Lagos" });
      assert(ngTree.countryCode === "NG", `NG countryCode ${ngTree.countryCode}`);
      assert(ngTree.city === "Lagos", `NG city ${String(ngTree.city)}`);
      const ngLeaf = findNode(ngTree.departments, "otc-medicines-treatments");
      assert(ngLeaf, "regulated NG leaf is missing from the public tree");
      assert(ngLeaf.isRegulated === true, "NG regulated leaf isRegulated is not true");
      assert(ngLeaf.canPublish === false, "NG regulated leaf without permission was publishable");
      assert(ngLeaf.restrictionReason === "country_rule", `NG reason ${String(ngLeaf.restrictionReason)}`);
      assert(Boolean(ngLeaf.restrictionNote?.trim()), "NG regulated leaf has no restriction note");

      const ghTree = await publicService.getPublicTaxonomy({ countryCode: "GH", city: "Accra" });
      const ghLeaf = findNode(ghTree.departments, "otc-medicines-treatments");
      assert(ghLeaf, "regulated GH leaf is missing from the public tree");
      assert(ghLeaf.isRegulated === true, "GH regulated leaf isRegulated is not true");
      assert(ghLeaf.canPublish === false, "GH regulated leaf with no explicit rule was treated as permission");
      assert(
        ghLeaf.restrictionReason === "market_eligibility_unresolved",
        `GH reason ${String(ghLeaf.restrictionReason)}`
      );
      assert(
        !/^country_rule$/.test(String(ghLeaf.restrictionReason)),
        "GH absence of a rule must not be reported as an explicit deny"
      );
      const ghPlain = findNode(ghTree.departments, "phones-tablets");
      assert(ghPlain, "GH non-regulated category is missing");
      assert(ghPlain.canPublish === true, "GH non-regulated category is not publishable");
      assert(ghPlain.restrictionReason === null, `GH non-regulated reason ${String(ghPlain.restrictionReason)}`);
    });

    await step("level-1 browsing set and order match the selected REVIEW market", async () => {
      for (const country of ["NG", "GH"] as const) {
        const snapshot = await readCategories();
        const expected = expectedBrowsingLevelOne(snapshot.categories, snapshot.rules, country);
        const projection = await publicService.getPublicLevelOneCategories({
          countryCode: country,
          city: country === "NG" ? "Lagos" : "Accra"
        });
        assert(projection.countryCode === country, `${country} countryCode ${projection.countryCode}`);
        assert(
          projection.categories.length === expected.length,
          `${country} browsing categories ${projection.categories.length} != database ${expected.length}`
        );
        assert(
          projection.categories.every((node, index) => node.id === expected[index].id),
          `${country} browsing order differs from the database merchandising order`
        );
        assert(
          projection.categories.every((node) => node.level === 1 && node.browsingVisible),
          `${country} projection contains a non-level-1 or hidden node`
        );
        assert(
          projection.categories.some((node) => node.id === created.browsingCategoryId),
          `${country} run-owned browsing category is absent`
        );
      }
    });

    await step("browsingVisible=false hides browsing only; seller selection and publication stay unchanged", async () => {
      await client.query(`update "Category" set "browsingVisible" = false where id = $1`, [
        created.browsingCategoryId
      ]);
      const projection = await publicService.getPublicLevelOneCategories({ countryCode: "NG" });
      assert(
        !projection.categories.some((node) => node.id === created.browsingCategoryId),
        "hidden category leaked into the browsing projection"
      );
      const tree = await publicService.getPublicTaxonomy({ countryCode: "NG" });
      assert(
        findNode(tree.departments, created.browsingCategoryId as string),
        "browsingVisible=false removed the category from the published tree"
      );
      const seller = await eligibilityService.listSellerCategories("NG");
      assert(
        seller.categories.some((category) => category.id === created.browsingCategoryId),
        "browsingVisible=false removed the category from seller selection"
      );
      const publishable = await eligibilityService.assertSellerCategoryEligibility({
        categoryId: created.browsingCategoryId as string,
        countryCode: "NG"
      });
      assert(
        publishable.category.id === created.browsingCategoryId,
        "browsingVisible=false changed server-side publication eligibility"
      );
      await client.query(`update "Category" set "browsingVisible" = true where id = $1`, [
        created.browsingCategoryId
      ]);
    });

    await step("regulated run-owned category is unresolved until an explicit country rule exists", async () => {
      const ngBlocked = await eligibilityService
        .assertSellerCategoryEligibility({
          categoryId: created.regulatedCategoryId as string,
          countryCode: "NG"
        })
        .then(() => null)
        .catch((error) => error as { status?: number; code?: string; details?: Json });
      assert(ngBlocked, "NG regulated category without a rule was publishable");
      assert(ngBlocked.status === 403 && ngBlocked.code === "category_restricted", "NG regulated category did not fail closed");
      assert(ngBlocked.details?.reason === "market_eligibility_unresolved", `NG reason ${String(ngBlocked.details?.reason)}`);

      await client.query(
        `insert into "CategoryCountryRule" ("categoryId", "countryCode", "canPublish", note)
         values ($1, 'GH', false, $2)`,
        [created.regulatedCategoryId, `Run-owned GH deny ${runId}.`]
      );
      const ghTree = await publicService.getPublicTaxonomy({ countryCode: "GH" });
      const ghDenied = findNode(ghTree.departments, created.regulatedCategoryId as string);
      assert(ghDenied?.canPublish === false, "explicit GH deny did not block publishing");
      assert(ghDenied?.restrictionReason === "country_rule", `GH deny reason ${String(ghDenied?.restrictionReason)}`);
      const ghDeniedEligibility = await eligibilityService
        .assertSellerCategoryEligibility({
          categoryId: created.regulatedCategoryId as string,
          countryCode: "GH"
        })
        .then(() => null)
        .catch((error) => error as { status?: number; details?: Json });
      assert(ghDeniedEligibility?.status === 403, "explicit GH deny was publishable");
      assert(ghDeniedEligibility.details?.reason === "country_rule", "explicit GH deny lost its reason");

      await client.query(
        `update "CategoryCountryRule" set "canPublish" = true, note = $2
          where "categoryId" = $1 and "countryCode" = 'GH'`,
        [created.regulatedCategoryId, `Run-owned GH allow ${runId}.`]
      );
      const ghAllowed = await eligibilityService.assertSellerCategoryEligibility({
        categoryId: created.regulatedCategoryId as string,
        countryCode: "GH"
      });
      assert(ghAllowed.category.id === created.regulatedCategoryId, "explicit GH allow did not resolve eligibility");
      const ghTreeAllowed = await publicService.getPublicTaxonomy({ countryCode: "GH" });
      const ghNode = findNode(ghTreeAllowed.departments, created.regulatedCategoryId as string);
      assert(ghNode?.canPublish === true, "explicit GH allow did not publish");
      assert(ghNode?.restrictionReason === null, `explicit GH allow reason ${String(ghNode?.restrictionReason)}`);

      const ngStillBlocked = await publicService.getPublicTaxonomy({ countryCode: "NG" });
      const ngNode = findNode(ngStillBlocked.departments, created.regulatedCategoryId as string);
      assert(ngNode?.canPublish === false, "GH rule incorrectly granted NG publishing");
      assert(
        ngNode?.restrictionReason === "market_eligibility_unresolved",
        `NG still-unresolved reason ${String(ngNode?.restrictionReason)}`
      );

      const sellerGh = await eligibilityService.listSellerCategories("GH");
      const sellerRow = sellerGh.categories.find((category) => category.id === created.regulatedCategoryId);
      assert(sellerRow, "regulated category is missing from the GH seller picker");
      assert(sellerRow.canPublish === true, "GH seller picker did not reflect the explicit allow");
      assert(sellerRow.isRegulated === true, "GH seller picker lost isRegulated");
    });

    // ---- HTTP / admin / UI contract -------------------------------------
    let ready = false;
    for (let attempt = 0; attempt < 75; attempt += 1) {
      try {
        const probe = await getJson(`${baseUrl}/api/taxonomy`);
        if (probe.status === 200) {
          ready = true;
          break;
        }
      } catch {
        /* server still compiling */
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    assert(ready, `isolated server ${baseUrl} did not serve /api/taxonomy within 150s`);

    const admin = await createSession(client, "review-admin@review.invalid");
    const seller = await createSession(client, "review-seller@review.invalid");
    created.sessionIds.push(admin.id, seller.id);
    const adminCookie = `nd_session=${admin.token}`;
    const sellerCookie = `nd_session=${seller.token}`;

    await step("HTTP market query returns the selected country/city and level-1 projection", async () => {
      const tree = await http.get("/api/taxonomy?country=NG&city=Lagos");
      expectStatus(tree, 200, "GET /api/taxonomy NG Lagos");
      const treeBody = asRecord(tree.body);
      assert(treeBody.countryCode === "NG" && treeBody.city === "Lagos", "taxonomy market context was not echoed");
      const level = await http.get("/api/taxonomy/categories?country=NG&city=Lagos");
      expectStatus(level, 200, "GET /api/taxonomy/categories NG Lagos");
      const levelBody = asRecord(level.body);
      assert(levelBody.countryCode === "NG" && levelBody.city === "Lagos", "level-1 market context was not echoed");
      const rows = asArray(levelBody.categories);
      const snapshot = await readCategories();
      const expected = expectedBrowsingLevelOne(snapshot.categories, snapshot.rules, "NG");
      assert(rows.length === expected.length, `HTTP level-1 rows ${rows.length} != database ${expected.length}`);
      assert(
        rows.every((row, index) => String(asRecord(row).id) === expected[index].id),
        "HTTP level-1 order differs from the database"
      );
      assert(
        rows.some((row) => asRecord(row).id === created.browsingCategoryId),
        "HTTP level-1 projection omitted the run-owned browsing category"
      );
      const invalidCity = await http.get("/api/taxonomy?country=NG&city=" + "x".repeat(81));
      expectStatus(invalidCity, 400, "GET /api/taxonomy invalid city");
      assert(asRecord(invalidCity.body).code === "invalid_city", "invalid city did not return invalid_city");
    });

    const vendor = await client.query<{ id: string }>(
      `select id from "Vendor" where status = 'VERIFIED' order by name limit 1`
    );
    const vendorId = vendor.rows[0]?.id;
    assert(vendorId, "no VERIFIED vendor exists for the run-owned product fixture");
    const productId = `txmktprod${randomBytes(10).toString("hex")}`;
    created.productId = productId;
    await client.query(
      `insert into "Product"
         (id, "vendorId", "categoryId", name, slug, description, "priceKobo", "countryCode",
          status, "isSample", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, $6, 250000, 'NG', 'ACTIVE', false, now(), now())`,
      [
        productId,
        vendorId,
        created.browsingCategoryId,
        `${runId} Browsing Product`,
        `${runSlug}-browsing-product`,
        "Run-owned product fixture proving browsing visibility does not hide listings."
      ]
    );

    await step("admin browsing/order/image edit flows to the rail projection and preserves audit", async () => {
      const patch = await http.patch(
        `/api/admin/taxonomy/${created.browsingCategoryId}`,
        {
          browsingVisible: false,
          sortOrder: 100000,
          imageUrl: "/generated/shop/hero-desktop.webp",
          imageAlt: `${runId} browsing category image`
        },
        adminCookie
      );
      expectStatus(patch, 200, "PATCH admin taxonomy browsing/order/image");
      const hidden = await http.get("/api/taxonomy/categories?country=NG");
      expectStatus(hidden, 200, "GET level-1 after hiding");
      assert(
        !asArray(asRecord(hidden.body).categories).some((row) => asRecord(row).id === created.browsingCategoryId),
        "admin browsingVisible=false did not hide the category from the rail projection"
      );
      const published = await http.get("/api/taxonomy?country=NG");
      expectStatus(published, 200, "GET taxonomy after hiding");
      const hiddenNode = findNode(asArray(asRecord(published.body).departments), created.browsingCategoryId as string);
      assert(hiddenNode, "admin browsingVisible=false removed the published taxonomy node");
      assert(hiddenNode.browsingVisible === false, "published tree did not reflect browsingVisible=false");

      const sellerCategories = await http.get("/api/seller/categories", sellerCookie);
      expectStatus(sellerCategories, 200, "GET seller categories");
      assert(
        asArray(asRecord(sellerCategories.body).categories).some(
          (row) => asRecord(row).id === created.browsingCategoryId
        ),
        "browsingVisible=false removed the category from seller selection"
      );

      const products = await http.get(`/api/products?category=${encodeURIComponent(runSlug)}&page=1&pageSize=5`);
      expectStatus(products, 200, "GET products in hidden-from-browsing category");
      const items = asArray(asRecord(products.body).items);
      assert(items.some((item) => asRecord(item).id === productId), "browsingVisible=false hid product listings");
      const categoryPage = await http.get(`/naijashop/c/${encodeURIComponent(runSlug)}`);
      expectStatus(categoryPage, 200, "GET category page after browsingVisible=false");

      const audit = await client.query<{ metadata: Json; action: string }>(
        `select action, metadata from "AuditLog"
          where "entityId" = $1 and action = 'taxonomy.category.updated'
          order by "createdAt" desc limit 1`,
        [created.browsingCategoryId]
      );
      const auditRow = audit.rows[0];
      assert(auditRow, "admin taxonomy edit did not create an audit row");
      const metadata = asRecord(auditRow.metadata);
      assert(asRecord(metadata.before).browsingVisible === true, "audit before.browsingVisible is missing");
      assert(asRecord(metadata.after).browsingVisible === false, "audit after.browsingVisible is missing");
      assert(
        asRecord(metadata.after).imageUrl === "/generated/shop/hero-desktop.webp",
        "audit after.imageUrl is missing"
      );

      const restore = await http.patch(
        `/api/admin/taxonomy/${created.browsingCategoryId}`,
        { browsingVisible: true, sortOrder: 0 },
        adminCookie
      );
      expectStatus(restore, 200, "PATCH admin taxonomy restore browsing/order");
      const visible = await http.get("/api/taxonomy/categories?country=NG");
      expectStatus(visible, 200, "GET level-1 after restoring");
      const rows = asArray(asRecord(visible.body).categories).map((row) => asRecord(row));
      const runRow = rows.find((row) => row.id === created.browsingCategoryId);
      assert(runRow, "admin browsingVisible=true did not return the category to the rail projection");
      assert(runRow.imageUrl === "/generated/shop/hero-desktop.webp", "admin image edit did not flow to the projection");
      assert(runRow.imageAlt === `${runId} browsing category image`, "admin image alt edit did not flow to the projection");
      assert(runRow.sortOrder === 0, "admin sortOrder edit did not flow to the projection");
      const snapshot = await readCategories();
      const expected = expectedBrowsingLevelOne(snapshot.categories, snapshot.rules, "NG");
      assert(
        rows.every((row, index) => String(row.id) === expected[index]?.id),
        "admin order edit did not produce the database merchandising order"
      );
    });

    await step("selected market changes the browsing set (NG visible, GH restricted by explicit rule)", async () => {
      const patch = await http.patch(
        `/api/admin/taxonomy/${created.browsingCategoryId}`,
        {
          countryRules: [
            { countryCode: "GH", canPublish: false, note: `Run-owned GH browsing restriction ${runId}.` }
          ]
        },
        adminCookie
      );
      expectStatus(patch, 200, "PATCH admin taxonomy GH rule");
      const ng = await http.get("/api/taxonomy/categories?country=NG");
      expectStatus(ng, 200, "GET level-1 NG");
      const gh = await http.get("/api/taxonomy/categories?country=GH");
      expectStatus(gh, 200, "GET level-1 GH");
      const ngRows = asArray(asRecord(ng.body).categories).map((row) => asRecord(row));
      const ghRows = asArray(asRecord(gh.body).categories).map((row) => asRecord(row));
      assert(
        ngRows.some((row) => row.id === created.browsingCategoryId),
        "run-owned category is missing from NG browsing"
      );
      assert(
        !ghRows.some((row) => row.id === created.browsingCategoryId),
        "run-owned category with an explicit GH deny leaked into GH browsing"
      );
      assert(ngRows.length === ghRows.length + 1, `NG/GH browsing counts ${ngRows.length}/${ghRows.length} are not market-scoped`);
    });

    // ---- browser: selected market, dynamic count, states -----------------
    let browser: Browser | null = null;
    try {
      const activeBrowser = await chromium.launch({ executablePath: chromeExecutable(), headless: true });
      browser = activeBrowser;

      await step("browser rail and directory follow the selected market and dynamic API count", async () => {
        const ng = await http.get("/api/taxonomy/categories?country=NG&city=Lagos");
        const gh = await http.get("/api/taxonomy/categories?country=GH&city=Accra");
        expectStatus(ng, 200, "GET NG categories for browser");
        expectStatus(gh, 200, "GET GH categories for browser");
        const ngRows = asArray(asRecord(ng.body).categories).map((row) => asRecord(row));
        const ghRows = asArray(asRecord(gh.body).categories).map((row) => asRecord(row));
        assert(ngRows.length !== ghRows.length, "NG/GH browsing counts must differ for the run-owned market rule");

        const ngContext = await browserWithLocale(activeBrowser, baseUrl, { width: 390, height: 844 }, "NG", "Lagos");
        const ngPage = await ngContext.newPage();
        const pageErrors: string[] = [];
        ngPage.on("pageerror", (error) => pageErrors.push(error.message));
        await ngPage.goto(`${baseUrl}/naijashop`, { waitUntil: "load", timeout: 180_000 });
        await waitForRail(ngPage);
        await ngPage.waitForSelector("[data-storefront-shelf]", { timeout: 90_000 });
        const ngState = await ngPage.evaluate(() => {
          const cards = Array.from(document.querySelectorAll("[data-category-card]"));
          const rail = document.querySelector("[data-category-rail-section]");
          const firstShelf = document.querySelector("[data-storefront-shelf]");
          return {
            slugs: cards.map((card) => card.getAttribute("data-category-slug")),
            summary: rail?.textContent ?? "",
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            firstShelfTop: firstShelf ? Math.round(firstShelf.getBoundingClientRect().top + window.scrollY) : null,
            railTop: rail ? Math.round(rail.getBoundingClientRect().top + window.scrollY) : null
          };
        });
        assert(
          ngState.slugs.length === ngRows.length,
          `NG rail cards ${ngState.slugs.length} != API ${ngRows.length}`
        );
        assert(
          ngState.slugs.every((slug, index) => slug === String(ngRows[index]?.slug)),
          "NG rail order differs from the API merchandising order"
        );
        assert(ngState.slugs.includes(runSlug), "NG rail is missing the admin-visible run-owned category");
        const runCardImage = await ngPage
          .locator(`[data-category-card][data-category-slug="${runSlug}"] img`)
          .getAttribute("src");
        assert(
          runCardImage === "/generated/shop/hero-desktop.webp",
          `admin image edit did not render in the rail: ${String(runCardImage)}`
        );
        assert(ngState.summary.includes(`${ngRows.length} categor`), "NG rail summary does not use the API count");
        assert(ngState.overflow <= 1, `NG rail page overflows horizontally by ${ngState.overflow}px`);
        assert(
          ngState.firstShelfTop !== null && ngState.railTop !== null && ngState.firstShelfTop < ngState.railTop,
          `first product shelf is not before the rail (${String(ngState.firstShelfTop)} >= ${String(ngState.railTop)})`
        );
        assert(pageErrors.length === 0, `storefront page error: ${pageErrors[0] ?? ""}`);

        const ghContext = await browserWithLocale(activeBrowser, baseUrl, { width: 390, height: 844 }, "GH", "Accra");
        const ghPage = await ghContext.newPage();
        await ghPage.goto(`${baseUrl}/naijashop`, { waitUntil: "load", timeout: 180_000 });
        await waitForRail(ghPage);
        const ghSlugs = await ghPage.$$eval("[data-category-card]", (cards) =>
          cards.map((card) => card.getAttribute("data-category-slug"))
        );
        assert(ghSlugs.length === ghRows.length, `GH rail cards ${ghSlugs.length} != API ${ghRows.length}`);
        assert(
          ghSlugs.every((slug, index) => slug === String(ghRows[index]?.slug)),
          "GH rail order differs from the API merchandising order"
        );
        assert(!ghSlugs.includes(runSlug), "GH rail leaked a category explicitly restricted for GH");

        const directoryNg = await browserWithLocale(activeBrowser, baseUrl, { width: 768, height: 1024 }, "NG", "Lagos");
        const directoryPage = await directoryNg.newPage();
        await directoryPage.goto(`${baseUrl}/naijashop/categories`, { waitUntil: "load", timeout: 180_000 });
        await directoryPage.waitForSelector("[data-category-directory-card]", { timeout: 120_000 });
        const directorySlugs = await directoryPage.$$eval("[data-category-directory-card]", (cards) =>
          cards.map((card) => card.getAttribute("data-category-slug"))
        );
        assert(directorySlugs.length === ngRows.length, `NG directory cards ${directorySlugs.length} != API ${ngRows.length}`);
        assert(
          directorySlugs.every((slug, index) => slug === String(ngRows[index]?.slug)),
          "NG directory order differs from the API grouping/order"
        );
        assert(directorySlugs.includes(runSlug), "NG directory is missing the run-owned category");
        assert(
          (await directoryPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1,
          "NG directory overflows horizontally"
        );

        const directoryGh = await browserWithLocale(activeBrowser, baseUrl, { width: 768, height: 1024 }, "GH", "Accra");
        const directoryGhPage = await directoryGh.newPage();
        await directoryGhPage.goto(`${baseUrl}/naijashop/categories`, { waitUntil: "load", timeout: 180_000 });
        await directoryGhPage.waitForSelector("[data-category-directory-card]", { timeout: 120_000 });
        const directoryGhSlugs = await directoryGhPage.$$eval("[data-category-directory-card]", (cards) =>
          cards.map((card) => card.getAttribute("data-category-slug"))
        );
        assert(directoryGhSlugs.length === ghRows.length, `GH directory cards ${directoryGhSlugs.length} != API ${ghRows.length}`);
        assert(
          directoryGhSlugs.every((slug, index) => slug === String(ghRows[index]?.slug)),
          "GH directory order differs from the API grouping/order"
        );
        assert(!directoryGhSlugs.includes(runSlug), "GH directory leaked a category explicitly restricted for GH");

        await ngContext.close();
        await ghContext.close();
        await directoryNg.close();
        await directoryGh.close();
      });

      await step("browser rail and directory handle categories-endpoint error and empty states", async () => {
        const errorContext = await browserWithLocale(activeBrowser, baseUrl, { width: 1440, height: 900 }, "NG", "Lagos");
        const errorPage = await errorContext.newPage();
        await errorPage.route("**/api/taxonomy/categories*", (route) => route.abort());
        await errorPage.goto(`${baseUrl}/naijashop`, { waitUntil: "load", timeout: 180_000 });
        const noticeVisible = await errorPage
          .getByText(/browsing category list could not be loaded/i)
          .first()
          .waitFor({ state: "visible", timeout: 120_000 })
          .then(() => true)
          .catch(() => false);
        const railCount = await errorPage.locator("[data-category-rail]").count();
        assert(noticeVisible && railCount === 0, `rail error notice=${noticeVisible}, rail=${railCount}`);
        await errorPage.goto(`${baseUrl}/naijashop/categories`, { waitUntil: "load", timeout: 180_000 });
        const alertVisible = await errorPage
          .getByRole("alert")
          .first()
          .waitFor({ state: "visible", timeout: 120_000 })
          .then(() => true)
          .catch(() => false);
        const retry = await errorPage.getByRole("button", { name: /try again/i }).count();
        const directoryCards = await errorPage.locator("[data-category-directory-card]").count();
        assert(alertVisible && retry > 0 && directoryCards === 0, `directory error alert=${alertVisible}, retry=${retry}, cards=${directoryCards}`);

        const emptyContext = await browserWithLocale(activeBrowser, baseUrl, { width: 1440, height: 900 }, "NG", "Lagos");
        const emptyPage = await emptyContext.newPage();
        await emptyPage.route("**/api/taxonomy/categories*", (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ countryCode: "NG", city: "Lagos", categories: [] })
          })
        );
        await emptyPage.goto(`${baseUrl}/naijashop`, { waitUntil: "load", timeout: 180_000 });
        const emptyRail = emptyPage.locator('[data-category-rail-section][data-counts-status="empty"]');
        const emptyRailVisible = await emptyRail
          .waitFor({ state: "visible", timeout: 120_000 })
          .then(() => true)
          .catch(() => false);
        const emptyRailText = emptyRailVisible ? await emptyRail.innerText() : "";
        assert(
          emptyRailVisible && /No published categories are available/i.test(emptyRailText),
          `empty rail state missing: ${emptyRailText.slice(0, 120)}`
        );
        await emptyPage.goto(`${baseUrl}/naijashop/categories`, { waitUntil: "load", timeout: 180_000 });
        const emptyDirectoryVisible = await emptyPage
          .getByText(/No published categories yet/i)
          .first()
          .waitFor({ state: "visible", timeout: 120_000 })
          .then(() => true)
          .catch(() => false);
        const emptyDirectoryCards = await emptyPage.locator("[data-category-directory-card]").count();
        assert(emptyDirectoryVisible && emptyDirectoryCards === 0, "directory empty state is missing or padded");

        await errorContext.close();
        await emptyContext.close();
      });

      await step("browser applies browsing/publish flags and reports missing counts honestly", async () => {
        const normal = await http.get("/api/taxonomy/categories?country=NG&city=Lagos");
        expectStatus(normal, 200, "GET NG categories for flag browser check");
        const rows = asArray(asRecord(normal.body).categories).map((row) => ({ ...asRecord(row) }));
        const hiddenBrowsing = String(rows[0]?.slug ?? "");
        const hiddenCountry = String(rows[1]?.slug ?? "");
        assert(hiddenBrowsing && hiddenCountry, "not enough categories for the flag browser check");
        const flagged = structuredClone(rows);
        flagged[0].browsingVisible = false;
        flagged[1].canPublish = false;
        const expected = flagged
          .filter((row) => row.browsingVisible !== false && row.canPublish !== false)
          .map((row) => String(row.id));

        const flagContext = await browserWithLocale(activeBrowser, baseUrl, { width: 1440, height: 900 }, "NG", "Lagos");
        const flagPage = await flagContext.newPage();
        await flagPage.route("**/api/taxonomy/categories*", (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ countryCode: "NG", city: "Lagos", categories: flagged })
          })
        );
        await flagPage.goto(`${baseUrl}/naijashop`, { waitUntil: "load", timeout: 180_000 });
        await waitForRail(flagPage);
        const rendered = await flagPage.$$eval("[data-category-card]", (cards) =>
          cards.map((card) => card.getAttribute("data-category-slug"))
        );
        assert(rendered.length === expected.length, `flag rail cards ${rendered.length} != expected ${expected.length}`);
        assert(!rendered.includes(hiddenBrowsing), "browsingVisible=false leaked into the rail");
        assert(!rendered.includes(hiddenCountry), "canPublish=false leaked into the rail");
        await flagContext.close();

        const noCounts = structuredClone(rows);
        delete noCounts[0].productCount;
        delete noCounts[0].subtreeProductCount;
        const countContext = await browserWithLocale(activeBrowser, baseUrl, { width: 1440, height: 900 }, "NG", "Lagos");
        const countPage = await countContext.newPage();
        await countPage.route("**/api/taxonomy/categories*", (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ countryCode: "NG", city: "Lagos", categories: noCounts })
          })
        );
        await countPage.goto(`${baseUrl}/naijashop`, { waitUntil: "load", timeout: 180_000 });
        await countPage.waitForSelector("[data-category-rail]", { timeout: 150_000 });
        const unavailable = await countPage.getByText(/Listing count unavailable/i).count();
        assert(unavailable > 0, "missing rail count was not reported as unavailable");
        await countPage.goto(`${baseUrl}/naijashop/categories`, { waitUntil: "load", timeout: 180_000 });
        await countPage.waitForSelector("[data-category-directory]", { timeout: 120_000 });
        const directoryStatus = await countPage.locator("[data-category-directory]").getAttribute("data-counts-status");
        const directoryText = await countPage.locator("[data-category-directory]").innerText();
        assert(
          directoryStatus === "unavailable" && /Listing count unavailable/i.test(directoryText),
          `directory missing-count status=${String(directoryStatus)}`
        );
        await countContext.close();
      });
    } finally {
      await browser?.close().catch(() => undefined);
    }

    // ---- source guarantee: no fixed category count -----------------------
    await step("storefront, rail and directory contain no hardcoded 37-category count", async () => {
      const files = [
        "components/shop/storefront.tsx",
        "components/shop/category-rail.tsx",
        "components/shop/category-directory.tsx",
        "app/naijashop/categories/page.tsx"
      ];
      for (const relative of files) {
        const source = readFileSync(path.join(process.cwd(), relative), "utf8");
        assert(!/\b37\b/.test(source), `${relative} contains a hardcoded 37 count`);
      }
    });
  } finally {
    try {
      if (created.productId) {
        await client.query(`delete from "Product" where id = $1`, [created.productId]);
      }
      for (const id of [created.browsingCategoryId, created.regulatedCategoryId]) {
        if (!id) continue;
        await client.query(`delete from "CategoryCountryRule" where "categoryId" = $1`, [id]);
        await client.query(`delete from "Category" where id = $1`, [id]);
      }
      if (created.sessionIds.length > 0) {
        await client.query(`delete from "Session" where id = any($1::text[])`, [created.sessionIds]);
      }
    } catch (error) {
      console.error(`CLEANUP: ${sanitize(error instanceof Error ? error.message : String(error))}`);
    }
    await client.end().catch(() => undefined);
  }

  console.log("");
  console.log(`RESULT ${passes}/${passes + failures} checks passed (run ${created.marker}).`);
  if (failures > 0) {
    console.error(`FAILED ${failures} check(s).`);
    process.exit(1);
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
