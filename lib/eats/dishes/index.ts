/**
 * The complete documented-dish catalogue, assembled from the regional files.
 *
 * IMPORTANT: this is a food reference catalogue, not restaurant inventory. A
 * dish appearing here does not mean any restaurant sells it; availability is
 * computed from published menu items on verified restaurants.
 */
import type { DocumentedDish } from "./types";
import { NIGERIAN_DISHES } from "./nigeria";
import { WEST_AFRICAN_DISHES } from "./west-africa";
import { EAST_AFRICAN_DISHES, NORTH_AFRICAN_DISHES } from "./east-north-africa";
import { CENTRAL_AFRICAN_DISHES, SOUTHERN_AFRICAN_DISHES, CONTINENTAL_DISHES } from "./central-southern-continental";

export type { DocumentedDish };

export const ALL_DISHES: DocumentedDish[] = [
  ...NIGERIAN_DISHES,
  ...WEST_AFRICAN_DISHES,
  ...EAST_AFRICAN_DISHES,
  ...NORTH_AFRICAN_DISHES,
  ...CENTRAL_AFRICAN_DISHES,
  ...SOUTHERN_AFRICAN_DISHES,
  ...CONTINENTAL_DISHES
];

export function dishesForCuisine(cuisine: string) {
  return ALL_DISHES.filter((dish) => dish.cuisine === cuisine);
}

export function cuisineCounts() {
  return ALL_DISHES.reduce<Record<string, number>>((counts, dish) => {
    counts[dish.cuisine] = (counts[dish.cuisine] ?? 0) + 1;
    return counts;
  }, {});
}
