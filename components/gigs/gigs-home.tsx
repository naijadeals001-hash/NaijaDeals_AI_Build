"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, BadgeCheck, Briefcase, Building2, Grid2x2, Home as HomeIcon, MessageSquare, User as UserIcon, ChevronLeft, ChevronRight, GraduationCap, Hammer, HeartPulse, Landmark, Leaf, MapPin, Paintbrush, Palette, Search, Shirt, Sparkles, Star, Truck, Users, UtensilsCrossed, Wrench, Zap } from "lucide-react";

/**
 * NaijaGigs homepage sections, built to the approved desktop and mobile mockups.
 *
 * Ratings shown here come from real reviews only; a professional or service with
 * no reviews renders "New" instead of an invented score.
 */

export function koboToNaira(value: string | null) {
  if (value === null) return null;
  return `₦${(Number(value) / 100).toLocaleString("en-NG")}`;
}

/** Horizontal rail with arrow controls (visible at every width). */
export function GigsRail({ title, href, seeAll, children }: { title?: string; href?: string; seeAll?: string; children: React.ReactNode }) {
  const track = useRef<HTMLUListElement | null>(null);
  const [pos, setPos] = useState({ left: 0, max: 1 });
  useEffect(() => {
    const node = track.current;
    if (!node) return;
    const update = () => setPos({ left: node.scrollLeft, max: Math.max(1, node.scrollWidth - node.clientWidth) });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  const sync = () => {
    const node = track.current;
    if (node) setPos({ left: node.scrollLeft, max: Math.max(1, node.scrollWidth - node.clientWidth) });
  };
  const page = (dir: -1 | 1) => {
    const node = track.current;
    if (!node) return;
    node.scrollBy({ left: dir * Math.max(240, node.clientWidth * 0.85), behavior: "smooth" });
    window.setTimeout(sync, 320);
  };
  return (
    <section className="mt-5">
      {title ? (
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-display text-[17px] font-extrabold text-[#14241b] sm:text-[19px]">{title}</h2>
          {href ? <Link href={href} className="text-[11.5px] font-bold text-[#0b5c33] hover:underline">{seeAll ?? "See all"} →</Link> : null}
        </div>
      ) : null}
      <div className="relative">
        <button type="button" onClick={() => page(-1)} disabled={pos.left <= 2} aria-label={`Scroll ${title ?? "rail"} left`} className="absolute -left-1 top-1/2 z-10 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full border border-[#e2e6e3] bg-white text-[#0b5c33] shadow-md disabled:opacity-40 sm:-left-2">
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <ul ref={track} onScroll={sync} aria-label={title ?? "Carousel"} className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none]">
          {children}
        </ul>
        <button type="button" onClick={() => page(1)} disabled={pos.left >= pos.max - 2} aria-label={`Scroll ${title ?? "rail"} right`} className="absolute -right-1 top-1/2 z-10 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full border border-[#e2e6e3] bg-white text-[#0b5c33] shadow-md disabled:opacity-40 sm:-right-2">
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </section>
  );
}

const TRUST = ["Verified Talent", "Verified Jobs", "Trusted Services", "Secure Payments"];

export function GigsHero({ image }: { image: string | null }) {
  return (
    <section aria-labelledby="gigs-hero" className="relative mt-3 overflow-hidden rounded-2xl bg-[#0b5c33]">
      {image ? <img src={image} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover object-[55%_30%]" /> : null}
      <div className="absolute inset-0 bg-gradient-to-r from-[#06401f] via-[#06401f]/85 via-45% to-transparent" aria-hidden />
      <div className="relative max-w-[560px] p-4 sm:p-7">
        <p className="flex items-center gap-1.5 font-display text-[18px] font-extrabold text-white">
          <Sparkles className="h-5 w-5 text-[#f5b52e]" aria-hidden /> Naija<span className="text-[#f5b52e]">Gigs</span>
        </p>
        <h1 id="gigs-hero" className="mt-1 font-display text-[24px] font-extrabold leading-[1.1] text-white sm:text-[34px]">Find Skills. Hire Talent.<br />Get Jobs. Grow Your Business.</h1>
        <p className="mt-2 max-w-md text-[11.5px] leading-5 text-white/90 sm:text-[12.5px]">Africa&apos;s all-in-one marketplace for skilled professionals, freelancers, tradespeople, service providers and job opportunities.</p>
        <ul className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1">
          {TRUST.map((item) => (
            <li key={item} className="flex items-center gap-1 text-[10.5px] font-semibold text-white">
              <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-[#0b8f47]"><BadgeCheck className="h-2.5 w-2.5" aria-hidden /></span>{item}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/naijagigs/professionals" className="rounded-full bg-[#f26b21] px-5 py-2.5 text-[12.5px] font-extrabold text-white hover:bg-[#dd5f18]">Hire a Professional →</Link>
          <Link href="/naijagigs/jobs" className="rounded-full bg-white px-5 py-2.5 text-[12.5px] font-extrabold text-[#0b5c33]">Find a Job →</Link>
        </div>
      </div>
    </section>
  );
}

/** "Get Started Today" — hire vs work tabs with the real search form. */
export function GigsStartCard({ categories }: { categories: Array<{ slug: string; name: string }> }) {
  const [tab, setTab] = useState<"hire" | "work">("hire");
  const action = tab === "hire" ? "/naijagigs/professionals" : "/naijagigs/jobs";
  return (
    <section aria-labelledby="gigs-start" className="rounded-2xl bg-[#0b5c33] p-3 text-white">
      <h2 id="gigs-start" className="font-display text-[15px] font-extrabold">Get Started Today</h2>
      <div role="tablist" aria-label="What do you need" className="mt-1.5 grid grid-cols-2 gap-1 rounded-lg bg-white/10 p-1">
        <button type="button" role="tab" aria-selected={tab === "hire"} onClick={() => setTab("hire")} className={`rounded-md px-2 py-1.5 text-[11px] font-extrabold ${tab === "hire" ? "bg-[#0b5c33] text-white ring-1 ring-white" : "text-white/85"}`}>I Want to Hire</button>
        <button type="button" role="tab" aria-selected={tab === "work"} onClick={() => setTab("work")} className={`rounded-md px-2 py-1.5 text-[11px] font-extrabold ${tab === "work" ? "bg-[#0b5c33] text-white ring-1 ring-white" : "text-white/85"}`}>I Want a Job / Gig</button>
      </div>
      <form action={action} method="get" className="mt-1.5 space-y-1.5">
        <label className="flex items-center gap-1.5 rounded-md bg-white px-2 py-1.5">
          <Search className="h-3.5 w-3.5 text-[#6b7a70]" aria-hidden />
          <span className="sr-only">What do you need</span>
          <input name="q" placeholder="What do you need? (e.g. Plumber, Developer, Event Planner)" className="w-full bg-transparent text-[11.5px] text-[#14241b] outline-none" />
        </label>
        <label className="flex items-center gap-1.5 rounded-md bg-white px-2 py-1.5">
          <MapPin className="h-3.5 w-3.5 text-[#6b7a70]" aria-hidden />
          <span className="sr-only">Location</span>
          <input name="city" placeholder="Location (City, State or Country)" className="w-full bg-transparent text-[11.5px] text-[#14241b] outline-none" />
        </label>
        <label className="flex items-center gap-1.5 rounded-md bg-white px-2 py-1.5">
          <Briefcase className="h-3.5 w-3.5 text-[#6b7a70]" aria-hidden />
          <span className="sr-only">Category</span>
          <select name="category" className="w-full bg-transparent text-[11.5px] text-[#14241b] outline-none">
            <option value="">Service / Job Category</option>
            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </label>
        <button type="submit" className="w-full rounded-md bg-[#f26b21] px-3 py-2 text-[12px] font-extrabold text-white hover:bg-[#dd5f18]">Search Now →</button>
      </form>
    </section>
  );
}

export function GigsBenefits() {
  const items = [
    ["Wide Range of Skills", "From local trades to digital & tech", Sparkles],
    ["Job Opportunities", "Full-time, part-time, contract & remote", Briefcase],
    ["Verified Professionals", "Background and ID verification", BadgeCheck],
    ["Secure Payments", "Pay safely with NaijaPay", Landmark],
    ["For Individuals & Companies", "Hire, work and grow with confidence", Users],
    ["Across Africa", "Opportunities in all African countries", Leaf]
  ] as const;
  return (
    <section aria-label="Why use NaijaGigs" className="mt-3 rounded-2xl bg-[#f2f9f0] px-2 py-2.5">
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {items.map(([title, body, Icon]) => (
          <li key={title} className="flex items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-[#0b5c33] ring-1 ring-[#d6e8d2]"><Icon className="h-4 w-4" aria-hidden /></span>
            <span className="min-w-0"><span className="block text-[11px] font-extrabold leading-tight">{title}</span><span className="block text-[9.5px] leading-tight text-[#5d6d64]">{body}</span></span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const CATEGORY_ICONS: Record<string, typeof Hammer> = {
  "building-renovation": Hammer,
  "home-repairs": Wrench,
  "repairs-maintenance": Wrench,
  "electrical-solar": Zap,
  "plumbing-services": Wrench,
  "climbing-services": ArrowRight,
  "beauty-wellness": HeartPulse,
  "events-catering": UtensilsCrossed,
  "tech-digital": Palette,
  "design-creative": Paintbrush,
  "business-services": Briefcase,
  "transportation-moving": Truck
};

export function GigsCategories({ categories }: { categories: Array<{ slug: string; name: string; imageUrl: string | null }> }) {
  return (
    <GigsRail title="Explore Service Categories" href="/naijagigs/services" seeAll="See All Categories →">
      {categories.map((category) => {
        const Icon = CATEGORY_ICONS[category.slug] ?? Sparkles;
        const src = category.imageUrl;
        return (
          <li key={category.slug} data-category={category.slug} className="w-[112px] shrink-0 snap-start sm:w-[132px]">
            <Link href={`/naijagigs/services?category=${category.slug}`} className="block rounded-xl bg-white p-2 text-center ring-1 ring-[#eef1ef] hover:shadow-md">
              <span className="block aspect-[4/3] w-full overflow-hidden rounded-lg bg-[#f2f9f0]">
                {src ? <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" /> : <span className="grid h-full w-full place-items-center"><Icon className="h-6 w-6 text-[#0b5c33]/60" aria-hidden /></span>}
              </span>
              <span className="mt-1 block text-[10px] font-extrabold leading-tight">{category.name}</span>
            </Link>
          </li>
        );
      })}
    </GigsRail>
  );
}

export type JobRow = { id: string; title: string; company: string | null; city: string | null; countryCode: string | null; mode: string; postedAt: string | null };
export type ServiceRow = { id: string; slug: string; title: string; categoryName: string; professionalName: string; rating: number | null; reviews: number; priceKobo: string | null; priceType: string; imageUrl: string | null };
export type ProRow = { id: string; name: string; headline: string; city: string | null; rating: number | null; reviews: number; verified: boolean };

function Rating({ rating, reviews }: { rating: number | null; reviews: number }) {
  if (rating === null || reviews === 0) return <span className="rounded bg-[#f2f9f0] px-1.5 py-0.5 text-[9px] font-extrabold text-[#0b5c33]">New</span>;
  return (
    <span className="flex items-center gap-1 text-[10px] text-[#6b7a70]">
      <Star className="h-3 w-3 fill-[#f5b52e] text-[#f5b52e]" aria-hidden /> <b className="text-[#14241b]">{rating.toFixed(1)}</b> ({reviews})
    </span>
  );
}

export function GigsLatestJobs({ jobs }: { jobs: JobRow[] }) {
  return (
    <section aria-labelledby="gigs-jobs">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="gigs-jobs" className="font-display text-[15px] font-extrabold sm:text-[17px]">Latest Job Opportunities</h2>
        <Link href="/naijagigs/jobs" className="text-[11px] font-bold text-[#0b5c33] hover:underline">See All Jobs →</Link>
      </div>
      {jobs.length ? (
        <ul className="divide-y divide-[#f0f3f1] rounded-2xl bg-white ring-1 ring-[#eef1ef]">
          {jobs.map((job) => (
            <li key={job.id} data-job={job.id}>
              <Link href={`/naijagigs/jobs/${job.id}`} className="flex items-center gap-2 p-2 hover:bg-[#f9fbf9]">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#f2f9f0]"><Briefcase className="h-4 w-4 text-[#0b5c33]" aria-hidden /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11.5px] font-extrabold">{job.title}</span>
                  <span className="block truncate text-[10px] text-[#6b7a70]">{job.company ?? "Company on file"}{job.city ? ` · ${job.city}` : ""}</span>
                </span>
                <span className="shrink-0 rounded-full bg-[#f2f9f0] px-2 py-0.5 text-[9px] font-extrabold text-[#0b5c33]">{job.mode.replace(/_/g, "-")}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl bg-white p-4 text-[11.5px] text-[#5d6d64] ring-1 ring-[#eef1ef]">No open jobs yet. <Link href="/naijagigs/jobs/new" className="font-bold text-[#0b5c33] underline">Post the first job</Link>.</p>
      )}
    </section>
  );
}

export function GigsFeaturedServices({ services }: { services: ServiceRow[] }) {
  return (
    <section aria-labelledby="gigs-services">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="gigs-services" className="font-display text-[15px] font-extrabold sm:text-[17px]">Featured Gigs &amp; Services</h2>
        <Link href="/naijagigs/services" className="text-[11px] font-bold text-[#0b5c33] hover:underline">See All Gigs →</Link>
      </div>
      <ul className="grid grid-cols-2 gap-2">
        {services.map((service) => (
          <li key={service.id} data-service={service.slug}>
            <Link href={`/naijagigs/services/${service.slug}`} className="flex h-full flex-col overflow-hidden rounded-xl bg-white ring-1 ring-[#eef1ef] hover:shadow-md">
              <span className="block aspect-[16/10] w-full bg-[#f2f9f0]">
                {service.imageUrl ? <img src={service.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}
              </span>
              <span className="flex flex-1 flex-col p-2">
                <span className="line-clamp-2 text-[11px] font-extrabold leading-tight">{service.title}</span>
                <span className="mt-1"><Rating rating={service.rating} reviews={service.reviews} /></span>
                <span className="mt-auto pt-1 text-[10.5px] font-extrabold text-[#0b5c33]">{koboToNaira(service.priceKobo) ? `From ${koboToNaira(service.priceKobo)}` : "Request a quote"}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function GigsTopProfessionals({ pros }: { pros: ProRow[] }) {
  return (
    <section aria-labelledby="gigs-pros">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="gigs-pros" className="font-display text-[15px] font-extrabold sm:text-[17px]">Top-Rated Professionals</h2>
        <Link href="/naijagigs/professionals" className="text-[11px] font-bold text-[#0b5c33] hover:underline">See All Talent →</Link>
      </div>
      {pros.length ? (
        <ul className="divide-y divide-[#f0f3f1] rounded-2xl bg-white ring-1 ring-[#eef1ef]">
          {pros.map((pro, index) => (
            // Keyed by id; the visible number is the list position.

            <li key={pro.id} data-pro={pro.id} className="flex items-center gap-2 p-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#f2f9f0] text-[11px] font-black text-[#0b5c33]">{pro.name.charAt(0)}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 text-[11.5px] font-extrabold">{index + 1}. {pro.name}{pro.verified ? <BadgeCheck className="h-3 w-3 text-[#0b8f47]" aria-label="Verified" /> : null}</span>
                <span className="block truncate text-[10px] text-[#6b7a70]">{pro.headline}</span>
                <Rating rating={pro.rating} reviews={pro.reviews} />
              </span>
              <Link href={`/naijagigs/professionals/${pro.id}`} className="shrink-0 rounded-full bg-[#0b5c33] px-2.5 py-1 text-[10px] font-extrabold text-white">Hire Me →</Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl bg-white p-4 text-[11.5px] text-[#5d6d64] ring-1 ring-[#eef1ef]">No verified professionals listed yet. <Link href="/naijagigs/pro" className="font-bold text-[#0b5c33] underline">Join as a professional</Link>.</p>
      )}
    </section>
  );
}

const STEPS = [
  ["Sign Up", "Create your account in minutes."],
  ["Post or Browse", "Post a job or offer your skills."],
  ["Connect", "Hire, apply or agree on a gig."],
  ["Work & Get Paid", "Deliver the work and get paid securely."],
  ["Review & Build Trust", "Rate, review and build your reputation."]
];

export function GigsSteps({ image }: { image: string | null }) {
  return (
    <section id="how-it-works" aria-labelledby="gigs-steps" className="mt-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="gigs-steps" className="font-display text-[17px] font-extrabold sm:text-[19px]">How NaijaGigs Works</h2>
        <Link href="/naijagigs/how-it-works" className="text-[11.5px] font-bold text-[#0b5c33] hover:underline">See Details →</Link>
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
        <ol className="grid grid-cols-2 gap-2 rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef] sm:grid-cols-5">
          {STEPS.map(([title, body], index) => (
            <li key={title} className="flex flex-col items-center text-center">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-[#f2f9f0] text-[13px] font-black text-[#0b5c33] ring-2 ring-[#d6e8d2]">{index + 1}</span>
              <p className="mt-1 text-[10.5px] font-extrabold leading-tight">{title}</p>
              <p className="mt-0.5 text-[9px] leading-tight text-[#5d6d64]">{body}</p>
            </li>
          ))}
        </ol>
        <div className="relative overflow-hidden rounded-2xl bg-[#0b5c33] p-3 text-white">
          {image ? <img src={image} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-40" /> : null}
          <span className="absolute inset-0 bg-gradient-to-r from-[#06401f]/95 to-[#06401f]/50" aria-hidden />
          <span className="relative block">
            <Building2 className="h-5 w-5 text-[#8ed14b]" aria-hidden />
            <p className="mt-1 font-display text-[14px] font-extrabold">For Businesses &amp; Organizations</p>
            <p className="mt-0.5 text-[10.5px] leading-snug text-white/90">Hire skilled talent, manage projects, post multiple job positions and scale your operations across Africa.</p>
            <Link href="/naijagigs/jobs/new" className="mt-2 inline-flex rounded-full bg-[#f26b21] px-3 py-1.5 text-[10.5px] font-extrabold">Post a Job →</Link>
          </span>
        </div>
      </div>
    </section>
  );
}

export function GigsAudienceBands({ individuals, government }: { individuals: string | null; government: string | null }) {
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <Link href="/naijagigs/pro" className="group relative overflow-hidden rounded-2xl bg-[#f26b21] p-4 text-white">
        {individuals ? <img src={individuals} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" /> : null}
        <span className="absolute inset-0 bg-gradient-to-r from-[#c4551a] via-[#c4551a]/90 to-transparent" aria-hidden />
        <span className="relative block max-w-[62%]">
          <span className="block font-display text-[17px] font-extrabold text-white">For Skilled Individuals</span>
          <span className="mt-1 block text-[10.5px] leading-snug text-white">Showcase your skills, get hired, find gigs and grow your income across Africa.</span>
          <span className="mt-2 inline-flex rounded-full bg-white px-3 py-1.5 text-[10.5px] font-extrabold text-[#c4551a]">Create a Profile →</span>
        </span>
      </Link>
      <Link href="/naijagigs/government" className="group relative overflow-hidden rounded-2xl bg-[#1565c0] p-4 text-white">
        {government ? <img src={government} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" /> : null}
        <span className="absolute inset-0 bg-gradient-to-r from-[#0b3f7a] via-[#0b3f7a]/90 to-transparent" aria-hidden />
        <span className="relative block max-w-[62%]">
          <span className="block font-display text-[17px] font-extrabold text-white">For Government &amp; Institutions</span>
          <span className="mt-1 block text-[10.5px] leading-snug text-white">Source verified professionals for projects, programs and public services. Support local talent and job creation.</span>
          <span className="mt-2 inline-flex rounded-full bg-white px-3 py-1.5 text-[10.5px] font-extrabold text-[#0b3f7a]">Partner with NaijaGigs →</span>
        </span>
      </Link>
    </div>
  );
}

const JOB_CATEGORY_ICONS: Array<[string, string, typeof Hammer]> = [
  ["Technology & IT", "technology-it", Palette],
  ["Engineering & Construction", "engineering-construction", Hammer],
  ["Health & Medical", "health-medical", HeartPulse],
  ["Education & Training", "education-training", GraduationCap],
  ["Finance & Accounting", "finance-accounting", Landmark],
  ["Sales & Marketing", "sales-marketing", Briefcase],
  ["Administration & HR", "administration-hr", Users],
  ["Agriculture & Agro", "agriculture-agro", Leaf],
  ["Logistics & Transport", "logistics-transport", Truck],
  ["Government & Public Service", "government-public-service", Building2]
];

export function GigsJobCategories() {
  return (
    <section aria-labelledby="gigs-job-cats" className="mt-5">
      <h2 id="gigs-job-cats" className="mb-2 font-display text-[17px] font-extrabold sm:text-[19px]">Popular Job Categories</h2>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {JOB_CATEGORY_ICONS.map(([label, slug, Icon]) => (
          <li key={slug}>
            <Link href={`/naijagigs/jobs?category=${slug}`} className="flex flex-col items-center rounded-xl bg-white p-2 text-center ring-1 ring-[#eef1ef] hover:shadow-md">
              <Icon className="h-5 w-5 text-[#0b5c33]" aria-hidden />
              <span className="mt-1 text-[9.5px] font-extrabold leading-tight">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export type Story = { quote: string; name: string; role: string; rating: number };

export function GigsStories({ stories }: { stories: Story[] }) {
  return (
    <GigsRail title="Success Stories from Our Community" href="/naijagigs/stories" seeAll="See All Stories →">
      {stories.map((story) => (
        <li key={`${story.name}-${story.quote.slice(0, 12)}`} className="w-[260px] shrink-0 snap-start sm:w-[300px]">
          <figure className="h-full rounded-xl bg-white p-3 ring-1 ring-[#eef1ef]">
            <blockquote className="line-clamp-3 text-[11px] italic leading-5 text-[#3f4d45]">“{story.quote}”</blockquote>
            <figcaption className="mt-2 flex items-center justify-between">
              <span><span className="block text-[11px] font-extrabold">{story.name}</span><span className="block text-[9.5px] text-[#6b7a70]">{story.role}</span></span>
              <span className="text-[10px] text-[#f5b52e]" aria-label={`${story.rating} out of 5`}>{"★".repeat(story.rating)}</span>
            </figcaption>
          </figure>
        </li>
      ))}
    </GigsRail>
  );
}

export function GigsAppBanner() {
  return (
    <section aria-labelledby="gigs-app" className="mt-4 overflow-hidden rounded-2xl bg-[#6d3bc4] p-4 text-white">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="gigs-app" className="font-display text-[18px] font-extrabold">Download the NaijaGigs App</h2>
          <p className="mt-0.5 text-[11px] text-white/85">Hire, work, track jobs, manage projects and get paid anywhere in Africa.</p>
          <div className="mt-2 flex gap-2">
            <Link href="/naijagigs" className="rounded-lg bg-black px-3 py-1.5 text-[10px] font-semibold">App Store</Link>
            <Link href="/naijagigs" className="rounded-lg bg-black px-3 py-1.5 text-[10px] font-semibold">Google Play</Link>
          </div>
        </div>
        <ul className="grid grid-cols-2 gap-1.5 text-[10px]">
          {["Post Jobs & Gigs", "Receive Payments", "Hire Talent", "Manage Projects", "Track Progress", "Get Notifications"].map((item) => (
            <li key={item} className="flex items-center gap-1"><BadgeCheck className="h-3 w-3 text-[#8ed14b]" aria-hidden />{item}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export { Shirt };

/** Mobile bottom navigation from the approved mobile mockup. */
export function GigsBottomNav() {
  const pathname = usePathname();
  const items = [
    { href: "/naijagigs", label: "Home", icon: HomeIcon },
    { href: "/naijagigs/services", label: "Services", icon: Grid2x2 },
    { href: "/naijagigs/jobs", label: "Jobs", icon: Briefcase },
    { href: "/naijagigs/bookings", label: "Messages", icon: MessageSquare },
    { href: "/naijagigs/account", label: "Account", icon: UserIcon }
  ];
  return (
    <nav aria-label="NaijaGigs navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-[#eef1ef] bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="grid grid-cols-5">
        {items.map((item) => {
          const active = item.href === "/naijagigs" ? pathname === "/naijagigs" : Boolean(pathname?.startsWith(item.href));
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={active ? "page" : undefined} className={`flex flex-col items-center gap-0.5 py-1.5 text-[9.5px] font-semibold ${active ? "text-[#f26b21]" : "text-[#5d6d64]"}`}>
                <item.icon className="h-4 w-4" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
