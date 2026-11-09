"use client";

import Link from "next/link";
import { Loader2, ShoppingCart } from "lucide-react";
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
  stock?: { quantity?: number } | null;
};

function naira(value: string | number | bigint) {
  return koboToNaira(typeof value === "bigint" ? Number(value) : value);
}

/**
 * Storefront product card. Ratings render only when the API supplies them;
 * without verified reviews the stars are omitted rather than invented.
 */
export function ShopProductCard({
  product,
  onAdd,
  adding = false,
  variant = "grid"
}: {
  product: ShopProduct;
  onAdd?: (product: ShopProduct) => void;
  adding?: boolean;
  variant?: "grid" | "deal";
}) {
  const price = Number(product.priceKobo);
  const compare = product.compareAtKobo ? Number(product.compareAtKobo) : null;
  const discount = compare && compare > price ? Math.round(((compare - price) / compare) * 100) : null;
  const rating = product.rating?.average ?? null;
  const reviewCount = product.rating?.count ?? null;
  const image = product.images?.[0]?.url ?? null;
  const href = `/product/${product.slug}`;

  return (
    <article
      data-product={product.slug}
      className={`group relative flex h-full min-w-0 flex-col overflow-hidden rounded-lg border border-[#e3e6e6] bg-white p-1 transition hover:shadow-[0_4px_16px_rgba(15,17,17,0.12)] sm:p-2.5`}
    >
      {discount !== null ? (
        <span className="absolute left-1 top-1 z-10 rounded bg-[#cc0c39] px-1 py-0.5 text-[9px] font-extrabold text-white sm:left-2 sm:top-2 sm:px-1.5 sm:text-[11px]">
          -{discount}%
        </span>
      ) : null}
      <Link href={href} className="block">
        <div className="aspect-square w-full overflow-hidden rounded-md bg-white">
          {image ? (
            <img
              src={image}
              alt={product.name}
              loading="lazy"
              className="h-full w-full object-contain transition duration-300 group-hover:scale-[1.04]"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-[11px] font-semibold text-[#565959]">Image unavailable</div>
          )}
        </div>
        <h3 className="mt-1 line-clamp-3 min-h-[2.25rem] text-[10px] font-semibold leading-[0.95rem] text-[#0f1111] group-hover:text-[#c45500] sm:mt-2 sm:line-clamp-2 sm:min-h-[2.5rem] sm:text-[13px] sm:leading-5">
          {product.name}
        </h3>
      </Link>
      {rating !== null && reviewCount !== null ? (
        <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[9px] text-[#007185] sm:mt-1 sm:text-[11.5px]">
          <span className="text-[#de7921]" aria-hidden>
            {"★".repeat(Math.round(rating))}
            <span className="text-[#e3e6e6]">{"★".repeat(5 - Math.round(rating))}</span>
          </span>
          <span className="text-[#565959]">({reviewCount.toLocaleString("en-NG")})</span>
        </p>
      ) : null}
      <p className="mt-0.5 flex flex-wrap items-baseline gap-1 sm:mt-1 sm:gap-1.5">
        <span className="text-[11px] font-extrabold text-[#C81919] sm:text-[16px]">{naira(product.priceKobo)}</span>
        {compare ? <span className="text-[9px] text-[#565959] line-through sm:text-[11.5px]">{naira(compare)}</span> : null}
      </p>
      {onAdd ? (
        <button
          type="button"
          onClick={() => onAdd(product)}
          disabled={adding}
          aria-label={`Add ${product.name} to cart`}
          className="mt-1.5 flex w-full items-center justify-center gap-0.5 rounded-full bg-[#ffd814] px-1 py-1 text-[9px] font-bold text-[#0f1111] transition hover:bg-[#f7ca00] disabled:opacity-60 sm:mt-2 sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-[12.5px]"
          title={`Add ${product.name} to cart`}
        >
          {adding ? <Loader2 className="h-3 w-3 animate-spin sm:h-3.5 sm:w-3.5" aria-hidden /> : <ShoppingCart className="hidden h-3.5 w-3.5 sm:block" aria-hidden />}
          Add<span className="hidden sm:inline">&nbsp;to Cart</span>
        </button>
      ) : null}
    </article>
  );
}
