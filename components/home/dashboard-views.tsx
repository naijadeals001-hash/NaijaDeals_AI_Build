import Link from "next/link";
import type { DesignKey } from "@/lib/home/designs";
import { DESIGNS, VERTICALS, homeImage, type HeroSlide } from "@/lib/home/designs";
import { HeroCarousel } from "@/components/home/hero-carousel";
import { SuperAppHeader } from "@/components/home/super-header";
import { AppBanner, BenefitsStrip, BottomNav, BusinessBands, DealsRail, EcosystemGrid, HomeFooter, HomeSearchBar, HowItWorks, PayPanel, ServiceStrip, type DealItem } from "@/components/home/home-sections";

/** A design's slides: database overrides first, then the code defaults. */
export type SlideOverride = { slug: string; headline: string; body: string; ctaLabel: string; ctaHref: string; secondaryLabel: string | null; secondaryHref: string | null; imageId: string | null; alt: string };

export type DashboardData = {
  deals: DealItem[];
  cartCount: number;
  heroOverrides: SlideOverride[];
};

function resolveSlides(designKey: DesignKey, overrides: SlideOverride[]) {
  const design = DESIGNS[designKey];
  const bySlug = new Map(overrides.map((row) => [row.slug, row]));
  const slides = design.slides.map((slide) => {
    const override = bySlug.get(slide.slug);
    // Alt text and CTA destination are validated by the API; here we prefer the
    // stored values when present so admins control copy without a deploy.
    return {
      slug: slide.slug,
      headline: override?.headline ?? slide.headline,
      body: override?.body ?? slide.body,
      ctaLabel: override?.ctaLabel ?? slide.ctaLabel,
      ctaHref: override?.ctaHref ?? slide.ctaHref,
      secondaryLabel: override ? override.secondaryLabel : slide.secondaryLabel ?? null,
      secondaryHref: override ? override.secondaryHref : slide.secondaryHref ?? null,
      imageUrl: homeImage(override?.imageId ?? slide.imageId),
      alt: override?.alt ?? slide.alt
    };
  });
  // Database-only slides (added by an admin) that are not in code.
  for (const override of overrides) {
    if (design.slides.some((slide) => slide.slug === override.slug)) continue;
    slides.push({ slug: override.slug, headline: override.headline, body: override.body, ctaLabel: override.ctaLabel, ctaHref: override.ctaHref, secondaryLabel: override.secondaryLabel, secondaryHref: override.secondaryHref, imageUrl: homeImage(override.imageId), alt: override.alt });
  }
  return slides;
}

function Badge({ accent, label }: { accent: string; label: string }) {
  return (
    <p className="mt-1 flex items-center gap-1.5 font-display text-[17px] font-extrabold text-white">
      <span className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-black" style={{ backgroundColor: accent, color: "#fff" }}>ND</span>
      {label}
    </p>
  );
}

/** Dashboard 2 — the approved Africa Super-App mockup. */
export async function SuperAppDashboard({ variantKey, data }: { variantKey: string; data: DashboardData }) {
  const design = DESIGNS["africa-super-app"];
  const slides = resolveSlides("africa-super-app", data.heroOverrides);
  return (
    <div className="min-h-screen bg-white text-[#14241b]">
      <SuperAppHeader cartCount={data.cartCount} verticals={VERTICALS} />
      <main id="main-content" className="mx-auto max-w-[1440px] px-3 pb-24 sm:px-6 lg:pb-6">
        <HeroCarousel variantKey={variantKey} slides={slides} badge={<Badge accent="#0b5c33" label="NaijaDeals" />} eyebrow="Our Headquarters · Abuja, FCT & Alayi, Abia State" />
        <ServiceStrip accent={design.accent} />
        <HomeSearchBar accent={design.accent} />
        <BenefitsStrip />
        <EcosystemGrid verticals={VERTICALS} emphasis={design.emphasis} variantKey={variantKey} />
        <PayPanel variantKey={variantKey} />
        <DealsRail deals={data.deals} />
        <HowItWorks variantKey={variantKey} />
        <BusinessBands />
        <AppBanner />
      </main>
      <HomeFooter />
      <BottomNav />
    </div>
  );
}

/** Dashboard 3 — Mobility & Services, Uber/Bolt-quality emphasis. */
export async function MobilityDashboard({ variantKey, data }: { variantKey: string; data: DashboardData }) {
  const design = DESIGNS.mobility;
  const slides = resolveSlides("mobility", data.heroOverrides);
  const primary = VERTICALS.filter((vertical) => design.emphasis.includes(vertical.key));
  return (
    <div className="min-h-screen bg-white text-[#14241b]">
      <SuperAppHeader cartCount={data.cartCount} verticals={VERTICALS} />
      <main id="main-content" className="mx-auto max-w-[1440px] px-3 pb-24 sm:px-6 lg:pb-6">
        <HeroCarousel variantKey={variantKey} slides={slides} overlay="center" points={["Verified drivers", "Upfront fares", "Live tracking"]} eyebrow="Move, send and book in one place" />
        <section aria-labelledby="mobility-quick" className="mt-3">
          <h2 id="mobility-quick" className="sr-only">Book a service</h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {primary.map((vertical) => (
              <li key={vertical.key} data-quick={vertical.key}>
                <Link href={vertical.href} className="flex h-full flex-col items-center rounded-2xl bg-[#f6f8f6] p-3 text-center ring-1 ring-[#e6ebe7] transition hover:bg-white hover:shadow-md">
                  {vertical.image ? <img src={vertical.image} alt="" loading="lazy" className="h-14 w-14 rounded-full object-cover" /> : <span className="h-14 w-14 rounded-full bg-[#e8f3e4]" />}
                  <span className="mt-1.5 text-[12px] font-extrabold">{vertical.name}</span>
                  <span className="text-[9.5px] leading-tight text-[#5d6d64]">{vertical.blurb}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <BenefitsStrip />
        <EcosystemGrid verticals={VERTICALS} emphasis={design.emphasis} variantKey={variantKey} />
        <HowItWorks variantKey={variantKey} />
        <BusinessBands />
        <AppBanner />
      </main>
      <HomeFooter />
      <BottomNav />
    </div>
  );
}

/** Dashboard 4 — Commerce & Lifestyle, rich marketplace emphasis. */
export async function CommerceDashboard({ variantKey, data }: { variantKey: string; data: DashboardData }) {
  const design = DESIGNS.commerce;
  const slides = resolveSlides("commerce", data.heroOverrides);
  return (
    <div className="min-h-screen bg-[#fffdf8] text-[#14241b]">
      <SuperAppHeader cartCount={data.cartCount} verticals={VERTICALS} />
      <main id="main-content" className="mx-auto max-w-[1440px] px-3 pb-24 sm:px-6 lg:pb-6">
        <HeroCarousel variantKey={variantKey} slides={slides} badge={<Badge accent="#c4551a" label="Discover Africa" />} points={["Authentic businesses", "Escrow protection", "African makers & farmers"]} />
        <BenefitsStrip />
        <EcosystemGrid verticals={VERTICALS} emphasis={design.emphasis} variantKey={variantKey} />
        <DealsRail deals={data.deals} />
        <PayPanel variantKey={variantKey} />
        <HowItWorks variantKey={variantKey} />
        <AppBanner />
      </main>
      <HomeFooter />
      <BottomNav />
    </div>
  );
}

export { VERTICALS, type HeroSlide };
