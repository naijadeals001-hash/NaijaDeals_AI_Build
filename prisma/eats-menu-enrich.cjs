/**
 * Attaches approved artwork and dish categories to the existing demo menus, and
 * fills in the storefront fields (region, dishes, imagery, delivery window) on
 * the two demo kitchens so every rail has real data to render.
 *
 * Each image is chosen because it depicts that dish — jollof/rice for rice
 * bowls, the buka artwork for soups and pepper soup, the family feast for
 * grilled proteins. Nothing is assigned an unrelated food picture.
 *
 * Idempotent. Usage: node prisma/eats-menu-enrich.cjs
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const ART = (name) => `/generated/eats/${name}-card.webp`;

const DISH_ART = {
  "Jollof rice with grilled chicken": { image: ART("jollof-feast"), category: "jollof-rice" },
  "Egusi soup with pounded yam": { image: ART("nigerian-feast"), category: "swallows-and-soups" },
  "Peppered goat meat": { image: ART("buka-banner"), category: "pepper-soup" },
  "Beef suya wrap": { image: ART("family-feast"), category: "grills-bbq" },
  "Grilled tilapia with plantain": { image: ART("lagos-twilight"), category: "grills-bbq" },
  "Asun rice bowl": { image: ART("nigerian-feast"), category: "rice-dishes" }
};

const KITCHENS = {
  "mama-cass-kitchen": {
    region: "West",
    countryCode: "NG",
    description: "Home-style Nigerian cooking from Surulere — jollof, swallows and peppered meats, cooked to order.",
    coverUrl: ART("nigerian-feast"),
    logoUrl: ART("jollof-feast"),
    dishes: ["Jollof Rice", "Egusi Soup", "Peppered Goat Meat"],
    prepMinMinutes: 20,
    prepMaxMinutes: 35,
    deliveryFeeKobo: BigInt(150_000),
    highlighted: true
  },
  "yaba-grill-house": {
    region: "West",
    countryCode: "NG",
    description: "Grill house in Yaba: suya, tilapia and rice bowls straight from the charcoal.",
    coverUrl: ART("family-feast"),
    logoUrl: ART("lagos-twilight"),
    dishes: ["Suya", "Grilled Tilapia", "Asun Rice Bowl"],
    prepMinMinutes: 25,
    prepMaxMinutes: 40,
    deliveryFeeKobo: BigInt(200_000),
    highlighted: true
  }
};

(async () => {
  let menu = 0;
  const items = await prisma.menuItem.findMany({ where: { published: true }, select: { id: true, name: true } });
  for (const item of items) {
    const art = DISH_ART[item.name];
    if (!art) continue;
    await prisma.menuItem.update({ where: { id: item.id }, data: { imageUrl: art.image, category: art.category, featured: true } });
    menu += 1;
  }

  let kitchens = 0;
  for (const [slug, data] of Object.entries(KITCHENS)) {
    const exists = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true } });
    if (!exists) continue;
    await prisma.restaurant.update({ where: { slug }, data });
    kitchens += 1;
  }

  console.log(JSON.stringify({ menuItemsEnriched: menu, kitchensEnriched: kitchens }));
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
