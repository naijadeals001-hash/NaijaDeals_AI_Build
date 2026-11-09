import { prisma } from "@/lib/prisma";
import { CUISINE_BY_SLUG, DISH_CATEGORIES } from "@/lib/eats/taxonomy";
import { listStorefrontRestaurants, type StorefrontRestaurant } from "./storefront";

/**
 * Cuisine-scoped catalogue + restaurant cross-reference.
 *
 * Two numbers always stay separate: how many dishes are documented for a
 * cuisine, and how many can actually be ordered from a verified kitchen in the
 * selected area. A large documented catalogue with no restaurants is a real,
 * reportable state — not something to hide behind fake listings.
 */

const COUNTRY_NAMES: Record<string, string> = {
  NG: "Nigeria", GH: "Ghana", SN: "Senegal", CI: "Côte d'Ivoire", BJ: "Benin", TG: "Togo",
  GM: "Gambia", SL: "Sierra Leone", LR: "Liberia",
  ET: "Ethiopia", ER: "Eritrea", KE: "Kenya", TZ: "Tanzania", UG: "Uganda", RW: "Rwanda",
  SO: "Somalia", BI: "Burundi",
  MA: "Morocco", EG: "Egypt", DZ: "Algeria", TN: "Tunisia", LY: "Libya",
  CM: "Cameroon", CD: "DR Congo", CG: "Congo", GA: "Gabon", TD: "Chad", CF: "Central African Republic",
  ZA: "South Africa", ZW: "Zimbabwe", ZM: "Zambia", BW: "Botswana", NA: "Namibia", MZ: "Mozambique",
  MW: "Malawi", AO: "Angola",
  IT: "Italy", US: "United States", GB: "United Kingdom", FR: "France", GR: "Greece",
  LB: "Lebanon", TR: "Türkiye", CN: "China", MX: "Mexico", ES: "Spain", IN: "India"
};

export function countryName(code: string) {
  return COUNTRY_NAMES[code.toUpperCase()] ?? code.toUpperCase();
}

export type CuisineDish = {
  slug: string;
  name: string;
  localNames: string[];
  countryCode: string;
  countryName: string;
  category: string;
  categoryLabel: string;
  description: string;
  ingredients: string[];
  allergens: string[];
  imageUrl: string | null;
  /** How many verified kitchens in the catalogue serve a matching dish. */
  servingRestaurants: number;
};

export function isValidCuisine(slug: string | undefined) {
  return Boolean(slug && CUISINE_BY_SLUG[slug]);
}

export async function cuisineDishCatalogue(cuisineSlug: string) {
  const cuisine = CUISINE_BY_SLUG[cuisineSlug];
  if (!cuisine) return null;

  const [dishes, menuItems, restaurants] = await Promise.all([
    prisma.dish.findMany({ where: { cuisine: cuisineSlug }, orderBy: [{ name: "asc" }] }),
    prisma.menuItem.findMany({
      where: { published: true, available: true, restaurant: { status: "VERIFIED" } },
      select: { name: true, restaurantId: true }
    }),
    listStorefrontRestaurants()
  ]);

  const restaurantsByDish = new Map<string, Set<string>>();
  for (const item of menuItems) {
    const key = item.name.toLowerCase();
    for (const dish of dishes) {
      const names = [dish.name, ...dish.localNames].map((name) => name.toLowerCase());
      if (names.some((name) => key === name || key.includes(name))) {
        const set = restaurantsByDish.get(dish.slug) ?? new Set<string>();
        set.add(item.restaurantId);
        restaurantsByDish.set(dish.slug, set);
      }
    }
  }

  const categoryLabel = new Map(DISH_CATEGORIES.map((row) => [row.slug, row.label]));
  const catalogue: CuisineDish[] = dishes.map((dish) => ({
    slug: dish.slug,
    name: dish.name,
    localNames: dish.localNames,
    countryCode: dish.countryCode,
    countryName: countryName(dish.countryCode),
    category: dish.category,
    categoryLabel: categoryLabel.get(dish.category) ?? dish.category,
    description: dish.description,
    ingredients: dish.ingredients,
    allergens: dish.allergens,
    imageUrl: dish.imageUrl,
    servingRestaurants: restaurantsByDish.get(dish.slug)?.size ?? 0
  }));

  return { cuisine, catalogue, restaurants, restaurantsByDish };
}

/** Restaurants whose cuisine matches the selected cuisine page. */
export function restaurantsForCuisine(restaurants: StorefrontRestaurant[], cuisineLabel: string) {
  const target = cuisineLabel.toLowerCase();
  return restaurants.filter((restaurant) => {
    const cuisine = restaurant.cuisine.toLowerCase();
    return cuisine === target || cuisine.includes(target) || restaurant.dishes.some((dish) => dish.toLowerCase().includes(target));
  });
}

export function countryFacets(dishes: Array<{ countryCode: string }>) {
  const counts = new Map<string, number>();
  for (const dish of dishes) counts.set(dish.countryCode, (counts.get(dish.countryCode) ?? 0) + 1);
  return [...counts.entries()]
    .map(([code, count]) => ({ code, name: countryName(code), count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
