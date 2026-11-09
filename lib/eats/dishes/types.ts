/**
 * A documented dish in the NaijaEats food catalogue.
 *
 * A catalogue entry describes a real dish — it is not a restaurant listing and
 * does not imply any restaurant sells it. Availability is derived separately
 * from menu items attached to verified restaurants.
 */
export type DishCategorySlug =
  | "jollof-rice"
  | "rice-dishes"
  | "swallows-and-soups"
  | "stews"
  | "grills-bbq"
  | "pepper-soup"
  | "akara-snacks"
  | "breakfast"
  | "salads-healthy"
  | "drinks"
  | "desserts";

export type DocumentedDish = {
  slug: string;
  name: string;
  /** Names used locally, in local language or common shorthand. */
  localNames?: string[];
  /** ISO country code the dish is associated with. */
  country: string;
  /** Cuisine route slug: nigerian | west-african | ... | continental. */
  cuisine: string;
  category: DishCategorySlug;
  description: string;
  ingredients: string[];
  /** Only declared where the dish inherently contains them. */
  allergens?: string[];
  keywords?: string[];
};
