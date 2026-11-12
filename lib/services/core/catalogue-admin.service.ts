import { existsSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { recordAudit } from "./audit.service";

const DEMO_VENDOR_SLUG = "demo-catalogue-review";

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

function money(value: unknown) {
  const raw = typeof value === "number" ? value : Number(String(value ?? "").replace(/[^0-9]/g, ""));
  if (!Number.isSafeInteger(raw) || raw <= 0) throw new ApiError(400, "validation_error", "priceKobo must be a positive integer amount in kobo.");
  return BigInt(raw);
}

export function validateImage(imageUrl: unknown, alt: unknown, required: boolean) {
  const url = typeof imageUrl === "string" ? imageUrl.trim() : "";
  const altText = typeof alt === "string" ? alt.trim() : "";
  if (!url) {
    if (required) throw new ApiError(400, "image_required", "A product image is required before publishing.");
    return { imageUrl: null, imageAlt: null };
  }
  if (url.startsWith("/")) {
    const file = path.join(process.cwd(), "public", url.replace(/^\/+/, ""));
    if (!existsSync(file)) throw new ApiError(400, "image_not_found", `Image ${url} does not exist in the project assets.`);
  } else if (!/^https:\/\//i.test(url)) {
    throw new ApiError(400, "invalid_image", "Image must be a project path or an HTTPS URL.");
  }
  if (!altText) throw new ApiError(400, "alt_required", "Accessible image text is required.");
  return { imageUrl: url, imageAlt: altText };
}

export async function listCatalogue() {
  const [departments, products, vendor] = await Promise.all([
    prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.product.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        category: { select: { id: true, name: true, slug: true, isActive: true, isDemo: true } },
        images: { orderBy: { sortOrder: "asc" }, take: 1 },
        stock: true,
        vendor: { select: { id: true, name: true, slug: true, status: true } }
      }
    }),
    prisma.vendor.findFirst({ where: { slug: DEMO_VENDOR_SLUG }, select: { id: true, name: true, slug: true } })
  ]);
  return { departments, products, demoVendor: vendor };
}

export async function createDepartment(input: { actorId: string; name: string; description: string; imageUrl?: string; isDemo?: boolean }) {
  const name = text(input.name, "Department name", 3, 80);
  const description = text(input.description, "Department description", 10, 400);
  const slug = slugify(name);
  const image = validateImage(input.imageUrl, "Department image", false);
  const duplicate = await prisma.category.findFirst({ where: { OR: [{ name }, { slug }] } });
  if (duplicate) throw new ApiError(409, "duplicate_department", "A department with that name or slug already exists.");
  const department = await prisma.category.create({
    data: { name, slug, description, imageUrl: image.imageUrl, isDemo: Boolean(input.isDemo), sortOrder: await prisma.category.count() }
  });
  await recordAudit({ actorId: input.actorId, action: "catalogue.department.created", entity: "Category", entityId: department.id, metadata: { name, isDemo: department.isDemo } });
  return department;
}

export async function updateDepartment(input: { actorId: string; id: string; name?: string; description?: string; imageUrl?: string; isActive?: boolean; isDemo?: boolean }) {
  const existing = await prisma.category.findUnique({ where: { id: input.id } });
  if (!existing) throw new ApiError(404, "department_not_found", "Department not found.");
  const image = validateImage(input.imageUrl ?? existing.imageUrl ?? "", "Department image", false);
  const department = await prisma.category.update({
    where: { id: existing.id },
    data: {
      name: input.name ? text(input.name, "Department name", 3, 80) : existing.name,
      description: input.description ? text(input.description, "Department description", 10, 400) : existing.description,
      imageUrl: image.imageUrl,
      isActive: typeof input.isActive === "boolean" ? input.isActive : existing.isActive,
      isDemo: typeof input.isDemo === "boolean" ? input.isDemo : existing.isDemo
    }
  });
  await recordAudit({ actorId: input.actorId, action: "catalogue.department.updated", entity: "Category", entityId: department.id, metadata: { name: department.name, isActive: department.isActive, isDemo: department.isDemo } });
  return department;
}

export async function createProduct(input: {
  actorId: string;
  name: string;
  description: string;
  priceKobo: unknown;
  categoryId: string;
  imageUrl?: string;
  imageAlt?: string;
  isDemo?: boolean;
}) {
  const name = text(input.name, "Product name", 3, 140);
  const description = text(input.description, "Product description", 10, 2000);
  const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
  if (!category) throw new ApiError(400, "department_not_found", "Choose an existing department.");
  const image = validateImage(input.imageUrl, input.imageAlt, false);
  const isDemo = Boolean(input.isDemo);
  const vendor = isDemo
    ? await prisma.vendor.findFirst({ where: { slug: DEMO_VENDOR_SLUG } })
    : await prisma.vendor.findFirst({ where: { status: "VERIFIED" }, orderBy: { createdAt: "asc" } });
  if (!vendor) throw new ApiError(409, "seller_required", "A demonstration or verified seller is required before a product can be created.");
  const slug = `${slugify(name)}-${Date.now().toString(36)}`;
  const product = await prisma.product.create({
    data: {
      vendorId: vendor.id,
      categoryId: category.id,
      name,
      slug,
      description,
      priceKobo: money(input.priceKobo),
      countryCode: "NG",
      status: "DRAFT",
      isDemo,
      moderationNote: isDemo ? "DEMO — demonstration inventory, not live supply" : null
    }
  });
  if (image.imageUrl && image.imageAlt) {
    await prisma.productImage.create({ data: { productId: product.id, url: image.imageUrl, alt: image.imageAlt, sortOrder: 0 } });
  }
  await recordAudit({ actorId: input.actorId, action: "catalogue.product.created", entity: "Product", entityId: product.id, metadata: { name, department: category.name, isDemo } });
  return product;
}

export async function updateProduct(input: {
  actorId: string;
  id: string;
  name?: string;
  description?: string;
  priceKobo?: unknown;
  categoryId?: string;
  imageUrl?: string;
  imageAlt?: string;
  isDemo?: boolean;
}) {
  const existing = await prisma.product.findUnique({ where: { id: input.id }, include: { images: { orderBy: { sortOrder: "asc" }, take: 1 } } });
  if (!existing) throw new ApiError(404, "product_not_found", "Product not found.");
  if (input.categoryId) {
    const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
    if (!category) throw new ApiError(400, "department_not_found", "Choose an existing department.");
  }
  const image = validateImage(input.imageUrl ?? existing.images[0]?.url ?? "", input.imageAlt ?? existing.images[0]?.alt ?? "", false);
  const product = await prisma.product.update({
    where: { id: existing.id },
    data: {
      name: input.name ? text(input.name, "Product name", 3, 140) : existing.name,
      description: input.description ? text(input.description, "Product description", 10, 2000) : existing.description,
      priceKobo: input.priceKobo === undefined ? existing.priceKobo : money(input.priceKobo),
      categoryId: input.categoryId ?? existing.categoryId,
      isDemo: typeof input.isDemo === "boolean" ? input.isDemo : existing.isDemo
    }
  });
  if (image.imageUrl && image.imageAlt) {
    await prisma.productImage.deleteMany({ where: { productId: product.id } });
    await prisma.productImage.create({ data: { productId: product.id, url: image.imageUrl, alt: image.imageAlt, sortOrder: 0 } });
  }
  await recordAudit({ actorId: input.actorId, action: "catalogue.product.updated", entity: "Product", entityId: product.id, metadata: { name: product.name, isDemo: product.isDemo } });
  return product;
}

export async function publishProduct(input: { actorId: string; id: string }) {
  const product = await prisma.product.findUnique({ where: { id: input.id }, include: { images: true, category: true, vendor: true, stock: true } });
  if (!product) throw new ApiError(404, "product_not_found", "Product not found.");
  if (!product.category.isActive) throw new ApiError(409, "department_inactive", "Activate the department before publishing its products.");
  const image = validateImage(product.images[0]?.url ?? "", product.images[0]?.alt ?? "", true);
  if (!image.imageUrl) throw new ApiError(400, "image_required", "A product image is required before publishing.");
  if (product.vendor.status !== "VERIFIED" && product.vendor.status !== "PENDING") throw new ApiError(409, "seller_not_eligible", "The seller cannot publish listings.");
  if (product.stock?.quantity === 0) throw new ApiError(409, "out_of_stock", "Add stock before publishing.");
  const updated = await prisma.product.update({ where: { id: product.id }, data: { status: "ACTIVE" } });
  await recordAudit({ actorId: input.actorId, action: "catalogue.product.published", entity: "Product", entityId: product.id, metadata: { name: product.name } });
  return updated;
}

export async function unpublishProduct(input: { actorId: string; id: string }) {
  const product = await prisma.product.findUnique({ where: { id: input.id } });
  if (!product) throw new ApiError(404, "product_not_found", "Product not found.");
  const updated = await prisma.product.update({ where: { id: product.id }, data: { status: "DRAFT" } });
  await recordAudit({ actorId: input.actorId, action: "catalogue.product.unpublished", entity: "Product", entityId: product.id, metadata: { name: product.name } });
  return updated;
}
