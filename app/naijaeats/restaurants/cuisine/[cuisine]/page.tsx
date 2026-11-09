import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EatsHeader } from "@/components/eats/eats-header";
import { EatsFooter } from "@/components/eats/eats-footer";
import { EatsBottomNav } from "@/components/eats/eats-bottom-nav";
import { CuisineBrowser } from "@/components/eats/cuisine-browser";
import { cuisineDishCatalogue, countryFacets, restaurantsForCuisine } from "@/lib/services/eats/cuisine";
import { listCuisineRail, type StorefrontRestaurant } from "@/lib/services/eats/storefront";
import { CUISINE_BY_SLUG, DISH_CATEGORIES } from "@/lib/eats/taxonomy";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { cuisine: string } }): Promise<Metadata> {
  const cuisine = CUISINE_BY_SLUG[params.cuisine];
  if (!cuisine) return { title: "Cuisine not found — NaijaEats" };
  return { title: `${cuisine.label} food delivery — NaijaEats`, description: `Order ${cuisine.label} food: ${cuisine.blurb}.` };
}

/**
 * One page per cuisine route. Answers two questions separately and honestly:
 * what a cuisine offers (the documented catalogue) and who actually cooks it
 * nearby (verified kitchens with published menus).
 */
export default async function CuisinePage({ params }: { params: { cuisine: string } }) {
  const data = await cuisineDishCatalogue(params.cuisine);
  if (!data) notFound();

  const { cuisine, catalogue, restaurants } = data;
  const kitchens = restaurantsForCuisine(restaurants, cuisine.label) as Array<StorefrontRestaurant & CardRestaurantish>;
  const cuisines = await listCuisineRail(restaurants);
  const countries = countryFacets(catalogue);
  const categories = DISH_CATEGORIES.map((category) => ({
    slug: category.slug,
    label: category.label,
    count: catalogue.filter((dish) => dish.category === category.slug).length
  })).filter((category) => category.count > 0);

  return (
    <div className="min-h-screen bg-white pb-20 lg:pb-0">
      <EatsHeader destination="Lagos, Nigeria" cartCount={0} cuisines={cuisines} />
      <main className="mx-auto max-w-[1440px] px-3 py-5 sm:px-8">
        <nav aria-label="Breadcrumb" className="text-[11px] text-[#6b7a70]">
          <Link href="/naijaeats" className="hover:text-[#0b5c33]">NaijaEats</Link>
          <span aria-hidden> › </span>
          <Link href="/naijaeats/restaurants" className="hover:text-[#0b5c33]">Restaurants</Link>
          <span aria-hidden> › </span>
          <span>{cuisine.label}</span>
        </nav>
        <h1 className="mt-1 font-display text-[24px] font-extrabold text-[#14241b]">{cuisine.label} food</h1>
        <p className="text-[12px] text-[#6b7a70]">{cuisine.blurb} · {cuisine.region} Africa</p>
        <CuisineBrowser
          cuisineSlug={cuisine.slug}
          cuisineLabel={cuisine.label}
          dishes={catalogue}
          restaurants={kitchens}
          countries={countries}
          categories={categories}
        />
      </main>
      <EatsFooter />
      <EatsBottomNav cartCount={0} />
    </div>
  );
}

/** The browser only needs the card fields; the full record satisfies them. */
type CardRestaurantish = {
  id: string;
  slug: string;
  name: string;
  cuisine: string;
  market: string;
  logoUrl: string | null;
  coverUrl: string | null;
  rating: { average: number; count: number } | null;
  deliveryWindow: { min: number; max: number } | null;
  itemCount: number;
};
