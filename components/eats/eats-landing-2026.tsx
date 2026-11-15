"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Bike,
  Bus,
  Car,
  ChevronDown,
  Footprints,
  MapPin,
  Menu,
  Send,
  ShoppingBag,
  Truck,
  Utensils,
  UtensilsCrossed,
  X,
  Zap
} from "lucide-react";
import { mailtoFor } from "@/lib/data/contact-directory";

/**
 * Canonical `/naijaeats` landing page.
 *
 * The composition follows the two approved references: a white utility header,
 * a cream split hero with a real address search, compact category tiles, a
 * food-discovery grid, the regional band, a three-step strip, the courier and
 * restaurant recruitment bands, the transport grid, the install prompt and
 * native accordions. Everything links to an existing route; no restaurant,
 * rating, fee or delivery time is invented here.
 */

export type EatsLandingCategory = {
  slug: string;
  label: string;
  imageUrl: string;
  dishes: number;
};

export type EatsLandingCuisine = {
  slug: string;
  label: string;
  restaurants: number;
};

type Props = {
  categories: EatsLandingCategory[];
  cuisines: EatsLandingCuisine[];
  restaurantCount: number;
  featuredDishCount: number;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const NAV_LINKS = [
  { href: "/naijaeats/restaurants", label: "Order food" },
  { href: "/naijaeats/courier", label: "Deliver with us" },
  { href: "/restaurant/apply", label: "Restaurant partners" },
  { href: "/naijaeats/help", label: "Help" }
] as const;

const REGION_ORDER = ["west-african", "east-african", "north-african", "central-african", "southern-african"] as const;

const REGION_FALLBACK: Record<(typeof REGION_ORDER)[number], string> = {
  "west-african": "West African",
  "east-african": "East African",
  "north-african": "North African",
  "central-african": "Central African",
  "southern-african": "Southern African"
};

const DISCOVER_CARDS = [
  {
    label: "Jollof & chicken",
    href: "/naijaeats/restaurants?q=jollof",
    image: "/generated/eats/jollof-feast.webp",
    alt: "A pot of jollof rice with grilled chicken and plantain on a shared table",
    imageClass: "origin-right scale-[1.75] object-[55%_55%]"
  },
  {
    label: "Suya & grills",
    href: "/naijaeats/restaurants?q=suya",
    image: "/generated/eats/family-feast-card.webp",
    alt: "A Nigerian family sharing a table of grilled fish, rice and plantain",
    imageClass: "object-[52%_45%]"
  },
  {
    label: "Soups & swallows",
    href: "/naijaeats/restaurants?category=swallows-and-soups",
    image: "/generated/eats/buka-banner-card.webp",
    alt: "Bowls of Nigerian soup, amala and rice at a local buka",
    imageClass: "origin-bottom-right scale-[1.7] object-[60%_60%]"
  },
  {
    label: "Breakfast favourites",
    href: "/naijaeats/restaurants?category=breakfast",
    image: "/generated/eats/breakfast-feast-card.webp",
    alt: "A Nigerian breakfast of yam, eggs, beans and tea",
    imageClass: "object-[45%_50%]"
  }
] as const;

const STEPS = [
  { title: "Enter your address", copy: "Tell us where you are.", icon: MapPin },
  { title: "Choose your meal", copy: "Browse and pick from great options.", icon: UtensilsCrossed },
  { title: "Follow your delivery", copy: "Get updates as your food makes its way to you.", icon: Bike }
] as const;

const TRANSPORT = [
  { key: "motorcycle", label: "Motorbike", icon: Bike },
  { key: "scooter", label: "Scooter / moped", icon: Bike },
  { key: "electric-motorcycle", label: "Electric motorbike", icon: Zap },
  { key: "bicycle", label: "Bicycle", icon: Bike },
  { key: "electric-bicycle", label: "E-bike", icon: Zap },
  { key: "car", label: "Car", icon: Car },
  { key: "tricycle", label: "Tricycle", icon: Bus },
  { key: "van", label: "Van", icon: Truck },
  { key: "walking", label: "Walking courier", icon: Footprints }
] as const;

const FAQS = [
  {
    question: "Where does NaijaEats deliver?",
    answer:
      "Delivery depends on the city and the restaurants open there. Add your address in the search box to see which kitchens can deliver to you."
  },
  {
    question: "Which transport can I deliver with?",
    answer:
      "Approved options include motorbike, scooter, bicycle, e-bike, car, tricycle, van and walking courier. Requirements and availability vary by city, and every partner needs a suitable food bag and local approval."
  },
  {
    question: "How do I become a delivery partner?",
    answer:
      "Start the delivery-partner application, choose your city and transport, then complete the approval steps. Food-delivery approval does not grant passenger-ride approval."
  },
  {
    question: "How can my restaurant join?",
    answer:
      "Use the restaurant partner journey to submit your kitchen. Onboarding is reviewed before your menu goes live on NaijaEats."
  }
] as const;

const FOOTER_COLUMNS = [
  {
    title: "Customers",
    links: [
      { label: "Order food", href: "/naijaeats/restaurants" },
      { label: "Browse cuisines", href: "#categories" },
      { label: "Help", href: "/naijaeats/help" }
    ]
  },
  {
    title: "Delivery partners",
    links: [
      { label: "Deliver with us", href: "/naijaeats/courier" },
      { label: "Transport options", href: "#delivery-transport" },
      { label: "Partner support", href: "/naijaeats/help" }
    ]
  },
  {
    title: "Restaurants",
    links: [
      { label: "Partner with us", href: "/restaurant/apply" },
      { label: "Restaurant dashboard", href: "/restaurant" },
      { label: "Guidelines", href: "/naijaeats/help" }
    ]
  },
  {
    title: "Help & legal",
    links: [
      { label: "FAQs", href: "#faq" },
      { label: "Order tracking", href: "/naijaeats/orders" },
      { label: "Payment options", href: "/pay" }
    ]
  },
  {
    title: "Contact",
    links: [
      { label: "Customer support", href: mailtoFor("support", { subject: "NaijaEats help" }) },
      { label: "Restaurant partners", href: mailtoFor("partners", { subject: "Restaurant partnership" }) },
      { label: "Courier enquiries", href: mailtoFor("drivers", { subject: "Courier onboarding" }) },
      { label: "Careers", href: mailtoFor("careers", { subject: "Careers at NaijaDeals" }) }
    ]
  }
] as const;

function focusRing() {
  return "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2 focus-visible:ring-offset-white";
}

export function EatsLanding2026({ categories, cuisines, restaurantCount, featuredDishCount }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installInstructions, setInstallInstructions] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const trigger = menuTriggerRef.current;
    const panel = menuPanelRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = () =>
      Array.from(panel?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? []).filter(
        (node) => node.offsetParent !== null
      );
    focusables()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = focusables();
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [menuOpen]);

  const categoryBySlug = new Map(categories.map((category) => [category.slug, category]));
  const cuisineBySlug = new Map(cuisines.map((cuisine) => [cuisine.slug, cuisine]));

  const tile = (slug: string | null, label: string, image: string, alt: string, href: string, imageClass = "") => {
    const category = slug ? categoryBySlug.get(slug) : undefined;
    return {
      key: slug ?? href,
      label,
      image: category?.imageUrl ?? image,
      alt,
      href,
      imageClass,
      count: category?.dishes ?? 0
    };
  };

  const categoryTiles = [
    tile(
      null,
      "Nigerian meals",
      "/generated/eats/jollof-feast-card.webp",
      "Jollof rice with grilled chicken and plantain in a serving pot",
      "/naijaeats/restaurants?cuisine=nigerian",
      "origin-right scale-[1.35] object-[60%_50%]"
    ),
    tile(
      null,
      "Local spots",
      "/generated/eats/buka-banner-card.webp",
      "A local buka serving bowls of Nigerian food",
      "/naijaeats/restaurants?q=local",
      "origin-right scale-[2.1] object-[64%_50%]"
    ),
    tile("breakfast", "Breakfast", "/generated/eats/breakfast-feast-card.webp", "A Nigerian breakfast of yam, eggs, beans and tea", "/naijaeats/restaurants?category=breakfast"),
    tile("grills-bbq", "Grills", "/generated/eats/family-feast-card.webp", "Grilled fish, rice and plantain on a shared family table", "/naijaeats/restaurants?category=grills-bbq", "object-[50%_45%]"),
    tile(
      "swallows-and-soups",
      "Soups & swallows",
      "/generated/eats/nigerian-feast-card.webp",
      "Assorted Nigerian soups, swallows and rice dishes",
      "/naijaeats/restaurants?category=swallows-and-soups"
    ),
    tile("salads-healthy", "Healthy eats", "/generated/eats/healthy-meals-card.webp", "Healthy grilled bowls with vegetables", "/naijaeats/restaurants?category=salads-healthy"),
    tile("desserts", "Desserts", "/generated/eats/dessert-feast-card.webp", "Nigerian cakes, pastries and desserts", "/naijaeats/restaurants?category=desserts"),
    tile(
      "drinks",
      "Drinks",
      "/generated/eats/lagos-twilight-card.webp",
      "A glass of fresh juice beside a Lagos waterfront restaurant",
      "/naijaeats/restaurants?category=drinks",
      "origin-right scale-[1.65] object-[62%_50%]"
    )
  ];

  const regions = REGION_ORDER.map((slug) => {
    const cuisine = cuisineBySlug.get(slug);
    return {
      slug,
      label: cuisine?.label ?? REGION_FALLBACK[slug],
      restaurants: cuisine?.restaurants ?? 0
    };
  });

  const availabilityTitle =
    restaurantCount > 0
      ? `${restaurantCount.toLocaleString("en-NG")} verified restaurants and ${featuredDishCount.toLocaleString("en-NG")} featured dishes are listed.`
      : "Verified restaurants appear here once their menus are published.";

  async function handleInstall() {
    if (!installPrompt) {
      setInstallInstructions(true);
      return;
    }
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setInstallDismissed(true);
    } catch {
      setInstallInstructions(true);
    } finally {
      setInstallPrompt(null);
    }
  }

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-lg focus:bg-[#0b3d24] focus:px-4 focus:text-sm focus:font-bold focus:text-white"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-[#ece7da] bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-2 px-4 sm:px-6">
          <Link href="/naijaeats" aria-label="NaijaEats home" className={`flex min-h-11 shrink-0 items-center gap-2 rounded-lg ${focusRing()}`}>
            <Utensils className="h-7 w-7 text-[#0b5c33]" strokeWidth={2.4} aria-hidden />
            <span className="font-display text-[21px] font-extrabold tracking-[-0.02em] text-[#0b3d24] sm:text-[23px]">NaijaEats</span>
          </Link>

          <nav aria-label="Primary" className="ml-6 hidden items-center gap-6 lg:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`inline-flex min-h-11 items-center text-[13px] font-semibold text-[#26382d] hover:text-[#0b5c33] ${focusRing()}`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto hidden items-center gap-2.5 lg:flex">
            <Link
              href="/naijaeats/restaurants?q=Abuja"
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold text-[#26382d] hover:bg-[#f6f3ea] ${focusRing()}`}
            >
              <MapPin className="h-4 w-4 text-[#0b5c33]" aria-hidden />
              Abuja
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            </Link>
            <Link
              href="/login?next=/naijaeats"
              className={`inline-flex min-h-11 items-center rounded-full px-3 text-[13px] font-semibold text-[#26382d] hover:bg-[#f6f3ea] ${focusRing()}`}
            >
              Log in
            </Link>
            <Link
              href="/naijaeats/restaurants"
              className={`inline-flex min-h-11 items-center rounded-full bg-[#0b5c33] px-5 text-[13px] font-extrabold text-white hover:bg-[#0a4a29] ${focusRing()}`}
            >
              Order now
            </Link>
          </div>

          <div className="ml-auto flex items-center gap-0.5 lg:hidden">
            <Link
              href="/naijaeats/restaurants?q=Abuja"
              className={`inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-[12.5px] font-bold text-[#26382d] ${focusRing()}`}
            >
              <MapPin className="h-4 w-4 text-[#0b5c33]" aria-hidden />
              Abuja
            </Link>
            <button
              ref={menuTriggerRef}
              type="button"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              aria-controls="eats-mobile-menu"
              onClick={() => setMenuOpen(true)}
              className={`grid h-11 w-11 place-items-center rounded-full text-[#0b3d24] hover:bg-[#f6f3ea] ${focusRing()}`}
            >
              <Menu className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>
      </header>

      {menuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} className="absolute inset-0 h-full w-full cursor-default bg-[#06180f]/50" />
          <div
            ref={menuPanelRef}
            id="eats-mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="NaijaEats menu"
            className="absolute inset-y-0 right-0 flex w-[86%] max-w-sm flex-col overflow-y-auto bg-white p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <Link href="/naijaeats" aria-label="NaijaEats home" onClick={() => setMenuOpen(false)} className={`flex items-center gap-2 rounded-lg ${focusRing()}`}>
                <Utensils className="h-6 w-6 text-[#0b5c33]" aria-hidden />
                <span className="font-display text-[20px] font-extrabold text-[#0b3d24]">NaijaEats</span>
              </Link>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
                className={`grid h-11 w-11 place-items-center rounded-full text-[#0b3d24] hover:bg-[#f6f3ea] ${focusRing()}`}
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <nav aria-label="Mobile primary" className="mt-6 space-y-1">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className={`flex min-h-12 items-center justify-between rounded-xl px-3 text-[14px] font-semibold text-[#1f3226] hover:bg-[#f4f2e9] ${focusRing()}`}
                >
                  {link.label}
                  <ArrowRight className="h-4 w-4 text-[#8a938d]" aria-hidden />
                </Link>
              ))}
            </nav>

            <div className="mt-5 border-t border-[#ece7da] pt-4">
              <p className="px-3 text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-[#5f6c62]">Your account</p>
              <div className="mt-1 space-y-1">
                {[
                  { href: "/naijaeats/orders", label: "Your orders" },
                  { href: "/naijaeats/favourites", label: "Favourites" },
                  { href: "/login?next=/naijaeats", label: "Log in" }
                ].map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className={`flex min-h-12 items-center rounded-xl px-3 text-[14px] font-semibold text-[#1f3226] hover:bg-[#f4f2e9] ${focusRing()}`}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>

            <Link
              href="/naijaeats/restaurants"
              onClick={() => setMenuOpen(false)}
              className={`mt-5 inline-flex min-h-12 items-center justify-center rounded-full bg-[#0b5c33] px-5 text-[14px] font-extrabold text-white hover:bg-[#0a4a29] ${focusRing()}`}
            >
              Order now
            </Link>
            <p className="mt-4 text-[11px] leading-5 text-[#5f6c62]">
              Delivering in Abuja. Availability depends on the restaurants open in your area.
            </p>
          </div>
        </div>
      ) : null}

      <main id="main-content">
        <section aria-labelledby="eats-hero-heading" className="bg-[#f8f4e9]">
          <div className="grid items-stretch lg:grid-cols-[0.64fr_1fr]">
            <div className="px-4 pb-7 pt-8 sm:px-6 sm:pb-10 sm:pt-10 lg:flex lg:flex-col lg:justify-center lg:py-6 lg:pl-[max(1.5rem,calc((100vw_-_1180px)/2))] lg:pr-10 xl:py-14">
              <h1
                id="eats-hero-heading"
                className="font-display text-[40px] font-extrabold leading-[1.02] tracking-[-0.035em] text-[#0b3d24] sm:text-[50px] lg:text-[46px] xl:text-[54px]"
              >
                Your favourites.
                <br />
                Delivered.
              </h1>
              <p className="mt-3 max-w-[390px] text-[15px] leading-[1.55] text-[#37473d] sm:text-[16px]">
                Discover restaurants, local kitchens and African flavours near you.
              </p>

              <form action="/naijaeats/restaurants" method="get" className="mt-5 max-w-[430px]">
                <fieldset>
                  <legend className="sr-only">Order type</legend>
                  <div className="flex rounded-full border border-[#e4ddcd] bg-white/70 p-1">
                    <button
                      type="button"
                      aria-pressed="true"
                      className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[#0b5c33] px-3 text-[13px] font-bold text-white ${focusRing()}`}
                    >
                      <Bike className="h-4 w-4" aria-hidden />
                      Delivery
                    </button>
                    <button
                      type="button"
                      disabled
                      aria-pressed="false"
                      title="Pickup ordering is not available yet"
                      className="inline-flex min-h-11 flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-full px-3 text-[13px] font-bold text-[#6b746b]"
                    >
                      <ShoppingBag className="h-4 w-4" aria-hidden />
                      Pickup
                      <span className="sr-only"> (not available yet)</span>
                    </button>
                  </div>
                </fieldset>

                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2 sm:rounded-full sm:border sm:border-[#e4ddcd] sm:bg-white sm:p-1 sm:shadow-sm">
                  <label className="flex min-h-12 items-center gap-2 rounded-full border border-[#e4ddcd] bg-white px-4 shadow-sm sm:flex-1 sm:border-0 sm:shadow-none">
                    <span className="sr-only">Delivery address</span>
                    <MapPin className="h-4 w-4 shrink-0 text-[#8a938d]" aria-hidden />
                    <input
                      id="eats-address"
                      name="address"
                      type="text"
                      autoComplete="street-address"
                      enterKeyHint="search"
                      placeholder="Enter delivery address"
                      className="min-h-11 w-full min-w-0 bg-transparent text-[14px] text-[#14241b] outline-none placeholder:text-[#6b756d] focus-visible:outline-none"
                    />
                  </label>
                  <button
                    type="submit"
                    className={`inline-flex min-h-12 items-center justify-center rounded-full bg-[#0b5c33] px-6 text-[14px] font-extrabold text-white hover:bg-[#0a4a29] ${focusRing()}`}
                  >
                    Find food
                  </button>
                </div>
              </form>
            </div>

            <div className="relative min-h-[240px] overflow-hidden sm:min-h-[320px] lg:min-h-[330px] xl:min-h-[420px]">
              <img
                src="/generated/eats/jollof-feast.webp"
                alt="Jollof rice with grilled chicken and plantain beside a NaijaEats insulated delivery bag"
                fetchPriority="high"
                className="absolute inset-0 h-full w-full origin-right scale-[1.4] object-cover object-[72%_55%]"
              />
            </div>
          </div>
        </section>

        <section id="categories" aria-labelledby="categories-heading" className="mx-auto max-w-[1180px] scroll-mt-24 px-4 pb-2 pt-4 sm:px-6">
          <h2 id="categories-heading" className="sr-only">
            Browse food categories
          </h2>
          <ul className="grid grid-cols-4 gap-x-3 gap-y-4 md:gap-x-4 lg:grid-cols-8">
            {categoryTiles.map((category) => (
              <li key={category.key}>
                <Link
                  href={category.href}
                  aria-label={category.count > 0 ? `${category.label} — ${category.count} dishes` : category.label}
                  className={`group flex h-full flex-col gap-2 rounded-xl ${focusRing()}`}
                >
                  <span className="block aspect-[3/2] w-full overflow-hidden rounded-lg bg-[#efe9dc]">
                    <img
                      src={category.image}
                      alt={category.alt}
                      loading="lazy"
                      className={`h-full w-full object-cover transition duration-300 group-hover:brightness-105 ${category.imageClass}`}
                    />
                  </span>
                  <span className="text-center text-[11.5px] font-bold leading-tight text-[#14241b] sm:text-[13px] xl:text-[13.5px]">
                    {category.label}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section id="discover-near-you" aria-labelledby="discover-heading" className="mx-auto max-w-[1180px] scroll-mt-24 px-4 pt-6 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <h2
              id="discover-heading"
              className="font-display text-[26px] font-extrabold tracking-[-0.02em] text-[#0b3d24] sm:text-[30px] xl:text-[34px]"
            >
              Discover food near you
            </h2>
            <p title={availabilityTitle} className="flex items-center gap-1.5 text-[12px] font-medium text-[#4f5f55] xl:text-[13px]">
              <MapPin className="h-4 w-4 text-[#0b5c33]" aria-hidden />
              Add your address to see available restaurants.
            </p>
          </div>

          <ul className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {DISCOVER_CARDS.map((card) => (
              <li key={card.label}>
                <Link
                  href={card.href}
                  className={`group relative block aspect-[3/2] overflow-hidden rounded-xl bg-[#e9e3d6] lg:aspect-[2.08/1] ${focusRing()}`}
                >
                  <img
                    src={card.image}
                    alt={card.alt}
                    loading="lazy"
                    className={`h-full w-full object-cover transition duration-500 group-hover:scale-[1.03] ${card.imageClass}`}
                  />
                  <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                  <span className="absolute inset-x-0 bottom-0 p-3 text-[13.5px] font-extrabold leading-tight text-white sm:text-[15px]">
                    {card.label}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="regions-heading" className="mt-4 bg-[#f8f4e9]">
          <div className="mx-auto flex max-w-[1180px] flex-col gap-3 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:gap-6">
            <h2
              id="regions-heading"
              className="max-w-[300px] font-display text-[24px] font-extrabold leading-[1.12] tracking-[-0.02em] text-[#0b3d24] sm:text-[26px]"
            >
              From local favourites to African flavours
            </h2>
            <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
              <img
                src="/generated/eats/africa-map-v2.png"
                alt="Illustrated map of Africa with Nigeria marked"
                width={80}
                height={73}
                loading="lazy"
                className="h-14 w-14 shrink-0 object-contain mix-blend-multiply sm:h-16 sm:w-16"
              />
              <ul className="flex min-w-0 flex-1 flex-wrap gap-2 pb-1">
                {regions.map((region) => (
                  <li key={region.slug} className="shrink-0">
                    <Link
                      href={`/naijaeats/restaurants?cuisine=${region.slug}`}
                      title={region.restaurants > 0 ? `${region.restaurants} restaurants listed` : "Restaurants are listed as they join"}
                      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[#e8e1d3] bg-white px-3.5 text-[12px] font-bold text-[#22372b] shadow-sm hover:border-[#0b5c33] xl:text-[12.5px] ${focusRing()}`}
                    >
                      <MapPin className="h-3.5 w-3.5 text-[#c26a28]" aria-hidden />
                      {region.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section aria-labelledby="steps-heading" className="mx-auto max-w-[1180px] px-4 py-5 sm:px-6">
          <h2
            id="steps-heading"
            className="font-display text-[24px] font-extrabold tracking-[-0.02em] text-[#0b3d24] sm:text-center sm:text-[26px]"
          >
            Good food, a few simple steps away
          </h2>
          <ol className="mt-6 grid gap-5 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-[#e6ebe2]">
            {STEPS.map((step) => (
              <li key={step.title} className="flex items-start gap-3 sm:px-6 sm:first:pl-0 sm:last:pr-0">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#edf4e7] text-[#0b5c33]">
                  <step.icon className="h-6 w-6" aria-hidden />
                </span>
                <span className="pt-1">
                  <span className="block text-[14px] font-extrabold text-[#14241b]">{step.title}</span>
                  <span className="mt-0.5 block text-[12px] leading-5 text-[#536259]">{step.copy}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="courier-heading" className="bg-[#0b3d24] text-white">
          <div className="mx-auto grid max-w-[1180px] items-stretch lg:grid-cols-[0.9fr_1.1fr]">
            <div className="px-4 py-7 sm:px-6 lg:flex lg:flex-col lg:justify-center lg:py-10 lg:pl-6 lg:pr-10">
              <h2
                id="courier-heading"
                className="font-display text-[28px] font-extrabold leading-tight tracking-[-0.025em] sm:text-[32px]"
              >
                Deliver food. Move your way.
              </h2>
              <p className="mt-2 max-w-[360px] text-[13px] leading-6 text-white/80">
                Join our delivery community with an approved transport option in your city.
              </p>
              <div className="mt-5 flex flex-wrap gap-2.5">
                <Link
                  href="/naijaeats/courier"
                  className={`inline-flex min-h-11 items-center rounded-full bg-white px-5 text-[13px] font-extrabold text-[#0b3d24] hover:bg-[#f2eee3] ${focusRing()}`}
                >
                  Become a delivery partner
                </Link>
                <a
                  href="#delivery-transport"
                  className={`inline-flex min-h-11 items-center rounded-full border border-white/50 px-5 text-[13px] font-extrabold text-white hover:bg-white/10 ${focusRing()}`}
                >
                  Explore transport options
                </a>
              </div>
            </div>
            <div className="relative min-h-[190px] lg:min-h-[240px]">
              <img
                src="/generated/eats/partners-delivery-v2.png"
                alt="Three NaijaEats delivery partners with a motorbike, bicycle and car, each carrying an insulated food bag"
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover object-[62%_38%]"
              />
            </div>
          </div>
        </section>

        <section
          id="delivery-transport"
          aria-labelledby="transport-heading"
          className="mx-auto max-w-[1180px] scroll-mt-24 px-4 py-7 sm:px-6"
        >
          <div className="lg:grid lg:grid-cols-[250px_1fr] lg:items-center lg:gap-8">
            <div>
              <h2
                id="transport-heading"
                className="font-display text-[22px] font-extrabold leading-tight tracking-[-0.02em] text-[#0b3d24] sm:text-[24px]"
              >
                Transport options for delivery partners
              </h2>
              <p className="mt-2 max-w-[240px] text-[11.5px] leading-5 text-[#536259]">
                Transport options and requirements vary by city. Suitable food bags and local approval required.
              </p>
            </div>
            <ul className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:mt-0 lg:grid-cols-9">
              {TRANSPORT.map((option) => (
                <li key={option.key}>
                  <Link
                    href={`/naijaeats/courier?transport=${option.key}`}
                    className={`flex min-h-[76px] h-full flex-col items-center justify-center gap-1.5 rounded-xl border border-[#e2e8df] bg-[#f5f8f2] px-1 py-2.5 text-center hover:border-[#0b5c33] hover:bg-[#edf4e7] ${focusRing()}`}
                  >
                    <option.icon className="h-[22px] w-[22px] text-[#0b5c33]" aria-hidden />
                    <span className="text-[10px] font-bold leading-tight text-[#14241b]">{option.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="restaurant-partner-heading" className="bg-[#f8f4e9]">
          <div className="mx-auto grid max-w-[1180px] lg:grid-cols-2">
            <div className="relative min-h-[210px] overflow-hidden sm:min-h-[250px] lg:min-h-[260px]">
              <img
                src="/generated/eats/partners-restaurant-v2.png"
                alt="A Nigerian chef handing a takeaway bag to a NaijaEats delivery rider inside a restaurant"
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover object-[58%_45%]"
              />
            </div>
            <div className="px-4 py-7 sm:px-6 lg:flex lg:flex-col lg:justify-center lg:py-8 lg:pl-12 lg:pr-6">
              <h2
                id="restaurant-partner-heading"
                className="font-display text-[26px] font-extrabold leading-tight tracking-[-0.025em] text-[#0b3d24] sm:text-[30px] xl:text-[32px]"
              >
                Your kitchen. More customers.
              </h2>
              <p className="mt-2 max-w-[420px] text-[13px] leading-6 text-[#536259]">
                List your restaurant on NaijaEats and reach more food lovers in your city and beyond.
              </p>
              <Link
                href="/restaurant/apply"
                className={`mt-4 inline-flex min-h-11 w-fit items-center rounded-full bg-[#0b5c33] px-5 text-[13px] font-extrabold text-white hover:bg-[#0a4a29] ${focusRing()}`}
              >
                Partner your restaurant
              </Link>
            </div>
          </div>
        </section>

        <section id="install" aria-labelledby="install-heading" className="mx-auto max-w-[1180px] scroll-mt-24 px-4 py-5 sm:px-6">
          {installDismissed ? null : (
            <div className="rounded-2xl bg-[#e9f2e2] p-4 sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                <div className="lg:w-[290px] lg:shrink-0">
                  <h2 id="install-heading" className="font-display text-[24px] font-extrabold leading-tight tracking-[-0.02em] text-[#0b3d24]">
                    Your cravings, closer.
                  </h2>
                  <p className="mt-1 text-[13px] font-semibold text-[#24382c]">Get the NaijaEats app</p>
                  <p className="text-[12px] leading-5 text-[#4f6055]">Order food, track delivery and earn rewards.</p>
                  <p className="mt-1 text-[11px] leading-5 text-[#5f6f64]">
                    Not in the app stores yet — install this page to your home screen for quick access.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    onClick={handleInstall}
                    aria-controls="install-instructions"
                    aria-expanded={installInstructions}
                    className={`inline-flex min-h-11 items-center justify-center rounded-full bg-[#0b5c33] px-5 text-[13px] font-extrabold text-white hover:bg-[#0a4a29] ${focusRing()}`}
                  >
                    Install NaijaEats
                  </button>
                  <button
                    type="button"
                    onClick={() => setInstallDismissed(true)}
                    className={`inline-flex min-h-11 items-center justify-center rounded-full border border-[#cbd9c4] bg-white px-5 text-[13px] font-bold text-[#22372b] hover:bg-[#f7faf4] ${focusRing()}`}
                  >
                    Continue on web
                  </button>
                </div>
                <ul aria-label="NaijaDeals services" className="ml-auto hidden items-center gap-2 sm:flex">
                  {[
                    { href: "/naijadrive", label: "Ride", icon: Car },
                    { href: "/naijaeats/restaurants", label: "Eat", icon: UtensilsCrossed },
                    { href: "/naijashop", label: "Shop", icon: ShoppingBag },
                    { href: "/naijasend", label: "Send", icon: Send }
                  ].map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-xl bg-white text-[10.5px] font-bold text-[#22372b] hover:bg-[#f7faf4] ${focusRing()}`}
                      >
                        <item.icon className="h-[19px] w-[19px] text-[#0b5c33]" aria-hidden />
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              {installInstructions ? (
                <div id="install-instructions" role="region" aria-label="How to install NaijaEats" className="mt-4 rounded-xl bg-white/85 p-4 text-[12px] leading-5 text-[#435649]">
                  <p className="font-extrabold text-[#14241b]">How to install</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4">
                    <li>Android (Chrome): open the browser menu and choose “Install app” or “Add to Home screen”.</li>
                    <li>iPhone or iPad (Safari): tap Share, then “Add to Home Screen”.</li>
                    <li>Desktop (Chrome or Edge): use the install icon in the address bar.</li>
                    <li>Other browsers: add this page to your home screen from the browser menu.</li>
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </section>

        <section id="faq" aria-labelledby="faq-heading" className="mx-auto max-w-[1180px] scroll-mt-24 px-4 pb-8 pt-2 sm:px-6">
          <div className="lg:grid lg:grid-cols-[320px_1fr] lg:gap-10">
            <div>
              <h2 id="faq-heading" className="font-display text-[24px] font-extrabold tracking-[-0.02em] text-[#0b3d24]">
                Frequently asked questions
              </h2>
              <p className="mt-2 max-w-[280px] text-[12.5px] leading-6 text-[#536259]">
                Quick answers to common questions about ordering, delivering and partnering on NaijaEats.
              </p>
            </div>
            <div className="mt-4 space-y-1.5 lg:mt-0">
              {FAQS.map((faq) => (
                <details key={faq.question} className="group rounded-xl border border-[#e2e8df] bg-white">
                  <summary
                    className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-[12.5px] font-bold text-[#14241b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0b5c33] [&::-webkit-details-marker]:hidden`}
                  >
                    {faq.question}
                    <ChevronDown className="h-4 w-4 shrink-0 text-[#4f6055] transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <p className="px-4 pb-3.5 text-[12.5px] leading-6 text-[#4f6055]">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#0b3d24] text-white">
        <div className="mx-auto max-w-[1180px] px-4 py-8 sm:px-6">
          <div className="grid grid-cols-2 gap-x-6 gap-y-7 sm:grid-cols-2 lg:grid-cols-7 lg:gap-8">
            <div className="col-span-2 lg:col-span-2">
              <Link href="/naijaeats" className={`flex min-h-11 w-fit items-center gap-2 rounded-lg ${focusRing()}`}>
                <Utensils className="h-7 w-7 text-[#9ad185]" aria-hidden />
                <span className="font-display text-[21px] font-extrabold tracking-[-0.02em] text-white">NaijaEats</span>
              </Link>
              <p className="mt-0.5 text-[11px] text-white/60">Part of NaijaDeals</p>
            </div>

            {FOOTER_COLUMNS.map((column) => (
              <div key={column.title}>
                <p className="text-[11.5px] font-bold text-white">{column.title}</p>
                <ul className="mt-1 space-y-0.5">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      {link.href.startsWith("mailto:") ? (
                        <a
                          href={link.href}
                          className={`inline-flex min-h-11 max-w-full items-center break-words text-[11.5px] text-white/70 hover:text-white hover:underline lg:min-h-0 lg:py-1 ${focusRing()}`}
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          className={`inline-flex min-h-11 items-center text-[11.5px] text-white/70 hover:text-white hover:underline lg:min-h-0 lg:py-1 ${focusRing()}`}
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <p className="col-span-2 text-[10.5px] leading-5 text-white/60 lg:col-span-1 lg:text-right">
              © {new Date().getFullYear()} NaijaEats.
              <br className="hidden lg:block" /> All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
