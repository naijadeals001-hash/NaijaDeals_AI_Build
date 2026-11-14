#!/usr/bin/env node
/**
 * REVIEW-only focused inventory/variant acceptance.
 *
 * Covers the service-level contract that the broader marketplace suites do not:
 *
 *   1. Seller create/update cannot publish directly (`admin_publication_required`);
 *      the Control Center moderation workflow still publishes.
 *   2. A seller update that omits `variants` records the real unchanged
 *      before/after variant state in the audit trail.
 *   3. The transaction-scoped quantity guard refuses a variant or product-level
 *      stock value below the units already reserved.
 *   4. A variant can be deactivated while it is only saved for later, the saved
 *      line becomes unavailable, and moving it back to the cart is refused.
 *   5. A live (unsaved) cart line still blocks deactivation; a historical
 *      CHECKED_OUT cart line does not.
 *   6. Cart, catalogue and shared projection agree on availability, and
 *      product-level stock is never added to variant stock.
 *
 * REVIEW database only: the script refuses anything but the explicit
 * REVIEW_DATABASE_URL target classified REVIEW. Historical purchase/refund
 * idempotency requires financial fixtures and lives in the isolated TEST suite
 * (`scripts/variant-restock-idempotency-tests.ts`).
 *
 * Usage:
 *   REVIEW_DATABASE_URL=... npx tsx scripts/variant-inventory-focus-tests.ts
 *
 * The URL is never printed. All products, carts, users, vendor and audit rows
 * created here are run-owned and removed in `finally`.
 */
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const REVIEW_URL = process.env.REVIEW_DATABASE_URL?.trim();
if (!REVIEW_URL) {
  console.error("REFUSED: REVIEW_DATABASE_URL must be set explicitly (never falls back to DATABASE_URL).");
  process.exit(2);
}
const EXPECTED_DATABASE = process.env.REVIEW_EXPECTED_DATABASE || "naijadeals_review";

// The services import the shared singleton, which reads DATABASE_URL at module
// initialisation. Point it at the verified REVIEW target before the dynamic
// service imports below; no value is printed.
process.env.DATABASE_URL = REVIEW_URL;

const prisma = new PrismaClient({ datasources: { db: { url: REVIEW_URL } } });
const runId = `VIF-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
const runSlug = runId.toLowerCase();

type Check = { name: string; status: "PASS" | "FAIL"; detail: string };
const checks: Check[] = [];
let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  const entry: Check = { name, status: ok ? "PASS" : "FAIL", detail: String(detail).slice(0, 700) };
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
    check(name, typed.code === code, `code=${typed.code ?? "none"} message=${String(typed.message ?? error).slice(0, 200)}`);
  }
}

const created = {
  userIds: [] as string[],
  vendorIds: [] as string[],
  productIds: [] as string[],
  cartIds: [] as string[]
};

async function guard() {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>("select current_database() as name");
  const actual = rows[0]?.name ?? "";
  if (actual !== EXPECTED_DATABASE) throw new Error(`refusing database ${actual}; expected ${EXPECTED_DATABASE}`);
  const classification = await prisma.databaseClassification.findMany({ select: { classification: true } });
  if (!classification.some((row) => row.classification === "REVIEW")) {
    throw new Error("refusing: database is not classified REVIEW");
  }
  console.log(`GUARD database=${actual} classification=REVIEW run=${runId}`);
}

async function cleanup() {
  const productIds = created.productIds;
  for (const productId of productIds) {
    await prisma.cartItem.deleteMany({ where: { productId } }).catch(() => undefined);
    await prisma.productVariant.deleteMany({ where: { productId } }).catch(() => undefined);
    await prisma.productImage.deleteMany({ where: { productId } }).catch(() => undefined);
    await prisma.inventoryStock.deleteMany({ where: { productId } }).catch(() => undefined);
    await prisma.product.delete({ where: { id: productId } }).catch(() => undefined);
  }
  for (const cartId of created.cartIds) {
    await prisma.cartItem.deleteMany({ where: { cartId } }).catch(() => undefined);
    await prisma.cart.delete({ where: { id: cartId } }).catch(() => undefined);
  }
  if (created.userIds.length > 0) {
    for (const userId of created.userIds) {
      await prisma.cartItem.deleteMany({ where: { cart: { userId } } }).catch(() => undefined);
      await prisma.cart.deleteMany({ where: { userId } }).catch(() => undefined);
    }
    await prisma.auditLog
      .deleteMany({ where: { actorId: { in: created.userIds }, entityId: { in: productIds } } })
      .catch(() => undefined);
    await prisma.systemEvent
      .deleteMany({ where: { actorId: { in: created.userIds } } })
      .catch(() => undefined);
  }
  await prisma.auditLog.deleteMany({ where: { entityId: { in: productIds } } }).catch(() => undefined);
  await prisma.systemEvent.deleteMany({ where: { entityId: { in: productIds } } }).catch(() => undefined);
  for (const vendorId of created.vendorIds) {
    await prisma.vendor.delete({ where: { id: vendorId } }).catch(() => undefined);
  }
  if (created.userIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: created.userIds } } }).catch(() => undefined);
  }
  const leftovers = {
    products: await prisma.product.count({ where: { slug: { contains: runSlug } } }).catch(() => -1),
    carts: await prisma.cart.count({ where: { userId: { in: created.userIds } } }).catch(() => -1),
    users: await prisma.user.count({ where: { id: { in: created.userIds } } }).catch(() => -1)
  };
  const clean = leftovers.products <= 0 && leftovers.carts <= 0 && leftovers.users <= 0;
  check("run-owned fixtures removed", clean, JSON.stringify(leftovers));
}

function variantSet(label: string, priceKobo: number, stock: number) {
  return [
    {
      name: `${label} Small`,
      sku: `${runId}-${label}-S`.replace(/[^A-Z0-9_-]/g, "").toUpperCase(),
      priceKobo: String(priceKobo),
      stock,
      attributes: { Size: "Small", Colour: "Olive" }
    },
    {
      name: `${label} Large`,
      sku: `${runId}-${label}-L`.replace(/[^A-Z0-9_-]/g, "").toUpperCase(),
      priceKobo: String(priceKobo + 10_000),
      stock: stock + 1,
      attributes: { Size: "Large", Colour: "Olive" }
    }
  ];
}

async function main() {
  await guard();

  const sellerService = await import("../lib/services/core/seller.service");
  const cartService = await import("../lib/services/core/cart.service");
  const catalogService = await import("../lib/services/core/catalog.service");
  const { availabilityProjection } = await import("../lib/services/core/availability");
  const { publishProduct } = await import("../lib/services/core/catalogue-admin.service");
  type SessionUser = import("../lib/auth/session").SessionUser;

  const category = await prisma.category.findFirstOrThrow({ where: { slug: "cookware-bakeware", isActive: true } });
  const baseImage = "/generated/shop/product-stainless-steel-cookware-set.webp";

  try {
    const owner = await prisma.user.create({
      data: {
        email: `${runSlug}-seller@review.invalid`,
        name: `${runId} seller fixture`,
        actorType: "VENDOR",
        countryCode: "NG"
      }
    });
    created.userIds.push(owner.id);
    const vendor = await prisma.vendor.create({
      data: {
        ownerId: owner.id,
        name: `${runId} Vendor`,
        slug: `${runSlug}-vendor`,
        market: "Lagos",
        description: "Run-owned review fixture. Not a real vendor.",
        pickupAddress: "Run-owned fixture address",
        pickupPhone: "08000000000",
        countryCode: "NG",
        status: "VERIFIED"
      }
    });
    created.vendorIds.push(vendor.id);
    const customer = await prisma.user.create({
      data: {
        email: `${runSlug}-customer@review.invalid`,
        name: `${runId} customer fixture`,
        actorType: "CUSTOMER",
        countryCode: "NG"
      }
    });
    created.userIds.push(customer.id);

    const admin = await prisma.user.findFirstOrThrow({
      where: { email: "review-admin@review.invalid" },
      include: { roles: { include: { role: true } }, vendors: true }
    });

    const baseInput = (extra: Record<string, unknown> = {}) => ({
      name: `${runId} Focus product`,
      description: "Run-owned focused variant fixture for review acceptance.",
      categoryId: category.id,
      priceKobo: 100_000n,
      quantity: 0,
      attributes: { material: "Stainless steel", piece_count: 2 },
      images: [{ url: baseImage, alt: "Stainless steel cookware set", order: 0, primary: true }],
      ...extra
    });

    /* 1. Publication boundary ------------------------------------------- */
    await expectCode(
      "direct seller create with ACTIVE is refused",
      () =>
        sellerService.createSellerProduct(owner.id, {
          ...baseInput(),
          status: "ACTIVE"
        } as never),
      "admin_publication_required"
    );

    const productA = await sellerService.createSellerProduct(owner.id, baseInput({ variants: variantSet("A", 100_000, 3) }));
    created.productIds.push(productA.id);
    check("seller create returns a DRAFT with variants", productA.status === "DRAFT" && productA.variants.length === 2, `status=${productA.status} variants=${productA.variants.length}`);

    await expectCode(
      "direct seller update to ACTIVE is refused",
      () => sellerService.updateSellerProduct(owner.id, productA.id, { status: "ACTIVE" as never }),
      "admin_publication_required"
    );

    /* 2. Unchanged-variant audit accuracy ------------------------------- */
    const beforeAuditVariants = await prisma.productVariant.findMany({ where: { productId: productA.id }, orderBy: { id: "asc" } });
    await sellerService.updateSellerProduct(owner.id, productA.id, { priceKobo: 123_000n });
    const audit = await prisma.auditLog.findFirst({
      where: { action: "product.updated", entityId: productA.id },
      orderBy: { createdAt: "desc" }
    });
    const metadata = (audit?.metadata ?? {}) as {
      variants?: { before?: Array<{ id: string; stock: number }>; after?: Array<{ id: string; stock: number }> };
      before?: { variants?: Array<{ id: string }>; priceKobo?: string };
      after?: { variants?: Array<{ id: string }>; priceKobo?: string };
      variantsSupplied?: boolean;
    };
    const variantMeta = metadata.variants ?? {};
    const sameIds =
      JSON.stringify((variantMeta.before ?? []).map((entry) => entry.id).sort()) ===
      JSON.stringify((variantMeta.after ?? []).map((entry) => entry.id).sort());
    check(
      "unchanged variants are recorded as real before/after rows",
      Boolean(audit) &&
        (variantMeta.before ?? []).length === beforeAuditVariants.length &&
        (variantMeta.after ?? []).length === beforeAuditVariants.length &&
        (metadata.before?.variants ?? []).length === beforeAuditVariants.length &&
        (metadata.after?.variants ?? []).length === beforeAuditVariants.length &&
        sameIds &&
        metadata.variantsSupplied === false,
      `before=${(variantMeta.before ?? []).length} after=${(variantMeta.after ?? []).length} supplied=${metadata.variantsSupplied} sameIds=${sameIds}`
    );
    check(
      "audit records the actual product price change",
      metadata.before?.priceKobo === "100000" && metadata.after?.priceKobo === "123000",
      `before=${metadata.before?.priceKobo} after=${metadata.after?.priceKobo}`
    );

    /* 3. Transaction-scoped reserved guard ------------------------------ */
    const variantsA = await prisma.productVariant.findMany({ where: { productId: productA.id }, orderBy: { name: "asc" } });
    const small = variantsA[0];
    const large = variantsA[1];
    await prisma.productVariant.update({ where: { id: small.id }, data: { reserved: 2 } });
    const toPayload = (rows: Array<{ id: string; name: string; sku: string; priceKobo: bigint; stock: number; reserved: number; isActive: boolean; attributes: unknown; imageUrl: string | null }>, overrides: Record<string, Partial<{ stock: number; isActive: boolean }>> = {}) =>
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        sku: row.sku,
        priceKobo: row.priceKobo.toString(),
        stock: overrides[row.id]?.stock ?? row.stock,
        isActive: overrides[row.id]?.isActive ?? row.isActive,
        attributes: row.attributes as Record<string, string | number | boolean> | null
      }));
    await expectCode(
      "variant stock below reserved is refused",
      () =>
        sellerService.updateSellerProduct(owner.id, productA.id, {
          variants: toPayload(variantsA, { [small.id]: { stock: 1 } })
        }),
      "variant_stock_below_reserved"
    );
    await prisma.productVariant.update({ where: { id: small.id }, data: { reserved: 0 } });

    const productB = await sellerService.createSellerProduct(owner.id, baseInput({ name: `${runId} Product-level`, quantity: 5 }));
    created.productIds.push(productB.id);
    await prisma.inventoryStock.update({ where: { productId: productB.id }, data: { reserved: 3 } });
    await expectCode(
      "seller quantity below product-level reserved is refused",
      () => sellerService.updateSellerProduct(owner.id, productB.id, { quantity: 2 }),
      "stock_below_reserved"
    );
    const boundaryUpdate = await sellerService.updateSellerProduct(owner.id, productB.id, { quantity: 3 });
    check(
      "quantity equal to reserved is accepted",
      boundaryUpdate.stock?.quantity === 3 && boundaryUpdate.stock?.reserved === 3,
      `quantity=${boundaryUpdate.stock?.quantity} reserved=${boundaryUpdate.stock?.reserved}`
    );
    await prisma.inventoryStock.update({ where: { productId: productB.id }, data: { reserved: 0 } });

    /* 4. Saved-for-later deactivation ----------------------------------- */
    const publishedA = await publishProduct({ actor: admin as unknown as SessionUser, id: productA.id });
    check("Control Center publish still works", publishedA.status === "ACTIVE", `status=${publishedA.status}`);

    const added = await cartService.addCartItem({
      userId: customer.id,
      productId: productA.id,
      variantId: small.id,
      quantity: 1,
      market: { countryCode: "NG" }
    });
    created.cartIds.push(added.id);
    const activeLine = added.items.find((item) => item.variantId === small.id);
    check(
      "variant line starts purchasable",
      Boolean(activeLine) && activeLine?.availability.purchasable === true,
      JSON.stringify(activeLine?.availability)
    );

    const saved = await cartService.updateCartItem({
      userId: customer.id,
      itemId: activeLine!.id,
      quantity: 1,
      savedForLater: true
    });
    const savedLine = saved.items.find((item) => item.id === activeLine!.id);
    check("line can be saved for later", savedLine?.savedForLater === true, `saved=${savedLine?.savedForLater}`);

    const deactivateSmall = await sellerService.updateSellerProduct(owner.id, productA.id, {
      variants: toPayload(variantsA, { [small.id]: { isActive: false } })
    });
    check(
      "saved-for-later line does not block variant deactivation",
      deactivateSmall.variants.find((variant) => variant.id === small.id)?.isActive === false,
      `active=${deactivateSmall.variants.find((variant) => variant.id === small.id)?.isActive}`
    );

    const cartAfterDeactivation = await cartService.getOrCreateActiveCart(customer.id);
    const unavailableSavedLine = cartAfterDeactivation.items.find((item) => item.id === activeLine!.id);
    check(
      "saved line becomes unavailable after deactivation",
      unavailableSavedLine?.availability.purchasable === false &&
        unavailableSavedLine?.availability.reason === "variant_unavailable",
      JSON.stringify(unavailableSavedLine?.availability)
    );
    await expectCode(
      "moving an unavailable saved line back to the cart is refused",
      () =>
        cartService.updateCartItem({
          userId: customer.id,
          itemId: activeLine!.id,
          quantity: 1,
          savedForLater: false
        }),
      "variant_unavailable"
    );
    await cartService.deleteCartItem({ userId: customer.id, itemId: activeLine!.id });

    /* 5. Live cart blocks, historical cart does not --------------------- */
    const liveCart = await cartService.addCartItem({
      userId: customer.id,
      productId: productA.id,
      variantId: large.id,
      quantity: 1,
      market: { countryCode: "NG" }
    });
    const liveLine = liveCart.items.find((item) => item.variantId === large.id);
    await expectCode(
      "live cart line still blocks deactivation",
      () =>
        sellerService.updateSellerProduct(owner.id, productA.id, {
          variants: toPayload(variantsA, { [large.id]: { isActive: false } })
        }),
      "variant_in_use"
    );
    await cartService.deleteCartItem({ userId: customer.id, itemId: liveLine!.id });

    const historicalCart = await prisma.cart.create({
      data: {
        userId: customer.id,
        status: "CHECKED_OUT",
        items: { create: { productId: productA.id, variantId: large.id, quantity: 1, savedForLater: false } }
      }
    });
    created.cartIds.push(historicalCart.id);
    const deactivateHistorical = await sellerService.updateSellerProduct(owner.id, productA.id, {
      variants: toPayload(variantsA, { [large.id]: { isActive: false } })
    });
    check(
      "historical CHECKED_OUT cart line does not block deactivation",
      deactivateHistorical.variants.find((variant) => variant.id === large.id)?.isActive === false,
      `active=${deactivateHistorical.variants.find((variant) => variant.id === large.id)?.isActive}`
    );
    const historicalLine = await prisma.cartItem.findFirstOrThrow({ where: { cartId: historicalCart.id } });
    check(
      "historical cart reference remains readable",
      historicalLine.variantId === large.id && historicalLine.quantity === 1,
      `variant=${historicalLine.variantId} quantity=${historicalLine.quantity}`
    );

    /* 6. Availability consistency --------------------------------------- */
    const productC = await prisma.product.create({
      data: {
        vendorId: vendor.id,
        categoryId: category.id,
        name: `${runId} Availability product`,
        slug: `${runSlug}-availability`,
        description: "Run-owned availability fixture for review acceptance.",
        priceKobo: 50_000n,
        status: "ACTIVE",
        images: { create: { url: baseImage, alt: "Stainless steel cookware set", sortOrder: 0 } },
        stock: { create: { quantity: 99, reserved: 0 } },
        variants: {
          create: [
            { name: "C Small", sku: `${runId}-C-S`, priceKobo: 50_000n, stock: 2, reserved: 1, isActive: true },
            { name: "C Large", sku: `${runId}-C-L`, priceKobo: 60_000n, stock: 0, reserved: 0, isActive: true },
            { name: "C Retired", sku: `${runId}-C-R`, priceKobo: 40_000n, stock: 50, reserved: 0, isActive: false }
          ]
        }
      },
      include: { variants: true }
    });
    created.productIds.push(productC.id);

    const catalogProduct = await catalogService.getProduct(productC.id);
    const catalogAvailable = catalogService.availableQuantity(catalogProduct);
    const projected = availabilityProjection({
      variants: productC.variants.map((variant) => ({
        isActive: variant.isActive,
        stock: variant.stock,
        reserved: variant.reserved
      })),
      stock: { quantity: 99, reserved: 0 }
    });
    check(
      "catalogue availability uses the shared variant projection",
      catalogAvailable === 1 && projected.available === 1 && projected.variantManaged === true,
      `catalog=${catalogAvailable} projection=${projected.available} managed=${projected.variantManaged}`
    );
    check(
      "inactive variants and product stock are excluded from availability",
      catalogService.availableQuantity({
        stock: { quantity: 99, reserved: 0 },
        variants: [
          { stock: 2, reserved: 1 },
          { stock: 0, reserved: 0 },
          { stock: 50, reserved: 0, isActive: false }
        ]
      }) === 1,
      "expected only 2-1 from active variants"
    );

    const availabilityCart = await cartService.addCartItem({
      userId: customer.id,
      productId: productC.id,
      variantId: productC.variants.find((variant) => variant.sku === `${runId}-C-S`)!.id,
      quantity: 1,
      market: { countryCode: "NG" }
    });
    const availabilityLine = availabilityCart.items.find((item) => item.productId === productC.id);
    check(
      "cart line availability matches the catalogue projection",
      availabilityLine?.availability.available === 1 && availabilityLine?.availability.purchasable === true,
      JSON.stringify(availabilityLine?.availability)
    );
    await expectCode(
      "cart cannot add more than the projected availability",
      () =>
        cartService.addCartItem({
          userId: customer.id,
          productId: productC.id,
          variantId: productC.variants.find((variant) => variant.sku === `${runId}-C-S`)!.id,
          quantity: 1,
          market: { countryCode: "NG" }
        }),
      "insufficient_stock"
    );
    await cartService.deleteCartItem({ userId: customer.id, itemId: availabilityLine!.id });

    const detail = await catalogService.getPublicProductDetail(productC.id, { countryCode: "NG" });
    check(
      "public detail exposes the same available number",
      detail?.available === 1 && detail?.variants?.every((variant) => variant.isActive) === true,
      `available=${detail?.available} variants=${detail?.variants?.length}`
    );
  } finally {
    await cleanup();
    await prisma.$disconnect();
    console.log(
      JSON.stringify(
        { run: runId, passed: checks.filter((entry) => entry.status === "PASS").length, total: checks.length, failures },
        null,
        1
      )
    );
    process.exit(failures > 0 ? 1 : 0);
  }
}

main().catch(async (error) => {
  console.error(`FATAL ${(error as Error)?.message ?? error}`);
  try {
    await cleanup();
  } finally {
    await prisma.$disconnect();
  }
  process.exit(1);
});
