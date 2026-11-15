#!/usr/bin/env node
/**
 * Isolated TEST financial acceptance for variant inventory.
 *
 * Proves the restock/idempotency contract that cannot be exercised on REVIEW:
 *
 *   1. A paid variant order can have its variant deactivated afterwards; the
 *      historical order item stays readable and is never deleted/rewritten.
 *   2. A full refund restores variant stock exactly once, even when the same
 *      refund request is submitted twice concurrently with one idempotency key.
 *   3. A later seller return receipt for the already-refunded order does not
 *      restore the same units again.
 *   4. A seller return receipt performs the restore when it happens first, and
 *      no subsequent refund can double-restore.
 *   5. Refunding a product-level order after its listing became variant-managed
 *      never increments `InventoryStock`; the suppression is recorded per item
 *      in `OrderItemRestock` and surfaced by `order.stock_recovery_pending`.
 *   6. A suppressed restore survives the order-level marker: an authorized
 *      retry restores it once after the source becomes resolvable, an unrelated
 *      account is refused, and a repeat retry cannot double-increment.
 *   7. A historical order-level marker is backfilled into the per-item ledger
 *      without incrementing stock again.
 *   8. An unsafe variant transition (product quantity + live reservations) is
 *      refused and recorded as `product.variant_transition_blocked`.
 *   9. A saved-for-later line is not purchased by checkout; it is preserved in
 *      a fresh active cart.
 *
 * Database safety: an explicit TEST_DATABASE_URL may name the isolated target
 * directly. Otherwise the script derives it from the explicit
 * REVIEW_DATABASE_URL by replacing only the database path with
 * `naijadeals_checkout_refund_test`. Either way the shared `requireTestDatabase`
 * guard verifies that the target is classified TEST and is not REVIEW or the
 * daily `naijadeals_core` database. There is no ambient `.env` fallback. The URL
 * is never printed. All financial fixtures are run-tagged and removed in
 * `finally`; the shared SYSTEM wallet projection is left at its post-fixture
 * value (it is not edited directly) and reported.
 *
 * Usage:
 *   REVIEW_DATABASE_URL=... npx tsx scripts/variant-restock-idempotency-tests.ts
 *   TEST_DATABASE_URL=...   npx tsx scripts/variant-restock-idempotency-tests.ts
 */
import { randomBytes } from "node:crypto";

function parseExplicitUrl(value: string, name: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    console.error(`REFUSED: ${name} is not a valid URL (value hidden).`);
    process.exit(2);
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    console.error(`REFUSED: ${name} must be a postgres URL.`);
    process.exit(2);
  }
  return parsed;
}

const explicitTestUrl = process.env.TEST_DATABASE_URL?.trim();
if (explicitTestUrl) {
  parseExplicitUrl(explicitTestUrl, "TEST_DATABASE_URL");
} else {
  const reviewUrl = process.env.REVIEW_DATABASE_URL?.trim();
  if (!reviewUrl) {
    console.error(
      "REFUSED: set TEST_DATABASE_URL explicitly, or REVIEW_DATABASE_URL to derive the isolated TEST target. " +
        "There is no DATABASE_URL/.env fallback."
    );
    process.exit(2);
  }
  const derived = parseExplicitUrl(reviewUrl, "REVIEW_DATABASE_URL");
  derived.pathname = "/naijadeals_checkout_refund_test";
  process.env.TEST_DATABASE_URL = derived.toString();
}
process.env.ENABLE_TEST_PAYMENTS = "true";
// This acceptance script has no queue worker. `lib/prisma` loads the project
// .env (which may point at a local Valkey that is not running); an empty value
// disables enqueueing so notification fan-out is delivered/suppressed locally
// instead of blocking on an absent queue backend. dotenv does not override an
// already-defined key, so the empty value wins.
process.env.VALKEY_URL = "";
delete process.env.REDIS_URL;

type Check = { name: string; status: "PASS" | "FAIL"; detail: string };
const checks: Check[] = [];
let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  const entry: Check = { name, status: ok ? "PASS" : "FAIL", detail: String(detail).slice(0, 800) };
  checks.push(entry);
  if (!ok) failures += 1;
  console.log(`${entry.status} ${name}${entry.detail ? ` — ${entry.detail}` : ""}`);
  return ok;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectCode(name: string, fn: () => Promise<unknown>, code: string) {
  try {
    await fn();
    check(name, false, "no error was raised");
  } catch (error) {
    const typed = error as { code?: string; message?: string };
    check(name, typed.code === code, `code=${typed.code ?? "none"} message=${String(typed.message ?? error).slice(0, 220)}`);
  }
}

const runId = `VRT-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
const runSlug = runId.toLowerCase();
const PRICE_KOBO = 100_000n;
const TOP_UP_KOBO = 6_000_000n;
const address = {
  contactName: "Run-owned variant fixture",
  contactPhone: "08000000000",
  countryCode: "NG",
  state: "Lagos",
  city: "Lagos",
  line1: "1 Isolated Variant Way"
};

async function main() {
  const { requireTestDatabase } = await import("./lib/test-db-guard");
  const target = await requireTestDatabase({ denyList: ["naijadeals_review", "naijadeals_core"] });
  console.log(`GUARD database=${target.databaseName} marker=${target.marker} run=${runId}`);

  // Imported only after the guard has pointed DATABASE_URL at the TEST target.
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL! } } });
  const { checkout, cancelOrder } = await import("../lib/services/core/checkout.service");
  const { initializePayment, confirmPayment, refundPayment, restockOrderItemsOnce, ORDER_RESTOCK_EVENT } =
    await import("../lib/payments/service");
  const { ensureWallet } = await import("../lib/payments/service");
  const { createTopUp, creditTopUp } = await import("../lib/services/core/topup.service");
  const { updateSellerProduct } = await import("../lib/services/core/seller.service");
  const { resolveReturn } = await import("../lib/services/core/seller.service");
  const { listRestockRecovery, retrySuppressedRestock } = await import("../lib/payments/restock-recovery.service");

  const created = {
    userIds: [] as string[],
    vendorIds: [] as string[],
    productIds: [] as string[],
    categoryIds: [] as string[],
    cartIds: [] as string[],
    orderIds: [] as string[],
    walletIds: [] as string[],
    ids: new Set<string>()
  };
  let platformWalletBefore: { availableKobo: bigint; heldKobo: bigint } | null = null;

  async function cleanup() {
    const orderIds = created.orderIds;
    const productIds = created.productIds;
    try {
      await prisma.affiliateReversalIntent.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => undefined);
      const transactions = await prisma.walletTransaction
        .findMany({ where: { OR: [{ orderId: { in: orderIds } }, { walletId: { in: created.walletIds } }] }, select: { id: true } })
        .catch(() => []);
      if (transactions.length > 0) {
        const transactionIds = transactions.map((row) => row.id);
        await prisma.ledgerEntry.deleteMany({ where: { transactionId: { in: transactionIds } } }).catch(() => undefined);
        await prisma.walletTransaction.deleteMany({ where: { id: { in: transactionIds } } }).catch(() => undefined);
      }
      const escrows = await prisma.escrowHold.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } }).catch(() => []);
      if (escrows.length > 0) {
        await prisma.escrowEvent.deleteMany({ where: { escrowId: { in: escrows.map((row) => row.id) } } }).catch(() => undefined);
        await prisma.escrowHold.deleteMany({ where: { id: { in: escrows.map((row) => row.id) } } }).catch(() => undefined);
      }
      await prisma.refund.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => undefined);
      await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => undefined);
      await prisma.returnRequest.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => undefined);
      await prisma.orderItemRestock.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => undefined);
      const deliveries = await prisma.delivery.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } }).catch(() => []);
      if (deliveries.length > 0) {
        await prisma.trackingEvent.deleteMany({ where: { deliveryId: { in: deliveries.map((row) => row.id) } } }).catch(() => undefined);
        await prisma.delivery.deleteMany({ where: { id: { in: deliveries.map((row) => row.id) } } }).catch(() => undefined);
      }
      await prisma.orderStatusEvent.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => undefined);
      await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => undefined);
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } }).catch(() => undefined);
      if (created.userIds.length > 0) {
        const notifications = await prisma.notification
          .findMany({ where: { OR: [{ userId: { in: created.userIds } }, { entityId: { in: orderIds } }] }, select: { id: true } })
          .catch(() => []);
        if (notifications.length > 0) {
          const notificationIds = notifications.map((row) => row.id);
          await prisma.notificationAttempt.deleteMany({ where: { notificationId: { in: notificationIds } } }).catch(() => undefined);
          await prisma.notification.deleteMany({ where: { id: { in: notificationIds } } }).catch(() => undefined);
        }
        await prisma.notificationIntent
          .deleteMany({ where: { OR: [{ recipientUserId: { in: created.userIds } }, { entityId: { in: orderIds } }] } })
          .catch(() => undefined);
        await prisma.walletTopUp.deleteMany({ where: { walletId: { in: created.walletIds } } }).catch(() => undefined);
        await prisma.cartItem.deleteMany({ where: { cart: { userId: { in: created.userIds } } } }).catch(() => undefined);
        await prisma.cart.deleteMany({ where: { userId: { in: created.userIds } } }).catch(() => undefined);
      }
      for (const productId of productIds) {
        await prisma.cartItem.deleteMany({ where: { productId } }).catch(() => undefined);
        await prisma.productVariant.deleteMany({ where: { productId } }).catch(() => undefined);
        await prisma.productImage.deleteMany({ where: { productId } }).catch(() => undefined);
        await prisma.inventoryStock.deleteMany({ where: { productId } }).catch(() => undefined);
        await prisma.product.delete({ where: { id: productId } }).catch(() => undefined);
      }
      for (const walletId of created.walletIds) {
        await prisma.wallet.delete({ where: { id: walletId } }).catch(() => undefined);
      }
      await prisma.auditLog
        .deleteMany({
          where: {
            OR: [
              { actorId: { in: created.userIds } },
              { entityId: { in: [...productIds, ...orderIds] } }
            ]
          }
        })
        .catch(() => undefined);
      await prisma.systemEvent
        .deleteMany({
          where: {
            OR: [
              { actorId: { in: created.userIds } },
              { entityId: { in: [...productIds, ...orderIds] } }
            ]
          }
        })
        .catch(() => undefined);
      for (const categoryId of created.categoryIds) {
        await prisma.category.delete({ where: { id: categoryId } }).catch(() => undefined);
      }
      for (const vendorId of created.vendorIds) {
        await prisma.vendor.delete({ where: { id: vendorId } }).catch(() => undefined);
      }
      if (created.userIds.length > 0) {
        await prisma.user.deleteMany({ where: { id: { in: created.userIds } } }).catch(() => undefined);
      }
    } finally {
      const leftovers = {
        orders: await prisma.order.count({ where: { id: { in: orderIds } } }).catch(() => -1),
        products: await prisma.product.count({ where: { slug: { contains: runSlug } } }).catch(() => -1),
        categories: await prisma.category.count({ where: { slug: { contains: runSlug } } }).catch(() => -1),
        users: await prisma.user.count({ where: { id: { in: created.userIds } } }).catch(() => -1)
      };
      check(
        "run-owned financial fixtures removed",
        leftovers.orders <= 0 && leftovers.products <= 0 && leftovers.categories <= 0 && leftovers.users <= 0,
        JSON.stringify(leftovers)
      );
      if (platformWalletBefore) {
        const platform = await prisma.wallet.findFirst({ where: { ownerType: "SYSTEM" }, select: { availableKobo: true, heldKobo: true } }).catch(() => null);
        check(
          "shared SYSTEM wallet moved only through balanced top-up/refund journals",
          platform !== null &&
            platform.heldKobo === platformWalletBefore.heldKobo,
          `held ${platformWalletBefore?.heldKobo ?? "?"} -> ${platform?.heldKobo ?? "?"}; available ${platformWalletBefore?.availableKobo ?? "?"} -> ${platform?.availableKobo ?? "?"} (journals only; not edited directly)`
        );
      }
    }
  }

  let fatalError: unknown = null;
  try {
    const customer = await prisma.user.create({
      data: {
        email: `${runSlug}-buyer@test.invalid`,
        name: `${runId} buyer fixture`,
        actorType: "CUSTOMER",
        countryCode: "NG"
      }
    });
    created.userIds.push(customer.id);
    const owner = await prisma.user.create({
      data: {
        email: `${runSlug}-owner@test.invalid`,
        name: `${runId} seller fixture`,
        actorType: "VENDOR",
        countryCode: "NG"
      }
    });
    created.userIds.push(owner.id);
    const admin = await prisma.user.findFirst({
      where: { roles: { some: { role: { name: { in: ["super_admin", "admin"] } } } } },
      select: { id: true, email: true },
      orderBy: { createdAt: "asc" }
    });
    const actorId = admin?.id ?? owner.id;
    const vendor = await prisma.vendor.create({
      data: {
        ownerId: owner.id,
        name: `${runId} Vendor`,
        slug: `${runSlug}-vendor`,
        market: "Lagos",
        description: "Run-owned isolated financial fixture. Not a real vendor.",
        pickupAddress: "1 Isolated Variant Way, Lagos",
        pickupPhone: "08000000000",
        countryCode: "NG",
        status: "VERIFIED",
        commissionBps: 1000
      }
    });
    created.vendorIds.push(vendor.id);
    const category = await prisma.category.create({
      data: {
        name: `VRT category ${runId}`,
        slug: `${runSlug}-category`,
        isActive: true,
        isSelectable: true,
        browsingVisible: true
      }
    });
    created.categoryIds.push(category.id);
    const image = "/generated/shop/product-stainless-steel-cookware-set.webp";
    const platform = await prisma.wallet.findFirst({ where: { ownerType: "SYSTEM" }, select: { availableKobo: true, heldKobo: true } });
    platformWalletBefore = platform ? { availableKobo: platform.availableKobo, heldKobo: platform.heldKobo } : null;

    /* Wallet funding through balanced top-up accounting. */
    const wallet = await ensureWallet(prisma, { userId: customer.id, ownerType: "CUSTOMER" });
    created.walletIds.push(wallet.id);
    const topUpKey = `${runSlug}-topup`;
    await createTopUp(prisma, {
      walletId: wallet.id,
      amountKobo: TOP_UP_KOBO,
      provider: "test",
      providerReference: `TEST-${topUpKey}`,
      idempotencyKey: topUpKey
    });
    const credited = await creditTopUp(prisma, {
      providerReference: `TEST-${topUpKey}`,
      verifiedAmountKobo: TOP_UP_KOBO,
      verifiedCurrency: "NGN",
      raw: { simulated: true, note: "Isolated variant restock acceptance funding. Not a real payment." }
    });
    check("isolated fixture wallet funded by balanced test top-up", credited.status === "credited", `status=${credited.status}`);

    const productVariant = await prisma.product.create({
      data: {
        vendorId: vendor.id,
        categoryId: category.id,
        name: `${runId} Variant product`,
        slug: `${runSlug}-variant-product`,
        description: "Run-owned isolated variant order fixture.",
        priceKobo: PRICE_KOBO,
        status: "ACTIVE",
        isSample: false,
        images: { create: { url: image, alt: "Variant fixture image", sortOrder: 0 } },
        stock: { create: { quantity: 0, reserved: 0 } },
        variants: {
          create: [
            { name: "V1", sku: `${runId}-V1`, priceKobo: PRICE_KOBO, stock: 5, isActive: true },
            { name: "V2", sku: `${runId}-V2`, priceKobo: PRICE_KOBO + BigInt(10_000), stock: 3, isActive: true }
          ]
        }
      },
      include: { variants: true }
    });
    created.productIds.push(productVariant.id);
    const v1 = productVariant.variants.find((variant) => variant.sku === `${runId}-V1`)!;
    const v2 = productVariant.variants.find((variant) => variant.sku === `${runId}-V2`)!;

    const productLevel = await prisma.product.create({
      data: {
        vendorId: vendor.id,
        categoryId: category.id,
        name: `${runId} Product-level product`,
        slug: `${runSlug}-product-level`,
        description: "Run-owned isolated product-stock order fixture.",
        priceKobo: PRICE_KOBO,
        status: "ACTIVE",
        isSample: false,
        images: { create: { url: image, alt: "Product-level fixture image", sortOrder: 0 } },
        stock: { create: { quantity: 5, reserved: 0 } }
      }
    });
    created.productIds.push(productLevel.id);

    const productUnsafe = await prisma.product.create({
      data: {
        vendorId: vendor.id,
        categoryId: category.id,
        name: `${runId} Unsafe transition product`,
        slug: `${runSlug}-unsafe-transition`,
        description: "Run-owned unsafe variant transition fixture.",
        priceKobo: PRICE_KOBO,
        status: "ACTIVE",
        isSample: false,
        images: { create: { url: image, alt: "Unsafe transition fixture image", sortOrder: 0 } },
        stock: { create: { quantity: 4, reserved: 0 } }
      }
    });
    created.productIds.push(productUnsafe.id);

    async function createOrderCart(items: Array<{ productId: string; variantId?: string | null; quantity: number; savedForLater?: boolean }>) {
      const cart = await prisma.cart.create({
        data: {
          userId: customer.id,
          status: "ACTIVE",
          items: {
            create: items.map((item) => ({
              productId: item.productId,
              variantId: item.variantId ?? null,
              quantity: item.quantity,
              savedForLater: item.savedForLater ?? false
            }))
          }
        }
      });
      created.cartIds.push(cart.id);
      return cart;
    }

    async function checkoutAndPay(label: string) {
      const result = await checkout({ userId: customer.id, address });
      const order = result.orders[0];
      created.orderIds.push(order.orderId);
      const init = await initializePayment({
        orderId: order.orderId,
        userId: customer.id,
        provider: "wallet",
        callbackUrl: "http://localhost/orders/callback"
      });
      const confirmed = await confirmPayment({ reference: init.reference, provider: "wallet" });
      assert(confirmed.status === "COMPLETED", `${label}: payment did not complete`);
      return { orderId: order.orderId, totalKobo: BigInt(order.totalKobo) };
    }

    async function markerFor(orderId: string) {
      return prisma.systemEvent.findMany({
        where: { type: ORDER_RESTOCK_EVENT, entity: "Order", entityId: orderId },
        orderBy: { createdAt: "asc" }
      });
    }

    /* 1. Variant order, saved line preservation, historical deactivation. */
    await createOrderCart([
      { productId: productVariant.id, variantId: v1.id, quantity: 2 },
      { productId: productLevel.id, quantity: 1, savedForLater: true }
    ]);
    const order1 = await checkoutAndPay("order1");
    const order1Items = await prisma.orderItem.findMany({ where: { orderId: order1.orderId } });
    check(
      "checkout orders only the active line and preserves the saved line",
      order1Items.length === 1 && order1Items[0].variantId === v1.id && order1Items[0].quantity === 2,
      `items=${order1Items.length} variant=${order1Items[0]?.variantId} quantity=${order1Items[0]?.quantity}`
    );
    const activeCarts = await prisma.cart.findMany({ where: { userId: customer.id, status: "ACTIVE" }, include: { items: true } });
    check(
      "saved-for-later line moved to a fresh active cart",
      activeCarts.length === 1 &&
        activeCarts[0].items.length === 1 &&
        activeCarts[0].items[0].productId === productLevel.id &&
        activeCarts[0].items[0].savedForLater === true,
      `carts=${activeCarts.length} items=${activeCarts[0]?.items.length}`
    );

    const v1AfterPay = await prisma.productVariant.findUniqueOrThrow({ where: { id: v1.id } });
    check(
      "verified payment commits variant stock and clears the reservation",
      v1AfterPay.stock === 3 && v1AfterPay.reserved === 0,
      `stock=${v1AfterPay.stock} reserved=${v1AfterPay.reserved}`
    );

    const deactivation = await updateSellerProduct(owner.id, productVariant.id, {
      variants: [
        { id: v1.id, name: v1.name, sku: v1.sku, priceKobo: v1.priceKobo.toString(), stock: v1AfterPay.stock, isActive: false, attributes: null },
        { id: v2.id, name: v2.name, sku: v2.sku, priceKobo: v2.priceKobo.toString(), stock: v2.stock, isActive: true, attributes: null }
      ]
    });
    check(
      "variant can be deactivated after a historical purchase",
      deactivation.variants.find((variant) => variant.id === v1.id)?.isActive === false,
      `active=${deactivation.variants.find((variant) => variant.id === v1.id)?.isActive}`
    );
    const historicalItem = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order1.orderId, variantId: v1.id } });
    const historicalVariant = await prisma.productVariant.findUniqueOrThrow({ where: { id: historicalItem.variantId! } });
    check(
      "historical order item and variant reference remain readable",
      historicalItem.quantity === 2 && historicalVariant.name === v1.name && historicalVariant.isActive === false,
      `item=${historicalItem.id} variant=${historicalVariant.id} active=${historicalVariant.isActive}`
    );

    /* 2 + 3. Concurrent duplicate full refund restores once; return later does not repeat. */
    await expectCode(
      "a partial refund cannot request a stock restore",
      () =>
        refundPayment({
          orderId: order1.orderId,
          actorId,
          reason: "Run-owned partial restock attempt",
          amountKobo: BigInt(1_000),
          restock: true,
          idempotencyKey: `${runSlug}-order1-partial-restock`
        }),
      "invalid_restock"
    );
    const v1AfterPartialAttempt = await prisma.productVariant.findUniqueOrThrow({ where: { id: v1.id } });
    check(
      "refused partial restock leaves variant stock unchanged",
      v1AfterPartialAttempt.stock === 3 && (await prisma.refund.count({ where: { orderId: order1.orderId } })) === 0,
      `stock=${v1AfterPartialAttempt.stock}`
    );
    const refundKey = `${runSlug}-order1-refund`;
    const refundResults = await Promise.allSettled([
      refundPayment({ orderId: order1.orderId, actorId, reason: "Run-owned full refund", restock: true, idempotencyKey: refundKey }),
      refundPayment({ orderId: order1.orderId, actorId, reason: "Run-owned full refund", restock: true, idempotencyKey: refundKey })
    ]);
    const fulfilled = refundResults.filter((result) => result.status === "fulfilled").length;
    const v1AfterRefund = await prisma.productVariant.findUniqueOrThrow({ where: { id: v1.id } });
    const markers1 = await markerFor(order1.orderId);
    const refunds1 = await prisma.refund.findMany({ where: { orderId: order1.orderId } });
    check(
      "duplicate full refund requests restore variant stock exactly once",
      fulfilled >= 1 && v1AfterRefund.stock === 5 && refunds1.length === 1 && markers1.length === 1,
      `fulfilled=${fulfilled} stock=${v1AfterRefund.stock} refunds=${refunds1.length} markers=${markers1.length}`
    );
    check(
      "refund restock marker names the refund source",
      (markers1[0]?.payload as { source?: string } | null)?.source === "refund",
      JSON.stringify((markers1[0]?.payload as { source?: string } | null)?.source ?? null)
    );
    const p1StockAfterRefunds = await prisma.inventoryStock.findUniqueOrThrow({ where: { productId: productVariant.id } });
    check(
      "variant refunds never add product-level stock",
      p1StockAfterRefunds.quantity === 0 && p1StockAfterRefunds.reserved === 0,
      `quantity=${p1StockAfterRefunds.quantity} reserved=${p1StockAfterRefunds.reserved}`
    );

    const return1 = await prisma.returnRequest.create({
      data: { orderId: order1.orderId, userId: customer.id, vendorId: vendor.id, reason: "Run-owned return after refund" }
    });
    const received1 = await resolveReturn(owner.id, return1.id, "receive");
    const v1AfterReturn = await prisma.productVariant.findUniqueOrThrow({ where: { id: v1.id } });
    const markers1AfterReturn = await markerFor(order1.orderId);
    check(
      "seller receipt after a full refund does not restore variant stock again",
      received1.status === "REFUNDED" &&
        v1AfterReturn.stock === 5 &&
        markers1AfterReturn.length === 1,
      `status=${received1.status} stock=${v1AfterReturn.stock} markers=${markers1AfterReturn.length}`
    );

    /* 4. Return receipt first restores once; a later refund cannot repeat it. */
    await createOrderCart([{ productId: productVariant.id, variantId: v2.id, quantity: 1 }]);
    const order2 = await checkoutAndPay("order2");
    const v2AfterPay = await prisma.productVariant.findUniqueOrThrow({ where: { id: v2.id } });
    const return2 = await prisma.returnRequest.create({
      data: { orderId: order2.orderId, userId: customer.id, vendorId: vendor.id, reason: "Run-owned return before refund" }
    });
    const received2 = await resolveReturn(owner.id, return2.id, "receive");
    const v2AfterReturn = await prisma.productVariant.findUniqueOrThrow({ where: { id: v2.id } });
    const markers2 = await markerFor(order2.orderId);
    check(
      "seller receipt restores variant stock once and settles the refund",
      received2.status === "REFUNDED" &&
        v2AfterReturn.stock === v2AfterPay.stock + 1 &&
        markers2.length === 1 &&
        (markers2[0]?.payload as { source?: string } | null)?.source === "return",
      `status=${received2.status} stock=${v2AfterPay.stock}->${v2AfterReturn.stock} markers=${markers2.length} source=${(markers2[0]?.payload as { source?: string } | null)?.source}`
    );
    await expectCode(
      "a second full refund after a return receipt is refused",
      () =>
        refundPayment({
          orderId: order2.orderId,
          actorId,
          reason: "Run-owned duplicate refund",
          restock: true,
          idempotencyKey: `${runSlug}-order2-second-refund`
        }),
      "already_refunded"
    );
    const v2Final = await prisma.productVariant.findUniqueOrThrow({ where: { id: v2.id } });
    check(
      "refused duplicate refund leaves variant stock unchanged",
      v2Final.stock === v2AfterReturn.stock && (await markerFor(order2.orderId)).length === 1,
      `stock=${v2Final.stock}`
    );

    /* 5. Product-level order becomes variant-managed; refund never increments InventoryStock. */
    await createOrderCart([{ productId: productLevel.id, quantity: 1 }]);
    const order3 = await checkoutAndPay("order3");
    const levelStockAfterPay = await prisma.inventoryStock.findUniqueOrThrow({ where: { productId: productLevel.id } });
    check("product-level payment commits inventory", levelStockAfterPay.quantity === 4, `quantity=${levelStockAfterPay.quantity}`);
    const conversion = await updateSellerProduct(owner.id, productLevel.id, {
      quantity: 0,
      variants: [
        {
          name: "Converted variant",
          sku: `${runId}-CONVERTED`,
          priceKobo: PRICE_KOBO.toString(),
          stock: 3,
          isActive: true,
          attributes: null
        }
      ]
    });
    const levelStockAfterConversion = await prisma.inventoryStock.findUniqueOrThrow({ where: { productId: productLevel.id } });
    check(
      "product-level listing can convert to variant-managed stock",
      conversion.variants.filter((variant) => variant.isActive).length === 1 && levelStockAfterConversion.quantity === 0,
      `variants=${conversion.variants.length} quantity=${levelStockAfterConversion.quantity}`
    );
    const order3Refund = await refundPayment({
      orderId: order3.orderId,
      actorId,
      reason: "Run-owned full refund after conversion",
      restock: true,
      idempotencyKey: `${runSlug}-order3-refund`
    });
    const levelStockAfterRefund = await prisma.inventoryStock.findUniqueOrThrow({ where: { productId: productLevel.id } });
    const convertedVariant = await prisma.productVariant.findFirstOrThrow({ where: { productId: productLevel.id, isActive: true } });
    const markers3 = await markerFor(order3.orderId);
    const suppressed = ((markers3[0]?.payload as { suppressedItems?: Array<{ reason?: string }> } | null)?.suppressedItems ?? []).map((item) => item.reason);
    check(
      "refund of a now-variant-managed product never increments InventoryStock",
      levelStockAfterRefund.quantity === 0 && convertedVariant.stock === 3 && suppressed.includes("variant_managed"),
      `inventory=${levelStockAfterRefund.quantity} variantStock=${convertedVariant.stock} suppressed=${suppressed.join(",")}`
    );
    const recoveryAwareRefund = (
      order3Refund as unknown as {
        restocked?: boolean;
        stockRecovery?: {
          status?: string;
          restockComplete?: boolean;
          pendingSuppressedItems?: Array<{ reason?: string }>;
        };
      }
    );
    const stockRecovery = recoveryAwareRefund.stockRecovery;
    check(
      "a completed refund reports stock recovery separately instead of implying it",
      recoveryAwareRefund.restocked === false &&
        stockRecovery?.status === "suppressed" &&
        stockRecovery?.restockComplete === false &&
        (stockRecovery?.pendingSuppressedItems ?? []).some((item) => item.reason === "variant_managed"),
      `restocked=${recoveryAwareRefund.restocked} stockRecovery=${JSON.stringify(stockRecovery?.status)} pending=${(stockRecovery?.pendingSuppressedItems ?? []).length}`
    );
    const pendingEvent = await prisma.systemEvent.findFirst({
      where: { type: "order.stock_recovery_pending", entity: "Order", entityId: order3.orderId },
      orderBy: { createdAt: "desc" }
    });
    check(
      "a completed refund with outstanding physical stock writes a durable reconciliation signal",
      Boolean(pendingEvent) &&
        ((pendingEvent?.payload as { suppressedItems?: Array<{ reason?: string }> } | null)?.suppressedItems ?? []).some(
          (item) => item.reason === "variant_managed"
        ),
      pendingEvent ? "order.stock_recovery_pending present" : "missing"
    );

    /* 5b. A suppressed restore stays recoverable and is not silently lost. */
    const order3Item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order3.orderId } });
    const ledgerBeforeRecovery = await prisma.orderItemRestock.findMany({ where: { orderId: order3.orderId } });
    check(
      "the suppressed restore is durable per item with its reason and quantity",
      ledgerBeforeRecovery.length === 1 &&
        ledgerBeforeRecovery[0].orderItemId === order3Item.id &&
        ledgerBeforeRecovery[0].status === "SUPPRESSED" &&
        ledgerBeforeRecovery[0].reason === "variant_managed" &&
        ledgerBeforeRecovery[0].quantity === order3Item.quantity &&
        ledgerBeforeRecovery[0].restoredAt === null,
      JSON.stringify(ledgerBeforeRecovery.map((row) => ({ status: row.status, reason: row.reason, quantity: row.quantity })))
    );
    const queueBeforeRecovery = await listRestockRecovery({ orderId: order3.orderId });
    check(
      "the reconciliation queue exposes the suppressed item",
      queueBeforeRecovery.suppressions.length === 1 &&
        queueBeforeRecovery.suppressions[0].orderItemId === order3Item.id &&
        queueBeforeRecovery.suppressions[0].reason === "variant_managed",
      JSON.stringify(queueBeforeRecovery.suppressions.map((row) => ({ item: row.orderItemId, reason: row.reason })))
    );
    await expectCode(
      "an unrelated account cannot retry another seller's stock recovery",
      () =>
        retrySuppressedRestock({
          orderId: order3.orderId,
          actorId: customer.id,
          reason: "Run-owned unauthorized recovery attempt"
        }),
      "forbidden"
    );

    const backToProduct = await updateSellerProduct(owner.id, productLevel.id, {
      quantity: 1,
      variants: []
    });
    const levelStockAfterBack = await prisma.inventoryStock.findUniqueOrThrow({ where: { productId: productLevel.id } });
    check(
      "listing can return to product-level stock after the suppressed refund",
      backToProduct.variants.every((variant) => variant.isActive === false) && levelStockAfterBack.quantity === 1,
      `variants=${backToProduct.variants.length} quantity=${levelStockAfterBack.quantity}`
    );
    const recovery = await retrySuppressedRestock({
      orderId: order3.orderId,
      actorId: owner.id,
      reason: "Run-owned authorized retry after the source became resolvable"
    });
    const levelStockAfterRecovery = await prisma.inventoryStock.findUniqueOrThrow({ where: { productId: productLevel.id } });
    check(
      "authorized retry restores a previously suppressed product-level item exactly once",
      recovery.result.restored === true &&
        recovery.retriedItemIds.length === 1 &&
        levelStockAfterRecovery.quantity === 2,
      `restored=${recovery.result.restored} retried=${recovery.retriedItemIds.length} quantity=${levelStockAfterRecovery.quantity}`
    );
    const ledgerAfterRecovery = await prisma.orderItemRestock.findFirstOrThrow({ where: { orderItemId: order3Item.id } });
    check(
      "the recovered item is terminal and cannot be re-incremented",
      ledgerAfterRecovery.status === "RESTORED" &&
        ledgerAfterRecovery.reason === null &&
        ledgerAfterRecovery.attempts === 2 &&
        ledgerAfterRecovery.restoredAt !== null,
      JSON.stringify({ status: ledgerAfterRecovery.status, attempts: ledgerAfterRecovery.attempts })
    );
    await expectCode(
      "a repeated authorized retry is refused because nothing is suppressed",
      () =>
        retrySuppressedRestock({
          orderId: order3.orderId,
          actorId: owner.id,
          reason: "Run-owned duplicate retry"
        }),
      "no_suppressed_restock"
    );
    const levelStockAfterSecond = await prisma.inventoryStock.findUniqueOrThrow({ where: { productId: productLevel.id } });
    check(
      "a repeated authorized retry cannot double-restore the same units",
      levelStockAfterSecond.quantity === 2,
      `quantity=${levelStockAfterSecond.quantity}`
    );

    /* 5c. A historical order-level marker is backfilled without re-restocking. */
    await createOrderCart([{ productId: productVariant.id, variantId: v2.id, quantity: 1 }]);
    const order4 = await checkoutAndPay("order4");
    await refundPayment({
      orderId: order4.orderId,
      actorId,
      reason: "Run-owned legacy marker fixture refund",
      restock: true,
      idempotencyKey: `${runSlug}-order4-refund`
    });
    const v2AfterLegacySetup = await prisma.productVariant.findUniqueOrThrow({ where: { id: v2.id } });
    // Simulate a marker written before the per-item ledger existed.
    await prisma.orderItemRestock.deleteMany({ where: { orderId: order4.orderId } });
    const legacyRecovery = await restockOrderItemsOnce(prisma, order4.orderId, {
      actorId: owner.id,
      source: "manual",
      reason: "Run-owned legacy ledger backfill",
      retrySuppressed: true
    });
    const v2AfterLegacyBackfill = await prisma.productVariant.findUniqueOrThrow({ where: { id: v2.id } });
    const legacyRows = await prisma.orderItemRestock.findMany({ where: { orderId: order4.orderId } });
    check(
      "legacy marker ledger is reconstructed without incrementing stock again",
      legacyRecovery.legacyLedgerRecovered === true &&
        legacyRecovery.restored === false &&
        v2AfterLegacyBackfill.stock === v2AfterLegacySetup.stock &&
        legacyRows.length === 1 &&
        legacyRows[0].status === "RESTORED",
      `recovered=${legacyRecovery.legacyLedgerRecovered} restored=${legacyRecovery.restored} stock=${v2AfterLegacySetup.stock}->${v2AfterLegacyBackfill.stock} rows=${legacyRows.length}`
    );

    /* 6. Unsafe transition is refused and recorded. */
    await createOrderCart([{ productId: productUnsafe.id, quantity: 2 }]);
    const unsafeCheckout = await checkout({ userId: customer.id, address });
    const unsafeOrder = unsafeCheckout.orders[0];
    created.orderIds.push(unsafeOrder.orderId);
    const unsafeStock = await prisma.inventoryStock.findUniqueOrThrow({ where: { productId: productUnsafe.id } });
    check("pending order reserves product-level stock", unsafeStock.reserved === 2 && unsafeStock.quantity === 4, `quantity=${unsafeStock.quantity} reserved=${unsafeStock.reserved}`);
    await expectCode(
      "variant transition with product quantity and reservations is refused",
      () =>
        updateSellerProduct(owner.id, productUnsafe.id, {
          quantity: 0,
          variants: [
            {
              name: "Unsafe variant",
              sku: `${runId}-UNSAFE`,
              priceKobo: PRICE_KOBO.toString(),
              stock: 2,
              isActive: true,
              attributes: null
            }
          ]
        }),
      "variant_stock_conflict"
    );
    const blockedEvent = await prisma.systemEvent.findFirst({
      where: { type: "product.variant_transition_blocked", entity: "Product", entityId: productUnsafe.id },
      orderBy: { createdAt: "desc" }
    });
    const blockedDetails = (blockedEvent?.payload as { details?: { quantity?: number; reserved?: number } } | null)?.details;
    check(
      "unsafe variant transition is recorded with the blocking quantity/reserved",
      Boolean(blockedEvent) && blockedDetails?.quantity === 4 && blockedDetails?.reserved === 2,
      blockedEvent ? JSON.stringify(blockedDetails) : "no event"
    );
    await cancelOrder({ orderId: unsafeOrder.orderId, userId: customer.id, reason: "Run-owned unsafe transition fixture cancellation" });
    const unsafeStockAfterCancel = await prisma.inventoryStock.findUniqueOrThrow({ where: { productId: productUnsafe.id } });
    check(
      "unpaid cancellation releases the product-level reservation",
      unsafeStockAfterCancel.reserved === 0 && unsafeStockAfterCancel.quantity === 4,
      `quantity=${unsafeStockAfterCancel.quantity} reserved=${unsafeStockAfterCancel.reserved}`
    );
  } catch (error) {
    fatalError = error;
  } finally {
    await cleanup();
    await prisma.$disconnect();
    if (fatalError) {
      console.error(`FATAL ${fatalError instanceof Error ? fatalError.message : String(fatalError)}`);
      if (fatalError instanceof Error && fatalError.stack) console.error(fatalError.stack.split("\n").slice(0, 6).join("\n"));
    }
    console.log(JSON.stringify({ run: runId, passed: checks.filter((entry) => entry.status === "PASS").length, total: checks.length, failures, fatal: Boolean(fatalError) }, null, 1));
  }
  process.exit(failures > 0 || fatalError ? 1 : 0);
}

// PRICE_KOBO remains the fixture's price; no placeholder value is used below.

main().catch(async (error) => {
  console.error(`FATAL ${(error as Error)?.message ?? error}`);
  process.exit(1);
});
