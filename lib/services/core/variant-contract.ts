import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/auth/guard";

/**
 * Variant publication/inventory contract.
 *
 * One stock source is authoritative for each product:
 *   - no active variants: `InventoryStock.quantity/reserved`
 *   - one or more active variants: the sum of `ProductVariant.stock/reserved`
 *
 * A variant product's product-level stock row is kept at zero. Adding variants
 * to a product with product-level stock is refused rather than silently
 * ignoring one of the two numbers. Product-level quantity writes are refused
 * while active variants exist.
 */

export type VariantAttributes = Record<string, string | number | boolean>;

export type VariantInput = {
  id: string | null;
  name: string;
  sku: string;
  priceKobo: bigint;
  stock: number;
  attributes: VariantAttributes | null;
  isActive: boolean;
  currency: string | null;
};

export type VariantSnapshot = {
  id: string;
  name: string;
  sku: string;
  priceKobo: string;
  stock: number;
  reserved: number;
  isActive: boolean;
  attributes: VariantAttributes | null;
};

const MAX_VARIANTS = 50;
const MAX_VARIANT_STOCK = 1_000_000;
const SKU_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,63}$/;
const ATTRIBUTE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
const VARIANT_FIELDS = new Set([
  "id",
  "name",
  "sku",
  "priceKobo",
  "price",
  "stock",
  "attributes",
  "options",
  "currency",
  "isActive"
]);
/**
 * Per-variant images are deliberately not part of the variant payload. Image
 * selection belongs to the product gallery; a legacy `ProductVariant.imageUrl`
 * remains readable but cannot be set or changed through this contract.
 */
const VARIANT_IMAGE_FIELDS = new Set(["imageUrl", "imageId"]);

function fail(message: string, code = "invalid_variants", details?: Record<string, unknown>): never {
  throw new ApiError(400, code, message, details);
}

function readMinorUnits(value: unknown, field: string): bigint {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d+$/.test(text)) fail(`${field} must be a whole number of minor units.`, "invalid_variant_price");
  const parsed = BigInt(text);
  if (parsed <= BigInt(0)) fail(`${field} must be greater than zero.`, "invalid_variant_price");
  return parsed;
}

function readStock(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > MAX_VARIANT_STOCK) {
    fail(`${field} must be a whole number between 0 and ${MAX_VARIANT_STOCK}.`, "invalid_variant_stock");
  }
  return parsed;
}

function readAttributes(value: unknown, field: string): VariantAttributes | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    fail(`${field} must be an object of option names and values.`, "invalid_variant_options");
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 20) fail(`${field} supports at most 20 options.`, "invalid_variant_options");
  const result: VariantAttributes = {};
  for (const [key, option] of entries) {
    if (!ATTRIBUTE_KEY_PATTERN.test(key)) {
      fail(`${field} has an invalid option name "${key}".`, "invalid_variant_options");
    }
    if (typeof option === "string") {
      const text = option.trim();
      if (!text || text.length > 120) fail(`${field}.${key} must be text of 1-120 characters.`, "invalid_variant_options");
      result[key] = text;
    } else if (typeof option === "number" && Number.isFinite(option)) {
      result[key] = option;
    } else if (typeof option === "boolean") {
      result[key] = option;
    } else {
      fail(`${field}.${key} must be text, a finite number or a boolean.`, "invalid_variant_options");
    }
  }
  return result;
}

/**
 * Parse an explicit variants payload. `undefined` means "not supplied" and
 * leaves variants untouched; an empty array is a deliberate request to
 * deactivate every current variant. Any malformed payload is rejected rather
 * than ignored.
 */
export function parseVariantsPayload(value: unknown, field = "variants"): VariantInput[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    fail(`${field} must be an array of variant records.`, "invalid_variants");
  }
  if (value.length > MAX_VARIANTS) {
    fail(`A product can have at most ${MAX_VARIANTS} variants.`, "too_many_variants");
  }
  const seenSkus = new Set<string>();
  const seenIds = new Set<string>();
  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      fail(`${field}[${index}] must be a variant object.`, "invalid_variants");
    }
    const row = raw as Record<string, unknown>;
    for (const key of Object.keys(row)) {
      if (VARIANT_IMAGE_FIELDS.has(key)) {
        fail(
          `${field}[${index}] does not accept per-variant image fields ("${key}"); use the product gallery instead.`,
          "unsupported_variant_field"
        );
      }
      if (!VARIANT_FIELDS.has(key)) {
        fail(`${field}[${index}] has unsupported field "${key}".`, "unsupported_variant_field");
      }
    }
    const id =
      row.id === undefined || row.id === null || row.id === ""
        ? null
        : typeof row.id === "string" && row.id.trim()
          ? row.id.trim()
          : fail(`${field}[${index}].id must be a variant id or omitted.`, "invalid_variants");
    if (id) {
      if (seenIds.has(id)) fail(`Variant id ${id} appears more than once.`, "duplicate_variant_id");
      seenIds.add(id);
    }
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (name.length < 1 || name.length > 80) {
      fail(`${field}[${index}].name must be 1-80 characters.`, "invalid_variant_name");
    }
    const sku = (typeof row.sku === "string" ? row.sku.trim() : "").toUpperCase();
    if (!SKU_PATTERN.test(sku)) {
      fail(`${field}[${index}].sku must be 2-64 uppercase letters, digits, "_" or "-".`, "invalid_variant_sku");
    }
    if (seenSkus.has(sku)) fail(`Variant SKU ${sku} appears more than once.`, "duplicate_variant_sku");
    seenSkus.add(sku);
    if (row.options !== undefined && row.attributes !== undefined) {
      fail(`${field}[${index}] must use either attributes or options, not both.`, "invalid_variant_options");
    }
    const attributes = readAttributes(
      row.attributes !== undefined ? row.attributes : row.options,
      `${field}[${index}].attributes`
    );
    const currency =
      row.currency === undefined || row.currency === null
        ? null
        : typeof row.currency === "string" && row.currency.trim()
          ? row.currency.trim().toUpperCase()
          : fail(`${field}[${index}].currency must be text or omitted.`, "invalid_variant_currency");
    return {
      id,
      name,
      sku,
      priceKobo: readMinorUnits(row.priceKobo ?? row.price ?? null, `${field}[${index}].priceKobo`),
      stock: readStock(row.stock ?? 0, `${field}[${index}].stock`),
      attributes,
      isActive:
        row.isActive === undefined
          ? true
          : typeof row.isActive === "boolean"
            ? row.isActive
            : fail(`${field}[${index}].isActive must be true or false.`, "invalid_variant_state"),
      currency
    };
  });
}

export function activeVariantStock(
  variants: Array<{ isActive: boolean; stock: number; reserved: number }>
): { available: number; active: number; reserved: number } {
  const active = variants.filter((variant) => variant.isActive);
  return {
    active: active.length,
    available: active.reduce((total, variant) => total + Math.max(variant.stock - variant.reserved, 0), 0),
    reserved: active.reduce((total, variant) => total + variant.reserved, 0)
  };
}

export function variantSnapshot(variant: {
  id: string;
  name: string;
  sku: string;
  priceKobo: bigint;
  stock: number;
  reserved: number;
  isActive: boolean;
  attributes: Prisma.JsonValue | null;
}): VariantSnapshot & { attributes: VariantAttributes | null } {
  return {
    id: variant.id,
    name: variant.name,
    sku: variant.sku,
    priceKobo: variant.priceKobo.toString(),
    stock: variant.stock,
    reserved: variant.reserved,
    isActive: variant.isActive,
    attributes:
      variant.attributes && typeof variant.attributes === "object" && !Array.isArray(variant.attributes)
        ? (variant.attributes as VariantAttributes)
        : null
  };
}

export type LockedStockRow = { quantity: number; reserved: number };

/**
 * Lock the product-level inventory row for the rest of the caller's
 * transaction.
 *
 * Every writer that compares an absolute quantity with reservations must use
 * this (not a pre-transaction read): a concurrent checkout reservation or a
 * variant transition takes the same row lock, so the check and the write are
 * serialised.
 *
 * Legacy products may predate the mandatory stock row. The helper creates a
 * zero row inside the caller's transaction and then locks it, so a later
 * cart/reservation/quantity write cannot slip between "there is no row" and
 * the variant transition. `ON CONFLICT DO NOTHING` makes two first-time
 * creators queue on the same unique productId; the loser re-reads the committed
 * zero row under `FOR UPDATE`.
 */
export async function lockInventoryStock(
  tx: Prisma.TransactionClient,
  productId: string
): Promise<LockedStockRow> {
  const existing = await tx.$queryRaw<LockedStockRow[]>`
    SELECT "quantity", "reserved" FROM "InventoryStock" WHERE "productId" = ${productId} FOR UPDATE
  `;
  if (existing[0]) return existing[0];

  await tx.$executeRaw`
    INSERT INTO "InventoryStock" ("id", "productId", "quantity", "reserved", "lowStockLevel", "updatedAt")
    VALUES (${randomUUID()}, ${productId}, 0, 0, 3, NOW())
    ON CONFLICT ("productId") DO NOTHING
  `;
  const created = await tx.$queryRaw<LockedStockRow[]>`
    SELECT "quantity", "reserved" FROM "InventoryStock" WHERE "productId" = ${productId} FOR UPDATE
  `;
  if (!created[0]) {
    // The product row disappeared between the insert and the lock, or the
    // database rejected the fixture row without raising. Never continue with
    // an unserialised stock decision.
    throw new ApiError(409, "stock_lock_unavailable", "The product inventory row could not be locked.");
  }
  return created[0];
}

/**
 * The single quantity-vs-reserved contract for product-level inventory.
 *
 * Must run while `lockInventoryStock` holds the row. Variant-managed products
 * cannot accept a non-zero product quantity at all; any product quantity below
 * the units already promised to open orders is refused.
 */
export async function assertLockedProductQuantity(
  tx: Prisma.TransactionClient,
  input: { productId: string; quantity: number }
): Promise<LockedStockRow> {
  const stock = await lockInventoryStock(tx, input.productId);
  // Re-read active variants under the stock lock: a concurrent variant
  // transition also takes this lock first, so the two cannot interleave.
  const activeVariants = await tx.productVariant.count({
    where: { productId: input.productId, isActive: true }
  });
  if (activeVariants > 0 && input.quantity !== 0) {
    throw new ApiError(
      409,
      "variant_stock_managed",
      "This product uses variant stock. Edit variant quantities instead of the product-level inventory."
    );
  }
  const reserved = stock.reserved;
  if (input.quantity < reserved) {
    throw new ApiError(
      409,
      "stock_below_reserved",
      `Inventory cannot be set to ${input.quantity} while ${reserved} units are reserved by open orders.`,
      { productId: input.productId, quantity: input.quantity, reserved }
    );
  }
  return stock;
}

/**
 * Reconcile the submitted variant set inside the caller's transaction.
 *
 * Existing rows stay addressable by id (or SKU when id is omitted). Rows
 * omitted from the payload are deactivated rather than deleted, preserving
 * historical order references. A deactivation is refused while the variant is
 * reserved or sitting in a live cart.
 */
export async function syncProductVariants(input: {
  tx: Prisma.TransactionClient;
  productId: string;
  productCurrency: string;
  variants: VariantInput[];
  allowZeroProductStock?: boolean;
}): Promise<{ before: VariantSnapshot[]; after: VariantSnapshot[]; active: number }> {
  const { tx, productId, productCurrency } = input;
  const stockRow = await lockInventoryStock(tx, productId);
  await tx.$queryRaw`
    SELECT id FROM "ProductVariant" WHERE "productId" = ${productId} ORDER BY id FOR UPDATE
  `;
  const existing = await tx.productVariant.findMany({
    where: { productId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });
  const before = existing.map(variantSnapshot);
  const existingById = new Map(existing.map((variant) => [variant.id, variant]));
  const existingBySku = new Map(existing.map((variant) => [variant.sku, variant]));
  const touched = new Set<string>();
  const targetActive = input.variants.filter((variant) => variant.isActive);
  const wasVariantManaged = existing.some((variant) => variant.isActive);

  // Activation/conversion is the moment the product-level pool stops being the
  // sellable source. A live unsaved product-level cart line would become
  // unfulfillable at checkout, so it is a commitment that must be cleared
  // before the transition. Saved-for-later lines are not reservations and
  // historical CHECKED_OUT carts are never rewritten; neither blocks.
  //
  // This check runs after the stock row lock and before any stock, variant or
  // cart write, so a concurrent cart add either commits before it (and is seen)
  // or waits for the stock lock and re-reads the active variants afterwards.
  if (targetActive.length > 0 && !wasVariantManaged) {
    const liveProductLines = await tx.cartItem.count({
      where: {
        productId,
        variantId: null,
        savedForLater: false,
        cart: { status: "ACTIVE" }
      }
    });
    if (liveProductLines > 0) {
      throw new ApiError(
        409,
        "product_in_live_cart",
        "This product has an item without an option in an active cart. It must be removed or saved for later before the listing can move to option-level stock.",
        { productId, liveCartLines: liveProductLines }
      );
    }
  }

  if (targetActive.length > 0 && stockRow.quantity !== 0) {
    if (!input.allowZeroProductStock || stockRow.reserved > 0) {
      throw new ApiError(
        409,
        "variant_stock_conflict",
        "A variant product's product-level inventory must be zero. Set the product quantity to 0 before adding variants.",
        {
          productId,
          quantity: stockRow.quantity,
          reserved: stockRow.reserved,
          allowZeroProductStock: Boolean(input.allowZeroProductStock),
          activeVariantsRequested: targetActive.length
        }
      );
    }
    // Atomic one-save transition: the request explicitly sets product-level
    // quantity to zero and nothing is reserved against that source.
    await tx.inventoryStock.update({ where: { productId }, data: { quantity: 0 } });
  }

  const updates: Array<{ id: string; data: Prisma.ProductVariantUpdateInput }> = [];
  const creates: VariantInput[] = [];

  for (const variant of input.variants) {
    if (variant.currency && variant.currency !== productCurrency.toUpperCase()) {
      throw new ApiError(
        400,
        "variant_currency_mismatch",
        `Variant ${variant.sku} uses ${variant.currency} but the listing fulfilment currency is ${productCurrency}.`
      );
    }
    const matched = variant.id ? existingById.get(variant.id) : existingBySku.get(variant.sku);
    if (variant.id && !matched) {
      throw new ApiError(403, "variant_ownership", `Variant ${variant.id} does not belong to this product.`);
    }
    if (!matched) {
      creates.push(variant);
      continue;
    }
    touched.add(matched.id);
    if (variant.stock < matched.reserved) {
      throw new ApiError(
        409,
        "variant_stock_below_reserved",
        `${matched.name} has ${matched.reserved} reserved units and cannot be set below that.`
      );
    }
    if (!variant.isActive && matched.isActive) {
      await assertVariantCanDeactivate(tx, matched);
    }
    updates.push({
      id: matched.id,
      data: {
        name: variant.name,
        sku: variant.sku,
        priceKobo: variant.priceKobo,
        stock: variant.stock,
        attributes: variant.attributes ? (variant.attributes as Prisma.InputJsonValue) : Prisma.DbNull,
        isActive: variant.isActive
      }
    });
  }

  for (const variant of existing) {
    if (touched.has(variant.id) || !variant.isActive) continue;
    await assertVariantCanDeactivate(tx, variant);
  }

  try {
    for (const update of updates) {
      await tx.productVariant.update({ where: { id: update.id }, data: update.data });
    }
    for (const variant of existing) {
      if (touched.has(variant.id) || !variant.isActive) continue;
      await tx.productVariant.update({ where: { id: variant.id }, data: { isActive: false } });
    }
    for (const variant of creates) {
      await tx.productVariant.create({
        data: {
          productId,
          name: variant.name,
          sku: variant.sku,
          priceKobo: variant.priceKobo,
          stock: variant.stock,
          attributes: variant.attributes ? (variant.attributes as Prisma.InputJsonValue) : undefined,
          isActive: variant.isActive
        }
      });
    }
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002") {
      throw new ApiError(409, "duplicate_variant_sku", "That variant SKU is already used by another listing.");
    }
    throw error;
  }

  const afterRows = await tx.productVariant.findMany({
    where: { productId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });
  return {
    before,
    after: afterRows.map(variantSnapshot),
    active: afterRows.filter((variant) => variant.isActive).length
  };
}

async function assertVariantCanDeactivate(
  tx: Prisma.TransactionClient,
  variant: { id: string; name: string; reserved: number }
) {
  // Only lines the customer can actually check out are live commitments.
  // `savedForLater` rows stay readable (and become unavailable in the cart) but
  // are not reservations, so they do not keep a variant on sale. Historical
  // CHECKED_OUT carts and order items are already excluded by `status` and are
  // never deleted or rewritten by deactivation.
  const liveCartLines = await tx.cartItem.count({
    where: {
      variantId: variant.id,
      savedForLater: false,
      cart: { status: "ACTIVE" }
    }
  });
  if (variant.reserved > 0 || liveCartLines > 0) {
    throw new ApiError(
      409,
      "variant_in_use",
      `${variant.name} is reserved by an order or in a live cart and cannot be deactivated.`,
      { variantId: variant.id, reserved: variant.reserved, liveCartLines }
    );
  }
}

/**
 * Refuse a product-level quantity write while variant stock is authoritative.
 * Locks the inventory row and re-checks both invariants, so it is safe to use
 * as the transaction-scoped guard from every seller/admin quantity path.
 */
export async function assertProductQuantityAllowed(
  tx: Prisma.TransactionClient,
  productId: string,
  quantity: number | undefined
) {
  if (quantity === undefined) return;
  await assertLockedProductQuantity(tx, { productId, quantity });
}
