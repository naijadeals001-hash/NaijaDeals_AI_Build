"use client";

import Link from "next/link";
import { ArrowRight, BadgeCheck, Bike, ClipboardCheck, Clock, CreditCard, Globe2, Headset, Package, ShoppingCart, Smartphone, Star, Store, Tag, UserPlus, Wallet } from "lucide-react";
import type { VerticalLink } from "@/lib/home/designs";

/** Shared building blocks for Dashboards 2–4. */

export function ServiceStrip({ accent }: { accent: string }) {
  const items = [
    ["All Services", "/naijashop", ClipboardCheck],
    ["Shop", "/naijashop", ShoppingCart],
    ["Eats", "/naijaeats", Store],
    ["Fresh", "/naijafresh", Store],
    ["Rides", "/naijadrive", Bike],
    ["Send", "/naijasend", Package],
    ["Gigs", "/naijagigs", ClipboardCheck],
    ["Stay", "/naijastay", Store],
    ["Stream", "/naijastream", Smartphone],
    ["Pay", "/pay", Wallet]
  ] as const;
  return (
    <nav aria-label="Services" className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
      {items.map(([label, href, Icon]) => (
        <Link key={label} href={href} className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-[11.5px] font-extrabold text-[#14241b] ring-1 ring-[#e3e8e4] hover:border-transparent hover:shadow-sm" style={{ borderBottom: `2px solid ${accent}` }}>
          <Icon className="h-3.5 w-3.5" style={{ color: accent }} aria-hidden /> {label}
        </Link>
      ))}
    </nav>
  );
}

export function HomeSearchBar({ accent, placeholder = "What are you looking for?" }: { accent: string; placeholder?: string }) {
  return (
    <form action="/search" method="get" role="search" className="mt-2 grid gap-1.5 rounded-2xl bg-white p-2 ring-1 ring-[#e6ebe7] sm:grid-cols-[minmax(0,1fr)_minmax(0,240px)_auto]">
      <label className="flex items-center gap-1.5 rounded-xl bg-[#f6f8f6] px-3 py-2">
        <span className="sr-only">What are you looking for</span>
        <input name="q" placeholder={placeholder} className="w-full bg-transparent text-[12px] text-[#14241b] outline-none" />
      </label>
      <label className="flex items-center gap-1.5 rounded-xl bg-[#f6f8f6] px-3 py-2">
        <Globe2 className="h-3.5 w-3.5 text-[#6b7a70]" aria-hidden />
        <span className="sr-only">Location</span>
        <input name="city" placeholder="Abuja, Lagos, Alayi" className="w-full bg-transparent text-[12px] outline-none" />
      </label>
      <button type="submit" className="rounded-xl px-5 py-2 text-[12px] font-extrabold text-white" style={{ backgroundColor: "#f26b21" }}>
        Search Now →
      </button>
      <span className="sr-only">{accent}</span>
    </form>
  );
}

export function BenefitsStrip() {
  const items = [
    ["Wide Range of Services", "Shop, eat, hire, stay & more", ShoppingCart],
    ["Trusted & Verified", "Sellers and service providers", BadgeCheck],
    ["Secure Payments", "with NaijaPay", CreditCard],
    ["24/7 Support", "Help when you need it", Headset],
    ["Across Africa", "One platform, multiple countries", Globe2]
  ] as const;
  return (
    <section aria-label="Why choose NaijaDeals" className="mt-3 rounded-2xl bg-[#f2f9f0] px-2 py-2.5">
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

export function EcosystemGrid({ verticals, emphasis, variantKey }: { verticals: VerticalLink[]; emphasis: string[]; variantKey: string }) {
  // Emphasised verticals first, then every remaining service — nothing is hidden.
  const ordered = [...verticals].sort((a, b) => {
    const ai = emphasis.indexOf(a.key);
    const bi = emphasis.indexOf(b.key);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  return (
    <section aria-labelledby="ecosystem-heading" className="mt-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id="ecosystem-heading" className="font-display text-[17px] font-extrabold sm:text-[19px]">Explore the NaijaDeals Ecosystem</h2>
        <Link href="/naijashop" className="text-[11.5px] font-bold text-[#0b5c33] hover:underline">View All Services →</Link>
      </div>
      <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {ordered.map((vertical) => (
          <li key={vertical.key} data-ecosystem={vertical.key}>
            <Link
              href={vertical.href}
              onClick={() => {
                const payload = JSON.stringify({ variant: variantKey, kind: "card_click", slide: vertical.key });
                if (navigator.sendBeacon) navigator.sendBeacon("/api/home/metrics", new Blob([payload], { type: "application/json" }));
              }}
              className="group relative flex h-full min-h-[150px] overflow-hidden rounded-xl text-white shadow-sm transition hover:shadow-lg"
              style={{ backgroundColor: vertical.accent }}
            >
              {/* The image fills the card (as in the mockup) and a left-to-right
                  scrim keeps the text readable without washing the photo out. */}
              {vertical.image ? <img src={vertical.image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover object-center transition duration-500 group-hover:scale-105" /> : null}
              <span className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-transparent" aria-hidden />
              <span className="relative flex w-full flex-col p-3">
                <span className="font-display text-[15px] font-extrabold drop-shadow">{vertical.name}</span>
                <span className="mt-0.5 max-w-[72%] text-[10.5px] leading-tight text-white/95">{vertical.blurb}</span>
                <span className="mt-auto pt-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-3 py-1 text-[10.5px] font-extrabold text-[#14241b]">
                    {ctaFor(vertical.key)} <ArrowRight className="h-3 w-3" aria-hidden />
                  </span>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ctaFor(key: string) {
  return ({ shop: "Shop Now", eats: "Order Food", fresh: "Buy Fresh", drive: "Book a Ride", send: "Send a Package", gigs: "Find Talent", stay: "Book a Stay", stream: "Watch & Listen", pay: "Open NaijaPay", aura: "Try Aura AI" } as Record<string, string>)[key] ?? "Open";
}

export function PayPanel({ variantKey }: { variantKey: string }) {
  return (
    <section aria-labelledby="pay-heading" className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <div className="relative overflow-hidden rounded-2xl bg-[#0b5c33] p-4 text-white">
        <h2 id="pay-heading" className="font-display text-[17px] font-extrabold">NaijaPay — One Wallet for All</h2>
        <p className="mt-0.5 max-w-md text-[11px] leading-5 text-white/85">Pay, receive, hold and manage your money across all NaijaDeals services.</p>
        <ul className="mt-2 grid grid-cols-2 gap-1 text-[10.5px]">
          {["Instant payments", "Refunds & payouts", "Escrow protection", "Transaction history"].map((item) => (
            <li key={item} className="flex items-center gap-1"><BadgeCheck className="h-3 w-3 text-[#8ed14b]" aria-hidden />{item}</li>
          ))}
        </ul>
        <Link href="/pay" onClick={() => navigator.sendBeacon?.("/api/home/metrics", new Blob([JSON.stringify({ variant: variantKey, kind: "cta_click", slide: "pay" })], { type: "application/json" }))} className="mt-3 inline-flex rounded-full bg-[#f26b21] px-4 py-1.5 text-[11.5px] font-extrabold">Open NaijaPay →</Link>
      </div>
      <div className="relative overflow-hidden rounded-2xl bg-[#6d3bc4] p-4 text-white">
        <h2 className="font-display text-[17px] font-extrabold">Meet Aura AI ✨</h2>
        <p className="mt-0.5 max-w-sm text-[11px] leading-5 text-white/90">Your assistant on NaijaDeals. Get recommendations, find deals, book services and more.</p>
        <Link href="/aura-ai" className="mt-3 inline-flex rounded-full bg-[#f26b21] px-4 py-1.5 text-[11.5px] font-extrabold">Try Aura AI →</Link>
      </div>
    </section>
  );
}

export type DealItem = { id: string; name: string; slug: string; priceKobo: string; compareKobo: string | null; image: string | null };

/**
 * Deals rail. A "discount" badge appears only when the seller set a genuine
 * compare-at price; otherwise the card shows a plain price.
 */
export function DealsRail({ deals }: { deals: DealItem[] }) {
  if (!deals.length) return null;
  return (
    <section aria-labelledby="deals-heading" className="mt-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id="deals-heading" className="font-display text-[17px] font-extrabold sm:text-[19px]">🔥 Today&apos;s Top Deals &amp; Offers</h2>
        <Link href="/naijashop" className="text-[11.5px] font-bold text-[#0b5c33] hover:underline">View All Deals →</Link>
      </div>
      <ul className="flex snap-x gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none]">
        {deals.map((deal) => {
          const price = Number(deal.priceKobo);
          const compare = deal.compareKobo ? Number(deal.compareKobo) : null;
          const off = compare && compare > price ? Math.round(((compare - price) / compare) * 100) : null;
          return (
            <li key={deal.id} className="w-[46vw] max-w-[200px] shrink-0 snap-start">
              <Link href={`/product/${deal.slug}`} className="block h-full overflow-hidden rounded-xl bg-white ring-1 ring-[#e6ebe7] hover:shadow-md">
                <span className="relative block aspect-square w-full bg-[#f4f6f4]">
                  {deal.image ? <img src={deal.image} alt="" loading="lazy" className="h-full w-full object-contain p-1" /> : null}
                  {off ? <span className="absolute right-1 top-1 rounded bg-[#c81919] px-1.5 py-0.5 text-[9.5px] font-extrabold text-white">-{off}%</span> : null}
                </span>
                <span className="block p-2">
                  <span className="line-clamp-2 text-[11px] font-bold leading-tight">{deal.name}</span>
                  <span className="mt-1 block text-[12.5px] font-extrabold text-[#c4551a]">₦{(price / 100).toLocaleString("en-NG")}</span>
                  {compare ? <span className="text-[10px] text-[#8a938d] line-through">₦{(compare / 100).toLocaleString("en-NG")}</span> : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function HowItWorks({ variantKey }: { variantKey: string }) {
  const steps = [
    ["Sign Up", "Create your free NaijaDeals accounts.", UserPlus],
    ["Choose a Service", "Shop, eat, book, send, hire or stay.", ClipboardCheck],
    ["Pay Securely", "Use NaijaPay for safe and protected payments.", CreditCard],
    ["Get It Done", "Receive your order, service or booking.", Package],
    ["Review & Earn", "Share your experience and enjoy rewards.", Star]
  ] as const;
  return (
    <section aria-labelledby="how-heading" className="mt-5">
      <div className="mb-2 flex items-center justify-between"><h2 id="how-heading" className="font-display text-[17px] font-extrabold sm:text-[19px]">How NaijaDeals Works</h2><Link href="/naijagigs/how-it-works" className="text-[11.5px] font-bold text-[#0b5c33] hover:underline">See Details →</Link></div>
      <ol className="grid grid-cols-2 gap-2 rounded-2xl bg-white p-3 ring-1 ring-[#e6ebe7] sm:grid-cols-5">
        {steps.map(([title, body, Icon], index) => (
          <li key={title} className="flex flex-col items-center text-center">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[#f2f9f0] ring-2 ring-[#d6e8d2]"><Icon className="h-4 w-4 text-[#0b5c33]" aria-hidden /></span>
            <p className="mt-1 text-[10.5px] font-extrabold leading-tight">{index + 1}. {title}</p>
            <p className="mt-0.5 text-[9px] leading-tight text-[#5d6d64]">{body}</p>
          </li>
        ))}
      </ol>
      <span className="sr-only">{variantKey}</span>
    </section>
  );
}

export function BusinessBands() {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <Link href="/sell" className="relative overflow-hidden rounded-2xl bg-[#0b5c33] p-4 text-white">
        <span className="absolute inset-0 bg-[radial-gradient(circle_at_85%_120%,#f26b21,#0b5c33_70%)] opacity-70" aria-hidden />
        <span className="relative block max-w-[70%]">
          <span className="block font-display text-[17px] font-extrabold">Grow Your Business on NaijaDeals</span>
          <span className="mt-1 block text-[10.5px] leading-snug text-white/90">Reach millions of customers across Africa.</span>
          <span className="mt-2 inline-flex rounded-full bg-white px-3 py-1.5 text-[10.5px] font-extrabold text-[#0b5c33]">Start Selling →</span>
        </span>
      </Link>
      <Link href="/partner" className="relative overflow-hidden rounded-2xl bg-[#c4551a] p-4 text-white">
        <span className="absolute inset-0 bg-[radial-gradient(circle_at_85%_120%,#0b5c33,#c4551a_70%)] opacity-80" aria-hidden />
        <span className="relative block max-w-[70%]">
          <span className="block font-display text-[17px] font-extrabold">Become a Service Provider</span>
          <span className="mt-1 block text-[10.5px] leading-snug text-white/95">Offer your skills, services, transport or logistics and earn more.</span>
          <span className="mt-2 inline-flex rounded-full bg-white px-3 py-1.5 text-[10.5px] font-extrabold text-[#c4551a]">Join as a Provider →</span>
        </span>
      </Link>
    </div>
  );
}

export function AppBanner() {
  return (
    <section aria-labelledby="app-heading" className="mt-4 flex flex-col gap-3 rounded-2xl bg-[#0b5c33] p-4 text-white sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 id="app-heading" className="font-display text-[18px] font-extrabold">Take NaijaDeals Everywhere</h2>
        <p className="mt-0.5 text-[11px] text-white/85">Download the NaijaDeals App for a faster, smoother and more personalized experience.</p>
      </div>
      <div className="flex gap-2">
        <Link href="/install" className="flex items-center gap-2 rounded-lg bg-black px-3 py-2 text-[10.5px] font-semibold"><Smartphone className="h-4 w-4" aria-hidden /> App Store / Play</Link>
        <Link href="/install" className="rounded-lg bg-white px-3 py-2 text-[10.5px] font-extrabold text-[#0b5c33]">Install now</Link>
      </div>
    </section>
  );
}

export function HomeFooter() {
  const cols = [
    { title: "Our Services", links: [["NaijaShop", "/naijashop"], ["NaijaEats", "/naijaeats"], ["NaijaFresh", "/naijafresh"], ["NaijaDrive", "/naijadrive"], ["NaijaSend", "/naijasend"], ["NaijaGigs", "/naijagigs"], ["NaijaStay", "/naijastay"], ["NaijaStream", "/naijastream"], ["Aura AI", "/aura-ai"]] },
    { title: "For Users", links: [["How It Works", "/naijagigs/how-it-works"], ["Help Center", "/support"], ["Safety & Trust", "/naijastay/safety"], ["Report an Issue", "/support"]] },
    { title: "For Businesses", links: [["Sell on NaijaDeals", "/sell"], ["List Your Property", "/naijastay/host"], ["Offer a Service", "/partner"], ["Partner With Us", "/partner"]] },
    { title: "Company", links: [["About Us", "/about"], ["News & Updates", "/about"], ["Contact Us", "/support"]] }
  ];
  return (
    <footer className="mt-6 bg-[#0b3d21] pb-20 text-white lg:pb-8">
      <div className="mx-auto grid max-w-[1440px] gap-5 px-4 py-7 sm:grid-cols-2 lg:grid-cols-6">
        <div className="sm:col-span-2">
          <Link href="/" className="font-display text-[18px] font-extrabold">Naija<span className="text-[#f5b52e]">Deals</span></Link>
          <p className="mt-1 max-w-[240px] text-[10.5px] leading-snug text-white/75">Africa&apos;s Super App Marketplace. Headquartered in Abuja, FCT and Alayi, Abia State, Nigeria.</p>
        </div>
        {cols.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <p className="text-[11px] font-extrabold text-[#8ed14b]">{col.title}</p>
            <ul className="mt-1.5 space-y-1">{col.links.map(([label, href]) => <li key={label}><Link href={href} className="text-[10.5px] text-white/80 hover:text-white hover:underline">{label}</Link></li>)}</ul>
          </nav>
        ))}
        <div>
          <p className="text-[11px] font-extrabold text-[#8ed14b]">Our Offices</p>
          <ul className="mt-1.5 space-y-1 text-[10.5px] text-white/80">
            <li>Abuja Head Office — Federal Capital Territory, Nigeria</li>
            <li>Alayi Office — Alayi, Bende LGA, Abia State</li>
          </ul>
        </div>
        <span className="sr-only">Supported by 24/7 operations</span>
      </div>
      <div className="border-t border-white/15">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2 px-4 py-3 text-[10px] text-white/70">
          <p>© {new Date().getFullYear()} NaijaDeals. All rights reserved.</p>
          <div className="flex flex-wrap gap-3">{["Terms of Service", "Privacy Policy", "Refunds & Disputes"].map((label) => <Link key={label} href="/legal" className="hover:text-white hover:underline">{label}</Link>)}</div>
          <span className="rounded-full bg-white/10 px-2 py-0.5">Nigeria · NGN</span>
        </div>
      </div>
    </footer>
  );
}

export function BottomNav() {
  return (
    <nav aria-label="NaijaDeals" className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e6ebe7] bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="grid grid-cols-5">
        {[["Home", "/", Tag], ["Deals", "/naijashop", Tag], ["Services", "/naijashop", ClipboardCheck], ["Wallet", "/pay", Wallet], ["Account", "/account", Star]].map(([label, href, Icon]) => {
          const Glyph = Icon as typeof Tag;
          return (
            <li key={label as string}><Link href={href as string} className="flex flex-col items-center gap-0.5 py-1.5 text-[9.5px] font-semibold text-[#5d6d64]"><Glyph className="h-4 w-4" aria-hidden />{label as string}</Link></li>
          );
        })}
      </ul>
    </nav>
  );
}
