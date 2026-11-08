import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, MapPin, Star } from "lucide-react";
import { getGigServiceBySlug } from "@/lib/services/gigs/service";
import { getSessionUser } from "@/lib/auth/session";
import { ServiceBookingPanel } from "@/components/gigs/service-detail-client";

export const dynamic = "force-dynamic";

const formatNaira = (kobo: bigint | string) =>
  `₦${new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 }).format(Number(kobo) / 100)}`;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const result = await getGigServiceBySlug(params.slug).catch(() => null);
  if (!result) return { title: "Service not found — NaijaGigs" };
  return { title: `${result.listing.title} — NaijaGigs`, description: result.listing.summary };
}

export default async function ServiceDetailPage({ params }: { params: { slug: string } }) {
  const [result, user] = await Promise.all([getGigServiceBySlug(params.slug), getSessionUser()]);
  if (!result) notFound();
  const { listing, reviews, rating, completedBookings } = result;
  const professional = listing.professional;
  const images = listing.images ?? [];
  const price = listing.priceKobo !== null ? formatNaira(listing.priceKobo) : null;

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 lg:px-10">
      <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 text-[11.5px] text-[#6B7A72]">
        <Link href="/naijagigs" className="hover:text-[#0F7A4A]">NaijaGigs</Link>
        <span aria-hidden>/</span>
        <Link href={`/naijagigs/services?category=${listing.category.slug}`} className="hover:text-[#0F7A4A]">{listing.category.name}</Link>
        <span aria-hidden>/</span>
        <span className="text-[#0B1F16]">{listing.title}</span>
      </nav>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-8">
          <div className="overflow-hidden rounded-2xl border border-[#E5DFD2] bg-white">
            <div className="aspect-[16/9] w-full bg-[#EDE6D8]">
              {images[0]?.url ? (
                <img src={images[0].url} alt={images[0].alt ?? listing.title} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center font-display text-4xl font-extrabold text-[#0F7A4A]">
                  {professional.displayName.charAt(0)}
                </div>
              )}
            </div>
            <div className="p-5 sm:p-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#0F7A4A]">{listing.category.name}</p>
              <h1 className="mt-1 font-display text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-[#0B1F16] sm:text-[30px]">
                {listing.title}
              </h1>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[#6B7A72]">
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" aria-hidden /> {listing.city || listing.state || "Remote"}
                </span>
                <span>{listing.mode === "REMOTE" ? "Remote delivery" : listing.mode === "PROJECT" ? "Project-based" : "In person"}</span>
                {rating.average !== null ? (
                  <span className="flex items-center gap-1 font-bold text-[#0B1F16]">
                    <Star className="h-3.5 w-3.5 fill-[#F0A15D] text-[#F0A15D]" aria-hidden /> {rating.average} ({rating.count} review{rating.count === 1 ? "" : "s"})
                  </span>
                ) : (
                  <span>No reviews yet</span>
                )}
                <span>
                  {completedBookings} completed booking{completedBookings === 1 ? "" : "s"}
                </span>
              </p>
              <p className="mt-4 text-[13.5px] leading-7 text-[#34443A]">{listing.description}</p>
            </div>
          </div>

          <section className="mt-5 rounded-2xl border border-[#E5DFD2] bg-white p-5 sm:p-6">
            <h2 className="font-display text-lg font-extrabold text-[#0B1F16]">About this professional</h2>
            <div className="mt-3 flex items-start gap-4">
              {professional.avatarUrl ? (
                <img src={professional.avatarUrl} alt={professional.displayName} className="h-16 w-16 rounded-2xl object-cover" />
              ) : (
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#DDECE3] font-display text-2xl font-extrabold text-[#0F7A4A]">
                  {professional.displayName.charAt(0)}
                </span>
              )}
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-[14px] font-extrabold text-[#0B1F16]">
                  {professional.displayName}
                  {professional.isSample ? (
                    <span className="rounded-full bg-[#FFF3D6] px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-[#7A5B12]">
                      Demonstration
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#EAF4EE] px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-[#0F7A4A]">
                      <BadgeCheck className="h-3 w-3" aria-hidden /> Verified
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-[12px] text-[#45564C]">{professional.headline}</p>
                <p className="mt-2 text-[12px] leading-6 text-[#6B7A72]">{professional.bio}</p>
                <Link href={`/naijagigs/professionals/${professional.id}`} className="mt-2 inline-block text-[12px] font-bold text-[#0F7A4A] hover:underline">
                  View full profile →
                </Link>
              </div>
            </div>
          </section>

          <section className="mt-5 rounded-2xl border border-[#E5DFD2] bg-white p-5 sm:p-6">
            <h2 className="font-display text-lg font-extrabold text-[#0B1F16]">Reviews</h2>
            {reviews.length === 0 ? (
              <p className="mt-2 text-[12px] text-[#6B7A72]">
                No published reviews yet. Reviews appear only after a completed booking and moderation.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-[#EFE9DC]">
                {reviews.map((review) => (
                  <li key={review.id} className="py-3">
                    <p className="flex items-center gap-2 text-[12px] font-bold text-[#0B1F16]">
                      <Star className="h-3.5 w-3.5 fill-[#F0A15D] text-[#F0A15D]" aria-hidden /> {review.rating}.0
                      <span className="font-medium text-[#6B7A72]">· {review.customer.name}</span>
                    </p>
                    <p className="mt-1 text-[12px] text-[#45564C]">{review.comment}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="lg:col-span-4">
          <div className="lg:sticky lg:top-24">
            <div className="mb-3 rounded-2xl border border-[#E5DFD2] bg-[#FFFDF8] p-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B7A72]">
                {listing.pricingType === "QUOTE" ? "Pricing" : listing.pricingType === "HOURLY" ? "Hourly rate" : "Fixed price"}
              </p>
              <p className="mt-1 font-display text-2xl font-extrabold text-[#0B1F16]">
                {listing.pricingType === "QUOTE" ? "Quote on request" : price ? `From ${price}` : "Quote on request"}
              </p>
            </div>
            <ServiceBookingPanel
              slug={listing.slug}
              listingId={listing.id}
              title={listing.title}
              pricingType={listing.pricingType}
              priceKobo={listing.priceKobo === null ? null : String(listing.priceKobo)}
              mode={listing.mode}
              city={listing.city}
              state={listing.state}
              isSample={Boolean(listing.isSample)}
              signedIn={Boolean(user)}
              professionalProfileId={professional.id}
              professionalName={professional.displayName}
            />
          </div>
        </aside>
      </div>
    </main>
  );
}
