import type { Metadata } from "next";
import { searchGigServices, listGigCategories } from "@/lib/services/gigs/service";
import { GigFilters, ServiceCard, EmptyState, SampleBanner } from "@/components/gigs/discovery-shared";

export const metadata: Metadata = {
  title: "Browse services — NaijaGigs",
  description: "Search verified professionals and local service providers across Nigeria and Africa."
};

export const dynamic = "force-dynamic";

type SearchParams = { q?: string; category?: string; city?: string; sort?: string };

export default async function ServicesPage({ searchParams }: { searchParams?: SearchParams }) {
  const q = searchParams?.q?.trim() || undefined;
  const category = searchParams?.category?.trim() || undefined;
  const city = searchParams?.city?.trim() || undefined;
  const sort = searchParams?.sort === "price_asc" || searchParams?.sort === "price_desc" ? searchParams.sort : "recent";

  const [categories, result] = await Promise.all([
    listGigCategories(),
    searchGigServices({ q, category, city: city ?? undefined, mode: undefined, countryCode: undefined, sort, page: 1, pageSize: 48 })
  ]);
  const services = result.items ?? [];
  const sampleCount = services.filter((listing) => listing.isSample).length;

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-9 sm:px-6 lg:px-10">
      <header className="mb-5">
        <h1 className="font-display text-[28px] font-extrabold tracking-[-0.02em] text-[#0B1F16] sm:text-[34px]">
          {category ? categories.find((item) => item.slug === category)?.name ?? "Services" : "Browse services"}
        </h1>
        <p className="mt-1 text-[12.5px] text-[#6B7A72]">
          {result.total} service{result.total === 1 ? "" : "s"} from verified professionals{q ? ` matching “${q}”` : ""}
          {city ? ` in ${city}` : ""}.
        </p>
      </header>

      <GigFilters
        base="/naijagigs/services"
        categories={categories}
        current={{ q, category, city }}
        queryLabel="Search services or professionals"
      />

      {sampleCount > 0 ? <div className="mt-4"><SampleBanner count={sampleCount} /></div> : null}

      <div className="mt-5">
        {services.length === 0 ? (
          <EmptyState
            title="No services match these filters"
            body={q || category || city
              ? "Try a broader search, a different category, or clear the filters to see everything available."
              : "No services are published yet. Verified professionals appear here as soon as they publish."}
            action={{ href: "/naijagigs/services", label: "Clear filters" }}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {services.map((listing) => (
              <ServiceCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
