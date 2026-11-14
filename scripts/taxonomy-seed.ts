#!/usr/bin/env node
/**
 * Idempotent REVIEW-only marketplace taxonomy seed.
 *
 * Safety rules:
 *  - REVIEW_DATABASE_URL is mandatory; DATABASE_URL is never used as a fallback.
 *  - --expect-db must match the URL database and the live current_database().
 *  - DatabaseClassification must explicitly contain REVIEW.
 *  - The existing 9 active categories and 41 active products are verified before
 *    any mutation; products are never written, moved or reseeded.
 *
 * The seed creates the 5 departments, reparents the existing nine categories,
 * creates the new level-1/level-2 nodes, and upserts aliases, attributes and
 * country rules. Re-running it produces the same tree.
 *
 * Usage:
 *   REVIEW_DATABASE_URL=postgresql://... \
 *     npx tsx scripts/taxonomy-seed.ts --expect-db=naijadeals_review
 */
import { Client } from "pg";
import {
  EXISTING_CATEGORY_KEYS,
  RESTRICTED_CATEGORY_KEYS,
  TAXONOMY_BY_KEY,
  TAXONOMY_NODES,
  validateTaxonomy
} from "../lib/data/taxonomy";
import {
  buildSeedCreateData,
  buildSeedUpdateData,
  seedRegulatedFlagFor
} from "../lib/services/taxonomy/seed-update";

/**
 * REVIEW acceptance expectations. Update these deliberately when a reviewed
 * catalogue batch changes the accepted totals; the seed fails otherwise.
 *
 * Products are counted across each existing category's whole subtree because
 * the reviewed product->leaf mapping moved listings onto descendant leaves.
 * Direct-only counts would undercount them and falsely report a changed map.
 */
const EXPECTED_ACTIVE_PRODUCTS_ON_EXISTING = 43;
const EXPECTED_ACTIVE_PRODUCTS_TOTAL = 57;

/** All ids in the subtree rooted at rootId (including rootId). */
function subtreeIds(rootId: string, nodes: Array<{ id: string; parentId: string | null }>): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const children = childrenByParent.get(node.parentId) ?? [];
    children.push(node.id);
    childrenByParent.set(node.parentId, children);
  }
  const ids = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    for (const child of childrenByParent.get(current) ?? []) {
      if (ids.has(child)) continue;
      ids.add(child);
      stack.push(child);
    }
  }
  return ids;
}

function countInSubtree(counts: Map<string, number>, ids: Set<string>): number {
  let total = 0;
  for (const id of ids) total += counts.get(id) ?? 0;
  return total;
}

type ExistingSnapshot = {
  id: string;
  key: string | null;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  isDemo: boolean;
  products: number;
  activeProducts: number;
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

async function verifyReviewTarget(url: string, expectedDb: string): Promise<void> {
  const client = new Client({
    connectionString: url,
    connectionTimeoutMillis: 8000,
    application_name: "naijadeals-taxonomy-seed"
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
    const tables = await client.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public'
         and table_name in ('CategoryAlias','CategoryAttribute','CategoryCountryRule','CategoryRequest')`
    );
    if (tables.rowCount !== 4) {
      fail("taxonomy tables are missing; run the marketplace taxonomy migration first");
    }
    console.log(`REVIEW target verified: ${actualDb} (classification REVIEW)`);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const expectedDb = parseExpectedDatabase(argv);
  const reviewUrl = resolveReviewUrl(expectedDb);
  validateTaxonomy();
  await verifyReviewTarget(reviewUrl, expectedDb);

  // Point Prisma at the verified REVIEW database before importing the client.
  process.env.DATABASE_URL = reviewUrl;
  const [{ prisma }, { Prisma }] = await Promise.all([
    import("../lib/prisma"),
    import("@prisma/client")
  ]);

  try {
    const summary = await prisma.$transaction(
      async (tx) => {
        const categoriesBefore = await tx.category.findMany({
          select: {
            id: true,
            key: true,
            name: true,
            slug: true,
            description: true,
            imageUrl: true,
            imageAlt: true,
            isActive: true,
            isDemo: true,
            parentId: true,
            level: true
          }
        });
        const productGroupsBefore = await tx.product.groupBy({
          by: ["categoryId"],
          _count: { _all: true }
        });
        const activeProductGroupsBefore = await tx.product.groupBy({
          by: ["categoryId"],
          where: { status: "ACTIVE" },
          _count: { _all: true }
        });
        const productCountByCategory = new Map(
          productGroupsBefore.map((group) => [group.categoryId, group._count._all])
        );
        const activeCountByCategory = new Map(
          activeProductGroupsBefore.map((group) => [group.categoryId, group._count._all])
        );

        const activeCategories = categoriesBefore.filter((entry) => entry.isActive);
        const existingActive = activeCategories.filter((entry) =>
          (EXISTING_CATEGORY_KEYS as readonly string[]).includes(entry.slug)
        );
        const taxonomyKeys = new Set(TAXONOMY_NODES.map((entry) => entry.key));
        const unexpectedActive = activeCategories.filter(
          (entry) =>
            !(EXISTING_CATEGORY_KEYS as readonly string[]).includes(entry.slug) &&
            !(entry.key && taxonomyKeys.has(entry.key))
        );
        if (existingActive.length !== EXISTING_CATEGORY_KEYS.length) {
          throw new Error(
            `expected ${EXISTING_CATEGORY_KEYS.length} existing active categories, found ${existingActive.length}`
          );
        }
        if (unexpectedActive.length > 0) {
          throw new Error(
            `unexpected active categories outside the taxonomy: ${unexpectedActive
              .map((entry) => entry.slug)
              .join(", ")}`
          );
        }

        const before: ExistingSnapshot[] = existingActive.map((entry) => {
          const ids = subtreeIds(
            entry.id,
            categoriesBefore.map((category) => ({ id: category.id, parentId: category.parentId }))
          );
          return {
            id: entry.id,
            key: entry.key,
            name: entry.name,
            slug: entry.slug,
            description: entry.description,
            imageUrl: entry.imageUrl,
            imageAlt: entry.imageAlt,
            isDemo: entry.isDemo,
            products: countInSubtree(productCountByCategory, ids),
            activeProducts: countInSubtree(activeCountByCategory, ids)
          };
        });
        const totalActiveProductsBefore = before.reduce(
          (sum, entry) => sum + entry.activeProducts,
          0
        );
        if (totalActiveProductsBefore !== EXPECTED_ACTIVE_PRODUCTS_ON_EXISTING) {
          throw new Error(
            `expected ${EXPECTED_ACTIVE_PRODUCTS_ON_EXISTING} active products on the existing categories, found ${totalActiveProductsBefore}`
          );
        }
        const totalActiveAllBefore = activeProductGroupsBefore.reduce(
          (sum, group) => sum + group._count._all,
          0
        );
        if (totalActiveAllBefore !== EXPECTED_ACTIVE_PRODUCTS_TOTAL) {
          throw new Error(
            `expected ${EXPECTED_ACTIVE_PRODUCTS_TOTAL} active products in total, found ${totalActiveAllBefore}`
          );
        }
        const totalProductsBefore = await tx.product.count();
        const imageRowsBefore = await tx.productImage.count();
        const stockRowsBefore = await tx.inventoryStock.count();
        const categoryRequestsBefore = await tx.categoryRequest.count();

        const idByKey = new Map<string, string>();
        const createdKeys: string[] = [];
        const updatedKeys: string[] = [];
        let aliasWrites = 0;
        let attributeWrites = 0;
        let countryRuleWrites = 0;

        for (const definition of TAXONOMY_NODES) {
          const matches = await tx.category.findMany({
            where: { OR: [{ key: definition.key }, { slug: definition.slug }] },
            select: { id: true, key: true, slug: true, name: true, imageUrl: true, imageAlt: true }
          });
          if (matches.length > 1) {
            throw new Error(
              `${definition.key}: key and slug resolve to different categories; refusing to merge`
            );
          }
          const parentId = definition.parentKey
            ? idByKey.get(definition.parentKey) ?? null
            : null;
          if (definition.parentKey && !parentId) {
            throw new Error(`${definition.key}: parent ${definition.parentKey} was not created`);
          }

          let categoryId: string;
          const found = matches[0];
          if (!found) {
            const created = await tx.category.create({
              data: buildSeedCreateData(definition, parentId),
              select: { id: true }
            });
            categoryId = created.id;
            createdKeys.push(definition.key);
          } else {
            if (found.key && found.key !== definition.key) {
              throw new Error(
                `${definition.key}: existing category already has key ${found.key}`
              );
            }
            if (found.slug !== definition.slug) {
              throw new Error(
                `${definition.key}: existing category slug is ${found.slug}, expected ${definition.slug}; refusing to rename`
              );
            }
            // The update payload never contains imageUrl/imageAlt: seeded image
            // defaults are create-only and cannot overwrite administrator art.
            await tx.category.update({
              where: { id: found.id },
              data: buildSeedUpdateData(definition, parentId)
            });
            categoryId = found.id;
            updatedKeys.push(definition.key);
          }
          idByKey.set(definition.key, categoryId);

          for (const entryAlias of definition.aliases) {
            const identity = {
              alias: entryAlias.alias,
              locale: entryAlias.locale
            };
            const existingAlias = await tx.categoryAlias.findUnique({
              where: { alias_locale: identity },
              select: { id: true, categoryId: true }
            });
            if (existingAlias && existingAlias.categoryId !== categoryId) {
              const owner = await tx.category.findUnique({
                where: { id: existingAlias.categoryId },
                select: { name: true, key: true }
              });
              if (!owner?.key || !TAXONOMY_BY_KEY.has(owner.key)) {
                throw new Error(
                  `alias ${entryAlias.alias} (${entryAlias.locale}) belongs to non-taxonomy category ${owner?.name ?? "(unknown)"}; refusing to move it`
                );
              }
            }
            await tx.categoryAlias.upsert({
              where: { alias_locale: identity },
              update: { categoryId },
              create: { ...identity, categoryId }
            });
            aliasWrites += 1;
          }

          for (const attribute of definition.attributes) {
            const data = {
              label: attribute.label,
              type: attribute.type,
              required: attribute.required,
              options: attribute.options
                ? attribute.options
                : Prisma.DbNull
            };
            await tx.categoryAttribute.upsert({
              where: {
                categoryId_key: { categoryId, key: attribute.key }
              },
              update: data,
              create: {
                categoryId,
                key: attribute.key,
                ...data
              }
            });
            attributeWrites += 1;
          }

          for (const rule of definition.countryRules) {
            await tx.categoryCountryRule.upsert({
              where: {
                categoryId_countryCode: {
                  categoryId,
                  countryCode: rule.countryCode
                }
              },
              update: {
                canPublish: rule.canPublish,
                note: rule.note ?? null
              },
              create: {
                categoryId,
                countryCode: rule.countryCode,
                canPublish: rule.canPublish,
                note: rule.note ?? null
              }
            });
            countryRuleWrites += 1;
          }
        }

        // ---- Verification: catalogue and existing rows are untouched -------
        const categoriesAfter = await tx.category.findMany({
          select: {
            id: true,
            key: true,
            name: true,
            slug: true,
            description: true,
            imageUrl: true,
            imageAlt: true,
            isActive: true,
            isDemo: true,
            parentId: true,
            level: true,
            isSelectable: true,
            isRegulated: true
          }
        });
        const afterBySlug = new Map(categoriesAfter.map((entry) => [entry.slug, entry]));
        const productGroupsAfter = await tx.product.groupBy({
          by: ["categoryId"],
          _count: { _all: true }
        });
        const activeProductGroupsAfter = await tx.product.groupBy({
          by: ["categoryId"],
          where: { status: "ACTIVE" },
          _count: { _all: true }
        });
        const productCountAfter = new Map(
          productGroupsAfter.map((group) => [group.categoryId, group._count._all])
        );
        const activeCountAfter = new Map(
          activeProductGroupsAfter.map((group) => [group.categoryId, group._count._all])
        );
        const categoryTreeAfter = categoriesAfter.map((category) => ({
          id: category.id,
          parentId: category.parentId
        }));
        const totalProductsAfter = await tx.product.count();
        const totalActiveProductsAfter = before.reduce((sum, entry) => {
          const ids = subtreeIds(entry.id, categoryTreeAfter);
          return sum + countInSubtree(activeCountAfter, ids);
        }, 0);
        const totalActiveAllAfterGroups = await tx.product.groupBy({
          by: ["status"],
          where: { status: "ACTIVE" },
          _count: { _all: true }
        });
        const totalActiveAllAfter = totalActiveAllAfterGroups.reduce(
          (sum, group) => sum + group._count._all,
          0
        );
        const imageRowsAfter = await tx.productImage.count();
        const stockRowsAfter = await tx.inventoryStock.count();
        const categoryRequestsAfter = await tx.categoryRequest.count();

        for (const snapshot of before) {
          const after = afterBySlug.get(snapshot.slug);
          if (!after) throw new Error(`existing category ${snapshot.slug} disappeared`);
          if (after.id !== snapshot.id) {
            throw new Error(`${snapshot.slug}: category id changed`);
          }
          if (after.name !== snapshot.name) {
            throw new Error(`${snapshot.slug}: category name changed`);
          }
          if (
            after.description !== snapshot.description ||
            after.imageUrl !== snapshot.imageUrl ||
            after.imageAlt !== snapshot.imageAlt ||
            after.isDemo !== snapshot.isDemo
          ) {
            throw new Error(`${snapshot.slug}: preserved category presentation fields changed`);
          }
          if (
            countInSubtree(productCountAfter, subtreeIds(after.id, categoryTreeAfter)) !==
              snapshot.products ||
            countInSubtree(activeCountAfter, subtreeIds(after.id, categoryTreeAfter)) !==
              snapshot.activeProducts
          ) {
            throw new Error(`${snapshot.slug}: product mapping changed`);
          }
          if (after.level !== 1 || !after.parentId || after.key !== snapshot.slug) {
            throw new Error(`${snapshot.slug}: reparenting incomplete`);
          }
        }

        if (totalProductsAfter !== totalProductsBefore) {
          throw new Error(
            `product count changed from ${totalProductsBefore} to ${totalProductsAfter}`
          );
        }
        if (totalActiveProductsAfter !== totalActiveProductsBefore) {
          throw new Error(
            `active product count changed from ${totalActiveProductsBefore} to ${totalActiveProductsAfter}`
          );
        }
        if (totalActiveAllAfter !== totalActiveAllBefore) {
          throw new Error(
            `total active product count changed from ${totalActiveAllBefore} to ${totalActiveAllAfter}`
          );
        }
        if (totalActiveAllAfter !== EXPECTED_ACTIVE_PRODUCTS_TOTAL) {
          throw new Error(
            `expected ${EXPECTED_ACTIVE_PRODUCTS_TOTAL} active products after seeding, found ${totalActiveAllAfter}`
          );
        }
        if (imageRowsAfter !== imageRowsBefore) {
          throw new Error(`product image rows changed from ${imageRowsBefore} to ${imageRowsAfter}`);
        }
        if (stockRowsAfter !== stockRowsBefore) {
          throw new Error(`inventory rows changed from ${stockRowsBefore} to ${stockRowsAfter}`);
        }
        if (categoryRequestsAfter !== categoryRequestsBefore) {
          throw new Error(
            `category request count changed from ${categoryRequestsBefore} to ${categoryRequestsAfter}`
          );
        }

        const nodesByKey = new Map(
          categoriesAfter.filter((entry) => entry.key).map((entry) => [entry.key as string, entry])
        );
        for (const definition of TAXONOMY_NODES) {
          const saved = nodesByKey.get(definition.key);
          if (!saved) throw new Error(`taxonomy node ${definition.key} is missing after seeding`);
          if (saved.level !== definition.level) {
            throw new Error(`${definition.key}: saved level ${saved.level} != ${definition.level}`);
          }
          if (saved.isSelectable !== definition.isSelectable) {
            throw new Error(
              `${definition.key}: saved isSelectable ${saved.isSelectable} != ${definition.isSelectable}`
            );
          }
          if (saved.isRegulated !== seedRegulatedFlagFor(definition)) {
            throw new Error(
              `${definition.key}: saved isRegulated ${saved.isRegulated} != established definition ${seedRegulatedFlagFor(
                definition
              )}`
            );
          }
          if (definition.parentKey) {
            const expectedParentId = idByKey.get(definition.parentKey);
            if (!expectedParentId || saved.parentId !== expectedParentId) {
              throw new Error(`${definition.key}: parent link is incorrect`);
            }
          } else if (saved.parentId !== null) {
            throw new Error(`${definition.key}: department must have no parent`);
          }
        }

        const newLeafKeys = new Set(
          TAXONOMY_NODES.filter((entry) => !entry.isExisting && entry.level === 2).map(
            (entry) => entry.key
          )
        );
        const newLeavesWithProducts = categoriesAfter
          .filter((entry) => entry.key && newLeafKeys.has(entry.key))
          .map((entry) => ({
            key: entry.key as string,
            products: productCountAfter.get(entry.id) ?? 0
          }))
          .filter((entry) => entry.products > 0);

        const taxonomyCategoryIds = [...idByKey.values()];
        const aliasCount = await tx.categoryAlias.count({
          where: { categoryId: { in: taxonomyCategoryIds } }
        });
        const attributeCount = await tx.categoryAttribute.count({
          where: { categoryId: { in: taxonomyCategoryIds } }
        });
        const countryRuleCount = await tx.categoryCountryRule.count({
          where: { categoryId: { in: taxonomyCategoryIds } }
        });
        const restrictedRules = await tx.categoryCountryRule.findMany({
          where: {
            categoryId: { in: [...RESTRICTED_CATEGORY_KEYS].map((key) => idByKey.get(key) ?? "") },
            countryCode: "NG"
          },
          select: { categoryId: true, canPublish: true }
        });

        return {
          database: expectedDb,
          classification: "REVIEW",
          nodes: {
            total: TAXONOMY_NODES.length,
            departments: TAXONOMY_NODES.filter((entry) => entry.level === 0).length,
            categories: TAXONOMY_NODES.filter((entry) => entry.level === 1).length,
            subcategories: TAXONOMY_NODES.filter((entry) => entry.level === 2).length,
            created: createdKeys.length,
            updated: updatedKeys.length,
            createdKeys,
            updatedKeys
          },
          existingCategories: before.map((entry) => ({
            id: entry.id,
            slug: entry.slug,
            name: entry.name,
            products: countInSubtree(
              productCountAfter,
              subtreeIds(entry.id, categoryTreeAfter)
            ),
            activeProducts: countInSubtree(
              activeCountAfter,
              subtreeIds(entry.id, categoryTreeAfter)
            )
          })),
          products: {
            totalBefore: totalProductsBefore,
            totalAfter: totalProductsAfter,
            activeBefore: totalActiveProductsBefore,
            activeAfter: totalActiveProductsAfter,
            activeAllBefore: totalActiveAllBefore,
            activeAllAfter: totalActiveAllAfter,
            expectedActiveAll: EXPECTED_ACTIVE_PRODUCTS_TOTAL,
            imageRowsBefore,
            imageRowsAfter,
            stockRowsBefore,
            stockRowsAfter,
            categoryIdChanges: 0,
            newLeavesWithProducts: newLeavesWithProducts.length,
            newLeavesWithoutProducts: newLeafKeys.size - newLeavesWithProducts.length
          },
          categoryRequests: {
            before: categoryRequestsBefore,
            after: categoryRequestsAfter,
            created: 0
          },
          aliases: aliasCount,
          aliasWrites,
          attributes: attributeCount,
          attributeWrites,
          countryRules: countryRuleCount,
          countryRuleWrites,
          restrictedLeaves: RESTRICTED_CATEGORY_KEYS.map((key) => ({
            key,
            canPublishNG: restrictedRules.find(
              (rule) => rule.categoryId === idByKey.get(key)
            )?.canPublish
          })),
          newZeroInventoryLeaves: [...newLeafKeys].sort(),
          newLeavesWithProducts: newLeavesWithProducts.length,
          newLeavesWithoutProducts: newLeafKeys.size - newLeavesWithProducts.length
        };
      },
      { maxWait: 15000, timeout: 180000 }
    );

    console.log("");
    console.log("Taxonomy seed complete.");
    console.log(
      `Nodes: ${summary.nodes.total} (${summary.nodes.departments} departments, ${summary.nodes.categories} categories, ${summary.nodes.subcategories} subcategories)`
    );
    console.log(`Created: ${summary.nodes.created}; updated: ${summary.nodes.updated}`);
    console.log(
      `Existing catalogue: ${summary.existingCategories.length} categories; ` +
        `${summary.products.totalAfter} products (${summary.products.activeAfter} active on existing categories, ` +
        `${summary.products.activeAllAfter}/${summary.products.expectedActiveAll} active in total)`
    );
    console.log(
      `Product category changes: ${summary.products.categoryIdChanges}; new-leaf products: ${summary.products.newLeavesWithProducts}`
    );
    console.log(
      `Images: before ${summary.products.imageRowsBefore}, after ${summary.products.imageRowsAfter}; ` +
        `inventory rows: before ${summary.products.stockRowsBefore}, after ${summary.products.stockRowsAfter}`
    );
    console.log(
      `Aliases: ${summary.aliases} (writes ${summary.aliasWrites}); attributes: ${summary.attributes} (writes ${summary.attributeWrites}); country rules: ${summary.countryRules} (writes ${summary.countryRuleWrites})`
    );
    console.log(
      `Category requests: before ${summary.categoryRequests.before}, after ${summary.categoryRequests.after}, created ${summary.categoryRequests.created}`
    );
    for (const restricted of summary.restrictedLeaves) {
      console.log(`Restricted: ${restricted.key} canPublish NG = ${String(restricted.canPublishNG)}`);
    }
    console.log(
      `New selectable leaves: ${summary.newZeroInventoryLeaves.length} ` +
        `(with products: ${summary.newLeavesWithProducts}, zero inventory: ${summary.newLeavesWithoutProducts})`
    );
    console.log("Result: PASS");
  } catch (error) {
    fail(sanitize(error instanceof Error ? error.message : String(error)));
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

void main().catch((error) => {
  console.error(`FAIL: ${sanitize(error instanceof Error ? error.message : String(error))}`);
  process.exit(2);
});
