import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const keep = ["demo-laptop-14","demo-laptop-15","demo2-monitor","demo2-toaster","demo2-perfume","demo2-perfume-set"];
(async () => {
  const archived = await prisma.product.updateMany({
    where: { isSample: true, slug: { notIn: keep } },
    data: { status: "DRAFT" }
  });
  const active = await prisma.product.updateMany({ where: { slug: { in: keep } }, data: { status: "ACTIVE" } });
  console.log(JSON.stringify({ archived: archived.count, active: active.count }));
  await prisma.$disconnect();
})();
