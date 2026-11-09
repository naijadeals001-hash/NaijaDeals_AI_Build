"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowRight, BedDouble, CalendarCheck, Check, ChevronLeft, ChevronRight, CreditCard, Globe2, Handshake, Headset, Heart, House, LandPlot, MapPin, Search, ShieldCheck, Sparkles, Store, TreePalm, Users, KeyRound, UserPlus, Star } from "lucide-react";

function naira(kobo: string | null) {
  if (kobo === null) return null;
  return `₦${(Number(kobo) / 100).toLocaleString("en-NG")}`;
}

/** Horizontal rail with arrows that work at every width. */
export function StayRail({ title, href, seeAll, label, children }: { title?: string; href?: string; seeAll?: string; label: string; children: React.ReactNode }) {
  const track = useRef<HTMLUListElement | null>(null);
  const [pos, setPos] = useState({ left: 0, max: 1 });
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
        <button type="button" onClick={() => page(-1)} disabled={pos.left <= 2} aria-label={`Scroll ${label} left`} className="absolute -left-1 top-1/2 z-10 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full border border-[#e2e6e3] bg-white text-[#0b5c33] shadow-md disabled:opacity-40 sm:-left-2"><ChevronLeft className="h-4 w-4" aria-hidden /></button>
        <ul ref={track} onScroll={sync} aria-label={label} className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none]">{children}</ul>
        <button type="button" onClick={() => page(1)} disabled={pos.left >= pos.max - 2} aria-label={`Scroll ${label} right`} className="absolute -right-1 top-1/2 z-10 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full border border-[#e2e6e3] bg-white text-[#0b5c33] shadow-md disabled:opacity-40 sm:-right-2"><ChevronRight className="h-4 w-4" aria-hidden /></button>
      </div>
    </section>
  );
}

const HERO_POINTS = ["Verified Listings", "Secure Bookings", "Trusted Hosts", "Multiple Payment Options"];

export function StayHero({ image }: { image: string | null }) {
  return (
    <section aria-labelledby="stay-hero" className="relative mt-3 overflow-hidden rounded-2xl bg-[#0b5c33]">
      {image ? <img src={image} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover object-[70%_35%]" /> : null}
      <div className="absolute inset-0 bg-gradient-to-r from-[#06401f] via-[#06401f]/80 via-45% to-transparent" aria-hidden />
      <div className="relative max-w-[560px] p-4 sm:p-7">
        <p className="flex items-center gap-1.5 font-display text-[18px] font-extrabold text-white"><House className="h-5 w-5 text-[#f5b52e]" aria-hidden /> Naija<span className="text-[#f5b52e]">Stay</span></p>
        <h1 id="stay-hero" className="mt-1 font-display text-[26px] font-extrabold leading-[1.08] text-white sm:text-[36px]">
          Find a Place.<br />Stay Anywhere.<br /><span className="text-[#f5b52e]">Feel at Home.</span>
        </h1>
        <p className="mt-2 max-w-md text-[11.5px] leading-5 text-white/90 sm:text-[12.5px]">Africa&apos;s trusted marketplace for hotels, short stays, long-term rentals, houses, land and real estate across all African countries.</p>
        <ul className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1">
          {HERO_POINTS.map((item) => <li key={item} className="flex items-center gap-1 text-[10.5px] font-semibold text-white"><span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-[#0b8f47]"><Check className="h-2.5 w-2.5" aria-hidden /></span>{item}</li>)}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/naijastay/stays" className="rounded-full bg-[#f26b21] px-5 py-2.5 text-[12.5px] font-extrabold text-white hover:bg-[#dd5f18]">Book a Stay →</Link>
          <Link href="/naijastay/host" className="rounded-full bg-white px-5 py-2.5 text-[12.5px] font-extrabold text-[#0b5c33]">List Your Property →</Link>
        </div>
      </div>
    </section>
  );
}

const TABS = [
  { key: "stays", label: "Hotels & Stays", icon: BedDouble },
  { key: "apartments", label: "Apartments & Short Lets", icon: Building2Icon },
  { key: "rent", label: "Houses for Rent", icon: House },
  { key: "sale", label: "Houses for Sale", icon: Store },
  { key: "land", label: "Land & Plots", icon: LandPlot }
];

function Building2Icon(props: { className?: string; "aria-hidden"?: boolean }) {
  return <House {...props} />;
}

/** Search panel: destination, check-in/out, guests. Submits a real URL query. */
export function StaySearchPanel({ compact = false }: { compact?: boolean }) {
  const [tab, setTab] = useState("stays");
  const [guests, setGuests] = useState(1);
  const action = tab === "rent" || tab === "sale" || tab === "land" ? "/naijastay/search" : "/naijastay/stays";
  return (
    <section aria-labelledby={compact ? undefined : "stay-search"} aria-label="Search accommodation" className="rounded-2xl bg-white p-2.5 ring-1 ring-[#eef1ef]">
      {!compact ? <h2 id="stay-search" className="sr-only">Search stays</h2> : null}
      <div role="tablist" aria-label="What are you looking for" className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-extrabold ${tab === t.key ? "bg-[#0b5c33] text-white" : "bg-[#f2f9f0] text-[#14241b]"}`}>
            <t.icon className="h-3.5 w-3.5" aria-hidden /> {t.label}
          </button>
        ))}
      </div>
      <form action={action} method="get" className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto]">
        <label className="flex items-center gap-1.5 rounded-lg border border-[#dfe6e1] px-2 py-1.5">
          <MapPin className="h-4 w-4 shrink-0 text-[#0b5c33]" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-[9px] font-bold uppercase tracking-wide text-[#6b7a70]">Where are you going?</span>
            <input name="q" placeholder="Enter city, state or country" className="w-full bg-transparent text-[11.5px] outline-none" />
          </span>
        </label>
        <label className="flex items-center gap-1.5 rounded-lg border border-[#dfe6e1] px-2 py-1.5">
          <CalendarCheck className="h-4 w-4 shrink-0 text-[#0b5c33]" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-[9px] font-bold uppercase tracking-wide text-[#6b7a70]">Check-in</span>
            <input type="date" name="checkIn" aria-label="Check-in date" className="w-full bg-transparent text-[11.5px] outline-none" />
          </span>
        </label>
        <label className="flex items-center gap-1.5 rounded-lg border border-[#dfe6e1] px-2 py-1.5">
          <CalendarCheck className="h-4 w-4 shrink-0 text-[#0b5c33]" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-[9px] font-bold uppercase tracking-wide text-[#6b7a70]">Check-out</span>
            <input type="date" name="checkOut" aria-label="Check-out date" className="w-full bg-transparent text-[11.5px] outline-none" />
          </span>
        </label>
        <label className="flex items-center gap-1.5 rounded-lg border border-[#dfe6e1] px-2 py-1.5">
          <Users className="h-4 w-4 shrink-0 text-[#0b5c33]" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-[9px] font-bold uppercase tracking-wide text-[#6b7a70]">Guests</span>
            <select name="guests" value={guests} onChange={(e) => setGuests(Number(e.target.value))} className="w-full bg-transparent text-[11.5px] outline-none" aria-label="Number of guests">
              {[1, 2, 3, 4, 5, 6, 8].map((n) => <option key={n} value={n}>{n} guest{n === 1 ? "" : "s"}</option>)}
            </select>
          </span>
        </label>
        {tab !== "stays" ? <input type="hidden" name="type" value={tab} /> : null}
        <button type="submit" className="flex items-center justify-center gap-1 rounded-lg bg-[#f26b21] px-4 py-2 text-[12px] font-extrabold text-white hover:bg-[#dd5f18]"><Search className="h-3.5 w-3.5" aria-hidden /> Search Stays</button>
      </form>
      <p className="mt-1 text-[9.5px] text-[#6b7a70]">Dates are confirmed against each property&apos;s availability before you pay.</p>
    </section>
  );
}

export function StayBenefits() {
  const items = [
    ["Wide Range of Stays", "Hotels, apartments, homes & more", BedDouble],
    ["Verified Properties", "Real listings, real owners", ShieldCheck],
    ["Secure Payments", "Pay safely with NaijaPay", CreditCard],
    ["24/7 Support", "Help when you need it", Headset],
    ["Across Africa", "Stay, rent or buy in any African country", Globe2]
  ] as const;
  return (
    <section aria-label="Why book with NaijaStay" className="mt-3 rounded-2xl bg-[#f2f9f0] px-2 py-2.5">
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
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

export type StayCardData = {
  id: string; slug: string; title: string; category: string; listingType: string; city: string; country: string;
  nightlyKobo: string; salePriceKobo: string | null; currency: string; imageUrl: string | null; imageKind: string;
  isDemo: boolean; featured: boolean; maxGuests: number; bedrooms: number; rating: number | null; reviewCount: number;
};

export function PropertyCard({ property, image }: { property: StayCardData; image?: string | null }) {
  const src = image ?? property.imageUrl;
  const isSale = property.listingType === "sale" || property.listingType === "land";
  const price = isSale ? naira(property.salePriceKobo) : naira(property.nightlyKobo);
  return (
    <li data-property={property.slug} className="min-w-0">
      <article className="flex h-full flex-col overflow-hidden rounded-xl bg-white ring-1 ring-[#eef1ef] transition hover:shadow-md">
        <Link href={`/naijastay/stays/${property.slug}`} className="relative block aspect-[16/10] w-full overflow-hidden bg-[#f2f9f0]">
          {src ? <img src={src} alt={property.isDemo ? `${property.title} — demonstration image` : property.title} loading="lazy" className="h-full w-full object-cover transition duration-300 hover:scale-[1.03]" /> : null}
          {property.featured ? <span className="absolute left-1.5 top-1.5 rounded bg-[#0b8f47] px-1.5 py-0.5 text-[9px] font-extrabold text-white">Featured</span> : null}
          {property.isDemo ? <span className="absolute right-1.5 top-1.5 rounded bg-[#14241b]/75 px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide text-white">Demo listing</span> : null}
        </Link>
        <div className="flex flex-1 flex-col p-2">
          <Link href={`/naijastay/stays/${property.slug}`} className="line-clamp-2 text-[12px] font-extrabold leading-tight hover:text-[#0b5c33]">{property.title}</Link>
          <p className="mt-0.5 flex items-center gap-1 text-[10px] text-[#6b7a70]"><MapPin className="h-3 w-3" aria-hidden /> {property.city}, {property.country}</p>
          <p className="mt-0.5 flex items-center gap-1 text-[10px] text-[#6b7a70]">
            {property.rating !== null && property.reviewCount > 0 ? (
              <><Star className="h-3 w-3 fill-[#f5b52e] text-[#f5b52e]" aria-hidden /> <b className="text-[#14241b]">{property.rating.toFixed(1)}</b> ({property.reviewCount} review{property.reviewCount === 1 ? "" : "s"})</>
            ) : (
              <span className="rounded bg-[#f2f9f0] px-1.5 py-0.5 text-[9px] font-extrabold text-[#0b5c33]">No reviews yet</span>
            )}
          </p>
          <p className="mt-auto pt-1 text-[11.5px] font-extrabold text-[#c4551a]">{price ? (isSale ? price : `${price} / night`) : "Price on request"}</p>
        </div>
      </article>
    </li>
  );
}

export function CategoryCards({ categories }: { categories: Array<{ slug: string; label: string; imageUrl: string | null }> }) {
  return (
    <StayRail title="Explore by Category" href="/naijastay/search" seeAll="See All Categories" label="Category carousel">
      {categories.map((c) => (
        <li key={c.slug} data-category={c.slug} className="w-[124px] shrink-0 snap-start sm:w-[150px]">
          <Link href={`/naijastay/search?category=${c.slug}`} className="block h-full overflow-hidden rounded-xl bg-white p-1.5 text-center ring-1 ring-[#eef1ef] hover:shadow-md">
            <span className="block aspect-[4/3] w-full overflow-hidden rounded-lg bg-[#f2f9f0]">{c.imageUrl ? <img src={c.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}</span>
            <span className="mt-1 block text-[10px] font-extrabold leading-tight">{c.label}</span>
          </Link>
        </li>
      ))}
    </StayRail>
  );
}

export function DestinationCards({ destinations }: { destinations: Array<{ slug: string; city: string; country: string; imageUrl: string | null }> }) {
  return (
    <StayRail title="Top Destinations in Africa" href="/naijastay/destinations" seeAll="Explore All Destinations" label="Destinations carousel">
      {destinations.map((d) => (
        <li key={d.slug} data-destination={d.slug} className="w-[160px] shrink-0 snap-start sm:w-[190px]">
          <Link href={`/naijastay/stays?q=${encodeURIComponent(d.city)}`} className="block overflow-hidden rounded-xl bg-white ring-1 ring-[#eef1ef] hover:shadow-md">
            <span className="block aspect-[16/10] w-full overflow-hidden bg-[#f2f9f0]">{d.imageUrl ? <img src={d.imageUrl} alt={`${d.city}`} loading="lazy" className="h-full w-full object-cover" /> : null}</span>
            <span className="flex items-center justify-between p-1.5">
              <span><span className="block text-[11px] font-extrabold">{d.city}</span><span className="block text-[9.5px] text-[#6b7a70]">{d.country}</span></span>
              <span className="grid h-4 w-4 place-items-center rounded-full bg-[#0b8f47] text-white"><ArrowRight className="h-2.5 w-2.5" aria-hidden /></span>
            </span>
          </Link>
        </li>
      ))}
    </StayRail>
  );
}

const STEPS = [
  ["Sign Up", "Create your free NaijaDeals account.", UserPlus],
  ["Search & Discover", "Find hotels, rentals, houses or land.", Search],
  ["Book or Inquire", "Reserve your stay or contact the owner/agent.", CalendarCheck],
  ["Pay Securely", "Use NaijaPay for safe and protected payments.", CreditCard],
  ["Stay, Rent or Buy", "Enjoy your stay, move in or complete your purchase.", KeyRound]
] as const;

export function StaySteps() {
  return (
    <section aria-labelledby="stay-steps" className="mt-5">
      <div className="mb-2 flex items-center justify-between"><h2 id="stay-steps" className="font-display text-[17px] font-extrabold sm:text-[19px]">How NaijaStay Works</h2><Link href="/naijastay/how-it-works" className="text-[11.5px] font-bold text-[#0b5c33] hover:underline">See Details →</Link></div>
      <ol className="grid grid-cols-2 gap-2 rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef] sm:grid-cols-5">
        {STEPS.map(([title, body, Icon], i) => (
          <li key={title} className="flex flex-col items-center text-center">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[#f2f9f0] ring-2 ring-[#d6e8d2]"><Icon className="h-4 w-4 text-[#0b5c33]" aria-hidden /></span>
            <p className="mt-1 text-[10.5px] font-extrabold leading-tight">{i + 1}. {title}</p>
            <p className="mt-0.5 text-[9px] leading-tight text-[#5d6d64]">{body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

const SOLUTIONS = [
  ["For Travelers", "Book hotels, holiday stays and unique places across Africa.", "/naijastay/stays", "stay-sol-travelers"],
  ["For Tenants", "Find verified homes and apartments for short or long-term rent.", "/naijastay/search?type=rent", "stay-sol-tenants"],
  ["For Buyers", "Discover houses, land and investment properties across Africa.", "/naijastay/search?type=sale", "stay-sol-buyers"],
  ["For Property Owners", "List your property, manage bookings and earn more.", "/naijastay/host", "stay-sol-owners"],
  ["For Businesses & Organizations", "Book corporate stays, long-stay accommodation, event spaces and staff housing.", "/naijastay/search?category=corporate-stays", "stay-sol-business"]
] as const;

export function StaySolutions({ images }: { images: Record<string, string | null> }) {
  return (
    <StayRail title="Solutions for Everyone" href="/naijastay/stays" seeAll="See All" label="Solutions carousel">
      {SOLUTIONS.map(([title, body, href, imageId]) => (
        <li key={title} className="w-[200px] shrink-0 snap-start sm:w-[230px]">
          <Link href={href} className="group block overflow-hidden rounded-xl bg-white ring-1 ring-[#e6ebe7] transition hover:shadow-md">
            <span className="relative block aspect-[4/3] w-full overflow-hidden bg-[#eef2ef]">
              {images[imageId] ? <img src={images[imageId] ?? undefined} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" /> : null}
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                <span className="block text-[12px] font-extrabold text-white">{title}</span>
              </span>
            </span>
            <span className="block p-2">
              <span className="block text-[10px] leading-tight text-[#5d6d64]">{body}</span>
              <span className="mt-1 flex items-center justify-end"><span className="grid h-5 w-5 place-items-center rounded-full bg-[#0b8f47] text-white"><ArrowRight className="h-3 w-3" aria-hidden /></span></span>
            </span>
          </Link>
        </li>
      ))}
    </StayRail>
  );
}

export function StayPromoBands({ hostImage, landImage }: { hostImage: string | null; landImage: string | null }) {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <Link href="/naijastay/host" className="relative overflow-hidden rounded-2xl bg-[#0b5c33] p-4 text-white">
        {hostImage ? <img src={hostImage} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" /> : null}
        <span className="absolute inset-0 bg-gradient-to-r from-[#06401f] via-[#06401f]/90 to-transparent" aria-hidden />
        <span className="relative block max-w-[62%]">
          <span className="block font-display text-[17px] font-extrabold">List Your Property on NaijaStay</span>
          <span className="mt-1 block text-[10.5px] leading-snug text-white">Reach thousands of guests, renters and buyers across Africa.</span>
          <span className="mt-2 inline-flex rounded-full bg-white px-3 py-1.5 text-[10.5px] font-extrabold text-[#0b5c33]">Become a Host →</span>
        </span>
      </Link>
      <Link href="/naijastay/search?type=sale" className="relative overflow-hidden rounded-2xl bg-[#c4551a] p-4 text-white">
        {landImage ? <img src={landImage} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" /> : null}
        <span className="absolute inset-0 bg-gradient-to-r from-[#8f3d0c] via-[#8f3d0c]/90 to-transparent" aria-hidden />
        <span className="relative block max-w-[62%]">
          <span className="block font-display text-[17px] font-extrabold">Real Estate &amp; Land Marketplace</span>
          <span className="mt-1 block text-[10.5px] leading-snug text-white">Buy, sell or lease houses, land and commercial properties with trusted agents.</span>
          <span className="mt-2 inline-flex rounded-full bg-white px-3 py-1.5 text-[10.5px] font-extrabold text-[#8f3d0c]">Explore Properties →</span>
        </span>
      </Link>
    </div>
  );
}

export function StayAppBanner() {
  return (
    <section aria-labelledby="stay-app" className="mt-4 overflow-hidden rounded-2xl bg-[#6d3bc4] p-4 text-white">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="stay-app" className="font-display text-[18px] font-extrabold">Download the NaijaStay App</h2>
          <p className="mt-0.5 text-[11px] text-white/85">Book stays, manage your bookings, list properties and get the best deals anywhere in Africa.</p>
          <div className="mt-2 flex gap-2"><Link href="/naijastay" className="rounded-lg bg-black px-3 py-1.5 text-[10px] font-semibold">App Store</Link><Link href="/naijastay" className="rounded-lg bg-black px-3 py-1.5 text-[10px] font-semibold">Google Play</Link></div>
        </div>
        <ul className="grid grid-cols-2 gap-1.5 text-[10px]">
          {["Book Stays Anywhere", "Secure Payments", "List & Manage Property", "Save Favourite Listings", "Get Instant Updates", "Exclusive Deals & Offers"].map((i) => <li key={i} className="flex items-center gap-1"><Check className="h-3 w-3 text-[#8ed14b]" aria-hidden />{i}</li>)}
        </ul>
      </div>
    </section>
  );
}

export function StayFooter() {
  const cols = [
    { title: "For Guests", links: [["Find Stays", "/naijastay/stays"], ["Travel Guides", "/naijastay/destinations"], ["Deals & Offers", "/naijastay/search"], ["Help & Support", "/naijastay/help"]] },
    { title: "For Property Owners", links: [["List a Property", "/naijastay/host"], ["Manage Bookings", "/naijastay/host/dashboard"], ["Earnings & Payouts", "/naijastay/host/dashboard"], ["Host Resources", "/naijastay/how-it-works"]] },
    { title: "For Real Estate Agents", links: [["List Properties", "/naijastay/host"], ["Generate Leads", "/naijastay/host"], ["Agent Tools", "/naijastay/agents"], ["Partner with Us", "/naijastay/agents"]] },
    { title: "Company", links: [["About NaijaStay", "/about"], ["How It Works", "/naijastay/how-it-works"], ["Our Partners", "/about"], ["Careers", "/about"]] },
    { title: "Support", links: [["Help Center", "/naijastay/help"], ["Contact Us", "/naijastay/help"], ["Report an Issue", "/naijastay/help"], ["Trust & Safety", "/naijastay/safety"]] },
    { title: "Legal", links: [["Terms of Service", "/legal"], ["Privacy Policy", "/legal"], ["Listing Policy", "/legal"], ["Disputes & Claims", "/support"]] }
  ];
  return (
    <footer className="mt-6 bg-[#0b5c33] pb-20 text-white lg:pb-8">
      <div className="mx-auto grid max-w-[1440px] gap-5 px-4 py-7 sm:grid-cols-2 lg:grid-cols-8">
        <div className="sm:col-span-2">
          <Link href="/" className="flex items-center gap-1.5 font-display text-[18px] font-extrabold"><House className="h-5 w-5 text-[#f5b52e]" aria-hidden /> Naija<span className="text-[#f5b52e]">Stay</span></Link>
          <p className="mt-1 max-w-[240px] text-[10.5px] leading-snug text-white/75">Hotels, rentals and real estate across Africa.</p>
        </div>
        {cols.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <p className="text-[11px] font-extrabold text-[#8ed14b]">{col.title}</p>
            <ul className="mt-1.5 space-y-1">{col.links.map(([label, href]) => <li key={label}><Link href={href} className="text-[10.5px] text-white/80 hover:text-white hover:underline">{label}</Link></li>)}</ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-white/15">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2 px-4 py-3 text-[10px] text-white/70">
          <p>© {new Date().getFullYear()} NaijaDeals. NaijaStay is a NaijaDeals Company. All rights reserved.</p>
          <span className="rounded-full bg-white/10 px-2 py-0.5">NGN</span>
        </div>
      </div>
    </footer>
  );
}

export { Handshake, Store };
