/**
 * Verifies durable search synchronisation and visibility enforcement.
 *
 *   npx tsx scripts/search-sync-verify.ts
 *
 * Uses a throwaway vendor, category and product, then removes them and their
 * index documents. Proves: a write creates a pending intent, the worker indexes
 * it, and suspending the product removes it from the index.
 */

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { markForIndex, processPendingSync } from "../lib/infra/search-sync";
import { deleteProducts, indexDocumentCount, searchProducts } from "../lib/infra/search";
import { closeCache } from "../lib/infra/cache";
import { closeQueues } from "../lib/infra/queue";

const runId = randomUUID().slice(0, 8);
const rows: { name: string; status: "PASS" | "FAIL"; detail: string }[] = [];

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

async function check(name: string, run: () => Promise<string>) {
  try {
    rows.push({ name, status: "PASS", detail: await run() });
  } catch (error) {
    rows.push({ name, status: "FAIL", detail: error instanceof Error ? error.message : String(error) });
  }
}

async function main() {
  const owner = await prisma.user.create({
    data: { email: `search-sync-${runId}@example.test`, name: "Search Sync Vendor", actorType: "VENDOR" }
  });
  const vendor = await prisma.vendor.create({
    data: {
      ownerId: owner.id,
      name: `Sync Vendor ${runId}`,
      slug: `sync-vendor-${runId}`,
      market: "Balogun",
      pickupAddress: "Balogun Market, Lagos",
      pickupPhone: "08012345678",
      status: "VERIFIED"
    }
  });
  const category = await prisma.category.create({
    data: { name: `Sync Category ${runId}`, slug: `sync-category-${runId}` }
  });
  const product = await prisma.product.create({
    data: {
      vendorId: vendor.id,
      categoryId: category.id,
      name: `Sync Probe Product ${runId}`,
      slug: `sync-probe-${runId}`,
      description: "Created and removed by scripts/search-sync-verify.ts",
      priceKobo: BigInt(250_000),
      status: "ACTIVE",
      stock: { create: { quantity: 4, reserved: 0 } }
    }
  });

  try {
    await check("product write creates a pending intent", async () => {
      await markForIndex({ entityType: "PRODUCT", entityId: product.id });
      const pending = await prisma.searchSyncEvent.findUnique({
        where: { dedupeKey: `PRODUCT:${product.id}` }
      });
      if (!pending || pending.processedAt !== null) throw new Error("no pending intent recorded");
      return `pending intent ${pending.id.slice(0, 8)}…`;
    });

    await check("worker indexes the active product", async () => {
      const result = await processPendingSync();
      assert(result.failed === 0, `${result.failed} sync(s) failed`);
      const found = await searchProducts(`Sync Probe Product ${runId}`, { limit: 5 });
      assert(found?.hits.some((hit) => hit.id === product.id), "product is not searchable after sync");
      return `indexed (${result.processed} processed, ${result.remaining} remaining)`;
    });

    await check("suspension removes the document from the index", async () => {
      await prisma.product.update({ where: { id: product.id }, data: { status: "SUSPENDED" } });
      await markForIndex({ entityType: "PRODUCT", entityId: product.id });
      await processPendingSync();
      const found = await searchProducts(`Sync Probe Product ${runId}`, { limit: 5 });
      assert(!(found?.hits ?? []).some((hit) => hit.id === product.id), "suspended product is still searchable");
      return "suspended product removed from search";
    });

    await check("reactivation restores the document", async () => {
      await prisma.product.update({ where: { id: product.id }, data: { status: "ACTIVE" } });
      await markForIndex({ entityType: "PRODUCT", entityId: product.id });
      await processPendingSync();
      const found = await searchProducts(`Sync Probe Product ${runId}`, { limit: 5 });
      assert(found?.hits.some((hit) => hit.id === product.id), "reactivated product is missing");
      const count = await indexDocumentCount();
      return `restored; index holds ${count} documents`;
    });
  } finally {
    await deleteProducts([product.id]).catch(() => undefined);
    await prisma.searchSyncEvent.deleteMany({ where: { entityId: product.id } }).catch(() => undefined);
    await prisma.inventoryStock.deleteMany({ where: { productId: product.id } }).catch(() => undefined);
    await prisma.product.deleteMany({ where: { id: product.id } }).catch(() => undefined);
    await prisma.category.deleteMany({ where: { id: category.id } }).catch(() => undefined);
    await prisma.vendor.deleteMany({ where: { id: vendor.id } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: owner.id } }).catch(() => undefined);
  }

  const width = Math.max(...rows.map((row) => row.name.length));
  for (const row of rows) console.log(`${row.status.padEnd(4)} ${row.name.padEnd(width)}  ${row.detail}`);
  const failed = rows.filter((row) => row.status === "FAIL").length;
  console.log(`\n${rows.length - failed} passed, ${failed} failed`);

  await closeQueues();
  await closeCache();
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (error) => {
  console.error("search sync verification crashed:", error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
