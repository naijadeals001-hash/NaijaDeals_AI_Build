import type { Metadata } from "next";
import Link from "next/link";
import { PackageX, Search } from "lucide-react";

export const metadata: Metadata = {
  title: "Product unavailable",
  robots: { index: false, follow: true }
};

/**
 * A product that is unpublished, archived, restricted or missing returns a real
 * 404 through `notFound()`. No listing detail, price, seller or image is leaked
 * into the unavailable state.
 */
export default function ProductNotFound() {
  return (
    <section aria-labelledby="product-unavailable-heading" className="mx-auto w-full max-w-[760px] py-8 sm:py-12">
      <div className="rounded-2xl border border-border-soft bg-canvas p-6 text-center shadow-sm sm:p-10">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-surface-low text-muted">
          <PackageX className="h-7 w-7" aria-hidden />
        </span>
        <p className="mt-4 text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary">Listing unavailable</p>
        <h1 id="product-unavailable-heading" className="mt-2 font-display text-2xl font-extrabold text-ink sm:text-3xl">
          This product is not available
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted">
          It may have been unpublished, archived or removed by the seller. Unavailable listings do not show prices,
          images or seller details.
        </p>

        <form action="/naijashop/search" method="get" role="search" className="mx-auto mt-6 flex max-w-md gap-2">
          <label htmlFor="unavailable-search" className="sr-only">
            Search NaijaShop products
          </label>
          <span className="relative flex min-w-0 flex-1 items-center">
            <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted" aria-hidden />
            <input
              id="unavailable-search"
              name="q"
              type="search"
              placeholder="Search the marketplace"
              className="min-h-11 w-full rounded-xl border border-border-soft bg-surface-low pl-9 pr-3 text-sm font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            />
          </span>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Search
          </button>
        </form>

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link
            href="/naijashop"
            className="inline-flex min-h-11 items-center rounded-xl border border-border-soft px-5 text-sm font-bold text-ink hover:bg-surface-low focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Back to Shop
          </Link>
          <Link
            href="/naijashop/categories"
            className="inline-flex min-h-11 items-center rounded-xl border border-border-soft px-5 text-sm font-bold text-ink hover:bg-surface-low focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Browse departments
          </Link>
        </div>
      </div>
    </section>
  );
}
