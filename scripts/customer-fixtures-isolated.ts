import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/auth/password";

const schema = "customer_account_test";
const base = process.env.DATABASE_URL ?? "";
const url = base + (base.includes("?") ? "&" : "?") + "schema=" + schema;
const db = new PrismaClient({ datasources: { db: { url } } });

(async () => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  const passwordHash = await hashPassword("CustomerA123!");
  const [a, b] = await Promise.all([
    db.user.upsert({ where: { email: "cust-a@test.local" }, update: {}, create: { email: "cust-a@test.local", name: "Ada Customer", phone: "08030000001", passwordHash } }),
    db.user.upsert({ where: { email: "cust-b@test.local" }, update: {}, create: { email: "cust-b@test.local", name: "Bola Customer", phone: "08030000002", passwordHash } })
  ]);
  const category = await db.category.upsert({ where: { slug: "test-home" }, update: {}, create: { name: "Test Home", slug: "test-home", description: "Fixture category" } });
  const vendor = await db.vendor.upsert({ where: { slug: "fixture-seller" }, update: {}, create: { ownerId: a.id, name: "Fixture Seller", slug: "fixture-seller", market: "Lagos", pickupAddress: "1 Fixture Road", pickupPhone: "08030000003", status: "VERIFIED" } });
  const product = await db.product.upsert({ where: { slug: "fixture-lamp" }, update: {}, create: { vendorId: vendor.id, categoryId: category.id, name: "Fixture Desk Lamp", slug: "fixture-lamp", description: "Disposable fixture product.", priceKobo: 1250000n, status: "ACTIVE", stock: { create: { quantity: 12, lowStockLevel: 2 } } } });
  await db.productImage.deleteMany({ where: { productId: product.id } });
  await db.productImage.create({ data: { productId: product.id, url: "/products/demo3/computer-monitor.jpg", alt: "Fixture Desk Lamp", sortOrder: 0 } });
  for (const user of [a, b]) {
    await db.address.deleteMany({ where: { userId: user.id } });
    await db.address.create({ data: { userId: user.id, label: "Home", countryCode: "NG", state: "Lagos", city: "Ikeja", line1: "1 " + user.name + " Street", phone: user.phone ?? "08030000000", isDefault: true } });
    await db.wallet.upsert({ where: { id: "wallet-" + user.id }, update: {}, create: { id: "wallet-" + user.id, ownerType: "CUSTOMER", userId: user.id, availableKobo: 5000000n, heldKobo: 0n } });
  }
  await db.savedItem.deleteMany({ where: { userId: a.id } });
  await db.savedItem.create({ data: { userId: a.id, productId: product.id } });
  const existing = await db.order.findFirst({ where: { customerId: a.id, orderNumber: "FIXTURE-ORDER-A" } });
  if (!existing) {
    const order = await db.order.create({ data: {
      orderNumber: "FIXTURE-ORDER-A", customerId: a.id, vendorId: vendor.id, status: "delivered", paymentStatus: "paid",
      subtotalKobo: 2500000n, deliveryFeeKobo: 50000n, escrowFeeKobo: 25000n, commissionKobo: 0n, totalKobo: 2575000n,
      deliveryAddress: "1 Ada Customer Street, Ikeja, Lagos", contactName: a.name, contactPhone: a.phone ?? "08030000001",
      items: { create: [{ productId: product.id, quantity: 2, unitKobo: 1250000n, totalKobo: 2500000n, productName: product.name, imageUrl: "/products/demo3/computer-monitor.jpg" }] },
      statusEvents: { create: [{ to: "created", note: "Order placed" }, { to: "delivered", note: "Delivered to customer" }] }
    } });
    console.log(JSON.stringify({ orderId: order.id, customerA: a.id, customerB: b.id, productId: product.id }));
  } else {
    console.log(JSON.stringify({ orderId: existing.id, customerA: a.id, customerB: b.id, productId: product.id }));
  }
  await db.$disconnect();
})().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
