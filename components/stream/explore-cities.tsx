"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CityCard } from "./city-card";
import { REGION_ORDER } from "@/lib/stream/regions";

export type ExploreCity = {
  slug: string;
  name: string;
  countryCode: string;
  countryName: string;
  region: string;
  imageUrl: string | null;
  artists: number;
  tracks: number;
  featured: boolean;
};

/**
 * Regional tabs plus a country filter over the editorial city catalogue.
 * Tab and filter combinations that would yield no cities are disabled, so the
 * controls never lead to an empty result the user cannot explain.
 */
export function ExploreCities({ cities, initialRegion }: { cities: ExploreCity[]; initialRegion?: string }) {
  const regions = useMemo(() => ["All Africa", ...REGION_ORDER.filter((region) => cities.some((city) => city.region === region))], [cities]);
  const [region, setRegion] = useState(initialRegion && regions.includes(initialRegion) ? initialRegion : "All Africa");
  const [country, setCountry] = useState("All countries");

  const inRegion = region === "All Africa" ? cities : cities.filter((city) => city.region === region);
  const countries = useMemo(() => {
    const names = [...new Set(inRegion.map((city) => city.countryName))].sort();
    return ["All countries", ...names];
  }, [inRegion]);
  const visible = country === "All countries" ? inRegion : inRegion.filter((city) => city.countryName === country);

  const countriesWithContent = new Set(cities.filter((city) => city.artists > 0).map((city) => city.countryName));

  return (
    <div>
      <div role="tablist" aria-label="African regions" className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {regions.map((name) => {
          const active = name === region;
          const count = name === "All Africa" ? cities.length : cities.filter((city) => city.region === name).length;
          return (
            <button
              key={name}
              role="tab"
              aria-selected={active}
              onClick={() => {
                setRegion(name);
                setCountry("All countries");
              }}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-[11.5px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C99520] ${
                active ? "border-emerald-400 bg-emerald-500/15 text-emerald-300" : "border-white/15 text-white/65 hover:text-white"
              }`}
            >
              {name} <span className="ml-1 text-[10px] font-semibold text-white/40">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[11.5px] font-semibold text-white/60">
          Country
          <select
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            className="rounded-lg border border-white/15 bg-[#101613] px-2 py-1.5 text-[12px] text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C99520]"
          >
            {countries.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <p className="text-[11px] text-white/40">
          {visible.length} cit{visible.length === 1 ? "y" : "ies"} · {visible.filter((city) => city.artists > 0).length} with published creators
        </p>
      </div>

      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {visible.map((city) => (
          <li key={city.slug}>
            <CityCard city={city} className="aspect-[4/5] sm:aspect-[4/3]" />
          </li>
        ))}
      </ul>

      {visible.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-white/15 p-6 text-center text-[12px] text-white/50">No cities in this country yet.</p>
      ) : null}

      <p className="mt-4 text-[11px] leading-5 text-white/40">
        Coverage: {countriesWithContent.size} countries with published creators. City images are original AI-generated illustrations of each city&apos;s
        landmarks, not documentary photographs.
      </p>
    </div>
  );
}
