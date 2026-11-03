import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
(async () => {
  await prisma.product.updateMany({ where: { slug: "demo2-monitor" }, data: { name: "LED Monitor" } });
  await prisma.product.updateMany({ where: { slug: "demo5-coffee-maker" }, data: { name: "Coffee Maker" } });
  console.log("spec claims narrowed");
  await prisma.$disconnect();
})();

// Prada period claim narrowed to source-supported material.
