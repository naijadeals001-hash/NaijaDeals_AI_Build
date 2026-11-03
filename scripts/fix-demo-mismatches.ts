import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
(async () => {
  await prisma.product.update({ where: { slug: "demo-monitor-24" }, data: { name: "Vintage Desktop Computer", description: "Classic beige desktop computer with keyboard, shown for visual testing." } });
  await prisma.product.update({ where: { slug: "demo-powerbank" }, data: { name: "12V Car Battery", description: "12V car battery for vehicle power, shown for visual testing." } });
  await prisma.product.update({ where: { slug: "demo-headset" }, data: { name: "Gaming PC Tower", description: "Desktop gaming tower with tempered-glass side panel." } });
  await prisma.product.update({ where: { slug: "demo-smartphone-dual" }, data: { status: "DRAFT" } });
  console.log(JSON.stringify({ updated: 4 }));
  await prisma.$disconnect();
})();
