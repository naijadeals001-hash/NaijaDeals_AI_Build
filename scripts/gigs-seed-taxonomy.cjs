/**
 * Idempotent NaijaGigs taxonomy seed: service categories, landing spotlights
 * and site config only. Never touches accounts, listings, bookings or money.
 * Safe to re-run (upserts by slug/id).
 *
 * Usage: node scripts/gigs-seed-taxonomy.cjs
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const gigCategories = [
  { slug: "home-repairs", name: "Home Repairs", description: "Plumbing, carpentry, appliance repair and everyday fixes.", icon: "Hammer", accent: "#F97316", imageUrl: "/gigs/categories/home-repairs.svg" },
  { slug: "electrical-solar", name: "Electrical & Solar", description: "Wiring, lighting, inverters and solar installations.", icon: "Zap", accent: "#16A34A", imageUrl: "/gigs/categories/electrical-solar.svg" },
  { slug: "cleaning-services", name: "Cleaning Services", description: "Deep cleaning, move-out cleaning and routine home care.", icon: "Sparkles", accent: "#0D9488", imageUrl: "/gigs/categories/cleaning-services.svg" },
  { slug: "building-renovation", name: "Building & Renovation", description: "Masonry, tiling, painting and renovation projects.", icon: "Building2", accent: "#D97706", imageUrl: "/gigs/categories/building-renovation.svg" },
  { slug: "design-creative", name: "Design & Creative", description: "Brand identity, illustration, photography and interiors.", icon: "Palette", accent: "#7C3AED", imageUrl: "/gigs/categories/design-creative.svg" },
  { slug: "tech-digital", name: "Tech & Digital", description: "Websites, apps, data, IT support and digital marketing.", icon: "Laptop", accent: "#2563EB", imageUrl: "/gigs/categories/tech-digital.svg" },
  { slug: "beauty-wellness", name: "Beauty & Wellness", description: "Hair, makeup, personal training and wellness services.", icon: "Heart", accent: "#DB2777", imageUrl: "/gigs/categories/beauty-wellness.svg" },
  { slug: "events-catering", name: "Events & Catering", description: "Catering, event planning, decor and entertainment.", icon: "PartyPopper", accent: "#EA580C", imageUrl: "/gigs/categories/events-catering.svg" }
];

const spotlights = [
  { category: "electrical-solar", title: "Solar System Installation & Maintenance", blurb: "Design, installation and servicing for homes and small businesses.", imageUrl: "/gigs/services/solar.svg", locationLabel: "Abuja, Nigeria" },
  { category: "electrical-solar", title: "Electrical Wiring & Lighting Setup", blurb: "Safe wiring, distribution boards and interior lighting.", imageUrl: "/gigs/services/electrical.svg", locationLabel: "Abuja, Nigeria" },
  { category: "building-renovation", title: "Home Painting (Interior & Exterior)", blurb: "Surface preparation, priming and a durable finish.", imageUrl: "/gigs/services/painting.svg", locationLabel: "Abuja, Nigeria" },
  { category: "tech-digital", title: "Website Design & Development", blurb: "Responsive business sites, storefronts and landing pages.", imageUrl: "/gigs/services/website.svg", locationLabel: "Remote / Nigeria" },
  { category: "design-creative", title: "Video Production & Editing", blurb: "Product films, event coverage and social edits.", imageUrl: "/gigs/services/video.svg", locationLabel: "Abuja, Nigeria" },
  { category: "events-catering", title: "Catering Services (Events & Meetings)", blurb: "Menus and service teams for meetings and celebrations.", imageUrl: "/gigs/services/catering.svg", locationLabel: "Abuja, Nigeria" }
];

(async () => {
  const categoryBySlug = {};
  for (const [index, category] of gigCategories.entries()) {
    categoryBySlug[category.slug] = await prisma.serviceCategory.upsert({
      where: { slug: category.slug },
      update: { ...category, sortOrder: index, isActive: true },
      create: { ...category, sortOrder: index, isActive: true }
    });
  }

  // Spotlights are curated rows without a natural key; rebuild them deterministically.
  await prisma.serviceSpotlight.deleteMany({});
  for (const [index, spotlight] of spotlights.entries()) {
    await prisma.serviceSpotlight.create({
      data: {
        categoryId: categoryBySlug[spotlight.category].id,
        title: spotlight.title,
        blurb: spotlight.blurb,
        imageUrl: spotlight.imageUrl,
        locationLabel: spotlight.locationLabel,
        sortOrder: index,
        isActive: true
      }
    });
  }

  await prisma.gigSiteConfig.upsert({
    where: { id: "default" },
    update: {
      heroTitle: "Skilled hands. Brilliant minds. One Africa.",
      heroSubtitle: "Find trusted professionals for every project — at home, at work, and online.",
      heroImageUrl: "/gigs/hero-collage.svg"
    },
    create: {
      id: "default",
      heroTitle: "Skilled hands. Brilliant minds. One Africa.",
      heroSubtitle: "Find trusted professionals for every project — at home, at work, and online.",
      heroImageUrl: "/gigs/hero-collage.svg"
    }
  });

  console.log(JSON.stringify({ seeded: { categories: gigCategories.length, spotlights: spotlights.length, siteConfig: true } }));
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
