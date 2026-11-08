import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, CalendarCheck, MapPin, Star } from "lucide-react";
import { getGigProfessional } from "@/lib/services/gigs/service";

export const dynamic = "force-dynamic";

const formatNaira = (kobo: bigint | string) =>
  `₦${new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 }).format(Number(kobo) / 100)}`;

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const result = await getGigProfessional(params.id).catch(() => null);
  if (!result) return { title: "Professional not found — NaijaGigs" };
  return { title: `${result.profile.displayName} — NaijaGigs`, description: result.profile.headline };
}

const MODE_LABEL: Record<string, string> = { LOCAL: "Local (in person)", REMOTE: "Remote", PROJECT: "Project based" };
const DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function ProfessionalProfilePage({ params }: { params: { id: string } }) {
  const result = await getGigProfessional(params.id);
  if (!result) notFound();
  const { profile, reviews, rating, completedBookings } = result;
  const listings = profile.listings ?? [];
  const isSample = Boolean((profile as { isSample?: boolean }).isSample);

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 lg:px-10">
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 text-[11.5px] text-[#6B7A72]">
        <Link href="/naijagigs" className="hover:text-[#0F7A4A]">NaijaGigs</Link>
        <span aria-hidden>/</span>
        <Link href="/naijagigs/professionals" className="hover:text-[#0F7A4A]">Professionals</Link>
        <span aria-hidden>/</span>
        <span className="text-[#0B1F16]">{profile.displayName}</span>
      </nav>

      <section className="overflow-hidden rounded-2xl border border-[#E5DFD2] bg-white">
        <div className="relative bg-[#0B6540] px-5 py-6 sm:px-7">
          <div className="flex flex-wrap items-start gap-4">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt={profile.displayName} className="h-20 w-20 rounded-2xl object-cover ring-4 ring-white/20" />
            ) : (
              <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/15 font-display text-3xl font-extrabold text-white">
                {profile.displayName.charAt(0)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-[26px] font-extrabold leading-tight text-white sm:text-[30px]">{profile.displayName}</h1>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                    isSample ? "bg-[#FFC24B] text-[#3A2B00]" : "bg-white/15 text-white"
                  }`}
                >
                  {isSample ? "Demonstration profile" : <><BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Verified</>}
                </span>
              </div>
              <p className="mt-1 text-[13px] text-white/85">{profile.headline}</p>
              <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-white/70">
                <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden /> {profile.city}, {profile.state}</span>
                <span>{profile.yearsExperience ? `${profile.yearsExperience} yrs experience` : "New professional"}</span>
                {rating.average !== null ? (
                  <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-[#FFC24B] text-[#FFC24B]" aria-hidden /> {rating.average} ({rating.count})</span>
                ) : null}
                <span>{completedBookings} completed booking{completedBookings === 1 ? "" : "s"}</span>
              </p>
            </div>
            {listings[0] ? (
              <Link
                href={`/naijagigs/services/${listings[0].slug}`}
                className="rounded-xl bg-[#FFC24B] px-5 py-3 text-[12.5px] font-extrabold text-[#3A2B00] transition hover:brightness-105"
              >
                {isSample ? "Preview a service" : "Book a service"}
              </Link>
            ) : null}
          </div>
        </div>

        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <h2 className="font-display text-lg font-extrabold text-[#0B1F16]">About</h2>
            <p className="mt-2 text-[13px] leading-7 text-[#34443A]">{profile.bio}</p>

            <h2 className="mt-6 font-display text-lg font-extrabold text-[#0B1F16]">Services</h2>
            {listings.length === 0 ? (
              <p className="mt-2 text-[12px] text-[#6B7A72]">No services published yet. Message this professional to discuss your job.</p>
            ) : (
              <ul className="mt-3 divide-y divide-[#EFE9DC]">
                {listings.map((listing) => (
                  <li key={listing.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-extrabold text-[#0B1F16]">{listing.title}</p>
                      <p className="text-[11px] text-[#6B7A72]">{listing.summary}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[12px] font-bold text-[#0B1F16]">
                        {listing.pricingType === "QUOTE" || listing.priceKobo === null ? "Quote" : `From ${formatNaira(listing.priceKobo)}`}
                      </span>
                      <Link href={`/naijagigs/services/${listing.slug}`} className="rounded-lg border border-[#0F7A4A]/40 px-3 py-1.5 text-[11.5px] font-bold text-[#0F7A4A] hover:bg-[#F2F8F3]">
                        View
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <h2 className="mt-6 font-display text-lg font-extrabold text-[#0B1F16]">Reviews</h2>
            {reviews.length === 0 ? (
              <p className="mt-2 text-[12px] text-[#6B7A72]">No published reviews yet.</p>
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
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-[#E5DFD2] bg-[#FFFDF8] p-4">
              <h2 className="text-[11px] font-bold uppercase tracking-wide text-[#6B7A72]">Works</h2>
              <p className="mt-1 text-[12.5px] font-semibold text-[#0B1F16]">
                {(profile.serviceModes ?? []).map((mode) => MODE_LABEL[mode] ?? mode).join(" · ")}
              </p>
              <h2 className="mt-4 text-[11px] font-bold uppercase tracking-wide text-[#6B7A72]">Categories</h2>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {(profile.categories ?? []).map((entry) => (
                  <Link
                    key={entry.category.id}
                    href={`/naijagigs/services?category=${entry.category.slug}`}
                    className="rounded-full bg-[#EAF4EE] px-2.5 py-1 text-[10.5px] font-bold text-[#0F7A4A]"
                  >
                    {entry.category.name}
                  </Link>
                ))}
              </div>
              <h2 className="mt-4 text-[11px] font-bold uppercase tracking-wide text-[#6B7A72]">Languages</h2>
              <p className="mt-1 text-[12px] text-[#34443A]">{(profile.languages ?? []).join(", ") || "English"}</p>
            </div>

            {profile.availability && profile.availability.length > 0 ? (
              <div className="rounded-2xl border border-[#E5DFD2] bg-white p-4">
                <h2 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#6B7A72]">
                  <CalendarCheck className="h-3.5 w-3.5 text-[#0F7A4A]" aria-hidden /> Availability
                </h2>
                <ul className="mt-2 space-y-1 text-[11.5px] text-[#34443A]">
                  {profile.availability.map((slot, index) => (
                    <li key={index}>
                      {DAY[slot.weekday]}: {String(Math.floor(slot.startMinute / 60)).padStart(2, "0")}:
                      {String(slot.startMinute % 60).padStart(2, "0")} – {String(Math.floor(slot.endMinute / 60)).padStart(2, "0")}:
                      {String(slot.endMinute % 60).padStart(2, "0")}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="rounded-2xl border border-[#E5DFD2] bg-white p-4">
              <h2 className="text-[11px] font-bold uppercase tracking-wide text-[#6B7A72]">Safety</h2>
              <p className="mt-1 text-[11.5px] leading-5 text-[#6B7A72]">
                {isSample
                  ? "Demonstration profile: illustrative only and not bookable. Real profiles show verification status after our team reviews documents."
                  : "Verification means our team reviewed this profile and its documents. If something goes wrong, open a dispute from the booking page."}
              </p>
              <Link href="/help" className="mt-2 inline-block text-[11.5px] font-bold text-[#0F7A4A] hover:underline">
                Report a problem
              </Link>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
