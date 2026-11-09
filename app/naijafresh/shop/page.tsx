import type { Metadata } from "next";
import Link from "next/link";
import { FRESH_CATEGORIES, countryFacets, isFreshCategory, listProduce } from "@/lib/services/fresh/catalogue";
import { ProduceCard } from "@/components/fresh/fresh-sections";
import { produceImage } from "@/lib/services/fresh/images";
import { FreshEmpty, FreshHeading, FreshPage } from "@/components/fresh/fresh-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Shop fresh produce — NaijaFresh", alternates: { canonical: "/naijafresh/shop" } };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function FreshShopPage({ searchParams }: { searchParams: { q?: string; category?: string; country?: string } }) {
  const q = (searchParams.q ?? "").trim();
  const category = isFreshCategory(searchParams.category) ? searchParams.category : undefined;
  const country = (searchParams.country ?? "").trim() || undefined;
  const [listings, countries] = await Promise.all([listProduce({ q, category, country, take: 200 }), countryFacets()]);
  const activeLabel = FRESH_CATEGORIES.find((row) => row.slug === category)?.label;

  return (
    <FreshPage>
      <FreshHeading
        eyebrow="Shop Produce"
        title={activeLabel ?? (q ? `Results for “${q}”` : country ? `Fresh produce from ${country}` : "All fresh produce from Africa")}
        description="Every price shows the agricultural unit it is sold by. Prices and stock come from each farm's live listing."
      />
      <form action="/naijafresh/shop" method="get" role="search" className="mb-3 flex flex-wrap gap-2">
        <label htmlFor="shop-q" className="sr-only">Search produce</label>
        <input id="shop-q" name="q" defaultValue={q} placeholder="Tomatoes, ugu, yam, rice…" className="min-w-0 flex-1 rounded-full bg-white px-4 py-2 text-[12.5px] ring-1 ring-[#dfe6e1] focus:outline-none focus:ring-2 focus:ring-[#0b5c33]" />
        {category ? <input type="hidden" name="category" value={category} /> : null}
        {country ? <input type="hidden" name="country" value={country} /> : null}
        <button type="submit" className="rounded-full bg-[#0b5c33] px-5 py-2 text-[12px] font-extrabold text-white">Search</button>
      </form>
      <nav aria-label="Filter by category" className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        <Link href="/naijafresh/shop" className={`shrink-0 rounded-full px-3 py-1.5 text-[11.5px] font-bold ${!category ? "bg-[#0b5c33] text-white" : "bg-white text-[#14241b] ring-1 ring-[#dfe6e1]"}`}>
          All produce
        </Link>
        {FRESH_CATEGORIES.map((row) => (
          <Link key={row.slug} href={`/naijafresh/category/${row.slug}`} className={`shrink-0 rounded-full px-3 py-1.5 text-[11.5px] font-bold ${category === row.slug ? "bg-[#0b5c33] text-white" : "bg-white text-[#14241b] ring-1 ring-[#dfe6e1]"}`}>
            {row.label}
          </Link>
        ))}
      </nav>
      <nav aria-label="Filter by country" className="-mx-1 mb-3 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        <span className="shrink-0 pr-1 text-[10.5px] font-bold uppercase tracking-wide text-[#6b7a70]">Country</span>
        <Link href={category ? `/naijafresh/shop?category=${category}` : "/naijafresh/shop"} className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold ${!country ? "bg-[#f26b21] text-white" : "bg-white text-[#14241b] ring-1 ring-[#dfe6e1]"}`}>
          All Africa
        </Link>
        {countries.map((row) => (
          <Link key={row.country} href={category ? `/naijafresh/shop?category=${category}&country=${encodeURIComponent(row.country)}` : `/naijafresh/shop?country=${encodeURIComponent(row.country)}`} className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold ${country === row.country ? "bg-[#f26b21] text-white" : "bg-white text-[#14241b] ring-1 ring-[#dfe6e1]"}`}>
            {row.country}
          </Link>
        ))}
      </nav>
      {listings.length ? (
        <>
          <p className="mb-2 text-[11.5px] text-[#5d6d64]">{listings.length} {listings.length === 1 ? "listing" : "listings"}</p>
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {listings.map((listing) => (
              <ProduceCard key={listing.id} listing={listing} variant="grid" image={produceImage(listing)} />
            ))}
          </ul>
        </>
      ) : (
        <FreshEmpty
          title={q || category ? "No produce matches that search" : "No produce is listed yet"}
          body={q || category ? "Try a different crop name or browse another category." : "Verified farms list their harvest here as soon as they publish it."}
          cta={{ href: "/naijafresh/shop", label: "See all produce" }}
        />
      )}
    </FreshPage>
  );
}
