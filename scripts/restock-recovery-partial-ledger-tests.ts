/**
 * Focused recovery-observability tests for legacy order-level markers.
 *
 * Reproduces the reviewer finding where an order had a complete legacy marker,
 * one RESTORED ledger row, and a second item with no ledger row. The recovery
 * queue must still surface that order instead of treating any ledger presence
 * as complete. An ambiguous legacy marker (quantity mismatch) must not cause an
 * increment and must remain visible for reconciliation.
 *
 * Run with an explicit TEST_DATABASE_URL:
 *   TEST_DATABASE_URL=... npx tsx scripts/restock-recovery-partial-ledger-tests.ts
 */
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

const results: Array<{ name: string; status: "PASS" | "FAIL"; detail: string }> = [];
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
async function check(name: string, fn: () => Promise<string>) {
  try {
    const detail = await fn();
    results.push({ name, status: "PASS", detail });
    console.log(`PASS ${name} — ${detail}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, status: "FAIL", detail });
    console.error(`FAIL ${name} — ${detail}`);
  }
}

const runId = `RPL-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6)}`;

async function main() {
  const { requireTestDatabase } = await import("./lib/test-db-guard");
  const target = await requireTestDatabase({ denyList: ["naijadeals_review", "naijadeals_core", "naijadeals_live"] });
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL! } } });
  const { listRestockRecovery } = await import("../lib/payments/restock-recovery.service");
  const created = { users: [] as string[], vendorId: "", categoryId: "", productId: "", orderIds: [] as string[] };

  async function cleanup() {
    const orderIds = created.orderIds;
    await prisma.orderItemRestock.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => undefined);
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => undefined);
    await prisma.orderStatusEvent.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => undefined);
    await prisma.systemEvent.deleteMany({ where: { entityId: { in: orderIds } } }).catch(() => undefined);
    await prisma.auditLog.deleteMany({ where: { entityId: { in: orderIds } } }).catch(() => undefined);
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } }).catch(() => undefined);
    if (created.productId) {
      await prisma.inventoryStock.deleteMany({ where: { productId: created.productId } }).catch(() => undefined);
      await prisma.product.delete({ where: { id: created.productId } }).catch(() => undefined);
    }
    if (created.vendorId) await prisma.vendor.delete({ where: { id: created.vendorId } }).catch(() => undefined);
    if (created.categoryId) await prisma.category.delete({ where: { id: created.categoryId } }).catch(() => undefined);
    if (created.users.length) await prisma.user.deleteMany({ where: { id: { in: created.users } } }).catch(() => undefined);
  }

  try {
    const buyer = await prisma.user.create({
      data: { email: `${runId.toLowerCase()}-buyer@test.invalid`, name: `${runId} buyer`, actorType: "CUSTOMER" }
    });
    const owner = await prisma.user.create({
      data: { email: `${runId.toLowerCase()}-owner@test.invalid`, name: `${runId} owner`, actorType: "VENDOR" }
    });
    created.users.push(buyer.id, owner.id);
    const vendor = await prisma.vendor.create({
      data: {
        ownerId: owner.id,
        name: `${runId} vendor`,
        slug: `${runId.toLowerCase()}-vendor`,
        market: "Lagos",
        pickupAddress: "Run-owned recovery address",
        pickupPhone: "08000000000",
        status: "VERIFIED"
      }
    });
    created.vendorId = vendor.id;
    const category = await prisma.category.create({
      data: { name: `${runId} category`, slug: `${runId.toLowerCase()}-category` }
    });
    created.categoryId = category.id;
    const product = await prisma.product.create({
      data: {
        vendorId: vendor.id,
        categoryId: category.id,
        name: `${runId} product`,
        slug: `${runId.toLowerCase()}-product`,
        description: "Run-owned recovery-observability fixture.",
        priceKobo: 100000n,
        status: "ACTIVE",
        isSample: false,
        stock: { create: { quantity: 10, reserved: 0 } }
      }
    });
    created.productId = product.id;

    async function createOrder(label: string, quantity: number, markerQuantity: number) {
      const order = await prisma.order.create({
        data: {
          orderNumber: `${runId}-${label}`,
          customerId: buyer.id,
          vendorId: vendor.id,
          status: "refunded",
          paymentStatus: "refunded",
          subtotalKobo: 100000n,
          totalKobo: 100000n,
          deliveryAddress: "Run-owned recovery address",
          contactName: "Run-owned recovery",
          contactPhone: "08000000000",
          items: {
            create: [
              {
                productId: product.id,
                quantity,
                unitKobo: 100000n,
                totalKobo: 100000n,
                productName: product.name
              }
            ]
          }
        },
        include: { items: true }
      });
      created.orderIds.push(order.id);
      return { order, item: order.items[0] };
    }

    await check("a partial legacy ledger remains visible for reconciliation", async () => {
      const first = await createOrder("partial", 1, 1);
      await prisma.systemEvent.create({
        data: {
          type: "order.stock_restocked",
          entity: "Order",
          entityId: first.order.id,
          payload: {
            restoredItems: [
              { orderItemId: first.item.id, productId: product.id, variantId: null, quantity: 1 }
            ],
            suppressedItems: []
          }
        }
      });
      await prisma.orderItemRestock.create({
        data: {
          orderId: first.order.id,
          orderItemId: first.item.id,
          productId: product.id,
          quantity: 1,
          status: "RESTORED",
          attempts: 1,
          lastSource: "legacy-marker"
        }
      });
      // Add a second item with no ledger row: this is the partial state that
      // the previous filter hid because the order had *some* ledger rows.
      const secondItem = await prisma.orderItem.create({
        data: {
          orderId: first.order.id,
          productId: product.id,
          quantity: 1,
          unitKobo: 100000n,
          totalKobo: 100000n,
          productName: `${product.name} second item`
        }
      });
      const listing = await listRestockRecovery({ orderId: first.order.id, includeLegacyMarkers: true });
      assert(
        listing.legacyMarkerOrders.some((row) => row.orderId === first.order.id),
        `partial-ledger order missing: ${JSON.stringify(listing)}`
      );
      assert(listing.suppressions.length === 0, `unexpected suppression rows: ${listing.suppressions.length}`);
      return `order surfaced; second item ${secondItem.id} has no ledger row`;
    });

    await check("an ambiguous legacy marker is visible and not auto-restored", async () => {
      const ambiguous = await createOrder("ambiguous", 1, 2);
      await prisma.systemEvent.create({
        data: {
          type: "order.stock_restocked",
          entity: "Order",
          entityId: ambiguous.order.id,
          payload: {
            restoredItems: [
              { orderItemId: ambiguous.item.id, productId: product.id, variantId: null, quantity: 2 }
            ],
            suppressedItems: []
          }
        }
      });
      const before = await prisma.inventoryStock.findUniqueOrThrow({ where: { productId: product.id } });
      const { restockOrderItemsOnce } = await import("../lib/payments/service");
      const outcome = await restockOrderItemsOnce(prisma, ambiguous.order.id, {
        source: "manual",
        reason: "Run-owned ambiguous marker probe"
      });
      const after = await prisma.inventoryStock.findUniqueOrThrow({ where: { productId: product.id } });
      assert(outcome.restored === false, "ambiguous marker incremented stock");
      assert(outcome.legacyMarkerOnly === true, "ambiguous marker was not reported as legacyMarkerOnly");
      assert(before.quantity === after.quantity, `stock changed ${before.quantity} -> ${after.quantity}`);
      const listing = await listRestockRecovery({ orderId: ambiguous.order.id, includeLegacyMarkers: true });
      assert(
        listing.legacyMarkerOrders.some((row) => row.orderId === ambiguous.order.id),
        "ambiguous marker order is not visible for reconciliation"
      );
      return `legacyMarkerOnly=${outcome.legacyMarkerOnly}; stock ${before.quantity}->${after.quantity}`;
    });
  } finally {
    await cleanup();
    const leftovers = {
      orders: created.orderIds.length
        ? await prisma.order.count({ where: { id: { in: created.orderIds } } }).catch(() => -1)
        : 0,
      products: created.productId ? await prisma.product.count({ where: { id: created.productId } }).catch(() => -1) : 0,
      users: created.users.length ? await prisma.user.count({ where: { id: { in: created.users } } }).catch(() => -1) : 0
    };
    console.log(JSON.stringify({ database: target.databaseName, runId, results, leftovers }, null, 2));
    await prisma.$disconnect();
    if (results.some((row) => row.status === "FAIL") || leftovers.orders || leftovers.products || leftovers.users) {
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
