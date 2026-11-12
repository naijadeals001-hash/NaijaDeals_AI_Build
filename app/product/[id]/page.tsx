import type { Metadata } from "next";
import { ProductDetailClient } from "@/components/functional/product-detail-client";
import { getPublicProductDetail, listRelatedProducts } from "@/lib/services/core/catalog.service";
import { jsonSafe } from "@/lib/services/core/serialize";
import { getSessionUser } from "@/lib/auth/session";
import type { ApiProduct } from "@/lib/api-client";

export const dynamic = "force-dynamic";

/**
 * The detail page renders the publishable product on the server, so the image,
 * description, price and stock are in the first HTML response. The client
 * component only takes over for cart/review interactions; a slow or failed
 * related-products or session request can no longer blank the whole page.
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

export default async function ProductDetail({ params }: { params: { id: string } }) {
  let initialProduct: ApiProduct | null = null;
  let initialRelated: ApiProduct[] = [];
  let initialError = "";

  try {
    const product = await getPublicProductDetail(params.id);
    if (!product) {
      initialError = "This product is not available.";
    } else {
      initialProduct = jsonSafe(product) as unknown as ApiProduct;
      initialRelated = jsonSafe(
        await listRelatedProducts(product.category.slug, product.id).catch(() => [])
      ) as unknown as ApiProduct[];
    }
  } catch {
    initialError = "Product not found.";
  }

  const sessionUser = await getSessionUser().catch(() => null);

  return (
    <ProductDetailClient
      key={params.id}
      id={params.id}
      initialProduct={initialProduct}
      initialRelated={initialRelated}
      initialError={initialError}
      signedIn={Boolean(sessionUser)}
    />
  );
}
