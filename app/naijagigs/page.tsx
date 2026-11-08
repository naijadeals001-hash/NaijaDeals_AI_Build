// NaijaGigs — professional services marketplace landing page
// Fetches real data from Prisma and renders the responsive discovery experience.

import { GigsLanding, type FeaturedListing } from "@/components/gigs/landing";
import { listGigCategories, listGigSpotlights, getGigSiteConfig, searchGigServices } from "@/lib/services/gigs/service";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [categories, spotlights, config, servicesResult] = await Promise.all([
    listGigCategories(),
    listGigSpotlights(),
    getGigSiteConfig(),
    searchGigServices({ q: undefined, category: undefined, mode: undefined, countryCode: undefined, city: undefined, sort: "recent", page: 1, pageSize: 4 })
  ]);

  const heroTitle = (config as { heroTitle: string }).heroTitle || "Skilled hands. Brilliant minds. One Africa.";
  const heroSubtitle = (config as { heroSubtitle: string }).heroSubtitle || "Find trusted professionals for every project — at home, at work, and online.";

  // Published services from VERIFIED professionals only (enforced by the search
  // filter); mapped to the homepage's featured-professional cards. With no real
  // listings yet the section renders its honest onboarding empty state.
  const featured: FeaturedListing[] = (servicesResult.items ?? []).map((listing) => ({
    id: listing.id,
    slug: listing.slug,
    title: listing.title,
    summary: listing.summary ?? null,
    mode: listing.mode,
    pricingType: listing.pricingType,
    priceKobo: listing.priceKobo === null ? null : String(listing.priceKobo),
    city: listing.city ?? null,
    state: listing.state ?? null,
    imageUrl: listing.images?.[0]?.url ?? null,
    categoryName: listing.category?.name ?? "",
    professionalName: listing.professional?.displayName ?? ""
  }));

  return <GigsLanding categories={categories} spotlights={spotlights} featured={featured} heroSubtitle={heroSubtitle} />;
}