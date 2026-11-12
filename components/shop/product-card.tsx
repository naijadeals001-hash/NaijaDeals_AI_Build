"use client";

import Link from "next/link";
import { Loader2, Star } from "lucide-react";
import { koboToNaira } from "@/lib/api-client";

export type ShopProduct = {
  id: string;
  name: string;
  slug: string;
  brand?: string | null;
  priceKobo: string | number | bigint;
  compareAtKobo?: string | number | bigint | null;
  images?: Array<{ url: string }>;
  category?: { name: string; slug: string } | null;
  rating?: { average: number | null; count: number } | null;
  stock?: { quantity?: number; reserved?: number } | null;
  /** Server-calculated available units (variants summed when present). */
  available?: number | null;
  vendor?: { id?: string; name: string; slug?: string; market?: string } | null;
  saleMode?: "escrow" | "contact";
};

function naira(value: string | number | bigint) {
  return koboToNaira(typeof value === "bigint" ? Number(value) : value);
}

/**
 * Storefront product card, built for compact merchandising.
 *
 * The vertical rhythm is fixed so a row of four cards on a phone lines up:
 * discount badge | square image | two-line name | price | rating | action.
 * The name clamps to two lines with an ellipsis while its full text stays in the
 * link and the button's accessible label.
 *
 * Ratings only render from verified review data supplied by the API. Products
 * with no reviews show an explicit "No reviews yet" line rather than invented
 * stars, and that line occupies the same height so cards stay aligned.
 */
export function ShopProductCard({
  product,
  onAdd,
  adding = false,
  added = false,
  variant = "grid"
}: {
  product: ShopProduct;
  onAdd?: (product: ShopProduct) => void;
  adding?: boolean;
  added?: boolean;
  /** `deal` is the denser row used by Deals of the day. */
  variant?: "grid" | "deal";
}) {
  const price = Number(product.priceKobo);
  const compare = product.compareAtKobo ? Number(product.compareAtKobo) : null;
  const discount = compare && compare > price ? Math.round(((compare - price) / compare) * 100) : null;
  const rating = product.rating?.average ?? null;
  const reviewCount = product.rating?.count ?? 0;
  const hasRating = rating !== null && reviewCount > 0;
  const image = product.images?.[0]?.url ?? null;
  const href = `/product/${product.slug}`;
  const dense = variant === "deal";
  const vendorName = product.vendor?.name?.trim() || null;
  const available =
    typeof product.available === "number"
      ? product.available
      : typeof product.stock?.quantity === "number"
        ? Math.max(product.stock.quantity - (product.stock.reserved ?? 0), 0)
        : null;
  const soldOut = available === 0;
  const contactOnly = product.saleMode === "contact";

  return (
    <article
      data-product={product.slug}
      className={`group relative flex h-full min-w-0 flex-col overflow-hidden rounded-lg border border-[#e3e6e6] bg-white transition hover:shadow-[0_4px_16px_rgba(15,17,17,0.12)] ${
        dense ? "p-1 sm:p-2.5" : "p-2 sm:p-3"
      }`}
    >
      {discount !== null ? (
        <span className="absolute left-1 top-1 z-10 rounded bg-[#cc0c39] px-1 py-0.5 text-[8px] font-extrabold leading-none text-white sm:left-2 sm:top-2 sm:px-1.5 sm:text-[11px]">
          -{discount}%
        </span>
      ) : null}

      <Link href={href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C99520]">
        <div className="aspect-square w-full overflow-hidden rounded-md bg-white">
          {image ? (
            <img
              src={image}
              alt={product.name}
              loading="lazy"
              className="h-full w-full object-contain transition duration-300 group-hover:scale-[1.04]"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-[10px] font-semibold text-[#565959]">No image</div>
          )}
        </div>
      </Link>

      <Link href={href} className="mt-1 block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C99520]">
        <h3
          className={`line-clamp-2 break-words font-semibold text-[#0f1111] group-hover:text-[#c45500] ${
            dense
              ? "min-h-[1.75rem] text-[9.5px] leading-[0.875rem] sm:min-h-[2.5rem] sm:text-[13px] sm:leading-5"
              : "min-h-[2rem] text-[11px] leading-4 sm:text-[13px] sm:leading-5"
          }`}
        >
          {product.name}
        </h3>
      </Link>

      <p className="mt-0.5 flex min-h-[0.875rem] flex-wrap items-baseline gap-x-1 sm:min-h-[1.25rem]">
        <span className={`font-extrabold text-[#C81919] ${dense ? "text-[11px] sm:text-[16px]" : "text-[13px] sm:text-[16px]"}`}>
          {naira(product.priceKobo)}
        </span>
        {compare && compare > price ? (
          <span className={`text-[#565959] line-through ${dense ? "text-[8px] sm:text-[11.5px]" : "text-[10px] sm:text-[11.5px]"}`}>
            {naira(compare)}
          </span>
        ) : null}
      </p>

      {/* Fixed-height rating row keeps every card in the row aligned. */}
      <p className="mt-0.5 flex min-h-[0.75rem] items-center gap-0.5 text-[#de7921] sm:min-h-[1rem]">
        {hasRating ? (
          <Link href={`${href}#reviews`} className="flex min-w-0 items-center gap-0.5 hover:underline" aria-label={`${rating} out of 5 from ${reviewCount} reviews`}>
            <span className="flex shrink-0" aria-hidden>
              {[1, 2, 3, 4, 5].map((step) => (
                <Star
                  key={step}
                  className={`h-2 w-2 sm:h-3 sm:w-3 ${step <= Math.round(rating as number) ? "fill-[#de7921] text-[#de7921]" : "fill-[#e3e6e6] text-[#e3e6e6]"}`}
                />
              ))}
            </span>
            <span className="shrink-0 text-[8px] text-[#007185] sm:text-[11px]">({reviewCount.toLocaleString("en-NG")})</span>
          </Link>
        ) : (
          <span className="truncate text-[8px] text-[#8a8f8f] sm:text-[11px]">No reviews yet</span>
        )}
      </p>

      <p className="mt-0.5 flex min-h-[0.875rem] flex-wrap items-center gap-x-1 text-[8px] leading-[1.1] text-[#565959] sm:min-h-[1rem] sm:text-[11px]">
        {available === null ? null : soldOut ? (
          <span className="font-semibold text-[#b12704]">Out of stock</span>
        ) : (
          <span className="font-semibold text-[#067d62]">In stock</span>
        )}
        {vendorName ? <span className="min-w-0 truncate">Sold by {vendorName}</span> : null}
      </p>

      {contactOnly ? (
        <Link
          href={href}
          className={`mt-1 flex w-full items-center justify-center rounded-full bg-[#0f1b2d] font-bold leading-none text-white transition hover:bg-[#1b2c46] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f1111]/40 ${
            dense ? "h-7 text-[8.5px] sm:h-9 sm:text-[12.5px]" : "h-9 text-[10.5px] sm:text-[12.5px]"
          }`}
        >
          Contact seller
        </Link>
      ) : onAdd ? (
        <button
          type="button"
          onClick={() => onAdd(product)}
          disabled={adding || soldOut}
          aria-label={soldOut ? `${product.name} is out of stock` : `Add ${product.name} to cart`}
          className={`mt-1 flex w-full items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-full bg-[#ffd814] font-bold leading-none text-[#0f1111] transition hover:bg-[#f7ca00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f1111]/40 disabled:cursor-not-allowed disabled:opacity-60 ${
            dense
              ? "h-7 px-1 text-[8.5px] sm:h-9 sm:px-3 sm:text-[12.5px]"
              : "h-9 px-2 text-[10.5px] sm:h-9 sm:px-3 sm:text-[12.5px]"
          }`}
          title={soldOut ? `${product.name} is out of stock` : `Add ${product.name} to cart`}
        >
          {adding ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden /> : null}
          {soldOut ? "Out of stock" : added ? "Added ✓" : adding ? "Adding…" : "Add to Cart"}
        </button>
      ) : null}
    </article>
  );
}
