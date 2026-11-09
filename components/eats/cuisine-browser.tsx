"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BadgeCheck, Clock, Star } from "lucide-react";
import type { CuisineDish } from "@/lib/services/eats/cuisine";
import type { CardRestaurant } from "./eats-sections";

type Restaurant = CardRestaurant & { deliveryWindow: { min: number; max: number } | null };

/**
 * Cuisine discovery: filter the documented dish catalogue by country and dish
 * category, search it, and see which verified kitchens actually serve those
 * dishes. A dish with zero serving kitchens is labelled as catalogue-only —
 * the page never implies food is orderable when it is not.
 */
export function CuisineBrowser({
  cuisineSlug,
  cuisineLabel,
  dishes,
  restaurants,
  countries,
  categories
}: {
  cuisineSlug: string;
  cuisineLabel: string;
  dishes: CuisineDish[];
  restaurants: Restaurant[];
  countries: Array<{ code: string; name: string; count: number }>;
  categories: Array<{ slug: string; label: string; count: number }>;
}) {
  const [country, setCountry] = useState("all");
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"default" | "served" | "name">("default");

  const visibleDishes = useMemo(() => {
    const filtered = dishes.filter((dish) => {
      if (country !== "all" && dish.countryCode !== country) return false;
      if (category !== "all" && dish.category !== category) return false;
      if (query) {
        const haystack = `${dish.name} ${dish.localNames.join(" ")} ${dish.description} ${dish.ingredients.join(" ")}`.toLowerCase();
        if (!haystack.includes(query.toLowerCase())) return false;
      }
      return true;
    });
    if (sort === "served") return [...filtered].sort((a, b) => b.servingRestaurants - a.servingRestaurants);
    if (sort === "name") return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    return filtered;
  }, [dishes, country, category, query, sort]);

  const orderableNow = dishes.filter((dish) => dish.servingRestaurants > 0).length;

  return (
    <div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px]">
        <span className="rounded-full bg-[#e7f6ec] px-2.5 py-1 font-bold text-[#0b5c33]">{dishes.length} documented dishes</span>
        <span className={`rounded-full px-2.5 py-1 font-bold ${orderableNow > 0 ? "bg-[#fff1e6] text-[#a3480f]" : "bg-[#f3f4f5] text-[#6b7a70]"}`}>
          {orderableNow > 0 ? `${orderableNow} served by a verified kitchen` : "No restaurant serving this cuisine yet"}
        </span>
        <span className="text-[11px] text-[#8a938d]">Catalogue entries are reference food history, not restaurant inventory.</span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <label className="flex flex-col gap-1 text-[10.5px] font-bold uppercase tracking-wide text-[#6b7a70]">
          Search {cuisineLabel} dishes
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            type="search"
            placeholder="Search by dish, ingredient or local name"
            className="min-h-9 rounded-lg border border-[#e2e6e3] px-3 text-[12.5px] font-normal normal-case tracking-normal text-[#14241b] outline-none focus:border-[#0b5c33]"
          />
        </label>
        <label className="flex flex-col gap-1 text-[10.5px] font-bold uppercase tracking-wide text-[#6b7a70]">
          Country
          <select value={country} onChange={(event) => setCountry(event.target.value)} className="min-h-9 rounded-lg border border-[#e2e6e3] px-2 text-[12.5px] font-normal normal-case tracking-normal">
            <option value="all">All countries ({dishes.length})</option>
            {countries.map((row) => (
              <option key={row.code} value={row.code}>{row.name} ({row.count})</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10.5px] font-bold uppercase tracking-wide text-[#6b7a70]">
          Sort
          <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="min-h-9 rounded-lg border border-[#e2e6e3] px-2 text-[12.5px] font-normal normal-case tracking-normal">
            <option value="default">Catalogue order</option>
            <option value="served">Most restaurants serving</option>
            <option value="name">A–Z</option>
          </select>
        </label>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <button type="button" onClick={() => setCategory("all")} aria-pressed={category === "all"} className={`rounded-full px-3 py-1 text-[11px] font-bold ${category === "all" ? "bg-[#0b5c33] text-white" : "bg-[#f2f5f3] text-[#33443a]"}`}>
          All categories
        </button>
        {categories.map((row) => (
          <button
            key={row.slug}
            type="button"
            onClick={() => setCategory(row.slug)}
            aria-pressed={category === row.slug}
            className={`rounded-full px-3 py-1 text-[11px] font-bold ${category === row.slug ? "bg-[#0b5c33] text-white" : "bg-[#f2f5f3] text-[#33443a]"}`}
          >
            {row.label} <span className="opacity-60">{row.count}</span>
          </button>
        ))}
      </div>

      <section aria-labelledby="serving-heading" className="mt-5">
        <h2 id="serving-heading" className="font-display text-[17px] font-extrabold text-[#14241b]">
          {cuisineLabel} kitchens near you
        </h2>
        {restaurants.length === 0 ? (
          <p className="mt-2 rounded-xl border border-dashed border-[#d9e2dc] p-5 text-[12px] leading-6 text-[#6b7a70]">
            No verified {cuisineLabel} kitchen is serving in this area yet. The dishes below are documented so you can see what the cuisine
            offers — they are not orderable until a kitchen joins.{" "}
            <Link href="/restaurant/apply" className="font-bold text-[#0b5c33] underline">Restaurants can apply here</Link>.
          </p>
        ) : (
          <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {restaurants.map((restaurant) => (
              <li key={restaurant.id}>
                <Link href={`/naijaeats/restaurants/${restaurant.slug}`} className="flex items-center gap-3 rounded-xl bg-white p-2.5 ring-1 ring-[#eef1ef] hover:shadow-md">
                  <span className="block h-14 w-14 shrink-0 overflow-hidden rounded-full bg-[#f4f6f5]">
                    {restaurant.logoUrl || restaurant.coverUrl ? (
                      <img src={restaurant.logoUrl ?? restaurant.coverUrl ?? ""} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="grid h-full w-full place-items-center font-display text-base font-black text-[#0b5c33]/40">{restaurant.name.charAt(0)}</span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1">
                      <span className="truncate text-[12.5px] font-extrabold text-[#14241b]">{restaurant.name}</span>
                      <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-[#0b8f47]" aria-label="Verified" />
                    </span>
                    <span className="block truncate text-[10.5px] text-[#6b7a70]">{restaurant.cuisine} · {restaurant.market}</span>
                    <span className="mt-0.5 flex items-center gap-2">
                      {restaurant.rating ? (
                        <span className="flex items-center gap-0.5 text-[10.5px] font-bold">
                          <Star className="h-3 w-3 fill-[#f5a623] text-[#f5a623]" aria-hidden /> {restaurant.rating.average.toFixed(1)}
                          <span className="font-normal text-[#6b7a70]">({restaurant.rating.count})</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-[#8a938d]">No ratings yet</span>
                      )}
                      <span className="flex items-center gap-1 rounded-full bg-[#e7f6ec] px-2 py-0.5 text-[9.5px] font-bold text-[#0b5c33]">
                        <Clock className="h-2.5 w-2.5" aria-hidden />
                        {restaurant.deliveryWindow ? `${restaurant.deliveryWindow.min}–${restaurant.deliveryWindow.max} min` : "Timing set by kitchen"}
                      </span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="dishes-heading" className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="dishes-heading" className="font-display text-[17px] font-extrabold text-[#14241b]">
            {cuisineLabel} dish catalogue
          </h2>
          <p className="text-[11px] text-[#6b7a70]">{visibleDishes.length} shown</p>
        </div>
        {visibleDishes.length === 0 ? (
          <p className="mt-2 rounded-xl border border-dashed border-[#d9e2dc] p-5 text-center text-[12px] text-[#6b7a70]">
            No dishes match these filters.
          </p>
        ) : (
          <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {visibleDishes.map((dish) => (
              <li key={dish.slug} data-dish={dish.slug} className="flex gap-2.5 rounded-xl bg-white p-2 ring-1 ring-[#eef1ef]">
                <span className="block h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-[#f4f6f5]">
                  {dish.imageUrl ? (
                    <img src={dish.imageUrl} alt={dish.name} loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <span className="grid h-full w-full place-items-center text-[8.5px] uppercase tracking-wide text-[#9aa59e]">Pending<br />photo</span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-bold text-[#14241b]">{dish.name}</span>
                  <span className="block truncate text-[10px] text-[#6b7a70]">
                    {dish.countryName} · {dish.categoryLabel}
                    {dish.localNames.length ? ` · ${dish.localNames.join(", ")}` : ""}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-[10.5px] leading-4 text-[#5d6d64]">{dish.description}</span>
                  <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[9.5px] font-bold ${dish.servingRestaurants > 0 ? "bg-[#e7f6ec] text-[#0b5c33]" : "bg-[#f3f4f5] text-[#7b857e]"}`}>
                    {dish.servingRestaurants > 0 ? `${dish.servingRestaurants} kitchen${dish.servingRestaurants === 1 ? "" : "s"} serving` : "Catalogue only"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-4 text-[10.5px] leading-5 text-[#8a938d]">
        Filter: cuisine={cuisineSlug}. Allergen information is shown only where a dish inherently contains that ingredient; always confirm with the kitchen.
      </p>
    </div>
  );
}
