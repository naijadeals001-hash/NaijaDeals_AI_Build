/**
 * REVIEW-only startup check for the owner-review preview. Refuses any other
 * classification and requires the visible review indicator to be enabled.
 */
import { prisma } from "../lib/prisma";

async function main() {
  if (process.env.NEXT_PUBLIC_REVIEW_CATALOGUE !== "1") {
    throw new Error("refusing: NEXT_PUBLIC_REVIEW_CATALOGUE must be 1 for the review preview");
  }
  const rows = await prisma.databaseClassification.findMany({ select: { classification: true } });
  const db = await prisma.$queryRaw<Array<{ current_database: string }>>`select current_database()`;
  const database = db[0]?.current_database ?? "";
  const expected = process.env.REVIEW_EXPECTED_DATABASE;
  if (!expected) {
    throw new Error("refusing: REVIEW_EXPECTED_DATABASE must name the intended REVIEW database");
  }
  if (database !== expected) {
    throw new Error(`refusing: connected to ${database}, expected ${expected}`);
  }
  if (!rows.some((row) => row.classification === "REVIEW")) {
    throw new Error("refusing: database is not classified REVIEW");
  }
  const crf = await prisma.category.count({ where: { name: { startsWith: "CRF" } } });
  if (crf > 0) throw new Error(`refusing: ${crf} financial-acceptance categories present in the review catalogue`);
  const counts = await Promise.all([
    prisma.category.count(),
    prisma.product.count(),
    prisma.vendor.count(),
    prisma.order.count()
  ]);
  console.log(JSON.stringify({
    database: db[0]?.current_database ?? "",
    classification: rows.map((row) => row.classification),
    counts: { categories: counts[0], products: counts[1], vendors: counts[2], orders: counts[3] },
    crfCategories: crf,
    reviewIndicator: true
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  })
  .finally(() => prisma.$disconnect());
