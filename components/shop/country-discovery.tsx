"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, MapPin, Search, X } from "lucide-react";
import type { CountryCardSummary } from "@/lib/services/countries/discovery.service";

const CARD_QUERY = "[data-country-card]";

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

function flagSrc(code: string) {
  return `/flags/${code.toLowerCase()}.svg`;
}

function firstName(country: CountryCardSummary) {
  return country.localizedNames.en || country.name;
}

/** Show one additional localized name, preserving Arabic RTL direction. */
function secondaryName(country: CountryCardSummary): { text: string; lang: string; dir?: "rtl" } | null {
  for (const lang of ["ar", "fr", "pt"]) {
    const text = country.localizedNames[lang];
    if (text && text !== country.name && text !== firstName(country)) {
      return { text, lang, dir: lang === "ar" ? "rtl" : undefined };
    }
  }
  return null;
}

function CountryFlag({ country, className = "" }: { country: CountryCardSummary; className?: string }) {
  return (
    <img
      src={flagSrc(country.code)}
      alt={`Flag of ${country.name}`}
      width={40}
      height={28}
      loading="lazy"
      decoding="async"
      className={`h-7 w-10 shrink-0 rounded-[3px] border border-black/10 object-cover shadow-sm ${className}`}
    />
  );
}

function ThemeGrid({ country }: { country: CountryCardSummary }) {
  return (
    <ul className="grid grid-cols-2 gap-1.5" aria-label={`${country.name} themes`}>
      {country.themes.slice(0, 6).map((theme) => (
        <li key={theme.id} className="min-w-0">
          <figure className="overflow-hidden rounded-lg border border-[#e2e9de] bg-[#f7f9f5]">
            <span className="block aspect-square overflow-hidden bg-[#edf2e9]">
              {theme.imageUrl ? (
                <img
                  src={theme.imageUrl}
                  alt={theme.imageAlt || theme.label}
                  width={240}
                  height={240}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="grid h-full place-items-center px-1 text-center text-[9px] font-bold text-[#566359]">
                  Image pending
                </span>
              )}
            </span>
            <figcaption className="min-h-[2rem] px-1.5 py-1 text-[9.5px] font-extrabold leading-4 text-[#253b2d]">
              {theme.label}
            </figcaption>
          </figure>
        </li>
      ))}
    </ul>
  );
}

export function CountryDiscoveryRow({ countries }: { countries: CountryCardSummary[] }) {
  const trackId = useId();
  const trackRef = useRef<HTMLUListElement | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [bounds, setBounds] = useState({ start: true, end: false });

  const updateBounds = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const max = track.scrollWidth - track.clientWidth;
    const start = track.scrollLeft <= 2;
    const end = max <= 2 || track.scrollLeft >= max - 3;
    setBounds((current) => (current.start === start && current.end === end ? current : { start, end }));
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    updateBounds();
    const observer = new ResizeObserver(() => updateBounds());
    observer.observe(track);
    for (const card of Array.from(track.querySelectorAll(CARD_QUERY))) observer.observe(card);
    return () => observer.disconnect();
  }, [updateBounds, countries.length]);

  const step = useCallback(
    (direction: 1 | -1) => {
      const track = trackRef.current;
      if (!track) return;
      const card = track.querySelector<HTMLElement>(CARD_QUERY);
      if (!card) return;
      const gap = 12;
      const distance = card.getBoundingClientRect().width + gap;
      track.scrollBy({ left: direction * distance, behavior: reducedMotion ? "auto" : "smooth" });
    },
    [reducedMotion]
  );

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      step(event.key === "ArrowRight" ? 1 : -1);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const track = trackRef.current;
      if (!track) return;
      track.scrollTo({
        left: event.key === "Home" ? 0 : track.scrollWidth,
        behavior: reducedMotion ? "auto" : "smooth"
      });
    }
  };

  if (countries.length === 0) {
    return (
      <section aria-labelledby="discover-africa-heading" className="mt-8 rounded-3xl border border-[#dfe8dc] bg-white p-5">
        <h2 id="discover-africa-heading" className="font-display text-[24px] font-extrabold tracking-tight text-[#14241b]">
          Discover Africa
        </h2>
        <p className="mt-1 text-[11.5px] leading-6 text-[#4b5b51]">
          Country guides are not published yet. The complete directory remains available at{" "}
          <Link href="/naijashop/countries" className="font-extrabold text-[#0b5c33] underline">
            View all countries
          </Link>
          .
        </p>
      </section>
    );
  }

  return (
    <section data-country-discovery aria-labelledby="discover-africa-heading" className="mt-8 min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9.5px] font-extrabold uppercase tracking-[0.18em] text-[#0f7a4a]">Editorial discovery</p>
          <h2 id="discover-africa-heading" className="mt-1 font-display text-[25px] font-extrabold tracking-tight text-[#14241b] sm:text-[30px]">
            Discover Africa, country by country
          </h2>
          <p className="mt-1 max-w-2xl text-[11.5px] leading-6 text-[#4b5b51]">
            Six things each country is known for, with sources. These are editorial associations, not claims that NaijaDeals supplies them.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/naijashop/countries"
            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-[#b9cbb4] px-4 text-[11.5px] font-extrabold text-[#0b5c33] transition hover:bg-[#eef5eb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2"
          >
            View all {countries.length} countries
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
          <div className="flex items-center gap-1" aria-label="Scroll country cards">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-controls={trackId}
              aria-disabled={bounds.start}
              className={`grid h-10 w-10 place-items-center rounded-full border border-[#c7d7c2] bg-white text-[#0b5c33] transition hover:bg-[#eef5eb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] ${bounds.start ? "opacity-45" : ""}`}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              <span className="sr-only">Previous countries</span>
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-controls={trackId}
              aria-disabled={bounds.end}
              className={`grid h-10 w-10 place-items-center rounded-full border border-[#c7d7c2] bg-white text-[#0b5c33] transition hover:bg-[#eef5eb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] ${bounds.end ? "opacity-45" : ""}`}
            >
              <ArrowRight className="h-4 w-4" aria-hidden />
              <span className="sr-only">Next countries</span>
            </button>
          </div>
        </div>
      </div>

      <div className="relative mt-4 min-w-0">
        <ul
          ref={trackRef}
          id={trackId}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onScroll={updateBounds}
          aria-label={`${countries.length} African country cards. Use the left and right arrow keys to move between cards, or swipe.`}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 outline-none [scrollbar-width:thin] focus-visible:ring-2 focus-visible:ring-[#0b5c33]"
          style={{ scrollPaddingLeft: 0 }}
        >
          {countries.map((country) => (
            <li
              key={country.code}
              data-country-card
              data-country-code={country.code}
              className="w-[82vw] max-w-[310px] shrink-0 snap-start sm:w-[300px] lg:w-[316px]"
              style={{ contentVisibility: "auto", containIntrinsicSize: "0 560px" }}
            >
              <article className="flex h-full flex-col overflow-hidden rounded-[24px] border border-[#dfe8dc] bg-white shadow-[0_12px_28px_rgba(7,53,31,0.06)]">
                <div className="border-b border-[#e4ebe0] bg-[#f7faf4] p-4">
                  <div className="flex items-start gap-3">
                    <CountryFlag country={country} className="mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-[#0f7a4a]">{country.region}</p>
                      <h3 className="break-words font-display text-[23px] font-extrabold leading-tight tracking-tight text-[#14241b]">
                        {firstName(country)}
                      </h3>
                      {(() => {
                        const secondary = secondaryName(country);
                        return secondary ? (
                          <p lang={secondary.lang} dir={secondary.dir} className="break-words text-[10px] font-semibold text-[#566359]">
                            {secondary.text}
                          </p>
                        ) : null;
                      })()}
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-3 text-[10.5px] leading-5 text-[#4b5b51]">{country.introduction}</p>
                </div>
                <div className="flex flex-1 flex-col p-3">
                  <p className="mb-2 text-[9px] font-extrabold uppercase tracking-[0.14em] text-[#566359]">Known for</p>
                  <ThemeGrid country={country} />
                  <Link
                    href={`/naijashop/countries/${country.slug}`}
                    aria-label={`Explore ${country.name}`}
                    className="mt-3 inline-flex h-10 items-center justify-between gap-2 rounded-full bg-[#07351f] px-4 text-[11.5px] font-extrabold text-white transition hover:bg-[#0b4a2a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f5b52e] focus-visible:ring-offset-2"
                  >
                    Explore {country.name}
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  </Link>
                </div>
              </article>
            </li>
          ))}
        </ul>
        {!bounds.end ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 flex w-16 items-center justify-end bg-gradient-to-l from-[#f7faf4] to-transparent pr-1 text-[9px] font-extrabold uppercase tracking-[0.12em] text-[#0b5c33]"
          >
            More →
          </div>
        ) : null}
      </div>
      <p className="mt-1 text-[10px] font-semibold text-[#566359]">
        Swipe, use the scrollbar, or focus the row and press the arrow keys. {countries.length} country guides are published.
      </p>
    </section>
  );
}

export function CountryDirectory({ countries }: { countries: CountryCardSummary[] }) {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("all");
  const regions = useMemo(() => Array.from(new Set(countries.map((country) => country.region))), [countries]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return countries.filter((country) => {
      if (region !== "all" && country.region !== region) return false;
      if (!needle) return true;
      const haystack = [
        country.name,
        country.code,
        country.region,
        ...Object.values(country.localizedNames),
        ...country.themes.map((theme) => theme.label)
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [countries, query, region]);

  return (
    <div className="bg-[#f7faf4]">
      <div className="mx-auto max-w-[1320px] px-4 py-6 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="text-[10.5px] font-semibold text-[#566359]">
          <Link href="/naijashop" className="hover:underline">
            Shop
          </Link>
          <span aria-hidden> / </span>
          <span className="text-[#14241b]">All countries</span>
        </nav>
        <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
          <div className="min-w-0">
            <p className="text-[9.5px] font-extrabold uppercase tracking-[0.18em] text-[#0f7a4a]">Discover Africa</p>
            <h1 className="mt-1 font-display text-[30px] font-extrabold leading-tight tracking-tight text-[#14241b] sm:text-[38px]">
              Every country, one guide
            </h1>
            <p className="mt-2 max-w-3xl text-[12px] leading-6 text-[#4b5b51]">
              Search all {countries.length} published country guides by name, code, region or theme. These are editorial associations with sources,
              not statements of NaijaDeals supply or delivery availability.
            </p>
          </div>
          <div className="min-w-0">
            <label htmlFor="country-search" className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#253b2d]">
              Search countries
            </label>
            <div className="mt-1 flex h-11 items-center gap-2 rounded-full border border-[#b9cbb4] bg-white px-3 focus-within:ring-2 focus-within:ring-[#0b5c33]">
              <Search className="h-4 w-4 shrink-0 text-[#566359]" aria-hidden />
              <input
                id="country-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Country, code, region or theme"
                className="min-w-0 flex-1 bg-transparent text-[12px] font-semibold text-[#14241b] outline-none placeholder:text-[#566359] [&::-webkit-search-cancel-button]:appearance-none"
                autoComplete="off"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[#566359] hover:bg-[#eef5eb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33]"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                  <span className="sr-only">Clear search</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setRegion("all")}
            aria-pressed={region === "all"}
            className={`h-9 rounded-full px-3 text-[10.5px] font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] ${region === "all" ? "bg-[#07351f] text-white" : "border border-[#c7d7c2] bg-white text-[#0b5c33] hover:bg-[#eef5eb]"}`}
          >
            All regions ({countries.length})
          </button>
          {regions.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setRegion(name)}
              aria-pressed={region === name}
              className={`h-9 rounded-full px-3 text-[10.5px] font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] ${region === name ? "bg-[#07351f] text-white" : "border border-[#c7d7c2] bg-white text-[#0b5c33] hover:bg-[#eef5eb]"}`}
            >
              {name} ({countries.filter((country) => country.region === name).length})
            </button>
          ))}
        </div>

        <p role="status" aria-live="polite" className="mt-3 text-[11px] font-semibold text-[#4b5b51]">
          {filtered.length} of {countries.length} country guides shown
          {query ? ` for “${query}”` : ""}.
        </p>

        {filtered.length > 0 ? (
          <ul className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((country) => (
              <li key={country.code} className="min-w-0">
                <article className="flex h-full flex-col rounded-2xl border border-[#dfe8dc] bg-white p-4">
                  <div className="flex items-start gap-3">
                    <CountryFlag country={country} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-[#0f7a4a]">{country.region}</p>
                      <h2 className="break-words text-[16px] font-extrabold leading-tight text-[#14241b]">{firstName(country)}</h2>
                      {(() => {
                        const secondary = secondaryName(country);
                        return secondary ? (
                          <p lang={secondary.lang} dir={secondary.dir} className="break-words text-[10px] font-semibold text-[#566359]">
                            {secondary.text}
                          </p>
                        ) : null;
                      })()}
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-2 text-[10.5px] leading-5 text-[#4b5b51]">{country.introduction}</p>
                  <p className="mt-2 line-clamp-2 text-[10px] font-semibold leading-4 text-[#253b2d]">
                    {country.themes.map((theme) => theme.label).join(" · ")}
                  </p>
                  <Link
                    href={`/naijashop/countries/${country.slug}`}
                    className="mt-auto inline-flex items-center gap-1.5 pt-3 text-[11px] font-extrabold text-[#0b5c33] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33]"
                  >
                    Explore {country.name}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </article>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-6 rounded-2xl border border-[#e5dfcf] bg-[#fbf4e4] p-5 text-[11.5px] leading-6 text-[#6b4a00]">
            No country guide matches this search. Clear the search or choose a different region. The full directory still contains {countries.length}{" "}
            published countries.
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-[#dfe8dc] bg-white p-4 text-[10.5px] leading-5 text-[#566359]">
          <p className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#0f7a4a]" aria-hidden />
            <span>
              Browsing a country guide does not change your delivery country, address, currency or language. Those settings only change when you
              explicitly update them in your account or checkout.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
