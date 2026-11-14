#!/usr/bin/env node
/**
 * REVIEW-only cross-market checkout acceptance.
 *
 * Proves the selected delivery market is a server-side boundary: a cart line
 * listed for Ghana cannot be converted into an order against a Nigerian
 * delivery address. The run uses its own customer, cart and product rows and
 * removes them in `finally`; the refusal happens before any order, payment,
 * wallet or stock write.
 *
 * Usage:
 *   DATABASE_URL=<review-url> npx tsx scripts/cross-market-checkout-test.ts
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { prisma } from "../lib/prisma";
import { checkout } from "../lib/services/core/checkout.service";

function fail(message: string): never {
  console.error(`FAIL ${message}`);
  process.exit(1);
}

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) fail("DATABASE_URL is required.");
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 8000 });
  await client.connect();
  const identity = await client.query<{ database: string }>("select current_database() as database");
  const database = identity.rows[0]?.database ?? "";
  if (database !== "naijadeals_review") fail(`refusing database ${database || "(unknown)"}`);
  const classification = await client
    .query<{ classification: string }>('select classification from "DatabaseClassification" limit 1')
    .catch(() => null);
  const labels = classification?.rows.map((row) => row.classification) ?? [];
  if (!labels.includes("REVIEW")) fail(`database ${database} is not classified REVIEW`);

  const marker = `xmarket-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
  let userId: string | null = null;
  let cartId: string | null = null;
  let productId: string | null = null;

  try {
    const category = await prisma.category.findFirst({
      where: { slug: "cookware-bakeware", isActive: true },
      select: { id: true, name: true }
    });
    const vendor = await prisma.vendor.findFirst({ where: { status: "VERIFIED" }, select: { id: true } });
    if (!category || !vendor) fail("canonical category or verified vendor is missing");

    const user = await prisma.user.create({
      data: { email: `${marker}@review.invalid`, name: `Cross-market ${marker}`, actorType: "CUSTOMER", countryCode: "NG" }
    });
    userId = user.id;
    const product = await prisma.product.create({
      data: {
        vendorId: vendor.id,
        categoryId: category.id,
        name: `Cross-market fixture ${marker}`,
        slug: marker,
        description: "Run-owned cross-market checkout fixture.",
        priceKobo: BigInt(250_000),
        countryCode: "GH",
        status: "ACTIVE",
        isSample: false
      }
    });
    productId = product.id;
    const cart = await prisma.cart.create({ data: { userId: user.id, status: "ACTIVE" } });
    cartId = cart.id;
    await prisma.cartItem.create({ data: { cartId: cart.id, productId: product.id, quantity: 1 } });

    let outcome: { status?: number; code?: string; message?: string } | null = null;
    try {
      await checkout({
        userId: user.id,
        address: {
          contactName: "Cross-market customer",
          contactPhone: "+2348000000000",
          countryCode: "NG",
          state: "Lagos",
          city: "Lagos",
          line1: "1 Boundary Way"
        }
      });
    } catch (error) {
      const known = error as { status?: number; code?: string; message?: string };
      outcome = { status: known.status, code: known.code, message: known.message };
    }

    if (!outcome) fail("cross-market checkout created an order instead of refusing");
    if (outcome.status !== 409 || outcome.code !== "item_market_mismatch") {
      fail(`expected 409 item_market_mismatch, got ${outcome.status} ${outcome.code}: ${outcome.message ?? ""}`);
    }

    const orders = await prisma.order.count({ where: { customerId: user.id } });
    if (orders !== 0) fail(`refused checkout left ${orders} order row(s)`);
    console.log(`PASS cross-market checkout refused (${outcome.code}) with 0 orders; run ${marker}`);
  } finally {
    try {
      if (cartId) {
        await prisma.cartItem.deleteMany({ where: { cartId } });
        await prisma.cart.delete({ where: { id: cartId } });
      }
      if (productId) await prisma.product.delete({ where: { id: productId } });
      if (userId) await prisma.user.delete({ where: { id: userId } });
    } catch (error) {
      console.error(`CLEANUP ${(error as Error).message}`);
    }
    await client.end().catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
