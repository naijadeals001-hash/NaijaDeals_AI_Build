"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowRight, BadgeCheck, Bike, ChevronLeft, ChevronRight, Clock, Headphones, ShieldCheck, Star, UtensilsCrossed } from "lucide-react";

const HERO = "/generated/eats/jollof-delivery-feast.webp";

/** Horizontal rail with arrow controls — used by every carousel in the mockup. */
export function Rail({
  title,
  href,
  children,
  seeAllLabel = "See All"
}: {
  title: string;
  href?: string;
  children: React.ReactNode;
  seeAllLabel?: string;
}) {
  const trackRef = useRef<HTMLUListElement | null>(null);
  const [scroll, setScroll] = useState({ left: 0, max: 1 });

  const sync = () => {
    const node = trackRef.current;
    if (!node) return;
    setScroll({ left: node.scrollLeft, max: Math.max(1, node.scrollWidth - node.clientWidth) });
  };
  const page = (direction: -1 | 1) => {
    const node = trackRef.current;
    if (!node) return;
    node.scrollBy({ left: direction * Math.max(220, node.clientWidth * 0.8), behavior: "smooth" });
    window.setTimeout(sync, 320);
  };

  return (
    <section className="relative mt-6" aria-label={title}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-display text-[17px] font-extrabold text-[#14241b] sm:text-[19px]">{title}</h2>
        {href ? (
          <Link href={href} className="flex items-center gap-1 text-[11.5px] font-bold text-[#0b5c33] hover:underline">
            {seeAllLabel} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        ) : null}
      </div>
      <div className="relative">
        <button
          type="button"
          onClick={() => page(-1)}
          disabled={scroll.left <= 2}
          aria-label={`Scroll ${title} left`}
          className="absolute -left-2 top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 place-items-center rounded-full border border-[#e2e6e3] bg-white text-[#0b5c33] shadow-md disabled:opacity-0 sm:grid"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <ul
          ref={trackRef}
          onScroll={sync}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:none]"
          aria-label={title}
        >
          {children}
        </ul>
        <button
          type="button"
          onClick={() => page(1)}
          disabled={scroll.left >= scroll.max - 2}
          aria-label={`Scroll ${title} right`}
          className="absolute -right-2 top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 place-items-center rounded-full border border-[#e2e6e3] bg-white text-[#0b5c33] shadow-md disabled:opacity-0 sm:grid"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </section>
  );
}

export function EatsHero() {
  return (
    <section className="relative mt-4 overflow-hidden rounded-2xl bg-[#0b5c33]" aria-label="Featured">
      <img src={HERO} alt="" className="absolute inset-0 h-full w-full object-cover opacity-90" fetchPriority="high" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0b5c33] via-[#0b5c33]/85 to-transparent" aria-hidden />
      <div className="relative max-w-[460px] p-5 sm:p-8">
        <p className="flex items-center gap-1.5 font-display text-[20px] font-extrabold text-white sm:text-[24px]">
          Naija<span className="text-[#8ed14b]">Eats</span>
        </p>
        <h1 className="mt-1 font-display text-[24px] font-extrabold leading-tight text-white sm:text-[34px]">
          Africa&apos;s biggest food delivery &amp; restaurant marketplace
        </h1>
        <ul className="mt-3 space-y-1 text-[11.5px] font-semibold text-white/90 sm:text-[12.5px]">
          <li className="flex items-center gap-1.5"><BadgeCheck className="h-4 w-4 text-[#8ed14b]" aria-hidden /> Thousands of restaurants</li>
          <li className="flex items-center gap-1.5"><Bike className="h-4 w-4 text-[#8ed14b]" aria-hidden /> Fast &amp; reliable delivery</li>
          <li className="flex items-center gap-1.5"><UtensilsCrossed className="h-4 w-4 text-[#8ed14b]" aria-hidden /> Authentic African flavours</li>
        </ul>
        <Link href="/naijaeats/restaurants" className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#f26b21] px-5 py-2.5 text-[12.5px] font-extrabold text-white hover:bg-[#dd5f18]">
          Order food now <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}

export function TrustStrip() {
  const items = [
    { icon: Bike, title: "Fast delivery", body: "On time, every time" },
    { icon: ShieldCheck, title: "Safe payments", body: "NaijaPay wallet and escrow" },
    { icon: BadgeCheck, title: "Verified restaurants", body: "Quality and hygiene checked" },
    { icon: Headphones, title: "24/7 support", body: "We are always here" }
  ];
  return (
    <section aria-label="Why order with NaijaEats" className="mt-4 rounded-2xl bg-[#f2f9f0] px-3 py-3">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((item) => (
          <li key={item.title} className="flex items-center gap-2">
            <item.icon className="h-6 w-6 shrink-0 text-[#0b5c33]" aria-hidden />
            <span className="min-w-0">
              <span className="block truncate text-[11.5px] font-extrabold text-[#14241b]">{item.title}</span>
              <span className="block truncate text-[10px] text-[#5d6d64]">{item.body}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CuisineCard({ cuisine }: { cuisine: { slug: string; label: string; blurb: string; imageUrl: string; restaurants: number } }) {
  return (
    <li className="w-[118px] shrink-0 snap-start sm:w-[150px]">
      <Link href={`/naijaeats/restaurants/cuisine/${cuisine.slug}`} className="block rounded-xl bg-white p-2 text-center ring-1 ring-[#eef1ef] transition hover:shadow-md focus-visible:ring-2 focus-visible:ring-[#f26b21]">
        <span className="block aspect-square w-full overflow-hidden rounded-full">
          <img src={cuisine.imageUrl} alt={cuisine.label} loading="lazy" className="h-full w-full object-cover" />
        </span>
        <span className="mt-1.5 block text-[11.5px] font-extrabold text-[#14241b]">{cuisine.label}</span>
        <span className="mt-0.5 block truncate text-[9.5px] leading-tight text-[#6b7a70]">{cuisine.blurb}</span>
      </Link>
    </li>
  );
}

export function DishCategoryCard({ category }: { category: { slug: string; label: string; imageUrl: string; dishes: number } }) {
  return (
    <li className="w-[104px] shrink-0 snap-start sm:w-[124px]">
      <Link href={`/naijaeats/restaurants?category=${category.slug}`} className="block rounded-xl bg-[#fff8f2] p-2 text-center ring-1 ring-[#f6e3d5] transition hover:shadow-md focus-visible:ring-2 focus-visible:ring-[#f26b21]">
        <span className="block aspect-square w-full overflow-hidden rounded-lg">
          <img src={category.imageUrl} alt={category.label} loading="lazy" className="h-full w-full object-cover" />
        </span>
        <span className="mt-1 block truncate text-[10.5px] font-bold text-[#14241b]">{category.label}</span>
      </Link>
    </li>
  );
}

export type CardRestaurant = {
  id: string;
  slug: string;
  name: string;
  cuisine: string;
  market: string;
  logoUrl: string | null;
  coverUrl: string | null;
  rating: { average: number; count: number } | null;
  deliveryWindow: { min: number; max: number } | null;
  itemCount: number;
};

/** Restaurant card used by "Top Restaurants" and "Local Food Vendors". */
export function RestaurantCard({ restaurant, compact = false, inRail = true }: { restaurant: CardRestaurant; compact?: boolean; inRail?: boolean }) {
  const width = inRail ? (compact ? "w-[260px] shrink-0 snap-start sm:w-[300px]" : "w-[280px] shrink-0 snap-start sm:w-[330px]") : "w-full";
  return (
    <li className={width}>
      <Link
        href={`/naijaeats/restaurants/${restaurant.slug}`}
        className="flex h-full items-center gap-3 rounded-xl bg-white p-2.5 ring-1 ring-[#eef1ef] transition hover:shadow-md focus-visible:ring-2 focus-visible:ring-[#f26b21]"
      >
        <span className="block h-[64px] w-[64px] shrink-0 overflow-hidden rounded-full bg-[#f4f6f5]">
          {restaurant.logoUrl || restaurant.coverUrl ? (
            <img src={restaurant.logoUrl ?? restaurant.coverUrl ?? ""} alt={restaurant.name} loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full w-full place-items-center font-display text-lg font-black text-[#0b5c33]/40">{restaurant.name.charAt(0)}</span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1">
            <span className="truncate text-[13px] font-extrabold text-[#14241b]">{restaurant.name}</span>
            <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-[#0b8f47]" aria-label="Verified" />
          </span>
          <span className="mt-0.5 block truncate text-[10.5px] text-[#6b7a70]">{restaurant.cuisine} · {restaurant.market}</span>
          <span className="mt-1 flex flex-wrap items-center gap-2">
            {restaurant.rating ? (
              <span className="flex items-center gap-0.5 text-[11px] font-bold text-[#14241b]">
                <Star className="h-3 w-3 fill-[#f5a623] text-[#f5a623]" aria-hidden />
                {restaurant.rating.average.toFixed(1)}
                <span className="font-normal text-[#6b7a70]">({restaurant.rating.count.toLocaleString("en-NG")})</span>
              </span>
            ) : (
              <span className="text-[10.5px] text-[#8a938d]">No ratings yet</span>
            )}
            <span className="flex items-center gap-1 rounded-full bg-[#e7f6ec] px-2 py-0.5 text-[10px] font-bold text-[#0b5c33]">
              <Clock className="h-3 w-3" aria-hidden />
              {restaurant.deliveryWindow ? `${restaurant.deliveryWindow.min} – ${restaurant.deliveryWindow.max} min` : "Timing set by kitchen"}
            </span>
          </span>
        </span>
      </Link>
    </li>
  );
}

export function PromoRow() {
  const promotions = [
    { title: "Today's Food Deals", body: "Up to 50% off on selected meals.", cta: "View deals", href: "/naijaeats/restaurants", image: "/generated/eats/jollof-feast-card.webp", tone: "from-[#f26b21] to-[#d9551a]" },
    { title: "Free delivery", body: "On orders above ₦3,000 from selected restaurants.", cta: "Order now", href: "/naijaeats/restaurants", image: "/generated/eats/fast-food-feast-card.webp", tone: "from-[#0b8f47] to-[#0b5c33]" },
    { title: "Events & catering", body: "Food for meetings, parties and weddings.", cta: "Request catering", href: "/naijaeats/catering", image: "/generated/eats/family-feast-card.webp", tone: "from-[#e9a11b] to-[#c97f10]" }
  ];
  return (
    <section aria-label="Promotions" className="mt-6 grid grid-flow-col auto-cols-[minmax(260px,85%)] snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:none] sm:auto-cols-[minmax(0,1fr)] sm:grid-flow-row sm:grid-cols-3 sm:overflow-visible">
      {promotions.map((promo) => (
        <Link key={promo.title} href={promo.href} className={`relative block min-h-[118px] snap-start overflow-hidden rounded-xl bg-gradient-to-r ${promo.tone}`}>
          <img src={promo.image} alt="" aria-hidden loading="lazy" className="absolute right-0 top-0 h-full w-[55%] object-cover opacity-90" />
          <span className="relative flex h-full flex-col justify-center gap-1 p-4 pr-[45%] text-white">
            <span className="font-display text-[15px] font-extrabold leading-tight">{promo.title}</span>
            <span className="text-[10.5px] text-white/90">{promo.body}</span>
            <span className="mt-1 w-fit rounded-full bg-white px-3 py-1 text-[10.5px] font-bold text-[#14241b]">{promo.cta}</span>
          </span>
        </Link>
      ))}
    </section>
  );
}

export function MoreWays() {
  const ways = [
    { title: "Dine-In & Reserve", body: "Book a table", href: "/naijaeats/catering" },
    { title: "Pickup", body: "Order ahead", href: "/naijaeats/restaurants" },
    { title: "Group Orders", body: "Order for your team", href: "/naijaeats/catering" },
    { title: "Events & Catering", body: "Parties and weddings", href: "/naijaeats/catering" },
    { title: "Bulk & Corporate", body: "Offices and schools", href: "/naijaeats/catering" }
  ];
  return (
    <section aria-label="More ways to enjoy food" className="mt-6">
      <h2 className="mb-2 font-display text-[17px] font-extrabold text-[#14241b] sm:text-[19px]">More ways to enjoy food on NaijaEats</h2>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {ways.map((way) => (
          <li key={way.title}>
            <Link href={way.href} className="flex h-full flex-col items-center gap-1 rounded-xl bg-[#fdf3ea] px-2 py-3 text-center hover:bg-[#fbe7d6]">
              <UtensilsCrossed className="h-5 w-5 text-[#f26b21]" aria-hidden />
              <span className="text-[11px] font-extrabold leading-tight text-[#14241b]">{way.title}</span>
              <span className="text-[9.5px] text-[#6b7a70]">{way.body}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AppBanner() {
  return (
    <section aria-label="Get the NaijaEats app" className="mt-6 overflow-hidden rounded-2xl bg-[#0b5c33]">
      <div className="flex flex-col items-center gap-3 p-4 sm:flex-row sm:p-6">
        <img src="/generated/eats/fast-food-feast-card.webp" alt="" aria-hidden className="hidden h-24 w-24 rounded-xl object-cover sm:block" />
        <div className="text-center sm:text-left">
          <p className="font-display text-[17px] font-extrabold text-white">Get the NaijaEats app</p>
          <p className="mt-0.5 text-[11.5px] text-white/80">Order food, track delivery and earn rewards.</p>
          <p className="mt-1 text-[10px] text-[#8ed14b]">
            The app is not published to the stores yet — save this page to your home screen for the same experience.
          </p>
        </div>
      </div>
    </section>
  );
}
