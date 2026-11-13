#!/usr/bin/env node
/**
 * READ-ONLY taxonomy mapping dry run.
 *
 * Verifies the target is the explicitly named REVIEW database, validates the
 * proposal, and reports product mapping before/after the proposed reparenting.
 * It never writes: no categories, aliases, attributes, rules or products.
 *
 * Usage:
 *   REVIEW_DATABASE_URL=postgresql://... \
 *     npx tsx scripts/taxonomy-mapping-dry-run.ts --expect-db=naijadeals_review
 *
 *   Add --json for a machine-readable summary.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import {
  EXISTING_CATEGORY_KEYS,
  RESTRICTED_CATEGORY_KEYS,
  TAXONOMY_NODES,
  getTaxonomyPath,
  validateTaxonomy
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
  isDemo: boolean;
  products: number;
  activeProducts: number;
};

type ProposalDocument = {
  meta?: {
    totalNodes?: number;
    departments?: number;
    categories?: number;
    subcategories?: number;
    existingCategoryKeys?: string[];
    restrictedCategoryKeys?: string[];
  };
  nodes?: Array<{
    key: string;
    parentKey: string | null;
    name: string;
    slug: string;
    level: number;
    isSelectable: boolean;
    showOnHomepage: boolean;
    sortOrder: number;
    aliases?: unknown[];
    attributes?: Array<{ key: string }>;
    countryRules?: unknown[];
  }>;
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
  if (!url) {
    fail("REVIEW_DATABASE_URL is required; DATABASE_URL is never used as a fallback");
  }
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

function assertProposalDocument(): void {
  const path = resolve(process.cwd(), "docs/taxonomy/proposal.json");
  let document: ProposalDocument;
  try {
    document = JSON.parse(readFileSync(path, "utf8")) as ProposalDocument;
  } catch (error) {
    fail(`cannot read docs/taxonomy/proposal.json: ${sanitize(String(error))}`);
  }
  const nodes = document.nodes;
  if (!Array.isArray(nodes)) fail("proposal.json has no nodes array");
  if (nodes.length !== TAXONOMY_NODES.length) {
    fail(`proposal.json has ${nodes.length} nodes; source has ${TAXONOMY_NODES.length}. Regenerate it from lib/data/taxonomy.ts.`);
  }
  for (let index = 0; index < TAXONOMY_NODES.length; index += 1) {
    const source = TAXONOMY_NODES[index];
    const documented = nodes[index];
    if (!documented || documented.key !== source.key) {
      fail(`proposal.json node ${index} is ${documented?.key ?? "missing"}; expected ${source.key}`);
    }
    const fields: Array<keyof typeof source> = [
      "parentKey",
      "name",
      "slug",
      "level",
      "isSelectable",
      "showOnHomepage",
      "sortOrder"
    ];
    for (const field of fields) {
      if (documented[field as keyof typeof documented] !== source[field]) {
        fail(`proposal.json ${source.key}.${String(field)} is out of date`);
      }
    }
    if ((documented.aliases?.length ?? 0) !== source.aliases.length) {
      fail(`proposal.json ${source.key}.aliases is out of date`);
    }
    const documentedAttributeKeys = (documented.attributes ?? []).map((entry) => entry.key).join(",");
    const sourceAttributeKeys = source.attributes.map((entry) => entry.key).join(",");
    if (documentedAttributeKeys !== sourceAttributeKeys) {
      fail(`proposal.json ${source.key}.attributes is out of date`);
    }
    if ((documented.countryRules?.length ?? 0) !== source.countryRules.length) {
      fail(`proposal.json ${source.key}.countryRules is out of date`);
    }
  }
  const levelCounts = {
    departments: TAXONOMY_NODES.filter((entry) => entry.level === 0).length,
    categories: TAXONOMY_NODES.filter((entry) => entry.level === 1).length,
    subcategories: TAXONOMY_NODES.filter((entry) => entry.level === 2).length
  };
  if (
    document.meta?.totalNodes !== TAXONOMY_NODES.length ||
    document.meta?.departments !== levelCounts.departments ||
    document.meta?.categories !== levelCounts.categories ||
    document.meta?.subcategories !== levelCounts.subcategories
  ) {
    fail("proposal.json meta counts are out of date");
  }
  if ((document.meta?.existingCategoryKeys ?? []).join(",") !== EXISTING_CATEGORY_KEYS.join(",")) {
    fail("proposal.json meta.existingCategoryKeys is out of date");
  }
  if ((document.meta?.restrictedCategoryKeys ?? []).join(",") !== RESTRICTED_CATEGORY_KEYS.join(",")) {
    fail("proposal.json meta.restrictedCategoryKeys is out of date");
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const jsonOutput = argv.includes("--json");
  const expectedDb = parseExpectedDatabase(argv);
  const reviewUrl = resolveReviewUrl(expectedDb);
  validateTaxonomy();

  const client = new Client({
    connectionString: reviewUrl,
    connectionTimeoutMillis: 8000,
    application_name: "naijadeals-taxonomy-dry-run"
  });

  try {
    await client.connect();

    const identity = await client.query<{ database: string }>(
      "select current_database() as database"
    );
    const actualDb = identity.rows[0]?.database ?? "";
    if (actualDb !== expectedDb) {
      fail(`connected to ${actualDb || "(unknown)"} instead of ${expectedDb}`);
    }

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
    if (columns.rowCount !== 6) {
      fail("Category taxonomy columns are missing; run the marketplace taxonomy migration first");
    }
    const taxonomyTables = await client.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public'
         and table_name in ('CategoryAlias','CategoryAttribute','CategoryCountryRule','CategoryRequest')`
    );
    if (taxonomyTables.rowCount !== 4) {
      fail("taxonomy tables are missing; run the marketplace taxonomy migration first");
    }

    assertProposalDocument();

    const categories = await client.query<CategoryRow>(
      `select c.id, c.key, c.name, c.slug, c."parentId", c.level,
              c."isActive", c."isSelectable", c."isDemo",
              count(p.id)::int as products,
              count(p.id) filter (where p.status = 'ACTIVE')::int as "activeProducts"
         from "Category" c
         left join "Product" p on p."categoryId" = c.id
        group by c.id
        order by c.level, c."sortOrder", c.name`
    );

    const totalProducts = await client.query<{ total: number; active: number }>(
      `select count(*)::int as total,
              count(*) filter (where status = 'ACTIVE')::int as active
         from "Product"`
    );
    const categoryRequests = await client.query<{ total: number }>(
      'select count(*)::int as total from "CategoryRequest"'
    );

    const byId = new Map(categories.rows.map((row) => [row.id, row]));
    const currentPath = (id: string): string => {
      const names: string[] = [];
      let cursor: CategoryRow | undefined = byId.get(id);
      const seen = new Set<string>();
      while (cursor) {
        if (seen.has(cursor.id)) return `${names.join(" / ")} / [cycle]`;
        seen.add(cursor.id);
        names.unshift(cursor.name);
        cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
      }
      return names.join(" / ");
    };

    const proposalBySlug = new Map(TAXONOMY_NODES.map((entry) => [entry.slug, entry]));
    const proposalByKey = new Map(TAXONOMY_NODES.map((entry) => [entry.key, entry]));
    const isProposalCategory = (row: CategoryRow): boolean =>
      Boolean((row.key && proposalByKey.has(row.key)) || proposalBySlug.has(row.slug));
    const existingCategories = categories.rows.filter((row) =>
      (EXISTING_CATEGORY_KEYS as readonly string[]).includes(row.slug)
    );
    const proposalRows = categories.rows.filter(isProposalCategory);

    const beforeRows = categories.rows
      .filter((row) => row.products > 0)
      .map((row) => ({
        id: row.id,
        key: row.key,
        slug: row.slug,
        beforePath: currentPath(row.id),
        afterPath: (() => {
          const proposed = proposalBySlug.get(row.slug);
          return proposed
            ? getTaxonomyPath(proposed.key).map((entry) => entry.name).join(" / ")
            : null;
        })(),
        products: row.products,
        activeProducts: row.activeProducts
      }));

    const unmappedActive = categories.rows
      .filter((row) => row.activeProducts > 0 && !proposalBySlug.has(row.slug))
      .map((row) => ({ path: currentPath(row.id), activeProducts: row.activeProducts }));

    const newLeaves = TAXONOMY_NODES.filter(
      (entry) => !entry.isExisting && entry.level === 2
    );
    const newLeavesWithProducts = proposalRows
      .filter((row) => row.key && !proposalByKey.get(row.key)?.isExisting && row.products > 0)
      .map((row) => ({ key: row.key, name: row.name, products: row.products }));

    const existingActiveProducts = existingCategories.reduce(
      (sum, row) => sum + row.activeProducts,
      0
    );
    const proposalProducts = proposalRows.reduce((sum, row) => sum + row.products, 0);
    const proposalActiveProducts = proposalRows.reduce(
      (sum, row) => sum + row.activeProducts,
      0
    );
    const outsideProducts = categories.rows
      .filter((row) => !isProposalCategory(row))
      .reduce((sum, row) => sum + row.products, 0);
    const outsideActiveProducts = categories.rows
      .filter((row) => !isProposalCategory(row))
      .reduce((sum, row) => sum + row.activeProducts, 0);

    const problems: string[] = [];
    if (existingCategories.length !== EXISTING_CATEGORY_KEYS.length) {
      problems.push(
        `expected ${EXISTING_CATEGORY_KEYS.length} existing active categories, found ${existingCategories.length}`
      );
    }
    if (existingActiveProducts !== 41) {
      problems.push(`expected 41 active products on existing categories, found ${existingActiveProducts}`);
    }
    if (unmappedActive.length > 0) {
      problems.push(
        `${unmappedActive.length} active category path(s) are outside the proposal: ${unmappedActive
          .map((entry) => entry.path)
          .join("; ")}`
      );
    }
    if (newLeavesWithProducts.length > 0) {
      problems.push(
        `new leaves already contain products: ${newLeavesWithProducts
          .map((entry) => `${entry.key}=${entry.products}`)
          .join(", ")}`
      );
    }

    const summary = {
      database: actualDb,
      classification: "REVIEW",
      readOnly: true,
      proposal: {
        totalNodes: TAXONOMY_NODES.length,
        departments: TAXONOMY_NODES.filter((entry) => entry.level === 0).length,
        categories: TAXONOMY_NODES.filter((entry) => entry.level === 1).length,
        subcategories: TAXONOMY_NODES.filter((entry) => entry.level === 2).length,
        existingCategoryKeys: [...EXISTING_CATEGORY_KEYS],
        restrictedCategoryKeys: [...RESTRICTED_CATEGORY_KEYS],
        selectableZeroInventoryLeaves: newLeaves.map((entry) => entry.key)
      },
      catalogue: {
        totalProducts: totalProducts.rows[0]?.total ?? 0,
        activeProducts: totalProducts.rows[0]?.active ?? 0,
        existingCategoriesFound: existingCategories.length,
        existingActiveProducts,
        proposalNodesPresentInDatabase: proposalRows.length,
        productsOnExistingCategories: proposalProducts,
        activeProductsOnExistingCategories: proposalActiveProducts,
        productsOutsideProposalTree: outsideProducts,
        activeProductsOutsideProposalTree: outsideActiveProducts,
        categoryRequests: categoryRequests.rows[0]?.total ?? 0,
        unmappedActive,
        newLeavesWithProducts
      },
      mapping: {
        projectedProductCategoryIdChanges: 0,
        reason: "The seed updates Category parent/level/key only; it never writes Product.categoryId.",
        rows: beforeRows
      },
      result: problems.length === 0 ? "PASS" : "FAIL",
      problems
    };

    if (jsonOutput) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log(`REVIEW taxonomy mapping dry run — ${actualDb}`);
      console.log(
        `Proposal: ${summary.proposal.totalNodes} nodes (${summary.proposal.departments} departments, ${summary.proposal.categories} categories, ${summary.proposal.subcategories} subcategories)`
      );
      console.log(
        `Catalogue: ${summary.catalogue.totalProducts} products (${summary.catalogue.activeProducts} active); existing categories ${summary.catalogue.existingCategoriesFound}/9; active on existing categories ${summary.catalogue.existingActiveProducts}`
      );
      console.log(
        `Proposal nodes already present: ${summary.catalogue.proposalNodesPresentInDatabase}/${summary.proposal.totalNodes}`
      );
      console.log("");
      console.log("Product mapping (before -> after; counts unchanged):");
      const table = beforeRows
        .map((row) => ({
          "before path": row.beforePath,
          "after path": row.afterPath ?? "[outside proposal]",
          products: row.products,
          active: row.activeProducts
        }));
      console.table(table);
      console.log(
        `Products outside the proposed active tree (inactive/demo categories): ${outsideProducts} total / ${outsideActiveProducts} active`
      );
      console.log(
        `Projected Product.categoryId changes: ${summary.mapping.projectedProductCategoryIdChanges}`
      );
      console.log(
        `New zero-inventory selectable leaves: ${newLeaves.length} (products found: ${newLeavesWithProducts.length})`
      );
      console.log(`Restricted leaves: ${RESTRICTED_CATEGORY_KEYS.join(", ")}`);
      console.log(`Category requests: ${summary.catalogue.categoryRequests}`);
      console.log("");
      if (problems.length > 0) {
        for (const problem of problems) console.error(`PROBLEM: ${problem}`);
        console.error("Result: FAIL");
      } else {
        console.log("Result: PASS — dry run only; no database writes were made.");
      }
    }

    if (problems.length > 0) process.exitCode = 1;
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
