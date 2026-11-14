"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Info, RotateCcw } from "lucide-react";
import { ApiRequestError, apiClient, type ApiProduct } from "@/lib/api-client";
import { announceShopCartCount } from "@/components/shop/shop-header";
import { ProductGallery } from "@/components/product-detail/gallery";
import { ProductPurchasePanel, type CartNotice } from "@/components/product-detail/purchase-panel";
import { ProductReviews } from "@/components/product-detail/reviews";
import { ProductDetailSections, ProductPriceBlock, ProductSellerSection, ProductTitleBlock } from "@/components/product-detail/summary";
import { RelatedProducts } from "@/components/product-detail/related-products";
import { displayAttributes } from "@/components/product-detail/attributes";
import type { GalleryImage, ProductAttributeDefinition, ShopProduct } from "@/components/product-detail/types";
import { isContactListing, isDemoListing, isSampleListing } from "@/components/product-detail/types";

type DetailStatus = "loading" | "error" | "ready";

function purchasableVariant(product: ShopProduct | null) {
  return product?.variants?.find((variant) => variant.stock - variant.reserved > 0) ?? product?.variants?.[0] ?? null;
}

function cartItemCount(cart: Awaited<ReturnType<typeof apiClient.addCartItem>>) {
  return cart.items.filter((item) => !item.savedForLater).reduce((sum, item) => sum + item.quantity, 0);
}

async function loadRelated(product: ShopProduct): Promise<ShopProduct[]> {
  const items = await apiClient.getProducts({ category: product.category.slug, sort: "trust" });
  return (items as ShopProduct[]).filter((candidate) => candidate.id !== product.id).slice(0, 4);
}

/**
 * Interactive half of the product page. The server renders the product,
 * its category attribute labels and related rail, and passes them in so a slow
 * session/related request cannot blank the page. A client fetch remains as the
 * retry path when the server render itself failed.
 */
export function ProductDetailClient({
  id,
  initialProduct,
  initialRelated = [],
  initialRelatedUnavailable = false,
  initialError = "",
  signedIn = false,
  attributeDefinitions = [],
  reviewEnvironment = false
}: {
  id: string;
  initialProduct?: ApiProduct | null;
  initialRelated?: ApiProduct[];
  initialRelatedUnavailable?: boolean;
  initialError?: string;
  signedIn?: boolean;
  attributeDefinitions?: ProductAttributeDefinition[];
  reviewEnvironment?: boolean;
}) {
  const router = useRouter();
  const seededProduct =
    initialProduct && (initialProduct.id === id || initialProduct.slug.toLowerCase() === id.toLowerCase())
      ? (initialProduct as ShopProduct)
      : null;
  const [product, setProduct] = useState<ShopProduct | null>(seededProduct);
  const [related, setRelated] = useState<ShopProduct[]>(seededProduct ? (initialRelated as ShopProduct[]) : []);
  const [relatedStatus, setRelatedStatus] = useState<"idle" | "loading" | "ready" | "unavailable">(
    seededProduct ? (initialRelatedUnavailable && initialRelated.length === 0 ? "loading" : "ready") : "idle"
  );
  const [status, setStatus] = useState<DetailStatus>(seededProduct ? "ready" : initialError ? "error" : "loading");
  const [error, setError] = useState(initialError);
  const [reloadKey, setReloadKey] = useState(0);
  const [adding, setAdding] = useState(false);
  const [savingSaved, setSavingSaved] = useState(false);
  const [saved, setSaved] = useState(false);
  const [variantId, setVariantId] = useState<string | null>(() => purchasableVariant(seededProduct)?.id ?? null);
  const [quantity, setQuantity] = useState(1);
  const [cartNotice, setCartNotice] = useState<CartNotice>(null);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    // Server-supplied detail is authoritative for the initial render.
    if (seededProduct) return;
    // An initial 404/unavailable state waits for the user to retry rather than
    // hammering the API again during hydration.
    if (initialError && reloadKey === 0) return;

    let active = true;
    setStatus("loading");
    setError("");

    async function load() {
      try {
        const item = (await apiClient.getProduct(id)) as ShopProduct;
        if (!active) return;
        setProduct(item);
        setVariantId(purchasableVariant(item)?.id ?? null);
        setStatus("ready");

        // Related products are a convenience rail, never a prerequisite for
        // showing the product. A failed/slow request is ignored.
        void loadRelated(item)
          .then((items) => {
            if (active) setRelated(items);
          })
          .catch(() => undefined);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load product.");
        setStatus("error");
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [id, seededProduct, initialError, reloadKey]);

  // A related-rail failure during the server render is retried once after
  // hydration. It stays silent: the product page does not depend on it.
  useEffect(() => {
    if (!seededProduct || !initialRelatedUnavailable) return;
    let active = true;
    setRelatedStatus("loading");
    void loadRelated(seededProduct)
      .then((items) => {
        if (!active) return;
        setRelated(items);
        setRelatedStatus("ready");
      })
      .catch(() => {
        if (active) setRelatedStatus("unavailable");
      });
    return () => {
      active = false;
    };
  }, [seededProduct, initialRelatedUnavailable]);

  function retryRelated() {
    if (!seededProduct) return;
    setRelatedStatus("loading");
    void loadRelated(seededProduct)
      .then((items) => {
        setRelated(items);
        setRelatedStatus(items.length > 0 ? "ready" : "ready");
      })
      .catch(() => setRelatedStatus("unavailable"));
  }

  const selectedVariant = useMemo(
    () => product?.variants?.find((variant) => variant.id === variantId) ?? null,
    [product, variantId]
  );
  const unitPrice = selectedVariant?.priceKobo ?? product?.priceKobo ?? 0;
  const available = selectedVariant ? selectedVariant.stock - selectedVariant.reserved : (product?.available ?? 0);

  // Switching to a variant with less stock must not leave an unorderable
  // quantity selected in the form.
  useEffect(() => {
    setQuantity((current) => Math.min(Math.max(current, 1), Math.max(available, 1), 10));
  }, [available]);

  const attributes = useMemo(() => (product ? displayAttributes(product, attributeDefinitions) : []), [product, attributeDefinitions]);
  const images: GalleryImage[] = useMemo(
    () =>
      (product?.images ?? []).map((image) => ({
        id: image.id,
        url: image.url,
        alt: image.alt,
        sortOrder: image.sortOrder
      })),
    [product]
  );

  async function addToCart(thenCheckout = false) {
    if (!product || isSampleListing(product) || isContactListing(product)) return;
    setAdding(true);
    setActionError("");
    setCartNotice(null);
    const requestedQuantity = Math.min(Math.max(quantity, 1), 10);
    try {
      const cart = await apiClient.addCartItem(product.id, requestedQuantity, variantId);
      // The shared Shop header owns one authoritative cart badge. Announce the
      // server-returned total instead of incrementing a local counter, so the
      // detail route behaves like the storefront, department and search routes.
      announceShopCartCount(cartItemCount(cart));
      setCartNotice({ quantity: requestedQuantity, cartCount: cartItemCount(cart) });
      if (thenCheckout) router.push("/checkout");
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) {
        router.push(`/login?next=${encodeURIComponent(`/product/${product.slug}`)}`);
        return;
      }
      setActionError(err instanceof Error ? err.message : "Could not add this item.");
    } finally {
      setAdding(false);
    }
  }

  async function toggleSaved() {
    if (!product) return;
    setSavingSaved(true);
    setActionError("");
    try {
      const result = await apiClient.toggleSaved(product.id);
      setSaved(result.saved);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) {
        router.push(`/login?next=${encodeURIComponent(`/product/${product.slug}`)}`);
        return;
      }
      setActionError(err instanceof Error ? err.message : "Could not save this item.");
    } finally {
      setSavingSaved(false);
    }
  }

  if (status === "loading") {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)_340px]"
      >
        <span className="sr-only">Loading product…</span>
        <div className="space-y-2 lg:col-start-2">
          <div className="h-3 w-28 animate-pulse rounded bg-surface-mid motion-reduce:animate-none" />
          <div className="h-8 w-full max-w-md animate-pulse rounded bg-surface-mid motion-reduce:animate-none" />
          <div className="h-4 w-48 animate-pulse rounded bg-surface-mid motion-reduce:animate-none" />
        </div>
        <div className="aspect-square w-full max-w-[420px] animate-pulse rounded-2xl bg-surface-mid motion-reduce:animate-none lg:col-start-1 lg:row-start-1 lg:row-span-2" />
        <div className="h-52 animate-pulse rounded-2xl bg-surface-mid motion-reduce:animate-none lg:col-start-2" />
        <div className="h-72 animate-pulse rounded-2xl bg-surface-mid motion-reduce:animate-none xl:col-start-3 xl:row-start-1" />
      </div>
    );
  }

  if (status === "error" || !product) {
    return (
      <div role="alert" className="rounded-2xl border border-crimson/20 bg-crimson-soft p-5 font-bold text-crimson">
        <AlertTriangle className="mb-2 h-5 w-5" aria-hidden />
        <p>{error || "Product not found."}</p>
        <p className="mt-1 text-sm font-semibold text-[#7f1d1d]">
          The listing may be temporarily unavailable. Unpublished products do not show any details.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setReloadKey((current) => current + 1)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-crimson px-4 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            Try again
          </button>
          <Link
            href="/naijashop"
            className="inline-flex min-h-11 items-center rounded-xl border border-crimson/30 px-4 text-sm font-bold text-crimson"
          >
            Back to Shop
          </Link>
        </div>
      </div>
    );
  }

  const demo = isDemoListing(product);
  const sample = isSampleListing(product);
  const hasImages = images.length > 0;

  return (
    <div
      className="space-y-6"
      data-related-initial-unavailable={initialRelatedUnavailable ? "true" : "false"}
    >
      <nav aria-label="Breadcrumb" className="text-xs font-semibold text-muted sm:text-sm">
        <Link href="/naijashop" className="font-bold text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary">
          Shop
        </Link>{" "}
        <span aria-hidden>/</span>{" "}
        <Link href={`/naijashop/c/${product.category.slug}`} className="hover:text-ink hover:underline">
          {product.category.name}
        </Link>
      </nav>

      {demo || sample ? (
        <div
          id="demo-listing-notice"
          data-testid="demo-notice"
          role="note"
          className="flex items-start gap-2.5 rounded-xl border border-[#B45309]/35 bg-[#FFF8E6] px-4 py-3 text-sm leading-6 text-[#4b3000]"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            {sample ? (
              <>
                <strong>Sample listing.</strong> This product is development demonstration data. Price, stock and
                checkout are not real.
              </>
            ) : (
              <>
                <strong>Illustrative demonstration listing.</strong> The price, stock, specifications and seller details
                are catalogue demonstration data, not a live offer.
              </>
            )}
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:gap-6">
        <div className="order-2 min-w-0 xl:order-1 xl:w-[390px] xl:shrink-0">
          <ProductGallery name={product.name} images={images} demo={demo} />
        </div>

        <div className="contents xl:order-2 xl:flex xl:min-w-0 xl:flex-1 xl:flex-col xl:gap-5">
          <div className="order-1 min-w-0">
            <ProductTitleBlock product={product} />
          </div>

          <div className="order-3 min-w-0">
            <ProductPriceBlock
              product={product}
              unitPrice={unitPrice}
              available={available}
              variants={product.variants ?? []}
              variantId={variantId}
              onVariantChange={(next) => setVariantId(next)}
            />
          </div>

          <div className="order-5 min-w-0">
            <ProductDetailSections product={product} attributes={attributes} />
          </div>
        </div>

        <div className="order-4 min-w-0 xl:order-3 xl:w-[330px] xl:shrink-0">
          <div>
            <ProductPurchasePanel
              product={product}
              unitPrice={unitPrice}
              available={available}
              quantity={quantity}
              onQuantityChange={setQuantity}
              selectedVariantName={selectedVariant?.name ?? null}
              adding={adding}
              savingSaved={savingSaved}
              saved={saved}
              error={actionError}
              cartNotice={cartNotice}
              reviewEnvironment={reviewEnvironment}
              onAddToCart={(thenCheckout) => void addToCart(thenCheckout)}
              onToggleSaved={() => void toggleSaved()}
            />
          </div>
        </div>
      </div>

      {!hasImages ? (
        <p className="rounded-xl border border-border-soft bg-canvas px-4 py-3 text-xs leading-5 text-muted">
          Images are supplied by the seller. NaijaDeals does not substitute a stock photo when a listing has no image.
        </p>
      ) : null}

      <ProductSellerSection product={product} />
      <ProductReviews product={product} signedIn={signedIn} />
      <RelatedProducts
        items={related}
        categoryName={product.category.name}
        status={relatedStatus}
        onRetry={retryRelated}
      />
    </div>
  );
}
