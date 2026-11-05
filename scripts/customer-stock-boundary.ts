import { PrismaClient } from "@prisma/client";
const base = process.env.DATABASE_URL ?? "";
const url = base + (base.includes("?") ? "&" : "?") + "schema=customer_account_test";
const db = new PrismaClient({ datasources: { db: { url } } });
(async () => {
  const product = await db.product.findFirstOrThrow({ where: { slug: "fixture-lamp" } });
  await db.inventoryStock.update({ where: { productId: product.id }, data: { quantity: 0 } });
  console.log("zeroed");
  await db.$disconnect();
})();
