import type { Metadata } from "next";
import Link from "next/link";
import { EatsHeader } from "@/components/eats/eats-header";
import { EatsFooter } from "@/components/eats/eats-footer";
import { EatsBottomNav } from "@/components/eats/eats-bottom-nav";
import { RestaurantCard, type CardRestaurant } from "@/components/eats/eats-sections";
import { listCuisineRail, listStorefrontRestaurants } from "@/lib/services/eats/storefront";
import { CUISINE_BY_SLUG, DISH_CATEGORIES } from "@/lib/eats/taxonomy";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Restaurants — NaijaEats", description: "Browse verified restaurants on NaijaEats." };

/**
 * Restaurant discovery. Filters are driven by the query string from the
 * cuisine, category and search rails, and applied to real records only.
 */
export default async function RestaurantsPage({
  searchParams
}: {
  searchParams: { cuisine?: string; category?: string; q?: string; sort?: string };
}) {
  const all = await listStorefrontRestaurants();
  const cuisines = await listCuisineRail(all);

  const cuisine = searchParams.cuisine ? CUISINE_BY_SLUG[searchParams.cuisine] : undefined;
  const categoryLabel = DISH_CATEGORIES.find((row) => row.slug === searchParams.category)?.label;
  const query = (searchParams.q ?? "").trim().toLowerCase();

  const filtered = all
    .filter((restaurant) => (cuisine ? restaurant.cuisine.toLowerCase() === cuisine.label.toLowerCase() || restaurant.region === cuisine.region : true))
    .filter((restaurant) => (categoryLabel ? restaurant.dishes.some((dish) => dish.toLowerCase().includes(categoryLabel.toLowerCase())) : true))
    .filter((restaurant) => (query ? `${restaurant.name} ${restaurant.cuisine} ${restaurant.market} ${restaurant.dishes.join(" ")}`.toLowerCase().includes(query) : true))
    .sort((a, b) => (b.rating?.average ?? 0) - (a.rating?.average ?? 0) || a.name.localeCompare(b.name));

  const heading = cuisine ? `${cuisine.label} restaurants` : categoryLabel ? `${categoryLabel} restaurants` : query ? `Results for “${searchParams.q}”` : "All restaurants";
  const cartCount = 0;

  return (
    <div className="min-h-screen bg-white pb-20 lg:pb-0">
      <EatsHeader destination="Lagos, Nigeria" cartCount={cartCount} cuisines={cuisines} />
      <main className="mx-auto max-w-[1440px] px-3 py-5 sm:px-8">
        <nav aria-label="Breadcrumb" className="text-[11px] text-[#6b7a70]">
          <Link href="/naijaeats" className="hover:text-[#0b5c33]">NaijaEats</Link>
          <span aria-hidden> › </span>
          <span>{heading}</span>
        </nav>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
          <h1 className="font-display text-[22px] font-extrabold text-[#14241b]">{heading}</h1>
          <p className="text-[11.5px] text-[#6b7a70]">{filtered.length} of {all.length} verified kitchens</p>
        </div>

        <form action="/naijaeats/restaurants" method="get" className="mt-3 flex max-w-xl gap-2">
          {searchParams.cuisine ? <input type="hidden" name="cuisine" value={searchParams.cuisine} /> : null}
          <label htmlFor="eats-filter-q" className="sr-only">Filter restaurants</label>
          <input
            id="eats-filter-q"
            name="q"
            defaultValue={searchParams.q ?? ""}
            placeholder="Filter by name, cuisine, market or dish"
            className="min-h-9 flex-1 rounded-full border border-[#e2e6e3] px-4 text-[12.5px] outline-none focus:border-[#0b5c33]"
          />
          <button type="submit" className="rounded-full bg-[#0b5c33] px-4 text-[12px] font-bold text-white">Apply</button>
        </form>

        {filtered.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-[#d9e2dc] p-8 text-center text-[12.5px] text-[#6b7a70]">
            No verified restaurants match this filter yet. We only list kitchens with a live menu.
          </p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((restaurant) => (
              <RestaurantCard
                key={restaurant.id}
                restaurant={{ ...restaurant } satisfies CardRestaurant}
                compact
                inRail={false}
              />
            ))}
          </ul>
        )}
      </main>
      <EatsFooter />
      <EatsBottomNav cartCount={cartCount} />
    </div>
  );
}
