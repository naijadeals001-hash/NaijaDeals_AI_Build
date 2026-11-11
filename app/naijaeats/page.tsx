import type { Metadata } from "next";
import Link from "next/link";
import { EatsHeader } from "@/components/eats/eats-header";
import {
  CuisineCard,
  DishCategoryCard,
  EatsHero,
  MoreWays,
  PromoRow,
  Rail,
  RestaurantCard,
  TrustStrip
} from "@/components/eats/eats-sections";
import { EatsBottomNav } from "@/components/eats/eats-bottom-nav";
import { EatsFooter } from "@/components/eats/eats-footer";
import { EatsLandingExtras } from "@/components/eats/eats-landing-extras";
import { listCuisineRail, listDishCategoryRail, listFeaturedDishes, listStorefrontRestaurants } from "@/lib/services/eats/storefront";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "NaijaEats — African food delivery",
  description: "Order from verified Nigerian and pan-African restaurants: jollof, swallows, grills, continental and more."
};

export default async function NaijaEatsPage() {
  const restaurants = await listStorefrontRestaurants();
  const [cuisines, categories, dishes] = await Promise.all([
    listCuisineRail(restaurants),
    listDishCategoryRail(),
    // The rail is specifically Nigerian, so only Nigerian kitchens' dishes.
    listFeaturedDishes(12, "Nigerian")
  ]);

  const rated = restaurants.filter((restaurant) => restaurant.rating);
  const top = (rated.length > 0 ? rated : restaurants).slice(0, 8);
  const locals = restaurants.filter((restaurant) => /buka|local|home/i.test(`${restaurant.cuisine} ${restaurant.name}`)).slice(0, 6);
  const vendors = locals.length > 0 ? locals : restaurants.slice(0, 4);
  const cartCount = 0;

  return (
    <div className="min-h-screen bg-white pb-20 lg:pb-0">
      <EatsHeader destination="Lagos, Nigeria" cartCount={cartCount} cuisines={cuisines} />

      <main className="mx-auto max-w-[1440px] px-3 pb-10 sm:px-8">
        <EatsHero />
        <TrustStrip />

        {restaurants.length === 0 ? (
          <section className="mt-6 rounded-xl border border-dashed border-[#d9e2dc] p-8 text-center">
            <p className="font-display text-[15px] font-extrabold text-[#14241b]">No restaurants are listed in your area yet</p>
            <p className="mx-auto mt-1 max-w-md text-[12px] leading-6 text-[#6b7a70]">
              Verified kitchens appear here once they publish a menu. We do not invent restaurants to fill the page.
            </p>
            <Link href="/restaurant/apply" className="mt-3 inline-block rounded-full bg-[#f26b21] px-4 py-2 text-[12px] font-bold text-white">
              List your restaurant
            </Link>
          </section>
        ) : null}

        <Rail title="Browse by cuisine" href="/naijaeats/restaurants" seeAllLabel="See all cuisines">
          {cuisines.map((cuisine) => (
            <CuisineCard key={cuisine.slug} cuisine={cuisine} />
          ))}
        </Rail>

        <Rail title="Popular food categories" href="/naijaeats/restaurants" seeAllLabel="See all categories">
          {categories.map((category) => (
            <DishCategoryCard key={category.slug} category={category} />
          ))}
        </Rail>

        <Rail title="Top restaurants near you" href="/naijaeats/restaurants" seeAllLabel="See all restaurants">
          {top.map((restaurant) => (
            <RestaurantCard key={restaurant.id} restaurant={restaurant} />
          ))}
        </Rail>

        <PromoRow />

        {dishes.length > 0 ? (
          <Rail title="Explore Nigerian favourites" href="/naijaeats/restaurants" seeAllLabel="See all Nigerian dishes">
            {dishes.map((dish) => (
              <li key={dish.id} className="w-[128px] shrink-0 snap-start sm:w-[150px]">
                <Link href={`/naijaeats/restaurants/${dish.restaurantSlug}`} className="block rounded-xl bg-[#fff8f2] p-2 text-center ring-1 ring-[#f6e3d5] hover:shadow-md">
                  <span className="block aspect-[4/3] w-full overflow-hidden rounded-lg">
                    {dish.imageUrl ? (
                      <img src={dish.imageUrl} alt={dish.name} loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <span className="grid h-full w-full place-items-center bg-[#f4f6f5] text-[10px] text-[#8a938d]">No photo</span>
                    )}
                  </span>
                  <span className="mt-1 block truncate text-[11px] font-bold text-[#14241b]">{dish.name}</span>
                  <span className="block truncate text-[9.5px] text-[#6b7a70]">{dish.restaurantName}</span>
                </Link>
              </li>
            ))}
          </Rail>
        ) : null}

        <Rail title="Local food vendors & home kitchens" href="/naijaeats/restaurants" seeAllLabel="See all vendors">
          {vendors.map((restaurant) => (
            <RestaurantCard key={restaurant.id} restaurant={restaurant} compact />
          ))}
        </Rail>

        <EatsLandingExtras />
        <MoreWays />
      </main>

      <EatsFooter />
      <EatsBottomNav cartCount={cartCount} />
    </div>
  );
}
