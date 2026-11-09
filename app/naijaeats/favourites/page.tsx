import type { Metadata } from "next";
import Link from "next/link";
import { EatsHeader } from "@/components/eats/eats-header";
import { EatsFooter } from "@/components/eats/eats-footer";
import { EatsBottomNav } from "@/components/eats/eats-bottom-nav";
import { RestaurantCard } from "@/components/eats/eats-sections";
import { listCuisineRail, listStorefrontRestaurants } from "@/lib/services/eats/storefront";
import { listFavourites } from "@/lib/services/eats/cart";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Favourites — NaijaEats" };

/**
 * Favourites are stored per account (`EatsFavourite`), so they follow the user
 * across sessions and devices. Signed-out visitors are asked to sign in rather
 * than shown someone else's list.
 */
export default async function FavouritesPage() {
  const all = await listStorefrontRestaurants();
  const cuisines = await listCuisineRail(all);
  const user = await getSessionUser();
  const favourites = user ? await listFavourites(user.id) : { restaurants: [], dishes: [] };
  const savedIds = new Set(favourites.restaurants.map((row) => row.id));
  const rated = all.filter((restaurant) => savedIds.has(restaurant.id));
  return (
    <div className="min-h-screen bg-white pb-20 lg:pb-0">
      <EatsHeader destination="Lagos, Nigeria" cartCount={0} cuisines={cuisines} />
      <main className="mx-auto max-w-[1200px] px-3 py-5 sm:px-8">
        <h1 className="font-display text-[22px] font-extrabold text-[#14241b]">Favourites</h1>
        <p className="mt-1 text-[12px] leading-6 text-[#6b7a70]">
          {user ? `Saved to your account · ${favourites.restaurants.length} kitchens, ${favourites.dishes.length} dishes` : "Sign in to see the kitchens and dishes you saved."}
        </p>
        {favourites.dishes.length ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {favourites.dishes.map((dish) => (
              <li key={dish.id} className="rounded-full bg-[#fff1e6] px-3 py-1 text-[11.5px] font-bold text-[#a3480f]">{dish.name}</li>
            ))}
          </ul>
        ) : null}
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rated.map((restaurant) => <RestaurantCard key={restaurant.id} restaurant={restaurant} compact />)}
        </ul>
        {rated.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-[#d9e2dc] p-6 text-center text-[12px] text-[#6b7a70]">
            {user ? "You have not saved a kitchen yet." : "Sign in to see your saved kitchens."}{" "}
            <Link href={user ? "/naijaeats/restaurants" : "/login?next=/naijaeats/favourites"} className="font-bold text-[#0b5c33] underline">
              {user ? "Browse all restaurants" : "Sign in"}
            </Link>
          </p>
        ) : null}
      </main>
      <EatsFooter />
      <EatsBottomNav cartCount={0} />
    </div>
  );
}
