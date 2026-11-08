import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  HardHat,
  MapPin,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
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

const heroTiles = [
  { src: "/gigs/categories/electrical-solar.svg", alt: "Solar technician installing a panel", className: "col-span-4 row-span-4" },
  { src: "/gigs/categories/tech-digital.svg", alt: "Developer working on a laptop", className: "col-span-2 row-span-2" },
  { src: "/gigs/categories/design-creative.svg", alt: "Designer working with colour swatches", className: "col-span-2 row-span-2" },
  { src: "/gigs/categories/home-repairs.svg", alt: "Home repairs professional using a drill", className: "col-span-2 row-span-2" },
  { src: "/gigs/categories/cleaning-services.svg", alt: "Cleaning professional at work", className: "col-span-2 row-span-2" },
  { src: "/gigs/categories/events-catering.svg", alt: "Caterer preparing event food", className: "col-span-2 row-span-2" }
];

export function GigsLanding({
  categories,
  spotlights,
  heroTitle,
  heroSubtitle
}: {
  categories: Category[];
  spotlights: Spotlight[];
  heroTitle: string;
  heroSubtitle: string;
}) {
  return (
    <>
      <section className="relative overflow-hidden border-b border-[#EFE9DC] bg-[#FFFDF8]">
        <div className="pointer-events-none absolute -left-32 top-10 h-72 w-72 rounded-full bg-[#F4E7CB]/60 blur-3xl" aria-hidden />
        <div className="mx-auto grid max-w-[1440px] items-center gap-8 px-4 pb-10 pt-8 sm:px-6 lg:grid-cols-12 lg:gap-6 lg:px-10 lg:pb-12 lg:pt-4">
          <div className="relative z-10 lg:col-span-5 lg:py-12">
            <p className="inline-flex items-center gap-2 rounded-full border border-[#DCE8DF] bg-[#F2F8F3] px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#0F7A4A]">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Africa&apos;s services marketplace
            </p>
            <h1 className="mt-5 font-display text-[42px] font-extrabold leading-[0.98] tracking-[-0.035em] text-[#0B1F16] sm:text-[56px] xl:text-[66px]">
              Skilled hands.
              <br />
              Brilliant minds.
              <br />
              <span className="text-[#0F7A4A]">One Africa.</span>
            </h1>
            <p className="mt-5 max-w-md text-[14.5px] leading-7 text-[#45564C]">{heroSubtitle || heroTitle}</p>

            <form
              action="/naijagigs/services"
              className="mt-7 flex flex-col gap-2 rounded-2xl border border-[#E5DFD2] bg-white p-2 shadow-[0_18px_45px_rgba(33,55,42,0.08)] sm:flex-row sm:items-center"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
                <Search className="h-4.5 w-4.5 shrink-0 text-[#6B7A72]" aria-hidden />
                <input
                  name="q"
                  aria-label="What service do you need?"
                  placeholder="What service do you need?"
                  className="h-11 w-full min-w-0 bg-transparent text-[13px] text-[#16241D] outline-none placeholder:text-[#8A978F]"
                />
              </div>
              <div className="flex items-center gap-1 border-[#EEEAE0] px-2 sm:border-l">
                <MapPin className="h-4 w-4 shrink-0 text-[#0F7A4A]" aria-hidden />
                <label htmlFor="gig-location" className="sr-only">Location</label>
                <select
                  id="gig-location"
                  name="city"
                  className="h-11 max-w-[150px] bg-transparent text-[12.5px] font-semibold text-[#2C3B33] outline-none"
                  defaultValue=""
                >
                  <option value="">Abuja, Nigeria</option>
                  <option value="Lagos">Lagos</option>
                  <option value="Abuja">Abuja</option>
                  <option value="Port Harcourt">Port Harcourt</option>
                  <option value="Kano">Kano</option>
                </select>
              </div>
              <button type="submit" className="h-11 shrink-0 rounded-xl bg-[#0F7A4A] px-7 text-[13px] font-bold text-white transition hover:bg-[#0B6540]">
                Search
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
                href="/naijagigs/pro/apply"
                className="inline-flex items-center gap-2 rounded-lg border border-[#F0A15D] bg-[#FFF9F2] px-5 py-3 text-[12.5px] font-bold text-[#D9630B] hover:bg-[#FFF2E3]"
              >
                <HardHat className="h-4 w-4" aria-hidden /> Offer Your Skills
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

      <section className="mx-auto max-w-[1440px] px-4 py-11 sm:px-6 lg:px-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-[25px] font-extrabold tracking-[-0.02em] text-[#0B1F16] sm:text-[30px]">
              Popular Service Categories
            </h2>
            <p className="mt-1 text-[12.5px] text-[#6B7A72]">Eight ways to get things done, at home, at work and online.</p>
          </div>
          <Link href="/naijagigs/services" className="inline-flex items-center gap-1 text-[12.5px] font-bold text-[#0F7A4A] hover:text-[#0B6540]">
            View All Categories <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {categories.map((category) => {
            const Icon = categoryIcon(category.icon);
            return (
              <Link
                key={category.id}
                href={`/naijagigs/services?category=${category.slug}`}
                className="group relative aspect-[0.86] overflow-hidden rounded-xl bg-[#E7E0D2] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F7A4A] focus-visible:ring-offset-2"
              >
                <img
                  src={category.imageUrl ?? "/gigs/categories/home-repairs.svg"}
                  alt={`${category.name} services`}
                  className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#071A12]/80 via-[#071A12]/10 to-transparent" />
                <span
                  className="absolute bottom-11 left-3 flex h-8 w-8 items-center justify-center rounded-full text-white shadow-md"
                  style={{ backgroundColor: category.accent }}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="absolute inset-x-3 bottom-3 text-[12.5px] font-extrabold leading-tight text-white">
                  {category.name}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="border-y border-[#EFE9DC] bg-[#FFFDF8]">
        <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 lg:px-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-[25px] font-extrabold tracking-[-0.02em] text-[#0B1F16] sm:text-[30px]">
                Explore services for every need
              </h2>
              <p className="mt-1 text-[12.5px] text-[#6B7A72]">
                Hire trusted professionals or browse ready-to-order services from skilled experts across Nigeria and Africa.
              </p>
            </div>
            <Link
              href="/naijagigs/services"
              className="inline-flex items-center gap-1 rounded-lg border border-[#9EC4AD] px-4 py-2.5 text-[12px] font-bold text-[#0F7A4A] hover:bg-[#F2F8F3]"
            >
              Browse All Services <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>

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
          {spotlights.length === 0 && (
            <div className="mt-5 rounded-xl border border-dashed border-[#D8D2C4] bg-[#FAF7F0] p-8 text-center text-sm text-[#6B7A72]">
              Curated service spotlights are being prepared. Browse the full directory or post a job to get matched with a
              verified professional.
            </div>
          )}
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-[1440px] px-4 py-11 sm:px-6 lg:px-10">
        <div className="grid gap-6 rounded-2xl border border-[#E8E1D2] bg-[#F4F0E4] p-6 sm:p-8 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-3">
            <h2 className="font-display text-[26px] font-extrabold tracking-[-0.02em] text-[#0B1F16]">How NaijaGigs Works</h2>
            <p className="mt-2 text-[12.5px] leading-6 text-[#5C6A62]">Get things done or grow your business in three simple steps.</p>
            <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[10.5px] font-bold text-[#0F7A4A]">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Escrow-protected bookings
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:col-span-9">
            {[
              { icon: Search, step: "1. Find a service", copy: "Search or browse from hundreds of services." },
              { icon: Users, step: "2. Compare professionals", copy: "Review profiles, work samples and service details." },
              { icon: CalendarCheck, step: "3. Book with confidence", copy: "Agree on the service, schedule the work and get it done." }
            ].map((item, index) => (
              <div key={item.step} className="relative rounded-xl bg-[#FFFDF8] p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F97316] text-white">
                  <item.icon className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-3 text-[14px] font-extrabold text-[#0B1F16]">{item.step}</h3>
                <p className="mt-1.5 text-[11.5px] leading-5 text-[#5C6A62]">{item.copy}</p>
                {index < 2 && (
                  <span className="absolute -right-2 top-1/2 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-[#F4F0E4] text-[#A9A08D] sm:flex" aria-hidden>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-[#EFE9DC] bg-[#FFFDF8]">
        <div className="mx-auto grid max-w-[1440px] gap-8 px-4 py-12 sm:px-6 lg:grid-cols-12 lg:items-center lg:px-10">
          <div className="lg:col-span-4">
            <h2 className="font-display text-[27px] font-extrabold leading-tight tracking-[-0.02em] text-[#0B1F16]">
              A safer, more reliable services marketplace
            </h2>
            <ul className="mt-5 space-y-3">
              {[
                "Verified professional profiles",
                "Secure communication & bookings",
                "Dispute support and resolution",
                "Part of the NaijaDeals super-ecosystem"
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-[12.5px] font-semibold text-[#34443A]">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0F7A4A] text-white">
                    <BadgeCheck className="h-3 w-3" aria-hidden />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-5 max-w-sm text-[11.5px] leading-5 text-[#6B7A72]">
              Verification means an administrator reviewed the profile and documents. It is not a guarantee of any
              particular outcome; reviews only appear after moderation.
            </p>
          </div>

          <div className="flex justify-center lg:col-span-4">
            <div className="relative w-[220px] rounded-[34px] border-[8px] border-[#0B3B2A] bg-[#0B3B2A] shadow-[0_26px_60px_rgba(11,59,42,0.25)]">
              <div className="absolute left-1/2 top-2 z-10 h-4 w-20 -translate-x-1/2 rounded-full bg-[#0B3B2A]" />
              <div className="relative overflow-hidden rounded-[26px] bg-[#FFFDF8]">
                <div className="bg-[#0B3B2A] px-4 pb-4 pt-6 text-white">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10">
                      <HardHat className="h-4 w-4 text-[#FFC24B]" aria-hidden />
                    </span>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/50">NaijaDeals</p>
                      <p className="text-[13px] font-extrabold">NaijaGigs</p>
                    </div>
                  </div>
                  <p className="mt-3 text-[10px] text-white/70">Get work done, anywhere in Africa.</p>
                </div>
                <div className="grid grid-cols-3 gap-2 p-4">
                  {categories.slice(0, 6).map((category) => {
                    const Icon = categoryIcon(category.icon);
                    return (
                      <div key={category.id} className="rounded-lg border border-[#EEE8DA] bg-white p-2 text-center">
                        <span className="mx-auto flex h-6 w-6 items-center justify-center rounded-full text-white" style={{ backgroundColor: category.accent }}>
                          <Icon className="h-3 w-3" aria-hidden />
                        </span>
                        <p className="mt-1 line-clamp-2 text-[7.5px] font-bold leading-tight text-[#34443A]">{category.name}</p>
                      </div>
                    );
                  })}
                </div>
                <div className="px-4 pb-4">
                  <div className="rounded-lg bg-[#F4F0E4] p-2.5">
                    <p className="flex items-center gap-1 text-[8px] font-bold text-[#0F7A4A]">
                      <Star className="h-2.5 w-2.5" aria-hidden /> Reviews appear after moderation
                    </p>
                    <p className="mt-1 text-[7.5px] leading-3 text-[#7A857D]">Book, message and pay in one place.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-4">
            <h2 className="font-display text-[27px] font-extrabold leading-tight tracking-[-0.02em] text-[#0B1F16]">Get the NaijaDeals App</h2>
            <p className="mt-3 max-w-sm text-[12.5px] leading-6 text-[#5C6A62]">
              Access NaijaGigs and all NaijaDeals services on the go — hire, work, manage and earn anytime, anywhere.
            </p>
            <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
              <span className="inline-flex items-center gap-2 rounded-xl bg-[#111614] px-4 py-2.5 text-white">
                <Smartphone className="h-6 w-6 text-[#7EE2A8]" aria-hidden />
                <span>
                  <span className="block text-[8px] font-semibold uppercase tracking-[0.16em] text-white/60">Android</span>
                  <span className="block text-[12px] font-bold">Google Play — coming soon</span>
                </span>
              </span>
              <span className="inline-flex items-center gap-2 rounded-xl bg-[#111614] px-4 py-2.5 text-white">
                <Smartphone className="h-6 w-6 text-white" aria-hidden />
                <span>
                  <span className="block text-[8px] font-semibold uppercase tracking-[0.16em] text-white/60">iOS</span>
                  <span className="block text-[12px] font-bold">App Store — coming soon</span>
                </span>
              </span>
            </div>
            <p className="mt-3 text-[10.5px] text-[#8A978F]">
              Store badges are shown as status, not links, until the mobile app is published.
            </p>
            <Link href="/naijagigs/pro/apply" className="mt-6 inline-flex items-center gap-2 text-[12px] font-bold text-[#0F7A4A] hover:text-[#0B6540]">
              Offer your skills on NaijaGigs <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
