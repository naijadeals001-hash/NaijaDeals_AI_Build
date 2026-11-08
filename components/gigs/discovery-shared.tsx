import Link from "next/link";
import { MapPin, Search, Sparkles } from "lucide-react";

export type GigCategory = { id: string; slug: string; name: string; icon: string; accent: string };

/** Cities that actually appear in the public data, so the filter never lies. */
export const GIG_CITIES = ["Lagos", "Abuja", "Port Harcourt", "Kano", "Ibadan"];

const MODE_LABEL: Record<string, string> = { LOCAL: "In person", REMOTE: "Remote", PROJECT: "Project" };

function buildHref(base: string, params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `${base}?${query}` : base;
}

/**
 * Filter bar for discovery pages. A real GET form plus link chips, so every
 * filter state is shareable, refresh-safe and works without JavaScript.
 */
export function GigFilters({
  base,
  categories,
  current,
  queryLabel
}: {
  base: string;
  categories: GigCategory[];
  current: { q?: string; category?: string; city?: string };
  queryLabel: string;
}) {
  const activeCategory = categories.find((category) => category.slug === current.category);
  return (
    <div className="rounded-2xl border border-[#E5DFD2] bg-white p-4 shadow-[0_2px_10px_rgba(33,55,42,0.04)]">
      <form action={base} method="get" className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {current.category ? <input type="hidden" name="category" value={current.category} /> : null}
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-[#E5DFD2] px-3">
          <Search className="h-4 w-4 shrink-0 text-[#6B7A72]" aria-hidden />
          <input
            name="q"
            defaultValue={current.q ?? ""}
            aria-label={queryLabel}
            placeholder={queryLabel}
            className="h-11 w-full min-w-0 bg-transparent text-[13px] text-[#16241D] outline-none placeholder:text-[#8A978F]"
          />
        </div>
        <label className="flex items-center gap-2 rounded-xl border border-[#E5DFD2] px-3">
          <MapPin className="h-4 w-4 shrink-0 text-[#0F7A4A]" aria-hidden />
          <span className="sr-only">City</span>
          <select name="city" defaultValue={current.city ?? ""} className="h-11 bg-transparent text-[12.5px] font-semibold text-[#2C3B33] outline-none">
            <option value="">All cities</option>
            {GIG_CITIES.map((city) => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="h-11 shrink-0 rounded-xl bg-[#0F7A4A] px-6 text-[13px] font-bold text-white transition hover:bg-[#0B6540]">
          Apply filters
        </button>
      </form>

      <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]" role="list" aria-label="Categories">
        <Link
          href={buildHref(base, { q: current.q, city: current.city })}
          aria-current={!current.category ? "page" : undefined}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-[11.5px] font-bold transition ${
            !current.category ? "bg-[#0F7A4A] text-white" : "border border-[#E5DFD2] bg-white text-[#34443A] hover:border-[#9EC4AD]"
          }`}
        >
          All services
        </Link>
        {categories.map((category) => {
          const active = current.category === category.slug;
          return (
            <Link
              key={category.id}
              href={buildHref(base, { q: current.q, city: current.city, category: category.slug })}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-[11.5px] font-bold transition ${
                active ? "bg-[#0F7A4A] text-white" : "border border-[#E5DFD2] bg-white text-[#34443A] hover:border-[#9EC4AD]"
              }`}
            >
              {category.name}
            </Link>
          );
        })}
      </div>

      {(activeCategory || current.city || current.q) && (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[#6B7A72]">
          Showing:
          {current.q ? <span className="rounded-full bg-[#F2F8F3] px-2 py-0.5 font-bold text-[#0F7A4A]">“{current.q}”</span> : null}
          {activeCategory ? <span className="rounded-full bg-[#F2F8F3] px-2 py-0.5 font-bold text-[#0F7A4A]">{activeCategory.name}</span> : null}
          {current.city ? <span className="rounded-full bg-[#F2F8F3] px-2 py-0.5 font-bold text-[#0F7A4A]">{current.city}</span> : null}
          <Link href={base} className="font-bold text-[#0F7A4A] underline-offset-2 hover:underline">Clear filters</Link>
        </p>
      )}
    </div>
  );
}

export function SampleBanner({ count }: { count: number }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-[#F0D48A] bg-[#FFF8E6] px-4 py-3 text-[11.5px] leading-5 text-[#7A5B12]">
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#C99520]" aria-hidden />
      <span>
        <strong>Demonstration directory.</strong> {count} sample {count === 1 ? "profile is" : "profiles are"} shown to
        illustrate how NaijaGigs works. They are clearly labelled and cannot be booked or reviewed. Verified real
        professionals replace them as they onboard.
      </span>
    </div>
  );
}

export function ServiceCard({
  listing
}: {
  listing: {
    id: string;
    slug: string;
    title: string;
    summary: string;
    pricingType: string;
    priceKobo: bigint | null;
    mode: string;
    city: string | null;
    state: string | null;
    isSample?: boolean;
    images: Array<{ url: string; alt: string | null }>;
    category: { name: string };
    professional: { displayName: string; isSample?: boolean };
  };
}) {
  const price =
    listing.pricingType === "QUOTE"
      ? "Quote on request"
      : listing.priceKobo !== null
        ? `From ₦${new Intl.NumberFormat("en-NG").format(Number(listing.priceKobo) / 100)}`
        : "Quote on request";
  return (
    <article data-gig-card className="group flex h-full flex-col overflow-hidden rounded-xl border border-[#E5DFD2] bg-white shadow-[0_2px_10px_rgba(33,55,42,0.04)] transition hover:shadow-[0_14px_30px_rgba(33,55,42,0.1)]">
      <Link href={`/naijagigs/services/${listing.slug}`} className="relative block aspect-[3/2] overflow-hidden bg-[#EDE6D8]">
        {listing.images[0]?.url ? (
          <img src={listing.images[0].url} alt={listing.images[0].alt ?? listing.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
        ) : (
          <span className="flex h-full w-full items-center justify-center font-display text-3xl font-extrabold text-[#0F7A4A]">
            {listing.professional.displayName.charAt(0)}
          </span>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#0F7A4A]">
          {listing.category.name}
        </span>
        {listing.isSample ? (
          <span className="absolute right-2 top-2 rounded-full bg-[#FFF3D6] px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#7A5B12]">
            Demonstration
          </span>
        ) : null}
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 text-[13.5px] font-extrabold leading-snug text-[#0B1F16]">
          <Link href={`/naijagigs/services/${listing.slug}`}>{listing.title}</Link>
        </h3>
        <p className="mt-0.5 truncate text-[11px] font-semibold text-[#45564C]">{listing.professional.displayName}</p>
        <p className="mt-1 line-clamp-2 text-[11px] text-[#6B7A72]">{listing.summary}</p>
        <div className="mt-auto">
          <p className="mt-2 text-[13px] font-extrabold text-[#0B1F16]">{price}</p>
          <p className="mt-1 flex items-center gap-1 text-[10.5px] text-[#6B7A72]">
            <MapPin className="h-3 w-3" aria-hidden /> {listing.city || listing.state || "Remote"} · {MODE_LABEL[listing.mode] ?? listing.mode}
          </p>
          <Link
            href={`/naijagigs/services/${listing.slug}`}
            className="mt-3 block rounded-xl bg-[#0F7A4A] py-2.5 text-center text-[12px] font-bold text-white transition hover:bg-[#0B6540]"
          >
            View details
          </Link>
        </div>
      </div>
    </article>
  );
}

export function EmptyState({
  title,
  body,
  action
}: {
  title: string;
  body: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[#D8D2C4] bg-[#FAF7F0] p-10 text-center">
      <Search className="mx-auto h-8 w-8 text-[#0F7A4A]" aria-hidden />
      <h2 className="mt-3 font-display text-lg font-extrabold text-[#0B1F16]">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-[12.5px] leading-6 text-[#6B7A72]">{body}</p>
      {action ? (
        <Link href={action.href} className="mt-4 inline-block rounded-xl bg-[#0F7A4A] px-5 py-3 text-[12.5px] font-bold text-white transition hover:bg-[#0B6540]">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
