"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Heart,
  Loader2,
  MapPin,
  PackageCheck,
  ShieldCheck,
  ShoppingCart,
  Star,
  Store,
  Truck
} from "lucide-react";
import { ApiRequestError, apiClient, koboToNaira, type ApiProduct } from "@/lib/api-client";

export function ProductDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const [product, setProduct] = useState<ApiProduct | null>(null);
  const [related, setRelated] = useState<ApiProduct[]>([]);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [saved, setSaved] = useState(false);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    let active = true;
    async function load() {
      setStatus("loading");
      setError("");
      try {
        const item = await apiClient.getProduct(id);
        const items = await apiClient.getProducts({ category: item.category.slug, sort: "trust" });
        if (!active) return;
        setProduct(item);
        setVariantId(item.variants?.[0]?.id ?? null);
        setRelated(items.filter((candidate) => candidate.id !== item.id).slice(0, 4));
        setStatus("ready");
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
  }, [id]);

  const selectedVariant = useMemo(
    () => product?.variants?.find((variant) => variant.id === variantId) ?? null,
    [product, variantId]
  );
  const unitPrice = selectedVariant?.priceKobo ?? product?.priceKobo ?? 0;
  const available = selectedVariant
    ? selectedVariant.stock - selectedVariant.reserved
    : product?.available ?? 0;

  async function addToCart(thenCheckout = false) {
    if (!product) return;
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
      <div className="grid min-h-96 place-items-center rounded-2xl border border-border-soft bg-canvas">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (status === "error" || !product) {
    return (
      <div className="rounded-2xl border border-crimson/20 bg-crimson-soft p-5 font-bold text-crimson">
        <AlertTriangle className="mb-2 h-5 w-5" />
        {error || "Product not found."}
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
      <nav className="text-sm text-muted">
        <Link href="/naijashop" className="font-bold text-primary underline">
          NaijaShop
        </Link>{" "}
        / {product.category.name}
      </nav>

      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <section className="overflow-hidden rounded-2xl border border-border-soft bg-canvas shadow-sm">
          <div className="grid gap-3 p-4 sm:grid-cols-[92px_1fr]">
            <div className="hidden gap-3 sm:grid">
              {product.images.map((image) => (
                <div key={image.id} className="grid aspect-square place-items-center overflow-hidden rounded-xl border border-border-soft bg-surface-low">
                  <img src={image.url} alt={image.alt || product.name} className="h-full w-full object-cover" />
                </div>
              ))}
            </div>
            <div className="relative grid min-h-[340px] place-items-center overflow-hidden rounded-2xl bg-surface-low">
              <img src={product.images[0]?.url} alt={product.images[0]?.alt || product.name} className="max-h-[420px] w-full object-contain" />
            </div>
          </div>
          <div className="p-5">
            <p className="text-xs font-black uppercase tracking-wide text-muted">{product.brand || product.category.name}</p>
            <h1 className="mt-2 font-display text-2xl font-extrabold sm:text-3xl">{product.name}</h1>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              {product.rating?.average ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-soft px-3 py-1 font-bold text-amber">
                  <Star className="h-4 w-4 fill-amber text-amber" />
                  {product.rating.average} from {product.rating.count} verified review(s)
                </span>
              ) : (
                <span className="rounded-full bg-surface-low px-3 py-1 font-bold text-muted">No reviews yet</span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1 font-bold text-primary">
                <Store className="h-4 w-4" /> {product.vendor.name}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-low px-3 py-1 font-bold">
                <MapPin className="h-4 w-4" /> {product.vendor.market}
              </span>
            </div>
            <p className="mt-4 whitespace-pre-line text-muted">{product.description}</p>

            <section className="mt-6">
              <h2 className="font-display text-xl font-extrabold">Reviews</h2>
              {!product.reviews || product.reviews.length === 0 ? (
                <p className="mt-2 text-sm text-muted">This product has no approved reviews yet.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {product.reviews.map((review) => (
                    <article key={review.id} className="rounded-xl bg-surface-low p-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-sm font-black text-amber">
                          <Star className="h-4 w-4 fill-amber text-amber" /> {review.rating}
                        </span>
                        <p className="font-bold">{review.title}</p>
                      </div>
                      <p className="mt-1 text-sm text-muted">{review.body}</p>
                      <p className="mt-1 text-xs text-muted">By {review.user.name}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-border-soft bg-canvas p-5 shadow-sm">
            <p className="font-display text-3xl font-extrabold text-primary">{koboToNaira(unitPrice)}</p>
            {product.compareAtKobo && Number(product.compareAtKobo) > Number(unitPrice) ? (
              <p className="text-sm text-muted line-through">{koboToNaira(product.compareAtKobo)}</p>
            ) : null}
            <p className={`mt-2 text-sm font-bold ${available > 0 ? "text-primary" : "text-crimson"}`}>
              {available > 0 ? `${available} unit(s) available` : "Out of stock"}
            </p>

            {product.variants && product.variants.length > 0 ? (
              <label className="mt-4 block">
                <span className="text-sm font-black">Choose an option</span>
                <select
                  value={variantId ?? ""}
                  onChange={(event) => setVariantId(event.target.value || null)}
                  className="mt-1 min-h-11 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm font-semibold"
                >
                  {product.variants.map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {variant.name} — {koboToNaira(variant.priceKobo)} ({variant.stock - variant.reserved} left)
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="mt-4 block">
              <span className="text-sm font-black">Quantity</span>
              <select
                value={quantity}
                onChange={(event) => setQuantity(Number(event.target.value))}
                className="mt-1 min-h-11 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm font-semibold"
              >
                {Array.from({ length: Math.min(Math.max(available, 1), 10) }).map((_, index) => (
                  <option key={index + 1} value={index + 1}>
                    {index + 1}
                  </option>
                ))}
              </select>
            </label>

            {error ? <p className="mt-3 text-sm font-bold text-crimson">{error}</p> : null}

            {product.saleMode === "contact" ? (
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
                onClick={() => void addToCart(false)}
                disabled={adding || available === 0}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-surface-mid disabled:text-muted"
              >
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                Add to cart
              </button>
              <button
                onClick={() => void addToCart(true)}
                disabled={adding || available === 0}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-night px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-surface-mid disabled:text-muted"
              >
                <ArrowRight className="h-4 w-4" /> Buy now
              </button>
              <button
                onClick={() => void toggleSaved()}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border-soft px-5 text-sm font-bold"
              >
                <Heart className={`h-4 w-4 ${saved ? "fill-crimson text-crimson" : ""}`} />
                {saved ? "Saved" : "Save for later"}
              </button>
            </div>
            )}
          </div>

          <div className="space-y-3 rounded-2xl border border-border-soft bg-canvas p-5 text-sm">
            <p className="flex items-center gap-2 font-bold">
              <ShieldCheck className="h-4 w-4 text-primary" /> Escrow protected
            </p>
            <p className="text-muted">The seller is paid after you confirm delivery.</p>
            <p className="flex items-center gap-2 font-bold">
              <Truck className="h-4 w-4 text-primary" /> Delivery from {product.vendor.market}
            </p>
            <p className="text-muted">Delivery fee is calculated at checkout from your state and city.</p>
            <p className="flex items-center gap-2 font-bold">
              <PackageCheck className="h-4 w-4 text-primary" /> Pickup details
            </p>
            <p className="text-muted">Seller pickup address and phone are shared with the assigned courier.</p>
            <p className="flex items-center gap-2 font-bold">
              <CheckCircle2 className="h-4 w-4 text-primary" /> Condition
            </p>
            <p className="text-muted">{product.condition === "NEW" ? "New" : product.condition}</p>
          </div>
        </aside>
      </div>

      {related.length > 0 ? (
        <section>
          <h2 className="mb-4 font-display text-2xl font-extrabold">More in {product.category.name}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((item) => (
              <Link key={item.id} href={`/product/${item.slug}`} className="rounded-2xl border border-border-soft bg-canvas p-3 hover:shadow-soft">
                <img src={item.images[0]?.url} alt="" className="aspect-[4/3] w-full rounded-xl object-cover" />
                <p className="mt-2 line-clamp-2 text-sm font-bold">{item.name}</p>
                <p className="text-sm font-black text-primary">{koboToNaira(item.priceKobo)}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
