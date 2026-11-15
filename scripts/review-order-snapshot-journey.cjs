/**
 * REVIEW-only historical-order snapshot check: a dedicated fixture order keeps
 * its item snapshot readable after the product is unpublished. Deletes only its
 * own run-tagged order fixture; no real customer history is copied or removed.
 */
const fs = require("node:fs");
const { PrismaClient } = require("@prisma/client");
const { chromium } = require("playwright");

const BASE = process.env.REVIEW_BASE_URL || "http://localhost:3047";
const prisma = new PrismaClient();
const checks = [];
const check = (name, ok, detail = "") => checks.push({ name, ok, detail });

function credentials(path) {
  return fs.readFileSync(path, "utf8").trim().split(String.fromCharCode(10)).map((line) => line.trim());
}

(async () => {
  const rows = await prisma.$queryRaw`select classification from "DatabaseClassification" limit 1`;
  const classification = rows[0]?.classification;
  check("database is REVIEW", classification === "REVIEW", String(classification));
  if (classification !== "REVIEW") throw new Error("refusing: database is not classified REVIEW");

  const product = await prisma.product.findUnique({ where: { slug: "demo-10-inch-android-tablet" }, include: { images: true, vendor: true } });
  const customer = await prisma.user.findUnique({ where: { email: "review-customer@review.invalid" } });
  if (!product || !customer) throw new Error("missing REVIEW fixture product or customer");
  const runId = Date.now().toString(36);
  const snapshotName = `Historical snapshot ${runId}`;
  const order = await prisma.order.create({
    data: {
      orderNumber: `REVIEW-SNAP-${runId}`,
      customerId: customer.id,
      vendorId: product.vendorId,
      status: "created",
      subtotalKobo: product.priceKobo,
      totalKobo: product.priceKobo,
      deliveryAddress: "REVIEW fixture address",
      contactName: "REVIEW fixture",
      contactPhone: "+2340000000000",
      items: {
        create: {
          productId: product.id,
          quantity: 1,
          unitKobo: product.priceKobo,
          totalKobo: product.priceKobo,
          productName: snapshotName,
          imageUrl: product.images[0]?.url ?? null
        }
      }
    }
  });

  try {
    const [customerEmail, customerPassword] = credentials("qa-artifacts/review-basket/.credential");
    const [adminEmail, adminPassword] = credentials("qa-artifacts/review-basket/.admin-credential");
    const browser = await chromium.launch();

    const customerContext = await browser.newContext();
    const customerRequest = customerContext.request;
    await customerRequest.post(`${BASE}/api/auth/login`, { data: { email: customerEmail, password: customerPassword }, headers: { Origin: BASE } });
    const before = await customerRequest.get(`${BASE}/api/orders/${order.id}`);
    const beforeText = await before.text();
    check("order readable while published", before.status() === 200 && beforeText.includes(snapshotName), `status=${before.status()}`);

    const adminContext = await browser.newContext();
    const adminRequest = adminContext.request;
    await adminRequest.post(`${BASE}/api/auth/login`, { data: { email: adminEmail, password: adminPassword }, headers: { Origin: BASE } });
    const unpublish = await adminRequest.patch(`${BASE}/api/admin/catalogue/products`, {
      data: { id: product.id, action: "unpublish" }, headers: { Origin: BASE }
    });
    check("admin unpublishes product", unpublish.status() === 200, `status=${unpublish.status()}`);

    const publicAfter = await customerRequest.get(`${BASE}/product/${product.slug}`);
    check("unpublished product route is 404", publicAfter.status() === 404, `status=${publicAfter.status()}`);

    const after = await customerRequest.get(`${BASE}/api/orders/${order.id}`);
    const afterText = await after.text();
    check("order snapshot survives unpublishing", after.status() === 200 && afterText.includes(snapshotName) && afterText.includes(product.images[0]?.url ?? ""), `status=${after.status()}`);

    const republish = await adminRequest.patch(`${BASE}/api/admin/catalogue/products`, {
      data: { id: product.id, action: "publish" }, headers: { Origin: BASE }
    });
    check("product restored to ACTIVE", republish.status() === 200, `status=${republish.status()}`);
    const restored = await customerRequest.get(`${BASE}/product/${product.slug}`);
    check("restored product returns 200", restored.status() === 200, `status=${restored.status()}`);

    await browser.close();
  } finally {
    await prisma.orderItemRestock.deleteMany({ where: { orderId: order.id } });
    await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
    await prisma.order.delete({ where: { id: order.id } });
    const remaining = await prisma.order.count({ where: { orderNumber: `REVIEW-SNAP-${runId}` } });
    check("run-tagged order fixture removed", remaining === 0, `remaining=${remaining}`);
    await prisma.$disconnect();
  }

  const failed = checks.filter((entry) => !entry.ok);
  console.log(JSON.stringify({ checks, passed: checks.length - failed.length, total: checks.length }, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch(async (error) => {
  console.error("ORDER SNAPSHOT ERROR", error.message);
  await prisma.$disconnect();
  process.exit(2);
});
