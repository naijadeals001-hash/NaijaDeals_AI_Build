/**
 * NaijaFresh demonstration catalogue — pan-African.
 *
 * Every farm and listing is `isSample: true` and named "Demo …" so it can never
 * be mistaken for a real farmer or a real market price. Prices are illustrative
 * fixture values, not market data. Units are the agricultural units of sale the
 * mockup uses (kg, tuber, bunch, tray, bag…), which is what makes cross-farm
 * price comparison meaningful.
 *
 * Farms span the continent so the marketplace reads as African, not Nigerian
 * only: West, East, Southern, Central and North Africa. All prices are in NGN
 * because the platform settles in one currency (no cross-currency balancing).
 *
 * Idempotent by slug. Usage: node prisma/naijafresh-seed.cjs
 */
const { PrismaClient } = require("@prisma/client");
const { scryptSync, randomBytes } = require("node:crypto");

const prisma = new PrismaClient();
const hash = (password) => {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${scryptSync(password, salt, 64).toString("hex")}`;
};

const CATEGORIES = [
  "tomatoes-peppers",
  "vegetables-ugu",
  "fruits",
  "yam-cassava",
  "grains-beans",
  "plantain",
  "poultry-eggs",
  "fish-seafood",
  "herbs-spices"
];

/** [name, category, unit, priceKobo, quantity, description] — prices are illustrative fixtures. */
const FARMS = [
  {
    slug: "demo-alabi-farm", name: "Alabi Farm", farmerName: "Alabi Ogunleye", country: "Nigeria", countryCode: "NG", state: "Oyo", city: "Ibadan",
    specialities: ["Tomatoes", "Peppers", "Vegetables"],
    listings: [
      ["Fresh Tomatoes", "tomatoes-peppers", "kg", 120_000, 400, "Roma tomatoes picked at dawn, sold by the kilogram."],
      ["Fresh Red Pepper", "tomatoes-peppers", "kg", 180_000, 250, "Tatashe red pepper, sold by the kilogram."],
      ["Scotch Bonnet Pepper", "tomatoes-peppers", "kg", 220_000, 180, "Hot ata rodo, sold by the kilogram."],
      ["Ugu Leaves", "vegetables-ugu", "bunch", 60_000, 300, "Fresh fluted pumpkin leaves, tied in bunches."],
      ["Scent Leaf", "herbs-spices", "bunch", 40_000, 200, "Fresh efirin, tied in bunches."]
    ]
  },
  {
    slug: "demo-chioma-agro", name: "Chioma Agro Farm", farmerName: "Chioma Nwosu", country: "Nigeria", countryCode: "NG", state: "Enugu", city: "Nsukka",
    specialities: ["Ugu", "Waterleaf", "Scent leaf"],
    listings: [
      ["Waterleaf", "vegetables-ugu", "bunch", 35_000, 350, "Tender waterleaf bunches, cut to order."],
      ["Green Amaranth", "vegetables-ugu", "bunch", 45_000, 260, "Efo tete, sold in fresh bunches."],
      ["White Yam", "yam-cassava", "tuber", 350_000, 120, "Large white yam tubers from Nsukka."]
    ]
  },
  {
    slug: "demo-danladi-farms", name: "Danladi Farms", farmerName: "Danladi Bello", country: "Nigeria", countryCode: "NG", state: "Kogi", city: "Lokoja",
    specialities: ["Yam", "Cassava", "Plantain"],
    listings: [
      ["White Yam (Big Tubers)", "yam-cassava", "tuber", 420_000, 90, "Large tubers, hand-dug to order."],
      ["Cassava Tubers", "yam-cassava", "kg", 90_000, 500, "Fresh cassava, sold by the kilogram."],
      ["Unripe Plantain", "plantain", "bunch", 280_000, 140, "Green plantain, sold per bunch."]
    ]
  },
  {
    slug: "demo-aisha-grains", name: "Aisha Grains Farm", farmerName: "Aisha Bello", country: "Nigeria", countryCode: "NG", state: "Kebbi", city: "Birnin Kebbi",
    specialities: ["Rice", "Maize", "Beans"],
    listings: [
      ["Local Rice", "grains-beans", "bag (50kg)", 5_600_000, 60, "Cleaned local rice in 50kg bags."],
      ["Brown Beans", "grains-beans", "kg", 150_000, 400, "Oloyin brown beans, sold by the kilogram."],
      ["Maize", "grains-beans", "kg", 95_000, 800, "Dried yellow maize."]
    ]
  },
  {
    slug: "demo-bassey-fish", name: "Bassey Fish Farm", farmerName: "Bassey Etim", country: "Nigeria", countryCode: "NG", state: "Rivers", city: "Port Harcourt",
    specialities: ["Catfish", "Tilapia", "Fresh fish"],
    listings: [
      ["Live Catfish", "fish-seafood", "kg", 250_000, 200, "Live pond catfish, weighed to order."],
      ["Tilapia", "fish-seafood", "kg", 280_000, 150, "Fresh tilapia from farm ponds."]
    ]
  },
  {
    slug: "demo-ifeoma-poultry", name: "Ifeoma Poultry", farmerName: "Ifeoma Okeke", country: "Nigeria", countryCode: "NG", state: "Anambra", city: "Awka",
    specialities: ["Eggs", "Broilers"],
    listings: [
      ["Farm Eggs", "poultry-eggs", "tray (30)", 550_000, 220, "Fresh eggs, tray of thirty."],
      ["Live Broiler Chicken", "poultry-eggs", "piece", 900_000, 60, "Live broiler, dressed to order."]
    ]
  },
  {
    slug: "demo-ezinne-fruits", name: "Ezinne Fruits Orchard", farmerName: "Ezinne Uche", country: "Nigeria", countryCode: "NG", state: "Ondo", city: "Akure",
    specialities: ["Oranges", "Mangoes", "Pineapple"],
    listings: [
      ["Oranges", "fruits", "bag (20kg)", 2_000_000, 70, "Sweet oranges in 20kg bags."],
      ["Mangoes", "fruits", "kg", 160_000, 140, "Ripe mangoes in season."],
      ["Pineapple", "fruits", "piece", 120_000, 180, "Sweet pineapple, sold per piece."]
    ]
  },
  {
    slug: "demo-tunde-spices", name: "Tunde Spices Farm", farmerName: "Tunde Adeyemi", country: "Nigeria", countryCode: "NG", state: "Ekiti", city: "Ado Ekiti",
    specialities: ["Ginger", "Garlic", "Locust bean"],
    listings: [
      ["Fresh Ginger", "herbs-spices", "kg", 220_000, 160, "Fresh ginger rhizomes."],
      ["Garlic", "herbs-spices", "kg", 300_000, 120, "Dried garlic bulbs."],
      ["Locust Bean (Iru)", "herbs-spices", "kg", 650_000, 90, "Fermented locust bean, sold by the kilogram."]
    ]
  },
  {
    slug: "demo-kumasi-cocoa-farm", name: "Kumasi Cocoa & Plantain Farm", farmerName: "Kwame Mensah", country: "Ghana", countryCode: "GH", state: "Ashanti", city: "Kumasi",
    specialities: ["Plantain", "Cocoa", "Cassava"],
    listings: [
      ["Apem Plantain", "plantain", "bunch", 260_000, 200, "Apem plantain bunches from Ashanti."],
      ["Cassava (Gari Variety)", "yam-cassava", "bag (50kg)", 1_800_000, 80, "Cassava for gari and fufu, 50kg bags."],
      ["Cocoa Pods", "fruits", "kg", 140_000, 300, "Fresh cocoa pods, sold by weight."]
    ]
  },
  {
    slug: "demo-accra-greens", name: "Accra Urban Greens", farmerName: "Ama Owusu", country: "Ghana", countryCode: "GH", state: "Greater Accra", city: "Accra",
    specialities: ["Kontomire", "Garden eggs", "Pepper"],
    listings: [
      ["Kontomire (Cocoyam Leaves)", "vegetables-ugu", "bunch", 40_000, 300, "Fresh cocoyam leaves for palaver sauce."],
      ["Garden Eggs", "tomatoes-peppers", "kg", 130_000, 220, "White and green garden eggs."],
      ["Kpakpo Shito Pepper", "tomatoes-peppers", "kg", 240_000, 150, "Small hot pepper, sold by the kilogram."]
    ]
  },
  {
    slug: "demo-nakuru-fresh", name: "Nakuru Fresh Produce", farmerName: "Wanjiru Kamau", country: "Kenya", countryCode: "KE", state: "Nakuru", city: "Nakuru",
    specialities: ["Sukuma wiki", "Tomatoes", "Avocado"],
    listings: [
      ["Sukuma Wiki (Kale)", "vegetables-ugu", "bunch", 50_000, 400, "Fresh kale bunches from the Rift Valley."],
      ["Roma Tomatoes", "tomatoes-peppers", "crate", 900_000, 120, "Tomatoes sold by the crate."],
      ["Hass Avocado", "fruits", "kg", 180_000, 260, "Hass avocados, sorted by size."]
    ]
  },
  {
    slug: "demo-machakos-mango", name: "Machakos Mango Orchard", farmerName: "Mutiso Mwangi", country: "Kenya", countryCode: "KE", state: "Machakos", city: "Machakos",
    specialities: ["Mangoes", "Oranges", "Passion fruit"],
    listings: [
      ["Apple Mangoes", "fruits", "crate", 1_400_000, 100, "Sweet apple mangoes by the crate."],
      ["Passion Fruit", "fruits", "kg", 210_000, 180, "Purple passion fruit."],
      ["Kenyan Oranges", "fruits", "kg", 120_000, 220, "Juicy oranges."]
    ]
  },
  {
    slug: "demo-limpopo-citrus", name: "Limpopo Citrus & Maize", farmerName: "Thandiwe Mokoena", country: "South Africa", countryCode: "ZA", state: "Limpopo", city: "Tzaneen",
    specialities: ["Citrus", "Maize", "Avocado"],
    listings: [
      ["Navel Oranges", "fruits", "bag (15kg)", 1_600_000, 140, "Navel oranges, 15kg bags."],
      ["White Maize", "grains-beans", "bag (50kg)", 3_200_000, 90, "Milled white maize, 50kg bags."],
      ["Fuerte Avocado", "fruits", "kg", 170_000, 200, "Fuerte avocados."]
    ]
  },
  {
    slug: "demo-western-cape-produce", name: "Western Cape Produce", farmerName: "Pieter van Wyk", country: "South Africa", countryCode: "ZA", state: "Western Cape", city: "Paarl",
    specialities: ["Grapes", "Onions", "Potatoes"],
    listings: [
      ["Table Grapes", "fruits", "crate", 1_900_000, 110, "Seedless table grapes by the crate."],
      ["Red Onions", "tomatoes-peppers", "bag (10kg)", 700_000, 190, "Red onions in 10kg bags."],
      ["Irish Potatoes", "yam-cassava", "bag (25kg)", 1_100_000, 160, "Washed Irish potatoes, 25kg bags."]
    ]
  },
  {
    slug: "demo-buea-highlands", name: "Buea Highlands Farm", farmerName: "Nfor Tabi", country: "Cameroon", countryCode: "CM", state: "South-West", city: "Buea",
    specialities: ["Ndolé leaves", "Cocoyam", "Plantain"],
    listings: [
      ["Ndolé Leaves", "vegetables-ugu", "bunch", 45_000, 260, "Washed ndolé leaves, tied in bunches."],
      ["Cocoyam (Taro)", "yam-cassava", "kg", 160_000, 300, "Fresh cocoyam by the kilogram."],
      ["Plantain", "plantain", "bunch", 240_000, 180, "Ripe and green plantain."]
    ]
  },
  {
    slug: "demo-douala-riverside", name: "Douala Riverside Farm", farmerName: "Mireille Ewane", country: "Cameroon", countryCode: "CM", state: "Littoral", city: "Douala",
    specialities: ["Bitter leaf", "Tomatoes", "Pepper"],
    listings: [
      ["Bitter Leaf", "vegetables-ugu", "bunch", 38_000, 280, "Fresh bitter leaf bunches."],
      ["Cameroon Tomatoes", "tomatoes-peppers", "crate", 850_000, 90, "Fresh tomatoes, sold per crate."],
      ["Pèbè Pepper", "tomatoes-peppers", "kg", 260_000, 140, "Aromatic Cameroonian pepper."]
    ]
  },
  {
    slug: "demo-rift-valley-teff", name: "Rift Valley Teff Farm", farmerName: "Tigist Alemu", country: "Ethiopia", countryCode: "ET", state: "Oromia", city: "Adama",
    specialities: ["Teff", "Lentils", "Chickpeas"],
    listings: [
      ["White Teff", "grains-beans", "bag (50kg)", 4_800_000, 70, "White teff, 50kg bags for injera."],
      ["Red Lentils", "grains-beans", "kg", 180_000, 320, "Red lentils, sorted and cleaned."],
      ["Chickpeas", "grains-beans", "kg", 160_000, 280, "Dried chickpeas."]
    ]
  },
  {
    slug: "demo-ethiopian-berbere", name: "Ethiopian Berbere Garden", farmerName: "Selam Bekele", country: "Ethiopia", countryCode: "ET", state: "Amhara", city: "Bahir Dar",
    specialities: ["Berbere pepper", "Garlic", "Ginger"],
    listings: [
      ["Berbere Peppers", "herbs-spices", "kg", 320_000, 200, "Dried berbere chillies."],
      ["Ethiopian Garlic", "herbs-spices", "kg", 280_000, 160, "Aromatic garlic bulbs."],
      ["Ginger Root", "herbs-spices", "kg", 210_000, 180, "Fresh ginger root."]
    ]
  },
  {
    slug: "demo-senegal-niayes", name: "Niayes Market Garden", farmerName: "Fatou Diop", country: "Senegal", countryCode: "SN", state: "Dakar", city: "Niayes",
    specialities: ["Onions", "Carrots", "Cabbage"],
    listings: [
      ["Senegalese Onions", "tomatoes-peppers", "bag (25kg)", 1_300_000, 150, "Sweet onions in 25kg bags."],
      ["Carrots", "vegetables-ugu", "bag (10kg)", 650_000, 180, "Fresh carrots, 10kg bags."],
      ["Cabbage", "vegetables-ugu", "piece", 90_000, 240, "Firm green cabbage heads."]
    ]
  },
  {
    slug: "demo-casamance-rice", name: "Casamance Rice Fields", farmerName: "Abdou Sarr", country: "Senegal", countryCode: "SN", state: "Ziguinchor", city: "Ziguinchor",
    specialities: ["Rice", "Millet", "Peanuts"],
    listings: [
      ["Casamance Rice", "grains-beans", "bag (50kg)", 5_200_000, 80, "Local rice from the Casamance."],
      ["Millet", "grains-beans", "kg", 110_000, 350, "Pearl millet."],
      ["Groundnuts", "grains-beans", "kg", 140_000, 300, "Shelled groundnuts."]
    ]
  },
  {
    slug: "demo-zanzibar-spice", name: "Zanzibar Spice Gardens", farmerName: "Juma Hamad", country: "Tanzania", countryCode: "TZ", state: "Zanzibar", city: "Stone Town",
    specialities: ["Cloves", "Vanilla", "Cardamom"],
    listings: [
      ["Zanzibar Cloves", "herbs-spices", "kg", 900_000, 120, "Whole dried cloves."],
      ["Vanilla Pods", "herbs-spices", "piece", 600_000, 90, "Cured vanilla pods, sold per pod."],
      ["Cardamom", "herbs-spices", "kg", 780_000, 100, "Green cardamom pods."]
    ]
  },
  {
    slug: "demo-kilimanjaro-fresh", name: "Kilimanjaro Fresh", farmerName: "Neema Moshi", country: "Tanzania", countryCode: "TZ", state: "Kilimanjaro", city: "Moshi",
    specialities: ["Bananas", "Avocado", "Beans"],
    listings: [
      ["Cooking Bananas", "plantain", "bunch", 180_000, 220, "Cooking bananas from Moshi."],
      ["Kilimanjaro Avocado", "fruits", "kg", 165_000, 240, "Firm avocados."],
      ["Yellow Beans", "grains-beans", "kg", 130_000, 300, "Yellow beans, cleaned."]
    ]
  },
  {
    slug: "demo-kampala-matooke", name: "Kampala Matooke Gardens", farmerName: "Nabirye Sarah", country: "Uganda", countryCode: "UG", state: "Central", city: "Kampala",
    specialities: ["Matooke", "Beans", "Groundnuts"],
    listings: [
      ["Matooke Bunches", "plantain", "bunch", 220_000, 200, "Green matooke bunches."],
      ["Nambale Beans", "grains-beans", "kg", 140_000, 280, "Nambale beans, cleaned."],
      ["Ugandan Groundnuts", "grains-beans", "kg", 150_000, 260, "Shelled groundnuts."]
    ]
  },
  {
    slug: "demo-lusaka-maize", name: "Lusaka Maize & Groundnut Farm", farmerName: "Chola Banda", country: "Zambia", countryCode: "ZM", state: "Lusaka", city: "Lusaka",
    specialities: ["Maize", "Groundnuts", "Soya"],
    listings: [
      ["Zambian White Maize", "grains-beans", "bag (50kg)", 3_000_000, 100, "White maize, 50kg bags."],
      ["Groundnuts", "grains-beans", "kg", 165_000, 240, "Shelled groundnuts."],
      ["Soya Beans", "grains-beans", "kg", 145_000, 300, "Dried soya beans."]
    ]
  },
  {
    slug: "demo-kigali-hills", name: "Kigali Hills Produce", farmerName: "Ines Uwase", country: "Rwanda", countryCode: "RW", state: "Kigali", city: "Kigali",
    specialities: ["Irish potatoes", "Beans", "Bananas"],
    listings: [
      ["Rwandan Irish Potatoes", "yam-cassava", "bag (25kg)", 1_200_000, 140, "Irish potatoes, 25kg bags."],
      ["Climbing Beans", "grains-beans", "kg", 155_000, 260, "Climbing beans, cleaned."],
      ["Sweet Bananas", "plantain", "bunch", 190_000, 180, "Sweet banana bunches."]
    ]
  },
  {
    slug: "demo-maputo-cashew", name: "Maputo Cashew Farm", farmerName: "Alberto Macuácua", country: "Mozambique", countryCode: "MZ", state: "Maputo", city: "Marracuene",
    specialities: ["Cashew", "Cassava", "Coconut"],
    listings: [
      ["Raw Cashew Nuts", "grains-beans", "kg", 480_000, 200, "Raw cashew nuts, sorted."],
      ["Cassava", "yam-cassava", "kg", 85_000, 400, "Fresh cassava roots."],
      ["Fresh Coconuts", "fruits", "piece", 70_000, 260, "Green coconuts, sold per piece."]
    ]
  },
  {
    slug: "demo-cairo-delta", name: "Nile Delta Vegetables", farmerName: "Mariam Hassan", country: "Egypt", countryCode: "EG", state: "Beheira", city: "Damanhur",
    specialities: ["Tomatoes", "Cucumbers", "Onions"],
    listings: [
      ["Delta Tomatoes", "tomatoes-peppers", "crate", 700_000, 130, "Firm tomatoes, sold per crate."],
      ["Cucumbers", "vegetables-ugu", "kg", 110_000, 240, "Fresh cucumbers."],
      ["Egyptian Onions", "tomatoes-peppers", "bag (25kg)", 1_200_000, 170, "Yellow onions, 25kg bags."]
    ]
  }
];

(async () => {
  const owner = await prisma.user.upsert({
    where: { email: "demo.fresh@naijafresh.demo" },
    update: { name: "NaijaFresh Demo Farms" },
    create: { email: "demo.fresh@naijafresh.demo", name: "NaijaFresh Demo Farms", passwordHash: hash("NaijaFreshDemo2026!"), actorType: "CUSTOMER" }
  });

  let farms = 0;
  let listings = 0;
  const byCountry = {};

  for (const farm of FARMS) {
    const row = await prisma.farm.upsert({
      where: { slug: farm.slug },
      update: {
        name: farm.name, farmerName: farm.farmerName, state: farm.state, city: farm.city, country: farm.country, countryCode: farm.countryCode,
        specialities: farm.specialities, verified: true, isSample: true, deliveryFeeKobo: BigInt(150_000), prepMinMinutes: 60, prepMaxMinutes: 180
      },
      create: {
        slug: farm.slug,
        ownerId: owner.id,
        name: farm.name,
        farmerName: farm.farmerName,
        description: `Demonstration farm listing for NaijaFresh. ${farm.specialities.join(", ")} from ${farm.city}, ${farm.country}.`,
        country: farm.country,
        countryCode: farm.countryCode,
        state: farm.state,
        city: farm.city,
        specialities: farm.specialities,
        verified: true,
        verifiedAt: new Date(),
        isSample: true,
        deliveryFeeKobo: BigInt(150_000),
        prepMinMinutes: 60,
        prepMaxMinutes: 180
      }
    });
    farms += 1;
    byCountry[farm.country] = (byCountry[farm.country] ?? 0) + 1;

    for (const [name, category, unit, priceKobo, quantity, description] of farm.listings) {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      await prisma.produceListing.upsert({
        where: { slug },
        update: { name, category, unit, priceKobo: BigInt(priceKobo), quantity, description, available: true, isSample: true },
        create: { farmId: row.id, slug, name, category, unit, priceKobo: BigInt(priceKobo), quantity, description, available: true, isSample: true }
      });
      listings += 1;
    }
  }

  const byCategory = await prisma.produceListing.groupBy({ by: ["category"], _count: { _all: true } });
  console.log(JSON.stringify({ farms, listings, countries: Object.keys(byCountry).length, byCountry, categories: CATEGORIES.length, byCategory: Object.fromEntries(byCategory.map((r) => [r.category, r._count._all])) }, null, 1));
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
