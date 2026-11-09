import type { Metadata } from "next";
import { StayBottomNav, StayHeader } from "@/components/stay/stay-shell";
import { StayAppBanner, StayBenefits, StayFooter, StayPromoBands, StaySearchPanel, StaySolutions, StaySteps, CategoryCards, DestinationCards } from "@/components/stay/stay-home";
import { FeaturedProperties, SuccessStories, type FeaturedItem } from "@/components/stay/featured-properties";
import { StayHeroCarousel } from "@/components/stay/stay-hero-carousel";
import { DESTINATIONS, STAY_CATEGORIES, searchStay } from "@/lib/services/stay/discovery";
import { categoryImage, stayImage } from "@/lib/services/stay/images";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "NaijaStay — Africa's Travel & Accommodation Marketplace",
  description: "Find hotels, short stays, long-term rentals, houses, land and real estate across Africa. Book securely with NaijaPay.",
  alternates: { canonical: "/naijastay" }
};

export default async function NaijaStayHomePage() {
  const listings = await searchStay({ take: 40 });
  const featured: FeaturedItem[] = listings.map((item) => ({
    id: item.id,
    slug: item.slug,
    title: item.title,
    city: item.city,
    country: item.country,
    listingType: item.listingType,
    nightlyKobo: item.nightlyKobo,
    salePriceKobo: item.salePriceKobo,
    imageUrl: item.imageUrl,
    imageKind: item.imageKind,
    isDemo: item.isDemo,
    featured: item.featured,
    stars: item.rating ?? 0,
    reviews: item.reviewCount
  }));

  return (
    <div className="min-h-screen bg-white text-[#14241b]">
      <StayHeader />
      <main id="main-content" className="mx-auto max-w-[1440px] px-3 pb-24 sm:px-6 lg:pb-6">
        <StayHeroCarousel
          slides={[
            { src: stayImage("stay-hero-2") ?? "", alt: "Beach villa with an infinity pool at sunset", caption: "Beachfront villas" },
            { src: stayImage("stay-hero") ?? "", alt: "Couple walking through a tropical resort garden beside an infinity pool", caption: "Resort stays across Africa" },
            { src: stayImage("stay-hero-3") ?? "", alt: "Safari lodge deck overlooking the savannah", caption: "Safari lodges" },
            { src: stayImage("stay-hero-4") ?? "", alt: "City rooftop apartment terrace with a pool", caption: "City apartments" }
          ].filter((slide) => slide.src)}
        />
        <div className="mt-3"><StaySearchPanel /></div>
        <StayBenefits />
        <CategoryCards categories={STAY_CATEGORIES.map((c) => ({ slug: c.slug, label: c.label, imageUrl: categoryImage(c.slug) }))} />
        <FeaturedProperties items={featured} />
        <DestinationCards destinations={DESTINATIONS.map((d) => ({ slug: d.slug, city: d.city, country: d.country, imageUrl: stayImage(d.image) }))} />
        <StaySteps />
        <StaySolutions images={{ "stay-sol-travelers": stayImage("stay-sol-travelers"), "stay-sol-tenants": stayImage("stay-sol-tenants"), "stay-sol-buyers": stayImage("stay-sol-buyers"), "stay-sol-owners": stayImage("stay-sol-owners"), "stay-sol-business": stayImage("stay-sol-business") }} />
        <StayPromoBands hostImage={stayImage("stay-band-host")} landImage={stayImage("stay-band-land")} />
        <SuccessStories />
        <StayAppBanner />
      </main>
      <StayFooter />
      <StayBottomNav />
    </div>
  );
}
