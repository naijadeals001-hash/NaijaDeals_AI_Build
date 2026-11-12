import { existsSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import type { SessionUser } from "@/lib/auth/session";
import { assertRegion, countryScopeWhere } from "@/lib/auth/scope";
import { COUNTRIES } from "@/lib/config/commerce";
import { markForIndex } from "@/lib/infra/search-sync";
import { recordAudit } from "./audit.service";

const DEMO_VENDOR_SLUG = "demo-catalogue-review";
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_IMAGES = 6;
const MAX_IMAGE_URL = 500;
const MAX_IMAGE_ALT = 220;

function slugify(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
}

function text(value: unknown, field: string, min: number, max: number) {
  if (typeof value !== "string") throw new ApiError(400, "validation_error", `${field} is required.`);
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw new ApiError(400, "validation_error", `${field} must be ${min}-${max} characters.`);
  }
  return trimmed;
}

function integer(value: unknown, field: string, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new ApiError(400, "validation_error", `${field} must be a whole number between ${min} and ${max}.`);
  }
  return parsed;
}

function money(value: unknown): bigint {
  const raw =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : Number.NaN;
  if (!Number.isSafeInteger(raw) || raw <= 0) {
    throw new ApiError(400, "validation_error", "priceKobo must be a positive integer amount in minor units.");
  }
  if (raw > 1_000_000_000_000) throw new ApiError(400, "validation_error", "priceKobo is too large.");
  return BigInt(raw);
}

function readSlug(value: unknown, field: string, max = 70): string {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!raw) throw new ApiError(400, "validation_error", `${field} is required.`);
  if (raw.length > max || !SLUG_PATTERN.test(raw)) {
    throw new ApiError(
      400,
      "invalid_slug",
      `${field} must be lowercase letters, numbers and single hyphens (for example "home-kitchen").`
    );
  }
  return raw;
}

/**
 * Project-path or HTTPS image validation.
 *
 * A project path must resolve inside `public/`; `..` traversal and non-HTTPS
 * remote URLs are rejected. Every stored image must carry accessible alt text.
 */
export function validateImage(imageUrl: unknown, alt: unknown, required: boolean) {
  const url = typeof imageUrl === "string" ? imageUrl.trim() : "";
  const altText = typeof alt === "string" ? alt.trim() : "";
  if (!url) {
    if (required) throw new ApiError(400, "image_required", "A product image is required before publishing.");
    return { imageUrl: null, imageAlt: null };
  }
  if (url.length > MAX_IMAGE_URL) throw new ApiError(400, "invalid_image", "Image location is too long.");
  if (altText.length > MAX_IMAGE_ALT) throw new ApiError(400, "invalid_alt", "Accessible image text is too long.");
  if (url.startsWith("/")) {
    const publicRoot = path.resolve(process.cwd(), "public");
    const file = path.resolve(publicRoot, url.replace(/^\/+/, ""));
    if (!file.startsWith(`${publicRoot}${path.sep}`)) {
      throw new ApiError(400, "invalid_image", "Image must stay inside the project's public assets.");
    }
    if (!existsSync(file)) throw new ApiError(400, "image_not_found", `Image ${url} does not exist in the project assets.`);
  } else if (!/^https:\/\//i.test(url)) {
    throw new ApiError(400, "invalid_image", "Image must be a project path or an HTTPS URL.");
  }
  if (!altText) throw new ApiError(400, "alt_required", "Accessible image text is required.");
  return { imageUrl: url, imageAlt: altText };
}

export type CatalogueImageInput = { url?: unknown; alt?: unknown };

function readImages(images: unknown, imageUrl: unknown, imageAlt: unknown): Array<{ url: string; alt: string }> {
  const entries: CatalogueImageInput[] = Array.isArray(images)
    ? images.slice(0, MAX_IMAGES).map((entry) =>
        entry && typeof entry === "object" ? (entry as CatalogueImageInput) : { url: entry }
      )
    : imageUrl === undefined && imageAlt === undefined
      ? []
      : [{ url: imageUrl, alt: imageAlt }];
  if (Array.isArray(images) && images.length > MAX_IMAGES) {
    throw new ApiError(400, "too_many_images", `A listing can have at most ${MAX_IMAGES} images.`);
  }
  const parsed: Array<{ url: string; alt: string }> = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const image = validateImage(entry.url, entry.alt, false);
    if (!image.imageUrl || !image.imageAlt) continue;
    if (seen.has(image.imageUrl)) throw new ApiError(400, "duplicate_image", "The same image was supplied more than once.");
    seen.add(image.imageUrl);
    parsed.push({ url: image.imageUrl, alt: image.imageAlt });
  }
  return parsed;
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

async function assertUniqueCategoryIdentity(input: { name: string; slug: string; excludeId?: string }) {
  const conflict = await prisma.category.findFirst({
    where: {
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
      OR: [{ name: input.name }, { slug: input.slug }]
    },
    select: { id: true, name: true, slug: true }
  });
  if (!conflict) return;
  if (conflict.name === input.name) throw new ApiError(409, "duplicate_department", "A department with that name already exists.");
  throw new ApiError(409, "duplicate_department_slug", "That department slug is already in use.");
}

async function assertUniqueProductSlug(slug: string, excludeId?: string) {
  const conflict = await prisma.product.findFirst({
    where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true }
  });
  if (conflict) throw new ApiError(409, "duplicate_product_slug", "That product slug is already in use.");
}

function resolveCountryAndCurrency(actor: SessionUser, countryCode: unknown, currency: unknown) {
  const requested =
    (typeof countryCode === "string" && countryCode.trim() ? countryCode.trim().toUpperCase() : null) ??
    actor.scopeCountryCode?.toUpperCase() ??
    "NG";
  const country = COUNTRIES[requested];
  if (!country || !country.enabled) {
    throw new ApiError(400, "unsupported_country", `Country ${requested} is not enabled for the catalogue.`);
  }
  if (actor.scopeCountryCode && requested !== actor.scopeCountryCode.toUpperCase()) {
    throw new ApiError(
      403,
      "region_forbidden",
      `This catalogue record belongs to ${requested} and your scope is ${actor.scopeCountryCode.toUpperCase()}.`
    );
  }
  const currencyCode = typeof currency === "string" ? currency.trim().toUpperCase() : "";
  if (currencyCode && currencyCode !== country.currency) {
    throw new ApiError(
      400,
      "currency_mismatch",
      `Currency ${currencyCode} does not match ${country.name}'s configured currency ${country.currency}.`
    );
  }
  return { countryCode: country.code, currency: country.currency };
}

async function chooseVendor(actor: SessionUser, countryCode: string, isDemo: boolean) {
  if (isDemo) {
    const demo = await prisma.vendor.findFirst({ where: { slug: DEMO_VENDOR_SLUG } });
    if (!demo) {
      throw new ApiError(409, "seller_required", "The demonstration seller is not configured in this environment.");
    }
    return demo;
  }
  const vendor = await prisma.vendor.findFirst({
    where: {
      status: "VERIFIED",
      countryCode,
      ...(actor.scopeCityCode ? { market: actor.scopeCityCode } : {})
    },
    orderBy: { createdAt: "asc" }
  });
  if (!vendor) {
    throw new ApiError(
      409,
      "seller_required",
      `A verified seller in ${countryCode} is required before a live product can be created.`
    );
  }
  return vendor;
}

async function markProductForSearchSync(productId: string) {
  // The event is a durable intent for the search worker; discovery itself is
  // always filtered from the authoritative database row. A queue outage must
  // not turn a committed moderation action into an error response.
  try {
    await markForIndex({ entityType: "PRODUCT", entityId: productId });
  } catch {
    /* the next successful catalogue write re-records the intent */
  }
}

export async function listCatalogue(actor: SessionUser) {
  const [departments, products, vendor] = await Promise.all([
    prisma.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { products: true } } }
    }),
    prisma.product.findMany({
      where: countryScopeWhere(actor),
      orderBy: { updatedAt: "desc" },
      include: {
        category: { select: { id: true, name: true, slug: true, isActive: true, isDemo: true } },
        images: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
        stock: true,
        vendor: { select: { id: true, name: true, slug: true, status: true } }
      }
    }),
    prisma.vendor.findFirst({ where: { slug: DEMO_VENDOR_SLUG }, select: { id: true, name: true, slug: true } })
  ]);
  return {
    departments,
    products: products.map((product) => ({
      ...product,
      // Currency is derived from the product's fulfilment country. There is no
      // Product.currency column; the country is the authoritative stored key.
      currency: COUNTRIES[product.countryCode]?.currency ?? null
    })),
    demoVendor: vendor
  };
}

export async function createDepartment(input: {
  actor: SessionUser;
  name: string;
  slug?: string;
  description: string;
  imageUrl?: string;
  imageAlt?: string;
  sortOrder?: unknown;
  isDemo?: boolean;
}) {
  const name = text(input.name, "Department name", 3, 80);
  const description = text(input.description, "Department description", 10, 400);
  const slug = readSlug(input.slug?.trim() ? input.slug : slugify(name), "Department slug");
  if (input.imageAlt !== undefined && String(input.imageAlt).trim()) {
    throw new ApiError(
      409,
      "schema_field_pending",
      "Department image alt text cannot be saved yet: Category.imageAlt is pending the coordinator-owned migration.",
      { field: "Category.imageAlt" }
    );
  }
  const image = validateImage(input.imageUrl, "Department image", false);
  const sortOrder =
    input.sortOrder === undefined
      ? ((await prisma.category.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1
      : integer(input.sortOrder, "Department order", 0, 9999);
  await assertUniqueCategoryIdentity({ name, slug });
  try {
    return await prisma.$transaction(async (tx) => {
      const department = await tx.category.create({
        data: {
          name,
          slug,
          description,
          imageUrl: image.imageUrl,
          sortOrder,
          isDemo: Boolean(input.isDemo)
        }
      });
      await recordAudit({
        tx,
        actorId: input.actor.id,
        action: "catalogue.department.created",
        entity: "Category",
        entityId: department.id,
        metadata: { name, slug, sortOrder, isDemo: department.isDemo, imageUrl: department.imageUrl }
      });
      return department;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(409, "duplicate_department", "A department with that name or slug already exists.");
    }
    throw error;
  }
}

export async function updateDepartment(input: {
  actor: SessionUser;
  id: string;
  name?: string;
  slug?: string;
  description?: string;
  imageUrl?: string;
  imageAlt?: string;
  sortOrder?: unknown;
  isActive?: boolean;
  isDemo?: boolean;
}) {
  if (!input.id) throw new ApiError(400, "validation_error", "Department id is required.");
  const existing = await prisma.category.findUnique({ where: { id: input.id } });
  if (!existing) throw new ApiError(404, "department_not_found", "Department not found.");
  if (input.imageAlt !== undefined && String(input.imageAlt).trim()) {
    throw new ApiError(
      409,
      "schema_field_pending",
      "Department image alt text cannot be saved yet: Category.imageAlt is pending the coordinator-owned migration.",
      { field: "Category.imageAlt" }
    );
  }
  const name = input.name === undefined ? existing.name : text(input.name, "Department name", 3, 80);
  const slug = input.slug === undefined ? existing.slug : readSlug(input.slug, "Department slug");
  const description =
    input.description === undefined ? (existing.description ?? "") : text(input.description, "Department description", 10, 400);
  const image = validateImage(
    input.imageUrl === undefined ? existing.imageUrl : input.imageUrl,
    "Department image",
    false
  );
  const sortOrder =
    input.sortOrder === undefined ? existing.sortOrder : integer(input.sortOrder, "Department order", 0, 9999);
  await assertUniqueCategoryIdentity({ name, slug, excludeId: existing.id });
  try {
    return await prisma.$transaction(async (tx) => {
      const department = await tx.category.update({
        where: { id: existing.id },
        data: {
          name,
          slug,
          description,
          imageUrl: image.imageUrl,
          sortOrder,
          isActive: typeof input.isActive === "boolean" ? input.isActive : existing.isActive,
          isDemo: typeof input.isDemo === "boolean" ? input.isDemo : existing.isDemo
        }
      });
      await recordAudit({
        tx,
        actorId: input.actor.id,
        action: "catalogue.department.updated",
        entity: "Category",
        entityId: department.id,
        metadata: {
          name: department.name,
          slug: department.slug,
          sortOrder: department.sortOrder,
          isActive: department.isActive,
          isDemo: department.isDemo,
          previous: { name: existing.name, slug: existing.slug, sortOrder: existing.sortOrder, isActive: existing.isActive }
        }
      });
      return department;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(409, "duplicate_department", "A department with that name or slug already exists.");
    }
    throw error;
  }
}

export async function createProduct(input: {
  actor: SessionUser;
  name: string;
  slug?: string;
  description: string;
  priceKobo: unknown;
  currency?: string;
  countryCode?: string;
  categoryId: string;
  quantity?: unknown;
  lowStockLevel?: unknown;
  images?: CatalogueImageInput[];
  imageUrl?: string;
  imageAlt?: string;
  isDemo?: boolean;
}) {
  const name = text(input.name, "Product name", 3, 140);
  const description = text(input.description, "Product description", 10, 2000);
  const priceKobo = money(input.priceKobo);
  const { countryCode, currency } = resolveCountryAndCurrency(input.actor, input.countryCode, input.currency);
  if (!input.categoryId) throw new ApiError(400, "validation_error", "Choose an existing department.");
  const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
  if (!category) throw new ApiError(400, "department_not_found", "Choose an existing department.");
  const images = readImages(input.images, input.imageUrl, input.imageAlt);
  const quantity = input.quantity === undefined ? 0 : integer(input.quantity, "Inventory quantity", 0, 1_000_000);
  const lowStockLevel =
    input.lowStockLevel === undefined ? 3 : integer(input.lowStockLevel, "Low stock level", 0, 1_000_000);
  const isDemo = Boolean(input.isDemo);
  const vendor = await chooseVendor(input.actor, countryCode, isDemo);
  const slug = input.slug?.trim()
    ? readSlug(input.slug, "Product slug")
    : `${slugify(name)}-${Date.now().toString(36)}`;
  await assertUniqueProductSlug(slug);

  try {
    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          vendorId: vendor.id,
          categoryId: category.id,
          name,
          slug,
          description,
          priceKobo,
          countryCode,
          status: "DRAFT",
          isDemo,
          moderationNote: isDemo ? "DEMO — demonstration inventory, not live supply" : null,
          images: images.length
            ? { create: images.map((image, index) => ({ url: image.url, alt: image.alt, sortOrder: index })) }
            : undefined,
          stock: { create: { quantity, lowStockLevel } }
        }
      });
      await recordAudit({
        tx,
        actorId: input.actor.id,
        action: "catalogue.product.created",
        entity: "Product",
        entityId: created.id,
        metadata: {
          name,
          slug,
          department: category.name,
          priceKobo: priceKobo.toString(),
          currency,
          countryCode,
          quantity,
          imageCount: images.length,
          isDemo
        }
      });
      return created;
    });
    await markProductForSearchSync(product.id);
    return product;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(409, "duplicate_product_slug", "That product slug is already in use.");
    }
    throw error;
  }
}

async function assertStockNotBelowReserved(productId: string, quantity: number) {
  const stock = await prisma.inventoryStock.findUnique({ where: { productId }, select: { reserved: true } });
  if (stock && quantity < stock.reserved) {
    throw new ApiError(
      409,
      "stock_below_reserved",
      `Inventory cannot be set to ${quantity} while ${stock.reserved} units are reserved by open orders.`
    );
  }
}

export async function updateProduct(input: {
  actor: SessionUser;
  id: string;
  name?: string;
  slug?: string;
  description?: string;
  priceKobo?: unknown;
  currency?: string;
  countryCode?: string;
  categoryId?: string;
  quantity?: unknown;
  lowStockLevel?: unknown;
  images?: CatalogueImageInput[];
  imageUrl?: string;
  imageAlt?: string;
  isDemo?: boolean;
}) {
  if (!input.id) throw new ApiError(400, "validation_error", "Product id is required.");
  const existing = await prisma.product.findUnique({
    where: { id: input.id },
    include: { images: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }, stock: true }
  });
  if (!existing) throw new ApiError(404, "product_not_found", "Product not found.");
  assertRegion(input.actor, { countryCode: existing.countryCode });

  if (input.countryCode !== undefined && input.countryCode.trim().toUpperCase() !== existing.countryCode.toUpperCase()) {
    throw new ApiError(
      409,
      "country_locked",
      "The fulfilment country is fixed after creation so seller identity, currency and fulfilment scope stay consistent."
    );
  }
  if (input.currency !== undefined) {
    const existingCurrency = COUNTRIES[existing.countryCode]?.currency;
    if (existingCurrency && input.currency.trim().toUpperCase() !== existingCurrency) {
      throw new ApiError(
        400,
        "currency_mismatch",
        `Currency ${input.currency.toUpperCase()} does not match this listing's country currency ${existingCurrency}.`
      );
    }
  }
  const name = input.name === undefined ? existing.name : text(input.name, "Product name", 3, 140);
  const description =
    input.description === undefined ? existing.description : text(input.description, "Product description", 10, 2000);
  const priceKobo = input.priceKobo === undefined ? existing.priceKobo : money(input.priceKobo);
  const slug = input.slug === undefined ? existing.slug : readSlug(input.slug, "Product slug");
  const isDemo = typeof input.isDemo === "boolean" ? input.isDemo : existing.isDemo;
  const nextCategoryId = input.categoryId?.trim() ? input.categoryId : existing.categoryId;
  if (nextCategoryId !== existing.categoryId) {
    const category = await prisma.category.findUnique({ where: { id: nextCategoryId } });
    if (!category) throw new ApiError(400, "department_not_found", "Choose an existing department.");
  }
  const imagesProvided = Array.isArray(input.images) || input.imageUrl !== undefined || input.imageAlt !== undefined;
  const images = imagesProvided
    ? readImages(input.images, input.imageUrl, input.imageAlt)
    : null;
  const quantity =
    input.quantity === undefined ? undefined : integer(input.quantity, "Inventory quantity", 0, 1_000_000);
  if (quantity !== undefined) await assertStockNotBelowReserved(existing.id, quantity);
  const lowStockLevel =
    input.lowStockLevel === undefined ? undefined : integer(input.lowStockLevel, "Low stock level", 0, 1_000_000);
  if (slug !== existing.slug) await assertUniqueProductSlug(slug, existing.id);

  try {
    const product = await prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id: existing.id },
        data: {
          name,
          description,
          priceKobo,
          slug,
          categoryId: nextCategoryId,
          isDemo
        }
      });
      if (images) {
        await tx.productImage.deleteMany({ where: { productId: existing.id } });
        if (images.length > 0) {
          await tx.productImage.createMany({
            data: images.map((image, index) => ({ productId: existing.id, url: image.url, alt: image.alt, sortOrder: index }))
          });
        }
      }
      if (quantity !== undefined || lowStockLevel !== undefined) {
        if (quantity !== undefined) {
          // The pre-check above is only a fast failure. Reservation writes take
          // the same row lock, so re-read it inside the transaction before the
          // absolute quantity can drop below units already promised to orders.
          const locked = await tx.$queryRaw<Array<{ reserved: number }>>`
            SELECT "reserved" FROM "InventoryStock" WHERE "productId" = ${existing.id} FOR UPDATE
          `;
          const reserved = locked[0]?.reserved ?? 0;
          if (quantity < reserved) {
            throw new ApiError(
              409,
              "stock_below_reserved",
              `Inventory cannot be set to ${quantity} while ${reserved} units are reserved by open orders.`
            );
          }
        }
        await tx.inventoryStock.upsert({
          where: { productId: existing.id },
          create: {
            productId: existing.id,
            quantity: quantity ?? 0,
            lowStockLevel: lowStockLevel ?? 3
          },
          update: {
            ...(quantity !== undefined ? { quantity } : {}),
            ...(lowStockLevel !== undefined ? { lowStockLevel } : {})
          }
        });
      }
      await recordAudit({
        tx,
        actorId: input.actor.id,
        action: "catalogue.product.updated",
        entity: "Product",
        entityId: updated.id,
        metadata: {
          name: updated.name,
          slug: updated.slug,
          priceKobo: priceKobo.toString(),
          currency: COUNTRIES[existing.countryCode]?.currency ?? null,
          quantity: quantity ?? existing.stock?.quantity ?? null,
          imageCount: images ? images.length : existing.images.length,
          isDemo: updated.isDemo,
          previous: {
            name: existing.name,
            slug: existing.slug,
            priceKobo: existing.priceKobo.toString(),
            categoryId: existing.categoryId,
            isDemo: existing.isDemo
          }
        }
      });
      return updated;
    });
    await markProductForSearchSync(product.id);
    return product;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(409, "duplicate_product_slug", "That product slug is already in use.");
    }
    throw error;
  }
}

export type ProductValidationIssue = { field: string; message: string };

export async function validateProduct(actor: SessionUser, id: string) {
  if (!id) throw new ApiError(400, "validation_error", "Product id is required.");
  const product = await prisma.product.findUnique({
    where: { id },
    include: { images: true, category: true, vendor: true, stock: true }
  });
  if (!product) throw new ApiError(404, "product_not_found", "Product not found.");
  assertRegion(actor, { countryCode: product.countryCode });

  const issues: ProductValidationIssue[] = [];
  const country = COUNTRIES[product.countryCode];
  if (!country || !country.enabled) {
    issues.push({ field: "countryCode", message: `Country ${product.countryCode} is not enabled.` });
  } else if (!country.deliveryEnabled) {
    issues.push({
      field: "countryCode",
      message: `Delivery and checkout are not configured for ${country.name} yet, so its listings cannot be published.`
    });
  }
  if (product.name.trim().length < 3) issues.push({ field: "name", message: "Product name is too short." });
  if (product.description.trim().length < 10) {
    issues.push({ field: "description", message: "Product description must be at least 10 characters." });
  }
  if (product.priceKobo <= BigInt(0)) issues.push({ field: "priceKobo", message: "Price must be greater than zero." });
  if (product.images.length === 0) {
    issues.push({ field: "images", message: "Add at least one product image before publishing." });
  }
  if (product.images.some((image) => !image.alt || !image.alt.trim())) {
    issues.push({ field: "images", message: "Every product image needs accessible alt text." });
  }
  for (const image of product.images) {
    try {
      validateImage(image.url, image.alt, true);
    } catch (failure) {
      if (failure instanceof ApiError) {
        issues.push({ field: "images", message: `${image.url}: ${failure.message}` });
      }
    }
  }
  if (!product.category.isActive) {
    issues.push({ field: "categoryId", message: "Activate the department before publishing its products." });
  }
  if (product.vendor.status !== "VERIFIED") {
    issues.push({
      field: "vendorId",
      message:
        product.vendor.status === "PENDING"
          ? "The seller application must be verified before its products can be published."
          : "The seller cannot publish listings."
    });
  }
  if (product.vendor.countryCode !== product.countryCode) {
    issues.push({
      field: "vendorId",
      message: `The seller operates in ${product.vendor.countryCode} but the listing fulfils from ${product.countryCode}.`
    });
  }
  const available = product.stock ? Math.max(product.stock.quantity - product.stock.reserved, 0) : 0;
  if (!product.stock) {
    issues.push({ field: "quantity", message: "Add inventory before publishing." });
  } else if (available <= 0) {
    issues.push({ field: "quantity", message: "Available inventory is zero. Add stock before publishing." });
  }

  return {
    valid: issues.length === 0,
    issues,
    product: {
      id: product.id,
      name: product.name,
      slug: product.slug,
      status: product.status,
      priceKobo: product.priceKobo.toString(),
      currency: country?.currency ?? null,
      countryCode: product.countryCode,
      quantity: product.stock?.quantity ?? null,
      reserved: product.stock?.reserved ?? null,
      available,
      imageCount: product.images.length,
      isDemo: product.isDemo,
      departmentActive: product.category.isActive
    }
  };
}

export async function publishProduct(input: { actor: SessionUser; id: string }) {
  if (!input.id) throw new ApiError(400, "validation_error", "Product id is required.");
  const existing = await prisma.product.findUnique({
    where: { id: input.id },
    select: { status: true, name: true, countryCode: true }
  });
  if (!existing) throw new ApiError(404, "product_not_found", "Product not found.");
  assertRegion(input.actor, { countryCode: existing.countryCode });
  if (existing.status === "ACTIVE") throw new ApiError(409, "already_published", "This product is already published.");
  if (existing.status !== "DRAFT") {
    throw new ApiError(
      409,
      "invalid_state",
      `A product in ${existing.status} state cannot be published from this workflow.`
    );
  }
  const validation = await validateProduct(input.actor, input.id);
  if (!validation.valid) {
    throw new ApiError(409, "product_not_publishable", "Resolve the validation issues before publishing.", {
      issues: validation.issues
    });
  }
  const claimed = await prisma.product.updateMany({
    where: { id: input.id, status: "DRAFT" },
    data: { status: "ACTIVE" }
  });
  if (claimed.count !== 1) {
    throw new ApiError(409, "product_state_conflict", "This product changed while it was being published. Reload and retry.");
  }
  const updated = await prisma.product.findUniqueOrThrow({ where: { id: input.id } });
  await recordAudit({
    actorId: input.actor.id,
    action: "catalogue.product.published",
    entity: "Product",
    entityId: updated.id,
    metadata: { name: updated.name, slug: updated.slug, currency: COUNTRIES[updated.countryCode]?.currency ?? null }
  });
  await markProductForSearchSync(updated.id);
  return updated;
}

export async function unpublishProduct(input: { actor: SessionUser; id: string }) {
  if (!input.id) throw new ApiError(400, "validation_error", "Product id is required.");
  const existing = await prisma.product.findUnique({ where: { id: input.id } });
  if (!existing) throw new ApiError(404, "product_not_found", "Product not found.");
  assertRegion(input.actor, { countryCode: existing.countryCode });
  if (existing.status === "DRAFT") throw new ApiError(409, "already_unpublished", "This product is already unpublished.");
  if (existing.status !== "ACTIVE") {
    throw new ApiError(409, "invalid_state", `A product in ${existing.status} state cannot be unpublished from this workflow.`);
  }
  const claimed = await prisma.product.updateMany({
    where: { id: existing.id, status: "ACTIVE" },
    data: { status: "DRAFT" }
  });
  if (claimed.count !== 1) {
    throw new ApiError(409, "product_state_conflict", "This product changed while it was being unpublished. Reload and retry.");
  }
  const updated = await prisma.product.findUniqueOrThrow({ where: { id: existing.id } });
  await recordAudit({
    actorId: input.actor.id,
    action: "catalogue.product.unpublished",
    entity: "Product",
    entityId: updated.id,
    metadata: { name: updated.name, slug: updated.slug }
  });
  await markProductForSearchSync(updated.id);
  return updated;
}

export async function archiveProduct(input: { actor: SessionUser; id: string }) {
  if (!input.id) throw new ApiError(400, "validation_error", "Product id is required.");
  const existing = await prisma.product.findUnique({ where: { id: input.id } });
  if (!existing) throw new ApiError(404, "product_not_found", "Product not found.");
  assertRegion(input.actor, { countryCode: existing.countryCode });
  if (existing.status === "ARCHIVED") throw new ApiError(409, "already_archived", "This product is already archived.");
  if (existing.status !== "DRAFT" && existing.status !== "ACTIVE") {
    throw new ApiError(409, "invalid_state", `A product in ${existing.status} state cannot be archived from this workflow.`);
  }
  const claimed = await prisma.product.updateMany({
    where: { id: existing.id, status: { in: ["DRAFT", "ACTIVE"] } },
    data: { status: "ARCHIVED" }
  });
  if (claimed.count !== 1) {
    throw new ApiError(409, "product_state_conflict", "This product changed while it was being archived. Reload and retry.");
  }
  const updated = await prisma.product.findUniqueOrThrow({ where: { id: existing.id } });
  await recordAudit({
    actorId: input.actor.id,
    action: "catalogue.product.archived",
    entity: "Product",
    entityId: updated.id,
    metadata: { name: updated.name, slug: updated.slug, previousStatus: existing.status }
  });
  await markProductForSearchSync(updated.id);
  return updated;
}
