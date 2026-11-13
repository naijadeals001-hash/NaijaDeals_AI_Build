#!/usr/bin/env node
/**
 * READ-ONLY taxonomy coverage report for the REVIEW catalogue.
 *
 * Derives every published coverage number from the live REVIEW database rather
 * than from hand-written documentation:
 *
 *  - departments / categories / selectable leaves
 *  - publishable versus NG-regulated leaves
 *  - populated leaves and the active products sitting on them
 *  - ambiguous active products retained on level-1 categories
 *  - the applied product -> leaf plan and the re-applied audit rows
 *  - product status totals, fixture-like rows and CRF naming
 *
 * `--images` also audits every active-product image URL and every department
 * imageUrl against the canonical preview: HEAD status and Chromium
 * naturalWidth. Missing department art (a null imageUrl) is reported as a gap,
 * never silently replaced with unrelated imagery.
 *
 * No Product, Category or other row is written. The transaction is opened
 * READ ONLY and a product/category fingerprint is compared before and after.
 *
 * Usage:
 *   REVIEW_DATABASE_URL=postgresql://... \
 *     npx tsx scripts/taxonomy-coverage-report.ts --expect-db=naijadeals_review
 *
 *   Add --json for a machine-readable summary.
 *   Add --images [--base-url=http://localhost:3047] for the image audit.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import {
  TAXONOMY_BY_KEY,
  validateTaxonomy
} from "../lib/data/taxonomy";

type CategoryRow = {
  id: string;
  key: string | null;
  name: string;
  slug: string;
  parentId: string | null;
  level: number;
  isSelectable: boolean;
  isActive: boolean;
  imageUrl: string | null;
  imageAlt: string | null;
  sortOrder: number;
};

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  categoryId: string;
  status: string;
  isDemo: boolean;
  isSample: boolean;
  priceKobo: string;
  countryCode: string;
};

type ImageRow = {
  productId: string;
  url: string;
  alt: string | null;
};

type RuleRow = {
  categoryId: string;
  countryCode: string;
  canPublish: boolean;
};

type AuditRow = {
  entityId: string;
  createdAt: Date;
  metadata: {
    productName?: string;
    afterCategoryId?: string;
    afterPath?: string;
    proposedLeafKey?: string;
    beforePath?: string;
    batchSize?: number;
  } | null;
};

type PlanEntry = {
  productId: string;
  name: string;
  currentCategory: { key: string | null; slug: string; name: string; path: string };
  proposedLeaf: { key: string; slug: string; path: string } | null;
  action: "map" | "keep" | "review";
  ambiguous: boolean;
};

type PlanDocument = {
  schemaVersion: number;
  database: string;
  reviewOnly: boolean;
  applied: boolean;
  summary?: {
    total?: number;
    mapped?: number;
    ambiguous?: number;
    alreadyOnProposedLeaf?: number;
    proposedMoves?: number;
    kept?: number;
  };
  products: PlanEntry[];
};

type ImageAudit = {
  url: string;
  kind: "product" | "department";
  owner: string;
  headStatus: number | null;
  naturalWidth: number | null;
  naturalHeight: number | null;
  existsOnDisk: boolean | null;
  ok: boolean;
  error?: string;
};

const FIXTURE_PATTERN =
  /(^|[^a-z])(qa|test|fixture|acceptance|dummy|sample|placeholder|probe)([^a-z]|$)/i;
const CRF_PATTERN = /(^|[^a-z])crf([^a-z]|$)/i;

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

function argvValue(argv: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = argv.find((value) => value.startsWith(prefix));
  return arg?.slice(prefix.length).trim() || undefined;
}

function parseExpectedDatabase(argv: string[]): string {
  const expected = argvValue(argv, "expect-db");
  if (!expected) {
    fail("--expect-db=<database-name> is required so the target cannot be guessed");
  }
  if (!/^[A-Za-z0-9_]+$/.test(expected)) {
    fail("--expect-db must contain only letters, digits and underscores");
  }
  return expected;
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
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) {
    fail("REVIEW_DATABASE_URL must be a postgresql:// connection");
  }
  const urlDatabase = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (urlDatabase !== expectedDb) {
    fail(`REVIEW_DATABASE_URL points at ${urlDatabase || "(no database)"} but --expect-db=${expectedDb}`);
  }
  return url;
}

function pathOf(category: CategoryRow | undefined, byId: Map<string, CategoryRow>): CategoryRow[] {
  const chain: CategoryRow[] = [];
  const seen = new Set<string>();
  let cursor = category;
  while (cursor) {
    if (seen.has(cursor.id)) throw new Error(`category cycle at ${cursor.slug}`);
    seen.add(cursor.id);
    chain.unshift(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return chain;
}

function loadPlan(): PlanDocument {
  const path = resolve(process.cwd(), "docs/taxonomy/product-leaf-mapping.json");
  let document: PlanDocument;
  try {
    document = JSON.parse(readFileSync(path, "utf8")) as PlanDocument;
  } catch (error) {
    fail(`cannot read docs/taxonomy/product-leaf-mapping.json: ${sanitize(String(error))}`);
  }
  if (document.schemaVersion !== 1) fail("mapping plan schemaVersion must be 1");
  if (document.database !== "naijadeals_review") fail("mapping plan must target naijadeals_review");
  if (document.reviewOnly !== true) fail("mapping plan must declare reviewOnly=true");
  if (document.applied !== true) fail("mapping plan must declare applied=true (it has been applied)");
  if (!Array.isArray(document.products)) fail("mapping plan has no products array");
  return document;
}

function localImagePath(url: string): string | null {
  if (!url.startsWith("/")) return null;
  return resolve(process.cwd(), "public", url.replace(/^\/+/, ""));
}

async function auditImages(
  baseUrl: string,
  targets: Array<{ url: string; kind: "product" | "department"; owner: string }>
): Promise<ImageAudit[]> {
  const results: ImageAudit[] = [];
  for (const target of targets) {
    const absolute = /^https?:/i.test(target.url) ? target.url : `${baseUrl}${target.url}`;
    let headStatus: number | null = null;
    let headError: string | undefined;
    try {
      const response = await fetch(absolute, { method: "HEAD", redirect: "follow" });
      headStatus = response.status;
    } catch (error) {
      headError = error instanceof Error ? error.message : String(error);
    }
    const disk = localImagePath(target.url);
    results.push({
      url: target.url,
      kind: target.kind,
      owner: target.owner,
      headStatus,
      naturalWidth: null,
      naturalHeight: null,
      existsOnDisk: disk ? existsSync(disk) : null,
      ok: false,
      error: headError
    });
  }

  let browser: import("playwright").Browser | null = null;
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch();
    const page = await browser.newPage();
    for (const result of results) {
      const absolute = /^https?:/i.test(result.url) ? result.url : `${baseUrl}${result.url}`;
      try {
        await page.goto(absolute, { waitUntil: "load", timeout: 20000 });
        const dimensions = await page.evaluate(() => {
          const image = document.querySelector("img");
          return image
            ? { naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight }
            : null;
        });
        result.naturalWidth = dimensions?.naturalWidth ?? null;
        result.naturalHeight = dimensions?.naturalHeight ?? null;
      } catch (error) {
        result.error = error instanceof Error ? error.message : String(error);
      }
      result.ok =
        result.headStatus === 200 &&
        (result.naturalWidth ?? 0) > 0 &&
        (result.naturalHeight ?? 0) > 0;
    }
  } finally {
    await browser?.close().catch(() => undefined);
  }
  return results;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const jsonOutput = argv.includes("--json");
  const auditImageAssets = argv.includes("--images");
  const baseUrl = (argvValue(argv, "base-url") ?? "http://localhost:3047").replace(/\/+$/, "");
  const expectedDb = parseExpectedDatabase(argv);
  const reviewUrl = resolveReviewUrl(expectedDb);
  validateTaxonomy();
  const plan = loadPlan();

  const client = new Client({
    connectionString: reviewUrl,
    connectionTimeoutMillis: 8000,
    application_name: "naijadeals-taxonomy-coverage-report"
  });
  let inTransaction = false;

  try {
    await client.connect();
    const identity = await client.query<{ database: string }>(
      "select current_database() as database"
    );
    const actualDb = identity.rows[0]?.database ?? "";
    if (actualDb !== expectedDb) fail(`connected to ${actualDb || "(unknown)"} instead of ${expectedDb}`);
    const classification = await client.query<{ classification: string }>(
      'select classification from "DatabaseClassification"'
    );
    if (!classification.rows.some((row) => row.classification === "REVIEW")) {
      fail(`${actualDb} is not classified REVIEW`);
    }

    await client.query("BEGIN READ ONLY");
    inTransaction = true;
    const readOnly = await client.query<{ transaction_read_only: string }>(
      "show transaction_read_only"
    );
    if (readOnly.rows[0]?.transaction_read_only !== "on") {
      fail("transaction is not read-only; refusing to continue");
    }

    const categories = await client.query<CategoryRow>(
      `select id, key, name, slug, "parentId", level, "isSelectable", "isActive", "imageUrl", "imageAlt", "sortOrder"
         from "Category"`
    );
    const byId = new Map(categories.rows.map((row) => [row.id, row]));
    const products = await client.query<ProductRow>(
      `select id, name, slug, "categoryId", status, "isDemo", "isSample", "priceKobo"::text as "priceKobo", "countryCode"
         from "Product"`
    );
    const images = await client.query<ImageRow>(
      `select i."productId", i.url, i.alt from "ProductImage" i`
    );
    const rules = await client.query<RuleRow>(
      `select "categoryId", "countryCode", "canPublish" from "CategoryCountryRule"`
    );
    const audits = await client.query<AuditRow>(
      `select "entityId", "createdAt", metadata from "AuditLog"
        where action = 'taxonomy.product.reclassified'
        order by "createdAt" asc`
    );
    const categoryRequests = await client.query<{
      id: string;
      status: string;
      suggestedName: string;
      createdAt: Date;
    }>('select id, status, "suggestedName", "createdAt" from "CategoryRequest" order by "createdAt" asc');

    const fingerprint = async (): Promise<string> => {
      const productRows = await client.query<{ value: string }>(
        `select md5(coalesce(string_agg(id || ':' || "categoryId" || ':' || slug || ':' || status, '|' order by id), '')) as value
           from "Product"`
      );
      const categoryRows = await client.query<{ value: string }>(
        `select md5(coalesce(string_agg(id || ':' || coalesce("parentId", '') || ':' || slug || ':' || "isActive"::text, '|' order by id), '')) as value
           from "Category"`
      );
      return `${productRows.rows[0]?.value ?? ""}:${categoryRows.rows[0]?.value ?? ""}`;
    };
    const fingerprintBefore = await fingerprint();

    const ngRuleByCategory = new Map(
      rules.rows
        .filter((row) => row.countryCode === "NG")
        .map((row) => [row.categoryId, row.canPublish])
    );
    const isRegulated = (categoryId: string): boolean => ngRuleByCategory.get(categoryId) === false;

    const activeCategory = (category: CategoryRow | undefined): boolean =>
      Boolean(category && category.isActive && category.key && category.level <= 2);
    const departments = categories.rows
      .filter((row) => row.level === 0 && activeCategory(row))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    const levelOneCategories = categories.rows.filter((row) => row.level === 1 && activeCategory(row));
    const leaves = categories.rows.filter(
      (row) => row.level === 2 && activeCategory(row) && row.isSelectable
    );
    const leafDeprecation = leaves.filter((leaf) => {
      const source = leaf.key ? TAXONOMY_BY_KEY.get(leaf.key) : undefined;
      return source?.level !== 2 || !source.isSelectable;
    });

    const activeProducts = products.rows.filter((product) => product.status === "ACTIVE");
    const activeById = new Map(activeProducts.map((product) => [product.id, product]));
    const categoryById = new Map(categories.rows.map((row) => [row.id, row]));
    const productsByCategory = new Map<string, ProductRow[]>();
    for (const product of activeProducts) {
      const list = productsByCategory.get(product.categoryId) ?? [];
      list.push(product);
      productsByCategory.set(product.categoryId, list);
    }
    const imagesByProduct = new Map<string, ImageRow[]>();
    for (const image of images.rows) {
      const list = imagesByProduct.get(image.productId) ?? [];
      list.push(image);
      imagesByProduct.set(image.productId, list);
    }

    const problems: string[] = [];
    const activeOnLeaves = activeProducts.filter(
      (product) => categoryById.get(product.categoryId)?.level === 2
    );
    const activeOnLevelOne = activeProducts.filter(
      (product) => categoryById.get(product.categoryId)?.level === 1
    );
    const activeOnUnexpected = activeProducts.filter((product) => {
      const category = categoryById.get(product.categoryId);
      return !category || category.level === 0 || !category.isActive || !category.isSelectable;
    });

    if (activeOnUnexpected.length > 0) {
      problems.push(
        `active products sit outside active selectable taxonomy nodes: ${activeOnUnexpected
          .map((product) => `${product.id}/${product.slug}`)
          .join(", ")}`
      );
    }
    if (leafDeprecation.length > 0) {
      problems.push(
        `active level-2 leaves are missing from the taxonomy source: ${leafDeprecation
          .map((leaf) => leaf.slug)
          .join(", ")}`
      );
    }

    const publishableLeaves = leaves.filter((leaf) => !isRegulated(leaf.id));
    const regulatedLeaves = leaves.filter((leaf) => isRegulated(leaf.id));
    const populatedLeaves = leaves.filter((leaf) => (productsByCategory.get(leaf.id) ?? []).length > 0);
    const emptyPublishableLeaves = publishableLeaves.filter(
      (leaf) => (productsByCategory.get(leaf.id) ?? []).length === 0
    );
    const activeOnPublishableLeaves = activeOnLeaves.filter((product) =>
      !isRegulated(product.categoryId)
    );
    const activeOnRegulatedLeaves = activeOnLeaves.filter((product) =>
      isRegulated(product.categoryId)
    );
    if (activeOnRegulatedLeaves.length > 0) {
      problems.push(
        `active products sit on NG-regulated leaves: ${activeOnRegulatedLeaves
          .map((product) => product.slug)
          .join(", ")}`
      );
    }

    const activeFixtureRows = activeProducts.filter(
      (product) => product.isSample || FIXTURE_PATTERN.test(product.name)
    );
    if (activeFixtureRows.length > 0) {
      problems.push(
        `active acceptance fixtures or samples: ${activeFixtureRows
          .map((product) => `${product.id}/${product.name}`)
          .join(", ")}`
      );
    }
    const statusCounts = new Map<string, number>();
    const fixtureCounts = new Map<string, number>();
    for (const product of products.rows) {
      statusCounts.set(product.status, (statusCounts.get(product.status) ?? 0) + 1);
      if (product.isSample || FIXTURE_PATTERN.test(product.name)) {
        fixtureCounts.set(product.status, (fixtureCounts.get(product.status) ?? 0) + 1);
      }
    }

    const crfCategories = categories.rows.filter((category) => CRF_PATTERN.test(category.name));
    const crfRequests = categoryRequests.rows.filter((request) =>
      CRF_PATTERN.test(request.suggestedName)
    );
    if (crfCategories.length > 0) {
      problems.push(`CRF category names present: ${crfCategories.map((row) => row.name).join(", ")}`);
    }
    if (crfRequests.length > 0) {
      problems.push(
        `CRF category-request names present: ${crfRequests.map((row) => row.suggestedName).join(", ")}`
      );
    }

    // ---- Plan reconciliation (derived, not hardcoded) --------------------
    const planById = new Map(plan.products.map((entry) => [entry.productId, entry]));
    const planCounts = { map: 0, keep: 0, review: 0, ambiguous: 0 };
    const planProblems: string[] = [];
    if (plan.products.length !== activeProducts.length) {
      planProblems.push(
        `plan has ${plan.products.length} products but REVIEW has ${activeProducts.length} ACTIVE products`
      );
    }
    for (const product of activeProducts) {
      const entry = planById.get(product.id);
      if (!entry) {
        planProblems.push(`active product ${product.id}/${product.slug} has no plan entry`);
        continue;
      }
      const category = categoryById.get(product.categoryId);
      const chain = pathOf(category, byId);
      const currentSlug = chain[chain.length - 1]?.slug ?? null;
      const currentPath = chain.map((node) => node.name).join(" / ");
      if (entry.name !== product.name) {
        planProblems.push(`${product.id}: plan name does not match the catalogue`);
      }
      if (entry.action === "review") {
        planCounts.review += 1;
        if (entry.ambiguous) planCounts.ambiguous += 1;
        if (category?.level !== 1 || entry.currentCategory.slug !== currentSlug) {
          planProblems.push(`${product.id}: ambiguous product drifted from its reviewed level-1 category`);
        }
      } else {
        planCounts[entry.action] += 1;
        if (!entry.proposedLeaf) {
          planProblems.push(`${product.id}: ${entry.action} entry has no proposed leaf`);
          continue;
        }
        if (entry.proposedLeaf.slug !== currentSlug) {
          planProblems.push(
            `${product.id}: plan says ${entry.proposedLeaf.slug} but the product is on ${currentSlug ?? "(none)"}`
          );
        }
        if (category?.level !== 2) {
          planProblems.push(`${product.id}: ${entry.action} product is not on a level-2 leaf`);
        }
        const expectedPath = entry.proposedLeaf.path;
        if (expectedPath !== currentPath) {
          planProblems.push(`${product.id}: current path "${currentPath}" != plan path "${expectedPath}"`);
        }
      }
    }
    if (plan.summary) {
      if (
        plan.summary.total !== plan.products.length ||
        plan.summary.mapped !== planCounts.map ||
        plan.summary.ambiguous !== planCounts.ambiguous ||
        plan.summary.kept !== planCounts.keep
      ) {
        planProblems.push("plan summary counts do not match the database-derived plan counts");
      }
    }
    problems.push(...planProblems);

    // ---- Audit re-application proof (derived from AuditLog) --------------
    const auditByProduct = new Map<string, AuditRow[]>();
    for (const audit of audits.rows) {
      const list = auditByProduct.get(audit.entityId) ?? [];
      list.push(audit);
      auditByProduct.set(audit.entityId, list);
    }
    const auditedProducts: Array<{
      productId: string;
      name: string;
      currentSlug: string;
      afterPath: string | null;
      occurrences: number;
      matchesLatestAudit: boolean;
      leaf: boolean;
    }> = [];
    const reApplied: typeof auditedProducts = [];
    const auditProblems: string[] = [];
    for (const [productId, rows] of auditByProduct.entries()) {
      const product = activeById.get(productId);
      if (!product) continue;
      const latest = rows[rows.length - 1];
      const category = categoryById.get(product.categoryId);
      const chain = pathOf(category, byId);
      const currentSlug = chain[chain.length - 1]?.slug ?? "";
      const matchesLatestAudit = Boolean(
        latest?.metadata?.afterCategoryId && latest.metadata.afterCategoryId === product.categoryId
      );
      const leaf = category?.level === 2;
      const entry = {
        productId,
        name: product.name,
        currentSlug,
        afterPath: latest?.metadata?.afterPath ?? null,
        occurrences: rows.length,
        matchesLatestAudit,
        leaf
      };
      auditedProducts.push(entry);
      if (rows.length > 1) reApplied.push(entry);
      if (!matchesLatestAudit) {
        auditProblems.push(`${productId}: current category is not the audited afterCategoryId`);
      }
      if (!leaf) {
        auditProblems.push(`${productId}: audited product is not on a level-2 leaf`);
      }
    }
    if (auditProblems.length > 0) problems.push(...auditProblems);

    // ---- Department summary ---------------------------------------------
    const departmentSummary = departments.map((department) => {
      const categoriesInDepartment = levelOneCategories.filter(
        (category) => category.parentId === department.id
      );
      const categoryIds = new Set(categoriesInDepartment.map((category) => category.id));
      const departmentLeaves = leaves.filter(
        (leaf) => leaf.parentId && categoryIds.has(leaf.parentId)
      );
      const publishable = departmentLeaves.filter((leaf) => !isRegulated(leaf.id));
      const regulated = departmentLeaves.filter((leaf) => isRegulated(leaf.id));
      const populated = departmentLeaves.filter(
        (leaf) => (productsByCategory.get(leaf.id) ?? []).length > 0
      );
      const productsOnLeaves = departmentLeaves.flatMap(
        (leaf) => productsByCategory.get(leaf.id) ?? []
      );
      const productImages = new Set<string>();
      for (const product of productsOnLeaves) {
        for (const image of imagesByProduct.get(product.id) ?? []) productImages.add(image.url);
      }
      const emptyPublishable = publishable.filter(
        (leaf) => (productsByCategory.get(leaf.id) ?? []).length === 0
      );
      return {
        department: department.name,
        key: department.key,
        slug: department.slug,
        imageUrl: department.imageUrl,
        imageAlt: department.imageAlt,
        categories: categoriesInDepartment.length,
        leaves: departmentLeaves.length,
        publishableLeaves: publishable.length,
        regulatedLeaves: regulated.length,
        populatedLeaves: populated.length,
        emptyPublishableLeaves: emptyPublishable.length,
        activeProductsOnLeaves: productsOnLeaves.length,
        activeImages: productImages.size,
        missingDepartmentArt: !department.imageUrl
      };
    });

    const leafCoverage = leaves
      .map((leaf) => {
        const chain = pathOf(leaf, byId);
        const active = productsByCategory.get(leaf.id) ?? [];
        const source = leaf.key ? TAXONOMY_BY_KEY.get(leaf.key) : undefined;
        return {
          key: leaf.key,
          slug: leaf.slug,
          path: chain.map((node) => node.name).join(" / "),
          department: chain[0]?.name ?? null,
          regulated: isRegulated(leaf.id),
          reviewRequired: source?.reviewRequired ?? false,
          activeProducts: active.length,
          productNames: active.map((product) => product.name),
          images: active.flatMap((product) =>
            (imagesByProduct.get(product.id) ?? []).map((image) => image.url)
          )
        };
      })
      .sort((a, b) => {
        if (a.regulated !== b.regulated) return a.regulated ? 1 : -1;
        if (a.department !== b.department) return (a.department ?? "").localeCompare(b.department ?? "");
        return a.path.localeCompare(b.path);
      });

    const ambiguousProducts = activeOnLevelOne.map((product) => {
      const chain = pathOf(categoryById.get(product.categoryId), byId);
      return {
        productId: product.id,
        name: product.name,
        slug: product.slug,
        currentCategory: chain[chain.length - 1]?.name ?? null,
        currentPath: chain.map((node) => node.name).join(" / "),
        reason: "retained on a selectable level-1 category pending a classification rule or leaf"
      };
    });

    const imageTargets: Array<{ url: string; kind: "product" | "department"; owner: string }> = [];
    const seenImageUrls = new Set<string>();
    for (const product of activeProducts) {
      for (const image of imagesByProduct.get(product.id) ?? []) {
        if (seenImageUrls.has(image.url)) continue;
        seenImageUrls.add(image.url);
        imageTargets.push({ url: image.url, kind: "product", owner: product.slug });
      }
    }
    for (const department of departments) {
      if (!department.imageUrl) continue;
      if (seenImageUrls.has(department.imageUrl)) continue;
      seenImageUrls.add(department.imageUrl);
      imageTargets.push({ url: department.imageUrl, kind: "department", owner: department.slug });
    }
    const imageAudit = auditImageAssets ? await auditImages(baseUrl, imageTargets) : null;
    if (imageAudit) {
      const failedImages = imageAudit.filter((result) => !result.ok);
      if (failedImages.length > 0) {
        problems.push(
          `image audit failed for ${failedImages.length} URL(s): ${failedImages
            .map((result) => `${result.url} (HEAD ${result.headStatus ?? "error"}, naturalWidth ${result.naturalWidth ?? "n/a"})`)
            .join(", ")}`
        );
      }
    }
    const missingDepartmentArt = departments
      .filter((department) => !department.imageUrl)
      .map((department) => ({ slug: department.slug, name: department.name }));
    const activeProductsWithoutImage = activeProducts.filter(
      (product) => (imagesByProduct.get(product.id) ?? []).length === 0
    );
    if (activeProductsWithoutImage.length > 0) {
      problems.push(
        `active products without an image: ${activeProductsWithoutImage
          .map((product) => product.slug)
          .join(", ")}`
      );
    }
    const activeImagesWithoutAlt = images.rows.filter(
      (image) =>
        activeById.has(image.productId) && (!image.alt || image.alt.trim().length === 0)
    );
    if (activeImagesWithoutAlt.length > 0) {
      problems.push(`active product images without alt text: ${activeImagesWithoutAlt.length}`);
    }

    const fingerprintAfter = await fingerprint();
    if (fingerprintBefore !== fingerprintAfter) {
      problems.push("Product/Category fingerprint changed during a read-only run");
    }
    await client.query("ROLLBACK");
    inTransaction = false;

    const summary = {
      database: actualDb,
      classification: "REVIEW",
      readOnly: true,
      transactionReadOnly: readOnly.rows[0]?.transaction_read_only,
      writesAttempted: 0,
      fingerprintStable: fingerprintBefore === fingerprintAfter,
      taxonomy: {
        departments: departments.length,
        categories: levelOneCategories.length,
        leaves: leaves.length,
        nodes: departments.length + levelOneCategories.length + leaves.length,
        publishableLeaves: publishableLeaves.length,
        regulatedLeaves: regulatedLeaves.length,
        populatedLeaves: populatedLeaves.length,
        emptyPublishableLeaves: emptyPublishableLeaves.length,
        coverage: `${populatedLeaves.length}/${publishableLeaves.length}`,
        coverageGaps: emptyPublishableLeaves.length
      },
      products: {
        total: products.rows.length,
        active: activeProducts.length,
        activeOnLeaves: activeOnLeaves.length,
        activeOnPublishableLeaves: activeOnPublishableLeaves.length,
        activeOnRegulatedLeaves: activeOnRegulatedLeaves.length,
        activeOnLevelOne: activeOnLevelOne.length,
        activeOnUnexpected: activeOnUnexpected.length,
        activeFixtures: activeFixtureRows.length,
        statuses: [...statusCounts.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([status, count]) => ({
            status,
            count,
            fixtureLike: fixtureCounts.get(status) ?? 0
          }))
      },
      plan: {
        applied: plan.applied,
        total: plan.products.length,
        mapped: planCounts.map,
        kept: planCounts.keep,
        review: planCounts.review,
        ambiguous: planCounts.ambiguous,
        databaseDerived: true
      },
      audit: {
        reclassifiedProducts: auditedProducts.length,
        reAppliedAfterRevert: reApplied.length,
        reApplied: reApplied.map((entry) => ({
          productId: entry.productId,
          name: entry.name,
          leaf: entry.currentSlug,
          path: entry.afterPath,
          auditOccurrences: entry.occurrences
        })),
        allAuditedProductsOnAuditedLeaf: auditProblems.length === 0
      },
      categoryRequests: {
        total: categoryRequests.rows.length,
        statuses: [...new Set(categoryRequests.rows.map((row) => row.status))].sort().map((status) => ({
          status,
          count: categoryRequests.rows.filter((row) => row.status === status).length
        })),
        crfNames: crfRequests.length
      },
      crfCategoryNames: crfCategories.length,
      departments: departmentSummary,
      ambiguousProducts,
      leafCoverage,
      missingDepartmentArt,
      images: imageAudit
        ? {
            checked: imageAudit.length,
            passed: imageAudit.filter((result) => result.ok).length,
            failed: imageAudit.filter((result) => !result.ok).length,
            baseUrl,
            results: imageAudit
          }
        : {
            checked: 0,
            skipped: true,
            reason: "run with --images to audit HEAD status and Chromium naturalWidth"
          },
      result: problems.length === 0 ? "PASS" : "FAIL",
      problems
    };

    if (jsonOutput) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log(`REVIEW taxonomy coverage — ${actualDb} (classification REVIEW)`);
      console.log(
        `Read-only transaction: ${summary.transactionReadOnly}; writes attempted: 0; fingerprint stable: ${summary.fingerprintStable}`
      );
      console.log("");
      console.log(
        `Taxonomy: ${summary.taxonomy.departments} departments / ${summary.taxonomy.categories} categories / ` +
          `${summary.taxonomy.leaves} selectable leaves (${summary.taxonomy.nodes} nodes)`
      );
      console.log(
        `Publishable: ${summary.taxonomy.publishableLeaves}; NG-regulated: ${summary.taxonomy.regulatedLeaves}; ` +
          `populated: ${summary.taxonomy.populatedLeaves}/${summary.taxonomy.publishableLeaves} ` +
          `(${summary.taxonomy.coverage}); gaps: ${summary.taxonomy.coverageGaps}`
      );
      console.log(
        `Active products: ${summary.products.active}/${summary.products.total}; on leaves: ${summary.products.activeOnLeaves}; ` +
          `on level-1 (ambiguous): ${summary.products.activeOnLevelOne}; active fixtures: ${summary.products.activeFixtures}`
      );
      console.log(
        `Plan: ${summary.plan.total} products; ${summary.plan.mapped} map, ${summary.plan.kept} keep, ` +
          `${summary.plan.review} review (${summary.plan.ambiguous} ambiguous); applied=${summary.plan.applied}`
      );
      console.log(
        `Audit: ${summary.audit.reclassifiedProducts} reclassified products; ` +
          `${summary.audit.reAppliedAfterRevert} re-applied after revert; ` +
          `all on audited leaves=${summary.audit.allAuditedProductsOnAuditedLeaf}`
      );
      for (const entry of summary.audit.reApplied) {
        console.log(`  re-applied ${entry.productId} | ${entry.leaf} | ${entry.name}`);
      }
      console.log(
        `Statuses: ${summary.products.statuses
          .map((row) => `${row.status}=${row.count} (fixture-like=${row.fixtureLike})`)
          .join(", ")}`
      );
      console.log(
        `Category requests: ${summary.categoryRequests.statuses
          .map((row) => `${row.status}=${row.count}`)
          .join(", ") || "(none)"}; CRF names=${summary.categoryRequests.crfNames}; ` +
          `CRF category names=${summary.crfCategoryNames}`
      );
      console.log("");
      console.log("Department coverage:");
      for (const row of summary.departments) {
        console.log(
          `  ${row.department.padEnd(30)} leaves ${String(row.leaves).padStart(2)} ` +
            `(publishable ${row.publishableLeaves}, regulated ${row.regulatedLeaves}); ` +
            `populated ${String(row.populatedLeaves).padStart(2)}; products ${String(row.activeProductsOnLeaves).padStart(2)}; ` +
            `empty ${String(row.emptyPublishableLeaves).padStart(2)}; images ${String(row.activeImages).padStart(2)}; ` +
            `departmentArt=${row.imageUrl ?? "MISSING"}`
        );
      }
      console.log("");
      console.log("Ambiguous active products retained on level-1 categories:");
      for (const entry of summary.ambiguousProducts) {
        console.log(`  ${entry.productId} | ${entry.currentPath} | ${entry.name}`);
      }
      if (summary.missingDepartmentArt.length > 0) {
        console.log("");
        console.log(
          `Missing department art (${summary.missingDepartmentArt.length}): ` +
            summary.missingDepartmentArt.map((entry) => entry.slug).join(", ")
        );
      }
      if (imageAudit) {
        console.log("");
        console.log(
          `Image audit (${summary.images.baseUrl}): checked ${summary.images.checked}; ` +
            `passed ${summary.images.passed}; failed ${summary.images.failed}`
        );
        for (const result of imageAudit.filter((entry) => !entry.ok)) {
          console.log(
            `  FAIL ${result.kind} ${result.owner} ${result.url} | HEAD ${result.headStatus ?? "error"} | naturalWidth ${result.naturalWidth ?? "n/a"}`
          );
        }
      }
      console.log("");
      if (problems.length > 0) {
        for (const problem of problems) console.error(`PROBLEM: ${problem}`);
        console.error("Result: FAIL");
      } else {
        console.log(
          "Result: PASS — coverage, plan, audit, fixtures and naming are consistent with the REVIEW database."
        );
      }
    }

    if (problems.length > 0) process.exitCode = 1;
  } catch (error) {
    if (inTransaction) await client.query("ROLLBACK").catch(() => undefined);
    fail(sanitize(error instanceof Error ? error.message : String(error)));
  } finally {
    await client.end().catch(() => undefined);
  }
}

void main().catch((error) => {
  console.error(`FAIL: ${sanitize(error instanceof Error ? error.message : String(error))}`);
  process.exit(2);
});
