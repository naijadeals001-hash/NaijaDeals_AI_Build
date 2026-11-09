import { prisma } from "@/lib/prisma";
import { CUISINES, DISH_CATEGORIES } from "@/lib/eats/taxonomy";

/**
 * NaijaEats storefront data.
 *
 * Every rail is assembled from verified restaurants and their published menu
 * items. Ratings are averaged from `RestaurantRating` rows (one per delivered
 * order) — a restaurant with no ratings shows no score rather than a number
 * borrowed from a similar-looking kitchen. Delivery windows come from the
 * restaurant's own preparation settings; when unset, the card says so.
 */

export type StorefrontRestaurant = {
  id: string;
  slug: string;
  name: string;
  cuisine: string;
  region: string;
  countryCode: string;
  market: string;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  dishes: string[];
  highlighted: boolean;
  rating: { average: number; count: number } | null;
  deliveryWindow: { min: number; max: number } | null;
  deliveryFeeKobo: string;
  itemCount: number;
  isSample: boolean;
};

export type StorefrontDish = {
  id: string;
  name: string;
  restaurantName: string;
  restaurantSlug: string;
  priceKobo: string;
  imageUrl: string | null;
  category: string | null;
};

export type CuisineRailItem = {
  slug: string;
  label: string;
  blurb: string;
  imageUrl: string;
  restaurants: number;
};

const CUISINE_IMAGE: Record<string, string> = {
  nigerian: "/generated/eats/nigerian-feast-card.webp",
  "west-african": "/generated/eats/buka-banner-card.webp",
  "east-african": "/generated/eats/family-feast-card.webp",
  "north-african": "/generated/eats/jollof-feast-card.webp",
  "central-african": "/generated/eats/lagos-twilight-card.webp",
  "southern-african": "/generated/eats/fast-food-feast-card.webp",
  continental: "/generated/eats/fast-food-feast-card.webp"
};

/** Dish-category art, matched to the food each category actually shows. */
const CATEGORY_IMAGE: Record<string, string> = {
  "jollof-rice": "/generated/eats/jollof-feast-card.webp",
  "rice-dishes": "/generated/eats/nigerian-feast-card.webp",
  "swallows-and-soups": "/generated/eats/nigerian-feast-card.webp",
  stews: "/generated/eats/lagos-twilight-card.webp",
  "grills-bbq": "/generated/eats/family-feast-card.webp",
  "pepper-soup": "/generated/eats/buka-banner-card.webp",
  "akara-snacks": "/generated/eats/breakfast-feast-card.webp",
  breakfast: "/generated/eats/breakfast-feast-card.webp",
  "salads-healthy": "/generated/eats/healthy-meals-card.webp",
  drinks: "/generated/eats/breakfast-feast-card.webp",
  desserts: "/generated/eats/dessert-feast-card.webp"
};

export function categoryImage(slug: string) {
  return CATEGORY_IMAGE[slug] ?? "/generated/eats/nigerian-feast-card.webp";
}

export function cuisineImage(slug: string) {
  return CUISINE_IMAGE[slug] ?? "/generated/eats/nigerian-feast-card.webp";
}

function deliveryWindow(row: { prepMinMinutes: number | null; prepMaxMinutes: number | null }) {
  if (!row.prepMinMinutes || !row.prepMaxMinutes) return null;
  return { min: row.prepMinMinutes, max: row.prepMaxMinutes };
}

function ratingFrom(rows: Array<{ rating: number }>) {
  if (rows.length === 0) return null;
  const total = rows.reduce((sum, row) => sum + row.rating, 0);
  return { average: Math.round((total / rows.length) * 10) / 10, count: rows.length };
}

export async function listStorefrontRestaurants(): Promise<StorefrontRestaurant[]> {
  const rows = await prisma.restaurant.findMany({
    where: { status: "VERIFIED", menuItems: { some: { published: true, available: true } } },
    orderBy: [{ highlighted: "desc" }, { name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      cuisine: true,
      region: true,
      countryCode: true,
      market: true,
      description: true,
      logoUrl: true,
      coverUrl: true,
      dishes: true,
      highlighted: true,
      prepMinMinutes: true,
      prepMaxMinutes: true,
      deliveryFeeKobo: true,
      isSample: true,
      ratings: { select: { rating: true } },
      _count: { select: { menuItems: true } }
    }
  });

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    cuisine: row.cuisine,
    region: row.region,
    countryCode: row.countryCode,
    market: row.market,
    description: row.description,
    logoUrl: row.logoUrl,
    coverUrl: row.coverUrl,
    dishes: row.dishes,
    highlighted: row.highlighted,
    rating: ratingFrom(row.ratings),
    deliveryWindow: deliveryWindow(row),
    deliveryFeeKobo: row.deliveryFeeKobo.toString(),
    itemCount: row._count.menuItems,
    isSample: row.isSample
  }));
}

export async function listFeaturedDishes(take = 12): Promise<StorefrontDish[]> {
  const rows = await prisma.menuItem.findMany({
    where: { published: true, available: true, restaurant: { status: "VERIFIED" } },
    orderBy: [{ featured: "desc" }, { name: "asc" }],
    take,
    select: {
      id: true,
      name: true,
      priceKobo: true,
      imageUrl: true,
      category: true,
      restaurant: { select: { name: true, slug: true } }
    }
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    restaurantName: row.restaurant.name,
    restaurantSlug: row.restaurant.slug,
    priceKobo: row.priceKobo.toString(),
    imageUrl: row.imageUrl,
    category: row.category
  }));
}

/** Cuisine rail with the live number of restaurants serving each cuisine. */
export async function listCuisineRail(restaurants: StorefrontRestaurant[]): Promise<CuisineRailItem[]> {
  const counts = new Map<string, number>();
  for (const restaurant of restaurants) {
    const key = restaurant.cuisine.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return CUISINES.map((cuisine) => ({
    slug: cuisine.slug,
    label: cuisine.label,
    blurb: cuisine.blurb,
    imageUrl: cuisineImage(cuisine.slug),
    restaurants: counts.get(cuisine.label.toLowerCase()) ?? counts.get(cuisine.region.toLowerCase()) ?? 0
  }));
}

/** Dish categories that actually have dishes behind them. */
export async function listDishCategoryRail() {
  const rows = await prisma.menuItem.groupBy({
    by: ["category"],
    where: { published: true, available: true, category: { not: null }, restaurant: { status: "VERIFIED" } },
    _count: { _all: true }
  });
  const have = new Map(rows.filter((row) => row.category).map((row) => [row.category as string, row._count._all]));
  return DISH_CATEGORIES.map((category) => ({ ...category, imageUrl: categoryImage(category.slug), dishes: have.get(category.slug) ?? 0 }));
}

export async function eatsStorefrontSummary() {
  const [restaurants, dishes] = await Promise.all([listStorefrontRestaurants(), listFeaturedDishes(1)]);
  return {
    restaurants: restaurants.length,
    ratedRestaurants: restaurants.filter((restaurant) => restaurant.rating).length,
    hasDishes: dishes.length > 0
  };
}
