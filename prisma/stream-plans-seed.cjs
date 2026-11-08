/**
 * NaijaStream Premium plan catalogue. Prices are placeholders configured by the
 * operator — they are NOT commercially approved rates; review before launch.
 * Usage: node prisma/stream-plans-seed.cjs
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const PLANS = [
  { code: "FREE", name: "Free", description: "Ad-supported listening.", priceKobo: 0n, interval: "MONTH", sortOrder: 0, features: ["Full catalogue", "Playlists & library", "Podcasts"] },
  { code: "BASIC", name: "Basic", description: "Ad-free music.", priceKobo: 150000n, interval: "MONTH", sortOrder: 1, features: ["Ad-free music", "Offline queue", "Standard quality"] },
  { code: "STANDARD", name: "Standard", description: "Better quality, more control.", priceKobo: 250000n, interval: "MONTH", sortOrder: 2, features: ["Ad-free music", "High quality audio", "Skip unlimited", "Podcast bonus episodes"] },
  { code: "PREMIUM", name: "Premium", description: "Everything, yearly.", priceKobo: 2500000n, interval: "YEAR", sortOrder: 3, features: ["All Standard benefits", "Early release access", "Live event priority", "Creator support badge"] }
];

(async () => {
  for (const plan of PLANS) {
    await prisma.streamPlan.upsert({ where: { code: plan.code }, update: { ...plan, isActive: true }, create: { ...plan, isActive: true } });
  }
  console.log(JSON.stringify({ plans: PLANS.length, note: "Price placeholders — operator must approve before live billing." }));
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
