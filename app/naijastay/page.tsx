import type { Metadata } from "next";
import { StayBottomNav, StayHeader } from "@/components/stay/stay-shell";
import { StayAppBanner, StayBenefits, StayFooter, StayPromoBands, StaySearchPanel, StaySolutions, StaySteps, StayRail, PropertyCard, CategoryCards, DestinationCards } from "@/components/stay/stay-home";
import { DESTINATIONS, STAY_CATEGORIES, listFeatured } from "@/lib/services/stay/discovery";
import { categoryImage, stayImage } from "@/lib/services/stay/images";
import { StayHeroCarousel } from "@/components/stay/stay-hero-carousel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "NaijaStay — Africa's Travel & Accommodation Marketplace",
  description: "Find hotels, short stays, long-term rentals, houses, land and real estate across Africa. Book securely with NaijaPay.",
  alternates: { canonical: "/naijastay" }
};

export default async function NaijaStayHomePage() {
  const featured = await listFeatured();
  return (
    <div className="min-h-screen bg-[#f7f9f7] text-[#14241b]">
      <StayHeader />
      <main id="main-content" className="mx-auto max-w-[1440px] px-3 pb-6 sm:px-6">
        <StayHeroCarousel
          slides={[
            { src: stayImage("stay-hero") ?? "", alt: "Couple walking through a tropical resort garden beside an infinity pool", caption: "Resort stays across Africa" },
            { src: stayImage("stay-hero-2") ?? "", alt: "Beach villa with an infinity pool at sunset", caption: "Beachfront villas" },
            { src: stayImage("stay-hero-3") ?? "", alt: "Safari lodge deck overlooking the savannah at dusk", caption: "Safari lodges" },
            { src: stayImage("stay-hero-4") ?? "", alt: "City rooftop apartment terrace with a pool at blue hour", caption: "City apartments" }
          ].filter((s) => s.src)}
        />
        <div className="mt-3"><StaySearchPanel /></div>
        <StayBenefits />
        <CategoryCards categories={STAY_CATEGORIES.map((c) => ({ slug: c.slug, label: c.label, imageUrl: categoryImage(c.slug) }))} />
        {featured.length ? (
          <StayRail title="Featured Properties" href="/naijastay/stays" seeAll="See More Properties" label="Featured properties">
            {featured.map((property) => <PropertyCard key={property.id} property={property} />)}
          </StayRail>
        ) : (
          <p className="mt-5 rounded-2xl bg-white p-4 text-[11.5px] text-[#5d6d64] ring-1 ring-[#eef1ef]">No published properties yet.</p>
        )}
        <DestinationCards destinations={DESTINATIONS.map((d) => ({ slug: d.slug, city: d.city, country: d.country, imageUrl: stayImage(d.image) }))} />
        <StaySteps />
        <StaySolutions />
        <StayPromoBands hostImage={stayImage("stay-band-host")} landImage={stayImage("stay-band-land")} />
        <StayAppBanner />
      </main>
      <StayFooter />
      <StayBottomNav />
    </div>
  );
}
