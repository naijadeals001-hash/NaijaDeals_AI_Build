#!/usr/bin/env node
/**
 * Guarded, idempotent application of the reviewed product -> leaf mapping.
 *
 * Default is a dry run: it validates every plan entry against the live REVIEW
 * catalogue and prints the before -> after report without writing.
 *
 * `--apply` writes Product.categoryId in batches ordered by product id. Each
 * batch is one transaction; every change writes an AuditLog row and a
 * SystemEvent row in that same transaction. Re-running is safe: a product
 * already on its proposed leaf is reported as already applied and skipped.
 *
 * Safety rules:
 *  - REVIEW_DATABASE_URL is mandatory; DATABASE_URL is never a fallback.
 *  - --expect-db must match the URL database and the live current_database().
 *  - DatabaseClassification must explicitly contain REVIEW.
 *  - Ambiguous products are never moved.
 *  - A target that is missing, inactive, deprecated, non-selectable, below
 *    level 2, detached from a live ancestor, or country-restricted blocks the
 *    whole apply before any write.
 *  - Only Product.categoryId and Product.updatedAt change. Ids, slugs, images,
 *    stock, variants and cart references are fingerprinted before and after.
 *  - docs/taxonomy/product-leaf-mapping.json is read-only and never rewritten.
 *
 * Usage:
 *   REVIEW_DATABASE_URL=postgresql://... \
 *     npx tsx scripts/taxonomy-apply-mapping.ts --expect-db=naijadeals_review
 *
 *   REVIEW_DATABASE_URL=postgresql://... \
 *     npx tsx scripts/taxonomy-apply-mapping.ts --expect-db=naijadeals_review --apply
 *
 *   Optional: --batch-size=10 (1-50), --json
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { TAXONOMY_BY_KEY, validateTaxonomy } from "../lib/data/taxonomy";

type PlanEntry = {
  productId: string;
  name: string;
  currentCategory: { key: string | null; slug: string; name: string; path: string };
  proposedLeaf: { key: string; slug: string; path: string } | null;
  action: "map" | "keep" | "review";
  confidence: "high" | "medium" | "low";
  ambiguous: boolean;
  reason: string;
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
  };
  products: PlanEntry[];
};

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
  status: string;
  categoryId: string;
  countryCode: string;
};

type ValidatedEntry = {
  plan: PlanEntry;
  product: ProductRow;
  currentPath: string;
  target: CategoryRow | null;
  afterPath: string | null;
  alreadyApplied: boolean;
  status: "move" | "keep" | "already" | "ambiguous";
};

const EXPECTED_ACTIVE_PRODUCTS = 49;
const EXPECTED_POPULATED_LEAVES_AFTER = 23;

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

function parseBatchSize(argv: string[]): number {
  const arg = argv.find((value) => value.startsWith("--batch-size="));
  if (!arg) return 10;
  const raw = arg.slice("--batch-size=".length).trim();
  if (!/^\d+$/.test(raw)) fail("--batch-size must be a whole number");
  const value = Number(raw);
  if (value < 1 || value > 50) fail("--batch-size must be between 1 and 50");
  return value;
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
  if (document.applied !== false) fail("mapping plan must declare applied=false");
  if (!Array.isArray(document.products)) fail("mapping plan has no products array");
  return document;
}

function pathOf(categoryId: string, byId: Map<string, CategoryRow>): string {
  const names: string[] = [];
  const seen = new Set<string>();
  let current = byId.get(categoryId);
  while (current) {
    if (seen.has(current.id)) throw new Error(`category cycle at ${current.slug}`);
    seen.add(current.id);
    names.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return names.join(" / ");
}

function reachabilityProblem(target: CategoryRow, byId: Map<string, CategoryRow>): string | null {
  const seen = new Set<string>();
  let current: CategoryRow | undefined = target;
  while (current) {
    if (seen.has(current.id)) return `category cycle at ${current.slug}`;
    seen.add(current.id);
    if (!current.isActive || current.deprecatedAt) {
      return `ancestor ${current.slug} is inactive or deprecated`;
    }
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return null;
}

function restrictionProblem(
  target: CategoryRow,
  byId: Map<string, CategoryRow>,
  rules: RuleRow[],
  countryCode: string
): string | null {
  const ruleMap = new Map(rules.map((rule) => [`${rule.categoryId}:${rule.countryCode.toUpperCase()}`, rule]));
  const seen = new Set<string>();
  let current: CategoryRow | undefined = target;
  const country = countryCode.trim().toUpperCase() || "NG";
  while (current) {
    if (seen.has(current.id)) return `category cycle at ${current.slug}`;
    seen.add(current.id);
    const rule = ruleMap.get(`${current.id}:${country}`);
    if (rule && !rule.canPublish) {
      return rule.note?.trim() || `${current.slug} is not publishable for ${country}`;
    }
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return null;
}

type Fingerprints = {
  activeProducts: number;
  images: string;
  stock: string;
  variants: string;
  cartItems: string;
  categories: string;
  productIdentity: string;
};

async function fingerprints(client: Client): Promise<Fingerprints> {
  const query = async (sql: string): Promise<string> => {
    const result = await client.query<{ value: string | null }>(sql);
    return result.rows[0]?.value ?? "";
  };
  const active = await client.query<{ count: number }>(
    `select count(*)::int as count from "Product" where status = 'ACTIVE'`
  );
  return {
    activeProducts: active.rows[0]?.count ?? 0,
    images: await query(
      `select md5(coalesce(string_agg(id || ':' || "productId" || ':' || url || ':' || "sortOrder", '|' order by id), '')) as value
         from "ProductImage"`
    ),
    stock: await query(
      `select md5(coalesce(string_agg(id || ':' || "productId" || ':' || quantity || ':' || reserved, '|' order by id), '')) as value
         from "InventoryStock"`
    ),
    variants: await query(
      `select md5(coalesce(string_agg(id || ':' || "productId" || ':' || stock || ':' || reserved || ':' || sku, '|' order by id), '')) as value
         from "ProductVariant"`
    ),
    cartItems: await query(
      `select md5(coalesce(string_agg(id || ':' || "productId" || ':' || coalesce("variantId", '') || ':' || quantity, '|' order by id), '')) as value
         from "CartItem"`
    ),
    categories: await query(
      `select md5(coalesce(string_agg(id || ':' || slug || ':' || "parentId" || ':' || level || ':' || "isActive" || ':' || "isSelectable", '|' order by id), '')) as value
         from "Category"`
    ),
    productIdentity: await query(
      `select md5(coalesce(string_agg(id || ':' || slug || ':' || name || ':' || status, '|' order by id), '')) as value
         from "Product"`
    )
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const jsonOutput = argv.includes("--json");
  const batchSize = parseBatchSize(argv);
  const expectedDb = parseExpectedDatabase(argv);
  const reviewUrl = resolveReviewUrl(expectedDb);
  validateTaxonomy();
  const plan = loadPlan();

  const client = new Client({
    connectionString: reviewUrl,
    connectionTimeoutMillis: 8000,
    application_name: apply ? "naijadeals-taxonomy-apply" : "naijadeals-taxonomy-apply-dry-run"
  });

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
       where table_schema = 'public' and table_name = 'Category'
         and column_name in ('key','parentId','level','isSelectable','showOnHomepage','deprecatedAt')`
    );
    if (columns.rowCount !== 6) fail("Category taxonomy columns are missing");
    const tables = await client.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public'
         and table_name in ('CategoryAlias','CategoryAttribute','CategoryCountryRule','CategoryRequest','AuditLog','SystemEvent')`
    );
    if (tables.rowCount !== 6) fail("taxonomy/audit tables are missing");

    const categoriesResult = await client.query<CategoryRow>(
      `select id, key, name, slug, "parentId", level, "isActive", "isSelectable", "deprecatedAt" from "Category"`
    );
    const byId = new Map(categoriesResult.rows.map((row) => [row.id, row]));
    const rulesResult = await client.query<RuleRow>(
      `select "categoryId", "countryCode", "canPublish", note from "CategoryCountryRule"`
    );
    const productsResult = await client.query<ProductRow>(
      `select id, name, slug, status, "categoryId", "countryCode" from "Product" where status = 'ACTIVE' order by id`
    );
    const activeProducts = productsResult.rows;
    const productsById = new Map(activeProducts.map((row) => [row.id, row]));
    const before = await fingerprints(client);

    const problems: string[] = [];
    const validated: ValidatedEntry[] = [];

    if (activeProducts.length !== EXPECTED_ACTIVE_PRODUCTS) {
      problems.push(`expected ${EXPECTED_ACTIVE_PRODUCTS} active products, found ${activeProducts.length}`);
    }
    if (plan.products.length !== EXPECTED_ACTIVE_PRODUCTS) {
      problems.push(`plan has ${plan.products.length} products, expected ${EXPECTED_ACTIVE_PRODUCTS}`);
    }
    const planById = new Map<string, PlanEntry>();
    for (const entry of plan.products) {
      if (planById.has(entry.productId)) problems.push(`duplicate plan entry ${entry.productId}`);
      planById.set(entry.productId, entry);
    }
    for (const product of activeProducts) {
      if (!planById.has(product.id)) problems.push(`active product ${product.id} has no plan entry`);
    }

    if (
      plan.summary?.total !== 49 ||
      plan.summary?.mapped !== 42 ||
      plan.summary?.ambiguous !== 7 ||
      plan.summary?.alreadyOnProposedLeaf !== 8 ||
      plan.summary?.proposedMoves !== 34
    ) {
      problems.push("plan summary counts do not match the reviewed 49/42/34/8/7 plan");
    }

    for (const entry of plan.products) {
      const product = productsById.get(entry.productId);
      if (!product) {
        problems.push(`${entry.productId}: plan product is not ACTIVE in the catalogue`);
        continue;
      }
      if (product.name !== entry.name) {
        problems.push(`${entry.productId}: plan name "${entry.name}" != catalogue "${product.name}"`);
      }
      const currentPath = pathOf(product.categoryId, byId);
      if (!currentPath) {
        problems.push(`${entry.productId}: current category ${product.categoryId} is missing`);
        continue;
      }

      if (entry.ambiguous || entry.action === "review") {
        if (!entry.ambiguous || entry.action !== "review" || entry.proposedLeaf !== null) {
          problems.push(`${entry.productId}: ambiguous entry must be action=review with no proposed leaf`);
        }
        if (currentPath !== entry.currentCategory.path) {
          problems.push(`${entry.productId}: ambiguous product has drifted from its reviewed category`);
        }
        validated.push({
          plan: entry,
          product,
          currentPath,
          target: null,
          afterPath: null,
          alreadyApplied: false,
          status: "ambiguous"
        });
        continue;
      }

      if (!entry.proposedLeaf) {
        problems.push(`${entry.productId}: non-ambiguous entry has no proposed leaf`);
        continue;
      }
      const definition = TAXONOMY_BY_KEY.get(entry.proposedLeaf.key);
      if (!definition || definition.level !== 2 || !definition.isSelectable) {
        problems.push(`${entry.productId}: proposed leaf ${entry.proposedLeaf.key} is not a selectable level-2 leaf in the taxonomy source`);
        continue;
      }
      const expectedTargetPath = entry.proposedLeaf.path;
      const targetRow = [...byId.values()].find(
        (row) => row.key === entry.proposedLeaf?.key && row.slug === entry.proposedLeaf?.slug
      );
      if (!targetRow) {
        problems.push(`${entry.productId}: target ${entry.proposedLeaf.key} is missing from the catalogue`);
        continue;
      }
      if (targetRow.level !== 2) problems.push(`${entry.productId}: target ${targetRow.slug} is not level 2`);
      if (!targetRow.isSelectable) problems.push(`${entry.productId}: target ${targetRow.slug} is not selectable`);
      if (!targetRow.isActive || targetRow.deprecatedAt) {
        problems.push(`${entry.productId}: target ${targetRow.slug} is inactive or deprecated`);
      }
      const reach = reachabilityProblem(targetRow, byId);
      if (reach) problems.push(`${entry.productId}: target ${targetRow.slug}: ${reach}`);
      const restriction = restrictionProblem(targetRow, byId, rulesResult.rows, product.countryCode || "NG");
      if (restriction) problems.push(`${entry.productId}: target ${targetRow.slug} is restricted: ${restriction}`);
      const targetPath = pathOf(targetRow.id, byId);
      if (targetPath !== expectedTargetPath) {
        problems.push(`${entry.productId}: target path "${targetPath}" != plan path "${expectedTargetPath}"`);
      }

      const alreadyApplied = product.categoryId === targetRow.id;
      if (entry.action === "keep") {
        if (!alreadyApplied) {
          problems.push(`${entry.productId}: action=keep but the product is not on ${targetRow.slug}`);
        }
        validated.push({
          plan: entry,
          product,
          currentPath,
          target: targetRow,
          afterPath: targetPath,
          alreadyApplied,
          status: alreadyApplied ? "already" : "keep"
        });
        continue;
      }

      if (!alreadyApplied && currentPath !== entry.currentCategory.path) {
        problems.push(`${entry.productId}: current path "${currentPath}" != reviewed path "${entry.currentCategory.path}"`);
        continue;
      }
      validated.push({
        plan: entry,
        product,
        currentPath,
        target: targetRow,
        afterPath: targetPath,
        alreadyApplied,
        status: alreadyApplied ? "already" : "move"
      });
    }

    const actionable = validated
      .filter((entry) => entry.status === "move" && entry.target)
      .sort((left, right) => left.product.id.localeCompare(right.product.id));
    const ambiguousEntries = validated.filter((entry) => entry.status === "ambiguous");
    const alreadyEntries = validated.filter((entry) => entry.status === "already");

    if (problems.length > 0) {
      for (const problem of problems) console.error(`PROBLEM: ${problem}`);
      fail("plan validation failed; no product was moved");
    }

    const applied: Array<{ productId: string; name: string; beforePath: string; afterPath: string; batch: number }> = [];
    const batches: string[][] = [];
    for (let offset = 0; offset < actionable.length; offset += batchSize) {
      batches.push(actionable.slice(offset, offset + batchSize).map((entry) => entry.product.id));
    }

    if (apply) {
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
        const ids = batches[batchIndex];
        const entries = ids.map((id) => actionable.find((entry) => entry.product.id === id) as ValidatedEntry);
        await client.query("BEGIN");
        try {
          for (const entry of entries) {
            const locked = await client.query<{
              id: string;
              name: string;
              status: string;
              categoryId: string;
            }>('select id, name, status, "categoryId" from "Product" where id = $1 for update', [entry.product.id]);
            const row = locked.rows[0];
            if (!row || locked.rowCount !== 1) throw new Error(`${entry.product.id}: product disappeared`);
            if (row.status !== "ACTIVE") throw new Error(`${entry.product.id}: product is no longer ACTIVE`);
            if (row.categoryId === entry.target?.id) continue; // idempotent concurrent apply
            if (row.categoryId !== entry.product.categoryId) {
              throw new Error(`${entry.product.id}: category changed before apply`);
            }
            if (!entry.target) throw new Error(`${entry.product.id}: missing validated target`);

            await client.query(
              'update "Product" set "categoryId" = $1, "updatedAt" = now() where id = $2',
              [entry.target.id, entry.product.id]
            );

            const auditId = randomUUID();
            const metadata = {
              source: "taxonomy-apply-mapping",
              plan: "docs/taxonomy/product-leaf-mapping.json",
              batch: batchIndex + 1,
              batchSize: entries.length,
              productName: entry.product.name,
              beforeCategoryId: entry.product.categoryId,
              beforePath: entry.currentPath,
              afterCategoryId: entry.target.id,
              afterPath: entry.afterPath,
              proposedLeafKey: entry.plan.proposedLeaf?.key ?? null,
              confidence: entry.plan.confidence,
              reason: entry.plan.reason
            };
            await client.query(
              `insert into "AuditLog" (id, "actorId", action, entity, "entityId", metadata, "createdAt")
               values ($1, null, $2, 'Product', $3, $4::jsonb, now())`,
              [auditId, "taxonomy.product.reclassified", entry.product.id, JSON.stringify(metadata)]
            );
            await client.query(
              `insert into "SystemEvent" (id, "actorId", type, entity, "entityId", payload, "createdAt")
               values ($1, null, $2, 'Product', $3, $4::jsonb, now())`,
              [randomUUID(), "taxonomy.product.reclassified", entry.product.id, JSON.stringify(metadata)]
            );

            applied.push({
              productId: entry.product.id,
              name: entry.product.name,
              beforePath: entry.currentPath,
              afterPath: entry.afterPath ?? "",
              batch: batchIndex + 1
            });
          }
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK").catch(() => undefined);
          throw error;
        }
      }
    }

    // ---- After state -------------------------------------------------------
    const afterResult = await client.query<ProductRow>(
      `select id, name, slug, status, "categoryId", "countryCode" from "Product" where status = 'ACTIVE' order by id`
    );
    const afterById = new Map(afterResult.rows.map((row) => [row.id, row]));
    const after = await fingerprints(client);

    const verification: string[] = [];
    if (after.activeProducts !== EXPECTED_ACTIVE_PRODUCTS) {
      verification.push(`active products ${after.activeProducts} != ${EXPECTED_ACTIVE_PRODUCTS}`);
    }
    const crf = await client.query<{ count: number }>(
      `select count(*)::int as count from "Category" where name like 'CRF%' or slug like 'crf-%'`
    );
    if ((crf.rows[0]?.count ?? 0) !== 0) verification.push(`CRF category names present: ${crf.rows[0]?.count}`);
    const crfProductCategory = await client.query<{ count: number }>(
      `select count(*)::int as count
         from "Product" p join "Category" c on c.id = p."categoryId"
        where p.status = 'ACTIVE' and (c.name like 'CRF%' or c.slug like 'crf-%')`
    );
    if ((crfProductCategory.rows[0]?.count ?? 0) !== 0) {
      verification.push(`active products in CRF categories: ${crfProductCategory.rows[0]?.count}`);
    }
    if (before.images !== after.images) verification.push("ProductImage rows changed");
    if (before.stock !== after.stock) verification.push("InventoryStock rows changed");
    if (before.variants !== after.variants) verification.push("ProductVariant rows changed");
    if (before.cartItems !== after.cartItems) verification.push("CartItem rows changed");
    if (before.categories !== after.categories) verification.push("Category rows changed");
    if (before.productIdentity !== after.productIdentity) verification.push("Product identity (id/slug/name/status) changed");

    const perProduct = plan.products.map((entry) => {
      const beforeRow = productsById.get(entry.productId);
      const afterRow = afterById.get(entry.productId);
      if (!afterRow) return { productId: entry.productId, name: entry.name, status: "MISSING", beforePath: "", afterPath: "" };
      const currentPath = pathOf(afterRow.categoryId, byId);
      let status = entry.ambiguous ? "ambiguous-retained" : entry.action === "keep" ? "kept" : "planned-move";
      if (!entry.ambiguous && entry.proposedLeaf) {
        const target = [...byId.values()].find(
          (row) => row.key === entry.proposedLeaf?.key && row.slug === entry.proposedLeaf?.slug
        );
        if (target && afterRow.categoryId === target.id) {
          status = entry.action === "keep" ? "kept" : applied.some((row) => row.productId === entry.productId) ? "moved" : "already-applied";
        } else if (apply) {
          status = "NOT-ON-TARGET";
          verification.push(`${entry.productId}: not on proposed leaf after apply`);
        }
      }
      if (entry.ambiguous) {
        if (beforeRow?.categoryId !== afterRow.categoryId) {
          verification.push(`${entry.productId}: ambiguous product moved`);
        }
      }
      return {
        productId: entry.productId,
        name: entry.name,
        status,
        beforePath: beforeRow ? pathOf(beforeRow.categoryId, byId) : "",
        // In a dry run the "after" column is the reviewed projection; after an
        // apply it is the category actually stored in the catalogue.
        afterPath: !apply && entry.proposedLeaf ? entry.proposedLeaf.path : currentPath,
        proposedLeaf: entry.proposedLeaf?.path ?? null,
        batch: applied.find((row) => row.productId === entry.productId)?.batch ?? null
      };
    });

    const populatedLeaves = await client.query<{ count: number }>(
      `select count(distinct p."categoryId")::int as count
         from "Product" p join "Category" c on c.id = p."categoryId"
        where p.status = 'ACTIVE' and c.level = 2 and c."isSelectable" and c."isActive" and c."deprecatedAt" is null`
    );
    if (apply && (populatedLeaves.rows[0]?.count ?? 0) !== EXPECTED_POPULATED_LEAVES_AFTER) {
      verification.push(
        `populated selectable leaves ${populatedLeaves.rows[0]?.count} != ${EXPECTED_POPULATED_LEAVES_AFTER}`
      );
    }

    const auditCount = apply
      ? await client.query<{ count: number }>(
          `select count(*)::int as count from "AuditLog" where action = 'taxonomy.product.reclassified'`
        )
      : { rows: [{ count: 0 }] };

    const result = {
      database: actualDb,
      classification: "REVIEW",
      mode: apply ? "apply" : "dry-run",
      batchSize,
      plan: {
        total: plan.products.length,
        moveTargets: plan.products.filter((entry) => entry.action === "map").length,
        toMoveNow: actionable.length,
        movedThisRun: applied.length,
        alreadyOnTargetAtStart: alreadyEntries.length,
        kept: plan.products.filter((entry) => entry.action === "keep").length,
        ambiguousSkipped: ambiguousEntries.length
      },
      batches: batches.length,
      applied,
      auditRowsForAction: auditCount.rows[0]?.count ?? 0,
      fingerprints: {
        activeProducts: { before: before.activeProducts, after: after.activeProducts },
        images: { before: before.images, after: after.images, unchanged: before.images === after.images },
        stock: { before: before.stock, after: after.stock, unchanged: before.stock === after.stock },
        variants: { before: before.variants, after: after.variants, unchanged: before.variants === after.variants },
        cartItems: { before: before.cartItems, after: after.cartItems, unchanged: before.cartItems === after.cartItems },
        categories: { unchanged: before.categories === after.categories }
      },
      populatedSelectableLeaves: populatedLeaves.rows[0]?.count ?? 0,
      ambiguousProducts: ambiguousEntries.map((entry) => ({
        productId: entry.product.id,
        name: entry.product.name,
        currentPath: entry.currentPath,
        reason: entry.plan.reason
      })),
      perProduct,
      verification,
      result: verification.length === 0 ? "PASS" : "FAIL"
    };

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(
        `REVIEW product-leaf mapping — ${actualDb} (REVIEW) — ${apply ? "APPLY" : "DRY RUN (no writes)"}`
      );
      console.log(
        `Plan: ${result.plan.total} active products; ${result.plan.moveTargets} reviewed moves, ${result.plan.toMoveNow} to move now, ` +
          `${result.plan.movedThisRun} moved this run, ${result.plan.alreadyOnTargetAtStart} already on target, ` +
          `${result.plan.kept} keep, ${result.plan.ambiguousSkipped} ambiguous skipped`
      );
      console.log(`Batches: ${result.batches} (size ${batchSize})`);
      console.log("");
      for (const row of perProduct) {
        const after = row.afterPath || "(missing)";
        console.log(
          `${row.status.padEnd(17)} ${row.productId} | ${row.beforePath || "(unknown)"} -> ${after} | ${row.name}`
        );
      }
      console.log("");
      console.log(
        `Active products: ${result.fingerprints.activeProducts.after}; images unchanged: ${result.fingerprints.images.unchanged}; ` +
          `stock unchanged: ${result.fingerprints.stock.unchanged}; variants unchanged: ${result.fingerprints.variants.unchanged}; ` +
          `cart items unchanged: ${result.fingerprints.cartItems.unchanged}; categories unchanged: ${result.fingerprints.categories.unchanged}`
      );
      console.log(`Populated selectable leaves: ${result.populatedSelectableLeaves}`);
      console.log(`Ambiguous products retained: ${result.ambiguousProducts.length}`);
      for (const entry of result.ambiguousProducts) {
        console.log(`  ${entry.productId} | ${entry.currentPath} | ${entry.reason}`);
      }
      if (apply) console.log(`Audit rows (taxonomy.product.reclassified): ${result.auditRowsForAction}`);
      if (verification.length > 0) {
        for (const problem of verification) console.error(`PROBLEM: ${problem}`);
        console.error("Result: FAIL");
      } else {
        console.log(apply ? "Result: PASS — mappings applied and verified." : "Result: PASS — dry run only; no writes were made.");
      }
    }

    if (verification.length > 0) process.exitCode = 1;
  } catch (error) {
    fail(sanitize(error instanceof Error ? error.message : String(error)));
  } finally {
    await client.end().catch(() => undefined);
  }
}

void main().catch((error) => {
  console.error(`FAIL: ${sanitize(error instanceof Error ? error.message : String(error))}`);
  process.exit(2);
});
