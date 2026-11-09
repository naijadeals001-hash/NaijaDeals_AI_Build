/**
 * NaijaStay demonstration inventory.
 *
 * Every property is `isDemo: true`, its images are `kind: "generated-demo"`, and
 * every rating/review is stored as zero until a real stay is completed — the UI
 * renders "New" rather than inventing reviews. Hosts are clearly demo accounts.
 *
 * Idempotent by slug. Usage: node prisma/naijastay-seed.cjs
 */
const { PrismaClient } = require("@prisma/client");
const { scryptSync, randomBytes } = require("node:crypto");
const prisma = new PrismaClient();
const hash = (pw) => {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${scryptSync(pw, salt, 64).toString("hex")}`;
};

const HOSTS = [
  { email: "demo.stay.lagos@naijastay.demo", name: "Lagos Demo Hosts", bio: "Demonstration host account for NaijaStay." },
  { email: "demo.stay.abuja@naijastay.demo", name: "Abuja Demo Hosts", bio: "Demonstration host account for NaijaStay." }
];

// [slug, title, category, listingType, city, country, nightlyNaira, saleNaira, img, amenities, featured]
const PROPERTIES = [
  ["eko-signature-hotel", "Eko Signature Hotel & Suites", "hotels", "stay", "Lagos", "Nigeria", 95000, null, "stay-demo-hotel", ["WiFi", "Pool", "Restaurant", "Parking", "Air conditioning"], true],
  ["lekki-luxury-apartment", "Lekki Luxury Apartment", "serviced-apartments", "stay", "Lagos", "Nigeria", 150000, null, "stay-demo-apartment", ["WiFi", "Kitchen", "Gym", "24/7 security"], true],
  ["asokoro-private-villa", "Asokoro Private Villa", "short-term-rentals", "stay", "Abuja", "Nigeria", 320000, null, "stay-demo-villa", ["WiFi", "Private pool", "Generator", "Parking", "Chef on request"], true],
  ["cozy-2-bedroom-apartment", "Cozy 2-Bedroom Apartment", "serviced-apartments", "stay", "Port Harcourt", "Nigeria", 70000, null, "stay-demo-cozy", ["WiFi", "Kitchen", "Parking"], true],
  ["residential-land-600sqm", "Residential Land (600 sqm)", "land-and-plots", "land", "Enugu", "Nigeria", 0, 18000000, "stay-demo-land", ["Surveyed", "Fenced"], true],
  ["three-bedroom-duplex", "3-Bedroom Duplex", "houses-for-sale", "sale", "Ibadan", "Nigeria", 0, 85000000, "stay-demo-duplex", ["Fitted kitchen", "Parking", "Borehole"], true]
];

(async () => {
  let hosts = 0;
  let properties = 0;
  for (const host of HOSTS) {
    const user = await prisma.user.upsert({
      where: { email: host.email },
      update: { name: host.name },
      create: { email: host.email, name: host.name, passwordHash: hash("NaijaStayDemo2026!"), actorType: "CUSTOMER" }
    });
    const existing = await prisma.stayHost.findUnique({ where: { ownerId: user.id } });
    if (!existing) {
      await prisma.stayHost.create({ data: { ownerId: user.id, displayName: host.name, bio: host.bio, phone: "08000000000", status: "verified", verifiedAt: new Date() } });
    }
    hosts += 1;
  }

  const hostRows = await prisma.stayHost.findMany({ select: { id: true, owner: { select: { email: true } } } });
  const hostFor = (country) => (country === "Nigeria" && HOSTS.length ? hostRows[0].id : hostRows[0].id);

  for (const [slug, title, category, listingType, city, country, nightly, sale, img, amenities, featured] of PROPERTIES) {
    const property = await prisma.stayProperty.upsert({
      where: { slug },
      update: { title, category, listingType, city, country, nightlyKobo: BigInt(nightly * 100), salePriceKobo: sale ? BigInt(sale * 100) : null, amenities, featured, status: "published", isDemo: true },
      create: {
        slug,
        hostId: hostFor(country),
        title,
        category,
        listingType,
        description: `Demonstration listing for NaijaStay. ${title} in ${city}, ${country}.`,
        city,
        state: null,
        country,
        bedrooms: category === "land-and-plots" ? 0 : category === "houses-for-sale" ? 3 : 2,
        beds: category === "land-and-plots" ? 0 : 3,
        bathrooms: category === "land-and-plots" ? 0 : 2,
        maxGuests: listingType === "stay" ? 4 : 1,
        amenities,
        nightlyKobo: BigInt(nightly * 100),
        salePriceKobo: sale ? BigInt(sale * 100) : null,
        cleaningFeeKobo: BigInt(listingType === "stay" ? 1500000 : 0),
        status: "published",
        isDemo: true,
        featured: Boolean(featured)
      }
    });
    properties += 1;
    const image = await prisma.stayImage.findFirst({ where: { propertyId: property.id, sortOrder: 0 } });
    const url = `/generated/stay/${img}.webp`;
    if (!image) await prisma.stayImage.create({ data: { propertyId: property.id, url, alt: `${title} (demonstration image)`, sortOrder: 0, kind: "generated-demo" } });
    const unit = await prisma.stayUnit.findFirst({ where: { propertyId: property.id } });
    if (!unit) await prisma.stayUnit.create({ data: { propertyId: property.id, name: "Entire place", maxGuests: listingType === "stay" ? 4 : 1, nightlyKobo: BigInt(nightly * 100) } });
  }

  console.log(JSON.stringify({ hosts, properties }));
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
