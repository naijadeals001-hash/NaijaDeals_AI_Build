"use client";

import Link from "next/link";
import { useState } from "react";
import { ImageOff } from "lucide-react";
import type { ShopProduct } from "./types";
import { isDemoListing, moneyText } from "./types";

function RelatedProductCard({ item }: { item: ShopProduct }) {
  const [imageBroken, setImageBroken] = useState(false);
  const image = imageBroken ? null : (item.images ?? [])[0];

  return (
    <Link
      href={`/product/${item.slug}`}
      className="flex min-w-0 flex-col rounded-2xl border border-border-soft bg-canvas p-3 transition hover:border-primary/40 hover:shadow-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {image ? (
        <img
          src={image.url}
          alt={image.alt || item.name}
          loading="lazy"
          onError={() => setImageBroken(true)}
          className="aspect-[4/3] w-full rounded-xl bg-surface-low object-cover"
        />
      ) : (
        <span className="grid aspect-[4/3] w-full place-items-center rounded-xl bg-surface-low text-xs font-semibold text-muted">
          <ImageOff className="mb-1 h-5 w-5" aria-hidden />
          No image supplied
        </span>
      )}
      {isDemoListing(item) ? (
        <span className="mt-2 inline-flex w-fit rounded-full bg-[#F2D48C] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.08em] text-[#07351f]">
          DEMO
        </span>
      ) : null}
      <p className="mt-1.5 line-clamp-2 text-sm font-bold leading-5 text-ink">{item.name}</p>
      <p className="mt-auto pt-1 text-sm font-black text-primary">{moneyText(item, item.priceKobo)}</p>
      <p className="text-[11px] text-muted">{item.category.name}</p>
    </Link>
  );
}

/**
 * Related listings are a convenience rail. The parent hides this section when
 * the related request fails or returns nothing, so a taxonomy hiccup can never
 * blank the product itself.
 */
export function RelatedProducts({
  items,
  categoryName,
  status = "ready",
  onRetry
}: {
  items: ShopProduct[];
  categoryName: string;
  status?: "idle" | "loading" | "ready" | "unavailable";
  onRetry?: () => void;
}) {
  if (items.length === 0) {
    if (status === "unavailable") {
      return (
        <section data-testid="related-products-unavailable" role="status" aria-live="polite">
          <h2 className="mb-2 font-display text-xl font-extrabold text-ink sm:text-2xl">More in {categoryName}</h2>
          <p className="text-sm font-semibold text-muted">
            Related listings could not be loaded. The product above is unaffected.
          </p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-border-soft px-3 text-sm font-bold text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Try related listings again
            </button>
          ) : null}
        </section>
      );
    }
    if (status === "loading") {
      return (
        <section data-testid="related-products-loading" aria-busy="true">
          <h2 className="mb-2 font-display text-xl font-extrabold text-ink sm:text-2xl">More in {categoryName}</h2>
          <p role="status" className="text-sm font-semibold text-muted">Loading related listings…</p>
        </section>
      );
    }
    return null;
  }
  return (
    <section data-testid="related-products" aria-labelledby="related-heading">
      <h2 id="related-heading" className="mb-4 font-display text-xl font-extrabold text-ink sm:text-2xl">
        More in {categoryName}
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {items.map((item) => (
          <RelatedProductCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
