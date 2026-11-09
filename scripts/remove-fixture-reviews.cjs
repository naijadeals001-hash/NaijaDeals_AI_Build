/**
 * Deletes reviews attached to acceptance-suite fixtures ("Test …", "Last Unit …",
 * "Variant Fixture …"), which must never appear on a storefront or carry a rating.
 * Usage: node scripts/remove-fixture-reviews.cjs
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const fixtures = await prisma.product.findMany({
    where: { OR: [{ name: { startsWith: "Test " } }, { name: { startsWith: "Variant Fixture" } }, { name: { startsWith: "Last Unit" } }, { name: { contains: "mw8" } }] },
    select: { id: true, name: true }
  });
  const ids = fixtures.map((row) => row.id);
  const removed = await prisma.review.deleteMany({ where: { productId: { in: ids } } });
  console.log(JSON.stringify({ fixtureProducts: ids.length, removedReviews: removed.count }));
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
