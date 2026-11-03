import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
(async () => {
  const restored = await prisma.product.updateMany({ where: { isSample: true }, data: { status: "ACTIVE" } });
  console.log(JSON.stringify({ restored: restored.count }));
  await prisma.$disconnect();
})();
