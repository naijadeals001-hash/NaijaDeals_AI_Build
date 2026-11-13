import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDetailClient } from "@/components/functional/product-detail-client";
import type { ProductAttributeDefinition } from "@/components/product-detail/types";
import { getPublicProductDetail, listRelatedProducts } from "@/lib/services/core/catalog.service";
import { jsonSafe } from "@/lib/services/core/serialize";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import type { ApiProduct } from "@/lib/api-client";

export const dynamic = "force-dynamic";

/**
 * The detail page renders the publishable product on the server, so the image,
 * description, price, stock, category attribute labels and related rail are in
 * the first HTML response. The client component only takes over for
 * gallery/cart/review interactions; a slow or failed related-products or
 * session request can no longer blank the whole page.
 */
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  try {
    const product = await getPublicProductDetail(params.id);
    if (!product) return { title: "Product unavailable" };
    return {
      title: product.name,
      description: product.description.trim().slice(0, 160) || `Buy ${product.name} from a verified NaijaDeals seller.`,
      openGraph: product.images[0]?.url ? { images: [product.images[0].url] } : undefined
    };
  } catch {
    return { title: "Product unavailable" };
  }
}

/**
 * Category definitions give stored attributes their human labels and units.
 * A taxonomy read failure is not a product failure: the client falls back to
 * humanised stored keys rather than inventing specifications.
 */
async function loadAttributeDefinitions(categoryId: string): Promise<ProductAttributeDefinition[]> {
  try {
    const rows = await prisma.categoryAttribute.findMany({
      where: { categoryId },
      select: { key: true, label: true, type: true, options: true },
      orderBy: { label: "asc" }
    });
    return rows.map((row) => ({
      key: row.key,
      label: row.label,
      type: row.type,
      options: Array.isArray(row.options) ? row.options.filter((option): option is string => typeof option === "string") : null
    }));
  } catch {
    return [];
  }
}

/**
 * Display-only read of the environment marker. The financial refusal itself is
 * enforced server-side by lib/payments/review-financial-guard; this only lets
 * the buy panel explain why checkout cannot complete and omit a Buy now action.
 */
async function isReviewEnvironment(): Promise<boolean> {
  try {
    const row = await prisma.databaseClassification.findUnique({
      where: { id: "default" },
      select: { classification: true }
    });
    return row?.classification === "REVIEW";
  } catch {
    return false;
  }
}

export default async function ProductDetail({ params }: { params: { id: string } }) {
  let initialProduct: ApiProduct | null = null;
  let initialRelated: ApiProduct[] = [];
  let initialRelatedUnavailable = false;
  let initialError = "";
  let attributeDefinitions: ProductAttributeDefinition[] = [];

  try {
    const product = await getPublicProductDetail(params.id);
    if (!product) notFound();
    initialProduct = jsonSafe(product) as unknown as ApiProduct;
    attributeDefinitions = await loadAttributeDefinitions(product.categoryId);
    try {
      initialRelated = jsonSafe(
        await listRelatedProducts(product.category.slug, product.id)
      ) as unknown as ApiProduct[];
    } catch {
      // The related rail is optional. Record the failure so the client can retry
      // once after hydration without ever hiding the product itself.
      initialRelatedUnavailable = true;
    }
  } catch (error) {
    if ((error as { digest?: string })?.digest === "NEXT_NOT_FOUND") throw error;
    if ((error as { code?: string })?.code === "P2025") notFound();
    initialError = "Product not found.";
  }

  const [sessionUser, reviewEnvironment] = await Promise.all([
    getSessionUser().catch(() => null),
    isReviewEnvironment()
  ]);

  return (
    <ProductDetailClient
      key={params.id}
      id={params.id}
      initialProduct={initialProduct}
      initialRelated={initialRelated}
      initialRelatedUnavailable={initialRelatedUnavailable}
      initialError={initialError}
      signedIn={Boolean(sessionUser)}
      attributeDefinitions={attributeDefinitions}
      reviewEnvironment={reviewEnvironment}
    />
  );
}
