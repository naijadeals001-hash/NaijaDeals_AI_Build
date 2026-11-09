/**
 * NaijaEats discovery taxonomy.
 *
 * Cuisines follow the approved mockup's "Browse by Cuisine" rail and cover all
 * five African regions, plus Continental. Dish categories drive the "Popular
 * Food Categories" rail. Entries name dishes that genuinely belong to the
 * region they are grouped under — the storefront never shows, say, Nigerian
 * jollof for an Ethiopian dish slot.
 */
export type Cuisine = {
  slug: string;
  label: string;
  region: "West" | "East" | "Southern" | "Central" | "North" | "Continental";
  blurb: string;
  /** Representative dishes, shown under the label as in the mockup. */
  examples: string[];
};

export const CUISINES: Cuisine[] = [
  { slug: "nigerian", label: "Nigerian", region: "West", blurb: "Jollof, Egusi, Pounded Yam", examples: ["Jollof Rice", "Egusi", "Pounded Yam"] },
  { slug: "west-african", label: "West African", region: "West", blurb: "Waakye, Banku, Kenkey", examples: ["Waakye", "Banku", "Kenkey"] },
  { slug: "east-african", label: "East African", region: "East", blurb: "Nyama Choma, Ugali", examples: ["Nyama Choma", "Ugali", "Injera"] },
  { slug: "north-african", label: "North African", region: "North", blurb: "Tagine, Couscous", examples: ["Tagine", "Couscous", "Koshari"] },
  { slug: "central-african", label: "Central African", region: "Central", blurb: "Ndolé, Poulet DG", examples: ["Ndolé", "Poulet DG", "Saka-Saka"] },
  { slug: "southern-african", label: "Southern African", region: "Southern", blurb: "Pap, Chakalaka", examples: ["Braai", "Pap", "Chakalaka"] },
  { slug: "continental", label: "Continental", region: "Continental", blurb: "Pasta, Burgers, Pizza", examples: ["Pasta", "Burgers", "Pizza"] }
];

export type DishCategory = { slug: string; label: string };

/** Order matters: the rail in the mockup runs left to right in this sequence. */
export const DISH_CATEGORIES: DishCategory[] = [
  { slug: "jollof-rice", label: "Jollof Rice" },
  { slug: "rice-dishes", label: "Rice Dishes" },
  { slug: "swallows-and-soups", label: "Swallows & Soups" },
  { slug: "stews", label: "Stews" },
  { slug: "grills-bbq", label: "Grills & BBQ" },
  { slug: "pepper-soup", label: "Pepper Soup" },
  { slug: "akara-snacks", label: "Akara & Snacks" },
  { slug: "breakfast", label: "Breakfast" },
  { slug: "salads-healthy", label: "Salads & Healthy" },
  { slug: "drinks", label: "Drinks" },
  { slug: "desserts", label: "Desserts" }
];

/** Nigerian favourites rail from the mockup, in order. */
export const NIGERIAN_FAVOURITES = [
  "Jollof Rice",
  "Egusi Soup",
  "Pounded Yam & Egusi",
  "Efo Riro",
  "Ofada Rice",
  "Abula",
  "Suya",
  "Nkwobi"
];

export const CUISINE_BY_SLUG = Object.fromEntries(CUISINES.map((cuisine) => [cuisine.slug, cuisine])) as Record<string, Cuisine>;
