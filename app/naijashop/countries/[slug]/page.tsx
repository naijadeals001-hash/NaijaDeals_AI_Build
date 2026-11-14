import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpenCheck, CheckCircle2, MapPin, PackageSearch, ShieldCheck, Store, Truck } from "lucide-react";
import { MarketplaceProductCard } from "@/components/shop/marketplace-card";
import type { ApiProduct } from "@/lib/api-client";
import { getSessionUser } from "@/lib/auth/session";
import { permissionsFor, regionViolation } from "@/lib/auth/permissions";
import { COUNTRIES } from "@/lib/config/commerce";
import { readLocale } from "@/lib/i18n/server";
import {
  getCountryForPreview,
  getPublishedCountry,
  listCountryCategories,
  listCountryOriginProducts,
  listCountrySellers,
  type CountryOriginProduct
} from "@/lib/services/countries/discovery.service";

export const dynamic = "force-dynamic";

type Props = { params: { slug: string }; searchParams?: { preview?: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const country = await getPublishedCountry(params.slug);
  if (!country) return { title: "Country guide — NaijaDeals", robots: { index: false, follow: false } };
  return {
    title: `${country.name} — Discover Africa`,
    description: `${country.introduction.slice(0, 150)} Editorial country guide with sourced themes; associations are not marketplace-availability claims.`,
    alternates: { canonical: `/naijashop/countries/${country.slug}` }
  };
}

function asApiProduct(product: CountryOriginProduct): ApiProduct {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    brand: product.brand,
    priceKobo: product.priceKobo,
    compareAtKobo: product.compareAtKobo,
    status: "ACTIVE",
    isDemo: product.isDemo,
    saleMode: product.saleMode,
    category: product.category,
    vendor: { ...product.vendor, trustScore: 0 },
    images: product.images,
    stock: product.stock ? { ...product.stock, lowStockLevel: 3 } : null,
    variants: product.variants,
    available: product.available
  };
}

function SourceList({ theme }: { theme: { sources: Array<{ id: string; title: string; publisher: string | null; url: string; accessedAt: string }> } }) {
  return (
    <details className="mt-2 rounded-lg border border-[#e2e9de] bg-[#f7faf4] px-2.5 py-2">
      <summary className="cursor-pointer text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#0b5c33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33]">
        Sources ({theme.sources.length})
      </summary>
      <ul className="mt-1.5 space-y-1.5">
        {theme.sources.map((source) => (
          <li key={source.id} className="text-[11px] leading-5 text-[#3f5246]">
            <a href={source.url} target="_blank" rel="noreferrer noopener" className="font-bold text-[#0b5c33] underline">
              {source.title}
            </a>
            {source.publisher ? <span> · {source.publisher}</span> : null}
            <span className="block text-[11px] text-[#3f5246]">Accessed {source.accessedAt.slice(0, 10)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

export default async function CountryPage({ params, searchParams }: Props) {
  const published = await getPublishedCountry(params.slug);
  let country = published;
  let previewing = false;
  if (!country) {
    const user = await getSessionUser();
    const canPreview = user ? permissionsFor(user).includes("countries:editorial:read") : false;
    if (user && canPreview && searchParams?.preview === "1") {
      const draft = await getCountryForPreview(params.slug);
      // A regional editor may preview drafts only inside their own market. A
      // foreign draft slug is indistinguishable from a missing page.
      if (draft && !regionViolation(user, { countryCode: draft.code })) {
        country = draft;
        previewing = true;
      }
    }
  }
  if (!country) notFound();

  const { country: deliveryCode } = readLocale();
  const deliveryName = COUNTRIES[deliveryCode]?.name ?? deliveryCode;
  const [products, sellers, categories] = await Promise.all([
    listCountryOriginProducts(country.code),
    listCountrySellers(country.code),
    listCountryCategories(country.code)
  ]);
  const verifiedCount = products.filter((product) => product.originBasis === "VERIFIED").length;
  const leadThemes = country.themes.slice(0, 3);

  return (
    <main className="min-w-0 bg-[#f7faf4] pb-10">
      {previewing ? (
        <div role="note" className="border-b border-[#ead9a8] bg-[#fff7df] px-4 py-2 text-center text-[11px] font-extrabold text-[#6b4a00]">
          DRAFT PREVIEW — this country guide is not published. Only authorized editorial staff can see it.
        </div>
      ) : null}
      <div className="mx-auto max-w-[1320px] px-4 pt-4 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-[10.5px] font-semibold text-[#566359]">
          <Link href="/naijashop" className="hover:underline">
            Shop
          </Link>
          <span aria-hidden>/</span>
          <Link href="/naijashop/countries" className="hover:underline">
            All countries
          </Link>
          <span aria-hidden>/</span>
          <span className="text-[#14241b]">{country.name}</span>
        </nav>

        <section data-country-hero className="mt-3 overflow-hidden rounded-[28px] bg-[#07351f] text-white">
          <div className="grid min-w-0 gap-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="min-w-0 p-5 sm:p-7 lg:p-9">
              <div className="flex flex-wrap items-center gap-2">
                <img
                  src={`/flags/${country.code.toLowerCase()}.svg`}
                  alt={`Flag of ${country.name}`}
                  width={48}
                  height={34}
                  className="h-8 w-12 rounded-[4px] border border-white/20 object-cover shadow"
                />
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-[#c7e2cb]">
                  {country.region}
                </span>
                <span className="rounded-full border border-white/20 px-2.5 py-1 text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-[#f5d78f]">
                  {country.code}
                </span>
              </div>
              <h1 className="mt-3 break-words font-display text-[36px] font-extrabold leading-[0.98] tracking-tight sm:text-[50px] lg:text-[58px]">
                {country.name}
              </h1>
              {country.localizedNames.ar && country.localizedNames.ar !== country.name ? (
                <p lang="ar" dir="rtl" className="mt-1 text-[13px] font-semibold text-[#c7e2cb]">
                  {country.localizedNames.ar}
                </p>
              ) : country.localizedNames.fr && country.localizedNames.fr !== country.name ? (
                <p lang="fr" className="mt-1 text-[13px] font-semibold text-[#c7e2cb]">
                  {country.localizedNames.fr}
                </p>
              ) : null}
              <p className="mt-3 max-w-3xl text-[12px] leading-6 text-[#d7e8d9] sm:text-[13px] sm:leading-7">{country.introduction}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f5b52e] px-3 py-1.5 text-[11px] font-extrabold text-[#14241b]">
                  <BookOpenCheck className="h-3.5 w-3.5" aria-hidden />
                  Editorial guide · sources shown
                </span>
                {country.editorialStatus === "REVIEWED" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 px-3 py-1.5 text-[11px] font-extrabold text-[#d7e8d9]">
                    <CheckCircle2 className="h-3.5 w-3.5 text-[#8ed14b]" aria-hidden />
                    Editorial review complete
                  </span>
                ) : null}
              </div>
              <p className="mt-4 flex items-start gap-2 rounded-xl bg-white/[0.07] px-3 py-2 text-[11px] leading-5 text-[#c7e2cb]">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#f5b52e]" aria-hidden />
                <span>
                  Your current delivery market is <strong className="text-white">{deliveryName}</strong>. Browsing this guide does not change your
                  delivery country, address, currency or language.
                </span>
              </p>
            </div>
            <div className="grid grid-cols-3 gap-1 border-t border-white/10 bg-[#062b19] p-2 lg:border-l lg:border-t-0">
              {leadThemes.map((theme) => (
                <figure key={theme.id} className="min-w-0 overflow-hidden rounded-xl bg-white/5">
                  <span className="block aspect-[3/4] overflow-hidden sm:aspect-auto sm:h-full">
                    {theme.imageUrl ? (
                      <img src={theme.imageUrl} alt={theme.imageAlt || theme.label} loading="eager" className="h-full w-full object-cover" />
                    ) : null}
                  </span>
                  <figcaption className="px-1.5 py-1 text-[10.5px] font-extrabold leading-4 text-white">{theme.label}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="known-for-heading" className="mt-6">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-[10.5px] font-extrabold uppercase tracking-[0.18em] text-[#0b5c33]">Country associations</p>
              <h2 id="known-for-heading" className="mt-1 font-display text-[26px] font-extrabold tracking-tight text-[#14241b]">
                Known for
              </h2>
              <p className="mt-1 text-[11px] leading-5 text-[#4b5b51]">
                Six editorial themes with a stated association and at least one source. These are not claims that NaijaDeals sells or delivers them.
              </p>
            </div>
            <Link
              href="/naijashop/countries"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#b9cbb4] px-3 text-[10.5px] font-extrabold text-[#0b5c33] hover:bg-[#eef5eb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33]"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              All countries
            </Link>
          </div>
          <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {country.themes.map((theme) => (
              <li key={theme.id} className="min-w-0 rounded-2xl border border-[#dfe8dc] bg-white p-2.5">
                <div className="flex gap-3">
                  <span className="block h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[#eef3ea]">
                    {theme.imageUrl ? (
                      <img src={theme.imageUrl} alt={theme.imageAlt || theme.label} loading="lazy" className="h-full w-full object-cover" />
                    ) : null}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-[13.5px] font-extrabold leading-5 text-[#14241b]">{theme.label}</h3>
                    <p className="mt-0.5 line-clamp-4 text-[11px] leading-5 text-[#4b5b51]">{theme.association}</p>
                  </div>
                </div>
                <SourceList theme={theme} />
              </li>
            ))}
          </ul>
        </section>

        <section data-country-inventory aria-labelledby="country-inventory-heading" className="mt-7 rounded-[26px] border border-[#dfe8dc] bg-white p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10.5px] font-extrabold uppercase tracking-[0.18em] text-[#0b5c33]">Recorded origin only</p>
              <h2 id="country-inventory-heading" className="mt-1 font-display text-[25px] font-extrabold tracking-tight text-[#14241b]">
                Available on NaijaDeals
              </h2>
              <p className="mt-1 max-w-2xl text-[11px] leading-5 text-[#4b5b51]">
                Separate from “Known for”. A listing appears only when its product origin is recorded as {country.name}. Seller location alone does not
                qualify, and a cultural or style association is not evidence of manufacture.
              </p>
            </div>
            <span className="rounded-full bg-[#eef5eb] px-3 py-1 text-[11px] font-extrabold text-[#0b5c33]">
              {products.length} listing{products.length === 1 ? "" : "s"} · {verifiedCount} independently verified
            </span>
          </div>

          {products.length > 0 ? (
            <ul className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {products.map((product) => (
                <li key={product.id} className="min-w-0">
                  <p className="mb-1 flex items-center gap-1 text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[#0b5c33]">
                    <ShieldCheck className="h-3 w-3" aria-hidden />
                    {product.originBasis === "VERIFIED" ? "Independently verified origin" : "Seller-declared origin"}
                  </p>
                  <MarketplaceProductCard product={asApiProduct(product)} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-4 rounded-2xl border border-[#e5dfcf] bg-[#fbf4e4] p-4">
              <div className="flex items-start gap-3">
                <PackageSearch className="mt-0.5 h-5 w-5 shrink-0 text-[#9a6500]" aria-hidden />
                <div>
                  <h3 className="text-[12.5px] font-extrabold text-[#5c3d00]">No listing currently records {country.name} as its origin</h3>
                  <p className="mt-1 text-[10.5px] leading-5 text-[#6b4a00]">
                    This is an empty result, not a promise of future supply. The Shop catalogue still contains listings whose origin is unrecorded; those are
                    deliberately not counted here.
                  </p>
                  <Link href="/naijashop" className="mt-2 inline-flex items-center gap-1 text-[10.5px] font-extrabold text-[#0b5c33] hover:underline">
                    Browse the Shop catalogue
                    <ArrowRight className="h-3 w-3" aria-hidden />
                  </Link>
                </div>
              </div>
            </div>
          )}

          {sellers.length > 0 || categories.length > 0 ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="rounded-2xl border border-[#e2e9de] bg-[#f7faf4] p-3">
                <h3 className="flex items-center gap-1.5 text-[11px] font-extrabold text-[#14241b]">
                  <Store className="h-3.5 w-3.5 text-[#0f7a4a]" aria-hidden />
                  Participating sellers
                </h3>
                {sellers.length > 0 ? (
                  <ul className="mt-2 space-y-1.5">
                    {sellers.map((seller) => (
                      <li key={seller.id} className="text-[10.5px] font-semibold text-[#4b5b51]">
                        {seller.name} <span className="text-[#4b5b51]">· {seller.market}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-[11px] text-[#3f5246]">No seller currently has a {country.name}-origin listing.</p>
                )}
              </div>
              <div className="rounded-2xl border border-[#e2e9de] bg-[#f7faf4] p-3">
                <h3 className="flex items-center gap-1.5 text-[11px] font-extrabold text-[#14241b]">
                  <Truck className="h-3.5 w-3.5 text-[#0f7a4a]" aria-hidden />
                  Categories with recorded-origin listings
                </h3>
                {categories.length > 0 ? (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {categories.map((category) => (
                      <li key={category.id}>
                        <Link
                          href={`/naijashop/c/${category.slug}`}
                          className="inline-flex rounded-full border border-[#c7d7c2] bg-white px-2.5 py-1 text-[11px] font-extrabold text-[#0b5c33] hover:bg-[#eef5eb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33]"
                        >
                          {category.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-[11px] text-[#3f5246]">No recorded-origin category yet. No unrelated category is substituted.</p>
                )}
              </div>
            </div>
          ) : null}
        </section>

        <section aria-labelledby="country-bulk-heading" className="mt-5 grid gap-3 rounded-[26px] bg-[#07351f] p-4 text-white sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <h2 id="country-bulk-heading" className="font-display text-[22px] font-extrabold tracking-tight">
              Sourcing from {country.name}?
            </h2>
            <p className="mt-1 max-w-2xl text-[11px] leading-5 text-[#c3d9c7]">
              The existing producer-quote and freight pathways remain separate from this editorial guide. They do not confirm origin, stock or an
              international shipping price for any specific goods.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/naijafresh/business"
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#f5b52e] px-4 text-[11px] font-extrabold text-[#14241b] hover:bg-[#ffd15e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Request a producer quote
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
            <Link
              href="/naijasend/quote"
              className="inline-flex h-10 items-center rounded-full border border-white/30 px-4 text-[11px] font-extrabold text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Get a freight quote
            </Link>
          </div>
        </section>

        <p className="mt-4 text-[11.5px] leading-5 text-[#4b5b51]">
          Country themes are editorial information with the listed sources. They do not establish NaijaDeals supply, product origin, certification,
          price, stock or delivery availability. The commerce registry and checkout remain authoritative for the markets NaijaDeals actually serves.
        </p>
      </div>
    </main>
  );
}
