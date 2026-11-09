/**
 * Seeds the four homepage variants with the default 25/25/25/25 split.
 * Idempotent: existing rows keep their admin-set allocation and enabled state.
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const VARIANTS = [
  ["original", "Original NaijaDeals", "The established homepage with the NaijaDrive-led hero and ecosystem grid.", 0],
  ["africa-super-app", "Africa Super-App", "The approved redesign: Abuja landmarks and every vertical.", 1],
  ["mobility", "Mobility & Services", "Rides, deliveries and services first.", 2],
  ["commerce", "Commerce & Lifestyle", "Shopping, food, stays and entertainment.", 3]
];

(async () => {
  let created = 0;
  for (const [key, name, description, sortOrder] of VARIANTS) {
    const existing = await prisma.homeVariant.findUnique({ where: { key } });
    if (existing) continue;
    await prisma.homeVariant.create({ data: { key, name, description, allocation: 25, enabled: true, sortOrder } });
    created += 1;
  }
  const all = await prisma.homeVariant.findMany({ orderBy: { sortOrder: "asc" }, select: { key: true, allocation: true, enabled: true } });
  console.log(JSON.stringify({ created, variants: all }));
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
