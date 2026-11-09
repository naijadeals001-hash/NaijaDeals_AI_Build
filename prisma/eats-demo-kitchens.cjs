/**
 * Isolated demonstration kitchens covering all seven cuisine routes.
 *
 * Every row is `isSample: true` and every name is prefixed "Demo" so it can
 * never be mistaken for a real business. They exist to exercise discovery,
 * menus and ordering in preview; a production build must not present them as
 * genuine restaurants (see docs/handoff.md).
 *
 * Each menu item is a real documented dish from the Dish catalogue, priced in
 * kobo, so cuisine filters, dish search and "serving kitchens" all resolve to
 * genuine associations rather than invented ones.
 *
 * Idempotent by slug. Usage: node prisma/eats-demo-kitchens.cjs
 */
const { PrismaClient } = require("@prisma/client");
const { scryptSync, randomBytes } = require("node:crypto");

const prisma = new PrismaClient();
const hash = (password) => {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${scryptSync(password, salt, 64).toString("hex")}`;
};
const ART = (name) => `/generated/eats/${name}-card.webp`;

const KITCHENS = [
  {
    slug: "demo-lagos-kitchen",
    name: "Demo Lagos Kitchen",
    cuisine: "Nigerian",
    region: "West",
    countryCode: "NG",
    market: "Surulere, Lagos",
    cover: ART("nigerian-feast"),
    logo: ART("jollof-feast"),
    description: "Demonstration kitchen for Nigerian staples: jollof, soups, swallows and grills.",
    dishes: ["Jollof Rice", "Egusi Soup", "Pounded Yam", "Suya", "Pepper Soup"],
    menu: [
      ["Jollof Rice", "jollof-rice", 350_000, "jollof-feast"],
      ["Egusi Soup", "swallows-and-soups", 420_000, "nigerian-feast"],
      ["Pounded Yam", "swallows-and-soups", 200_000, "nigerian-feast"],
      ["Suya", "grills-bbq", 300_000, "family-feast"],
      ["Pepper Soup", "pepper-soup", 380_000, "buka-banner"]
    ]
  },
  {
    slug: "demo-accra-buka",
    name: "Demo Accra Buka",
    cuisine: "West African",
    region: "West",
    countryCode: "GH",
    market: "Osu, Accra",
    cover: ART("buka-banner"),
    logo: ART("buka-banner"),
    description: "Demonstration kitchen for Ghanaian and West African plates.",
    dishes: ["Waakye", "Banku", "Kenkey", "Red Red", "Jollof Rice"],
    menu: [
      ["Waakye", "rice-dishes", 280_000, "nigerian-feast"],
      ["Banku", "swallows-and-soups", 220_000, "buka-banner"],
      ["Kenkey", "swallows-and-soups", 200_000, "buka-banner"],
      ["Red Red", "stews", 250_000, "lagos-twilight"],
      ["Jollof Rice", "jollof-rice", 300_000, "jollof-feast"]
    ]
  },
  {
    slug: "demo-nairobi-grill",
    name: "Demo Nairobi Grill",
    cuisine: "East African",
    region: "East",
    countryCode: "KE",
    market: "Kilimani, Nairobi",
    cover: ART("family-feast"),
    logo: ART("lagos-twilight"),
    description: "Demonstration kitchen for East African grills and staples.",
    dishes: ["Nyama Choma", "Ugali", "Sukuma Wiki", "Kenyan Pilau", "Chapati"],
    menu: [
      ["Nyama Choma", "grills-bbq", 450_000, "family-feast"],
      ["Ugali", "swallows-and-soups", 150_000, "nigerian-feast"],
      ["Sukuma Wiki", "salads-healthy", 180_000, "healthy-meals"],
      ["Kenyan Pilau", "rice-dishes", 320_000, "nigerian-feast"],
      ["Chapati", "breakfast", 120_000, "breakfast-feast"]
    ]
  },
  {
    slug: "demo-marrakech-table",
    name: "Demo Marrakech Table",
    cuisine: "North African",
    region: "North",
    countryCode: "MA",
    market: "Medina, Marrakech",
    cover: ART("jollof-feast"),
    logo: ART("jollof-feast"),
    description: "Demonstration kitchen for Moroccan and North African cooking.",
    dishes: ["Chicken Tagine", "Couscous", "Harira", "Msemen", "Mint Tea"],
    menu: [
      ["Chicken Tagine", "stews", 480_000, "lagos-twilight"],
      ["Couscous", "rice-dishes", 390_000, "nigerian-feast"],
      ["Harira", "swallows-and-soups", 200_000, "buka-banner"],
      ["Msemen", "breakfast", 150_000, "breakfast-feast"],
      ["Moroccan Mint Tea", "drinks", 100_000, "breakfast-feast"]
    ]
  },
  {
    slug: "demo-kinshasa-kitchen",
    name: "Demo Kinshasa Kitchen",
    cuisine: "Central African",
    region: "Central",
    countryCode: "CD",
    market: "Gombe, Kinshasa",
    cover: ART("lagos-twilight"),
    logo: ART("lagos-twilight"),
    description: "Demonstration kitchen for Congolese and Central African dishes.",
    dishes: ["Poulet DG", "Saka-Saka", "Pondu", "Liboké", "Chikwangue"],
    menu: [
      ["Poulet DG", "stews", 460_000, "lagos-twilight"],
      ["Saka-Saka", "stews", 330_000, "buka-banner"],
      ["Pondu", "stews", 320_000, "buka-banner"],
      ["Liboké", "grills-bbq", 420_000, "family-feast"],
      ["Chikwangue", "swallows-and-soups", 180_000, "nigerian-feast"]
    ]
  },
  {
    slug: "demo-jobar-umqombothi",
    name: "Demo Joburg Braai",
    cuisine: "Southern African",
    region: "Southern",
    countryCode: "ZA",
    market: "Melville, Johannesburg",
    cover: ART("family-feast"),
    logo: ART("family-feast"),
    description: "Demonstration kitchen for South African braai and staples.",
    dishes: ["Braai", "Boerewors", "Pap", "Chakalaka", "Bunny Chow"],
    menu: [
      ["Braai", "grills-bbq", 520_000, "family-feast"],
      ["Boerewors", "grills-bbq", 350_000, "family-feast"],
      ["Pap", "swallows-and-soups", 160_000, "nigerian-feast"],
      ["Chakalaka", "salads-healthy", 180_000, "healthy-meals"],
      ["Bunny Chow", "stews", 380_000, "lagos-twilight"]
    ]
  },
  {
    slug: "demo-eclectic-grill",
    name: "Demo Eclectic Grill",
    cuisine: "Continental",
    region: "Continental",
    countryCode: "NG",
    market: "Victoria Island, Lagos",
    cover: ART("fast-food-feast"),
    logo: ART("fast-food-feast"),
    description: "Demonstration kitchen for continental and international dishes sold in Nigerian cities.",
    dishes: ["Margherita Pizza", "Cheeseburger", "Spaghetti Bolognese", "Caesar Salad", "Latte"],
    menu: [
      ["Margherita Pizza", "rice-dishes", 550_000, "fast-food-feast"],
      ["Cheeseburger", "grills-bbq", 400_000, "fast-food-feast"],
      ["Spaghetti Bolognese", "rice-dishes", 420_000, "nigerian-feast"],
      ["Caesar Salad", "salads-healthy", 300_000, "healthy-meals"],
      ["Latte", "drinks", 120_000, "breakfast-feast"]
    ]
  }
];

(async () => {
  const owner = await prisma.user.upsert({
    where: { email: "demo.eats@naijaeats.demo" },
    update: { name: "NaijaEats Demo Kitchens" },
    create: { email: "demo.eats@naijaeats.demo", name: "NaijaEats Demo Kitchens", passwordHash: hash("NaijaEatsDemo2026!"), actorType: "CUSTOMER" }
  });

  let restaurants = 0;
  let items = 0;

  for (const kitchen of KITCHENS) {
    const row = await prisma.restaurant.upsert({
      where: { slug: kitchen.slug },
      update: {
        name: kitchen.name,
        cuisine: kitchen.cuisine,
        region: kitchen.region,
        countryCode: kitchen.countryCode,
        market: kitchen.market,
        description: kitchen.description,
        coverUrl: kitchen.cover,
        logoUrl: kitchen.logo,
        dishes: kitchen.dishes,
        prepMinMinutes: 20,
        prepMaxMinutes: 35,
        deliveryFeeKobo: BigInt(150_000),
        status: "VERIFIED",
        isSample: true
      },
      create: {
        slug: kitchen.slug,
        ownerId: owner.id,
        name: kitchen.name,
        cuisine: kitchen.cuisine,
        region: kitchen.region,
        countryCode: kitchen.countryCode,
        market: kitchen.market,
        address: `${kitchen.market} (demonstration address)`,
        phone: "08000000000",
        description: kitchen.description,
        coverUrl: kitchen.cover,
        logoUrl: kitchen.logo,
        dishes: kitchen.dishes,
        prepMinMinutes: 20,
        prepMaxMinutes: 35,
        deliveryFeeKobo: BigInt(150_000),
        status: "VERIFIED",
        isSample: true
      }
    });
    restaurants += 1;

    for (const [name, category, priceKobo, art] of kitchen.menu) {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const exists = await prisma.menuItem.findFirst({ where: { restaurantId: row.id, name }, select: { id: true } });
      const data = {
        name,
        description: null,
        priceKobo: BigInt(priceKobo),
        imageUrl: ART(art),
        category,
        featured: true,
        published: true,
        available: true,
        isSample: true
      };
      if (exists) await prisma.menuItem.update({ where: { id: exists.id }, data });
      else await prisma.menuItem.create({ data: { restaurantId: row.id, ...data, menuSlug: undefined, slug: undefined } });
      items += 1;
    }
  }

  const byCuisine = await prisma.restaurant.groupBy({ by: ["cuisine"], where: { status: "VERIFIED" }, _count: { _all: true } });
  console.log(JSON.stringify({ restaurants, menuItems: items, byCuisine: Object.fromEntries(byCuisine.map((r) => [r.cuisine, r._count._all])) }, null, 1));
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
