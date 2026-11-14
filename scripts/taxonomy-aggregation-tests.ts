#!/usr/bin/env node
/**
 * REVIEW taxonomy aggregation tests.
 *
 * Proves, against the explicit REVIEW database and optionally the running
 * HTTP preview:
 *   - a department/root returns products from every active descendant category
 *     exactly once;
 *   - a leaf returns only that leaf;
 *   - an empty selectable category is a real empty state;
 *   - a publish-restricted descendant is excluded from its parent;
 *   - inactive/deprecated/CRF/test categories never appear;
 *   - draft/archived products never appear;
 *   - `/api/categories` roots and per-root counts match the active tree;
 *   - `/api/taxonomy` keeps its contract (11 departments / 117 leaves);
 *   - the deterministic alias search still resolves eligible categories;
 *   - the optional Aura path accepts only eligible ids from a mocked generator.
 *
 * Usage:
 *   REVIEW_DATABASE_URL=postgresql://... \
 *     npx tsx scripts/taxonomy-aggregation-tests.ts --expect-db=naijadeals_review
 *
 *   Add --base-url=http://localhost:3053 to include HTTP checks.
 *   Add --json for a machine-readable summary.
 */
import { Client } from "pg";
import {
  RESTRICTED_CATEGORY_KEYS,
  TAXONOMY_NODES
} from "../lib/data/taxonomy";

type CategoryRow = {
  id: string;
  key: string | null;
  name: string;
  slug: string;
  parentId: string | null;
  level: number;
  isActive: boolean;
  isSelectable: boolean;
  deprecatedAt: Date | null;
  sortOrder: number;
};

type RuleRow = {
  categoryId: string;
  countryCode: string;
  canPublish: boolean;
  note: string | null;
};

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  categoryId: string;
  status: string;
};

type Check = { name: string; pass: boolean; detail: string };

const STORE_FIXTURE =
  /^(variant fixture|test |upload test|last unit|product test|refund product|refund vendor)\b|-mw[0-9a-z]{8,}$|^ri-(prod|vendor)-/i;
const CATEGORY_FIXTURE = /^(refund cat|test category|fixture category)\b|^ri-cat-/i;
const COUNTRY = "NG";

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
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

type Tree = {
  byId: Map<string, CategoryRow>;
  publicRows: CategoryRow[];
  publicById: Map<string, CategoryRow>;
  childrenByParent: Map<string, CategoryRow[]>;
  roots: CategoryRow[];
  restricted: Set<string>;
};

function reachable(row: CategoryRow, byId: Map<string, CategoryRow>): boolean {
  const seen = new Set<string>([row.id]);
  let parentId = row.parentId;
  while (parentId) {
    if (seen.has(parentId)) return false;
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent || !parent.isActive || parent.deprecatedAt) return false;
    parentId = parent.parentId;
  }
  return true;
}

function buildTree(rows: CategoryRow[], rules: RuleRow[]): Tree {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const publicRows = rows.filter(
    (row) =>
      row.isActive &&
      !row.deprecatedAt &&
      !CATEGORY_FIXTURE.test(row.name) &&
      !CATEGORY_FIXTURE.test(row.slug) &&
      reachable(row, byId)
  );
  const publicById = new Map(publicRows.map((row) => [row.id, row]));
  const childrenByParent = new Map<string, CategoryRow[]>();
  for (const row of publicRows) {
    if (!row.parentId || !publicById.has(row.parentId)) continue;
    const list = childrenByParent.get(row.parentId) ?? [];
    list.push(row);
    childrenByParent.set(row.parentId, list);
  }
  const ruleMap = new Map(rules.map((rule) => [`${rule.categoryId}:${rule.countryCode.toUpperCase()}`, rule]));
  const restricted = new Set<string>();
  for (const row of publicRows) {
    const seen = new Set<string>();
    let current: CategoryRow | undefined = row;
    while (current) {
      if (seen.has(current.id)) break;
      seen.add(current.id);
      const rule = ruleMap.get(`${current.id}:${COUNTRY}`);
      if (rule && !rule.canPublish) {
        restricted.add(row.id);
        break;
      }
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
  }
  return {
    byId,
    publicRows,
    publicById,
    childrenByParent,
    roots: publicRows
      .filter((row) => !row.parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    restricted
  };
}

function subtreeIds(tree: Tree, root: CategoryRow): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const queue: CategoryRow[] = [root];
  while (queue.length > 0) {
    const current = queue.shift() as CategoryRow;
    if (seen.has(current.id)) continue;
    seen.add(current.id);
    if (tree.restricted.has(current.id)) continue;
    if (current.isSelectable) ids.push(current.id);
    for (const child of tree.childrenByParent.get(current.id) ?? []) queue.push(child);
  }
  return ids;
}

function allSelectableIds(tree: Tree): string[] {
  return tree.publicRows
    .filter((row) => row.isSelectable && !tree.restricted.has(row.id))
    .map((row) => row.id);
}

function publicProducts(products: ProductRow[], categoryIds: Set<string>): ProductRow[] {
  return products.filter(
    (product) =>
      product.status === "ACTIVE" &&
      categoryIds.has(product.categoryId) &&
      !STORE_FIXTURE.test(product.name) &&
      !STORE_FIXTURE.test(product.slug)
  );
}

async function getJson(url: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const jsonOutput = argv.includes("--json");
  const expectedDb = parseExpectedDatabase(argv);
  const baseUrl = parseBaseUrl(argv);
  const reviewUrl = resolveReviewUrl(expectedDb);

  const client = new Client({
    connectionString: reviewUrl,
    connectionTimeoutMillis: 8000,
    application_name: "naijadeals-taxonomy-aggregation-tests"
  });
  const checks: Check[] = [];
  const check = (name: string, pass: boolean, detail = "") => {
    checks.push({ name, pass, detail });
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

    const categories = await client.query<CategoryRow>(
      `select id, key, name, slug, "parentId", level, "isActive", "isSelectable", "deprecatedAt", "sortOrder"
         from "Category"`
    );
    const rules = await client.query<RuleRow>(
      `select "categoryId", "countryCode", "canPublish", note from "CategoryCountryRule"`
    );
    const products = await client.query<ProductRow>(
      `select p.id, p.name, p.slug, p."categoryId", p.status
         from "Product" p join "Vendor" v on v.id = p."vendorId"
        where p."isSample" = false and v.status = 'VERIFIED'`
    );
    const tree = buildTree(categories.rows, rules.rows);
    const selectableIds = new Set(allSelectableIds(tree));
    const visibleProducts = publicProducts(products.rows, selectableIds);
    const visibleIds = new Set(visibleProducts.map((product) => product.id));
    const allPublicProducts = publicProducts(products.rows, new Set(tree.publicRows.map((row) => row.id)));

    check(
      "review database identity",
      actualDb === "naijadeals_review" && classification.rows.some((row) => row.classification === "REVIEW"),
      actualDb
    );
    check(
      "11 public roots, 117 selectable leaves",
      tree.roots.length === 11 && tree.publicRows.filter((row) => row.level === 2 && row.isSelectable).length === 117,
      `${tree.roots.length} roots / ${tree.publicRows.filter((row) => row.level === 2 && row.isSelectable).length} leaves`
    );

    const crfCategories = categories.rows.filter((row) => /^CRF/i.test(row.name) || /^crf-/i.test(row.slug));
    check("no CRF category names", crfCategories.length === 0, `${crfCategories.length} CRF rows`);
    check(
      "no active fixture-named products",
      products.rows.filter((product) => product.status === "ACTIVE" && STORE_FIXTURE.test(product.name)).length === 0
    );

    // ---- service-level aggregation --------------------------------------
    process.env.DATABASE_URL = reviewUrl;
    const catalog = await import("../lib/services/core/catalog.service");
    const eligibility = await import("../lib/services/taxonomy/eligibility");
    const assist = await import("../lib/services/taxonomy/assist");

    const queryFor = (category: string | null): Parameters<typeof catalog.queryCatalogProducts>[0] => ({
      q: null,
      category,
      market: null,
      country: null,
      vendor: null,
      price: null,
      maxPriceKobo: null,
      sort: "featured",
      page: 1,
      pageSize: null
    });

    const parentSlug = "electronics-technology";
    const parent = tree.publicById.get(
      [...tree.publicById.values()].find((row) => row.slug === parentSlug)?.id ?? ""
    );
    if (!parent) fail("electronics-technology parent category is missing");

    const parentIds = subtreeIds(tree, parent);
    const parentProductIds = new Set(publicProducts(products.rows, new Set(parentIds)).map((product) => product.id));
    const parentScope = await catalog.resolveCategoryScope(parentSlug, { countryCode: COUNTRY });
    const parentPage = await catalog.queryCatalogProducts(queryFor(parentSlug));
    const parentPageIds = parentPage.items.map((product) => product.id);
    const parentLevels = new Set(parentPage.items.map((product) => product.category.level));

    check(
      "root scope includes multiple descendant levels",
      parentIds.length > 1 && parentLevels.has(2) && parentPageIds.length === parentProductIds.size,
      `${parentIds.length} categories / levels ${[...parentLevels].sort().join(",")} / ${parentPage.total} products`
    );
    check(
      "root returns every descendant product exactly once",
      parentPageIds.length === new Set(parentPageIds).size &&
        parentPageIds.every((id) => parentProductIds.has(id)) &&
        parentPage.total === parentProductIds.size,
      `total=${parentPage.total}, expected=${parentProductIds.size}, unique=${new Set(parentPageIds).size}`
    );
    check(
      "resolveCategoryScope matches independent subtree",
      parentScope.categoryIds.length === parentIds.length &&
        new Set(parentScope.categoryIds).size === parentScope.categoryIds.length &&
        parentScope.categoryIds.every((id) => parentIds.includes(id)),
      `${parentScope.categoryIds.length} ids`
    );

    // Leaf-only: smartphones is populated by the reviewed mapping.
    const leafSlug = "smartphones";
    const leafCategory = [...tree.publicById.values()].find((row) => row.slug === leafSlug);
    if (!leafCategory) fail("smartphones leaf is missing");
    const leafExpected = new Set(
      publicProducts(products.rows, new Set([leafCategory.id])).map((product) => product.id)
    );
    const leafPage = await catalog.queryCatalogProducts(queryFor(leafSlug));
    const leafPageIds = leafPage.items.map((product) => product.id);
    check(
      "leaf returns only its own products",
      leafPage.total === leafExpected.size &&
        leafPageIds.length === leafExpected.size &&
        leafPageIds.every((id) => leafExpected.has(id)) &&
        leafPage.items.every((product) => product.categoryId === leafCategory.id),
      `total=${leafPage.total}, expected=${leafExpected.size}`
    );
    check(
      "leaf products are a subset of the parent result",
      leafPageIds.every((id) => parentPageIds.includes(id)),
      `${leafPageIds.length} leaf ids`
    );
    check("leaf page has no duplicate rows", new Set(leafPageIds).size === leafPageIds.length);

    // Empty selectable leaf: a real empty state, still present in the tree.
    const emptyLeaf = tree.publicRows.find(
      (row) =>
        row.level === 2 &&
        row.isSelectable &&
        !tree.restricted.has(row.id) &&
        publicProducts(products.rows, new Set([row.id])).length === 0
    );
    if (!emptyLeaf) fail("no empty selectable leaf found for the empty-state test");
    const emptyPage = await catalog.queryCatalogProducts(queryFor(emptyLeaf.slug));
    check(
      "empty selectable category returns an honest empty page",
      emptyPage.total === 0 && emptyPage.items.length === 0 && Boolean(tree.publicById.get(emptyLeaf.id)),
      emptyLeaf.slug
    );

    // Restricted descendant: excluded from the parent scope and from direct browsing.
    const restrictedKey = RESTRICTED_CATEGORY_KEYS[0];
    const restrictedCategory = [...tree.byId.values()].find((row) => row.key === restrictedKey);
    if (!restrictedCategory?.parentId) fail(`restricted leaf ${restrictedKey} is missing`);
    const restrictedRule = rules.rows.find(
      (rule) => rule.categoryId === restrictedCategory.id && rule.countryCode === COUNTRY
    );
    const restrictedParent = tree.publicById.get(restrictedCategory.parentId);
    const restrictedScope = await catalog.resolveCategoryScope(restrictedCategory.slug, { countryCode: COUNTRY });
    const parentOfRestrictedScope = restrictedParent
      ? await catalog.resolveCategoryScope(restrictedParent.slug, { countryCode: COUNTRY })
      : null;
    check(
      "restricted descendant excluded from parent aggregation",
      restrictedRule?.canPublish === false &&
        restrictedScope.categoryIds.length === 0 &&
        Boolean(parentOfRestrictedScope) &&
        !parentOfRestrictedScope?.categoryIds.includes(restrictedCategory.id),
      `${restrictedCategory.slug} canPublish=${String(restrictedRule?.canPublish)}`
    );

    const inactiveCategory = categories.rows.find((row) => !row.isActive);
    if (!inactiveCategory) fail("no inactive category found for the archived test");
    const inactiveScope = await catalog.resolveCategoryScope(inactiveCategory.slug, { countryCode: COUNTRY });
    check(
      "inactive/archived category never resolves to products",
      inactiveScope.categoryIds.length === 0,
      `${inactiveCategory.slug}`
    );

    // Drafts/archived products absent from discovery and search.
    const nonActiveIds = new Set(products.rows.filter((product) => product.status !== "ACTIVE").map((product) => product.id));
    const allPage = await catalog.queryCatalogProducts(queryFor(null));
    const allPageIds = allPage.items.map((product) => product.id);
    check(
      "draft/archived products excluded from the catalogue",
      allPageIds.every((id) => !nonActiveIds.has(id)) &&
        allPageIds.every((id) => visibleIds.has(id)) &&
        allPage.total === visibleProducts.length,
      `visible=${allPage.total}, expected=${visibleProducts.length}`
    );
    check(
      "global catalogue has no duplicates",
      new Set(allPageIds).size === allPageIds.length,
      `${allPageIds.length} rows`
    );

    const draft = products.rows.find((product) => product.status !== "ACTIVE" && product.name.length > 8);
    if (draft) {
      const search = await catalog.queryCatalogProducts({ ...queryFor(null), q: draft.name.slice(0, 24) });
      check(
        "draft product never appears in search",
        !search.items.some((product) => product.id === draft.id),
        `${draft.status} ${draft.id}`
      );
    } else {
      check("draft product never appears in search", false, "no non-active product available to test");
    }

    // ---- /api/categories roots and counts --------------------------------
    const roots = await catalog.getCategories();
    const rootCountSum = roots.reduce((sum, root) => sum + root.productCount, 0);
    const rootScopes = roots.map((root) => {
      const row = tree.publicById.get(root.id);
      if (!row) return [] as string[];
      return subtreeIds(tree, row);
    });
    const rootScopeSets = rootScopes.map((ids) => new Set(ids));
    const disjointRoots = rootScopeSets.every((left, index) =>
      rootScopeSets.every((right, other) => index === other || ![...left].some((id) => right.has(id)))
    );
    const independentRootCounts = roots.map((root) => {
      const row = tree.publicById.get(root.id);
      if (!row) return -1;
      return publicProducts(products.rows, new Set(subtreeIds(tree, row))).length;
    });
    check(
      "/api/categories returns the 11 active roots",
      roots.length === 11 && roots.every((root) => tree.roots.some((row) => row.id === root.id)),
      `${roots.length} roots`
    );
    check(
      "/api/categories counts match descendant aggregation",
      roots.every((root, index) => root.productCount === independentRootCounts[index]) &&
        rootCountSum === visibleProducts.length,
      `sum=${rootCountSum}, visible=${visibleProducts.length}`
    );
    check("root scopes do not overlap (no double counting)", disjointRoots);

    // ---- alias search -----------------------------------------------------
    const aliasResult = await client.query<{
      alias: string;
      categoryId: string;
      path: string;
    }>(
      `select a.alias, c.id as "categoryId",
              coalesce(p.name || ' / ', '') || c.name as path
         from "CategoryAlias" a
         join "Category" c on c.id = a."categoryId"
         left join "Category" p on p.id = c."parentId"
        where c."isActive" and c."deprecatedAt" is null and c."isSelectable" and c.level <= 2
          and (c.key is null or c.key <> all($1::text[]))
          and a.alias = (
            select a2.alias from "CategoryAlias" a2
             join "Category" c2 on c2.id = a2."categoryId"
            where c2."isActive" and c2."deprecatedAt" is null and c2."isSelectable" and c2.level <= 2
              and (c2.key is null or c2.key <> all($1::text[]))
            group by a2.alias
            having count(distinct a2."categoryId") = 1
            order by length(a2.alias) desc, a2.alias asc
            limit 1
          )
        limit 1`,
      [RESTRICTED_CATEGORY_KEYS]
    );
    const aliasRow = aliasResult.rows[0];
    if (!aliasRow) fail("no unique alias found for the alias-search test");
    const aliasSuggestions = await eligibility.suggestSellerCategories({
      countryCode: COUNTRY,
      query: aliasRow.alias
    });
    check(
      "alias search resolves the eligible category",
      aliasSuggestions.mode === "deterministic" &&
        aliasSuggestions.suggestions.some((suggestion) => suggestion.categoryId === aliasRow.categoryId),
      `${aliasRow.alias} -> ${aliasSuggestions.suggestions.map((suggestion) => suggestion.categoryId).join(",")}`
    );

    const noMatch = await eligibility.suggestSellerCategories({
      countryCode: COUNTRY,
      query: "zzzz-no-such-category-zzzz"
    });
    check(
      "deterministic search does not call Aura by default",
      noMatch.mode === "deterministic" && noMatch.assist === undefined,
      `${noMatch.suggestions.length} suggestions`
    );

    // ---- optional Aura adapter (injected deterministic generator) ---------
    const candidates = await assist.listEligibleCategoryCandidates(COUNTRY);
    check(
      "Aura candidates are eligible categories only",
      candidates.length > 0 &&
        candidates.every((candidate) => {
          const row = tree.publicById.get(candidate.id);
          return Boolean(row && row.isSelectable && !tree.restricted.has(row.id));
        }),
      `${candidates.length} candidates`
    );
    const mocked = await assist.suggestCategoriesWithModel({
      query: "specialist kitchen tool",
      candidates,
      generate: async () =>
        JSON.stringify({
          suggestions: [
            { categoryId: "not-a-real-category", reason: "invented" },
            { categoryId: candidates[0].id, reason: "Best match in the eligible list." }
          ]
        })
    });
    check(
      "Aura adapter discards invented ids and keeps eligible ones",
      mocked.suggestions.length === 1 &&
        mocked.suggestions[0]?.categoryId === candidates[0].id &&
        mocked.suggestions[0]?.path === candidates[0].path,
      `${mocked.suggestions.length} suggestion(s)`
    );
    const malformed = await assist.suggestCategoriesWithModel({
      query: "specialist kitchen tool",
      candidates,
      generate: async () => "not json at all"
    });
    check("Aura adapter fails closed on malformed output", malformed.suggestions.length === 0);
    const assistConfigured = assist.categoryAssistConfigured();
    check(
      "Aura model assistance is opt-in and provider-gated",
      assistConfigured === (Boolean(process.env.DEEPSEEK_API_KEY) || process.env.AURA_TEST_PROVIDER === "1"),
      assistConfigured ? "provider configured" : "no provider in test process (deterministic path)"
    );

    // ---- HTTP parity (optional) ------------------------------------------
    const httpChecks: Check[] = [];
    if (baseUrl) {
      const httpCheck = (name: string, pass: boolean, detail = "") => {
        httpChecks.push({ name, pass, detail });
      };
      try {
        const tax = await getJson(`${baseUrl}/api/taxonomy`);
        const departments = Array.isArray(asRecord(tax.body).departments)
          ? (asRecord(tax.body).departments as unknown[])
          : [];
        const leaves = departments.reduce<number>((count, node) => count + countLeaves(node), 0);
        const taxonomyIds = new Set<string>();
        for (const node of departments) collectIds(node, taxonomyIds);
        httpCheck(
          "HTTP /api/taxonomy contract: 11 departments, 117 leaves",
          tax.status === 200 && departments.length === 11 && leaves === 117,
          `status=${tax.status}, departments=${departments.length}, leaves=${leaves}`
        );
        httpCheck(
          "HTTP /api/taxonomy exposes active rows only",
          [...taxonomyIds].every((id) => {
            const row = tree.byId.get(id);
            return Boolean(row && row.isActive && !row.deprecatedAt);
          }),
          `${taxonomyIds.size} node ids`
        );

        const cats = await getJson(`${baseUrl}/api/categories`);
        const rootRows = Array.isArray(cats.body) ? (cats.body as Record<string, unknown>[]) : [];
        const rootCounts = rootRows.map((row) =>
          typeof row.productCount === "number" ? row.productCount : Number.NaN
        );
        const expectedBySlug = new Map(
          roots.map((root, index) => [root.slug, independentRootCounts[index]])
        );
        httpCheck(
          "HTTP /api/categories returns roots with aggregated counts",
          cats.status === 200 &&
            rootRows.length === 11 &&
            rootRows.every((row) => {
              const slug = typeof row.slug === "string" ? row.slug : "";
              return row.productCount === expectedBySlug.get(slug);
            }) &&
            rootCounts.reduce((sum, count) => sum + count, 0) === visibleProducts.length,
          `${rootRows.length} roots, sum=${rootCounts.reduce((sum, count) => sum + count, 0)}`
        );

        const parentHttp = await getJson(
          `${baseUrl}/api/products?category=${encodeURIComponent(parentSlug)}&page=1&pageSize=60`
        );
        const parentBody = asRecord(parentHttp.body);
        const parentItems = Array.isArray(parentBody.items) ? (parentBody.items as Record<string, unknown>[]) : [];
        const parentItemIds = parentItems.map((item) => String(item.id ?? ""));
        httpCheck(
          "HTTP parent category aggregates descendant products once",
          parentHttp.status === 200 &&
            parentBody.total === parentPage.total &&
            new Set(parentItemIds).size === parentItemIds.length &&
            parentItemIds.every((id) => parentProductIds.has(id)),
          `status=${parentHttp.status}, total=${String(parentBody.total)}`
        );

        const leafHttp = await getJson(
          `${baseUrl}/api/products?category=${encodeURIComponent(leafSlug)}&page=1&pageSize=60`
        );
        const leafBody = asRecord(leafHttp.body);
        const leafItems = Array.isArray(leafBody.items) ? (leafBody.items as Record<string, unknown>[]) : [];
        httpCheck(
          "HTTP leaf returns only that leaf",
          leafHttp.status === 200 &&
            leafBody.total === leafPage.total &&
            leafItems.every((item) => asRecord(item.category).slug === leafSlug),
          `status=${leafHttp.status}, total=${String(leafBody.total)}`
        );

        const restrictedHttp = await getJson(
          `${baseUrl}/api/products?category=${encodeURIComponent(restrictedCategory.slug)}&page=1&pageSize=10`
        );
        const restrictedBody = asRecord(restrictedHttp.body);
        httpCheck(
          "HTTP restricted leaf returns no public products",
          restrictedHttp.status === 200 && restrictedBody.total === 0,
          `status=${restrictedHttp.status}, total=${String(restrictedBody.total)}`
        );

        const inactiveHttp = await getJson(
          `${baseUrl}/api/products?category=${encodeURIComponent(inactiveCategory.slug)}&page=1&pageSize=10`
        );
        const inactiveBody = asRecord(inactiveHttp.body);
        httpCheck(
          "HTTP archived category returns an empty page",
          inactiveHttp.status === 200 && inactiveBody.total === 0,
          `status=${inactiveHttp.status}, total=${String(inactiveBody.total)}`
        );

        if (draft) {
          const draftHttp = await getJson(
            `${baseUrl}/api/products?q=${encodeURIComponent(draft.name.slice(0, 24))}&page=1&pageSize=60`
          );
          const draftBody = asRecord(draftHttp.body);
          const draftItems = Array.isArray(draftBody.items) ? (draftBody.items as Record<string, unknown>[]) : [];
          httpCheck(
            "HTTP search never returns a draft product",
            draftHttp.status === 200 && !draftItems.some((item) => String(item.id ?? "") === draft.id),
            `status=${draftHttp.status}`
          );
        }

        const globalHttp = await getJson(`${baseUrl}/api/products?page=1&pageSize=60`);
        const globalBody = asRecord(globalHttp.body);
        const globalItems = Array.isArray(globalBody.items) ? (globalBody.items as Record<string, unknown>[]) : [];
        const globalIds = globalItems.map((item) => String(item.id ?? ""));
        httpCheck(
          "HTTP catalogue total matches the public product set",
          globalHttp.status === 200 &&
            globalBody.total === visibleProducts.length &&
            new Set(globalIds).size === globalIds.length,
          `status=${globalHttp.status}, total=${String(globalBody.total)}, expected=${visibleProducts.length}`
        );
      } catch (error) {
        httpCheck(
          "HTTP preview reachable",
          false,
          error instanceof Error ? `${error.name}: ${error.message}` : String(error)
        );
      }
    }

    const allChecks = [...checks, ...httpChecks];
    const failed = allChecks.filter((entry) => !entry.pass);
    const summary = {
      database: actualDb,
      classification: "REVIEW",
      baseUrl,
      productSet: {
        activeEligible: visibleProducts.length,
        allPublicCategoryProducts: allPublicProducts.length,
        draftsExcluded: nonActiveIds.size
      },
      roots: roots.map((root, index) => ({
        slug: root.slug,
        productCount: root.productCount,
        independentCount: independentRootCounts[index]
      })),
      alias: aliasRow.alias,
      assistConfigured: assist.categoryAssistConfigured(),
      checks: allChecks,
      result: failed.length === 0 ? "PASS" : "FAIL"
    };

    if (jsonOutput) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log(`REVIEW taxonomy aggregation tests — ${actualDb} (REVIEW)`);
      console.log(`HTTP: ${baseUrl ?? "not requested (--base-url absent)"}`);
      console.log(`Public products: ${visibleProducts.length}; drafts/archived excluded: ${nonActiveIds.size}`);
      console.log("");
      for (const entry of allChecks) {
        console.log(`${entry.pass ? "PASS" : "FAIL"}  ${entry.name}${entry.detail ? ` — ${entry.detail}` : ""}`);
      }
      console.log("");
      console.log(`Result: ${summary.result} (${allChecks.length - failed.length}/${allChecks.length})`);
    }

    if (failed.length > 0) process.exitCode = 1;
  } catch (error) {
    fail(sanitize(error instanceof Error ? error.message : String(error)));
  } finally {
    await client.end().catch(() => undefined);
  }
}

function collectIds(value: unknown, into: Set<string>): void {
  const node = asRecord(value);
  if (typeof node.id === "string") into.add(node.id);
  if (Array.isArray(node.children)) {
    for (const child of node.children) collectIds(child, into);
  }
}

function countLeaves(value: unknown): number {
  const node = asRecord(value);
  const children = Array.isArray(node.children) ? node.children : [];
  if (children.length === 0) return 1;
  return children.reduce((sum, child) => sum + countLeaves(child), 0);
}

void main().catch((error) => {
  console.error(`FAIL: ${sanitize(error instanceof Error ? error.message : String(error))}`);
  process.exit(2);
});
