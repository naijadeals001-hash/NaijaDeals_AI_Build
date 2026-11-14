import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ProductDetailClient } from "@/components/functional/product-detail-client";
import type { ProductAttributeDefinition } from "@/components/product-detail/types";
import { getPublicProductDetail, listRelatedProducts } from "@/lib/services/core/catalog.service";
import { jsonSafe } from "@/lib/services/core/serialize";
import { previewAuthorizationForRequest } from "@/lib/services/core/vertical-activation.service";
import { readLocale } from "@/lib/i18n/server";
import { prisma } from "@/lib/prisma";
import type { ApiProduct } from "@/lib/api-client";

/**
 * The visitor's selected market, validated by the shared locale reader: an
 * unsupported country falls back to the home market and a city that does not
 * belong to the country is treated as no selection. The catalogue never falls
 * back to a product's own country.
 */
function visitorMarket() {
  const { country, city } = readLocale();
  return { countryCode: country, cityCode: city || null };
}

/**
 * Controlled REVIEW-only seam for proving related-rail failure isolation. It is
 * unavailable to ordinary production builds and only used by the acceptance
 * suite through the preview launcher's REVIEW_TEST_SEAMS flag.
 */
function relatedFailureRequested() {
  if (process.env.REVIEW_TEST_SEAMS !== "1") return false;
  return headers().get("x-nd-related-failure") === "1";
}

/**
 * Preview/disabled authorization and price/stock reads are per-request state.
 * `force-dynamic` plus `noStore()` makes Next emit a private, non-cacheable
 * response; the acceptance suite verifies the actual header.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/**
 * The detail page renders the publishable product on the server, so the image,
 * description, price, stock, category attribute labels and related rail are in
 * the first HTML response. The client component only takes over for
 * gallery/cart/review interactions; a slow or failed related-products or
 * session request can no longer blank the whole page.
 */
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  noStore();
  try {
    const { previewAuthorized } = await previewAuthorizationForRequest();
    const product = await getPublicProductDetail(params.id, { ...visitorMarket(), previewAuthorized });
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
  noStore();
  let initialProduct: ApiProduct | null = null;
  let initialRelated: ApiProduct[] = [];
  let initialRelatedUnavailable = false;
  let initialError = "";
  let attributeDefinitions: ProductAttributeDefinition[] = [];

  // Authorization is resolved with the same helper as /api/products/[id].
  // PREVIEW is visible to an authorized Control Center user; everyone else
  // gets a 404 before any product field or related rail is rendered.
  const { user: sessionUser, previewAuthorized } = await previewAuthorizationForRequest();
  const market = visitorMarket();

  try {
    const product = await getPublicProductDetail(params.id, { ...market, previewAuthorized });
    if (!product) notFound();
    initialProduct = jsonSafe(product) as unknown as ApiProduct;
    attributeDefinitions = await loadAttributeDefinitions(product.categoryId);
    try {
      if (relatedFailureRequested()) {
        throw new Error("Controlled REVIEW related-products failure.");
      }
      initialRelated = jsonSafe(
        await listRelatedProducts(product.category.slug, product.id, 4, {
          previewAuthorized,
          countryCode: market.countryCode,
          cityCode: market.cityCode
        })
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

  const reviewEnvironment = await isReviewEnvironment();

  return (
    <ProductDetailClient
      // Remount when the validated market changes so the client never keeps a
      // previous market's server-rendered product/rail state after a refresh.
      key={`${params.id}:${market.countryCode}:${market.cityCode ?? ""}`}
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
