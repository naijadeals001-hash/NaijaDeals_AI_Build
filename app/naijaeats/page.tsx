import type { Metadata } from "next";
import { EatsLanding2026 } from "@/components/eats/eats-landing-2026";
import { listCuisineRail, listDishCategoryRail, listFeaturedDishes, listStorefrontRestaurants } from "@/lib/services/eats/storefront";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "NaijaEats — Your favourites. Delivered.",
  description: "Discover restaurants, local kitchens and African flavours near you. Order food for delivery with NaijaEats."
};

/**
 * Canonical NaijaEats landing page.
 *
 * Everything on the page is derived from published restaurant records and the
 * shared discovery taxonomy. The hero address form submits to the existing
 * restaurant discovery route; no delivery radius, restaurant, rating, fee or
 * delivery time is fabricated to fill a section.
 */
export default async function NaijaEatsPage() {
  const restaurants = await listStorefrontRestaurants();
  const [cuisines, categories, dishes] = await Promise.all([
    listCuisineRail(restaurants),
    listDishCategoryRail(),
    listFeaturedDishes(12, "Nigerian")
  ]);

  return (
    <EatsLanding2026
      categories={categories}
      cuisines={cuisines}
      restaurantCount={restaurants.length}
      featuredDishCount={dishes.length}
    />
  );
}
