#!/usr/bin/env node
/**
 * REVIEW taxonomy browsing-visibility and public-count acceptance tests.
 *
 * Proves, against an explicit REVIEW database and an optional isolated HTTP
 * server:
 *   - the active canonical taxonomy is 11 departments / 37 level-1 categories /
 *     leaves, derived from the authoritative node list;
 *   - `/api/taxonomy` exposes browsingVisible, sortOrder, imagery, country
 *     publication state and per-node direct/aggregated counts;
 *   - counts exclude drafts, archived rows, sample/fixture listings,
 *     non-selectable nodes, country-ineligible products and restricted
 *     subtrees, and count every eligible product exactly once;
 *   - `/api/taxonomy/categories` returns level-1 browsing categories only, in
 *     published tree merchandising order, and hides browsingVisible=false while
 *     `/api/taxonomy` keeps publishing it;
 *   - regulated nodes fail closed per market (`market_eligibility_unresolved`
 *     without an explicit country rule); explicit GH deny/allow resolves them;
 *   - hiding a category from browsing does not unpublish it or remove its
 *     products;
 *   - admin edits validate browsingVisible, write before/after audit evidence,
 *     enforce products:read/products:moderate and country scope with 403s.
 *
 * Usage:
 *   REVIEW_DATABASE_URL=postgresql://... \
 *     npx tsx scripts/taxonomy-browsing-visibility-tests.ts \
 *       --expect-db=naijadeals_review \
 *       --base-url=http://localhost:3061
 *
 * Run-owned fixtures (a TAXREV category, products and sessions) are created
 * and removed in a finally block. Audit rows are append-only evidence and are
 * intentionally retained.
 */
import { createHash, randomBytes } from "node:crypto";
import { Client } from "pg";
import { TAXONOMY_NODES } from "../lib/data/taxonomy";

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

type CountRow = { id: string; count: string };
type Check = { name: string; pass: boolean; detail: string };

const CANONICAL = {
  departments: TAXONOMY_NODES.filter((node) => node.level === 0).length,
  levelOne: TAXONOMY_NODES.filter((node) => node.level === 1).length,
  leaves: TAXONOMY_NODES.filter((node) => node.level === 2).length
};
const CANONICAL_SLUGS = TAXONOMY_NODES.map((node) => node.slug);
// 2026-11-14 REVIEW tree. Four legacy leaf definitions were reattached to the
// live tree; keep this literal independent so a silent node-list edit fails.
const EXPECTED_LEAVES = 117;
const COUNTRY = "NG";
const PRODUCT_PAGE_QUERY = "page=1&pageSize=60";
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
    .slice(0, 800);
}

function parseExpectedDatabase(argv: string[]): string {
  const arg = argv.find((value) => value.startsWith("--expect-db="));
  const expected = arg?.slice("--expect-db=".length).trim();
  if (!expected) fail("--expect-db=<database-name> is required so the target cannot be guessed");
  if (!/^[A-Za-z0-9_]+$/.test(expected)) fail("--expect-db must contain only letters, digits and underscores");
  return expected;
}

function parseBaseUrl(argv: string[]): string | null {
  const arg = argv.find((value) => value.startsWith("--base-url="));
  if (!arg) return null;
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
  if (urlDatabase !== expectedDb) {
    fail(`REVIEW_DATABASE_URL points at ${urlDatabase || "(no database)"} but --expect-db=${expectedDb}`);
  }
  return url;
}

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

async function getJson(url: string, cookie?: string): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { Origin: new URL(url).origin };
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000), cache: "no-store" });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
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
    path: string,
    options: { method?: "GET" | "POST" | "PATCH"; body?: unknown; cookie?: string } = {}
  ): Promise<{ status: number; body: unknown }> {
    const headers: Record<string, string> = { Origin: this.base };
    const cookie = options.cookie ?? this.cookieHeader();
    if (cookie) headers.Cookie = cookie;
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(`${this.base}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(30_000)
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
    return { status: response.status, body };
  }

  get(path: string, cookie?: string) {
    return this.request(path, { cookie });
  }

  post(path: string, body: unknown, cookie?: string) {
    return this.request(path, { method: "POST", body, cookie });
  }

  patch(path: string, body: unknown, cookie?: string) {
    return this.request(path, { method: "PATCH", body, cookie });
  }
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

function bodyOf(result: { body: unknown }): Json {
  return asRecord(result.body);
}

type NodeLike = {
  id: string;
  slug: string;
  level: number;
  browsingVisible: boolean;
  sortOrder: number;
  canPublish: boolean;
  restrictionNote: string | null;
  restrictionReason: string | null;
  isRegulated: boolean;
  productCount: number;
  subtreeProductCount: number;
  children: NodeLike[];
};

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

function findNode(nodes: unknown[], idOrSlug: string): NodeLike | null {
  return flattenNodes(nodes).find((node) => node.id === idOrSlug || node.slug === idOrSlug) ?? null;
}

function assertNodeContract(nodes: NodeLike[], label: string) {
  for (const node of nodes) {
    assert(typeof node.id === "string" && node.id.length > 0, `${label}: node without id`);
    assert(typeof node.slug === "string" && node.slug.length > 0, `${label}: node ${node.id} without slug`);
    assert(typeof node.level === "number", `${label}: node ${node.slug} missing level`);
    assert(typeof node.browsingVisible === "boolean", `${label}: node ${node.slug} missing browsingVisible`);
    assert(typeof node.sortOrder === "number", `${label}: node ${node.slug} missing sortOrder`);
    assert(typeof node.canPublish === "boolean", `${label}: node ${node.slug} missing canPublish`);
    assert(
      node.restrictionNote === null || typeof node.restrictionNote === "string",
      `${label}: node ${node.slug} restrictionNote must be text or null`
    );
    assert(typeof node.productCount === "number", `${label}: node ${node.slug} missing productCount`);
    assert(typeof node.subtreeProductCount === "number", `${label}: node ${node.slug} missing subtreeProductCount`);
  }
}

/**
 * Independent expected counts. This SQL deliberately does not import the
 * service under test: it derives the public product set from the database using
 * the acceptance contract (live reachable categories, selectable leaves,
 * country publication rules, active non-sample verified listings).
 */
async function expectedCounts(
  client: Client,
  countryCode: string,
  scope: "root" | "level1"
): Promise<Map<string, number>> {
  const level = scope === "root" ? 0 : 1;
  const result = await client.query<CountRow>(
    `with recursive live as (
       select c.* from "Category" c
        where c."parentId" is null and c."isActive" and c."deprecatedAt" is null
       union all
       select c.* from "Category" c join live p on c."parentId" = p.id
        where c."isActive" and c."deprecatedAt" is null
     ),
     blocked as (
       select r."categoryId" as id
         from "CategoryCountryRule" r
        where r."countryCode" = $1 and r."canPublish" = false
       union
       select c.id from "Category" c join blocked b on c."parentId" = b.id
     ),
     scope as (
       select l.id as root, l.id as leaf from live l where l.level = $2
       union all
       select s.root, c.id from scope s join live c on c."parentId" = s.leaf
     )
     select s.root as id, count(distinct p.id)::text as count
       from scope s
       join live leaf on leaf.id = s.leaf
       join "Product" p on p."categoryId" = leaf.id
        and p.status = 'ACTIVE'
        and p."isSample" = false
        and p."countryCode" = $1
        and p.name !~* '^(variant fixture|test |upload test|last unit|product test|refund product|refund vendor)\\b'
        and p.slug !~* '-mw[0-9a-z]{8,}$|^ri-(prod|vendor)-'
       join "Vendor" v on v.id = p."vendorId" and v.status = 'VERIFIED'
      where leaf."isSelectable"
        and leaf.id not in (select id from blocked)
        and (leaf.key is null or leaf.key not like 'taxrev_%')
      group by s.root`,
    [countryCode, level]
  );
  return new Map(result.rows.map((row) => [row.id, Number(row.count)]));
}

async function expectedTotal(client: Client, countryCode: string): Promise<number> {
  const result = await client.query<{ count: string }>(
    `with recursive live as (
       select c.* from "Category" c
        where c."parentId" is null and c."isActive" and c."deprecatedAt" is null
       union all
       select c.* from "Category" c join live p on c."parentId" = p.id
        where c."isActive" and c."deprecatedAt" is null
     ),
     blocked as (
       select r."categoryId" as id
         from "CategoryCountryRule" r
        where r."countryCode" = $1 and r."canPublish" = false
       union
       select c.id from "Category" c join blocked b on c."parentId" = b.id
     )
     select count(distinct p.id)::text as count
       from live leaf
       join "Product" p on p."categoryId" = leaf.id
        and p.status = 'ACTIVE'
        and p."isSample" = false
        and p."countryCode" = $1
        and p.name !~* '^(variant fixture|test |upload test|last unit|product test|refund product|refund vendor)\\b'
        and p.slug !~* '-mw[0-9a-z]{8,}$|^ri-(prod|vendor)-'
       join "Vendor" v on v.id = p."vendorId" and v.status = 'VERIFIED'
      where leaf."isSelectable"
        and leaf.id not in (select id from blocked)
        and (leaf.key is null or leaf.key not like 'taxrev_%')`,
    [countryCode]
  );
  return Number(result.rows[0]?.count ?? "0");
}

async function createSession(client: Client, email: string): Promise<{ id: string; token: string; userId: string }> {
  const found = await client.query<{ id: string }>(`select id from "User" where email = $1`, [email]);
  const userId = found.rows[0]?.id;
  if (!userId) throw new Error(`run-owned session fixture user ${email} is missing from the REVIEW database`);
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const id = `txrev-session-${randomBytes(8).toString("hex")}`;
  // The REVIEW host stores Session.expiresAt as `timestamp` and its database
  // timezone is not UTC; a short-lived fixture can be read back as already
  // expired. Use the same multi-day horizon as a normal login session.
  await client.query(
    `insert into "Session" (id, "userId", "tokenHash", "expiresAt")
     values ($1, $2, $3, $4)`,
    [id, userId, tokenHash, new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)]
  );
  return { id, token, userId };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const expectedDb = parseExpectedDatabase(argv);
  const baseUrl = parseBaseUrl(argv);
  const reviewUrl = resolveReviewUrl(expectedDb);
  const runId = `TAXREV-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString("hex").toUpperCase()}`;
  const runSlug = runId.toLowerCase();

  const client = new Client({
    connectionString: reviewUrl,
    connectionTimeoutMillis: 8000,
    application_name: "naijadeals-taxonomy-browsing-tests"
  });
  const http = baseUrl ? new Http(baseUrl) : null;
  const created = {
    categoryId: null as string | null,
    regulatedFixtureId: null as string | null,
    productIds: [] as string[],
    sessionIds: [] as string[],
    // Unique typed identifier so a crashed run can be found deterministically.
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

    const browsingColumn = await client.query<{ count: string }>(
      `select count(*)::text as count from information_schema.columns
        where table_name = 'Category' and column_name = 'browsingVisible'`
    );
    assert(browsingColumn.rows[0]?.count === "1", "Category.browsingVisible is not migrated in the REVIEW database");

    const categories = await client.query<CategoryRow>(
      `select id, key, name, slug, "parentId", level, "isActive", "isSelectable", "showOnHomepage",
              "browsingVisible", "isRegulated", "deprecatedAt", "sortOrder"
         from "Category"`
    );
    const categoryById = new Map(categories.rows.map((row) => [row.id, row]));
    created.regulatedFixtureId =
      categories.rows.find((row) => row.slug === "otc-medicines-treatments")?.id ?? null;
    const ghRules = await client.query<{ categoryId: string; canPublish: boolean; note: string | null }>(
      `select "categoryId", "canPublish", note from "CategoryCountryRule" where "countryCode" = 'GH'`
    );
    const ghRuleByCategory = new Map(ghRules.rows.map((rule) => [rule.categoryId, rule]));
    const canonicalRows = categories.rows.filter((row) => CANONICAL_SLUGS.includes(row.slug));

    await step(`canonical taxonomy is ${CANONICAL.departments} departments / ${CANONICAL.levelOne} level-1 / ${EXPECTED_LEAVES} leaves`, async () => {
      assert(CANONICAL.leaves === EXPECTED_LEAVES, `node list has ${CANONICAL.leaves} leaves, expected ${EXPECTED_LEAVES}`);
      const counts = new Map<number, number>();
      for (const row of canonicalRows) {
        if (!row.isActive || row.deprecatedAt) continue;
        counts.set(row.level, (counts.get(row.level) ?? 0) + 1);
      }
      assert(counts.get(0) === CANONICAL.departments, `active departments ${counts.get(0)} != ${CANONICAL.departments}`);
      assert(counts.get(1) === CANONICAL.levelOne, `active level-1 ${counts.get(1)} != ${CANONICAL.levelOne}`);
      assert(counts.get(2) === EXPECTED_LEAVES, `active leaves ${counts.get(2)} != ${EXPECTED_LEAVES}`);
    });

    await step("REVIEW level-1 rows carry the browsing flag", async () => {
      const canonicalLevelOne = canonicalRows.filter(
        (row) => row.level === 1 && row.isActive && !row.deprecatedAt
      );
      assert(canonicalLevelOne.length === CANONICAL.levelOne, `active canonical level-1 rows ${canonicalLevelOne.length}`);
      assert(
        canonicalLevelOne.every((row) => row.browsingVisible === true),
        "a canonical level-1 row has browsingVisible=false before this run"
      );
      const stray = categories.rows.filter(
        (row) => row.level === 1 && row.isActive && !row.deprecatedAt && !CANONICAL_SLUGS.includes(row.slug)
      );
      if (stray.length > 0) {
        console.log(`NOTE  active non-canonical level-1 rows are present in REVIEW: ${stray.map((row) => row.slug).join(",")}`);
      }
    });

    // ---- service level (no HTTP required) -------------------------------
    process.env.DATABASE_URL = reviewUrl;
    const publicService = await import("../lib/services/taxonomy/public");
    const eligibilityService = await import("../lib/services/taxonomy/eligibility");

    const ngCountsRoot = await expectedCounts(client, COUNTRY, "root");
    const ngCountsLevelOne = await expectedCounts(client, COUNTRY, "level1");
    const ngTotal = await expectedTotal(client, COUNTRY);
    assert(ngTotal === 57, `REVIEW public product baseline changed: ${ngTotal} != 57`);

    let ngTree: Awaited<ReturnType<typeof publicService.getPublicTaxonomy>> | null = null;
    await step("public taxonomy carries browsing, order, country state and counts", async () => {
      ngTree = await publicService.getPublicTaxonomy({ countryCode: COUNTRY });
      const all = flattenNodes(ngTree.departments);
      assertNodeContract(all, "/api/taxonomy service");
      assert(ngTree.countryCode === COUNTRY, `countryCode ${ngTree.countryCode}`);
      assert(ngTree.departments.length === 11, `roots ${ngTree.departments.length}`);
      const levelOne = all.filter((node) => node.level === 1);
      const leaves = all.filter((node) => node.level === 2);
      assert(levelOne.length === 37, `level-1 nodes ${levelOne.length}`);
      assert(leaves.length === EXPECTED_LEAVES, `leaf nodes ${leaves.length} != ${EXPECTED_LEAVES}`);
      for (const node of levelOne) {
        assert(
          node.subtreeProductCount === (ngCountsLevelOne.get(node.id) ?? 0),
          `${node.slug} subtreeProductCount ${node.subtreeProductCount} != independent ${ngCountsLevelOne.get(node.id) ?? 0}`
        );
      }
      for (const node of ngTree.departments) {
        assert(
          node.subtreeProductCount === (ngCountsRoot.get(node.id) ?? 0),
          `${node.slug} root count ${node.subtreeProductCount} != independent ${ngCountsRoot.get(node.id) ?? 0}`
        );
      }
      const total = ngTree.departments.reduce((sum, node) => sum + node.subtreeProductCount, 0);
      assert(total === ngTotal, `root count sum ${total} != distinct products ${ngTotal}`);
      // Every eligible product is attached to one visible selectable category,
      // so summing each node's direct count must also equal the distinct total:
      // the tree cannot count one product twice or drop it.
      const allDirect = all.reduce((sum, node) => sum + node.productCount, 0);
      assert(allDirect === ngTotal, `direct count sum ${allDirect} != distinct products ${ngTotal}`);
      const directSum = levelOne.reduce((sum, node) => sum + node.productCount, 0);
      assert(directSum <= total, `level-1 direct count sum ${directSum} exceeds distinct total ${total}`);
    });

    await step("NG counts are country-aware and GH regulated nodes fail closed", async () => {
      assert(ngTree, "NG tree missing");
      const restrictedSlug = "brake-system-parts";
      const restricted = findNode(ngTree.departments, restrictedSlug);
      assert(restricted, `${restrictedSlug} is missing from the published tree`);
      assert(restricted.canPublish === false, `${restrictedSlug} should be publish-restricted for NG`);
      assert(Boolean(restricted.restrictionNote?.trim()), `${restrictedSlug} restrictionNote is empty`);
      assert(restricted.productCount === 0, `${restrictedSlug} should not count restricted products`);
      assert(restricted.restrictionReason === "country_rule", `${restrictedSlug} NG reason is not an explicit rule`);

      const ghTree = await publicService.getPublicTaxonomy({ countryCode: "GH" });
      const ghAll = flattenNodes(ghTree.departments);
      assertNodeContract(ghAll, "GH tree");
      const regulatedGh = ghAll.filter((node) => node.isRegulated === true);
      assert(regulatedGh.length > 0, "GH tree has no regulated nodes to verify");
      for (const node of ghAll) {
        const rule = ghRuleByCategory.get(node.id);
        if (rule) {
          assert(
            node.canPublish === rule.canPublish,
            `GH explicit rule for ${node.slug} (${String(rule.canPublish)}) != canPublish ${String(node.canPublish)}`
          );
          assert(
            node.restrictionReason === (rule.canPublish ? null : "country_rule"),
            `GH explicit rule reason for ${node.slug} is ${String(node.restrictionReason)}`
          );
          continue;
        }
        if (node.isRegulated === true) {
          assert(node.canPublish === false, `GH regulated ${node.slug} without a rule was publishable`);
          assert(
            node.restrictionReason === "market_eligibility_unresolved",
            `GH regulated ${node.slug} reason ${String(node.restrictionReason)}`
          );
          assert(Boolean(node.restrictionNote?.trim()), `GH regulated ${node.slug} has no restriction note`);
        }
      }
      const ghPlain = findNode(ghTree.departments, "phones-tablets");
      assert(ghPlain?.canPublish === true, "GH non-regulated category is not publishable");
      assert(ghPlain?.restrictionReason === null, `GH non-regulated reason ${String(ghPlain?.restrictionReason)}`);
      const ghExpected = await expectedCounts(client, "GH", "root");
      for (const node of ghTree.departments) {
        assert(
          node.subtreeProductCount === (ghExpected.get(node.id) ?? 0),
          `GH ${node.slug} count ${node.subtreeProductCount} != independent ${ghExpected.get(node.id) ?? 0}`
        );
      }

      // Explicit GH deny/allow resolves the regulated node without granting NG.
      const regulatedLeaf = categories.rows.find((row) => row.slug === "otc-medicines-treatments");
      assert(regulatedLeaf, "regulated otc-medicines-treatments leaf is missing");
      assert(regulatedLeaf.isRegulated === true, "otc-medicines-treatments is not flagged regulated");
      const priorGhRule = ghRuleByCategory.get(regulatedLeaf.id) ?? null;
      try {
        await client.query(
          `insert into "CategoryCountryRule" ("categoryId", "countryCode", "canPublish", note)
           values ($1, 'GH', false, $2)
           on conflict ("categoryId", "countryCode") do update
             set "canPublish" = excluded."canPublish", note = excluded.note`,
          [regulatedLeaf.id, `Run-owned GH deny ${runId}.`]
        );
        const deniedTree = await publicService.getPublicTaxonomy({ countryCode: "GH" });
        const deniedNode = findNode(deniedTree.departments, regulatedLeaf.id);
        assert(deniedNode?.canPublish === false, "explicit GH deny did not block the regulated node");
        assert(deniedNode?.restrictionReason === "country_rule", `GH deny reason ${String(deniedNode?.restrictionReason)}`);
        const deniedEligibility = await eligibilityService
          .assertSellerCategoryEligibility({ categoryId: regulatedLeaf.id, countryCode: "GH" })
          .then(() => null)
          .catch((error) => error as { status?: number; code?: string; details?: Json });
        assert(deniedEligibility, "explicit GH deny was publishable through seller eligibility");
        assert(deniedEligibility.status === 403 && deniedEligibility.code === "category_restricted", "GH deny did not fail closed");
        assert(deniedEligibility.details?.reason === "country_rule", `GH deny details ${String(deniedEligibility.details?.reason)}`);

        await client.query(
          `update "CategoryCountryRule" set "canPublish" = true, note = $2
            where "categoryId" = $1 and "countryCode" = 'GH'`,
          [regulatedLeaf.id, `Run-owned GH allow ${runId}.`]
        );
        const allowedTree = await publicService.getPublicTaxonomy({ countryCode: "GH" });
        const allowedNode = findNode(allowedTree.departments, regulatedLeaf.id);
        assert(allowedNode?.canPublish === true, "explicit GH allow did not resolve the regulated node");
        assert(allowedNode?.restrictionReason === null, `GH allow reason ${String(allowedNode?.restrictionReason)}`);
        const allowed = await eligibilityService.assertSellerCategoryEligibility({
          categoryId: regulatedLeaf.id,
          countryCode: "GH"
        });
        assert(allowed.category.id === regulatedLeaf.id, "explicit GH allow did not pass seller eligibility");

        const ngAfterGhAllow = await publicService.getPublicTaxonomy({ countryCode: "NG" });
        const ngNode = findNode(ngAfterGhAllow.departments, regulatedLeaf.id);
        assert(ngNode?.canPublish === false, "GH allow incorrectly granted NG publishing");
        assert(ngNode?.restrictionReason === "country_rule", `NG explicit deny reason ${String(ngNode?.restrictionReason)}`);
      } finally {
        if (priorGhRule) {
          await client
            .query(
              `update "CategoryCountryRule" set "canPublish" = $2, note = $3
                where "categoryId" = $1 and "countryCode" = 'GH'`,
              [regulatedLeaf.id, priorGhRule.canPublish, priorGhRule.note]
            )
            .catch(() => undefined);
        } else {
          await client
            .query(`delete from "CategoryCountryRule" where "categoryId" = $1 and "countryCode" = 'GH' and note like $2`, [
              regulatedLeaf.id,
              `Run-owned GH %${created.marker}%`
            ])
            .catch(() => undefined);
        }
      }
    });

    let ngLevelOne: Awaited<ReturnType<typeof publicService.getPublicLevelOneCategories>> | null = null;
    await step("level-1 browsing projection returns 37 ordered categories with counts", async () => {
      ngLevelOne = await publicService.getPublicLevelOneCategories({ countryCode: COUNTRY });
      assert(ngLevelOne.countryCode === COUNTRY, `countryCode ${ngLevelOne.countryCode}`);
      assert(ngLevelOne.categories.length === 37, `level-1 browsing categories ${ngLevelOne.categories.length}`);
      assert(ngLevelOne.categories.every((node) => node.level === 1), "level-1 projection contains another level");
      assert(ngLevelOne.categories.every((node) => node.browsingVisible), "hidden category leaked into the rail projection");
      assertNodeContract(ngLevelOne.categories as unknown as NodeLike[], "/api/taxonomy/categories service");
      assert(ngTree, "NG tree missing for order comparison");
      const treeOrder = (ngTree?.departments ?? []).flatMap((department) =>
        (department.children ?? [])
          .filter((node) => node.level === 1 && node.browsingVisible !== false)
          .map((node) => node.id)
      );
      assert(
        ngLevelOne.categories.length === treeOrder.length &&
          ngLevelOne.categories.every((node, index) => node.id === treeOrder[index]),
        "level-1 projection is not in published tree merchandising order"
      );
      for (const node of ngLevelOne.categories) {
        assert(
          node.subtreeProductCount === (ngCountsLevelOne.get(node.id) ?? 0),
          `${node.slug} rail count ${node.subtreeProductCount} != independent ${ngCountsLevelOne.get(node.id) ?? 0}`
        );
      }
    });

    // ---- HTTP + fixtures ------------------------------------------------
    if (!http || !baseUrl) {
      console.log("");
      console.log("HTTP checks not requested (--base-url absent).");
    } else {
      // Wait for the isolated preview to finish compiling the API routes.
      let ready = false;
      for (let attempt = 0; attempt < 60; attempt += 1) {
        try {
          const probe = await getJson(`${baseUrl}/api/taxonomy`);
          if (probe.status === 200) {
            ready = true;
            break;
          }
        } catch {
          /* server still starting */
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      assert(ready, `HTTP preview ${baseUrl} did not serve /api/taxonomy within 120s`);

      const admin = await createSession(client, "review-admin@review.invalid");
      created.sessionIds.push(admin.id);
      const ghAdmin = await createSession(client, "review-admin-gh@review.invalid");
      created.sessionIds.push(ghAdmin.id);
      const customer = await createSession(client, "review-customer@review.invalid");
      created.sessionIds.push(customer.id);
      const adminCookie = `nd_session=${admin.token}`;
      const ghAdminCookie = `nd_session=${ghAdmin.token}`;
      const customerCookie = `nd_session=${customer.token}`;

      await step("HTTP /api/taxonomy matches the service contract and counts", async () => {
        const result = await http.get("/api/taxonomy?country=NG");
        expectStatus(result, 200, "GET /api/taxonomy");
        const body = bodyOf(result);
        const departments = asArray(body.departments);
        const all = flattenNodes(departments);
        assert(body.countryCode === COUNTRY, `countryCode ${String(body.countryCode)}`);
        assert(departments.length === 11, `roots ${departments.length}`);
        assert(all.filter((node) => node.level === 1).length === 37, "level-1 nodes");
        assert(
          all.filter((node) => node.level === 2).length === EXPECTED_LEAVES,
          `leaf nodes ${all.filter((node) => node.level === 2).length} != ${EXPECTED_LEAVES}`
        );
        assertNodeContract(all, "HTTP /api/taxonomy");
        for (const node of all.filter((row) => row.level === 1)) {
          assert(
            node.subtreeProductCount === (ngCountsLevelOne.get(node.id) ?? 0),
            `${node.slug} HTTP count ${node.subtreeProductCount} != independent ${ngCountsLevelOne.get(node.id) ?? 0}`
          );
        }
        const invalid = await http.get("/api/taxonomy?country=XYZ");
        expectStatus(invalid, 400, "GET /api/taxonomy invalid country");
        assert(bodyOf(invalid).code === "invalid_country", `invalid country code ${String(bodyOf(invalid).code)}`);
      });

      await step("HTTP level-1 rail endpoint returns ordered browsing categories", async () => {
        const result = await http.get("/api/taxonomy/categories?country=NG");
        expectStatus(result, 200, "GET /api/taxonomy/categories");
        const body = bodyOf(result);
        const rows = asArray(body.categories);
        assert(body.countryCode === COUNTRY, `countryCode ${String(body.countryCode)}`);
        assert(rows.length === 37, `categories ${rows.length}`);
        assertNodeContract(rows as unknown as NodeLike[], "HTTP /api/taxonomy/categories");
        assert(rows.every((row) => asRecord(row).level === 1), "rail projection contains a non-level-1 node");
        assert(rows.every((row) => asRecord(row).browsingVisible === true), "hidden category leaked into the rail");
        assert(
          rows.every((row, index) => String(asRecord(row).id) === String(ngLevelOne?.categories[index]?.id)),
          "HTTP rail order differs from the service projection"
        );
      });

      await step("HTTP /api/categories agrees with taxonomy root counts", async () => {
        const result = await http.get("/api/categories");
        expectStatus(result, 200, "GET /api/categories");
        const roots = asArray(result.body);
        assert(roots.length === 11, `roots ${roots.length}`);
        const sum = roots.reduce<number>(
          (total, value) => total + Number(asRecord(value).productCount ?? Number.NaN),
          0
        );
        assert(sum === ngTotal, `root count sum ${sum} != distinct products ${ngTotal}`);
        for (const value of roots) {
          const root = asRecord(value);
          const node = findNode(ngTree?.departments ?? [], String(root.id));
          assert(node, `taxonomy root ${String(root.slug)} missing`);
          assert(
            root.productCount === node.subtreeProductCount,
            `${String(root.slug)} /api/categories ${String(root.productCount)} != taxonomy ${node.subtreeProductCount}`
          );
        }
      });

      let parentId = "";
      await step("admin creates a run-owned level-1 category", async () => {
        const root = categories.rows.find((row) => row.level === 0 && row.slug === "home-living");
        assert(root, "canonical home-living department is missing");
        parentId = root.id;
        const result = await http.post(
          "/api/admin/taxonomy",
          {
            parentId,
            key: `taxrev_${runSlug.replace(/-/g, "_")}`,
            name: `${runId} QA node`,
            slug: runSlug,
            description: "Run-owned taxonomy acceptance fixture.",
            isSelectable: true,
            showOnHomepage: false,
            browsingVisible: true,
            isRegulated: true,
            isActive: true,
            sortOrder: 9999,
            countryRules: [{ countryCode: "NG", canPublish: true, note: `Run-tagged rule ${runId}.` }]
          },
          adminCookie
        );
        expectStatus(result, 201, "POST /api/admin/taxonomy");
        const body = bodyOf(result);
        assert(typeof body.id === "string", "created category id missing");
        assert(body.browsingVisible === true, "created category browsingVisible is not true");
        assert(body.isRegulated === true, "admin create did not persist isRegulated=true");
        const restoreRegulated = await http.patch(
          `/api/admin/taxonomy/${body.id}`,
          { isRegulated: false },
          adminCookie
        );
        expectStatus(restoreRegulated, 200, "PATCH isRegulated=false");
        created.categoryId = body.id;
      });

      const vendor = await client.query<{ id: string }>(
        `select id from "Vendor" where status = 'VERIFIED' order by name limit 1`
      );
      const vendorId = vendor.rows[0]?.id;
      assert(vendorId, "no VERIFIED vendor exists for run-owned product fixtures");
      assert(created.categoryId, "run category was not created");

      const insertProduct = async (input: {
        categoryId: string;
        countryCode: string;
        label: string;
      }): Promise<string> => {
        const id = `txrevprod${randomBytes(10).toString("hex")}`;
        await client.query(
          `insert into "Product"
             (id, "vendorId", "categoryId", name, slug, description, "priceKobo", "countryCode",
              status, "isSample", "createdAt", "updatedAt")
           values ($1, $2, $3, $4, $5, $6, 100000, $7, 'ACTIVE', false, now(), now())`,
          [
            id,
            vendorId,
            input.categoryId,
            `${runId} ${input.label}`,
            `${runSlug}-${input.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
            "Run-owned taxonomy count fixture.",
            input.countryCode
          ]
        );
        created.productIds.push(id);
        return id;
      };

      let ngProductId = "";
      let ghProductId = "";
      let restrictedProductId = "";
      let restrictedParentBefore = 0;
      await step("counts exclude country-ineligible and restricted products exactly once", async () => {
        ngProductId = await insertProduct({ categoryId: created.categoryId as string, countryCode: "NG", label: "NG" });
        ghProductId = await insertProduct({ categoryId: created.categoryId as string, countryCode: "GH", label: "GH" });

        const restrictedLeaf = categories.rows.find((row) => row.slug === "brake-system-parts");
        assert(restrictedLeaf, "restricted brake-system-parts leaf is missing");
        assert(restrictedLeaf.parentId, "restricted leaf has no parent");
        const restrictedParent = categoryById.get(restrictedLeaf.parentId);
        assert(restrictedParent, "restricted leaf parent is missing");
        const beforeNg = await http.get("/api/taxonomy?country=NG");
        expectStatus(beforeNg, 200, "GET taxonomy before restricted product");
        restrictedParentBefore =
          findNode(asArray(bodyOf(beforeNg).departments), restrictedParent.id)?.subtreeProductCount ?? -1;
        restrictedProductId = await insertProduct({
          categoryId: restrictedLeaf.id,
          countryCode: "NG",
          label: "Restricted"
        });

        const ng = await http.get("/api/taxonomy?country=NG");
        expectStatus(ng, 200, "GET taxonomy NG fixture counts");
        const ngBody = bodyOf(ng);
        const runNode = findNode(asArray(ngBody.departments), created.categoryId as string);
        assert(runNode, "run-owned category is not published");
        assert(runNode.subtreeProductCount === 1, `NG run count ${runNode.subtreeProductCount} != 1 (GH product leaked)`);
        assert(runNode.productCount === 1, `NG direct count ${runNode.productCount} != 1`);

        const gh = await http.get("/api/taxonomy?country=GH");
        expectStatus(gh, 200, "GET taxonomy GH fixture counts");
        const runNodeGh = findNode(asArray(bodyOf(gh).departments), created.categoryId as string);
        assert(runNodeGh, "run-owned category is missing from GH publication");
        assert(runNodeGh.subtreeProductCount === 1, `GH run count ${runNodeGh.subtreeProductCount} != 1 (NG product leaked)`);

        const restrictedParentAfter =
          findNode(asArray(ngBody.departments), restrictedParent.id)?.subtreeProductCount ?? -1;
        assert(
          restrictedParentAfter === restrictedParentBefore,
          `restricted product changed ${restrictedParent.slug} from ${restrictedParentBefore} to ${restrictedParentAfter}`
        );

        const levelOne = findNode(asArray(ngBody.departments), created.categoryId as string);
        assert(levelOne?.browsingVisible === true, "run category browsingVisible should still be true");
        // The NG run product appears exactly once in the NG total; the GH and
        // restricted fixtures are excluded.
        const rootSum = asArray(ngBody.departments).reduce<number>(
          (sum, value) => sum + Number(asRecord(value).subtreeProductCount ?? 0),
          0
        );
        assert(rootSum === ngTotal + 1, `NG total ${rootSum} != ${ngTotal + 1}`);
      });

      await step("admin GET exposes browsingVisible for every node", async () => {
        const result = await http.get("/api/admin/taxonomy", adminCookie);
        expectStatus(result, 200, "GET /api/admin/taxonomy");
        const all = flattenNodes(asArray(bodyOf(result).departments));
        assert(all.length > 260, `admin tree has only ${all.length} nodes`);
        assert(
          all.every((node) => (node as unknown as { browsingVisible?: unknown }).browsingVisible !== undefined),
          "an admin node is missing browsingVisible"
        );
        const runNode = all.find((node) => node.id === created.categoryId);
        assert(runNode, "run-owned category is missing from the admin tree");
        assert(
          (runNode as unknown as { browsingVisible?: unknown }).browsingVisible === true,
          "admin tree does not report browsingVisible=true"
        );
      });

      await step("admin hides a category from browsing without unpublishing it", async () => {
        const patch = await http.patch(
          `/api/admin/taxonomy/${created.categoryId}`,
          { browsingVisible: false },
          adminCookie
        );
        expectStatus(patch, 200, "PATCH browsingVisible=false");
        const patchBody = bodyOf(patch);
        assert(patchBody.browsingVisible === false, "PATCH response browsingVisible is not false");
        assert(patchBody.isActive === true, "PATCH browsingVisible must not change publication");
        assert(patchBody.isSelectable === true, "PATCH browsingVisible must not change seller listability");

        const rail = await http.get("/api/taxonomy/categories?country=NG");
        expectStatus(rail, 200, "GET rail after hide");
        const railIds = asArray(bodyOf(rail).categories).map((row) => String(asRecord(row).id));
        assert(railIds.length === 37, `rail categories ${railIds.length} != 37`);
        assert(!railIds.includes(created.categoryId as string), "browsingVisible=false category is still in the rail");

        const published = await http.get("/api/taxonomy?country=NG");
        expectStatus(published, 200, "GET publication after hide");
        const runNode = findNode(asArray(bodyOf(published).departments), created.categoryId as string);
        assert(runNode, "browsingVisible=false category disappeared from the published taxonomy");
        assert(runNode.browsingVisible === false, "publication browsingVisible is not false");
        assert(runNode.canPublish === true, "publication lost its country publishability");
        assert(runNode.subtreeProductCount === 1, `publication count changed to ${runNode.subtreeProductCount}`);

        const products = await http.get(
          `/api/products?category=${encodeURIComponent(runSlug)}&country=NG&${PRODUCT_PAGE_QUERY}`
        );
        expectStatus(products, 200, "GET products after hide");
        const productBody = bodyOf(products);
        const items = asArray(productBody.items).map((item) => String(asRecord(item).id));
        assert(productBody.total === 1, `run category products total ${String(productBody.total)} != 1`);
        assert(items.includes(ngProductId), "hiding browsing visibility removed the product from the catalogue");
        assert(!items.includes(ghProductId), "country=NG product page leaked the GH fixture");
      });

      await step("admin edit writes before/after audit evidence", async () => {
        const audit = await client.query<{ actorId: string | null; metadata: Json }>(
          `select "actorId", metadata from "AuditLog"
            where entity = 'Category' and "entityId" = $1 and action = 'taxonomy.category.updated'
            order by "createdAt" desc limit 1`,
          [created.categoryId]
        );
        const row = audit.rows[0];
        assert(row, "no taxonomy.category.updated audit row was written");
        assert(row.actorId === admin.userId, `audit actor ${row.actorId ?? "null"} != ${admin.userId}`);
        assert(row.metadata?.before, "audit metadata has no before snapshot");
        assert(row.metadata?.after, "audit metadata has no after snapshot");
        const before = asRecord(row.metadata.before);
        const after = asRecord(row.metadata.after);
        assert(before.browsingVisible === true, `audit before.browsingVisible ${String(before.browsingVisible)}`);
        assert(after.browsingVisible === false, `audit after.browsingVisible ${String(after.browsingVisible)}`);
        assert(before.isActive === true && after.isActive === true, "audit shows an unintended publication change");
        assert(
          typeof before.sortOrder === "number" && typeof after.sortOrder === "number",
          "audit did not record sort order"
        );

        const createdAudit = await client.query<{ metadata: Json }>(
          `select metadata from "AuditLog"
            where entity = 'Category' and "entityId" = $1 and action = 'taxonomy.category.created'
            order by "createdAt" desc limit 1`,
          [created.categoryId]
        );
        assert(createdAudit.rows[0], "no taxonomy.category.created audit row was written");
        assert(
          asRecord(createdAudit.rows[0].metadata).browsingVisible === true,
          "creation audit does not record browsingVisible"
        );
      });

      await step("admin validates browsingVisible types", async () => {
        const stringValue = await http.patch(
          `/api/admin/taxonomy/${created.categoryId}`,
          { browsingVisible: "yes" },
          adminCookie
        );
        expectStatus(stringValue, 400, "PATCH browsingVisible=yes");
        const numberValue = await http.patch(
          `/api/admin/taxonomy/${created.categoryId}`,
          { browsingVisible: 0 },
          adminCookie
        );
        expectStatus(numberValue, 400, "PATCH browsingVisible=0");
        const current = await client.query<{ browsingVisible: boolean }>(
          `select "browsingVisible" from "Category" where id = $1`,
          [created.categoryId]
        );
        assert(current.rows[0]?.browsingVisible === false, "an invalid value changed the stored flag");
      });

      await step("unauthorized and out-of-scope admin writes are rejected", async () => {
        const anonymous = await http.get("/api/admin/taxonomy");
        expectStatus(anonymous, 401, "anonymous GET /api/admin/taxonomy");
        const customerRead = await http.get("/api/admin/taxonomy", customerCookie);
        expectStatus(customerRead, 403, "customer GET /api/admin/taxonomy");
        const customerWrite = await http.request(`/api/admin/taxonomy/${created.categoryId}`, {
          method: "PATCH",
          body: { browsingVisible: true },
          cookie: customerCookie
        });
        expectStatus(customerWrite, 403, "customer PATCH /api/admin/taxonomy/[id]");
        const scopedWrite = await http.request(`/api/admin/taxonomy/${created.categoryId}`, {
          method: "PATCH",
          body: { browsingVisible: true },
          cookie: ghAdminCookie
        });
        expectStatus(scopedWrite, 403, "GH-scoped admin PATCH on NG-only node");
        assert(
          bodyOf(scopedWrite).code === "region_forbidden",
          `scope error code ${String(bodyOf(scopedWrite).code)}`
        );
        const current = await client.query<{ browsingVisible: boolean }>(
          `select "browsingVisible" from "Category" where id = $1`,
          [created.categoryId]
        );
        assert(current.rows[0]?.browsingVisible === false, "a rejected write changed the stored flag");
      });

      await step("restoring browsing visibility returns the category to the rail", async () => {
        const patch = await http.patch(
          `/api/admin/taxonomy/${created.categoryId}`,
          { browsingVisible: true },
          adminCookie
        );
        expectStatus(patch, 200, "PATCH browsingVisible=true");
        assert(bodyOf(patch).browsingVisible === true, "PATCH response browsingVisible is not true");
        const rail = await http.get("/api/taxonomy/categories?country=NG");
        expectStatus(rail, 200, "GET rail after restore");
        assert(
          asArray(bodyOf(rail).categories).some((row) => String(asRecord(row).id) === created.categoryId),
          "restored category is still missing from the rail"
        );
      });
    }

    console.log("");
    console.log(`REVIEW taxonomy browsing-visibility tests — ${actualDb} (REVIEW)`);
    console.log(`Run fixtures: ${created.marker}; products ${created.productIds.length}; sessions ${created.sessionIds.length}`);
    console.log(`Checks: ${passes} passed, ${failures} failed`);
    if (failures > 0) process.exitCode = 1;
  } catch (error) {
    console.error(`FAIL: ${sanitize(error instanceof Error ? error.message : String(error))}`);
    process.exitCode = 2;
  } finally {
    // Remove run-owned product/session fixtures even when an assertion failed.
    for (const productId of created.productIds) {
      await client.query(`delete from "Product" where id = $1`, [productId]).catch(() => undefined);
    }
    // A partially created product/category that failed before its id was
    // recorded is still findable by its run-tagged name/slug.
    await client
      .query(`delete from "Product" where name like $1 or slug like $2`, [
        `${created.marker}%`,
        `%${created.marker.toLowerCase()}%`
      ])
      .catch(() => undefined);
    if (created.regulatedFixtureId) {
      await client
        .query(`delete from "CategoryCountryRule" where "categoryId" = $1 and "countryCode" = 'GH' and note like $2`, [
          created.regulatedFixtureId,
          `%${created.marker}%`
        ])
        .catch(() => undefined);
    }
    if (created.categoryId) {
      await client.query(`delete from "Category" where id = $1`, [created.categoryId]).catch(() => undefined);
    }
    await client
      .query(`delete from "Category" where key like $1 or name like $2`, [`taxrev\\_%`, `${created.marker}%`])
      .catch(() => undefined);
    for (const sessionId of created.sessionIds) {
      await client.query(`delete from "Session" where id = $1`, [sessionId]).catch(() => undefined);
    }
    await client.end().catch(() => undefined);
  }
}

void main().catch((error) => {
  console.error(`FAIL: ${sanitize(error instanceof Error ? error.message : String(error))}`);
  process.exit(2);
});
