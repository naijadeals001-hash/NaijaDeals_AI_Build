import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { listGigCategories, listOpenGigJobs, listGigProfessionals, showSamples } from "@/lib/services/gigs/service";
import { gigsCategoryImage, gigsImage } from "@/lib/services/gigs/images";
import { GigsAppBanner, GigsBottomNav, GigsAudienceBands, GigsBenefits, GigsCategories, GigsFeaturedServices, GigsHero, GigsJobCategories, GigsLatestJobs, GigsStartCard, GigsSteps, GigsStories, GigsTopProfessionals, type JobRow, type ProRow, type ServiceRow, type Story } from "@/components/gigs/gigs-home";
import { GigsHeader, GigsFooter, GigsPageShell, EcosystemBar } from "@/components/gigs/gigs-chrome";
import { getSessionUser, toPublicSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "NaijaGigs — Skills. Jobs. Gigs. Opportunities Across Africa.",
  description: "Africa's all-in-one marketplace for skilled professionals, freelancers, tradespeople and job opportunities. Hire talent or find work across Africa.",
  alternates: { canonical: "/naijagigs" }
};

function ratingOf(ratings: number[]) {
  if (!ratings.length) return { average: null as number | null, count: 0 };
  return { average: Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10, count: ratings.length };
}

export default async function NaijaGigsHomePage() {
  const session = await getSessionUser();
  const user = session ? await toPublicSessionUser(session) : null;

  const [categories, jobsResult, prosResult, services] = await Promise.all([
    listGigCategories(),
    listOpenGigJobs({ page: 1, pageSize: 5 }),
    listGigProfessionals({ page: 1, pageSize: 5 }),
    prisma.serviceListing.findMany({
      // Same visibility rule as the detail page, so a card never links to a 404.
      where: { status: "ACTIVE", professional: { status: "VERIFIED", published: true }, ...(showSamples ? {} : { isSample: false }) },
      orderBy: { createdAt: "desc" },
      take: 4,
      include: { images: { take: 1, orderBy: { sortOrder: "asc" } }, category: { select: { name: true } }, professional: { select: { displayName: true } } }
    })
  ]);

  // Every rating below is computed from PUBLISHED reviews — nothing is invented.
  const proIds = prosResult.items.map((pro) => pro.id);
  const [proReviews, listingReviews, storyReviews] = await Promise.all([
    proIds.length
      ? prisma.serviceReview.findMany({ where: { status: "PUBLISHED", booking: { professionalProfileId: { in: proIds } } }, select: { rating: true, booking: { select: { professionalProfileId: true } } } })
      : Promise.resolve([]),
    services.length
      ? prisma.serviceReview.findMany({ where: { status: "PUBLISHED", booking: { listingId: { in: services.map((s) => s.id) } } }, select: { rating: true, booking: { select: { listingId: true } } } })
      : Promise.resolve([]),
    prisma.serviceReview.findMany({ where: { status: "PUBLISHED", comment: { not: "" } }, orderBy: { createdAt: "desc" }, take: 8, select: { rating: true, comment: true } })
  ]);

  const groupBy = <T,>(rows: T[], key: (row: T) => string, value: (row: T) => number) => {
    const map = new Map<string, number[]>();
    for (const row of rows) map.set(key(row), [...(map.get(key(row)) ?? []), value(row)]);
    return map;
  };
  const proRatings = groupBy(proReviews, (review) => review.booking.professionalProfileId, (review) => review.rating);
  const listingRatings = groupBy(listingReviews, (review) => review.booking.listingId ?? "", (review) => review.rating);

  const categoryLinks = categories.map((category) => ({ slug: category.slug, name: category.name }));
  const jobs: JobRow[] = jobsResult.items.map((job) => ({
    id: job.id,
    title: job.title,
    company: job.customer?.name ?? null,
    city: job.city ?? null,
    countryCode: job.countryCode ?? null,
    mode: String(job.mode ?? "full_time"),
    postedAt: job.createdAt ? new Date(job.createdAt).toISOString() : null
  }));
  const pros: ProRow[] = prosResult.items.map((pro) => {
    const rating = ratingOf(proRatings.get(pro.id) ?? []);
    return { id: pro.id, name: pro.displayName, headline: pro.headline, city: pro.city ?? null, rating: rating.average, reviews: rating.count, verified: pro.status === "VERIFIED" };
  });
  const serviceRows: ServiceRow[] = services.map((service) => {
    const rating = ratingOf(listingRatings.get(service.id) ?? []);
    return {
      id: service.id,
      slug: service.slug,
      title: service.title,
      categoryName: service.category.name,
      professionalName: service.professional.displayName,
      rating: rating.average,
      reviews: rating.count,
      priceKobo: service.priceKobo === null ? null : String(service.priceKobo),
      priceType: service.pricingType,
      imageUrl: service.images[0]?.url ?? null
    };
  });
  const stories: Story[] = storyReviews
    .filter((review) => review.comment && review.comment.trim().length > 20)
    .slice(0, 6)
    .map((review) => ({ quote: review.comment.trim(), name: "Verified NaijaGigs customer", role: "Reviewed a completed booking", rating: review.rating }));

  return (
    <GigsPageShell>
      <GigsHeader user={user} categories={categoryLinks} />
      <main id="main-content" className="mx-auto max-w-[1440px] px-3 pb-6 sm:px-6">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_330px]">
          <GigsHero image={gigsImage("gigs2-hero-collage")} />
          <div className="lg:mt-3"><GigsStartCard categories={categoryLinks} /></div>
        </div>
        <GigsBenefits />
        <GigsCategories categories={categories.map((category) => ({ slug: category.slug, name: category.name, imageUrl: gigsCategoryImage(category.slug) }))} />
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <GigsLatestJobs jobs={jobs} />
          <GigsFeaturedServices services={serviceRows} />
          <GigsTopProfessionals pros={pros} />
        </div>
        <GigsSteps image={gigsImage("gigs2-band-business")} />
        <GigsAudienceBands individuals={gigsImage("gigs2-band-individuals")} government={gigsImage("gigs2-band-government")} />
        <GigsJobCategories />
        {stories.length ? <GigsStories stories={stories} /> : null}
        <GigsAppBanner />
        <EcosystemBar />
      </main>
      <GigsFooter />
      <GigsBottomNav />
    </GigsPageShell>
  );
}
