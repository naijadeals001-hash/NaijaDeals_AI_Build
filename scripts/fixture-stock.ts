import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const base = process.env.DATABASE_URL ?? "";
const url = base + (base.includes("?") ? "&" : "?") + "schema=customer_account_test";
const db = new PrismaClient({ datasources: { db: { url } } });
(async () => {
  const product = await db.product.findFirstOrThrow({ where: { slug: "fixture-lamp" } });
  const quantity = Number(process.env.FIXTURE_STOCK ?? "0");
  await db.inventoryStock.update({ where: { productId: product.id }, data: { quantity } });
  console.log(JSON.stringify({ productId: product.id, quantity }));
  await db.$disconnect();
})();
