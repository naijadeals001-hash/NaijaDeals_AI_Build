/**
 * Pan-African city catalogue for Explore Africa (35 cities, five regions).
 *
 * Coordinates the city list, country names and the regional genre vocabulary
 * the platform intends to support. `imageUrl` stays null until an approved
 * city photograph exists: the UI must then say the image is pending rather
 * than show another city's picture. Operator approval happens in the Control
 * Center (`POST /api/admin/stream/cities`).
 *
 * Idempotent. Usage: node prisma/stream-cities-seed.cjs
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const REGION = {
  WEST: "West Africa",
  EAST: "East Africa",
  SOUTH: "Southern Africa",
  CENTRAL: "Central Africa",
  NORTH: "North Africa"
};

const CITIES = [
  // West Africa
  { slug: "lagos", name: "Lagos", cc: "NG", country: "Nigeria", region: REGION.WEST, genres: ["Afrobeats", "Afro-fusion", "Highlife"], featured: true },
  { slug: "abuja", name: "Abuja", cc: "NG", country: "Nigeria", region: REGION.WEST, genres: ["Afrobeats", "Gospel", "Afro-fusion"] },
  { slug: "accra", name: "Accra", cc: "GH", country: "Ghana", region: REGION.WEST, genres: ["Hiplife", "Highlife", "Afrobeats"], featured: true },
  { slug: "kumasi", name: "Kumasi", cc: "GH", country: "Ghana", region: REGION.WEST, genres: ["Highlife", "Hiplife"] },
  { slug: "dakar", name: "Dakar", cc: "SN", country: "Senegal", region: REGION.WEST, genres: ["Mbalax", "Afro-fusion"], featured: true },
  { slug: "abidjan", name: "Abidjan", cc: "CI", country: "Côte d'Ivoire", region: REGION.WEST, genres: ["Coupé-Décalé", "Zouglou"] },
  { slug: "cotonou", name: "Cotonou", cc: "BJ", country: "Benin", region: REGION.WEST, genres: ["Coupé-Décalé", "Afro-fusion"] },
  { slug: "freetown", name: "Freetown", cc: "SL", country: "Sierra Leone", region: REGION.WEST, genres: ["Afropop", "Hip-hop"] },
  { slug: "monrovia", name: "Monrovia", cc: "LR", country: "Liberia", region: REGION.WEST, genres: ["Afropop", "Hip-hop"] },
  // East Africa
  { slug: "nairobi", name: "Nairobi", cc: "KE", country: "Kenya", region: REGION.EAST, genres: ["Bongo Flava", "Gengetone", "Afro-pop"], featured: true },
  { slug: "mombasa", name: "Mombasa", cc: "KE", country: "Kenya", region: REGION.EAST, genres: ["Taarab", "Bongo Flava"] },
  { slug: "kampala", name: "Kampala", cc: "UG", country: "Uganda", region: REGION.EAST, genres: ["Afrobeat", "Kadongo Kamu"] },
  { slug: "kigali", name: "Kigali", cc: "RW", country: "Rwanda", region: REGION.EAST, genres: ["Afro-pop", "Gospel"] },
  { slug: "dar-es-salaam", name: "Dar es Salaam", cc: "TZ", country: "Tanzania", region: REGION.EAST, genres: ["Bongo Flava", "Taarab"], featured: true },
  { slug: "addis-ababa", name: "Addis Ababa", cc: "ET", country: "Ethiopia", region: REGION.EAST, genres: ["Ethio-jazz", "Azmari"] },
  // Southern Africa
  { slug: "johannesburg", name: "Johannesburg", cc: "ZA", country: "South Africa", region: REGION.SOUTH, genres: ["Amapiano", "Afro-house", "Kwaito"], featured: true },
  { slug: "cape-town", name: "Cape Town", cc: "ZA", country: "South Africa", region: REGION.SOUTH, genres: ["Afro-house", "Deep House"] },
  { slug: "durban", name: "Durban", cc: "ZA", country: "South Africa", region: REGION.SOUTH, genres: ["Gqom", "Maskandi"] },
  { slug: "pretoria", name: "Pretoria", cc: "ZA", country: "South Africa", region: REGION.SOUTH, genres: ["Amapiano", "Afro-house"] },
  { slug: "lusaka", name: "Lusaka", cc: "ZM", country: "Zambia", region: REGION.SOUTH, genres: ["Zamrock", "Afropop"] },
  { slug: "harare", name: "Harare", cc: "ZW", country: "Zimbabwe", region: REGION.SOUTH, genres: ["Sungura", "Afropop"] },
  { slug: "gaborone", name: "Gaborone", cc: "BW", country: "Botswana", region: REGION.SOUTH, genres: ["Afro-pop", "House"] },
  { slug: "maputo", name: "Maputo", cc: "MZ", country: "Mozambique", region: REGION.SOUTH, genres: ["Marrabenta", "Afro-house"] },
  // Central Africa
  { slug: "kinshasa", name: "Kinshasa", cc: "CD", country: "DR Congo", region: REGION.CENTRAL, genres: ["Soukous", "Ndombolo", "Rumba"], featured: true },
  { slug: "brazzaville", name: "Brazzaville", cc: "CG", country: "Congo", region: REGION.CENTRAL, genres: ["Soukous", "Rumba"] },
  { slug: "douala", name: "Douala", cc: "CM", country: "Cameroon", region: REGION.CENTRAL, genres: ["Makossa", "Afro-pop"] },
  { slug: "yaounde", name: "Yaoundé", cc: "CM", country: "Cameroon", region: REGION.CENTRAL, genres: ["Makossa", "Bikutsi"] },
  { slug: "libreville", name: "Libreville", cc: "GA", country: "Gabon", region: REGION.CENTRAL, genres: ["Afro-pop", "Rumba"] },
  // North Africa
  { slug: "cairo", name: "Cairo", cc: "EG", country: "Egypt", region: REGION.NORTH, genres: ["Egyptian pop", "Shaabi"], featured: true },
  { slug: "alexandria", name: "Alexandria", cc: "EG", country: "Egypt", region: REGION.NORTH, genres: ["Shaabi", "Egyptian pop"] },
  { slug: "casablanca", name: "Casablanca", cc: "MA", country: "Morocco", region: REGION.NORTH, genres: ["Chaabi", "Gnawa"] },
  { slug: "marrakech", name: "Marrakech", cc: "MA", country: "Morocco", region: REGION.NORTH, genres: ["Gnawa", "Amazigh"] },
  { slug: "rabat", name: "Rabat", cc: "MA", country: "Morocco", region: REGION.NORTH, genres: ["Chaabi", "Amazigh"] },
  { slug: "tunis", name: "Tunis", cc: "TN", country: "Tunisia", region: REGION.NORTH, genres: ["Malouf", "Mezoued"] },
  { slug: "algiers", name: "Algiers", cc: "DZ", country: "Algeria", region: REGION.NORTH, genres: ["Raï", "Andalusi"] }
];

const PODCAST_CATEGORIES = [
  "Business & Entrepreneurship",
  "Technology & Innovation",
  "African History",
  "Culture & Heritage",
  "Music & Entertainment",
  "Sports",
  "Comedy",
  "Education",
  "News & Current Affairs",
  "Lifestyle",
  "African Diaspora",
  "Personal Development"
];

const slugify = (value) => value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

(async () => {
  let cities = 0;
  for (const [index, city] of CITIES.entries()) {
    await prisma.streamCity.upsert({
      where: { slug: city.slug },
      update: { name: city.name, countryCode: city.cc, countryName: city.country, region: city.region, genres: city.genres, featured: Boolean(city.featured), sortOrder: index },
      create: { slug: city.slug, name: city.name, countryCode: city.cc, countryName: city.country, region: city.region, genres: city.genres, featured: Boolean(city.featured), sortOrder: index }
    });
    cities += 1;
  }

  for (const [index, label] of PODCAST_CATEGORIES.entries()) {
    await prisma.streamPodcastCategory.upsert({
      where: { slug: slugify(label) },
      update: { label, sortOrder: index },
      create: { slug: slugify(label), label, sortOrder: index }
    });
  }

  const byRegion = await prisma.streamCity.groupBy({ by: ["region"], _count: { _all: true } });
  console.log(
    JSON.stringify({
      cities,
      podcastCategories: PODCAST_CATEGORIES.length,
      byRegion: Object.fromEntries(byRegion.map((row) => [row.region, row._count._all])),
      withImage: 0
    })
  );
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
