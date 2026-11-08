import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Briefcase,
  CalendarCheck,
  Check,
  ClipboardList,
  FileText,
  Handshake,
  HardHat,
  MapPin,
  MessageSquare,
  Rocket,
  Search,
  ShieldCheck,
  Smartphone,
  Star,
  TrendingUp,
  Users
} from "lucide-react";
import { GigsTrustStrip } from "@/components/gigs/gigs-chrome";
import { categoryIcon } from "@/components/gigs/icons";

type Category = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string;
  accent: string;
  imageUrl: string | null;
};

type Spotlight = {
  id: string;
  title: string;
  blurb: string | null;
  imageUrl: string;
  locationLabel: string | null;
  category: { name: string; slug: string };
};

export type FeaturedListing = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  mode: string;
  pricingType: string;
  priceKobo: string | null;
  city: string | null;
  state: string | null;
  imageUrl: string | null;
  categoryName: string;
  professionalName: string;
};

// Original Kie.ai-generated photography (GPT Image 2, 1K tier) — provenance in
// scripts/image-registry.json. Generated figures are illustrative campaign art,
// never presented as actual platform professionals.
const heroTiles = [
  { src: "/generated/gigs/gigs-hero-electrician.png", alt: "Nigerian electrician in a yellow hard hat and green overalls", className: "col-span-4 row-span-6" },
  { src: "/generated/gigs/gigs-hero-hairdresser.png", alt: "Nigerian hairdresser styling a client's braids", className: "col-span-2 row-span-2" },
  { src: "/generated/gigs/gigs-hero-ac-technician.png", alt: "Technician installing a wall-mounted air conditioner", className: "col-span-2 row-span-2" },
  { src: "/generated/gigs/gigs-hero-photographer.png", alt: "Photographer holding a professional camera", className: "col-span-2 row-span-2" }
];

function kobo(value: string | null) {
  if (!value) return null;
  const amount = Number(value) / 100;
  return `₦${new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 }).format(amount)}`;
}

/**
 * NaijaGigs homepage after the approved design reference. Every section is
 * driven by real records: categories and spotlights from the curated taxonomy,
 * featured services from published, verified professionals only. Sections that
 * need provider content render honest empty states — no fabricated ratings,
 * prices or professionals. Hero collage uses approved original art; Kie.ai
 * photographic assets slot in once generation is authorised and funded.
 */
export function GigsLanding({
  categories,
  spotlights,
  featured,
  heroSubtitle
}: {
  categories: Category[];
  spotlights: Spotlight[];
  featured: FeaturedListing[];
  heroSubtitle: string;
}) {
  const cityLabel = featured[0]?.city ?? "Lagos";

  return (
    <>
      {/* Hero — approved reference composition */}
      <section className="relative overflow-hidden border-b border-[#EFE9DC] bg-[#FFFDF8]">
        <div className="pointer-events-none absolute -left-32 top-10 h-72 w-72 rounded-full bg-[#F4E7CB]/60 blur-3xl" aria-hidden />
        <div className="mx-auto grid max-w-[1440px] items-center gap-8 px-4 pb-10 pt-8 sm:px-6 lg:grid-cols-12 lg:gap-6 lg:px-10 lg:pb-12 lg:pt-4">
          <div className="relative z-10 lg:col-span-5 lg:py-12">
            <p className="inline-flex items-center gap-2 rounded-full border border-[#DCE8DF] bg-[#F2F8F3] px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#0F7A4A]">
              <Briefcase className="h-3.5 w-3.5" aria-hidden />
              Services &amp; local professionals
            </p>
            <h1 className="mt-5 font-display text-[42px] font-extrabold leading-[0.98] tracking-[-0.035em] text-[#0B1F16] sm:text-[56px] xl:text-[64px]">
              Find the right person.
              <br />
              <span className="text-[#0F7A4A]">Get the job done.</span>
            </h1>
            <p className="mt-5 max-w-md text-[14.5px] leading-7 text-[#45564C]">
              Hire trusted professionals, skilled workers, freelancers and local service
              providers across Africa.
            </p>

            <form
              action="/naijagigs/services"
              className="mt-7 flex flex-col gap-2 rounded-2xl border border-[#E5DFD2] bg-white p-2 shadow-[0_18px_45px_rgba(33,55,42,0.08)] sm:flex-row sm:items-center"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
                <Search className="h-4.5 w-4.5 shrink-0 text-[#6B7A72]" aria-hidden />
                <input
                  name="q"
                  aria-label="What service do you need?"
                  placeholder="e.g. Plumber, Electrician, Photographer…"
                  className="h-11 w-full min-w-0 bg-transparent text-[13px] text-[#16241D] outline-none placeholder:text-[#8A978F]"
                />
              </div>
              <div className="flex items-center gap-1 border-[#EEEAE0] px-2 sm:border-l">
                <MapPin className="h-4 w-4 shrink-0 text-[#0F7A4A]" aria-hidden />
                <label htmlFor="gig-location" className="sr-only">Where do you need it?</label>
                <select
                  id="gig-location"
                  name="city"
                  className="h-11 max-w-[150px] bg-transparent text-[12.5px] font-semibold text-[#2C3B33] outline-none"
                  defaultValue=""
                >
                  <option value="">Anywhere</option>
                  <option value="Lagos">Lagos</option>
                  <option value="Abuja">Abuja</option>
                  <option value="Port Harcourt">Port Harcourt</option>
                  <option value="Kano">Kano</option>
                </select>
              </div>
              <button type="submit" className="h-11 shrink-0 rounded-xl bg-[#0F7A4A] px-7 text-[13px] font-bold text-white transition hover:bg-[#0B6540]">
                Search Services
              </button>
            </form>

            <div className="mt-4 flex flex-wrap gap-2.5">
              <Link
                href="/naijagigs/professionals"
                className="inline-flex items-center gap-2 rounded-lg bg-[#0F7A4A] px-5 py-3 text-[12.5px] font-bold text-white shadow-[0_10px_24px_rgba(15,122,74,0.22)] hover:bg-[#0B6540]"
              >
                <Users className="h-4 w-4" aria-hidden /> Hire a Pro
              </Link>
              <Link
                href="/naijagigs/post-job"
                className="inline-flex items-center gap-2 rounded-lg border border-[#F0A15D] bg-[#FFF9F2] px-5 py-3 text-[12.5px] font-bold text-[#D9630B] hover:bg-[#FFF2E3]"
              >
                <ClipboardList className="h-4 w-4" aria-hidden /> Post a Job
              </Link>
            </div>

            <div className="mt-6">
              <GigsTrustStrip />
            </div>
          </div>

          <div className="relative lg:col-span-7">
            <div className="grid h-[280px] grid-cols-6 grid-rows-6 gap-2 overflow-hidden rounded-2xl sm:h-[360px] lg:h-[480px]">
              {heroTiles.map((tile) => (
                <div key={tile.src} className={`relative overflow-hidden rounded-lg bg-[#EDE6D8] ${tile.className}`}>
                  <img src={tile.src} alt={tile.alt} className="h-full w-full object-cover" />
                </div>
              ))}
            </div>
            <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-white/95 px-3 py-2 text-[11px] font-bold text-[#0B3B2A] shadow-lg backdrop-blur">
              <BadgeCheck className="h-4 w-4 text-[#0F7A4A]" aria-hidden />
              Profiles verified before they appear
            </div>
          </div>
        </div>
      </section>

      {/* Category rail — approved reference strip */}
      <section aria-label="Service categories" className="border-b border-[#EFE9DC] bg-white">
        <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 lg:px-10">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 [scrollbar-width:thin]">
            {categories.map((category) => {
              const Icon = categoryIcon(category.icon);
              return (
                <Link
                  key={category.id}
                  href={`/naijagigs/services?category=${category.slug}`}
                  className="group flex w-[92px] shrink-0 flex-col items-center gap-2 rounded-xl border border-transparent px-2 py-3 text-center transition hover:border-[#DCE8DF] hover:bg-[#F2F8F3] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F7A4A]"
                >
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-sm transition group-hover:scale-105"
                    style={{ backgroundColor: category.accent }}
                  >
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="text-[11px] font-bold leading-tight text-[#34443A]">{category.name}</span>
                </Link>
              );
            })}
            <Link
              href="/naijagigs/services"
              className="flex w-[92px] shrink-0 flex-col items-center gap-2 rounded-xl border border-[#DCE8DF] bg-[#F2F8F3] px-2 py-3 text-center text-[11px] font-bold text-[#0F7A4A] transition hover:bg-[#E7F3EB] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F7A4A]"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#9EC4AD]">
                <ArrowRight className="h-5 w-5" aria-hidden />
              </span>
              View All Services
            </Link>
          </div>
        </div>
      </section>

      {/* Featured professionals + Post a Job panel */}
      <section className="mx-auto max-w-[1440px] px-4 py-11 sm:px-6 lg:px-10">
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="flex items-center gap-2 font-display text-[25px] font-extrabold tracking-[-0.02em] text-[#0B1F16] sm:text-[30px]">
                <MapPin className="h-5 w-5 text-[#0F7A4A]" aria-hidden />
                Popular services in {cityLabel}
              </h2>
              <Link href="/naijagigs/services" className="text-[12.5px] font-bold text-[#0F7A4A] hover:text-[#0B6540]">
                View All
              </Link>
            </div>

            {featured.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-[#D8D2C4] bg-[#FAF7F0] p-10 text-center">
                <Users className="mx-auto h-8 w-8 text-[#0F7A4A]" aria-hidden />
                <h3 className="mt-3 font-display text-base font-extrabold text-[#0B1F16]">
                  The first verified professionals are onboarding now
                </h3>
                <p className="mx-auto mt-2 max-w-md text-[12.5px] leading-6 text-[#6B7A72]">
                  Service cards appear here the moment verified professionals publish their services.
                  Profiles are reviewed by our team before they become visible — nothing is listed
                  until it is real.
                </p>
                <Link
                  href="/naijagigs/pro/apply"
                  className="mt-4 inline-block rounded-xl bg-[#0F7A4A] px-5 py-3 text-[12.5px] font-bold text-white transition hover:bg-[#0B6540]"
                >
                  Become a founding professional
                </Link>
              </div>
            ) : (
              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {featured.slice(0, 4).map((listing) => (
                  <div key={listing.id} className="overflow-hidden rounded-xl border border-[#E5DFD2] bg-white shadow-[0_2px_10px_rgba(33,55,42,0.04)] transition hover:shadow-[0_14px_30px_rgba(33,55,42,0.1)]">
                    <div className="relative aspect-[3/2] overflow-hidden bg-[#EDE6D8]">
                      {listing.imageUrl ? (
                        <img src={listing.imageUrl} alt={listing.title} className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-[#F1EADB] font-display text-3xl font-extrabold text-[#0F7A4A]">
                          {listing.professionalName.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="truncate text-[13.5px] font-extrabold text-[#0B1F16]">{listing.title}</h3>
                      <p className="mt-0.5 text-[11px] font-semibold text-[#45564C]">{listing.professionalName}</p>
                      <p className="mt-1 text-[10.5px] text-[#6B7A72]">{listing.categoryName}</p>
                      <p className="mt-2 text-[13px] font-extrabold text-[#0B1F16]">
                        {listing.pricingType === "QUOTE" ? "Quote on request" : `From ${kobo(listing.priceKobo) ?? "—"}`}
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-[10.5px] text-[#6B7A72]">
                        <MapPin className="h-3 w-3" aria-hidden />
                        {listing.city || listing.state || "Remote"}
                      </p>
                      <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#EAF4EE] px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-[#0F7A4A]">
                        <BadgeCheck className="h-3 w-3" aria-hidden /> Verified
                      </span>
                      <Link
                        href={`/naijagigs/services/${listing.slug}`}
                        className="mt-3 block rounded-xl bg-[#0F7A4A] py-2.5 text-center text-[12px] font-bold text-white transition hover:bg-[#0B6540]"
                      >
                        View Profile
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Post a Job panel — approved reference */}
          <div className="min-w-0 lg:col-span-4">
            <div className="grid overflow-hidden rounded-2xl bg-[#0B6540] text-white shadow-[0_18px_45px_rgba(11,101,64,0.25)] sm:grid-cols-2">
              <img
                src="/generated/gigs/gigs-band-post-a-job.png"
                alt="Smiling customer holding a smartphone"
                className="hidden h-full w-full object-cover sm:block"
                loading="lazy"
              />
              <div className="relative p-6 sm:p-7">
                <h2 className="font-display text-2xl font-extrabold">Post a Job</h2>
                <p className="mt-2 text-[12.5px] leading-6 text-white/80">
                  Tell us what you need. Get matched with trusted professionals.
                </p>
                <ul className="mt-4 space-y-2">
                  {["Free to post", "Get multiple quotes", "Compare and choose", "Get the job done"].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-[12px] font-semibold text-white/90">
                      <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-white/15">
                        <Check className="h-3 w-3 text-[#FFC24B]" aria-hidden />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/naijagigs/post-job"
                  className="mt-5 block rounded-xl bg-[#FFC24B] py-3 text-center text-[13px] font-extrabold text-[#3A2B00] transition hover:brightness-105"
                >
                  Post a Job
                </Link>
                <p className="mt-3 text-[10.5px] text-white/60">Quotes arrive in your inbox — you choose who to hire.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Popular services (curated spotlights — real taxonomy content) */}
      <section className="border-y border-[#EFE9DC] bg-[#FFFDF8]">
        <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 lg:px-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-[25px] font-extrabold tracking-[-0.02em] text-[#0B1F16] sm:text-[30px]">
                Popular Services
              </h2>
              <p className="mt-1 text-[12.5px] text-[#6B7A72]">
                Explore what customers hire for most across Nigeria and Africa.
              </p>
            </div>
            <Link
              href="/naijagigs/services"
              className="text-[12.5px] font-bold text-[#0F7A4A] hover:text-[#0B6540]"
            >
              View All
            </Link>
          </div>

          {spotlights.length === 0 ? (
            <div className="mt-5 rounded-xl border border-dashed border-[#D8D2C4] bg-[#FAF7F0] p-8 text-center text-sm text-[#6B7A72]">
              Curated service spotlights are being prepared. Browse the full directory in the meantime.
            </div>
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
              {spotlights.map((spotlight) => (
                <Link
                  key={spotlight.id}
                  href={`/naijagigs/services?category=${spotlight.category.slug}`}
                  className="group overflow-hidden rounded-xl border border-[#E5DFD2] bg-white shadow-[0_2px_10px_rgba(33,55,42,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(33,55,42,0.1)]"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-[#F1EADB]">
                    <img
                      src={spotlight.imageUrl}
                      alt={spotlight.title}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                    <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#0F7A4A]">
                      {spotlight.category.name}
                    </span>
                  </div>
                  <div className="p-3.5">
                    <h3 className="line-clamp-2 min-h-[34px] text-[12.5px] font-extrabold leading-[1.35] text-[#0B1F16]">
                      {spotlight.title}
                    </h3>
                    <p className="mt-2 flex items-center gap-1 text-[10.5px] font-medium text-[#6B7A72]">
                      <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                      {spotlight.locationLabel ?? "Across Nigeria"}
                    </p>
                    <span className="mt-3 flex items-center gap-1 text-[10.5px] font-bold text-[#0F7A4A]">
                      View Service <ArrowRight className="h-3 w-3" aria-hidden />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* How NaijaGigs Works + Hire With Confidence */}
      <section id="how-it-works" className="mx-auto max-w-[1440px] px-4 py-11 sm:px-6 lg:px-10">
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="rounded-2xl border border-[#E8E1D2] bg-[#F4F0E4] p-6 sm:p-8 lg:col-span-8">
            <h2 className="font-display text-[26px] font-extrabold tracking-[-0.02em] text-[#0B1F16]">How NaijaGigs Works</h2>
            <p className="mt-1 text-[12.5px] text-[#5C6A62]">From search to completion, it&apos;s simple.</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-4">
              {[
                { icon: Search, step: "1. Search", copy: "Find the service you need." },
                { icon: ClipboardList, step: "2. Compare", copy: "Review providers, prices, ratings and portfolios." },
                { icon: Handshake, step: "3. Hire", copy: "Book a service or request a custom quote." },
                { icon: BadgeCheck, step: "4. Get It Done", copy: "Communicate, pay securely and review the provider." }
              ].map((item, index) => (
                <div key={item.step} className="relative rounded-xl bg-[#FFFDF8] p-5">
                  <span className="relative inline-flex">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EAF4EE] text-[#0F7A4A]">
                      <item.icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#0F7A4A] text-[10px] font-black text-white">
                      {index + 1}
                    </span>
                  </span>
                  <h3 className="mt-3 text-[13.5px] font-extrabold text-[#0B1F16]">{item.step}</h3>
                  <p className="mt-1.5 text-[11px] leading-5 text-[#5C6A62]">{item.copy}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[#DCE8DF] bg-[#F2F8F3] p-6 sm:p-8 lg:col-span-4">
            <h2 className="flex items-center gap-2 font-display text-[22px] font-extrabold text-[#0B1F16]">
              <ShieldCheck className="h-6 w-6 text-[#0F7A4A]" aria-hidden /> Hire With Confidence
            </h2>
            <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {[
                "Identity verified",
                "Business verified",
                "Skills & certifications",
                "Verified reviews",
                "Secure payments",
                "Provider performance",
                "Dispute support",
                "Transparent pricing"
              ].map((item) => (
                <li key={item} className="flex items-center gap-2 text-[11.5px] font-semibold text-[#34443A]">
                  <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-[#0F7A4A]">
                    <Check className="h-2.5 w-2.5 text-white" aria-hidden />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[10.5px] leading-4 text-[#6B7A72]">
              Verification means an administrator reviewed the profile and documents. Reviews only
              appear after moderation.
            </p>
          </div>
        </div>
      </section>

      {/* Turn Your Skills Into Income — approved provider band */}
      <section className="relative overflow-hidden bg-[#0B6540] text-white">
        {/* Deep-green brand band; Kie.ai tradesman photography slots in once generation is authorised */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          aria-hidden
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 30%, #FFC24B 0, transparent 40%), radial-gradient(circle at 80% 70%, #7EE2A8 0, transparent 45%)"
          }}
        />
        <div className="relative mx-auto grid max-w-[1440px] items-center gap-8 px-4 py-12 sm:px-6 lg:grid-cols-12 lg:px-10 lg:py-14">
          <div className="lg:col-span-8">
            <h2 className="font-display text-[30px] font-extrabold tracking-[-0.02em] sm:text-[38px]">
              Turn Your Skills Into Income
            </h2>
            <p className="mt-3 text-[13.5px] leading-7 text-white/80">
              Join NaijaGigs, showcase your skills, find customers and grow your service business —
              with payments and payouts handled by NaijaPay.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/naijagigs/pro/apply"
                className="rounded-xl bg-[#FFC24B] px-6 py-3.5 text-[13px] font-extrabold text-[#3A2B00] transition hover:brightness-105"
              >
                Become a Provider
              </Link>
              <Link
                href="/naijagigs/pro/dashboard"
                className="rounded-xl border border-white/30 px-6 py-3.5 text-[13px] font-bold text-white transition hover:bg-white/10"
              >
                Provider Dashboard
              </Link>
            </div>
            <ul className="mt-7 flex flex-wrap gap-x-7 gap-y-3">
              {[
                { icon: FileText, label: "Create your profile" },
                { icon: ClipboardList, label: "List your services" },
                { icon: MessageSquare, label: "Get customers" },
                { icon: TrendingUp, label: "Grow your business" }
              ].map((item) => (
                <li key={item.label} className="flex items-center gap-2 text-[12px] font-semibold text-white/90">
                  <item.icon className="h-4 w-4 text-[#FFC24B]" aria-hidden /> {item.label}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative hidden justify-end lg:col-span-4 lg:flex">
            <img
              src="/generated/gigs/gigs-band-become-provider.png"
              alt="Smiling Nigerian tradesman in a work apron"
              className="h-64 w-full max-w-sm rounded-2xl object-cover object-top shadow-[0_18px_45px_rgba(0,0,0,0.3)]"
              loading="lazy"
            />
          </div>
        </div>
      </section>

      {/* Footer proposition band */}
      <section className="border-t border-[#EFE9DC] bg-white">
        <div className="mx-auto grid max-w-[1440px] items-center gap-6 px-4 py-10 sm:px-6 lg:grid-cols-12 lg:px-10">
          <div className="lg:col-span-6">
            <h2 className="font-display text-[24px] font-extrabold tracking-[-0.02em] text-[#0B1F16] sm:text-[28px]">
              Find a skill. Hire a professional. Get the job done.
            </h2>
            <p className="mt-2 text-[12.5px] text-[#6B7A72]">Your skills. Your business. Your next customer.</p>
          </div>
          <div className="flex flex-wrap gap-3 lg:col-span-6 lg:justify-end">
            <Link
              href="/naijagigs/services"
              className="rounded-xl bg-[#0F7A4A] px-6 py-3.5 text-[13px] font-bold text-white transition hover:bg-[#0B6540]"
            >
              Find a Professional
            </Link>
            <Link
              href="/naijagigs/pro/apply"
              className="rounded-xl border border-[#0F7A4A]/40 px-6 py-3.5 text-[13px] font-bold text-[#0F7A4A] transition hover:bg-[#F2F8F3]"
            >
              Become a Provider
            </Link>
            <span className="inline-flex items-center gap-2 self-center rounded-full bg-[#F4F0E4] px-4 py-2 text-[11px] font-bold text-[#5C6A62]">
              <Rocket className="h-3.5 w-3.5 text-[#0F7A4A]" aria-hidden />
              A Stronger, Brighter Africa Together
            </span>
          </div>
        </div>
      </section>
    </>
  );
}
