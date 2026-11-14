/**
 * African Discovery storefront acceptance tests.
 *
 * Scope: the public discovery section, its draft/publish editorial flow, admin
 * authorization, validation, responsive composition and the regression paths
 * around the existing storefront (shelves, cart, archived listings, country
 * row).
 *
 * The script writes only StorefrontConfig draft/published JSON. It never
 * mutates products, categories, users or financial rows. Every config write is
 * restored in a finally block.
 *
 * Usage (server must be running with the same database):
 *   DATABASE_URL=postgresql://.../naijadeals_review \
 *   TEST_BASE_URL=http://localhost:3055 \
 *   npx tsx scripts/storefront-discovery-tests.ts
 *
 * Safety: DATABASE_URL must resolve to the canonical REVIEW database (or an
 * explicitly supplied TEST_DATABASE_URL classified TEST). The script verifies
 * current_database(), the DatabaseClassification marker, required tables, and
 * that the running app serves a product from that same database. Connection
 * strings are never printed.
 *
 * Optional credentials (otherwise the REVIEW fixture files are used):
 *   STOREFRONT_TEST_ADMIN_EMAIL / STOREFRONT_TEST_ADMIN_PASSWORD
 *   STOREFRONT_TEST_CUSTOMER_EMAIL / STOREFRONT_TEST_CUSTOMER_PASSWORD
 */
import "dotenv/config";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client as PgClient } from "pg";
import { chromium, type Browser, type Page } from "playwright-core";
import { AFRICAN_FEATURE_SLUGS } from "../lib/config/storefront-discovery";

const BASE = (process.env.TEST_BASE_URL || "http://localhost:3055").replace(/\/$/, "");
const CHROME = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const SHOTS = path.join(process.cwd(), "qa-artifacts", "visual", "african-discovery");
const ORIGIN = BASE;
const CONFIG_FIELDS = [
  "announcement",
  "heroTitle",
  "heroSubtitle",
  "visibleCategories",
  "categoryOrder",
  "shelfLimit",
  "showDemoProducts",
  "showHero",
  "showShelves",
  "heroSlides",
  "showAfricanDiscovery",
  "africanFeaturedProductIds",
  "africanDiscoveryEyebrow",
  "africanDiscoveryTitle",
  "africanDiscoveryIntro",
  "africanDiscoveryLinks",
  "discoveryCards"
] as const;

type CheckResult = { name: string; status: "PASS" | "FAIL" | "SKIP"; detail: string };
const results: CheckResult[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function step(name: string, fn: () => Promise<string>) {
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

type HttpResult = { status: number; body: any; text: string };

class ApiClient {
  private cookies = new Map<string, string>();

  async request(
    pathname: string,
    options: { method?: string; body?: unknown; origin?: string } = {}
  ): Promise<HttpResult> {
    const headers: Record<string, string> = { Origin: options.origin ?? ORIGIN };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (this.cookies.size > 0) {
      headers.Cookie = [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
    }
    const response = await fetch(`${ORIGIN}${pathname}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      redirect: "manual"
    });
    const setCookies = response.headers.getSetCookie?.() ?? [];
    for (const entry of setCookies) {
      const pair = entry.split(";")[0];
      const index = pair.indexOf("=");
      if (index > 0) this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    return { status: response.status, body, text };
  }

  get(pathname: string) {
    return this.request(pathname);
  }

  async login(email: string, password: string) {
    const result = await this.request("/api/auth/login", { method: "POST", body: { email, password } });
    assert(result.status === 200, `login failed: HTTP ${result.status}`);
    return result.body;
  }
}

function expectStatus(result: HttpResult, expected: number, label: string) {
  assert(
    result.status === expected,
    `${label}: expected HTTP ${expected}, got ${result.status} ${JSON.stringify(result.body ?? result.text).slice(0, 240)}`
  );
}

function credentials(
  emailName: string,
  passwordName: string,
  file: string,
  label: string
): { email: string; password: string } {
  const email = process.env[emailName]?.trim();
  const password = process.env[passwordName]?.trim();
  if (email && password) return { email, password };
  const full = path.join(process.cwd(), file);
  if (existsSync(full)) {
    const lines = readFileSync(full, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length >= 2) return { email: lines[0], password: lines[1] };
  }
  throw new Error(`${label} credentials are not configured. Set ${emailName}/${passwordName}.`);
}

function pickConfig(source: Record<string, any>): Record<string, any> {
  const next: Record<string, any> = {};
  for (const key of CONFIG_FIELDS) next[key] = source[key];
  return next;
}

async function adminState(admin: ApiClient) {
  const result = await admin.get("/api/admin/storefront");
  expectStatus(result, 200, "admin storefront state");
  assert(isRecord(result.body), "admin state is not an object");
  return result.body;
}

async function draftPayload(admin: ApiClient, overrides: Record<string, unknown>) {
  const state = await adminState(admin);
  const base = isRecord(state.draft) ? state.draft : pickConfig(state);
  return { ...pickConfig(base), version: state.version, mode: "draft", ...overrides };
}

async function saveDraft(admin: ApiClient, overrides: Record<string, unknown>) {
  return admin.request("/api/admin/storefront", {
    method: "PATCH",
    body: await draftPayload(admin, overrides)
  });
}

async function publishDraft(admin: ApiClient, baseVersion: number) {
  return admin.request("/api/admin/storefront", {
    method: "POST",
    body: { baseVersion }
  });
}

function assertNoPrivateKeys(config: Record<string, any>, label: string) {
  assert(!("draft" in config), `${label}: draft key leaked to the public config`);
  assert(!("version" in config), `${label}: internal version leaked to the public config`);
}

async function loadDiscoveryPage(browser: Browser, width: number): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height: 1100 } });
  await page.goto(`${BASE}/naijashop`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForSelector("[data-african-feature]", { timeout: 60000 });
  await page.locator("[data-african-feature]").scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () => {
      const images = [...document.querySelectorAll<HTMLImageElement>("[data-african-feature] img")];
      return images.length > 0 && images.every((image) => image.complete && image.naturalWidth > 0);
    },
    null,
    { timeout: 30000 }
  );
  return page;
}

async function main() {
  if (!existsSync(SHOTS)) mkdirSync(SHOTS, { recursive: true });

  const connectionString =
    process.env.TEST_DATABASE_URL || process.env.NAIJADEALS_TEST_DATABASE_URL || process.env.DATABASE_URL;
  assert(connectionString, "Set DATABASE_URL to the canonical REVIEW database (or TEST_DATABASE_URL).");
  // Guard without printing the connection string.
  const db = new PgClient({ connectionString });
  await db.connect();
  const databaseName = (await db.query<{ current_database: string }>("SELECT current_database()")).rows[0].current_database;
  let classification = "";
  try {
    classification =
      (await db.query<{ classification: string }>('SELECT classification FROM "DatabaseClassification" LIMIT 1')).rows[0]
        ?.classification ?? "";
  } catch {
    classification = "";
  }
  const deny = new Set([
    "naijadeals_core",
    "naijadeals_prod",
    "naijadeals_production",
    "naijadeals_live",
    "naijadeals_shared",
    "postgres",
    "template0",
    "template1"
  ]);
  const explicitTestUrl = Boolean(process.env.TEST_DATABASE_URL || process.env.NAIJADEALS_TEST_DATABASE_URL);
  const allowedTarget =
    (databaseName === "naijadeals_review" && classification === "REVIEW") ||
    (explicitTestUrl && classification === "TEST" && !deny.has(databaseName));
  assert(
    allowedTarget,
    `Refusing to write: database "${databaseName}" is not a verified REVIEW target (classification "${classification || "none"}").`
  );
  const requiredTables = ["StorefrontConfig", "Product", "Category", "AuditLog", "SystemEvent"];
  const tableRows = await db.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1)`,
    [requiredTables]
  );
  const present = new Set(tableRows.rows.map((row) => row.table_name));
  const missing = requiredTables.filter((table) => !present.has(table));
  assert(missing.length === 0, `Required tables are missing: ${missing.join(", ")}`);

  const sampleProduct = await db.query<{ id: string; slug: string }>(
    `SELECT id, slug FROM "Product" WHERE "isDemo" = true AND status = 'ACTIVE' ORDER BY "createdAt" ASC LIMIT 1`
  );
  assert(sampleProduct.rows[0], "No ACTIVE demo product exists to verify the server database.");
  const serverProducts = await new ApiClient().get("/api/products?country=NG");
  expectStatus(serverProducts, 200, "products API");
  assert(
    Array.isArray(serverProducts.body) && serverProducts.body.some((product: any) => product.id === sampleProduct.rows[0].id),
    `The app at ${BASE} is not serving the verified database (${databaseName}). Start it with the same DATABASE_URL.`
  );

  const snapshot = await db.query<{ config: string; updatedBy: string | null; updatedAt: string }>(
    `SELECT config::text AS config, "updatedBy", "updatedAt"::text AS "updatedAt" FROM "StorefrontConfig" WHERE id = 'default'`
  );
  const previousRow = snapshot.rows[0] ?? null;
  const productCountBefore = (await db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM "Product"')).rows[0].n;

  const adminCredentials = credentials(
    "STOREFRONT_TEST_ADMIN_EMAIL",
    "STOREFRONT_TEST_ADMIN_PASSWORD",
    "qa-artifacts/review-basket/.admin-credential",
    "REVIEW admin"
  );
  const customerCredentials = credentials(
    "STOREFRONT_TEST_CUSTOMER_EMAIL",
    "STOREFRONT_TEST_CUSTOMER_PASSWORD",
    "qa-artifacts/review-basket/.credential",
    "REVIEW customer"
  );

  const anon = new ApiClient();
  const admin = new ApiClient();
  const customer = new ApiClient();
  let browser: Browser | null = null;
  let startTime = new Date();

  try {
    const adminLogin = await admin.login(adminCredentials.email, adminCredentials.password);
    const customerLogin = await customer.login(customerCredentials.email, customerCredentials.password);
    assert(adminLogin?.user?.id, "admin login did not return a user id");
    assert(customerLogin?.user?.id, "customer login did not return a user id");
    startTime = new Date();

    await step("source composition: no two-column left void; one products row and one discovery strip", async () => {
      const source = readFileSync(path.join(process.cwd(), "components/shop/storefront.tsx"), "utf8");
      const start = source.indexOf("function AfricanDiscovery(");
      const end = source.indexOf("function MarketplaceSkeleton(");
      assert(start > 0 && end > start, "AfricanDiscovery source block not found");
      const block = source.slice(start, end);
      assert(!block.includes("lg:grid-cols-["), "AfricanDiscovery still contains a two-column grid template");
      assert(block.includes("data-african-products"), "products row marker missing");
      assert(block.includes("data-african-discovery-strip"), "discovery strip marker missing");
      assert(block.includes("lg:flex-row"), "desktop heading row is not a single full-width row");
      assert(source.includes("<CountryDiscoveryRow"), "the 54-country discovery row is no longer rendered");
      return "single heading row, products row, discovery strip, country row present";
    });

    await step("public config contains discovery fields and no draft/version", async () => {
      const result = await anon.get("/api/storefront");
      expectStatus(result, 200, "public storefront config");
      assertNoPrivateKeys(result.body, "public config");
      assert(typeof result.body.showAfricanDiscovery === "boolean", "showAfricanDiscovery missing");
      assert(Array.isArray(result.body.africanFeaturedProductIds), "africanFeaturedProductIds missing");
      assert(Array.isArray(result.body.discoveryCards) && result.body.discoveryCards.length === 4, "four discovery cards expected");
      for (const card of result.body.discoveryCards) {
        assert(typeof card.label === "string" && card.label.length > 0, "card label missing");
        assert(typeof card.imageAlt === "string" && card.imageAlt.length > 0, "card alt missing");
        assert(typeof card.imageUrl === "string" && card.imageUrl.startsWith("/generated/"), "card image must be generated");
        assert(["/naijashop/countries", "/naijashop/categories", "/sell", "/naijasend"].includes(card.href), "unknown card destination");
      }
      return `v-less public config, ${result.body.discoveryCards.length} cards`;
    });

    await step("discovery destinations and country directory resolve", async () => {
      for (const href of ["/naijashop/countries", "/naijashop/categories", "/sell", "/naijasend"]) {
        const result = await anon.get(href);
        expectStatus(result, 200, href);
      }
      const countryCount = await db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM "CountryProfile"');
      assert(countryCount.rows[0].n === 54, `expected 54 country profiles, found ${countryCount.rows[0].n}`);
      return "4 destinations HTTP 200; 54 country profiles";
    });

    await step("anonymous cannot read admin state or draft preview or publish", async () => {
      expectStatus(await anon.get("/api/admin/storefront"), 401, "anon admin GET");
      expectStatus(await anon.get("/api/admin/storefront/preview"), 401, "anon preview GET");
      expectStatus(
        await anon.request("/api/admin/storefront", { method: "PATCH", body: { version: 1, mode: "draft" } }),
        401,
        "anon draft PATCH"
      );
      expectStatus(await anon.request("/api/admin/storefront", { method: "POST", body: { baseVersion: 1 } }), 401, "anon publish POST");
      expectStatus(await anon.request("/api/admin/storefront?version=1", { method: "DELETE" }), 401, "anon discard DELETE");
      return "admin GET/preview/draft/publish/discard all 401";
    });

    await step("customer cannot read admin state, preview or publish", async () => {
      expectStatus(await customer.get("/api/admin/storefront"), 403, "customer admin GET");
      expectStatus(await customer.get("/api/admin/storefront/preview"), 403, "customer preview GET");
      expectStatus(
        await customer.request("/api/admin/storefront", { method: "PATCH", body: { version: 1, mode: "draft" } }),
        403,
        "customer draft PATCH"
      );
      expectStatus(await customer.request("/api/admin/storefront", { method: "POST", body: { baseVersion: 1 } }), 403, "customer publish POST");
      expectStatus(await customer.request("/api/admin/storefront?version=1", { method: "DELETE" }), 403, "customer discard DELETE");
      return "admin GET/preview/draft/publish/discard all 403";
    });

    await step("admin state exposes four eligible African candidates", async () => {
      const state = await adminState(admin);
      assert(Array.isArray(state.featuredCandidates), "featuredCandidates missing");
      assert(state.featuredCandidates.length >= 4, `expected at least 4 candidates, found ${state.featuredCandidates.length}`);
      for (const candidate of state.featuredCandidates) {
        assert(
          (AFRICAN_FEATURE_SLUGS as readonly string[]).includes(candidate.categorySlug),
          `${candidate.name} is outside the African feature categories`
        );
      }
      return `${state.featuredCandidates.length} candidates in approved categories`;
    });

    await step("mutations require the same origin", async () => {
      const state = await adminState(admin);
      const crossSitePatch = await admin.request("/api/admin/storefront", {
        method: "PATCH",
        origin: "https://evil.example",
        body: { ...pickConfig(state), version: state.version, mode: "draft" }
      });
      expectStatus(crossSitePatch, 403, "cross-origin draft PATCH");
      const crossSitePost = await admin.request("/api/admin/storefront", {
        method: "POST",
        origin: "https://evil.example",
        body: { baseVersion: state.version }
      });
      expectStatus(crossSitePost, 403, "cross-origin publish POST");
      return "cross-origin PATCH/POST rejected with 403";
    });

    await step("invalid hrefs, images, listings and copy are rejected", async () => {
      const state = await adminState(admin);
      const candidates = state.featuredCandidates as Array<{ id: string; categorySlug: string; slug: string }>;
      assert(candidates.length >= 4, "not enough featured candidates for validation checks");
      const cards = (state.draft?.discoveryCards ?? state.discoveryCards) as Array<Record<string, any>>;
      const outside = await db.query<{ id: string }>(
        `SELECT p.id FROM "Product" p JOIN "Category" c ON c.id = p."categoryId"
         WHERE p.status = 'ACTIVE' AND p."isSample" = false AND c.slug <> ALL($1) LIMIT 1`,
        [[...AFRICAN_FEATURE_SLUGS]]
      );
      const archived = await db.query<{ id: string }>(
        `SELECT p.id FROM "Product" p JOIN "Category" c ON c.id = p."categoryId"
         WHERE p.status = 'ARCHIVED' AND c.slug = ANY($1) LIMIT 1`,
        [[...AFRICAN_FEATURE_SLUGS]]
      );
      let rejected = 0;
      const attempt = async (label: string, overrides: Record<string, unknown>) => {
        const result = await saveDraft(admin, overrides);
        expectStatus(result, 400, label);
        rejected += 1;
      };

      const validIds = candidates.slice(0, 4).map((candidate) => candidate.id);
      await attempt("external discovery href", {
        discoveryCards: cards.map((card, index) => (index === 0 ? { ...card, href: "https://example.com/shop" } : card))
      });
      await attempt("missing card image", {
        discoveryCards: cards.map((card, index) =>
          index === 0 ? { ...card, imageUrl: `/generated/definitely-missing-${RUN_ID}.webp` } : card
        )
      });
      await attempt("external card image", {
        discoveryCards: cards.map((card, index) =>
          index === 0 ? { ...card, imageUrl: "https://example.com/asset.webp" } : card
        )
      });
      await attempt("long card label", {
        discoveryCards: cards.map((card, index) => (index === 0 ? { ...card, label: "x".repeat(41) } : card))
      });
      await attempt("blank card alt", {
        discoveryCards: cards.map((card, index) => (index === 0 ? { ...card, imageAlt: "" } : card))
      });
      await attempt("unknown category link", {
        africanDiscoveryLinks: [{ label: "Missing", href: "/naijashop/c/does-not-exist" }]
      });
      await attempt("external category link", {
        africanDiscoveryLinks: [{ label: "External", href: "https://example.com/c/fabric" }]
      });
      assert(outside.rows[0], "no ACTIVE product outside the African feature categories");
      await attempt("featured listing outside approved categories", { africanFeaturedProductIds: [outside.rows[0].id] });
      if (archived.rows[0]) {
        await attempt("archived featured listing", { africanFeaturedProductIds: [archived.rows[0].id] });
      }
      await attempt("more than four featured listings", {
        africanFeaturedProductIds: [...validIds, outside.rows[0].id]
      });
      await attempt("duplicate featured listing", { africanFeaturedProductIds: [validIds[0], validIds[0]] });
      await attempt("non-boolean section visibility", { showAfricanDiscovery: "yes" });
      await attempt("blank section heading", { africanDiscoveryTitle: "" });
      await attempt("unimplemented section copy length", { africanDiscoveryTitle: "x".repeat(91) });

      const after = await adminState(admin);
      assert(after.draft === null, "an invalid request unexpectedly created a draft");
      return `${rejected} invalid payloads rejected; no draft created`;
    });

    const orderedCandidates = (await adminState(admin)).featuredCandidates.slice(0, 4);
    const orderedIds = orderedCandidates.map((candidate: any) => candidate.id);
    const orderedSlugs = orderedCandidates.map((candidate: any) => candidate.slug);
    const draftTitle = `African discovery draft ${RUN_ID}`;
    const draftCardLabel = `Discover Africa ${RUN_ID.slice(-4)}`;
    let publishedVersion = 0;

    await step("draft stays private until publish and previews for authorized staff", async () => {
      const before = await adminState(admin);
      const cards = before.discoveryCards as Array<Record<string, any>>;
      const draft = await saveDraft(admin, {
        africanDiscoveryTitle: draftTitle,
        africanFeaturedProductIds: orderedIds,
        showAfricanDiscovery: true,
        discoveryCards: cards.map((card, index) => (index === 0 ? { ...card, label: draftCardLabel } : card))
      });
      expectStatus(draft, 200, "save draft");
      assert(isRecord(draft.body.draft), "draft not returned");
      assert(draft.body.version === before.version, "published version changed while saving a draft");

      const publicNow = await anon.get("/api/storefront");
      expectStatus(publicNow, 200, "public config after draft");
      assertNoPrivateKeys(publicNow.body, "public config after draft");
      assert(publicNow.body.africanDiscoveryTitle !== draftTitle, "draft title leaked publicly");
      assert(publicNow.body.discoveryCards[0].label !== draftCardLabel, "draft card label leaked publicly");
      assert(!JSON.stringify(publicNow.body).includes(RUN_ID), "draft content leaked publicly");
      assert(JSON.stringify(publicNow.body.africanFeaturedProductIds) === "[]", "draft featured ids leaked publicly");

      const adminNow = await adminState(admin);
      assert(isRecord(adminNow.draft), "admin state lost the draft");
      assert(adminNow.draft.africanDiscoveryTitle === draftTitle, "admin draft title mismatch");
      assert(adminNow.africanDiscoveryTitle !== draftTitle, "admin GET overwrote published config with draft");

      const preview = await admin.get("/api/admin/storefront/preview");
      expectStatus(preview, 200, "preview");
      assert(preview.body.isDraft === true, "preview did not report a draft");
      assert(preview.body.preview.africanDiscoveryTitle === draftTitle, "preview did not serve draft copy");

      expectStatus(await anon.get("/api/admin/storefront/preview"), 401, "anon preview after draft");
      expectStatus(await customer.get("/api/admin/storefront/preview"), 403, "customer preview after draft");
      return `draft saved at published v${before.version}; public unchanged; preview draft-only`;
    });

    await step("publish applies order, copy and cards with an audit trail", async () => {
      const before = await adminState(admin);
      const stalePublish = await publishDraft(admin, before.version - 1);
      expectStatus(stalePublish, 409, "stale publish");

      const published = await publishDraft(admin, before.version);
      expectStatus(published, 200, "publish draft");
      publishedVersion = published.body.version;
      assert(published.body.version === before.version + 1, "publish did not increment the version");
      assert(published.body.draft === null, "publish did not clear the draft");

      const publicNow = await anon.get("/api/storefront");
      expectStatus(publicNow, 200, "public config after publish");
      assertNoPrivateKeys(publicNow.body, "public config after publish");
      assert(publicNow.body.africanDiscoveryTitle === draftTitle, "published title not served");
      assert(
        JSON.stringify(publicNow.body.africanFeaturedProductIds) === JSON.stringify(orderedIds),
        "published featured order does not match the saved order"
      );
      assert(publicNow.body.discoveryCards[0].label === draftCardLabel, "published card copy not served");
      assert(publicNow.body.showAfricanDiscovery === true, "published section visibility not served");

      const audit = await db.query<{ action: string; metadata: any }>(
        `SELECT action, metadata FROM "AuditLog" WHERE "createdAt" >= $1 AND action = ANY($2) ORDER BY "createdAt" DESC`,
        [startTime, ["storefront.draft_saved", "storefront.published"]]
      );
      const actions = new Set(audit.rows.map((row) => row.action));
      assert(actions.has("storefront.draft_saved"), "draft save was not audited");
      assert(actions.has("storefront.published"), "publish was not audited");
      const publishRow = audit.rows.find((row) => row.action === "storefront.published");
      assert(
        JSON.stringify(publishRow?.metadata ?? {}).includes("africanDiscoveryTitle"),
        "publish audit did not record the changed section copy"
      );
      return `published v${publishedVersion}; order, copy, cards and audit verified`;
    });

    await step("responsive composition, accessibility basics and screenshots", async () => {
      browser = await chromium.launch({ executablePath: CHROME, headless: true });
      const measurements: string[] = [];
      for (const width of [1440, 1024, 768, 390]) {
        const page = await loadDiscoveryPage(browser, width);
        const metrics = await page.evaluate(() => {
          const section = document.querySelector("[data-african-feature]") as HTMLElement | null;
          const products = document.querySelector("[data-african-products]") as HTMLElement | null;
          const strip = document.querySelector("[data-african-discovery-strip] ul") as HTMLElement | null;
          const header = section?.querySelector(":scope > div > div:first-child") as HTMLElement | null;
          const links = [...(section?.querySelectorAll("a") ?? [])].map((link) => link.getBoundingClientRect().height);
          return {
            viewport: window.innerWidth,
            overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
            sectionHeight: section?.getBoundingClientRect().height ?? 0,
            productCount: document.querySelectorAll("[data-african-products] li").length,
            cardCount: document.querySelectorAll("[data-discovery-card]").length,
            productColumns: products ? getComputedStyle(products).gridTemplateColumns.split(" ").length : 0,
            stripColumns: strip ? getComputedStyle(strip).gridTemplateColumns.split(" ").length : 0,
            headerDirection: header ? getComputedStyle(header).flexDirection : "",
            minimumLinkHeight: links.length > 0 ? Math.min(...links) : 0,
            shelfCount: document.querySelectorAll("[data-storefront-shelf]").length,
            countryCount: document.querySelectorAll("[data-country-card]").length
          };
        });
        assert(!metrics.overflow, `${width}px: horizontal overflow detected`);
        assert(metrics.productCount === 4, `${width}px: expected 4 featured products, found ${metrics.productCount}`);
        assert(metrics.cardCount === 4, `${width}px: expected 4 discovery cards, found ${metrics.cardCount}`);
        assert(metrics.minimumLinkHeight >= 40, `${width}px: a control is shorter than 40px`);
        assert(metrics.shelfCount > 0, `${width}px: existing storefront shelves disappeared`);
        assert(metrics.countryCount === 54, `${width}px: expected the 54-country row, found ${metrics.countryCount}`);
        if (width >= 1024) {
          assert(metrics.headerDirection === "row", `${width}px: heading row is not horizontal`);
          assert(metrics.productColumns === 4, `${width}px: featured row is not four columns`);
          assert(metrics.stripColumns === 4, `${width}px: discovery strip is not four columns`);
        } else {
          assert(metrics.headerDirection === "column", `${width}px: heading row should stack`);
          assert(metrics.productColumns === 2, `${width}px: featured grid should be two columns`);
          assert(metrics.stripColumns === 2, `${width}px: discovery strip should be two columns`);
          assert(metrics.sectionHeight < 1800, `${width}px: section is excessively tall (${metrics.sectionHeight}px)`);
        }

        const firstCard = page.locator("[data-discovery-card] a").first();
        await firstCard.focus();
        const focusedTag = await page.evaluate(() => document.activeElement?.tagName ?? "");
        assert(focusedTag === "A", `${width}px: discovery card is not keyboard-focusable`);
        await page.keyboard.press("Tab");
        assert(
          await page.evaluate(() => document.activeElement?.tagName === "A"),
          `${width}px: Tab did not move to the next card link`
        );

        await page.screenshot({
          path: path.join(SHOTS, `run-${RUN_ID}-${width}.png`),
          fullPage: false
        });
        const section = page.locator("[data-african-feature]");
        await section.screenshot({ path: path.join(SHOTS, `run-${RUN_ID}-section-${width}.png`) });
        measurements.push(`${width}:${Math.round(metrics.sectionHeight)}px/${metrics.productColumns}x${metrics.stripColumns}`);
        await page.close();
      }

      const reduced = await browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: "reduce" });
      const reducedPage = await reduced.newPage();
      await reducedPage.goto(`${BASE}/naijashop`, { waitUntil: "networkidle", timeout: 120000 });
      await reducedPage.waitForSelector("[data-african-feature]");
      const transitions = await reducedPage.evaluate(() => {
        const link = document.querySelector("[data-african-item] a") as HTMLElement | null;
        const image = document.querySelector("[data-african-feature] img") as HTMLElement | null;
        return {
          link: link ? getComputedStyle(link).transitionProperty : "",
          image: image ? getComputedStyle(image).transitionProperty : ""
        };
      });
      assert(transitions.link === "none", "reduced motion still animates the featured card");
      assert(transitions.image === "none", "reduced motion still animates the card image");
      await reduced.close();
      return measurements.join("; ");
    });

    await step("featured selection order is applied on the public page", async () => {
      assert(browser, "browser not started");
      const page = await loadDiscoveryPage(browser as Browser, 1440);
      const slugs = await page.evaluate(() =>
        [...document.querySelectorAll("[data-african-item]")].map((item) => item.getAttribute("data-african-item"))
      );
      assert(JSON.stringify(slugs) === JSON.stringify(orderedSlugs), `DOM order ${JSON.stringify(slugs)} != configured ${JSON.stringify(orderedSlugs)}`);
      const labels = await page.evaluate(() =>
        [...document.querySelectorAll("[data-discovery-card]")].map((card) => card.getAttribute("data-discovery-card"))
      );
      assert(labels[0] === "discover-africa", "configured discovery card order is not applied");
      await page.close();
      return `orders match: ${slugs.join(", ")}`;
    });

    await step("disabled section disappears from the public storefront", async () => {
      const save = await saveDraft(admin, { showAfricanDiscovery: false });
      expectStatus(save, 200, "save disabled section draft");
      const state = await adminState(admin);
      const published = await publishDraft(admin, state.version);
      expectStatus(published, 200, "publish disabled section");

      const page = await browser!.newPage({ viewport: { width: 1440, height: 1000 } });
      await page.goto(`${BASE}/naijashop`, { waitUntil: "networkidle", timeout: 120000 });
      const counts = await page.evaluate(() => ({
        section: document.querySelectorAll("[data-african-feature]").length,
        shelves: document.querySelectorAll("[data-storefront-shelf]").length,
        countries: document.querySelectorAll("[data-country-card]").length
      }));
      assert(counts.section === 0, "disabled section still rendered");
      assert(counts.shelves > 0, "disabling the section removed the existing shelves");
      assert(counts.countries === 54, "disabling the section removed the country row");
      const configRows = await db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM "StorefrontConfig"');
      assert(configRows.rows[0].n === 1, "disabling the section deleted the config row");
      const productRows = await db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM "Product"');
      assert(productRows.rows[0].n === productCountBefore, "disabling the section deleted product rows");
      await page.close();
      return "section absent; shelves, 54-country row, config row and product rows intact";
    });

    await step("disabled discovery card disappears while the section stays", async () => {
      const state = await adminState(admin);
      const cards = (state.draft ?? state).discoveryCards as Array<Record<string, any>>;
      const save = await saveDraft(admin, {
        showAfricanDiscovery: true,
        discoveryCards: cards.map((card, index) => (index === 0 ? { ...card, enabled: false } : { ...card, enabled: true }))
      });
      expectStatus(save, 200, "save one-card-disabled draft");
      const afterSave = await adminState(admin);
      const published = await publishDraft(admin, afterSave.version);
      expectStatus(published, 200, "publish one-card-disabled");

      const page = await loadDiscoveryPage(browser!, 1440);
      const stateDom = await page.evaluate(() => ({
        section: document.querySelectorAll("[data-african-feature]").length,
        cards: [...document.querySelectorAll("[data-discovery-card]")].map((card) => card.getAttribute("data-discovery-card"))
      }));
      assert(stateDom.section === 1, "section disappeared when only a card was disabled");
      assert(stateDom.cards.length === 3, `expected 3 enabled cards, found ${stateDom.cards.length}`);
      assert(!stateDom.cards.includes("discover-africa"), "disabled card still rendered");
      await page.close();
      return "3 cards render; disabled card absent";
    });

    await step("existing storefront shelves, cart, archived 404 and country row still work", async () => {
      const shop = await anon.get("/naijashop");
      expectStatus(shop, 200, "shop page");
      const products = await anon.get("/api/products?country=NG");
      expectStatus(products, 200, "products API");
      assert(Array.isArray(products.body) && products.body.length > 0, "catalogue returned no products");

      const cart = await customer.get("/api/cart");
      expectStatus(cart, 200, "customer cart API");
      const cartPage = await customer.get("/cart");
      expectStatus(cartPage, 200, "customer cart page");

      const archived = await db.query<{ slug: string }>('SELECT slug FROM "Product" WHERE status = $1 LIMIT 1', ["ARCHIVED"]);
      if (archived.rows[0]) {
        const missing = await anon.get(`/product/${encodeURIComponent(archived.rows[0].slug)}`);
        expectStatus(missing, 404, "archived product page");
      }

      const page = await browser!.newPage({ viewport: { width: 1440, height: 1000 } });
      await page.goto(`${BASE}/naijashop`, { waitUntil: "networkidle", timeout: 120000 });
      const counts = await page.evaluate(() => ({
        shelves: document.querySelectorAll("[data-storefront-shelf]").length,
        countries: document.querySelectorAll("[data-country-card]").length,
        availability: document.querySelector("[data-storefront-availability]")?.getAttribute("data-storefront-availability")
      }));
      assert(counts.shelves > 0, "no storefront shelves rendered");
      assert(counts.countries === 54, `expected 54 country cards, found ${counts.countries}`);
      assert(counts.availability === "LIVE", `shop availability is ${counts.availability}`);
      await page.close();
      return `shelves ${counts.shelves}; cart 200; archived 404; country row 54; ${counts.availability}`;
    });

    await step("stale draft publish conflicts and discard restores published state", async () => {
      const before = await adminState(admin);
      const configuredTitle = before.africanDiscoveryTitle as string;
      const save = await saveDraft(admin, { africanDiscoveryTitle: `Conflict draft ${RUN_ID}` });
      expectStatus(save, 200, "save conflict draft");
      const conflict = await publishDraft(admin, before.version - 1);
      expectStatus(conflict, 409, "publish with stale base version");
      assert(
        conflict.body?.code === "version_conflict" || conflict.body?.code === "draft_stale",
        `unexpected conflict code: ${JSON.stringify(conflict.body)}`
      );
      const state = await adminState(admin);
      assert(isRecord(state.draft), "failed publish discarded the draft unexpectedly");
      assert(state.africanDiscoveryTitle === configuredTitle, "failed publish changed the published section title");

      const staleDiscard = await admin.request(`/api/admin/storefront?version=${before.version - 1}`, { method: "DELETE" });
      expectStatus(staleDiscard, 409, "discard with stale version");
      const discard = await admin.request(`/api/admin/storefront?version=${state.version}`, { method: "DELETE" });
      expectStatus(discard, 200, "discard draft");
      const after = await adminState(admin);
      assert(after.draft === null, "discard did not clear the draft");
      assert(after.africanDiscoveryTitle === configuredTitle, "discard changed the published section title");
      return "409 on stale publish/discard; correct discard cleared only the draft";
    });

    await step("legacy PATCH still publishes directly for existing clients", async () => {
      const before = await adminState(admin);
      const result = await admin.request("/api/admin/storefront", {
        method: "PATCH",
        body: { version: before.version, announcement: before.announcement }
      });
      expectStatus(result, 200, "legacy direct PATCH");
      assert(result.body.version === before.version + 1, "legacy PATCH did not increment the published version");
      assert(result.body.draft === null, "legacy PATCH left a draft attached");
      const publicNow = await anon.get("/api/storefront");
      expectStatus(publicNow, 200, "public config after legacy PATCH");
      assertNoPrivateKeys(publicNow.body, "public config after legacy PATCH");
      assert(publicNow.body.announcement === before.announcement, "legacy PATCH did not preserve the announcement");
      const audit = await db.query<{ action: string }>(
        `SELECT action FROM "AuditLog" WHERE "createdAt" >= $1 AND action = 'storefront.updated'`,
        [startTime]
      );
      assert(audit.rows.length > 0, "legacy PATCH was not audited");
      return `v${before.version} -> v${result.body.version}; storefront.updated audited`;
    });

    await step("admin panel saves a draft, previews it and publishes", async () => {
      assert(browser, "browser not started");
      const adminContext = await (browser as Browser).newContext({ viewport: { width: 1440, height: 1000 } });
      const page = await adminContext.newPage();
      await page.goto(`${BASE}/admin?tab=products`, { waitUntil: "networkidle", timeout: 120000 });
      if (page.url().includes("/login")) {
        await page.fill("input[type=email]", adminCredentials.email);
        await page.fill("input[type=password]", adminCredentials.password);
        await Promise.all([
          page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60000 }),
          page.click("button[type=submit]")
        ]);
        await page.goto(`${BASE}/admin?tab=products`, { waitUntil: "networkidle", timeout: 120000 });
      }
      await page.waitForSelector("[data-admin-storefront]", { timeout: 60000 });
      const beforeUi = await adminState(admin);
      const beforeIds = beforeUi.africanFeaturedProductIds as string[];
      assert(beforeIds.length === 4, `expected four featured ids before the UI test, found ${beforeIds.length}`);
      const candidateById = new Map(
        (beforeUi.featuredCandidates as Array<{ id: string; slug: string }>).map((candidate) => [candidate.id, candidate])
      );
      const expectedIds = [beforeIds[1], beforeIds[0], ...beforeIds.slice(2)];
      const expectedSlugs = expectedIds.map((id) => candidateById.get(id)?.slug);
      assert(expectedSlugs.every(Boolean), "a selected featured candidate disappeared from the admin state");

      const uiTitle = `UI published ${RUN_ID}`;
      await page.locator('[data-storefront-field="africanDiscoveryTitle"]').fill(uiTitle);
      const firstCardToggle = page.locator(
        '[data-discovery-card-editor="discover-africa"] [data-discovery-card-field="enabled"]'
      );
      if (!(await firstCardToggle.isChecked())) await firstCardToggle.check();
      await page
        .locator('ol[aria-label="Selected featured listings, in storefront order"] li')
        .first()
        .locator('button[aria-label$="down"]')
        .click();
      await page.click("[data-storefront-save-draft]");
      await page.waitForFunction(
        () => /Draft saved/.test(document.querySelector("[data-draft-status]")?.textContent ?? ""),
        null,
        { timeout: 30000 }
      );
      const previewHref = await page.locator("[data-storefront-preview]").getAttribute("href");
      assert(previewHref === "/naijashop?storefrontPreview=draft", `unexpected preview link ${previewHref}`);
      await page.locator("[data-admin-storefront]").scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(SHOTS, `run-${RUN_ID}-admin.png`), fullPage: false });

      // The preview link must show the draft to this staff session, while an
      // anonymous context with the same URL keeps the published copy.
      const previewPage = await adminContext.newPage();
      await previewPage.goto(`${BASE}/naijashop?storefrontPreview=draft`, { waitUntil: "networkidle", timeout: 120000 });
      await previewPage.waitForSelector("[data-storefront-draft-preview]", { timeout: 60000 });
      assert(
        (await previewPage.locator("#african-discovery-heading").textContent())?.includes(uiTitle),
        "staff preview did not render the draft heading"
      );
      await previewPage.close();

      const anonymousContext = await (browser as Browser).newContext();
      const anonymousPreview = await anonymousContext.newPage();
      await anonymousPreview.goto(`${BASE}/naijashop?storefrontPreview=draft`, {
        waitUntil: "networkidle",
        timeout: 120000
      });
      await anonymousPreview.waitForSelector("#african-discovery-heading", { timeout: 60000 });
      assert(
        (await anonymousPreview.locator("[data-storefront-draft-preview]").count()) === 0,
        "anonymous preview URL displayed the draft banner"
      );
      assert(
        !(await anonymousPreview.locator("#african-discovery-heading").textContent())?.includes(uiTitle),
        "anonymous preview URL displayed the draft heading"
      );
      await anonymousContext.close();

      page.once("dialog", (dialog) => dialog.accept());
      await page.click("[data-storefront-publish]");
      await page.waitForFunction(() => /Published\./.test(document.body.innerText), null, { timeout: 30000 });
      const publicNow = await anon.get("/api/storefront");
      expectStatus(publicNow, 200, "public after UI publish");
      assert(publicNow.body.africanDiscoveryTitle === uiTitle, "UI publish did not reach the public config");
      assert(
        JSON.stringify(publicNow.body.africanFeaturedProductIds) === JSON.stringify(expectedIds),
        `UI reorder was not published: ${JSON.stringify(publicNow.body.africanFeaturedProductIds)}`
      );

      const publicPage = await loadDiscoveryPage(browser as Browser, 1440);
      const domSlugs = await publicPage.evaluate(() =>
        [...document.querySelectorAll("[data-african-item]")].map((item) => item.getAttribute("data-african-item"))
      );
      assert(domSlugs[0] === expectedSlugs[0] && domSlugs[1] === expectedSlugs[1], `UI order mismatch: ${JSON.stringify(domSlugs)}`);
      const cardCount = await publicPage.locator("[data-discovery-card]").count();
      assert(cardCount === 4, `enabled card edit did not publish: ${cardCount} cards`);
      await publicPage.close();
      await page.close();
      await adminContext.close();
      return "UI reorder, card enable, save draft, preview and publish verified";
    });

    await step("legacy flat StorefrontConfig rows stay readable", async () => {
      const legacy = {
        version: 7,
        announcement: `Legacy announcement ${RUN_ID}`,
        heroTitle: `Legacy hero ${RUN_ID}`,
        heroSubtitle: "Legacy subtitle",
        visibleCategories: [],
        categoryOrder: [],
        shelfLimit: 5,
        showDemoProducts: true,
        showHero: false,
        showShelves: true,
        heroSlides: []
      };
      await db.query(
        `INSERT INTO "StorefrontConfig" (id, config, "updatedBy", "updatedAt")
         VALUES ('default', $1::jsonb, $2, NOW())
         ON CONFLICT (id) DO UPDATE SET config = $1::jsonb, "updatedBy" = $2, "updatedAt" = NOW()`,
        [JSON.stringify(legacy), "storefront-test-legacy"]
      );
      const publicNow = await anon.get("/api/storefront");
      expectStatus(publicNow, 200, "public config from a legacy row");
      assertNoPrivateKeys(publicNow.body, "legacy public config");
      assert(publicNow.body.announcement === legacy.announcement, "legacy announcement was not preserved");
      assert(publicNow.body.heroTitle === legacy.heroTitle, "legacy hero title was not preserved");
      assert(publicNow.body.heroSubtitle === legacy.heroSubtitle, "legacy hero subtitle was not preserved");
      assert(publicNow.body.shelfLimit === 5, "legacy shelf limit was not preserved");
      assert(publicNow.body.showHero === false && publicNow.body.showShelves === true, "legacy hero/shelf flags were not preserved");
      assert(publicNow.body.showAfricanDiscovery === true, "new discovery visibility did not default on");
      assert(Array.isArray(publicNow.body.discoveryCards) && publicNow.body.discoveryCards.length === 4, "new cards did not default");
      assert(publicNow.body.africanFeaturedProductIds.length === 0, "legacy row did not default to the curated fallback");
      const adminNow = await adminState(admin);
      assert(adminNow.version === 7, `legacy version was not preserved (${adminNow.version})`);
      assert(adminNow.draft === null, "legacy row unexpectedly created a draft");
      return "flat fields preserved; new discovery fields defaulted without a migration";
    });
  } finally {
    // Restore the exact previous published row, or remove the test-created row.
    let cleanupError = "";
    try {
      if (previousRow) {
        await db.query(
          `UPDATE "StorefrontConfig" SET config = $1::jsonb, "updatedBy" = $2, "updatedAt" = $3::timestamp WHERE id = 'default'`,
          [previousRow.config, previousRow.updatedBy, previousRow.updatedAt]
        );
      } else {
        const current = await db.query<{ config: string }>(
          `SELECT config::text AS config FROM "StorefrontConfig" WHERE id = 'default'`
        );
        if (current.rows[0]) {
          assert(
            current.rows[0].config.includes(RUN_ID),
            "Refusing to delete a StorefrontConfig row this test run did not create."
          );
        }
        await db.query(`DELETE FROM "StorefrontConfig" WHERE id = 'default'`);
      }
      const restored = await anon.get("/api/storefront");
      expectStatus(restored, 200, "public config after cleanup");
      if (previousRow) {
        const parse = (value: string) => JSON.parse(value) as Record<string, any>;
        const expected = parse(previousRow.config);
        for (const key of [
          "africanDiscoveryTitle",
          "africanFeaturedProductIds",
          "showAfricanDiscovery",
          "discoveryCards",
          "announcement",
          "heroTitle",
          "showShelves"
        ]) {
          assert(
            JSON.stringify(restored.body[key]) === JSON.stringify(expected[key]),
            `cleanup did not restore ${key}`
          );
        }
      } else {
        assert(restored.body.africanFeaturedProductIds.length === 0, "cleanup did not restore the default config");
        assert(!restored.body.africanDiscoveryTitle.includes(RUN_ID), "cleanup left test copy published");
      }
      console.log(`RESTORE  previous published config (${previousRow ? "row restored" : "default row removed"})`);
    } catch (error) {
      cleanupError = error instanceof Error ? error.message : String(error);
      console.error(`CLEANUP FAILED: ${cleanupError}`);
    }

    const activeBrowser = browser as Browser | null;
    if (activeBrowser) await activeBrowser.close().catch(() => undefined);
    await db.end().catch(() => undefined);
    if (cleanupError) {
      results.push({ name: "cleanup restores previous published config", status: "FAIL", detail: cleanupError });
      process.exitCode = 1;
    } else {
      results.push({
        name: "cleanup restores previous published config",
        status: "PASS",
        detail: previousRow ? "previous StorefrontConfig row restored" : "test-created StorefrontConfig row removed"
      });
    }
  }

  const passed = results.filter((result) => result.status === "PASS").length;
  const failed = results.filter((result) => result.status === "FAIL").length;
  console.log(`\nStorefront discovery acceptance: ${passed}/${results.length} checks passed`);
  console.log(`Database: ${databaseName} (${classification}); audit rows from this run were retained as evidence.`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(`FATAL  ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
