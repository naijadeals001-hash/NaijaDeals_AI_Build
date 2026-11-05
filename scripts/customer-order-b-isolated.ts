import { PrismaClient } from "@prisma/client";
const base = process.env.DATABASE_URL ?? "";
const url = base + (base.includes("?") ? "&" : "?") + "schema=customer_account_test";
const db = new PrismaClient({ datasources: { db: { url } } });
(async () => {
  const b = await db.user.findUniqueOrThrow({ where: { email: "cust-b@test.local" } });
  const vendor = await db.vendor.findFirstOrThrow();
  const product = await db.product.findFirstOrThrow();
  const existing = await db.order.findFirst({ where: { customerId: b.id, orderNumber: "FIXTURE-ORDER-B" } });
  if (!existing) await db.order.create({ data: { orderNumber: "FIXTURE-ORDER-B", customerId: b.id, vendorId: vendor.id, status: "created", paymentStatus: "pending", subtotalKobo: 1250000n, totalKobo: 1250000n, deliveryAddress: "2 Bola Customer Street, Ikeja, Lagos", contactName: b.name, contactPhone: b.phone ?? "08030000002", items: { create: [{ productId: product.id, quantity: 1, unitKobo: 1250000n, totalKobo: 1250000n, productName: product.name, imageUrl: "/products/demo3/computer-monitor.jpg" }] }, statusEvents: { create: [{ to: "created", note: "Order placed" }] } } });
  console.log("ok");
  await db.$disconnect();
})();
