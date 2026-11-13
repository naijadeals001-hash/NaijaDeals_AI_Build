#!/usr/bin/env node
/**
 * READ-ONLY product -> leaf mapping plan for the REVIEW catalogue.
 *
 * Loads docs/taxonomy/product-leaf-mapping.json, validates every entry against
 * the live REVIEW catalogue and the taxonomy source, and reports coverage.
 * Ambiguous products keep their current assignment and are reported for
 * classification review.
 *
 * No Product.categoryId is written:
 *  - the transaction is opened READ ONLY;
 *  - the script contains no INSERT, UPDATE or DELETE;
 *  - a categoryId fingerprint is compared before and after the checks.
 *
 * Usage:
 *   REVIEW_DATABASE_URL=postgresql://... \
 *     npx tsx scripts/taxonomy-product-mapping.ts --expect-db=naijadeals_review
 *
 *   Add --json for a machine-readable summary.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import {
  TAXONOMY_BY_KEY,
  TAXONOMY_NODES,
  getTaxonomyPath,
  validateTaxonomy
} from "../lib/data/taxonomy";

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
  summary?: { total?: number; mapped?: number; ambiguous?: number };
  products: PlanEntry[];
};

/** Known taxonomy gaps behind the ambiguous products. */
const COVERAGE_GAPS = [
  {
    key: "personal-audio",
    description: "No headphone / personal-audio leaf; TVs & Home Audio covers speakers and home theatre only.",
    candidateParentKey: "electronics-appliances"
  },
  {
    key: "fragrance",
    description: "No perfume / fragrance leaf under Beauty & Personal Care.",
    candidateParentKey: "beauty-personal-care"
  },
  {
    key: "cameras",
    description: "No camera or photography leaf; Electronics & Appliances does not cover interchangeable-lens cameras.",
    candidateParentKey: "electronics-appliances"
  },
  {
    key: "wearables",
    description: "No smartwatch / wearable leaf; Smartphones explicitly excludes smartwatches.",
    candidateParentKey: "phones-tablets"
  },
  {
    key: "portable-power-station",
    description: "Portable power stations have no unambiguous leaf between Inverters & Batteries and Generators & Backup Power.",
    candidateParentKey: "power-solar"
  },
  {
    key: "two-leaf-overlap",
    description: "Product fits two existing leaves (Computer Accessories vs Gaming Accessories) and needs a primary-use decision.",
    candidateParentKey: null
  }
] as const;

type CategoryRow = {
  id: string;
  key: string | null;
  name: string;
  slug: string;
  parentId: string | null;
};

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

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const jsonOutput = argv.includes("--json");
  const expectedDb = parseExpectedDatabase(argv);
  const reviewUrl = resolveReviewUrl(expectedDb);
  validateTaxonomy();
  const plan = loadPlan();

  const client = new Client({
    connectionString: reviewUrl,
    connectionTimeoutMillis: 8000,
    application_name: "naijadeals-taxonomy-product-mapping"
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
      'select id, key, name, slug, "parentId" from "Category"'
    );
    const byId = new Map(categories.rows.map((row) => [row.id, row]));
    const products = await client.query<{
      id: string;
      name: string;
      categoryId: string;
      status: string;
    }>('select id, name, "categoryId", status from "Product" where status = \'ACTIVE\' order by "createdAt", id');

    const fingerprint = async (): Promise<string> => {
      const rows = await client.query<{ id: string; category_id: string }>(
        'select id, "categoryId" as category_id from "Product" order by id'
      );
      return rows.rows.map((row) => `${row.id}:${row.category_id}`).join("|");
    };
    const fingerprintBefore = await fingerprint();

    const problems: string[] = [];
    if (products.rowCount !== plan.products.length) {
      problems.push(
        `plan has ${plan.products.length} products; REVIEW has ${products.rowCount} active products`
      );
    }
    const planById = new Map<string, PlanEntry>();
    for (const entry of plan.products) {
      if (planById.has(entry.productId)) problems.push(`duplicate plan entry ${entry.productId}`);
      planById.set(entry.productId, entry);
    }

    const rows = products.rows.map((product) => {
      const chain = pathOf(byId.get(product.categoryId), byId);
      const current = chain[chain.length - 1];
      const entry = planById.get(product.id);
      if (!entry) {
        problems.push(`active product ${product.id} has no plan entry`);
        return null;
      }
      if (entry.name !== product.name) {
        problems.push(`${product.id}: plan name "${entry.name}" != catalogue "${product.name}"`);
      }
      if (entry.currentCategory.slug !== current?.slug) {
        problems.push(
          `${product.id}: plan current category ${entry.currentCategory.slug} != catalogue ${current?.slug}`
        );
      }
      const path = chain.map((node) => node.name).join(" / ");
      if (entry.currentCategory.path !== path) {
        problems.push(`${product.id}: plan current path is out of date`);
      }
      if (entry.ambiguous) {
        if (entry.action !== "review") problems.push(`${product.id}: ambiguous entry must use action=review`);
        if (entry.proposedLeaf !== null) problems.push(`${product.id}: ambiguous entry must not propose a leaf`);
      } else {
        if (entry.action === "review") problems.push(`${product.id}: non-ambiguous entry must map or keep`);
        const leaf = entry.proposedLeaf ? TAXONOMY_BY_KEY.get(entry.proposedLeaf.key) : undefined;
        if (!leaf || leaf.level !== 2 || !leaf.isSelectable) {
          problems.push(`${product.id}: proposed leaf is missing or not a selectable level-2 leaf`);
        } else {
          const expectedPath = getTaxonomyPath(leaf.key)
            .map((node) => node.name)
            .join(" / ");
          if (entry.proposedLeaf?.path !== expectedPath) {
            problems.push(`${product.id}: proposed leaf path is out of date`);
          }
          if (entry.action === "keep" && leaf.slug !== current?.slug) {
            problems.push(`${product.id}: action=keep but the leaf differs from the current category`);
          }
          if (entry.action === "map" && leaf.slug === current?.slug) {
            problems.push(`${product.id}: action=map but the product is already on that leaf`);
          }
        }
      }
      return {
        productId: product.id,
        name: product.name,
        currentPath: path,
        currentSlug: current?.slug ?? null,
        proposedLeafKey: entry.proposedLeaf?.key ?? null,
        proposedLeafPath: entry.proposedLeaf?.path ?? null,
        action: entry.action,
        confidence: entry.confidence,
        ambiguous: entry.ambiguous,
        reason: entry.reason
      };
    });

    for (const id of planById.keys()) {
      if (!products.rows.some((product) => product.id === id)) {
        problems.push(`plan entry ${id} is not an active product`);
      }
    }

    const selectableLeaves = TAXONOMY_NODES.filter(
      (entry) => entry.level === 2 && entry.isSelectable
    );
    const currentCountByLeaf = new Map<string, number>();
    for (const product of products.rows) {
      const current = byId.get(product.categoryId);
      if (!current) continue;
      currentCountByLeaf.set(current.slug, (currentCountByLeaf.get(current.slug) ?? 0) + 1);
    }
    const proposedCountByLeaf = new Map<string, number>();
    for (const entry of plan.products) {
      if (entry.ambiguous || !entry.proposedLeaf) continue;
      proposedCountByLeaf.set(
        entry.proposedLeaf.key,
        (proposedCountByLeaf.get(entry.proposedLeaf.key) ?? 0) + 1
      );
    }
    const leafCoverage = selectableLeaves
      .map((leaf) => ({
        leafKey: leaf.key,
        leafPath: getTaxonomyPath(leaf.key).map((node) => node.name).join(" / "),
        currentActive: currentCountByLeaf.get(leaf.slug) ?? 0,
        proposedActive: proposedCountByLeaf.get(leaf.key) ?? 0
      }))
      .filter((row) => row.currentActive > 0 || row.proposedActive > 0)
      .sort((a, b) => b.proposedActive - a.proposedActive || a.leafPath.localeCompare(b.leafPath));

    const fingerprintAfter = await fingerprint();
    if (fingerprintBefore !== fingerprintAfter) {
      problems.push("Product.categoryId fingerprint changed during a read-only run");
    }

    await client.query("ROLLBACK");
    inTransaction = false;

    const summary = {
      database: actualDb,
      classification: "REVIEW",
      readOnly: true,
      transactionReadOnly: readOnly.rows[0]?.transaction_read_only,
      writesAttempted: 0,
      productCategoryIdWrites: 0,
      categoryIdFingerprintStable: fingerprintBefore === fingerprintAfter,
      plan: {
        total: plan.products.length,
        mapped: plan.products.filter((entry) => entry.action === "map").length,
        keep: plan.products.filter((entry) => entry.action === "keep").length,
        review: plan.products.filter((entry) => entry.action === "review").length,
        ambiguous: plan.products.filter((entry) => entry.ambiguous).length
      },
      taxonomy: {
        selectableLeaves: selectableLeaves.length,
        leavesWithCurrentProducts: leafCoverage.filter((row) => row.currentActive > 0).length,
        leavesWithProposedProducts: leafCoverage.filter((row) => row.proposedActive > 0).length
      },
      coverageGaps: [...COVERAGE_GAPS],
      ambiguousProducts: plan.products
        .filter((entry) => entry.ambiguous)
        .map((entry) => ({
          productId: entry.productId,
          name: entry.name,
          currentCategory: entry.currentCategory.slug,
          confidence: entry.confidence,
          reason: entry.reason
        })),
      leafCoverage,
      rows: rows.filter((row): row is NonNullable<typeof row> => row !== null),
      result: problems.length === 0 ? "PASS" : "FAIL",
      problems
    };

    if (jsonOutput) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log(`REVIEW product -> leaf mapping plan — ${actualDb} (classification REVIEW)`);
      console.log(
        `Read-only: ${summary.transactionReadOnly}; writes attempted: 0; Product.categoryId writes: 0; ` +
          `fingerprint stable: ${summary.categoryIdFingerprintStable}`
      );
      console.log(
        `Plan: ${summary.plan.total} active products; ${summary.plan.mapped} map, ${summary.plan.keep} keep, ` +
          `${summary.plan.review} review (${summary.plan.ambiguous} ambiguous)`
      );
      console.log(
        `Leaves: ${summary.taxonomy.selectableLeaves} selectable; ${summary.taxonomy.leavesWithCurrentProducts} currently populated; ` +
          `${summary.taxonomy.leavesWithProposedProducts} after the proposed mapping`
      );
      console.log("");
      console.log("Leaf coverage (current active -> proposed active):");
      for (const row of leafCoverage) {
        console.log(`  ${String(row.currentActive).padStart(2)} -> ${String(row.proposedActive).padStart(2)}  ${row.leafPath}`);
      }
      console.log("");
      console.log("Ambiguous products retained on their current assignment:");
      for (const entry of summary.ambiguousProducts) {
        console.log(
          `  ${entry.productId} | ${entry.currentCategory} | ${entry.confidence} | ${entry.name}\n    ${entry.reason}`
        );
      }
      console.log("");
      for (const row of summary.rows) {
        console.log(
          `${row.action.padEnd(6)} ${row.confidence.padEnd(6)} ${row.productId} | ` +
            `${row.currentPath}${row.proposedLeafPath ? ` -> ${row.proposedLeafPath}` : " -> (retained)"} | ${row.name}`
        );
      }
      console.log("");
      if (problems.length > 0) {
        for (const problem of problems) console.error(`PROBLEM: ${problem}`);
        console.error("Result: FAIL");
      } else {
        console.log("Result: PASS — plan is complete and consistent; nothing was applied.");
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
