import { prisma } from "@/lib/prisma";

const productInclude = {
  category: true,
  vendor: { select: { id: true, name: true, slug: true, market: true, status: true, trustScore: true, pickupPhone: true } },
  images: { orderBy: { sortOrder: "asc" as const } },
  stock: true,
  variants: { where: { isActive: true }, orderBy: { name: "asc" as const } },
  reviews: { where: { status: "APPROVED" as const }, select: { rating: true } }
};

export type CatalogProduct = Awaited<ReturnType<typeof listProducts>>[number];

export async function listProducts() {
  return prisma.product.findMany({
    where: { status: "ACTIVE", vendor: { status: "VERIFIED" } },
    include: productInclude,
    orderBy: { createdAt: "desc" }
  });
}

export async function getProduct(idOrSlug: string) {
  return prisma.product.findFirstOrThrow({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    include: productInclude
  });
}

export async function getCategories() {
  return prisma.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
}

/**
 * Fixture listings are seeded demo rows. The database column is authoritative;
 * the vendor/image check is a fallback for a running dev server whose generated
 * Prisma client predates the column.
 */
const FIXTURE_VENDOR_SLUGS = new Set(["ikeja-mobile-hub", "yaba-home-living"]);

export function isFixtureListing(product: CatalogProduct): boolean {
  const flag = (product as { isSample?: boolean }).isSample;
  if (typeof flag === "boolean") return flag;
  return (
    FIXTURE_VENDOR_SLUGS.has(product.vendor.slug) &&
    product.images.some((image) => image.url.startsWith("/products/"))
  );
}

export function ratingSummary(reviews: Array<{ rating: number }>) {
  if (reviews.length === 0) return { average: null, count: 0 };
  const total = reviews.reduce((sum, review) => sum + review.rating, 0);
  return { average: Math.round((total / reviews.length) * 10) / 10, count: reviews.length };
}

export function availableQuantity(product: {
  stock: { quantity: number; reserved: number } | null;
  variants: Array<{ stock: number; reserved: number }>;
}) {
  if (product.variants.length > 0) {
    return product.variants.reduce((total, variant) => total + Math.max(variant.stock - variant.reserved, 0), 0);
  }
  return product.stock ? Math.max(product.stock.quantity - product.stock.reserved, 0) : 0;
}


/**
 * Sale mode read through raw SQL so a long-running dev server whose Prisma client
 * predates the column still returns the correct buying journey.
 */
export async function saleModesFor(ids: string[]): Promise<Map<string, "escrow" | "contact">> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.$queryRaw<Array<{ id: string; saleMode: string }>>`
    SELECT id, "saleMode"::text AS "saleMode" FROM "Product" WHERE id = ANY(${ids}::text[])`;
  return new Map(rows.map((row) => [row.id, row.saleMode === "contact" ? "contact" : "escrow"]));
}

export async function saleModeFor(id: string): Promise<"escrow" | "contact"> {
  const modes = await saleModesFor([id]);
  return modes.get(id) ?? "escrow";
}
