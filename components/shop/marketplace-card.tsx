"use client";

import Link from "next/link";
import { ArrowRight, Check, Loader2, Star, Store } from "lucide-react";
import { koboToNaira, type ApiProduct } from "@/lib/api-client";

/**
 * Marketplace card for the NaijaDeals storefront.
 *
 * It shows only facts the catalogue supplies: the seller, the listed price, a
 * real compare-at reduction, and server-reported availability. Variant products
 * route to their options instead of offering an add-to-cart that the server
 * would reject, and no review stars appear until a product actually has
 * approved reviews.
 */
export function MarketplaceProductCard({
  product,
  onAdd,
  adding = false,
  added = false
}: {
  product: ApiProduct;
  onAdd?: (product: ApiProduct) => void;
  adding?: boolean;
  added?: boolean;
}) {
  const price = Number(product.priceKobo);
  const compare = product.compareAtKobo === null || product.compareAtKobo === undefined ? null : Number(product.compareAtKobo);
  const activeVariants = (product.variants ?? []).filter((variant) => variant.isActive);
  const hasVariants = activeVariants.length > 0;
  const variantPrices = activeVariants.map((variant) => Number(variant.priceKobo)).filter((value) => Number.isFinite(value));
  const startingPrice = hasVariants && variantPrices.length > 0 ? Math.min(price, ...variantPrices) : price;
  const pricedFrom = hasVariants && variantPrices.some((value) => value !== price);
  const discount =
    compare !== null && Number.isFinite(compare) && compare > startingPrice
      ? Math.round(((compare - startingPrice) / compare) * 100)
      : null;

  const vendorName = product.vendor?.name?.trim() || null;
  const soldByVerified = product.vendor?.status?.toUpperCase() === "VERIFIED";
  const image = product.images?.[0]?.url ?? null;

  const available =
    typeof product.available === "number"
      ? product.available
      : hasVariants
        ? activeVariants.reduce((total, variant) => total + Math.max(variant.stock - variant.reserved, 0), 0)
        : product.stock
          ? Math.max(product.stock.quantity - (product.stock.reserved ?? 0), 0)
          : null;
  const soldOut = available !== null && available <= 0;
  const lowStockLevel = product.stock?.lowStockLevel ?? 3;
  const onlyAFewLeft = !soldOut && available !== null && available > 0 && available <= lowStockLevel;
  const contactOnly = product.saleMode === "contact";

  const rating = product.rating?.average ?? null;
  const reviewCount = product.rating?.count ?? 0;
  const hasRating = rating !== null && rating > 0 && reviewCount > 0;

  const href = `/product/${product.slug}`;

  return (
    <article
      data-product={product.slug}
      className="group flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-[#e1e8de] bg-white transition duration-300 hover:-translate-y-0.5 hover:border-[#c7d7c2] hover:shadow-[0_16px_34px_rgba(7,53,31,0.10)]"
    >
      <div className="relative">
        <Link
          href={href}
          aria-label={`View ${product.name}`}
          className="block aspect-square overflow-hidden bg-[#f6f8f4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0b5c33]"
        >
          {image ? (
            <img
              src={image}
              alt={product.images?.[0]?.alt || product.name}
              loading="lazy"
              className="h-full w-full object-contain p-3 transition duration-300 group-hover:scale-[1.04] sm:p-4"
            />
          ) : (
            <span className="grid h-full w-full place-items-center text-[11px] font-semibold text-[#566359]">No image supplied</span>
          )}
        </Link>

        {discount !== null && discount > 0 ? (
          <span className="absolute left-2 top-2 rounded-full bg-[#b42318] px-2 py-0.5 text-[10px] font-extrabold leading-4 text-white">
            -{discount}%
          </span>
        ) : null}

        {hasVariants ? (
          <span className="absolute right-2 top-2 rounded-full bg-[#07351f]/90 px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide text-white">
            Options
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-3 sm:p-3.5">
        {vendorName ? (
          <p className="flex min-w-0 items-center gap-1 text-[10px] font-semibold text-[#566359]">
            <Store className="h-3 w-3 shrink-0 text-[#0f7a4a]" aria-hidden />
            <span className="truncate">
              Sold by {vendorName}
              {soldByVerified ? <span className="sr-only"> (verified seller)</span> : null}
            </span>
          </p>
        ) : null}

        <Link href={href} className="mt-1 block rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33]">
          <h3 className="line-clamp-2 min-h-[2.5rem] break-words text-[13px] font-bold leading-5 text-[#14241b] group-hover:text-[#0b5c33]">
            {product.name}
          </h3>
        </Link>

        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5">
          {pricedFrom ? <span className="text-[10px] font-semibold uppercase tracking-wide text-[#566359]">From</span> : null}
          <span className="text-[17px] font-extrabold tracking-tight text-[#14241b]">{koboToNaira(startingPrice)}</span>
          {compare !== null && compare > startingPrice ? (
            <span className="text-[11px] text-[#566359] line-through">{koboToNaira(compare)}</span>
          ) : null}
        </div>

        <p className="mt-1 flex min-h-[1rem] items-center gap-1.5 text-[10.5px] font-semibold">
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${soldOut ? "bg-[#b42318]" : onlyAFewLeft ? "bg-[#b45309]" : "bg-[#0f7a4a]"}`}
            aria-hidden
          />
          {soldOut ? (
            <span className="text-[#b42318]">Out of stock</span>
          ) : onlyAFewLeft ? (
            <span className="text-[#9a4a06]">Only {available} left</span>
          ) : available !== null ? (
            <span className="text-[#4b5b51]">{available} available</span>
          ) : (
            <span className="text-[#566359]">Stock confirmed at checkout</span>
          )}
          {hasVariants ? <span className="text-[#566359]">· {activeVariants.length} options</span> : null}
        </p>

        {hasRating ? (
          <Link
            href={`${href}#reviews`}
            aria-label={`${rating.toFixed(1)} out of 5 from ${reviewCount} reviews`}
            className="mt-1 inline-flex w-fit items-center gap-1 rounded text-[10.5px] font-bold text-[#7a4c00] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33]"
          >
            <Star className="h-3 w-3 fill-[#f5b52e] text-[#a66a00]" aria-hidden />
            {rating.toFixed(1)}
            <span className="font-semibold text-[#566359]">({reviewCount.toLocaleString("en-NG")})</span>
          </Link>
        ) : null}

        <div className="mt-auto pt-2">
          {hasVariants ? (
            <Link
              href={href}
              aria-label={`See options for ${product.name}`}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-full bg-[#07351f] px-2 text-[11.5px] font-extrabold text-white transition hover:bg-[#0b4a2a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f5b52e] focus-visible:ring-offset-2"
            >
              See options
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ) : contactOnly ? (
            <Link
              href={href}
              aria-label={`Contact the seller about ${product.name}`}
              className="flex h-9 w-full items-center justify-center rounded-full border border-[#b9cbb4] px-2 text-[11.5px] font-extrabold text-[#0b5c33] transition hover:bg-[#eef5eb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2"
            >
              Contact seller
            </Link>
          ) : onAdd ? (
            <button
              type="button"
              onClick={() => onAdd(product)}
              disabled={adding || soldOut}
              aria-label={soldOut ? `${product.name} is out of stock` : `Add ${product.name} to cart`}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-full bg-[#f5b52e] px-2 text-[11.5px] font-extrabold text-[#14241b] transition hover:bg-[#eab020] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[#eef1ec] disabled:text-[#566359]"
            >
              {adding ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden /> : null}
              {soldOut ? "Out of stock" : added ? (
                <>
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  Added
                </>
              ) : adding ? (
                "Adding…"
              ) : (
                "Add to cart"
              )}
            </button>
          ) : (
            <Link
              href={href}
              className="flex h-9 w-full items-center justify-center rounded-full border border-[#b9cbb4] px-2 text-[11.5px] font-extrabold text-[#0b5c33]"
            >
              View listing
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
