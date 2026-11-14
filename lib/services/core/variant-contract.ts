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
}): Promise<{ before: VariantSnapshot[]; after: VariantSnapshot[]; active: number }> {
  const { tx, productId, productCurrency } = input;
  const stock = await tx.$queryRaw<Array<{ quantity: number; reserved: number }>>`
    SELECT "quantity", "reserved" FROM "InventoryStock" WHERE "productId" = ${productId} FOR UPDATE
  `;
  const stockRow = stock[0] ?? null;
  const existing = await tx.productVariant.findMany({
    where: { productId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });
  const before = existing.map(variantSnapshot);
  const existingById = new Map(existing.map((variant) => [variant.id, variant]));
  const existingBySku = new Map(existing.map((variant) => [variant.sku, variant]));
  const touched = new Set<string>();
  const targetActive = input.variants.filter((variant) => variant.isActive);
  if (targetActive.length > 0 && stockRow && stockRow.quantity !== 0) {
    throw new ApiError(
      409,
      "variant_stock_conflict",
      "A variant product's product-level inventory must be zero. Set the product quantity to 0 before adding variants."
    );
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
  const cartRows = await tx.cartItem.count({ where: { variantId: variant.id } });
  if (variant.reserved > 0 || cartRows > 0) {
    throw new ApiError(
      409,
      "variant_in_use",
      `${variant.name} is reserved by an order or present in a live cart and cannot be deactivated.`
    );
  }
}

/** Refuse a product-level quantity write while variant stock is authoritative. */
export async function assertProductQuantityAllowed(
  tx: Prisma.TransactionClient,
  productId: string,
  quantity: number | undefined
) {
  if (quantity === undefined) return;
  const active = await tx.productVariant.count({ where: { productId, isActive: true } });
  if (active > 0 && quantity !== 0) {
    throw new ApiError(
      409,
      "variant_stock_managed",
      "This product uses variant stock. Edit variant quantities instead of the product-level inventory."
    );
  }
}
