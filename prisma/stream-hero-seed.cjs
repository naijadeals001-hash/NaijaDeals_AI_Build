/**
 * Homepage hero carousel slides using EXISTING approved Kie.ai artwork
 * (no new generation). Every CTA points at a route that exists.
 * Usage: node prisma/stream-hero-seed.cjs
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const SLIDES = [
  { eyebrow: "Featured artist", headline: "AFRICA TO THE", accent: "WORLD", body: "The boldest sounds from Lagos, Accra, Johannesburg and beyond.", imageUrl: "/generated/stream/opt-v2/stream-v2-hero.jpg", primaryLabel: "Listen now", primaryHref: "/naijastream/music", secondaryLabel: "Discover artists", secondaryHref: "/naijastream/artists" },
  { eyebrow: "Every genre", headline: "EVERY BEAT HAS A", accent: "STORY", body: "Afrobeats, Amapiano, Highlife and the new sounds of the continent.", imageUrl: "/generated/stream/opt-v2/stream-v2-cover-afrobeats.jpg", primaryLabel: "Explore music", primaryHref: "/naijastream/music", secondaryLabel: "Explore Africa", secondaryHref: "/naijastream/explore" },
  { eyebrow: "Podcasts", headline: "VOICES WORTH", accent: "HEARING", body: "African creators talking business, culture, technology and faith.", imageUrl: "/generated/stream/opt/stream-cover-podcast.jpg", primaryLabel: "Explore podcasts", primaryHref: "/naijastream/podcasts", secondaryLabel: "Browse all", secondaryHref: "/naijastream/discover" },
  { eyebrow: "Live events", headline: "EXPERIENCE IT", accent: "LIVE", body: "Concerts, listening sessions and creator broadcasts streamed to you.", imageUrl: "/generated/stream/opt/stream-cover-live.jpg", primaryLabel: "Explore live events", primaryHref: "/naijastream/live", secondaryLabel: "See what's on", secondaryHref: "/naijastream/charts" },
  { eyebrow: "Video", headline: "WATCH AFRICA", accent: "CREATE", body: "Music videos, live clips and creator film from across the continent.", imageUrl: "/generated/stream/opt-v2/stream-v2-cover-amapiano.jpg", primaryLabel: "Explore videos", primaryHref: "/naijastream/videos", secondaryLabel: "Discover more", secondaryHref: "/naijastream/discover" },
  { eyebrow: "New talent", headline: "DISCOVER THE NEXT BIG", accent: "SOUND", body: "Independent artists finding their first audiences on NaijaStream.", imageUrl: "/generated/stream/opt-v2/stream-v2-cover-hiphop.jpg", primaryLabel: "Explore creators", primaryHref: "/naijastream/artists", secondaryLabel: "Go Premium", secondaryHref: "/naijastream/premium" }
];

(async () => {
  for (const [index, slide] of SLIDES.entries()) {
    const existing = await prisma.streamHeroSlide.findFirst({ where: { headline: slide.headline } });
    if (existing) {
      await prisma.streamHeroSlide.update({ where: { id: existing.id }, data: { ...slide, sortOrder: index, isActive: true } });
    } else {
      await prisma.streamHeroSlide.create({ data: { ...slide, sortOrder: index, isActive: true } });
    }
  }
  console.log(JSON.stringify({ slides: SLIDES.length, artwork: "existing approved Kie.ai assets", cost: 0 }));
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
