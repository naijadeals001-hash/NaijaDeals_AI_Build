#!/usr/bin/env node
/**
 * REVIEW-only inventory lock-serialization acceptance.
 *
 * This suite answers the questions the existing variant suites do not:
 *
 *   1. A legacy product with no `InventoryStock` row must still be serialised
 *      against a concurrent product-level quantity write while a variant
 *      transition is in flight. The transition must create the zero row first
 *      (inside the transaction) and the competing write must observe it.
 *   2. A stock/variant transition on a missing-row product must not wait
 *      forever: the lock wait is bounded by the caller's transaction timeout.
 *   3. A live, unsaved product-level cart line blocks converting a stocked
 *      product to variant-managed stock. Saved-for-later and historical
 *      CHECKED_OUT lines do not block, and a refusal leaves stock, variants and
 *      cart untouched.
 *   4. Two same-customer adds use real database connections: the user-row lock
 *      is honoured across connections, duplicate lines are not created and a
 *      last-unit race cannot oversell.
 *   5. Concurrent cart/variant writes on the same product complete under the
 *      canonical stock -> variant lock order without a Postgres deadlock.
 *   6. Per-variant image input is rejected (`unsupported_variant_field`), while
 *      legacy variant image values stay readable and product-level image
 *      management remains available.
 *
 * REVIEW database only. Checkout/refund financial acceptance stays in the
 * isolated TEST suite (`scripts/variant-restock-idempotency-tests.ts`); this
 * script writes no order, payment, wallet or ledger row.
 *
 * Usage:
 *   REVIEW_DATABASE_URL=... npx tsx scripts/variant-lock-serialization-tests.ts
 *
 * REVIEW_DATABASE_URL is mandatory; DATABASE_URL/.env are never used as a
 * fallback. Every fixture is run-tagged and removed in `finally`.
 */
import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { PrismaClient } from "@prisma/client";

const REVIEW_URL = process.env.REVIEW_DATABASE_URL?.trim();
if (!REVIEW_URL) {
  console.error("REFUSED: REVIEW_DATABASE_URL must be set explicitly; DATABASE_URL/.env are never used.");
  process.exit(2);
}
const EXPECTED_DATABASE = process.env.REVIEW_EXPECTED_DATABASE || "naijadeals_review";

// The services import the shared singleton, which reads DATABASE_URL when the
// module initialises. Point it at the verified REVIEW target before the dynamic
// imports below; the URL is never printed.
process.env.DATABASE_URL = REVIEW_URL;

const IMAGE = "/generated/shop/product-stainless-steel-cookware-set.webp";
const IMAGE_ALT = "Stainless steel cookware set";
const SECOND_IMAGE = "/generated/shop/category-home-kitchen.webp";
const runId = `VLS-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
const runSlug = runId.toLowerCase();

type Check = { name: string; status: "PASS" | "FAIL"; detail: string };
const checks: Check[] = [];
let failures = 0;

function check(name: string, ok: unknown, detail = "") {
  const entry: Check = { name, status: ok ? "PASS" : "FAIL", detail: String(detail).slice(0, 800) };
  checks.push(entry);
  if (entry.status !== "PASS") failures += 1;
  console.log(`${entry.status} ${name}${entry.detail ? ` — ${entry.detail}` : ""}`);
  return Boolean(ok);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "";
}

function errorStatus(error: unknown): number | null {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isDeadlockOrTimeout(error: unknown): boolean {
  const code = errorCode(error);
  const sqlState = (error as { meta?: { code?: unknown } } | null)?.meta?.code;
  return (
    code === "P2034" ||
    code === "P2028" ||
    sqlState === "40P01" ||
    sqlState === "40001" ||
    sqlState === "57014" ||
    /deadlock detected|could not serialize|canceling statement due to statement timeout|transaction.*timed out|timeout/i.test(errorMessage(error))
  );
}

async function capture(fn: () => Promise<unknown>): Promise<{ ok: true; value: unknown } | { ok: false; error: unknown }> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return { ok: false, error };
  }
}

const prisma = new PrismaClient({ datasources: { db: { url: REVIEW_URL } } });
const lockClient = new Client({ connectionString: REVIEW_URL });
const transitionClient = new PrismaClient({ datasources: { db: { url: REVIEW_URL } } });

const created = {
  userIds: [] as string[],
  vendorIds: [] as string[],
  productIds: [] as string[],
  cartIds: [] as string[]
};
let releaseTransition: (() => void) | null = null;

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
  // Release any test-held connection lock before deleting fixtures.
  try {
    await lockClient.query("ROLLBACK");
  } catch {
    /* not in a transaction */
  }

  const productIds = [...new Set(created.productIds)];
  const userIds = [...new Set(created.userIds)];
  const cartIds = [...new Set(created.cartIds)];

  try {
    if (cartIds.length > 0 || productIds.length > 0 || userIds.length > 0) {
      await prisma.cartItem.deleteMany({
        where: {
          OR: [
            ...(cartIds.length > 0 ? [{ cartId: { in: cartIds } }] : []),
            ...(productIds.length > 0 ? [{ productId: { in: productIds } }] : []),
            ...(userIds.length > 0 ? [{ cart: { userId: { in: userIds } } }] : [])
          ]
        }
      });
      await prisma.cart.deleteMany({
        where: {
          OR: [
            ...(cartIds.length > 0 ? [{ id: { in: cartIds } }] : []),
            ...(userIds.length > 0 ? [{ userId: { in: userIds } }] : [])
          ]
        }
      });
    }
    for (const productId of productIds) {
      await prisma.productVariant.deleteMany({ where: { productId } }).catch(() => undefined);
      await prisma.productImage.deleteMany({ where: { productId } }).catch(() => undefined);
      await prisma.inventoryStock.deleteMany({ where: { productId } }).catch(() => undefined);
      await prisma.product.delete({ where: { id: productId } }).catch(() => undefined);
    }
    if (productIds.length > 0 || userIds.length > 0) {
      await prisma.auditLog
        .deleteMany({
          where: {
            OR: [
              ...(productIds.length > 0 ? [{ entityId: { in: productIds } }] : []),
              ...(userIds.length > 0 ? [{ actorId: { in: userIds } }] : [])
            ]
          }
        })
        .catch(() => undefined);
      await prisma.systemEvent
        .deleteMany({
          where: {
            OR: [
              ...(productIds.length > 0 ? [{ entityId: { in: productIds } }] : []),
              ...(userIds.length > 0 ? [{ actorId: { in: userIds } }] : [])
            ]
          }
        })
        .catch(() => undefined);
    }
    for (const vendorId of created.vendorIds) {
      await prisma.vendor.delete({ where: { id: vendorId } }).catch(() => undefined);
    }
    if (userIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => undefined);

    const leftovers = {
      products: await prisma.product.count({ where: { slug: { contains: runSlug } } }).catch(() => -1),
      carts: userIds.length
        ? await prisma.cart.count({ where: { userId: { in: userIds } } }).catch(() => -1)
        : 0,
      users: userIds.length ? await prisma.user.count({ where: { id: { in: userIds } } }).catch(() => -1) : 0
    };
    check("run-owned fixtures removed", leftovers.products <= 0 && leftovers.carts <= 0 && leftovers.users <= 0, JSON.stringify(leftovers));
  } catch (error) {
    check("fixture cleanup completed", false, errorMessage(error));
  }
}

function variantPayload(label: string, stock: number, extra: Record<string, unknown> = {}) {
  return {
    id: null,
    name: `${label} Small`,
    sku: `${runId}-${label}-S`.replace(/[^A-Z0-9_-]/g, "").toUpperCase().slice(0, 64),
    priceKobo: "100000",
    stock,
    attributes: { Size: "Small" },
    currency: null,
    isActive: true,
    ...extra
  };
}

async function main() {
  await guard();
  await lockClient.connect();

  const sellerService = await import("../lib/services/core/seller.service");
  const cartService = await import("../lib/services/core/cart.service");
  const { parseVariantsPayload, syncProductVariants, lockInventoryStock } = await import(
    "../lib/services/core/variant-contract"
  );
  const { listEligiblePublicCategoryIds } = await import("../lib/services/core/catalog.service");

  const category = await prisma.category.findFirstOrThrow({ where: { slug: "cookware-bakeware", isActive: true } });
  const eligible = await listEligiblePublicCategoryIds("NG");
  assert(eligible.includes(category.id), "fixture category is not publicly eligible in NG");

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
  const secondCustomer = await prisma.user.create({
    data: {
      email: `${runSlug}-customer-2@review.invalid`,
      name: `${runId} second customer fixture`,
      actorType: "CUSTOMER",
      countryCode: "NG"
    }
  });
  created.userIds.push(secondCustomer.id);

  let productSequence = 0;
  async function createProduct(
    label: string,
    options: {
      quantity?: number | null;
      variants?: Array<{
        name: string;
        sku: string;
        priceKobo: bigint;
        stock: number;
        attributes?: Record<string, string>;
        imageUrl?: string;
        isActive?: boolean;
      }>;
      status?: "ACTIVE" | "DRAFT";
    } = {}
  ) {
    productSequence += 1;
    const product = await prisma.product.create({
      data: {
        vendorId: vendor.id,
        categoryId: category.id,
        name: `${runId} ${label}`,
        slug: `${runSlug}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${productSequence}`,
        description: "Run-owned inventory lock-serialization fixture.",
        priceKobo: 100_000n,
        countryCode: "NG",
        status: options.status ?? "ACTIVE",
        attributes: { material: "Stainless steel" },
        images: { create: { url: IMAGE, alt: IMAGE_ALT, sortOrder: 0 } },
        ...(options.quantity === null
          ? {}
          : { stock: { create: { quantity: options.quantity ?? 0, lowStockLevel: 3 } } }),
        ...(options.variants
          ? { variants: { create: options.variants.map((variant) => ({ ...variant, attributes: variant.attributes })) } }
          : {})
      },
      include: { stock: true, variants: true }
    });
    created.productIds.push(product.id);
    return product;
  }

  const add = (input: { userId: string; productId: string; variantId?: string | null; quantity: number }) =>
    cartService.addCartItem({ ...input, market: { countryCode: "NG" } });

  try {
    /* 1. Strict per-variant image contract -------------------------------- */
    const imageRejectName = `${runId} image reject`;
    const imageUrlRejection = await capture(() =>
      sellerService.createSellerProduct(owner.id, {
        name: imageRejectName,
        description: "Run-owned rejection fixture.",
        categoryId: category.id,
        priceKobo: 100_000n,
        quantity: 0,
        attributes: { material: "Stainless steel" },
        images: [{ url: IMAGE, alt: IMAGE_ALT }],
        variants: [variantPayload("IMG", 1, { imageUrl: IMAGE })]
      })
    );
    check(
      "variant imageUrl input is rejected with unsupported_variant_field",
      imageUrlRejection.ok === false &&
        errorStatus(imageUrlRejection.error) === 400 &&
        errorCode(imageUrlRejection.error) === "unsupported_variant_field",
      imageUrlRejection.ok
        ? "no error was raised"
        : `status=${errorStatus(imageUrlRejection.error)} code=${errorCode(imageUrlRejection.error)}`
    );

    const imageIdRejection = await capture(() =>
      sellerService.createSellerProduct(owner.id, {
        name: `${runId} image-id reject`,
        description: "Run-owned rejection fixture.",
        categoryId: category.id,
        priceKobo: 100_000n,
        quantity: 0,
        attributes: { material: "Stainless steel" },
        images: [{ url: IMAGE, alt: IMAGE_ALT }],
        variants: [variantPayload("IMGID", 1, { imageId: "some-image-id" })]
      })
    );
    check(
      "variant imageId input is rejected with unsupported_variant_field",
      imageIdRejection.ok === false &&
        errorStatus(imageIdRejection.error) === 400 &&
        errorCode(imageIdRejection.error) === "unsupported_variant_field",
      imageIdRejection.ok
        ? "no error was raised"
        : `status=${errorStatus(imageIdRejection.error)} code=${errorCode(imageIdRejection.error)}`
    );
    check(
      "rejected image payloads created no product",
      (await prisma.product.count({ where: { vendorId: vendor.id, name: { startsWith: `${runId} image` } } })) === 0,
      "expected zero run-owned image-rejection products"
    );

    const imageProduct = await sellerService.createSellerProduct(owner.id, {
      name: `${runId} image contract`,
      description: "Run-owned image contract fixture.",
      categoryId: category.id,
      priceKobo: 100_000n,
      quantity: 0,
      attributes: { material: "Stainless steel" },
      images: [{ url: IMAGE, alt: IMAGE_ALT }],
      variants: [variantPayload("LEGACY", 2)]
    });
    created.productIds.push(imageProduct.id);
    const firstVariant = imageProduct.variants[0];
    check(
      "a valid variant payload creates a variant without a per-variant image",
      Boolean(firstVariant) && firstVariant.imageUrl === null && imageProduct.images.length === 1,
      `variantImage=${firstVariant?.imageUrl ?? "missing"} productImages=${imageProduct.images.length}`
    );

    // Legacy row readability: only a historical value is set, never through the
    // variant payload contract. A later payload that omits imageUrl must not
    // clear it, and a payload that tries to set it must be refused.
    await prisma.productVariant.update({ where: { id: firstVariant.id }, data: { imageUrl: IMAGE } });
    const legacyUpdate = await sellerService.updateSellerProduct(owner.id, imageProduct.id, {
      variants: [
        {
          id: firstVariant.id,
          name: firstVariant.name,
          sku: firstVariant.sku,
          priceKobo: firstVariant.priceKobo.toString(),
          stock: 2,
          attributes: firstVariant.attributes as Record<string, string | number | boolean> | null,
          isActive: true
        }
      ]
    });
    const legacyAfter = legacyUpdate.variants.find((variant) => variant.id === firstVariant.id);
    check(
      "legacy variant imageUrl remains readable and is not cleared by a payload without it",
      legacyAfter?.imageUrl === IMAGE,
      `imageUrl=${legacyAfter?.imageUrl ?? "missing"}`
    );

    const legacySetRejection = await capture(() =>
      sellerService.updateSellerProduct(owner.id, imageProduct.id, {
        variants: [
          {
            id: firstVariant.id,
            name: firstVariant.name,
            sku: firstVariant.sku,
            priceKobo: firstVariant.priceKobo.toString(),
            stock: 2,
            attributes: firstVariant.attributes as Record<string, string | number | boolean> | null,
            isActive: true,
            imageUrl: IMAGE
          }
        ]
      })
    );
    check(
      "an update cannot set a variant image",
      legacySetRejection.ok === false &&
        errorStatus(legacySetRejection.error) === 400 &&
        errorCode(legacySetRejection.error) === "unsupported_variant_field",
      legacySetRejection.ok
        ? "no error was raised"
        : `status=${errorStatus(legacySetRejection.error)} code=${errorCode(legacySetRejection.error)}`
    );
    const legacyUnchanged = await prisma.productVariant.findUniqueOrThrow({ where: { id: firstVariant.id } });
    check("legacy variant imageUrl is unchanged after the refused update", legacyUnchanged.imageUrl === IMAGE, `imageUrl=${legacyUnchanged.imageUrl}`);

    const productImageUpdate = await sellerService.updateSellerProduct(owner.id, imageProduct.id, {
      images: [{ url: SECOND_IMAGE, alt: "Home and kitchen category artwork" }]
    });
    check(
      "product-level image management remains available",
      productImageUpdate.images.length === 1 && productImageUpdate.images[0]?.url === SECOND_IMAGE,
      `images=${productImageUpdate.images.map((image) => image.url).join(",")}`
    );

    /* 2. Missing stock row + concurrent quantity write -------------------- */
    const missingRowProduct = await createProduct("missing stock row", { quantity: null });
    check(
      "fixture product starts without an InventoryStock row",
      missingRowProduct.stock === null,
      `stock=${missingRowProduct.stock ? "present" : "missing"}`
    );

    const transitionGate = new Promise<void>((resolve) => {
      releaseTransition = resolve;
    });
    let transitionWrote!: () => void;
    const transitionWrotePromise = new Promise<void>((resolve) => {
      transitionWrote = resolve;
    });

    const parsedLegacyVariants = parseVariantsPayload([variantPayload("LEGACYROW", 3)]);
    assert(parsedLegacyVariants && parsedLegacyVariants.length === 1, "direct transition payload did not parse");
    const transition = transitionClient
      .$transaction(
        async (tx) => {
          // This is the real transition function. It must create/lock the zero
          // stock row before the variant rows are written.
          await syncProductVariants({
            tx,
            productId: missingRowProduct.id,
            productCurrency: "NGN",
            variants: parsedLegacyVariants
          });
          transitionWrote();
          await transitionGate;
        },
        { timeout: 30_000, maxWait: 5_000 }
      )
      .then(
        () => ({ status: "fulfilled" as const, value: undefined }),
        (error: unknown) => ({ status: "rejected" as const, error })
      );

    await transitionWrotePromise;

    const competingWrite = sellerService.updateSellerProduct(owner.id, missingRowProduct.id, { quantity: 5 }).then(
      (value) => ({ status: "fulfilled" as const, value }),
      (error: unknown) => ({ status: "rejected" as const, error })
    );
    const blockedWhileTransitionOpen = await Promise.race([
      competingWrite.then(() => "settled"),
      delay(750).then(() => "pending")
    ]);
    check(
      "a missing-row transition serialises the concurrent quantity write",
      blockedWhileTransitionOpen === "pending",
      `competing write was ${blockedWhileTransitionOpen} while the transition transaction was open`
    );

    releaseTransition?.();
    const transitionOutcome = await transition;
    const competingOutcome = await competingWrite;
    check("the variant transition itself commits", transitionOutcome.status === "fulfilled", transitionOutcome.status === "rejected" ? errorMessage(transitionOutcome.error) : "committed");
    check(
      "the competing quantity write is refused with variant_stock_managed",
      competingOutcome.status === "rejected" && errorCode(competingOutcome.error) === "variant_stock_managed",
      competingOutcome.status === "fulfilled"
        ? "the product-level quantity write succeeded"
        : `code=${errorCode(competingOutcome.error)} status=${errorStatus(competingOutcome.error)}`
    );
    const missingRowStock = await prisma.inventoryStock.findUnique({ where: { productId: missingRowProduct.id } });
    const missingRowVariants = await prisma.productVariant.findMany({ where: { productId: missingRowProduct.id } });
    check(
      "the legacy product ends with a zero product-level row and one active variant",
      missingRowStock?.quantity === 0 && missingRowStock?.reserved === 0 && missingRowVariants.filter((variant) => variant.isActive).length === 1,
      `quantity=${missingRowStock?.quantity ?? "missing"} reserved=${missingRowStock?.reserved ?? "missing"} activeVariants=${missingRowVariants.filter((variant) => variant.isActive).length}`
    );

    /* 3. Missing-row lock wait times out cleanly -------------------------- */
    const timeoutProduct = await createProduct("lock timeout", { quantity: null });
    const heldStockId = `STOCK-${runId}-${randomBytes(2).toString("hex")}`;
    await lockClient.query("BEGIN");
    await lockClient.query(
      `INSERT INTO "InventoryStock" ("id", "productId", "quantity", "reserved", "lowStockLevel", "updatedAt")
       VALUES ($1, $2, 0, 0, 3, NOW())`,
      [heldStockId, timeoutProduct.id]
    );
    const timeoutStarted = Date.now();
    const timeoutAttempt = prisma
      .$transaction(
        async (tx) => {
          // A real database-side bound: Prisma's own transaction timeout does
          // not cancel an already-blocked query, so Postgres must do it. The
          // setting is transaction-local and resets on rollback.
          await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '1500ms'");
          await lockInventoryStock(tx, timeoutProduct.id);
          return "lock acquired";
        },
        { timeout: 10_000, maxWait: 3_000 }
      )
      .then(
        (value) => ({ status: "fulfilled" as const, value }),
        (error: unknown) => ({ status: "rejected" as const, error })
      );
    let timeoutOutcome: Awaited<typeof timeoutAttempt> | { status: "still_blocked" } = await Promise.race([
      timeoutAttempt,
      delay(6_000).then(() => ({ status: "still_blocked" as const }))
    ]);
    if (timeoutOutcome.status === "still_blocked") {
      // Safety valve for the harness itself. Release the holder, then collect
      // the (now unblocked) attempt so no session is left behind. The check
      // below fails because the statement was not bounded.
      await lockClient.query("ROLLBACK");
      timeoutOutcome = await timeoutAttempt;
    } else {
      await lockClient.query("ROLLBACK");
    }
    const timeoutElapsed = Date.now() - timeoutStarted;
    check(
      "a blocked inventory lock wait is bounded by the database statement timeout",
      timeoutOutcome.status === "rejected" &&
        isDeadlockOrTimeout(timeoutOutcome.error) &&
        timeoutElapsed < 8_000,
      timeoutOutcome.status === "fulfilled"
        ? `lock returned without a database timeout after ${timeoutElapsed}ms`
        : `elapsed=${timeoutElapsed}ms code=${errorCode(timeoutOutcome.error)} sql=${(timeoutOutcome.error as { meta?: { code?: unknown } } | null)?.meta?.code ?? "none"} message=${errorMessage(timeoutOutcome.error).slice(0, 160)}`
    );
    const timeoutStockAfter = await prisma.inventoryStock.findUnique({ where: { productId: timeoutProduct.id } });
    check(
      "the timed-out transaction left no stock row or variant behind",
      timeoutStockAfter === null && (await prisma.productVariant.count({ where: { productId: timeoutProduct.id } })) === 0,
      `stock=${timeoutStockAfter ? "present" : "missing"}`
    );

    /* 4. Live product-level cart line blocks conversion ------------------- */
    const conversionProduct = await createProduct("conversion live cart", { quantity: 5 });
    const conversionCart = await add({ userId: customer.id, productId: conversionProduct.id, quantity: 1 });
    if (!created.cartIds.includes(conversionCart.id)) created.cartIds.push(conversionCart.id);
    const liveLine = conversionCart.items.find((item) => item.productId === conversionProduct.id);
    assert(liveLine, "product-level cart line fixture missing");
    check(
      "the product-level cart line starts purchasable",
      Boolean(liveLine) && liveLine.availability.purchasable === true && liveLine.variantId === null,
      JSON.stringify(liveLine?.availability)
    );

    const conversionRefusal = await capture(() =>
      sellerService.updateSellerProduct(owner.id, conversionProduct.id, {
        quantity: 0,
        variants: [variantPayload("CONVERT", 5)]
      })
    );
    check(
      "converting a product with a live product-level cart line is refused with product_in_live_cart",
      conversionRefusal.ok === false &&
        errorStatus(conversionRefusal.error) === 409 &&
        errorCode(conversionRefusal.error) === "product_in_live_cart",
      conversionRefusal.ok
        ? "conversion succeeded"
        : `status=${errorStatus(conversionRefusal.error)} code=${errorCode(conversionRefusal.error)}`
    );
    const conversionStockAfter = await prisma.inventoryStock.findUnique({ where: { productId: conversionProduct.id } });
    const conversionVariantsAfter = await prisma.productVariant.findMany({ where: { productId: conversionProduct.id } });
    const cartAfterRefusal = await cartService.getOrCreateActiveCart(customer.id);
    const lineAfterRefusal = cartAfterRefusal.items.find((item) => item.id === liveLine?.id);
    check(
      "the refusal leaves stock, variants and the cart line unchanged",
      conversionStockAfter?.quantity === 5 &&
        conversionStockAfter?.reserved === 0 &&
        conversionVariantsAfter.length === 0 &&
        lineAfterRefusal?.quantity === 1 &&
        lineAfterRefusal?.variantId === null &&
        lineAfterRefusal?.availability.purchasable === true,
      `quantity=${conversionStockAfter?.quantity} variants=${conversionVariantsAfter.length} line=${lineAfterRefusal?.quantity} purchasable=${lineAfterRefusal?.availability.purchasable}`
    );

    await cartService.updateCartItem({
      userId: customer.id,
      itemId: liveLine!.id,
      quantity: 1,
      savedForLater: true
    });
    const savedConversion = await capture(() =>
      sellerService.updateSellerProduct(owner.id, conversionProduct.id, {
        quantity: 0,
        variants: [variantPayload("CONVERT", 5)]
      })
    );
    const savedVariants = await prisma.productVariant.findMany({ where: { productId: conversionProduct.id } });
    const savedStock = await prisma.inventoryStock.findUnique({ where: { productId: conversionProduct.id } });
    check(
      "a saved-for-later line does not block conversion",
      savedConversion.ok === true && savedStock?.quantity === 0 && savedVariants.filter((variant) => variant.isActive).length === 1,
      savedConversion.ok ? `quantity=${savedStock?.quantity} variants=${savedVariants.length}` : errorCode(savedConversion.error)
    );
    const cartAfterConversion = await cartService.getOrCreateActiveCart(customer.id);
    const savedLine = cartAfterConversion.items.find((item) => item.id === liveLine?.id);
    check(
      "the saved line becomes unavailable after conversion instead of being silently sold",
      savedLine?.savedForLater === true &&
        savedLine?.availability.purchasable === false &&
        savedLine?.availability.reason === "variant_required",
      JSON.stringify(savedLine?.availability)
    );

    const historicalProduct = await createProduct("conversion historical cart", { quantity: 5 });
    const historicalCart = await prisma.cart.create({
      data: {
        userId: customer.id,
        status: "CHECKED_OUT",
        items: { create: { productId: historicalProduct.id, quantity: 1 } }
      },
      include: { items: true }
    });
    created.cartIds.push(historicalCart.id);
    const historicalConversion = await capture(() =>
      sellerService.updateSellerProduct(owner.id, historicalProduct.id, {
        quantity: 0,
        variants: [variantPayload("HISTORICAL", 5)]
      })
    );
    const historicalVariants = await prisma.productVariant.findMany({ where: { productId: historicalProduct.id } });
    check(
      "a historical CHECKED_OUT line does not block conversion",
      historicalConversion.ok === true && historicalVariants.filter((variant) => variant.isActive).length === 1,
      historicalConversion.ok ? `variants=${historicalVariants.length}` : errorCode(historicalConversion.error)
    );
    const historicalLineStillReadable = await prisma.cartItem.findFirstOrThrow({ where: { cartId: historicalCart.id } });
    check(
      "the historical cart line remains readable",
      historicalLineStillReadable.variantId === null && historicalLineStillReadable.quantity === 1,
      `variant=${historicalLineStillReadable.variantId} quantity=${historicalLineStillReadable.quantity}`
    );

    /* 5. Same-customer concurrent cart adds ------------------------------ */
    const concurrentProduct = await createProduct("cart concurrency", { quantity: 5 });
    const concurrentResults = await Promise.allSettled([
      add({ userId: customer.id, productId: concurrentProduct.id, quantity: 1 }),
      add({ userId: customer.id, productId: concurrentProduct.id, quantity: 1 })
    ]);
    const concurrentFulfilled = concurrentResults.filter((result) => result.status === "fulfilled").length;
    const concurrentLines = await prisma.cartItem.findMany({
      where: { cart: { userId: customer.id, status: "ACTIVE" }, productId: concurrentProduct.id }
    });
    check(
      "two concurrent same-customer adds create one line with the combined quantity",
      concurrentFulfilled === 2 && concurrentLines.length === 1 && concurrentLines[0]?.quantity === 2,
      `fulfilled=${concurrentFulfilled} lines=${concurrentLines.length} quantity=${concurrentLines[0]?.quantity}`
    );

    const crossConnectionProduct = await createProduct("cart user lock", { quantity: 5 });
    await lockClient.query("BEGIN");
    await lockClient.query('SELECT id FROM "User" WHERE id = $1 FOR UPDATE', [customer.id]);
    const crossConnectionAdd = add({ userId: customer.id, productId: crossConnectionProduct.id, quantity: 1 }).then(
      (value) => ({ status: "fulfilled" as const, value }),
      (error: unknown) => ({ status: "rejected" as const, error })
    );
    const crossConnectionWait = await Promise.race([
      crossConnectionAdd.then(() => "settled"),
      delay(750).then(() => "pending")
    ]);
    check(
      "a cart add waits on the cross-connection user-row lock",
      crossConnectionWait === "pending",
      `add was ${crossConnectionWait} while another connection held the user lock`
    );
    await lockClient.query("COMMIT");
    const crossConnectionOutcome = await crossConnectionAdd;
    check(
      "the cart add completes after the cross-connection lock is released",
      crossConnectionOutcome.status === "fulfilled",
      crossConnectionOutcome.status === "rejected" ? errorCode(crossConnectionOutcome.error) : "committed"
    );

    const lastUnitProduct = await createProduct("cart last unit", { quantity: 1 });
    const lastUnitResults = await Promise.allSettled([
      add({ userId: customer.id, productId: lastUnitProduct.id, quantity: 1 }),
      add({ userId: customer.id, productId: lastUnitProduct.id, quantity: 1 })
    ]);
    const lastUnitFulfilled = lastUnitResults.filter((result) => result.status === "fulfilled").length;
    const lastUnitRejected = lastUnitResults.find(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );
    const lastUnitLines = await prisma.cartItem.findMany({
      where: { cart: { userId: customer.id, status: "ACTIVE" }, productId: lastUnitProduct.id }
    });
    check(
      "a last-unit race cannot oversell or create a duplicate line",
      lastUnitFulfilled === 1 &&
        lastUnitRejected !== undefined &&
        errorCode(lastUnitRejected.reason) === "insufficient_stock" &&
        lastUnitLines.length === 1 &&
        lastUnitLines[0]?.quantity === 1,
      `fulfilled=${lastUnitFulfilled} rejected=${
        lastUnitRejected ? `${errorCode(lastUnitRejected.reason) || errorMessage(lastUnitRejected.reason)}` : "none"
      } lines=${lastUnitLines.length} quantity=${lastUnitLines[0]?.quantity}`
    );

    /* 6. Canonical stock -> variant lock order stress -------------------- */
    const stressProduct = await createProduct("lock stress", {
      quantity: 0,
      variants: [
        { name: "Stress Small", sku: `${runId}-STRESS-S`, priceKobo: 100_000n, stock: 100, attributes: { Size: "Small" }, isActive: true },
        { name: "Stress Large", sku: `${runId}-STRESS-L`, priceKobo: 110_000n, stock: 100, attributes: { Size: "Large" }, isActive: true }
      ]
    });
    const stressVariants = await prisma.productVariant.findMany({ where: { productId: stressProduct.id }, orderBy: { id: "asc" } });
    const stressVariant = stressVariants[0];
    assert(stressVariant, "stress variant fixture missing");
    const stressPayload = stressVariants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      sku: variant.sku,
      priceKobo: variant.priceKobo.toString(),
      stock: variant.stock,
      attributes: variant.attributes as Record<string, string | number | boolean> | null,
      isActive: variant.isActive
    }));
    const stressErrors: string[] = [];
    for (let round = 1; round <= 3; round += 1) {
      const roundResults = await Promise.allSettled([
        add({ userId: customer.id, productId: stressProduct.id, variantId: stressVariant.id, quantity: 1 }),
        sellerService.updateSellerProduct(owner.id, stressProduct.id, { variants: stressPayload }),
        add({ userId: secondCustomer.id, productId: stressProduct.id, variantId: stressVariant.id, quantity: 1 })
      ]);
      for (const result of roundResults) {
        if (result.status === "rejected") stressErrors.push(errorCode(result.reason) || errorMessage(result.reason));
      }
      await prisma.cartItem.deleteMany({ where: { productId: stressProduct.id } });
    }
    check(
      "concurrent cart/variant writes complete under the canonical lock order",
      stressErrors.length === 0,
      stressErrors.length === 0 ? "3 rounds, no rejected operation" : stressErrors.join(" | ")
    );
    const stressStock = await prisma.inventoryStock.findUnique({ where: { productId: stressProduct.id } });
    const stressAfter = await prisma.productVariant.findMany({ where: { productId: stressProduct.id }, orderBy: { id: "asc" } });
    check(
      "the stress round leaves product stock at zero and variant stock intact",
      stressStock?.quantity === 0 && stressAfter.every((variant) => variant.stock === 100 && variant.isActive),
      `productQuantity=${stressStock?.quantity} variants=${stressAfter.map((variant) => `${variant.stock}/${variant.isActive}`).join(",")}`
    );
  } finally {
    releaseTransition?.();
    await transitionClient.$disconnect().catch(() => undefined);
    await cleanup();
    await lockClient.end().catch(() => undefined);
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
  console.error(`FATAL ${errorMessage(error)}`);
  try {
    await cleanup();
  } finally {
    await lockClient.end().catch(() => undefined);
    await transitionClient.$disconnect().catch(() => undefined);
    await prisma.$disconnect();
  }
  process.exit(1);
});
