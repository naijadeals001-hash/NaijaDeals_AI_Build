// NaijaGigs — professional services marketplace landing page
// Fetches real data from Prisma and renders the responsive discovery experience.

import { GigsLanding } from "@/components/gigs/landing";
import { listGigCategories, listGigSpotlights, getGigSiteConfig } from "@/lib/services/gigs/service";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [categories, spotlights, config] = await Promise.all([
    listGigCategories(),
    listGigSpotlights(),
    getGigSiteConfig()
  ]);

  const heroTitle = (config as { heroTitle: string }).heroTitle || "Skilled hands. Brilliant minds. One Africa.";
  const heroSubtitle = (config as { heroSubtitle: string }).heroSubtitle || "Find trusted professionals for every project — at home, at work, and online.";

  return <GigsLanding categories={categories} spotlights={spotlights} heroTitle={heroTitle} heroSubtitle={heroSubtitle} />;
}