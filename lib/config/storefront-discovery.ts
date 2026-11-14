import { existsSync } from "node:fs";
import path from "node:path";

/**
 * African Discovery storefront configuration contract.
 *
 * This module is the single source of truth for the section's defaults and for
 * the destinations an operator may publish. The public storefront, the admin
 * editor and the server-side validator all read these values so a card cannot
 * quietly point at an external host, an unimplemented route or a missing asset.
 *
 * Types are safe to import from client components (`import type`); the
 * validators touch the filesystem and must only run on the server.
 */

export type StorefrontDiscoveryCard = {
  /** Stable slug used by the admin editor and for DOM/automation attributes. */
  id: string;
  label: string;
  description: string;
  href: string;
  imageUrl: string;
  imageAlt: string;
  enabled: boolean;
  /** 1-based display order. The validator normalises cards to 1..n. */
  sortOrder: number;
};

export type StorefrontDiscoveryLink = {
  label: string;
  href: string;
};

/** African feature categories that may supply the four featured listings. */
export const AFRICAN_FEATURE_SLUGS = [
  "african-print-fabrics",
  "handwoven-dyed-fabrics",
  "shea-natural-butters",
  "traditional-cleansers-black-soap"
] as const;

export const MAX_AFRICAN_FEATURED_PRODUCTS = 4;

/**
 * Implemented internal destinations for discovery cards. Exact-match only:
 * query strings, fragments, protocol-relative URLs and external hosts are
 * rejected by the validator rather than trusted because they start with "/".
 */
export const DISCOVERY_CARD_HREFS = [
  "/naijashop/countries",
  "/naijashop/categories",
  "/sell",
  "/naijasend"
] as const;

export type DiscoveryCardHref = (typeof DISCOVERY_CARD_HREFS)[number];

/**
 * Approved imagery already present in the repository. Operators may only pick
 * these in the editor; the server additionally checks the file exists, so a
 * removed asset fails validation instead of rendering a broken card.
 */
export const DISCOVERY_IMAGE_OPTIONS = [
  {
    url: "/generated/home/home-hero-fresh.webp",
    label: "Farm produce — home hero"
  },
  {
    url: "/generated/shop/category-fashion.webp",
    label: "Fashion — category art"
  },
  {
    url: "/generated/shop/banner-sellers.webp",
    label: "Shop owner — marketplace seller banner"
  },
  {
    url: "/generated/home/home-hero-send.webp",
    label: "Freight yard — home hero"
  }
] as const;

/** The 1–2 sentence intro and three category links the section publishes. */
export const DEFAULT_AFRICAN_DISCOVERY_COPY = {
  eyebrow: "African discovery",
  title: "African print, handwoven cloth and natural care.",
  intro:
    "Explore demonstration listings in African print, handwoven cloth and natural care. Names and imagery are illustrative; origin and maker are not verified.",
  links: [
    { label: "African-print fabrics", href: "/naijashop/c/african-print-fabrics" },
    { label: "Handwoven & dyed", href: "/naijashop/c/handwoven-dyed-fabrics" },
    { label: "Shea & natural butters", href: "/naijashop/c/shea-natural-butters" }
  ] as StorefrontDiscoveryLink[]
};

export const DEFAULT_DISCOVERY_CARDS: StorefrontDiscoveryCard[] = [
  {
    id: "discover-africa",
    label: "Discover Africa",
    description: "Country guides to food, fabrics, landmarks and culture.",
    href: "/naijashop/countries",
    imageUrl: "/generated/home/home-hero-fresh.webp",
    imageAlt: "Farmer holding a basket of fresh vegetables in a field at sunset",
    enabled: true,
    sortOrder: 1
  },
  {
    id: "shop-categories",
    label: "Explore more Shop categories",
    description: "Fashion, electronics, home, groceries and more.",
    href: "/naijashop/categories",
    imageUrl: "/generated/shop/category-fashion.webp",
    imageAlt: "Folded African-print fabric beside a pair of trainers",
    enabled: true,
    sortOrder: 2
  },
  {
    id: "sell-on-naijadeals",
    label: "Sell on NaijaDeals",
    description: "Open a seller account and publish eligible stock.",
    href: "/sell",
    imageUrl: "/generated/shop/banner-sellers.webp",
    imageAlt: "Shop owner standing behind a well-stocked counter",
    enabled: true,
    sortOrder: 3
  },
  {
    id: "deliveries-freight",
    label: "Deliveries & Freight",
    description: "Parcels, produce and larger loads across the ecosystem.",
    href: "/naijasend",
    imageUrl: "/generated/home/home-hero-send.webp",
    imageAlt: "Logistics workers loading a truck and van at a freight yard",
    enabled: true,
    sortOrder: 4
  }
];

/** Internal image paths under the two approved asset roots. */
const IMAGE_PATH = /^\/(generated|uploads)\/(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+\.(webp|png|jpe?g)$/i;

/** Category-slug links rendered inline in the section heading row. */
const AFRICAN_CATEGORY_HREF = /^\/naijashop\/c\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isAllowedDiscoveryCardHref(value: unknown): value is DiscoveryCardHref {
  return typeof value === "string" && (DISCOVERY_CARD_HREFS as readonly string[]).includes(value);
}

export function isAfricanCategoryHref(value: unknown): value is string {
  return typeof value === "string" && value.length <= 200 && AFRICAN_CATEGORY_HREF.test(value);
}

/** Explain an unacceptable image path without echoing filesystem details. */
export function discoveryImagePathError(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return "An image is required.";
  if (value.length > 300) return "Image path is too long.";
  if (value.includes("..") || !IMAGE_PATH.test(value)) return "Images must be approved assets under /generated/ or /uploads/.";
  return null;
}

/**
 * Verify the asset really exists in the served public directory. This runs on
 * the server only; `process.cwd()` is the Next.js project root both in dev and
 * in a standalone deployment that copies `public/`.
 */
export function discoveryImageExists(value: string): boolean {
  const publicRoot = path.resolve(process.cwd(), "public");
  const target = path.resolve(publicRoot, `.${value}`);
  if (!target.startsWith(publicRoot + path.sep)) return false;
  return existsSync(target);
}

/** Approved image choices exposed to the Control Center editor. */
export function discoveryImageOptions() {
  return DISCOVERY_IMAGE_OPTIONS.filter((option) => discoveryImageExists(option.url));
}
