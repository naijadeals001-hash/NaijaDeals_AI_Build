/**
 * REVIEW-only catalogue quality repair. Idempotent; refuses non-REVIEW databases.
 * - Moves the fresh-tomatoes demonstration product to a Groceries department.
 * - Moves the eau-de-parfum demonstration product to Beauty & Personal Care.
 * - Archives the sunscreen demonstration listing whose image is a perfume bottle.
 * Adds no filler, no duplicates and no specifications.
 */
import { prisma } from "../lib/prisma";

async function main() {
  const rows = await prisma.databaseClassification.findMany({ select: { classification: true } });
  if (!rows.some((row) => row.classification === "REVIEW")) throw new Error("refusing: database is not classified REVIEW");

  const groceries = await prisma.category.upsert({
    where: { slug: "groceries-household" },
    update: { name: "Groceries & Household Essentials", isActive: true },
    create: {
      name: "Groceries & Household Essentials",
      slug: "groceries-household",
      description: "DEMO department — demonstration groceries for owner review, not live supply.",
      imageUrl: "/generated/shop/category-groceries.webp",
      isActive: true,
      sortOrder: 20
    }
  });
  const beauty = await prisma.category.findUnique({ where: { slug: "beauty-personal-care" } });
  if (!beauty) throw new Error("missing Beauty & Personal Care department");

  const tomatoes = await prisma.product.update({
    where: { slug: "demo-fresh-tomatoes" },
    data: { categoryId: groceries.id }
  });
  const perfume = await prisma.product.update({
    where: { slug: "demo-eau-de-parfum-50ml" },
    data: { categoryId: beauty.id }
  });
  const sunscreen = await prisma.product.update({
    where: { slug: "demo-daily-sunscreen" },
    data: {
      status: "ARCHIVED",
      moderationNote: "DEMO — archived: imagery did not match a sunscreen; no accurate asset available"
    }
  });

  const perDepartment = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { name: true, _count: { select: { products: { where: { status: "ACTIVE" } } } } }
  });
  console.log(JSON.stringify({
    moved: { tomatoes: tomatoes.categoryId === groceries.id, perfume: perfume.categoryId === beauty.id },
    archived: sunscreen.status,
    departments: perDepartment,
    activeProducts: await prisma.product.count({ where: { status: "ACTIVE" } }),
    crfCategories: await prisma.category.count({ where: { name: { startsWith: "CRF" } } })
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
