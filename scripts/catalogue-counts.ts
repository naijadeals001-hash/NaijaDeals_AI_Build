import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
(async () => {
  const rows = await prisma.product.findMany({ where: { isSample: true }, select: { slug: true, status: true } });
  const group = (slug: string) => slug.startsWith("demo3-") ? "demo3" : slug.startsWith("demo2-") ? "demo2" : slug.startsWith("demo-") ? "demo1" : slug.startsWith("sample-") ? "seed-catalog" : "branded";
  const counts: Record<string, { total: number; active: number; draft: number }> = {};
  for (const row of rows) {
    const key = group(row.slug);
    counts[key] ??= { total: 0, active: 0, draft: 0 };
    counts[key].total++;
    if (row.status === "ACTIVE") counts[key].active++; else counts[key].draft++;
  }
  console.log(JSON.stringify({ total: rows.length, counts }, null, 1));
  await prisma.$disconnect();
})();
