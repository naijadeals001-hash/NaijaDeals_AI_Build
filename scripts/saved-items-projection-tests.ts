#!/usr/bin/env node
/**
 * Saved-items safe projection acceptance (isolated TEST database).
 *
 * The account saved list is a public-facing read. It must:
 *   - keep unavailable products visible with a truthful reason;
 *   - never mark an unpublished, out-of-market, out-of-stock, contact-only or
 *     activation-blocked product as purchasable;
 *   - never return raw vendor/category/variant rows;
 *   - use the same public eligibility decision as catalogue/checkout.
 *
 * Database safety: TEST_DATABASE_URL must be set explicitly (no DATABASE_URL or
 * .env fallback) and the shared guard verifies the TEST classification, the
 * actual current_database() and the deny list. Fixtures are run-tagged and
 * removed in `finally`; the Shop activation row is run-owned and deleted.
 *
 * Usage:
 *   TEST_DATABASE_URL=... npx tsx scripts/saved-items-projection-tests.ts
 */
import { randomBytes } from "node:crypto";

const runId = `SIP-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
const runSlug = runId.toLowerCase();
const results: Array<{ name: string; ok: boolean; detail: string }> = [];

function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 500) });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const { requireTestDatabase } = await import("./lib/test-db-guard");
  const target = await requireTestDatabase({ denyList: ["naijadeals_review"] });
  console.log(`GUARD database=${target.databaseName} marker=${target.marker} run=${runId}`);

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL! } } });
  const { listSavedItems, toggleSavedItem } = await import("../lib/services/core/account.service");
  const activation = await import("../lib/services/core/vertical-activation.service");

  const created = {
    userId: "",
    ownerId: "",
    vendorId: "",
    categoryId: "",
    productIds: [] as string[],
    activationId: ""
  };

  async function cleanup() {
    try {
      if (created.userId) await prisma.savedItem.deleteMany({ where: { userId: created.userId } });
      for (const productId of created.productIds) {
        await prisma.productVariant.deleteMany({ where: { productId } });
        await prisma.productImage.deleteMany({ where: { productId } });
        await prisma.inventoryStock.deleteMany({ where: { productId } });
        await prisma.cartItem.deleteMany({ where: { productId } });
        await prisma.product.delete({ where: { id: productId } }).catch(() => undefined);
      }
      if (created.activationId) {
        await prisma.$executeRawUnsafe(`DELETE FROM "VerticalActivation" WHERE id = $1`, created.activationId);
      }
      if (created.vendorId) await prisma.vendor.delete({ where: { id: created.vendorId } }).catch(() => undefined);
      if (created.categoryId) await prisma.category.delete({ where: { id: created.categoryId } }).catch(() => undefined);
      for (const userId of [created.userId, created.ownerId]) {
        if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
      }
    } finally {
      const leftovers = {
        products: await prisma.product.count({ where: { slug: { contains: runSlug } } }).catch(() => -1),
        users: await prisma.user
          .count({ where: { id: { in: [created.userId, created.ownerId].filter(Boolean) } } })
          .catch(() => -1),
        categories: created.categoryId ? await prisma.category.count({ where: { id: created.categoryId } }).catch(() => -1) : 0
      };
      check(
        "run-owned saved-item fixtures removed",
        leftovers.products <= 0 && leftovers.users <= 0 && leftovers.categories <= 0,
        JSON.stringify(leftovers)
      );
      await prisma.$disconnect();
    }
  }

  let fatalError: unknown = null;
  try {
    const customer = await prisma.user.create({
      data: {
        email: `${runSlug}-customer@test.invalid`,
        name: `${runId} customer fixture`,
        actorType: "CUSTOMER",
        countryCode: "NG"
      }
    });
    created.userId = customer.id;
    const owner = await prisma.user.create({
      data: {
        email: `${runSlug}-owner@test.invalid`,
        name: `${runId} seller fixture`,
        actorType: "VENDOR",
        countryCode: "NG"
      }
    });
    created.ownerId = owner.id;
    const vendor = await prisma.vendor.create({
      data: {
        ownerId: owner.id,
        name: `${runId} Vendor`,
        slug: `${runSlug}-vendor`,
        market: "Lagos",
        description: "Run-owned saved-item fixture. Not a real vendor.",
        pickupAddress: "1 Isolated Saved Way, Lagos",
        pickupPhone: "08000000000",
        countryCode: "NG",
        status: "VERIFIED"
      }
    });
    created.vendorId = vendor.id;
    const category = await prisma.category.create({
      data: {
        name: `${runId} Category`,
        slug: `${runSlug}-category`,
        isActive: true,
        isSelectable: true,
        browsingVisible: true
      }
    });
    created.categoryId = category.id;
    const image = { create: { url: "/generated/shop/product-stainless-steel-cookware-set.webp", alt: "Saved fixture image", sortOrder: 0 } };

    async function makeProduct(input: {
      label: string;
      status?: "ACTIVE" | "DRAFT";
      isSample?: boolean;
      countryCode?: string;
      saleMode?: "escrow" | "contact";
      stock?: { quantity: number; reserved: number } | null;
      variants?: Array<{ name: string; sku: string; stock: number; isActive: boolean }>;
    }) {
      const product = await prisma.product.create({
        data: {
          vendorId: vendor.id,
          categoryId: category.id,
          name: `${runId} ${input.label}`,
          slug: `${runSlug}-${input.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          description: "Run-owned saved-item projection fixture.",
          priceKobo: BigInt(50_000),
          status: input.status ?? "ACTIVE",
          isSample: input.isSample ?? false,
          countryCode: input.countryCode ?? "NG",
          saleMode: input.saleMode ?? "escrow",
          images: image,
          ...(input.stock ? { stock: { create: input.stock } } : {}),
          ...(input.variants
            ? {
                variants: {
                  create: input.variants.map((variant) => ({
                    name: variant.name,
                    sku: `${runId}-${variant.sku}`,
                    priceKobo: BigInt(50_000),
                    stock: variant.stock,
                    isActive: variant.isActive
                  }))
                }
              }
            : {})
        }
      });
      created.productIds.push(product.id);
      await toggleSavedItem(customer.id, product.id);
      return product;
    }

    const inStock = await makeProduct({ label: "In stock", stock: { quantity: 4, reserved: 1 } });
    const draft = await makeProduct({ label: "Draft", status: "DRAFT", stock: { quantity: 4, reserved: 0 } });
    const sample = await makeProduct({ label: "Sample", isSample: true, stock: { quantity: 4, reserved: 0 } });
    const outOfMarket = await makeProduct({ label: "Out of market", countryCode: "GH", stock: { quantity: 4, reserved: 0 } });
    const outOfStock = await makeProduct({ label: "Out of stock", stock: { quantity: 0, reserved: 0 } });
    const variantProduct = await makeProduct({
      label: "Variant",
      stock: null,
      variants: [{ name: "Small", sku: "SMALL", stock: 3, isActive: true }]
    });
    await prisma.user.update({ where: { id: owner.id }, data: { countryCode: "NG" } });

    const items = await listSavedItems(customer.id, { countryCode: "NG" });
    const byId = new Map(items.map((entry) => [entry.product.id, entry]));
    check("every saved product stays visible", items.length === 6, `items=${items.length}`);

    const inStockItem = byId.get(inStock.id);
    check(
      "an eligible in-stock product is purchasable with the shared projection",
      inStockItem?.product.purchasable === true &&
        inStockItem?.product.unavailableReason === null &&
        inStockItem?.product.availability.available === 3,
      JSON.stringify(inStockItem?.product.availability)
    );
    check(
      "an unpublished product is visible but not purchasable",
      byId.get(draft.id)?.product.purchasable === false &&
        byId.get(draft.id)?.product.unavailableReason === "not_published",
      String(byId.get(draft.id)?.product.unavailableReason)
    );
    check(
      "a sample/fixture listing is never purchasable from saved items",
      byId.get(sample.id)?.product.purchasable === false &&
        byId.get(sample.id)?.product.unavailableReason === "not_published",
      String(byId.get(sample.id)?.product.unavailableReason)
    );
    check(
      "a listing from another fulfilment market is not purchasable",
      byId.get(outOfMarket.id)?.product.purchasable === false &&
        byId.get(outOfMarket.id)?.product.unavailableReason === "not_in_market",
      String(byId.get(outOfMarket.id)?.product.unavailableReason)
    );
    check(
      "an out-of-stock product reports out_of_stock",
      byId.get(outOfStock.id)?.product.purchasable === false &&
        byId.get(outOfStock.id)?.product.unavailableReason === "out_of_stock",
      String(byId.get(outOfStock.id)?.product.unavailableReason)
    );
    check(
      "a variant-managed product requires an explicit option choice",
      byId.get(variantProduct.id)?.product.purchasable === false &&
        byId.get(variantProduct.id)?.product.unavailableReason === "choose_variant" &&
        byId.get(variantProduct.id)?.product.availability.requiresVariantSelection === true,
      String(byId.get(variantProduct.id)?.product.unavailableReason)
    );

    const raw = items.find((entry) => entry.product.id === inStock.id)!;
    const productKeys = Object.keys(raw.product).sort();
    const vendorKeys = Object.keys(raw.product.vendor).sort();
    check(
      "the response has no raw variant or private vendor payload",
      !productKeys.includes("variants") &&
        !productKeys.includes("description") &&
        vendorKeys.join(",") === "id,name,slug,status,trustScore",
      `product=${productKeys.join(",")} vendor=${vendorKeys.join(",")}`
    );
    check(
      "the response uses the shared availability projection",
      typeof raw.product.availability.available === "number" &&
        typeof raw.product.availability.onHand === "number" &&
        typeof raw.product.availability.known === "boolean",
      JSON.stringify(raw.product.availability)
    );

    // A GLOBAL DISABLED rule blocks purchasing while existing saved items stay
    // visible. The row is run-owned and removed in cleanup. Refuse to touch a
    // database that already has an operator GLOBAL rule.
    const existingGlobal = await prisma.verticalActivation.count({
      where: { verticalKey: "shop", scopeType: "GLOBAL" }
    });
    assert(existingGlobal === 0, "Refusing: a GLOBAL Shop activation rule already exists; use a clean TEST database.");
    const activationRowId = `st-${runSlug}-${randomBytes(4).toString("hex")}`;
    created.activationId = activationRowId;
    await prisma.$executeRawUnsafe(
      `INSERT INTO "VerticalActivation"
         (id, "verticalKey", "scopeType", "countryCode", "cityCode", status, reason, "updatedById", "createdAt", "updatedAt")
       VALUES ($1, 'shop', 'GLOBAL', '', '', 'DISABLED'::"VerticalActivationStatus", $2, NULL, NOW(), NOW())`,
      activationRowId,
      `[run:${runId}] saved items shop disabled fixture`
    );
    activation.clearVerticalActivationCache();
    const blocked = await listSavedItems(customer.id, { countryCode: "NG" });
    check(
      "a disabled Shop keeps saved items visible but not purchasable",
      blocked.length === 6 && blocked.every((entry) => entry.product.purchasable === false && entry.product.unavailableReason === "shop_not_available"),
      blocked.map((entry) => entry.product.unavailableReason).join(",")
    );
    activation.clearVerticalActivationCache();
  } catch (error) {
    fatalError = error;
  } finally {
    await cleanup();
    if (fatalError) {
      console.error(`FATAL ${fatalError instanceof Error ? fatalError.message : String(fatalError)}`);
      if (fatalError instanceof Error && fatalError.stack) console.error(fatalError.stack.split("\n").slice(0, 6).join("\n"));
    }
    const failures = results.filter((entry) => !entry.ok).length;
    console.log(
      JSON.stringify({ run: runId, passed: results.length - failures, total: results.length, failures, fatal: Boolean(fatalError) }, null, 1)
    );
    process.exitCode = failures > 0 || fatalError ? 1 : 0;
  }
}

main().catch((error) => {
  console.error(`FATAL ${(error as Error)?.message ?? error}`);
  process.exit(1);
});
