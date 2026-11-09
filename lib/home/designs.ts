import fs from "node:fs";
import path from "node:path";

/**
 * The four homepage designs. Copy, section order and hero slide sets live here;
 * admins may override slides in the database (Control Center → Homepage).
 *
 * Every design links to every vertical — a design may *emphasise* services but
 * never hides one, so the "all services" strip is identical on all four.
 */

export type DesignKey = "original" | "africa-super-app" | "mobility" | "commerce";

export type VerticalLink = { key: string; name: string; href: string; blurb: string; image: string | null; accent: string };

/** Read from public/generated/home; missing files render a labelled panel, never a broken image. */
let manifestCache: { at: number; data: Record<string, string> } | null = null;
function homeManifest() {
  const now = Date.now();
  if (manifestCache && now - manifestCache.at < 60_000) return manifestCache.data;
  try {
    const dir = path.join(process.cwd(), "public", "generated", "home");
    const data: Record<string, string> = {};
    for (const file of fs.readdirSync(dir)) {
      if (/\.(webp|png)$/.test(file)) data[file.replace(/\.(webp|png)$/, "")] = `/generated/home/${file}`;
    }
    manifestCache = { at: now, data };
    return data;
  } catch {
    return {};
  }
}

export function homeImage(id: string | null | undefined) {
  if (!id) return null;
  return homeManifest()[id] ?? null;
}

export const VERTICALS: VerticalLink[] = [
  { key: "shop", name: "NaijaShop", href: "/naijashop", blurb: "Buy & sell products from trusted sellers.", image: homeImage("home-card-shop"), accent: "#0b5c33" },
  { key: "eats", name: "NaijaEats", href: "/naijaeats", blurb: "Order authentic African meals from local restaurants.", image: homeImage("home-card-eats"), accent: "#c4551a" },
  { key: "fresh", name: "NaijaFresh", href: "/naijafresh", blurb: "Fresh farm produce and groceries direct from farmers.", image: homeImage("home-card-fresh"), accent: "#0b7a3b" },
  { key: "drive", name: "NaijaDrive", href: "/naijadrive", blurb: "Rides, deliveries and business transport across Africa.", image: homeImage("home-card-drive"), accent: "#0b5c33" },
  { key: "send", name: "NaijaSend", href: "/naijasend", blurb: "Logistics, courier and freight services.", image: homeImage("home-card-send"), accent: "#6d3bc4" },
  { key: "gigs", name: "NaijaGigs", href: "/naijagigs", blurb: "Hire skilled professionals for home, business and creative services.", image: homeImage("home-card-gigs"), accent: "#1f7a45" },
  { key: "stay", name: "NaijaStay", href: "/naijastay", blurb: "Hotels, short stays, rentals and properties across Africa.", image: homeImage("home-card-stay"), accent: "#c4551a" },
  { key: "stream", name: "NaijaStream", href: "/naijastream", blurb: "Movies, music, live TV and African content.", image: homeImage("home-card-stream"), accent: "#6d3bc4" },
  { key: "pay", name: "NaijaPay", href: "/pay", blurb: "Payments, wallet and transfers with one NaijaPay balance.", image: homeImage("home-card-pay"), accent: "#0b5c33" },
  { key: "aura", name: "Aura AI", href: "/aura-ai", blurb: "Your assistant across NaijaDeals — find, book and pay.", image: homeImage("home-card-aura"), accent: "#6d3bc4" }
];

export type HeroSlide = {
  slug: string;
  headline: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  imageId: string;
  alt: string;
};

/** Shared slide library; each design selects and orders its own subset. */
export const SLIDES: Record<string, HeroSlide> = {
  superapp: { slug: "superapp", headline: "One App for Everything Africa.", body: "Shop, eat, move, send, hire, stay, stream, pay and grow — all on NaijaDeals. Headquartered in Abuja, FCT and Alayi, Abia State.", ctaLabel: "Explore the Ecosystem", ctaHref: "/naijashop", secondaryLabel: "Get the NaijaDeals App", secondaryHref: "/install", imageId: "home-hero-abuja", alt: "Composite illustration of Abuja landmarks: Aso Rock, the National Mosque, the National Christian Centre and the City Gate" },
  drive: { slug: "drive", headline: "Your City. Your Ride. Your Way.", body: "Book a verified NaijaDrive ride in seconds, with fixed fares shown before you confirm.", ctaLabel: "Book a Ride", ctaHref: "/naijadrive", imageId: "home-hero-drive", alt: "A NaijaDrive car with a smiling driver on a Lagos bridge" },
  shop: { slug: "shop", headline: "Everything You Need. One Marketplace.", body: "Buy from verified Nigerian sellers with escrow protection on every order.", ctaLabel: "Shop Now", ctaHref: "/naijashop", imageId: "home-hero-shop", alt: "A shop owner handing a package across a bright marketplace counter" },
  eats: { slug: "eats", headline: "Authentic African Meals, Delivered.", body: "Jollof, egusi with pounded yam, suya, moi moi and more from local kitchens.", ctaLabel: "Order Food", ctaHref: "/naijaeats", imageId: "home-hero-eats", alt: "Nigerian dishes including jollof rice, egusi soup and suya" },
  fresh: { slug: "fresh", headline: "Fresh from African Farms to Your Door.", body: "Buy produce directly from farmers across 13 African countries.", ctaLabel: "Shop Fresh", ctaHref: "/naijafresh", imageId: "home-hero-fresh", alt: "A farmer holding a basket of fresh produce at sunrise" },
  send: { slug: "send", headline: "Move Goods Across Africa.", body: "Trucks, vans and couriers from verified independent providers.", ctaLabel: "Send a Package", ctaHref: "/naijasend", imageId: "home-hero-send", alt: "A freight truck and cargo van loading at an African depot" },
  gigs: { slug: "gigs", headline: "Your Skills. More Opportunities.", body: "Hire verified electricians, developers, chefs and specialists — or find work.", ctaLabel: "Find Work or Hire Talent", ctaHref: "/naijagigs", imageId: "home-hero-gigs", alt: "An electrician, a developer and a chef standing together" },
  stay: { slug: "stay", headline: "Find Your Place Across Africa.", body: "Hotels, serviced apartments and homes with secure NaijaPay booking.", ctaLabel: "Find a Stay", ctaHref: "/naijastay", imageId: "home-hero-stay", alt: "A modern African villa with an infinity pool at dusk" },
  stream: { slug: "stream", headline: "Africa's Sound. Africa's Stories.", body: "Music, films and live shows from African artists and creators.", ctaLabel: "Explore NaijaStream", ctaHref: "/naijastream", imageId: "home-hero-stream", alt: "An African singer recording in a studio" },
  pay: { slug: "pay", headline: "Your Money. Your Possibilities.", body: "One wallet for every NaijaDeals service, with a full transaction history.", ctaLabel: "Explore NaijaPay", ctaHref: "/pay", imageId: "home-hero-pay", alt: "A woman paying with her phone at a market stall" },
  mobility: { slug: "mobility", headline: "Move. Shop. Send. Live. All in One Place.", body: "Rides, deliveries, food and trusted local services — one app, one account.", ctaLabel: "Book a Ride", ctaHref: "/naijadrive", secondaryLabel: "Track a Delivery", secondaryHref: "/naijasend/track", imageId: "home-hero-mobility", alt: "A motorcycle courier and a ride-hailing car on an African city street" },
  commerce: { slug: "commerce", headline: "Discover More. Shop Better. Live Africa.", body: "Products, produce, restaurants, stays and entertainment from African businesses.", ctaLabel: "Start Shopping", ctaHref: "/naijashop", secondaryLabel: "Find a Stay", secondaryHref: "/naijastay", imageId: "home-hero-commerce", alt: "A vibrant African market scene with fabrics and fresh produce" }
};

export type Design = {
  key: DesignKey;
  name: string;
  tagline: string;
  accent: string;
  /** Hero slide order for this design (at least six). */
  slides: HeroSlide[];
  /** Verticals emphasised in this design, in order. */
  emphasis: string[];
  sectionOrder: string[];
};

export const DESIGNS: Record<DesignKey, Design> = {
  original: {
    key: "original",
    name: "Original NaijaDeals",
    tagline: "The established NaijaDeals homepage.",
    accent: "#04140f",
    slides: [SLIDES.drive, SLIDES.shop, SLIDES.eats, SLIDES.fresh, SLIDES.send, SLIDES.stay],
    emphasis: VERTICALS.map((v) => v.key),
    sectionOrder: []
  },
  "africa-super-app": {
    key: "africa-super-app",
    name: "Africa Super-App",
    tagline: "Abuja headquarters, every vertical, one premium front door.",
    accent: "#0b5c33",
    slides: [SLIDES.superapp, SLIDES.drive, SLIDES.shop, SLIDES.eats, SLIDES.fresh, SLIDES.send, SLIDES.gigs, SLIDES.stay, SLIDES.stream, SLIDES.pay],
    emphasis: ["shop", "eats", "fresh", "drive", "send", "gigs", "stay", "stream"],
    sectionOrder: ["hero", "filters", "benefits", "ecosystem", "pay", "deals", "how", "business", "app"]
  },
  mobility: {
    key: "mobility",
    name: "Mobility & Services",
    tagline: "Rides, deliveries and services, first.",
    accent: "#0b5c33",
    slides: [SLIDES.mobility, SLIDES.drive, SLIDES.send, SLIDES.eats, SLIDES.fresh, SLIDES.gigs, SLIDES.stay],
    emphasis: ["drive", "send", "eats", "fresh", "gigs", "stay"],
    sectionOrder: ["hero", "quick", "benefits", "ecosystem", "how", "business", "app"]
  },
  commerce: {
    key: "commerce",
    name: "Commerce & Lifestyle",
    tagline: "Shop, eat, stay and stream.",
    accent: "#c4551a",
    slides: [SLIDES.commerce, SLIDES.shop, SLIDES.eats, SLIDES.fresh, SLIDES.stay, SLIDES.stream, SLIDES.pay],
    emphasis: ["shop", "fresh", "eats", "stay", "stream", "pay"],
    sectionOrder: ["hero", "benefits", "ecosystem", "deals", "pay", "how", "app"]
  }
};

export function designFor(variant: string): Design {
  return DESIGNS[(variant as DesignKey)] ?? DESIGNS.original;
}
