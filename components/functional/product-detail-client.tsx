"use client";

import { ReviewForm } from "./review-form";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Heart,
  ImageOff,
  Loader2,
  MapPin,
  PackageCheck,
  RotateCcw,
  ShieldCheck,
  ShoppingCart,
  Star,
  Store,
  Truck
} from "lucide-react";
import { ApiRequestError, apiClient, koboToNaira, type ApiProduct } from "@/lib/api-client";

type DetailStatus = "loading" | "error" | "ready";

function purchasableVariant(product: ApiProduct | null) {
  return product?.variants?.find((variant) => variant.stock - variant.reserved > 0) ?? product?.variants?.[0] ?? null;
}

/**
 * Interactive half of the product page. The server renders the product itself
 * (image, description, price and stock) and passes it as `initialProduct`, so a
 * slow session/related-products request cannot leave the page blank. A client
 * fetch remains as the retry path for an unavailable server render.
 */
export function ProductDetailClient({
  id,
  initialProduct,
  initialRelated = [],
  initialError = "",
  signedIn = false
}: {
  id: string;
  initialProduct?: ApiProduct | null;
  initialRelated?: ApiProduct[];
  initialError?: string;
  signedIn?: boolean;
}) {
  const router = useRouter();
  const seededProduct =
    initialProduct && (initialProduct.id === id || initialProduct.slug.toLowerCase() === id.toLowerCase())
      ? initialProduct
      : null;
  const [product, setProduct] = useState<ApiProduct | null>(seededProduct);
  const [related, setRelated] = useState<ApiProduct[]>(seededProduct ? initialRelated : []);
  const [status, setStatus] = useState<DetailStatus>(seededProduct ? "ready" : initialError ? "error" : "loading");
  const [error, setError] = useState(initialError);
  const [reloadKey, setReloadKey] = useState(0);
  const [adding, setAdding] = useState(false);
  const [saved, setSaved] = useState(false);
  const [variantId, setVariantId] = useState<string | null>(() => purchasableVariant(seededProduct)?.id ?? null);
  const [quantity, setQuantity] = useState(1);
  const [activeImageUrl, setActiveImageUrl] = useState<string | null>(
    () => seededProduct?.images?.[0]?.url ?? null
  );
  const [brokenImageUrls, setBrokenImageUrls] = useState<Set<string>>(() => new Set());

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
        const item = await apiClient.getProduct(id);
        if (!active) return;
        setProduct(item);
        setVariantId(purchasableVariant(item)?.id ?? null);
        setActiveImageUrl(item.images?.[0]?.url ?? null);
        setBrokenImageUrls(new Set());
        setStatus("ready");

        // Related products are a convenience rail, never a prerequisite for
        // showing the product. A failed/slow request is ignored.
        void apiClient
          .getProducts({ category: item.category.slug, sort: "trust" })
          .then((items) => {
            if (!active) return;
            setRelated(items.filter((candidate) => candidate.id !== item.id).slice(0, 4));
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

  const selectedVariant = useMemo(
    () => product?.variants?.find((variant) => variant.id === variantId) ?? null,
    [product, variantId]
  );
  const unitPrice = selectedVariant?.priceKobo ?? product?.priceKobo ?? 0;
  const available = selectedVariant
    ? selectedVariant.stock - selectedVariant.reserved
    : product?.available ?? 0;

  // Switching to a variant with less stock must not leave an unorderable
  // quantity selected in the form.
  useEffect(() => {
    setQuantity((current) => Math.min(Math.max(current, 1), Math.max(available, 1)));
  }, [available]);

  const sourceImages = product?.images ?? [];
  const usableImages = sourceImages.filter((image) => !brokenImageUrls.has(image.url));
  const selectedImage =
    usableImages.find((image) => image.url === activeImageUrl) ?? usableImages[0] ?? null;
  const description = (product?.description ?? "").trim();

  function markImageBroken(url: string) {
    setBrokenImageUrls((current) => {
      if (current.has(url)) return current;
      const next = new Set(current);
      next.add(url);
      return next;
    });
  }

  async function addToCart(thenCheckout = false) {
    if (!product || product.isSample) return;
    setAdding(true);
    setError("");
    try {
      await apiClient.addCartItem(product.id, quantity, variantId);
      if (thenCheckout) router.push("/checkout");
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) {
        router.push("/login");
        return;
      }
      setError(err instanceof Error ? err.message : "Could not add this item.");
    } finally {
      setAdding(false);
    }
  }

  async function toggleSaved() {
    if (!product) return;
    try {
      const result = await apiClient.toggleSaved(product.id);
      setSaved(result.saved);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) {
        router.push("/login");
        return;
      }
      setError(err instanceof Error ? err.message : "Could not save this item.");
    }
  }

  if (status === "loading") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="grid min-h-96 place-items-center rounded-2xl border border-border-soft bg-canvas"
      >
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
          <p className="text-sm font-bold text-muted">Loading product…</p>
        </div>
      </div>
    );
  }

  if (status === "error" || !product) {
    return (
      <div role="alert" className="rounded-2xl border border-crimson/20 bg-crimson-soft p-5 font-bold text-crimson">
        <AlertTriangle className="mb-2 h-5 w-5" aria-hidden />
        <p>{error || "Product not found."}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setReloadKey((current) => current + 1)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-crimson px-4 text-sm font-bold text-white"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            Try again
          </button>
          <Link
            href="/naijashop"
            className="inline-flex min-h-11 items-center rounded-xl border border-crimson/30 px-4 text-sm font-bold text-crimson"
          >
            Back to NaijaShop
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {product.isSample ? (
        <div role="status" className="rounded-lg border border-[#B45309]/40 bg-amber/10 px-4 py-3 text-sm text-ink">
          <strong>Sample listing.</strong> This product is demonstration data for local development — not a real seller listing.
        </div>
      ) : null}
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/naijashop" className="font-bold text-primary underline">
          NaijaShop
        </Link>{" "}
        /{" "}
        <Link href={`/naijashop/c/${product.category.slug}`} className="hover:underline">
          {product.category.name}
        </Link>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className="overflow-hidden rounded-2xl border border-border-soft bg-canvas shadow-sm">
          <div
            className={`grid grid-cols-1 gap-3 p-4 ${
              usableImages.length > 1 ? "sm:grid-cols-[88px_minmax(0,1fr)]" : ""
            }`}
          >
            {usableImages.length > 1 ? (
              <div
                role="group"
                aria-label="Product images"
                className="order-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin] sm:order-1 sm:flex-col sm:overflow-visible sm:pb-0"
              >
                {usableImages.map((image, index) => {
                  const active = selectedImage?.id === image.id;
                  return (
                    <button
                      key={image.id}
                      type="button"
                      onClick={() => setActiveImageUrl(image.url)}
                      aria-label={`Show image ${index + 1} of ${usableImages.length}`}
                      aria-pressed={active}
                      className={`grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border bg-surface-low transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:h-[84px] sm:w-full ${
                        active ? "border-primary ring-2 ring-primary/25" : "border-border-soft hover:border-primary/50"
                      }`}
                    >
                      <img
                        src={image.url}
                        alt={image.alt ? `${image.alt} thumbnail ${index + 1}` : `${product.name} thumbnail ${index + 1}`}
                        loading="lazy"
                        onError={() => markImageBroken(image.url)}
                        className="h-full w-full object-cover"
                      />
                    </button>
                  );
                })}
              </div>
            ) : null}
            <div
              data-testid="product-image-stage"
              data-image-count={usableImages.length}
              className="relative order-1 grid min-h-[300px] place-items-center overflow-hidden rounded-2xl bg-surface-low sm:order-2 sm:min-h-[360px]"
            >
              {selectedImage ? (
                <img
                  key={selectedImage.url}
                  data-testid="product-main-image"
                  src={selectedImage.url}
                  alt={selectedImage.alt || product.name}
                  loading="eager"
                  fetchPriority="high"
                  onError={() => markImageBroken(selectedImage.url)}
                  className="max-h-[440px] w-full object-contain"
                />
              ) : (
                <div className="max-w-sm px-6 py-10 text-center">
                  <ImageOff className="mx-auto h-9 w-9 text-muted" aria-hidden />
                  <p className="mt-3 text-sm font-semibold text-muted">
                    {sourceImages.length > 0
                      ? "This listing's images could not be loaded."
                      : "The seller has not provided an image for this listing."}
                  </p>
                </div>
              )}
            </div>
          </div>
          <div className="p-5">
            <p className="text-xs font-black uppercase tracking-wide text-muted">{product.brand || product.category.name}</p>
            <h1 className="mt-2 font-display text-2xl font-extrabold sm:text-3xl">{product.name}</h1>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              {product.rating?.average ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-soft px-3 py-1 font-bold text-amber">
                  <Star className="h-4 w-4 fill-amber text-amber" aria-hidden />
                  {product.rating.average} from {product.rating.count} verified review(s)
                </span>
              ) : (
                <span className="rounded-full bg-surface-low px-3 py-1 font-bold text-muted">No reviews yet</span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1 font-bold text-primary">
                <Store className="h-4 w-4" aria-hidden /> {product.vendor.name} · Verified seller
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-low px-3 py-1 font-bold">
                <MapPin className="h-4 w-4" aria-hidden /> {product.vendor.market}
              </span>
            </div>
            {description ? (
              <p data-testid="product-description" className="mt-4 whitespace-pre-line text-muted">
                {description}
              </p>
            ) : (
              <p data-testid="product-description-missing" className="mt-4 rounded-xl bg-surface-low p-3 text-sm font-semibold text-muted">
                The seller has not provided a description for this listing.
              </p>
            )}

            <section id="reviews" className="mt-6 scroll-mt-24">
              <h2 className="font-display text-xl font-extrabold">Reviews</h2>
              {!product.reviews || product.reviews.length === 0 ? (
                <p className="mt-2 text-sm text-muted">This product has no approved reviews yet.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {product.reviews.map((review) => (
                    <article key={review.id} className="rounded-xl bg-surface-low p-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-sm font-black text-amber">
                          <Star className="h-4 w-4 fill-amber text-amber" aria-hidden /> {review.rating}
                        </span>
                        <p className="font-bold">{review.title}</p>
                      </div>
                      <p className="mt-1 text-sm text-muted">{review.body}</p>
                      <p className="mt-1 text-xs text-muted">By {review.user.name}</p>
                    </article>
                  ))}
                </div>
              )}
              {signedIn ? (
                <ReviewForm productId={product.id} productName={product.name} />
              ) : (
                <p className="mt-4 rounded-xl bg-surface-low p-3 text-xs text-muted">
                  Reviews can be written after a delivered order of this product.{" "}
                  <Link href="/login" className="font-bold text-primary underline">
                    Sign in
                  </Link>{" "}
                  to see your eligible orders.
                </p>
              )}
            </section>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-border-soft bg-canvas p-5 shadow-sm">
            <p data-testid="product-price" className="font-display text-3xl font-extrabold text-primary">{koboToNaira(unitPrice)}</p>
            {product.compareAtKobo && Number(product.compareAtKobo) > Number(unitPrice) ? (
              <p className="text-sm text-muted line-through">{koboToNaira(product.compareAtKobo)}</p>
            ) : null}
            <p data-testid="product-availability" className={`mt-2 text-sm font-bold ${available > 0 ? "text-primary" : "text-crimson"}`}>
              {available > 0 ? `${available} unit(s) available` : "Out of stock"}
            </p>

            {product.variants && product.variants.length > 0 ? (
              <label className="mt-4 block">
                <span className="text-sm font-black">Choose an option</span>
                <select
                  data-testid="product-variant"
                  value={variantId ?? ""}
                  onChange={(event) => setVariantId(event.target.value || null)}
                  className="mt-1 min-h-11 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm font-semibold"
                >
                  {product.variants.map((variant) => {
                    const variantAvailable = Math.max(variant.stock - variant.reserved, 0);
                    return (
                      <option key={variant.id} value={variant.id} disabled={variantAvailable === 0}>
                        {variant.name} — {koboToNaira(variant.priceKobo)} ({variantAvailable === 0 ? "out of stock" : `${variantAvailable} left`})
                      </option>
                    );
                  })}
                </select>
              </label>
            ) : null}

            {available > 0 ? (
              <label className="mt-4 block">
                <span className="text-sm font-black">Quantity</span>
                <select
                  data-testid="product-quantity"
                  value={Math.min(quantity, Math.max(available, 1))}
                  onChange={(event) => setQuantity(Number(event.target.value))}
                  className="mt-1 min-h-11 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm font-semibold"
                >
                  {Array.from({ length: Math.min(available, 10) }).map((_, index) => (
                    <option key={index + 1} value={index + 1}>
                      {index + 1}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {error ? (
              <p role="alert" className="mt-3 text-sm font-bold text-crimson">
                {error}
              </p>
            ) : null}

            {product.isSample ? (
              <p className="mt-4 rounded-xl border border-[#B45309]/40 bg-amber/10 p-4 text-sm font-bold text-ink">
                Demo listing only. This item is demonstration data and cannot be purchased.
              </p>
            ) : product.saleMode === "contact" ? (
              <div className="mt-4 rounded-xl border border-night/20 bg-surface-low p-4">
                <p className="text-sm font-extrabold">Contact seller</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  This listing is fulfilled directly by {product.vendor.name}. Payment, inspection and delivery are arranged with
                  the seller — NaijaDeals escrow does not cover it.
                </p>
                {product.vendor.pickupPhone ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      href={`tel:${product.vendor.pickupPhone}`}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-night px-4 text-sm font-bold text-white"
                    >
                      Call {product.vendor.pickupPhone}
                    </a>
                    <a
                      href={`https://wa.me/${String(product.vendor.pickupPhone).replace(/[^0-9]/g, "")}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-night px-4 text-sm font-bold"
                    >
                      WhatsApp seller
                    </a>
                  </div>
                ) : (
                  <p className="mt-3 text-xs font-bold text-muted">Contact details appear once the seller adds a phone number.</p>
                )}
              </div>
            ) : (
              <div className="mt-4 grid gap-2">
                <button
                  data-testid="add-to-cart"
                  onClick={() => void addToCart(false)}
                  disabled={adding || available === 0}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-surface-mid disabled:text-muted"
                >
                  {adding ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShoppingCart className="h-4 w-4" aria-hidden />}
                  Add to cart
                </button>
                <button
                  onClick={() => void addToCart(true)}
                  disabled={adding || available === 0}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-night px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-surface-mid disabled:text-muted"
                >
                  <ArrowRight className="h-4 w-4" aria-hidden /> Buy now
                </button>
                <button
                  onClick={() => void toggleSaved()}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border-soft px-5 text-sm font-bold"
                >
                  <Heart className={`h-4 w-4 ${saved ? "fill-crimson text-crimson" : ""}`} aria-hidden />
                  {saved ? "Saved" : "Save for later"}
                </button>
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-2xl border border-border-soft bg-canvas p-5 text-sm">
            <p className="flex items-center gap-2 font-bold">
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden /> Escrow protected
            </p>
            <p className="text-muted">The seller is paid after you confirm delivery.</p>
            <p className="flex items-center gap-2 font-bold">
              <Truck className="h-4 w-4 text-primary" aria-hidden /> Delivery from {product.vendor.market}
            </p>
            <p className="text-muted">Delivery fee is calculated at checkout from your state and city.</p>
            <p className="flex items-center gap-2 font-bold">
              <PackageCheck className="h-4 w-4 text-primary" aria-hidden /> Pickup details
            </p>
            <p className="text-muted">Seller pickup address and phone are shared with the assigned courier.</p>
            <p className="flex items-center gap-2 font-bold">
              <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden /> Condition
            </p>
            <p className="text-muted">{product.condition === "NEW" ? "New" : product.condition}</p>
          </div>
        </aside>
      </div>

      {related.length > 0 ? (
        <section aria-labelledby="related-heading">
          <h2 id="related-heading" className="mb-4 font-display text-2xl font-extrabold">
            More in {product.category.name}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((item) => (
              <RelatedProductCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function RelatedProductCard({ item }: { item: ApiProduct }) {
  const [imageBroken, setImageBroken] = useState(false);
  const image = imageBroken ? null : item.images[0];

  return (
    <Link
      href={`/product/${item.slug}`}
      className="rounded-2xl border border-border-soft bg-canvas p-3 hover:shadow-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {image ? (
        <img
          src={image.url}
          alt={image.alt || item.name}
          loading="lazy"
          onError={() => setImageBroken(true)}
          className="aspect-[4/3] w-full rounded-xl object-cover"
        />
      ) : (
        <span className="grid aspect-[4/3] w-full place-items-center rounded-xl bg-surface-low text-xs font-semibold text-muted">
          No image supplied
        </span>
      )}
      <p className="mt-2 line-clamp-2 text-sm font-bold">{item.name}</p>
      <p className="text-sm font-black text-primary">{koboToNaira(item.priceKobo)}</p>
    </Link>
  );
}
