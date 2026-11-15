"use client";

import { supportHref } from "@/lib/support/contact-link";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Bike, Boxes, Building2, Car, Check, Container, Factory, Globe2, Headset, Landmark, Package, Refrigerator, ShieldCheck, Sprout, Store, Truck, Warehouse, Wheat, Plane, TrainFront, User, Clock, CreditCard, Navigation } from "lucide-react";
import { mailtoFor } from "@/lib/data/contact-directory";

/** Horizontal rail with arrow controls, as in the approved mockup. */
export function SendRail({ title, href, seeAll, children }: { title?: string; href?: string; seeAll?: string; children: React.ReactNode }) {
  const track = useRef<HTMLUListElement | null>(null);
  const [pos, setPos] = useState({ left: 0, max: 1 });
  useEffect(() => {
    // Recompute after layout and on resize: a rail that fits needs no arrows, and
    // a rail that overflows must show its right arrow straight away.
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
          {href ? <Link href={href} className="flex items-center gap-1 text-[11.5px] font-bold text-[#0b5c33] hover:underline">{seeAll ?? "See all"} <ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link> : null}
        </div>
      ) : null}
      <div className="relative">
        <button type="button" onClick={() => page(-1)} disabled={pos.left <= 2} aria-label={`Scroll ${title ?? "rail"} left`} className="absolute -left-1 top-1/2 z-10 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full border border-[#e2e6e3] bg-white text-[#0b5c33] shadow-md disabled:cursor-not-allowed disabled:opacity-40 sm:-left-2">
          <ArrowRight className="h-4 w-4 rotate-180" aria-hidden />
        </button>
        <ul ref={track} onScroll={sync} aria-label={title ?? "Carousel"} className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none]">
          {children}
        </ul>
        <button type="button" onClick={() => page(1)} disabled={pos.left >= pos.max - 2} aria-label={`Scroll ${title ?? "rail"} right`} className="absolute -right-1 top-1/2 z-10 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full border border-[#e2e6e3] bg-white text-[#0b5c33] shadow-md disabled:cursor-not-allowed disabled:opacity-40 sm:-right-2">
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </section>
  );
}

const HERO_POINTS = ["Affordable", "Reliable", "Secure", "Unified Platform", "Africa-Wide"];

/** C — hero. Imagery shows independent transport modes; NaijaSend owns none. */
export function SendHero({ image }: { image: string | null }) {
  return (
    <section aria-labelledby="send-hero-title" className="relative mt-3 overflow-hidden rounded-2xl bg-[#0b5c33]">
      {image ? <img src={image} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover object-[65%_30%]" /> : null}
      <div className="absolute inset-0 bg-gradient-to-r from-[#06401f]/95 via-[#06401f]/70 via-42% to-transparent" aria-hidden />
      <div className="relative max-w-[620px] p-4 sm:p-7">
        <h1 id="send-hero-title" className="font-display text-[26px] font-extrabold leading-[1.1] text-white sm:text-[38px]">Africa&apos;s All-in-One Logistics Marketplace</h1>
        <p className="mt-2 max-w-md text-[12px] leading-6 text-white/90 sm:text-[13.5px]">Move goods, farm produce, business cargo, packages and more — across cities, countries and continents.</p>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {HERO_POINTS.map((point) => (
            <li key={point} className="flex items-center gap-1 text-[11.5px] font-semibold text-white">
              <span className="grid h-4 w-4 place-items-center rounded-full bg-[#0b8f47]"><Check className="h-2.5 w-2.5" aria-hidden /></span>{point}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/naijasend/ship" className="rounded-full bg-[#f26b21] px-5 py-2.5 text-[12.5px] font-extrabold text-white hover:bg-[#dd5f18]">Book a Shipment →</Link>
          <Link href="/naijasend/transporter/apply" className="rounded-full border border-white/70 px-5 py-2.5 text-[12.5px] font-extrabold text-white hover:bg-white/10">Become a Transporter →</Link>
        </div>
      </div>
    </section>
  );
}

/** E — benefits strip. Every claim maps to a capability that exists. */
export function SendBenefits() {
  const items = [
    { icon: Truck, title: "All Transport Modes", body: "Trucks, vans, cars, motorcycles, aircraft and ships" },
    { icon: Globe2, title: "Local & International", body: "Across Africa and the world" },
    { icon: ShieldCheck, title: "Verified Transporters", body: "Providers are verified before they can quote" },
    { icon: Navigation, title: "Live Tracking", body: "Milestones at every stage" },
    { icon: CreditCard, title: "Secure Payments", body: "NaijaPay with funds held until delivery" },
    { icon: Headset, title: "Customer Support", body: "Get help at any point" }
  ];
  return (
    <section aria-label="Why ship with NaijaSend" className="mt-3 rounded-2xl bg-[#f2f9f0] px-2 py-2.5">
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((item) => (
          <li key={item.title} className="flex items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-[#0b5c33] ring-1 ring-[#d6e8d2]"><item.icon className="h-4 w-4" aria-hidden /></span>
            <span className="min-w-0">
              <span className="block text-[11px] font-extrabold leading-tight text-[#14241b]">{item.title}</span>
              <span className="block text-[9.5px] leading-tight text-[#5d6d64]">{item.body}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const MODES = [
  { slug: "truck", label: "Truck Transport", body: "Large goods, bulk cargo and long-haul deliveries", icon: Truck },
  { slug: "van", label: "Van Transport", body: "Medium cargo, business and city deliveries", icon: Store },
  { slug: "car", label: "Car Transport", body: "Smaller goods and flexible delivery", icon: Car },
  { slug: "motorcycle", label: "Motorcycle Delivery", body: "Fast, affordable last-mile delivery", icon: Bike },
  { slug: "air", label: "Air Cargo", body: "Interstate and international shipping", icon: Plane },
  { slug: "sea", label: "Sea Freight", body: "Bulk and international cargo", icon: Container },
  { slug: "rail", label: "Rail Logistics", body: "Cost-effective heavy cargo movement", icon: TrainFront },
  { slug: "warehouse", label: "Warehousing", body: "Storage, consolidation and distribution", icon: Warehouse }
];

/** F — transport solutions. Each card opens that mode's quote request. */
export function SendModes({ images }: { images: Record<string, string | null> }) {
  return (
    <SendRail title="Choose a Transport Solution" href="/naijasend/providers" seeAll="See All Transport Services">
      {MODES.map((mode) => (
        <li key={mode.slug} data-mode={mode.slug} className="w-[150px] shrink-0 snap-start sm:w-[178px]">
          <Link href={`/naijasend/quote?mode=${mode.slug}`} className="flex h-full flex-col overflow-hidden rounded-xl bg-white ring-1 ring-[#eef1ef] hover:shadow-md">
            <span className="block aspect-[4/3] w-full bg-[#f2f9f0]">
              {images[mode.slug] ? <img src={images[mode.slug] ?? undefined} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}
            </span>
            <span className="flex flex-1 flex-col p-2">
              <span className="flex items-center justify-between gap-1">
                <span className="text-[11.5px] font-extrabold leading-tight text-[#14241b]">{mode.label}</span>
                <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[#0b8f47] text-white"><ArrowRight className="h-2.5 w-2.5" aria-hidden /></span>
              </span>
              <span className="mt-0.5 text-[9.5px] leading-tight text-[#5d6d64]">{mode.body}</span>
            </span>
          </Link>
        </li>
      ))}
    </SendRail>
  );
}

/** G — "Transport for Every Need" promotional band. */
export function SendNeedBand() {
  const items = ["Personal Shipments", "Business Deliveries", "Farm Produce & Food", "Wholesale & Bulk Cargo", "Industrial & Project Logistics", "Relocation & Haulage"];
  return (
    <section aria-labelledby="send-need" className="relative mt-5 overflow-hidden rounded-2xl bg-[#0b5c33] p-4 text-white sm:p-6">
      <div className="relative max-w-[560px]">
        <h2 id="send-need" className="font-display text-[20px] font-extrabold sm:text-[26px]">Transport for Every Need</h2>
        <p className="mt-1 max-w-sm text-[11.5px] leading-5 text-white/85">From small parcels to large industrial cargo, NaijaSend moves it safely, quickly and affordably.</p>
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2 py-1.5 text-[11px] font-semibold">
              <span className="grid h-4 w-4 place-items-center rounded-full bg-[#0b8f47]"><Check className="h-2.5 w-2.5" aria-hidden /></span>{item}
            </li>
          ))}
        </ul>
        <Link href="/naijasend/ship" className="mt-3 inline-flex rounded-full bg-[#f26b21] px-4 py-1.5 text-[11.5px] font-extrabold">Request a shipment →</Link>
      </div>
    </section>
  );
}

const CATEGORIES = [
  { slug: "farm-produce", label: "Farm Produce & Agricultural Goods", icon: Sprout },
  { slug: "food-perishables", label: "Food & Perishables", icon: Refrigerator },
  { slug: "market-retail", label: "Market & Retail Goods", icon: Store },
  { slug: "industrial", label: "Industrial Materials", icon: Factory },
  { slug: "construction", label: "Construction Materials", icon: Boxes },
  { slug: "machinery", label: "Machinery & Equipment", icon: Truck },
  { slug: "ecommerce", label: "E-commerce Packages", icon: Package },
  { slug: "household", label: "Household & Relocation", icon: Building2 }
];

/** H — Ship by Category. Links into the shipment request with the category preselected. */
export function SendCategories({ images, standalone = false }: { images: Record<string, string | null>; standalone?: boolean }) {
  return (
    <section aria-labelledby="send-categories" className="mt-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="send-categories" className="font-display text-[17px] font-extrabold sm:text-[19px]">Ship by Category</h2>
        <Link href="/naijasend/ship" className="text-[11.5px] font-bold text-[#0b5c33] hover:underline">See All Transports →</Link>
      </div>
      <ul className={`grid grid-cols-2 gap-2 sm:grid-cols-4${standalone ? " lg:grid-cols-8" : ""}`}>
        {CATEGORIES.map((cat) => (
          <li key={cat.slug} data-category={cat.slug}>
            <Link href={`/naijasend/quote?cargo=${cat.slug}`} className="flex h-full gap-2 rounded-xl bg-white p-2 ring-1 ring-[#eef1ef] hover:shadow-md">
              <span className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-[#f2f9f0]">
                {images[cat.slug] ? <img src={images[cat.slug] ?? undefined} alt="" loading="lazy" className="h-full w-full object-cover" /> : <span className="grid h-full w-full place-items-center"><cat.icon className="h-5 w-5 text-[#0b5c33]/60" aria-hidden /></span>}
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-extrabold leading-tight">{cat.label}</span>
                <span className="mt-0.5 flex items-center gap-1 text-[9.5px] font-semibold text-[#0b5c33]">Ship <ArrowRight className="h-2.5 w-2.5" aria-hidden /></span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

const STEPS = [
  { n: 1, key: "step-request", title: "Request a Shipment", body: "Tell us what you want to move, from where to where." },
  { n: 2, key: "step-match", title: "Get Matched", body: "Receive quotes from verified transporters that fit your needs." },
  { n: 3, key: "step-pickup", title: "Goods Picked Up", body: "Your goods are collected and securely loaded." },
  { n: 4, key: "step-track", title: "Track in Real Time", body: "Monitor your shipment from pickup to delivery." },
  { n: 5, key: "step-delivered", title: "Delivered", body: "Your goods arrive safely at the destination with proof of delivery." }
];

/** I — How NaijaSend Works. Each step maps to a real system stage. */
export function SendSteps({ images }: { images: Record<string, string | null> }) {
  return (
    <section aria-labelledby="send-steps" className="mt-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="send-steps" className="font-display text-[17px] font-extrabold sm:text-[19px]">How NaijaSend Works</h2>
        <Link href="/naijasend/how-it-works" className="text-[11.5px] font-bold text-[#0b5c33] hover:underline">See Details →</Link>
      </div>
      <ol className="grid grid-cols-2 gap-3 rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef] sm:grid-cols-5">
        {STEPS.map((step, index) => (
          <li key={step.key} className="relative flex flex-col items-center text-center">
            <span className="h-16 w-16 overflow-hidden rounded-full bg-[#f2f9f0] ring-2 ring-[#d6e8d2]">
              {images[step.key.replace("step-", "")] ? <img src={images[step.key.replace("step-", "")] ?? undefined} alt="" loading="lazy" className="h-full w-full object-cover" /> : <span className="grid h-full w-full place-items-center font-display text-lg font-black text-[#0b5c33]">{step.n}</span>}
            </span>
            <span className="mt-1 grid h-4 w-4 place-items-center rounded-full bg-[#0b5c33] text-[9px] font-black text-white">{step.n}</span>
            <p className="mt-0.5 text-[11px] font-extrabold leading-tight">{step.title}</p>
            <p className="mt-0.5 text-[9.5px] leading-tight text-[#5d6d64]">{step.body}</p>
            {index < STEPS.length - 1 ? <ArrowRight className="absolute -right-2 top-7 hidden h-4 w-4 text-[#0b8f47] sm:block" aria-hidden /> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

const SOLUTIONS = [
  { slug: "individuals", label: "For Individuals", body: "Send personal items, packages and household goods anywhere.", href: "/naijasend/ship", icon: User },
  { slug: "businesses", label: "For Businesses", body: "Reliable logistics for traders, shops, SMEs and e-commerce sellers.", href: "/naijasend/quote?customer=business", icon: Store },
  { slug: "farmers", label: "For Farmers", body: "Move farm produce from farms to markets, shops, restaurants and buyers.", href: "/naijafresh/business", icon: Wheat },
  { slug: "manufacturers", label: "For Manufacturers", body: "Transport raw materials, finished goods and equipment.", href: "/naijasend/quote?customer=business", icon: Factory },
  { slug: "institutions", label: "For Institutions", body: "Logistics support for government, NGOs, schools and hospitals.", href: "/naijasend/enterprise", icon: Landmark }
];

/** J — Solutions for Everyone. */
export function SendSolutions({ images }: { images: Record<string, string | null> }) {
  return (
    <SendRail title="Solutions for Everyone" href="/naijasend/solutions" seeAll="See All Solutions">
      {SOLUTIONS.map((sol) => (
        <li key={sol.slug} data-solution={sol.slug} className="w-[190px] shrink-0 snap-start sm:w-[220px]">
          <Link href={sol.href} className="flex h-full flex-col overflow-hidden rounded-xl bg-white ring-1 ring-[#eef1ef] hover:shadow-md">
            <span className="block aspect-[16/9] w-full bg-[#f2f9f0]">
              {images[sol.slug] ? <img src={images[sol.slug] ?? undefined} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}
            </span>
            <span className="flex flex-1 flex-col p-2">
              <span className="flex items-center justify-between">
                <span className="text-[12px] font-extrabold">{sol.label}</span>
                <span className="grid h-4 w-4 place-items-center rounded-full bg-[#0b8f47] text-white"><ArrowRight className="h-2.5 w-2.5" aria-hidden /></span>
              </span>
              <span className="mt-0.5 text-[10px] leading-tight text-[#5d6d64]">{sol.body}</span>
            </span>
          </Link>
        </li>
      ))}
    </SendRail>
  );
}

/** K — promotional banners. */
export function SendPromoBanners({ business, farm }: { business: string | null; farm: string | null }) {
  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <Link href="/naijasend/enterprise" className="group relative overflow-hidden rounded-2xl bg-[#1565c0] p-4 text-white">
        {business ? <img src={business} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" /> : null}
        <span className="absolute inset-0 bg-gradient-to-r from-[#0b3f7a] via-[#0b3f7a]/90 via-45% to-transparent" aria-hidden />
        <span className="relative block max-w-[68%] sm:max-w-[52%]">
          <span className="block font-display text-[18px] font-extrabold text-white drop-shadow">Ship for Your Business</span>
          <span className="mt-1 block text-[11px] leading-snug text-white">Reliable logistics for businesses, traders, farmers, manufacturers and e-commerce sellers.</span>
          <span className="mt-3 inline-flex rounded-full bg-white px-4 py-1.5 text-[11.5px] font-extrabold text-[#0b3f7a]">Get Business Solution →</span>
        </span>
      </Link>
      <Link href="/naijafresh" className="group relative overflow-hidden rounded-2xl bg-[#0b5c33] p-4 text-white">
        {farm ? <img src={farm} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" /> : null}
        <span className="absolute inset-0 bg-gradient-to-r from-[#06401f] via-[#06401f]/90 via-45% to-transparent" aria-hidden />
        <span className="relative block max-w-[68%] sm:max-w-[52%]">
          <span className="block font-display text-[18px] font-extrabold text-white drop-shadow">Ship Farm Produce Nationwide</span>
          <span className="mt-1 block text-[11px] leading-snug text-white">Move fresh farm produce from farms to markets, shops, restaurants and buyers anywhere in Africa.</span>
          <span className="mt-3 inline-flex rounded-full bg-[#f26b21] px-4 py-1.5 text-[11.5px] font-extrabold">Ship Agricultural Goods →</span>
        </span>
      </Link>
    </div>
  );
}

/** L + M — Become a Transporter and Enterprise & Government. */
export function SendTransporterAndEnterprise({ transporter, enterprise }: { transporter: string | null; enterprise: string | null }) {
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <section aria-labelledby="send-transporter" className="flex gap-3 overflow-hidden rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
        <span className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-[#f2f9f0]">{transporter ? <img src={transporter} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}</span>
        <div className="min-w-0">
          <h2 id="send-transporter" className="font-display text-[14px] font-extrabold">Become a Transporter</h2>
          <p className="mt-0.5 text-[10.5px] leading-snug text-[#5d6d64]">Register your own truck, van, car, bike, ship or air cargo service and start earning on NaijaSend.</p>
          <Link href="/naijasend/transporter/apply" className="mt-2 inline-flex rounded-full bg-[#f26b21] px-3 py-1 text-[10.5px] font-extrabold text-white">Register as a Transporter →</Link>
        </div>
      </section>
      <section aria-labelledby="send-enterprise" className="flex gap-3 overflow-hidden rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
        <span className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-[#f2f9f0]">{enterprise ? <img src={enterprise} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}</span>
        <div className="min-w-0">
          <h2 id="send-enterprise" className="font-display text-[14px] font-extrabold">Enterprise &amp; Government Logistics</h2>
          <p className="mt-0.5 text-[10.5px] leading-snug text-[#5d6d64]">Custom logistics solutions, fleet management, freight and supply-chain support for large organisations.</p>
          <Link href="/naijasend/enterprise" className="mt-2 inline-flex rounded-full bg-[#f26b21] px-3 py-1 text-[10.5px] font-extrabold text-white">Request a Corporate Account →</Link>
        </div>
      </section>
    </div>
  );
}

const NETWORK = [
  { key: "motorcycle", label: "Motorcycles", body: "Last-Mile" },
  { key: "car", label: "Cars", body: "Urban & Regional" },
  { key: "van", label: "Vans", body: "Medium Cargo" },
  { key: "truck", label: "Trucks", body: "Bulk & Long-Haul" },
  { key: "air", label: "Airlines", body: "Domestic & International" },
  { key: "sea", label: "Ships", body: "Regional & Global" }
];

/** N — Our Transport Network, plus the mobile app promotion. */
export function SendNetwork({ images, app }: { images: Record<string, string | null>; app: string | null }) {
  return (
    <section aria-labelledby="send-network" className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div>
        <h2 id="send-network" className="mb-2 font-display text-[17px] font-extrabold sm:text-[19px]">Our Transport Network</h2>
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {NETWORK.map((item) => (
            <li key={item.key} className="rounded-xl bg-white p-2 text-center ring-1 ring-[#eef1ef]">
              <span className="mx-auto block h-12 w-full overflow-hidden rounded-lg bg-[#f2f9f0]">{images[item.key] ? <img src={images[item.key] ?? undefined} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}</span>
              <p className="mt-1 text-[10px] font-extrabold leading-tight">{item.label}</p>
              <p className="text-[8.5px] leading-tight text-[#5d6d64]">{item.body}</p>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[9.5px] leading-4 text-[#6b7a70]">Vehicles, aircraft and vessels are operated by independent verified providers, not by NaijaSend.</p>
      </div>
      <div className="overflow-hidden rounded-2xl bg-[#0b5c33] p-3 text-white">
        <h2 className="font-display text-[15px] font-extrabold">NaijaSend Mobile App</h2>
        <p className="mt-0.5 text-[10.5px] leading-snug text-white/85">Book shipments, track deliveries, manage orders and earn on the go.</p>
        {app ? <img src={app} alt="" loading="lazy" className="mt-2 ml-auto h-20 w-auto rounded-lg object-cover" /> : null}
      </div>
    </section>
  );
}

/** P — full footer. */
export function SendFooter() {
  const cols = [
    { title: "Ship", links: [["Book a Shipment", "/naijasend/ship"], ["Track Shipment", "/naijasend/track"], ["Get a Quote", "/naijasend/quote"], ["Shipping Rates", "/naijasend/quote"], ["Delivery Areas", "/naijasend/providers"]] },
    { title: "Transporters", links: [["Become a Transporter", "/naijasend/transporter/apply"], ["Transporter Dashboard", "/naijasend/transporter/dashboard"], ["Earnings & Payouts", "/naijasend/transporter/dashboard"], ["Vehicle Verification", "/naijasend/transporter/apply"], ["Driver Support", "/naijasend/help"]] },
    { title: "Business", links: [["Enterprise Logistics", "/naijasend/enterprise"], ["Bulk & Freight Shipping", "/naijasend/enterprise"], ["Warehousing", "/naijasend/quote?mode=warehouse"], ["Supply Chain Solutions", "/naijasend/enterprise"], ["Government Services", "/naijasend/enterprise"]] },
    { title: "Company", links: [["How It Works", "/naijasend/how-it-works"], ["Our Network", "/naijasend/providers"], ["Careers", mailtoFor("careers", { subject: "Careers at NaijaDeals" })]] },
    { title: "Support", links: [["Help Center", "/naijasend/help"], ["Contact Us", "/naijasend/help"], ["Report an Issue", mailtoFor("support", { subject: "NaijaSend issue" })], ["Disputes & Claims", mailtoFor("support", { subject: "NaijaSend dispute" })], ["Returns & Refunds", mailtoFor("payments", { subject: "NaijaSend refund" })]] }
  ];
  return (
    <footer className="mt-6 bg-[#0b5c33] pb-20 text-white lg:pb-8">
      <div className="mx-auto grid max-w-[1440px] gap-5 px-4 py-7 sm:grid-cols-2 lg:grid-cols-7">
        <div className="sm:col-span-2 lg:col-span-2">
          <p className="flex items-center gap-1.5 font-display text-[18px] font-extrabold"><Package className="h-5 w-5 rounded bg-[#f26b21] p-0.5" aria-hidden /> Naija<span className="text-[#8ed14b]">Send</span></p>
          <p className="mt-1 max-w-[240px] text-[10.5px] leading-snug text-white/75">Africa&apos;s all-in-one logistics marketplace. Move anything, anywhere in Africa — with independent verified providers.</p>
        </div>
        {cols.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <p className="text-[11px] font-extrabold text-[#8ed14b]">{col.title}</p>
            <ul className="mt-1.5 space-y-1">
              {col.links.map(([label, href]) => (
                <li key={label}>
                  {href.startsWith("mailto:") ? (
                    <a href={href} className="break-words text-[10.5px] text-white/80 hover:text-white hover:underline">{label}</a>
                  ) : (
                    <Link href={href} className="text-[10.5px] text-white/80 hover:text-white hover:underline">{label}</Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
        <div>
          <p className="text-[11px] font-extrabold text-[#8ed14b]">NaijaDeals Ecosystem</p>
          <ul className="mt-1.5 space-y-1 text-[10.5px] text-white/80">
            {[["NaijaDeals dashboard", "/"], ["NaijaPay", "/naijapay"], ["NaijaFresh", "/naijafresh"], ["NaijaDrive", "/naijadrive"], ["NaijaEats", "/naijaeats"], ["NaijaShop", "/naijashop"]].map(([label, href]) => (
              <li key={href}><Link href={href} className="hover:text-white hover:underline">{label}</Link></li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-white/15">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2 px-4 py-3 text-[10px] text-white/70">
          <p>© {new Date().getFullYear()} NaijaDeals. NaijaSend is a NaijaDeals Company. All rights reserved.</p>
          <div className="flex flex-wrap items-center gap-3">
            <a href={supportHref("legal", { subject: "Terms of Service" })} className="hover:text-white hover:underline">Terms of Service</a>
            <a href={supportHref("legal", { subject: "Transporter Policy" })} className="hover:text-white hover:underline">Transporter Policy</a>
            <a href={supportHref("legal", { subject: "Shipping Policy" })} className="hover:text-white hover:underline">Shipping Policy</a>
            <a href={supportHref("partners", { subject: "Partner Terms" })} className="hover:text-white hover:underline">Partner Terms</a>
            <span className="rounded-full bg-white/10 px-2 py-0.5">NGN</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

export { Boxes, Clock };
