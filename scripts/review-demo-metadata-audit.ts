/**
 * REVIEW-only demonstration metadata audit.
 *
 * Audits every Category and Product row, including inactive, draft and archived
 * records, for an explicit `isDemo` classification that agrees with corroborating
 * demonstration evidence:
 *
 *   Category: a DEMO/Demonstration description (name alone is not sufficient).
 *   Product:  the demonstration seller, a DEMO moderation note, or a
 *             DEMO/Demonstration description.
 *
 * The audit is read-only by default. `--apply` enables an idempotent REVIEW-only
 * correction that sets only `isDemo` on corroborated records whose flag is false.
 * Ids, images, stock, prices, and publication state are never modified.
 *
 * Usage:
 *   DATABASE_URL=<review url> npx tsx scripts/review-demo-metadata-audit.ts \
 *     --expect-db=naijadeals_review
 *   DATABASE_URL=<review url> npx tsx scripts/review-demo-metadata-audit.ts \
 *     --expect-db=naijadeals_review --apply
 */
import { prisma } from "../lib/prisma";

const DEMO_WORD = /\bdemo\b/i;
const DEMO_DESCRIPTION = /\b(?:demo|demonstration)\b/i;
const DEMO_VENDOR_SLUG = "demo-catalogue-review";

type Evidence = {
  name: boolean;
  description: boolean;
  moderationNote: boolean;
  demoVendor: boolean;
  /** Evidence outside the display name, required before an automatic correction. */
  corroborated: boolean;
};

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  isDemo: boolean;
};

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: string;
  isDemo: boolean;
  isSample: boolean;
  moderationNote: string | null;
  vendor: { slug: string; name: string };
  category: { slug: string; name: string };
};

type Mismatch = {
  id: string;
  type: "category" | "product";
  name: string;
  slug: string;
  status?: string;
  evidence: Evidence;
};

function databaseName(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? "").pathname.replace(/^\//, "") || "unknown";
  } catch {
    return "unknown";
  }
}

function categoryEvidence(category: CategoryRow): Evidence {
  const name = DEMO_WORD.test(category.name);
  const description = DEMO_DESCRIPTION.test(category.description ?? "");
  return {
    name,
    description,
    moderationNote: false,
    demoVendor: false,
    corroborated: description
  };
}

function productEvidence(product: ProductRow): Evidence {
  const name = DEMO_WORD.test(product.name);
  const description = DEMO_DESCRIPTION.test(product.description);
  const moderationNote = DEMO_WORD.test(product.moderationNote ?? "");
  const demoVendor =
    product.vendor.slug === DEMO_VENDOR_SLUG || DEMO_WORD.test(product.vendor.name);
  return {
    name,
    description,
    moderationNote,
    demoVendor,
    corroborated: description || moderationNote || demoVendor
  };
}

function countBy<T extends string>(values: T[]): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

async function assertReviewDatabase(expectedDatabase: string | null): Promise<{
  name: string;
  classifications: string[];
}> {
  const rows = await prisma.$queryRaw<Array<{ current_database: string }>>`select current_database()`;
  const name = rows[0]?.current_database ?? "unknown";
  const classifications = (
    await prisma.databaseClassification.findMany({ select: { classification: true } })
  ).map((row) => row.classification);

  if (expectedDatabase && name !== expectedDatabase) {
    throw new Error(
      `refusing: connected database is ${name}, expected ${expectedDatabase}; DATABASE_URL was not switched`
    );
  }
  if (!classifications.includes("REVIEW")) {
    throw new Error(`refusing: ${name} is not classified REVIEW`);
  }
  return { name, classifications };
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const expectedArg = process.argv.find((arg) => arg.startsWith("--expect-db="));
  const expectedDatabase = expectedArg ? expectedArg.slice("--expect-db=".length).trim() : null;

  if (apply && !expectedDatabase) {
    throw new Error("refusing: --apply requires --expect-db=<database name>");
  }

  const identity = await assertReviewDatabase(expectedDatabase);
  const categories = (await prisma.category.findMany({
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      isActive: true,
      isDemo: true
    }
  })) as CategoryRow[];

  const products = (await prisma.product.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      status: true,
      isDemo: true,
      isSample: true,
      moderationNote: true,
      vendor: { select: { slug: true, name: true } },
      category: { select: { slug: true, name: true } }
    }
  })) as ProductRow[];

  const categoryEvidenceById = new Map(categories.map((row) => [row.id, categoryEvidence(row)]));
  const productEvidenceById = new Map(products.map((row) => [row.id, productEvidence(row)]));

  const missingCategoryDemo = categories
    .filter((row) => !row.isDemo)
    .map<Mismatch>((row) => ({
      id: row.id,
      type: "category",
      name: row.name,
      slug: row.slug,
      status: row.isActive ? "ACTIVE" : "INACTIVE",
      evidence: categoryEvidenceById.get(row.id) as Evidence
    }));

  const missingProductDemo = products
    .filter((row) => !row.isDemo)
    .map<Mismatch>((row) => ({
      id: row.id,
      type: "product",
      name: row.name,
      slug: row.slug,
      status: row.status,
      evidence: productEvidenceById.get(row.id) as Evidence
    }));

  const demoWithoutCorroboration = [
    ...categories
      .filter((row) => row.isDemo && !(categoryEvidenceById.get(row.id) as Evidence).corroborated)
      .map((row) => ({ type: "category", id: row.id, name: row.name, slug: row.slug })),
    ...products
      .filter((row) => row.isDemo && !(productEvidenceById.get(row.id) as Evidence).corroborated)
      .map((row) => ({ type: "product", id: row.id, name: row.name, slug: row.slug }))
  ];

  const correctionTargets = [...missingCategoryDemo, ...missingProductDemo].filter(
    (row) => row.evidence.corroborated
  );
  const uncorroboratedTargets = [...missingCategoryDemo, ...missingProductDemo].filter(
    (row) => !row.evidence.corroborated
  );

  const changed: Array<{ type: string; id: string; name: string; slug: string }> = [];
  if (apply && correctionTargets.length > 0) {
    await prisma.$transaction(async (tx) => {
      const classifications = await tx.databaseClassification.findMany({
        select: { classification: true }
      });
      if (!classifications.some((row) => row.classification === "REVIEW")) {
        throw new Error("refusing: REVIEW classification disappeared before correction");
      }
      for (const target of correctionTargets) {
        if (target.type === "category") {
          const result = await tx.category.updateMany({
            where: { id: target.id, isDemo: false },
            data: { isDemo: true }
          });
          if (result.count > 0) {
            changed.push({
              type: "category",
              id: target.id,
              name: target.name,
              slug: target.slug
            });
          }
        } else {
          const result = await tx.product.updateMany({
            where: { id: target.id, isDemo: false },
            data: { isDemo: true }
          });
          if (result.count > 0) {
            changed.push({
              type: "product",
              id: target.id,
              name: target.name,
              slug: target.slug
            });
          }
        }
      }
    });
  }

  const activeCategories = categories.filter((row) => row.isActive);
  const statuses = products.map((row) => row.status);

  const report = {
    audit: "review-demo-metadata",
    database: {
      name: identity.name,
      classifications: identity.classifications,
      urlDatabaseName: databaseName(),
      expectedDatabase,
      expectedDatabaseMatched: expectedDatabase ? identity.name === expectedDatabase : null
    },
    categories: {
      total: categories.length,
      active: activeCategories.length,
      inactive: categories.length - activeCategories.length,
      isDemoTrue: categories.filter((row) => row.isDemo).length,
      isDemoFalse: categories.filter((row) => !row.isDemo).length,
      evidence: {
        nameMarker: categories.filter((row) => (categoryEvidenceById.get(row.id) as Evidence).name)
          .length,
        demoDescription: categories.filter(
          (row) => (categoryEvidenceById.get(row.id) as Evidence).description
        ).length,
        corroborated: categories.filter(
          (row) => (categoryEvidenceById.get(row.id) as Evidence).corroborated
        ).length
      }
    },
    products: {
      total: products.length,
      active: products.filter((row) => row.status === "ACTIVE").length,
      byStatus: countBy(statuses),
      isDemoTrue: products.filter((row) => row.isDemo).length,
      isDemoFalse: products.filter((row) => !row.isDemo).length,
      evidence: {
        nameMarker: products.filter((row) => (productEvidenceById.get(row.id) as Evidence).name)
          .length,
        demoDescription: products.filter(
          (row) => (productEvidenceById.get(row.id) as Evidence).description
        ).length,
        demoModerationNote: products.filter(
          (row) => (productEvidenceById.get(row.id) as Evidence).moderationNote
        ).length,
        demoVendor: products.filter(
          (row) => (productEvidenceById.get(row.id) as Evidence).demoVendor
        ).length,
        corroborated: products.filter(
          (row) => (productEvidenceById.get(row.id) as Evidence).corroborated
        ).length
      }
    },
    mismatches: {
      totalFlagged: missingCategoryDemo.length + missingProductDemo.length,
      corroboratedTargets: correctionTargets,
      uncorroboratedTargets,
      demoFlagWithoutCorroboration: demoWithoutCorroboration
    },
    correction: {
      requested: apply,
      eligible: correctionTargets.length,
      changed,
      unchanged: correctionTargets.length - changed.length,
      note:
        correctionTargets.length === 0
          ? "No correction needed: every demonstration record already has isDemo=true."
          : apply
            ? "Only isDemo was changed on corroborated rows; no other field was touched."
            : "Dry run only. Re-run with --apply to set isDemo on corroborated rows."
    }
  };

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
