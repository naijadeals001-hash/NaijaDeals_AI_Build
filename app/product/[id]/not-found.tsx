import Link from "next/link";

export default function ProductNotFound() {
  return (
    <main className="mx-auto w-full max-w-[720px] px-4 py-16 text-center">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#0b5c33]">Listing unavailable</p>
      <h1 className="mt-2 font-display text-3xl font-extrabold text-[#14241b]">This product is not available.</h1>
      <p className="mt-3 text-sm leading-6 text-[#4b5b51]">
        It may have been unpublished or removed. No listing details are shown for unavailable products.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/naijashop" className="inline-flex min-h-11 items-center rounded-xl bg-[#0b5c33] px-5 text-sm font-bold text-white">
          Back to Shop
        </Link>
        <Link href="/search" className="inline-flex min-h-11 items-center rounded-xl border border-[#c7d7c2] px-5 text-sm font-bold text-[#07351f]">
          Search the marketplace
        </Link>
      </div>
    </main>
  );
}
