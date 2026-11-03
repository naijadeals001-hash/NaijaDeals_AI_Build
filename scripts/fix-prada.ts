import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
(async () => {
  await prisma.product.updateMany({ where: { slug: "demo4-handbags" }, data: { name: "Prada Tooled Leather Handbag" } });
  console.log("ok");
  await prisma.$disconnect();
})();
