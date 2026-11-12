/** REVIEW-only catalogue index rebuild after seeding. Refuses non-REVIEW databases. */
import { prisma } from "../lib/prisma";
import { reindexCatalogue } from "../lib/infra/catalogue-index";

async function main() {
  const rows = await prisma.databaseClassification.findMany({ select: { classification: true } });
  if (!rows.some((row) => row.classification === "REVIEW")) throw new Error("refusing: database is not classified REVIEW");
  const result = await reindexCatalogue();
  console.log(JSON.stringify({ reindexed: true, result }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
