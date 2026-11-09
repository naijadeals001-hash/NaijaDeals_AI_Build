import type { Metadata } from "next";
import Link from "next/link";
import { EatsHeader } from "@/components/eats/eats-header";
import { EatsFooter } from "@/components/eats/eats-footer";
import { EatsBottomNav } from "@/components/eats/eats-bottom-nav";
import { RestaurantCard } from "@/components/eats/eats-sections";
import { listCuisineRail, listStorefrontRestaurants } from "@/lib/services/eats/storefront";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Favourites — NaijaEats" };

/**
 * Favourites currently surface the highest-rated verified kitchens. Saved
 * restaurants per account are not part of the schema yet, so this page says so
 * rather than presenting a fake "saved" state.
 */
export default async function FavouritesPage() {
  const [all, cuisines] = await Promise.all([listStorefrontRestaurants(), listCuisineRail(await listStorefrontRestaurants())]);
  const rated = all.filter((restaurant) => restaurant.rating).slice(0, 8);
  return (
    <div className="min-h-screen bg-white pb-20 lg:pb-0">
      <EatsHeader destination="Lagos, Nigeria" cartCount={0} cuisines={cuisines} />
      <main className="mx-auto max-w-[1200px] px-3 py-5 sm:px-8">
        <h1 className="font-display text-[22px] font-extrabold text-[#14241b]">Favourites</h1>
        <p className="mt-1 text-[12px] leading-6 text-[#6b7a70]">
          Saving a kitchen to your account is not switched on yet. Meanwhile these are the highest-rated verified kitchens.
        </p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rated.map((restaurant) => <RestaurantCard key={restaurant.id} restaurant={restaurant} compact />)}
        </ul>
        {rated.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-[#d9e2dc] p-6 text-center text-[12px] text-[#6b7a70]">
            No rated kitchens yet. <Link href="/naijaeats/restaurants" className="font-bold text-[#0b5c33] underline">Browse all restaurants</Link>
          </p>
        ) : null}
      </main>
      <EatsFooter />
      <EatsBottomNav cartCount={0} />
    </div>
  );
}
