/**
 * NaijaGigs demonstration directory — CLEARLY LABELLED sample profiles.
 *
 * The marketplace has no real professionals yet, so discovery routes would be
 * empty forever. These records are seeded with isSample=true and shown to
 * customers behind an explicit "Demonstration" banner; they cannot be booked,
 * reviewed or paid (enforced in the service layer). Real professionals created
 * through the application flow keep isSample=false.
 *
 * Idempotent: re-running updates the same three accounts in place.
 * Images are original Kie.ai generations (see scripts/image-registry.json).
 *
 * Usage: node prisma/gigs-demo-seed.cjs
 */
const { PrismaClient } = require("@prisma/client");
const { scryptSync, randomBytes } = require("node:crypto");

const prisma = new PrismaClient();
const PASSWORD = "NaijaGigsDemo2026!";

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

const DEMO = [
  {
    key: "demo-electrician",
    email: "demo.electrician@naijagigs.demo",
    name: "Adebayo Ogunlade",
    displayName: "Bright Electric Solutions",
    headline: "Certified electrician — wiring, lighting and solar-ready installations",
    bio: "Demonstration profile. Licensed electrician with 9 years installing distribution boards, lighting runs and inverter backups for homes and small businesses in Lagos.",
    city: "Ikeja",
    state: "Lagos",
    category: "electrical-solar",
    modes: ["LOCAL"],
    years: 9,
    listings: [
      {
        title: "Electrical wiring & lighting setup",
        slug: "demo-electrical-wiring-lighting",
        summary: "Safe wiring, distribution boards and interior lighting for homes and shops.",
        description: "Demonstration listing. Includes load assessment, cabling, distribution board setup and certified testing. Materials quoted separately.",
        pricingType: "FIXED",
        priceKobo: 2000000n,
        image: "/generated/gigs/gigs-spot-wiring.png"
      },
      {
        title: "Solar system installation & maintenance",
        slug: "demo-solar-installation",
        summary: "Design, installation and servicing for homes and small businesses.",
        description: "Demonstration listing. Rooftop solar assessment, panel mounting, inverter configuration and handover training.",
        pricingType: "QUOTE",
        priceKobo: null,
        image: "/generated/gigs/gigs-spot-solar.png"
      }
    ]
  },
  {
    key: "demo-cleaner",
    email: "demo.cleaner@naijagigs.demo",
    name: "Chiamaka Eze",
    displayName: "CleanHome Professionals",
    headline: "Deep cleaning and move-out cleaning for homes and offices",
    bio: "Demonstration profile. A two-person team offering deep cleans, move-out cleans and weekly home care across Lagos Island with eco-friendly supplies.",
    city: "Victoria Island",
    state: "Lagos",
    category: "cleaning-services",
    modes: ["LOCAL"],
    years: 6,
    listings: [
      {
        title: "Home deep cleaning",
        slug: "demo-home-deep-cleaning",
        summary: "Room-by-room deep clean including kitchen, bathrooms and floors.",
        description: "Demonstration listing. Pricing shown is for a standard two-bedroom home; larger homes are quoted on inspection.",
        pricingType: "FIXED",
        priceKobo: 2500000n,
        image: "/generated/gigs/gigs-card-deep-cleaning.png"
      }
    ]
  },
  {
    key: "demo-photographer",
    email: "demo.photographer@naijagigs.demo",
    name: "Tunde Bakare",
    displayName: "Tunde Photography",
    headline: "Weddings, events and brand photography — Lagos & beyond",
    bio: "Demonstration profile. Event and wedding photographer covering Lagos, Ibadan and Abuja with a second shooter and same-week delivery for highlights.",
    city: "Lekki",
    state: "Lagos",
    category: "design-creative",
    modes: ["LOCAL", "PROJECT"],
    years: 11,
    listings: [
      {
        title: "Wedding photography",
        slug: "demo-wedding-photography",
        summary: "Full-day coverage, second shooter and edited album.",
        description: "Demonstration listing. Traditional wedding day coverage with highlight gallery delivered within seven days.",
        pricingType: "FIXED",
        priceKobo: 15000000n,
        image: "/generated/gigs/gigs-card-wedding-photography.png"
      }
    ]
  }
];

(async () => {
  const passwordHash = hashPassword(PASSWORD);
  const summary = [];
  for (const demo of DEMO) {
    const user = await prisma.user.upsert({
      where: { email: demo.email },
      update: { name: demo.name, passwordHash },
      create: { email: demo.email, name: demo.name, passwordHash, phone: null, actorType: "CUSTOMER" }
    });
    const category = await prisma.serviceCategory.findUniqueOrThrow({ where: { slug: demo.category } });
    const profile = await prisma.professionalProfile.upsert({
      where: { userId: user.id },
      update: {
        displayName: demo.displayName,
        headline: demo.headline,
        bio: demo.bio,
        city: demo.city,
        state: demo.state,
        serviceModes: demo.modes,
        yearsExperience: demo.years,
        status: "VERIFIED",
        verifiedAt: new Date(),
        published: true,
        isSample: true
      },
      create: {
        userId: user.id,
        displayName: demo.displayName,
        headline: demo.headline,
        bio: demo.bio,
        city: demo.city,
        state: demo.state,
        countryCode: "NG",
        serviceModes: demo.modes,
        languages: ["English"],
        yearsExperience: demo.years,
        status: "VERIFIED",
        verifiedAt: new Date(),
        published: true,
        isSample: true
      }
    });
    await prisma.professionalCategory.deleteMany({ where: { professionalId: profile.id } });
    await prisma.professionalCategory.create({ data: { professionalId: profile.id, categoryId: category.id } });

    for (const listing of demo.listings) {
      const row = await prisma.serviceListing.upsert({
        where: { slug: listing.slug },
        update: {
          title: listing.title,
          summary: listing.summary,
          description: listing.description,
          pricingType: listing.pricingType,
          priceKobo: listing.priceKobo,
          status: "ACTIVE",
          isSample: true
        },
        create: {
          professionalId: profile.id,
          categoryId: category.id,
          title: listing.title,
          slug: listing.slug,
          summary: listing.summary,
          description: listing.description,
          mode: "LOCAL",
          pricingType: listing.pricingType,
          priceKobo: listing.priceKobo,
          countryCode: "NG",
          state: demo.state,
          city: demo.city,
          status: "ACTIVE",
          isSample: true
        }
      });
      await prisma.serviceListingImage.deleteMany({ where: { listingId: row.id } });
      await prisma.serviceListingImage.create({ data: { listingId: row.id, url: listing.image, alt: listing.title, sortOrder: 0 } });
    }
    summary.push({ profile: demo.displayName, listings: demo.listings.length });
  }
  console.log(JSON.stringify({ seeded: summary, password: "NaijaGigsDemo2026! (documented in docs/handoff.md)" }, null, 1));
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
