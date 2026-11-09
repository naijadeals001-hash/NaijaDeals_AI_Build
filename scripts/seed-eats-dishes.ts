/**
 * Seeds the documented dish catalogue into the database.
 *
 * These are reference entries only — they do not create restaurants or menu
 * items, so a dish appearing here never implies it can be ordered. Images are
 * attached only where an existing approved photo genuinely depicts the dish
 * (see DISH_IMAGES); everything else stays without art until generation is
 * authorised.
 *
 * Idempotent: upserts by slug.
 *
 * Usage: npx tsx scripts/seed-eats-dishes.ts
 */
import { prisma } from "../lib/prisma";
import { ALL_DISHES } from "../lib/eats/dishes";

/**
 * Dish -> approved image. Only dishes whose photo actually shows that food.
 * The approved NaijaEats set covers Nigerian staples and grills; other cuisines
 * remain unillustrated rather than borrowing a jollof photo.
 */
const DISH_IMAGES: Record<string, string> = {
  "jollof-rice": "/generated/eats/jollof-feast-card.webp",
  "party-jollof": "/generated/eats/jollof-feast-card.webp",
  "jollof-gh": "/generated/eats/jollof-feast-card.webp",
  "fried-rice": "/generated/eats/nigerian-feast-card.webp",
  "ofada-rice": "/generated/eats/nigerian-feast-card.webp",
  "asunarice-bowl": "/generated/eats/nigerian-feast-card.webp",
  "rice-and-stew": "/generated/eats/nigerian-feast-card.webp",
  "egusi-soup": "/generated/eats/nigerian-feast-card.webp",
  "efo-riro": "/generated/eats/nigerian-feast-card.webp",
  "pepper-soup": "/generated/eats/buka-banner-card.webp",
  "peppered-goat-meat": "/generated/eats/buka-banner-card.webp",
  "suya": "/generated/eats/family-feast-card.webp",
  "grilled-tilapia": "/generated/eats/lagos-twilight-card.webp",
  "grilled-fish-west": "/generated/eats/lagos-twilight-card.webp",
  "beef-suya-wrap": "/generated/eats/family-feast-card.webp",
  "nigerian-breakfast": "/generated/eats/breakfast-feast-card.webp",
  "akara": "/generated/eats/breakfast-feast-card.webp",
  "akamu": "/generated/eats/breakfast-feast-card.webp",
  "chin-chin": "/generated/eats/dessert-feast-card.webp",
  "puff-puff": "/generated/eats/dessert-feast-card.webp"
};

async function main() {
  let created = 0;
  let updated = 0;
  let illustrated = 0;

  for (const dish of ALL_DISHES) {
    const imageUrl = DISH_IMAGES[dish.slug] ?? null;
    if (imageUrl) illustrated += 1;
    const data = {
      name: dish.name,
      localNames: dish.localNames ?? [],
      countryCode: dish.country,
      cuisine: dish.cuisine,
      category: dish.category,
      description: dish.description,
      ingredients: dish.ingredients,
      allergens: dish.allergens ?? [],
      keywords: dish.keywords ?? [],
      imageUrl
    };
    const existing = await prisma.dish.findUnique({ where: { slug: dish.slug }, select: { id: true } });
    if (existing) {
      await prisma.dish.update({ where: { slug: dish.slug }, data });
      updated += 1;
    } else {
      await prisma.dish.create({ data: { slug: dish.slug, ...data } });
      created += 1;
    }
  }

  const byCuisine = await prisma.dish.groupBy({ by: ["cuisine"], _count: { _all: true } });
  console.log(
    JSON.stringify(
      {
        total: ALL_DISHES.length,
        created,
        updated,
        illustrated,
        missingArt: ALL_DISHES.length - illustrated,
        byCuisine: Object.fromEntries(byCuisine.map((row) => [row.cuisine, row._count._all]))
      },
      null,
      1
    )
  );
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
