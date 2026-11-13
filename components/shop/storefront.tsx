"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Boxes,
  Leaf,
  ShieldCheck,
  Store,
  Truck
} from "lucide-react";
import { apiClient, type ApiCategory, type ApiProduct } from "@/lib/api-client";
import { getPublicTaxonomy, type PublicTaxonomyNode } from "@/lib/taxonomy-api";
import { MarketplaceProductCard } from "./marketplace-card";
import { announceShopCartCount } from "./shop-header";

/**
 * Acceptance suites create throwaway listings named "Variant Fixture …",
 * "Test checkout …", "Last unit …" and similar. They are real database rows but
 * never part of the storefront, so they must not appear in any shelf or pick.
 */
const TEST_LISTING = /^(variant fixture|test |upload test|last unit|product test)\b|-mw[0-9a-z]{8,}$/i;

type StorefrontConfig = {
  showHero?: boolean;
  showShelves?: boolean;
  shelfLimit?: number;
};

type PublicTaxonomyNodeWithCounts = PublicTaxonomyNode & {
  productCount?: unknown;
  subtreeProductCount?: unknown;
  descendantProductCount?: unknown;
  canPublish?: unknown;
};

function finiteCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

type Department = {
  id: string;
  name: string;
  slug: string;
  imageUrl?: string | null;
  description?: string | null;
  isSelectable?: boolean;
  showOnHomepage?: boolean;
  productCount?: number | null;
  subtreeProductCount?: number | null;
  canPublish?: boolean | null;
  children?: Department[];
};

function toDepartment(node: PublicTaxonomyNode): Department {
  const extended = node as PublicTaxonomyNodeWithCounts;
  return {
    id: node.id,
    name: node.name,
    slug: node.slug,
    imageUrl: node.imageUrl ?? null,
    description: node.description ?? null,
    isSelectable: node.isSelectable !== false,
    showOnHomepage: node.showOnHomepage === true,
    productCount: finiteCount(extended.productCount),
    subtreeProductCount: finiteCount(extended.subtreeProductCount) ?? finiteCount(extended.descendantProductCount),
    canPublish: typeof extended.canPublish === "boolean" ? extended.canPublish : null,
    children: (node.children ?? []).map(toDepartment)
  };
}

/** Every node in the published tree, in publication order. */
function flattenDepartments(nodes: Department[]): Department[] {
  const rows: Department[] = [];
  for (const node of nodes) {
    rows.push(node);
    rows.push(...flattenDepartments(node.children ?? []));
  }
  return rows;
}

function departmentSlugs(department: Department): string[] {
  const slugs = [department.slug];
  for (const child of department.children ?? []) slugs.push(...departmentSlugs(child));
  return slugs;
}

/**
 * Expand a shelf's taxonomy roots into real published slugs. A root that is not
 * in the current tree falls back to its own slug so a catalogue with a missing
 * directory never takes unrelated listings from another department.
 */
function subtreeSlugs(departments: Department[], rootSlugs: string[]): string[] {
  const bySlug = new Map(departments.map((department) => [department.slug, department]));
  const slugs = new Set<string>();
  for (const rootSlug of rootSlugs) {
    const node = bySlug.get(rootSlug);
    if (node) {
      for (const slug of departmentSlugs(node)) slugs.add(slug);
    } else {
      slugs.add(rootSlug);
    }
  }
  return [...slugs];
}

function findDepartment(departments: Department[], slug: string): Department | null {
  return departments.find((department) => department.slug === slug) ?? null;
}

/** Leaf slug → top-level department slug, used to vary the Explore shelf. */
function rootSlugMap(departments: Department[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const root of departments) {
    for (const slug of departmentSlugs(root)) map.set(slug, root.slug);
  }
  return map;
}

type Shortcut = { label: string; slug: string };

/**
 * Short, fixed entry points into published taxonomy pages. Every tile is only
 * rendered when its node exists in the taxonomy response, so a shortcut can
 * never point at a department that is not open.
 */
const SHORTCUTS: Shortcut[] = [
  { label: "Phones", slug: "phones-tablets" },
  { label: "Computers", slug: "computers" },
  { label: "Fashion", slug: "fashion-accessories" },
  { label: "Home", slug: "home-kitchen" },
  { label: "Groceries", slug: "groceries-household" },
  { label: "Beauty", slug: "beauty-personal-care" },
  { label: "Solar", slug: "power-solar" },
  { label: "Gaming", slug: "gaming" }
];

type ShelfDefinition = {
  id: string;
  title: string;
  description: string;
  rootSlugs: string[];
  href: string;
  linkLabel: string;
};

/**
 * Retail shelves are defined by taxonomy roots and rendered with descendant
 * aggregation. Titles intentionally match the departments they draw from; a
 * shelf with no eligible listing is omitted rather than padded with unrelated
 * products or a placeholder card.
 */
const SHELF_GROUPS: ShelfDefinition[] = [
  {
    id: "phones-computing",
    title: "Phones & computing",
    description: "Phones, tablets, laptops and computer accessories.",
    rootSlugs: ["phones-tablets", "computers"],
    href: "/naijashop/c/electronics-technology",
    linkLabel: "All electronics"
  },
  {
    id: "home-kitchen",
    title: "Home, kitchen & appliances",
    description: "Cookware, storage, tableware and small kitchen appliances.",
    rootSlugs: ["home-kitchen", "small-appliances"],
    href: "/naijashop/c/home-kitchen",
    linkLabel: "All home & kitchen"
  },
  {
    id: "fashion-accessories",
    title: "Fashion & accessories",
    description: "Clothing, footwear, bags and watches.",
    rootSlugs: ["fashion-accessories"],
    href: "/naijashop/c/fashion-accessories",
    linkLabel: "All fashion"
  },
  {
    id: "groceries",
    title: "Groceries & everyday essentials",
    description: "Fresh produce, grains, cassava products, oils and pantry staples.",
    rootSlugs: ["groceries-household", "grains-flours", "oils-soups-seasonings"],
    href: "/naijashop/c/food-everyday-essentials",
    linkLabel: "All food & essentials"
  },
  {
    id: "power-solar",
    title: "Power & solar",
    description: "Solar panels, inverters, batteries and backup power.",
    rootSlugs: ["power-solar"],
    href: "/naijashop/c/power-solar",
    linkLabel: "All power & solar"
  },
  {
    id: "beauty-personal-care",
    title: "Beauty & personal care",
    description: "Skincare, hair care and fragrance.",
    rootSlugs: ["beauty-personal-care"],
    href: "/naijashop/c/beauty-personal-care",
    linkLabel: "All beauty"
  },
  {
    id: "gaming",
    title: "Gaming",
    description: "Controllers and gaming accessories.",
    rootSlugs: ["gaming"],
    href: "/naijashop/c/gaming",
    linkLabel: "All gaming"
  }
];

/**
 * One listing per African discovery category. These are demonstration rows;
 * the section repeats the seller's own item name and image and never adds an
 * origin, maker or material claim the listing has not recorded.
 */
const AFRICAN_FEATURE_SLUGS = [
  "african-print-fabrics",
  "handwoven-dyed-fabrics",
  "shea-natural-butters",
  "traditional-cleansers-black-soap"
];

type ShelfView = {
  id: string;
  title: string;
  description: string;
  href: string;
  linkLabel: string;
  slugs: string[];
};

type Notice = { text: string; tone: "success" | "error" } | null;

function availableUnits(product: ApiProduct): number | null {
  if (typeof product.available === "number") return product.available;
  const activeVariants = (product.variants ?? []).filter((variant) => variant.isActive);
  if (activeVariants.length > 0) {
    return activeVariants.reduce((total, variant) => total + Math.max(variant.stock - variant.reserved, 0), 0);
  }
  if (product.stock) return Math.max(product.stock.quantity - (product.stock.reserved ?? 0), 0);
  return null;
}

/** Landing shelves only show listings with a real image and available stock. */
function shelfEligible(product: ApiProduct): boolean {
  const available = availableUnits(product);
  if (available !== null && available <= 0) return false;
  return Boolean(product.images?.[0]?.url);
}

function productNameKey(product: ApiProduct): string {
  return product.name.trim().toLowerCase();
}

function naira(value: number) {
  return `₦${new Intl.NumberFormat("en-NG", { maximumFractionDigits: 2 }).format(value / 100)}`;
}

/**
 * Spread the Explore shelf across top-level departments instead of repeating
 * one category. It runs last, so the named retail shelves keep their first
 * choice of eligible listings and no product appears twice on the landing.
 */
function pickExplore(
  products: ApiProduct[],
  claimedIds: Set<string>,
  claimedNames: Set<string>,
  departments: Department[],
  limit: number
): ApiProduct[] {
  const remaining = products.filter(
    (product) => !claimedIds.has(product.id) && !claimedNames.has(productNameKey(product)) && shelfEligible(product)
  );
  if (remaining.length <= limit) return remaining;

  const rootOf = rootSlugMap(departments);
  const buckets = new Map<string, ApiProduct[]>();
  for (const product of remaining) {
    const root = rootOf.get(product.category?.slug ?? "") ?? "other";
    const bucket = buckets.get(root);
    if (bucket) bucket.push(product);
    else buckets.set(root, [product]);
  }

  const roots = departments.map((department) => department.slug);
  const order = [...roots, ...[...buckets.keys()].filter((slug) => !roots.includes(slug))];
  const picks: ApiProduct[] = [];
  let added = true;
  while (picks.length < limit && added) {
    added = false;
    for (const root of order) {
      if (picks.length >= limit) break;
      const bucket = buckets.get(root);
      if (bucket && bucket.length > 0) {
        picks.push(bucket.shift() as ApiProduct);
        added = true;
      }
    }
  }
  return picks;
}

/**
 * NaijaDeals Marketplace storefront.
 *
 * Retail discovery comes first: a compact hero, real taxonomy shortcuts and
 * populated product shelves rendered before any wholesale content. The page
 * reuses the working catalogue, cart, address and storefront-config fetches; it
 * does not invent stock, discounts, ratings, delivery times or wholesale
 * pricing. Demonstration listings are labelled on every card, and bulk buying
 * still starts with a producer quote and independent freight.
 */
export function NaijaDealsMarketplace() {
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [categoriesStatus, setCategoriesStatus] = useState<"loading" | "ready" | "error">("loading");
  const [taxonomyTree, setTaxonomyTree] = useState<Department[]>([]);
  const [taxonomyStatus, setTaxonomyStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [addingId, setAddingId] = useState("");
  const [addedId, setAddedId] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [config, setConfig] = useState<StorefrontConfig>({});
  const [missingArt, setMissingArt] = useState<Record<string, boolean>>({});

  const markMissing = (key: string) => setMissingArt((current) => (current[key] ? current : { ...current, [key]: true }));

  useEffect(() => {
    let active = true;
    setStatus("loading");
    setError("");

    apiClient
      .getProducts()
      .then((items) => {
        if (!active) return;
        const list = Array.isArray(items) ? items : [];
        setProducts(
          list.filter(
            (product) =>
              !product.isSample && !TEST_LISTING.test(product.name) && !TEST_LISTING.test(product.slug ?? "")
          )
        );
        setStatus("ready");
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "The marketplace catalogue could not be loaded.");
        setStatus("error");
      });

    apiClient
      .getCategories()
      .then((items) => {
        if (!active) return;
        setCategories(Array.isArray(items) ? items : []);
        setCategoriesStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setCategoriesStatus("error");
      });

    getPublicTaxonomy()
      .then(({ departments: roots }) => {
        if (!active) return;
        setTaxonomyTree(roots.map(toDepartment));
        setTaxonomyStatus("ready");
      })
      .catch(() => {
        if (active) setTaxonomyStatus("error");
      });

    fetch("/api/storefront", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => {
        if (active && value) setConfig(value as StorefrontConfig);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [reloadKey]);

  const showHero = config.showHero !== false;
  const showShelves = config.showShelves !== false;
  const shelfLimit = Math.min(Math.max(config.shelfLimit && config.shelfLimit > 0 ? config.shelfLimit : 4, 1), 8);

  // Prefer the published taxonomy; then the canonical department directory; if
  // both fail, derive departments from the live products so navigation still
  // works rather than disappearing.
  const departments = useMemo<Department[]>(() => {
    if (taxonomyTree.length > 0) return taxonomyTree;
    if (categories.length > 0) {
      return categories.map((category) => {
        const extended = category as ApiCategory & { imageUrl?: string | null; productCount?: unknown };
        const count = finiteCount(extended.productCount);
        return {
          id: category.id,
          name: category.name,
          slug: category.slug,
          imageUrl: extended.imageUrl ?? null,
          productCount: count,
          subtreeProductCount: count
        };
      });
    }
    const map = new Map<string, Department>();
    for (const product of products) {
      const category = product.category;
      if (!category || map.has(category.slug)) continue;
      map.set(category.slug, { id: category.id, name: category.name, slug: category.slug, imageUrl: null });
    }
    return [...map.values()];
  }, [taxonomyTree, categories, products]);

  const allDepartments = useMemo(() => flattenDepartments(departments), [departments]);

  const shortcutNodes = useMemo(
    () =>
      SHORTCUTS.map((shortcut) => ({ ...shortcut, node: findDepartment(allDepartments, shortcut.slug) })).filter(
        (shortcut): shortcut is Shortcut & { node: Department } => Boolean(shortcut.node)
      ),
    [allDepartments]
  );

  const demoCount = useMemo(() => products.filter((product) => product.isDemo).length, [products]);

  const listingFact =
    status === "ready"
      ? demoCount === products.length && products.length > 0
        ? `${products.length} demonstration ${products.length === 1 ? "listing" : "listings"}. Prices, stock and seller names are illustrative.`
        : `${products.length} published ${products.length === 1 ? "listing" : "listings"}${
            demoCount > 0 ? `, including ${demoCount} labelled demonstration ${demoCount === 1 ? "listing" : "listings"}` : ""
          }.`
      : status === "loading"
        ? "Loading the published catalogue…"
        : "The catalogue is unavailable right now.";

  /**
   * Claiming order is explicit: African feature first, then named shelves in
   * their retail order, then Explore from the remainder. This guarantees no
   * product repeats across shelves and keeps the first shelf a varied mix.
   */
  const discovery = useMemo(() => {
    const claimedIds = new Set<string>();
    const claimedNames = new Set<string>();
    const claim = (product: ApiProduct) => {
      claimedIds.add(product.id);
      claimedNames.add(productNameKey(product));
    };
    const isClaimed = (product: ApiProduct) =>
      claimedIds.has(product.id) || claimedNames.has(productNameKey(product));

    const african = AFRICAN_FEATURE_SLUGS.map((slug) =>
      products.find((product) => product.category?.slug === slug && shelfEligible(product))
    ).filter((product): product is ApiProduct => Boolean(product));
    african.forEach(claim);

    const shelves: Array<{ shelf: ShelfView; items: ApiProduct[] }> = [];
    for (const definition of SHELF_GROUPS) {
      const slugs = subtreeSlugs(allDepartments, definition.rootSlugs);
      const allowed = new Set(slugs);
      const items = products
        .filter((product) => !isClaimed(product) && shelfEligible(product) && allowed.has(product.category?.slug ?? ""))
        .slice(0, shelfLimit);
      if (items.length === 0) continue;
      items.forEach(claim);
      shelves.push({
        shelf: {
          id: definition.id,
          title: definition.title,
          description: definition.description,
          href: definition.href,
          linkLabel: definition.linkLabel,
          slugs
        },
        items
      });
    }

    const exploreItems = pickExplore(products, claimedIds, claimedNames, departments, shelfLimit);

    return { african, shelves, exploreItems };
  }, [products, departments, allDepartments, shelfLimit]);

  // Listings with enough stock for a business enquiry. The unit price shown on
  // the listing is retail; any wholesale price must come from the seller.
  const bulkStock = useMemo(() => {
    const seen = new Set<string>();
    return products
      .filter((product) => {
        if (product.saleMode === "contact") return false;
        const available = availableUnits(product);
        return available !== null && available >= 20;
      })
      .sort((a, b) => (availableUnits(b) ?? 0) - (availableUnits(a) ?? 0))
      .filter((product) => {
        const key = product.name.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 3);
  }, [products]);

  async function addToCart(product: ApiProduct) {
    if ((product.variants ?? []).some((variant) => variant.isActive)) return;
    setAddingId(product.id);
    setNotice(null);
    try {
      const cart = await apiClient.addCartItem(product.id, 1);
      // Publish the server's cart total to the shared header badge.
      announceShopCartCount(cart.items.filter((item) => !item.savedForLater).reduce((sum, item) => sum + item.quantity, 0));
      setNotice({ text: `${product.name} added to your cart.`, tone: "success" });
      setAddedId(product.id);
      window.setTimeout(() => setAddedId(""), 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not add to cart.";
      setNotice({
        text: /sign in|unauthor|401/i.test(message) ? "Sign in to add items to your cart." : message,
        tone: "error"
      });
    } finally {
      setAddingId("");
    }
  }

  const exploreShelf: ShelfView = {
    id: "explore",
    title: "Explore the marketplace",
    description: "A cross-department mix of eligible demonstration listings.",
    href: "/naijashop/categories",
    linkLabel: "Browse all listings",
    slugs: []
  };

  return (
    <div className="w-full max-w-full bg-[#f4f7f2] text-[#14241b]">
      <div className="mx-auto w-full max-w-[1440px] px-3 pb-10 pt-1 sm:px-6 lg:px-8">
        {notice ? (
          <div
            role={notice.tone === "error" ? "alert" : "status"}
            className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-4 py-3 text-[12px] font-semibold ${
              notice.tone === "error"
                ? "border-[#f0c8c2] bg-[#fdf2f0] text-[#8a1c14]"
                : "border-[#cbe4d2] bg-[#e9f6ee] text-[#0b5c2e]"
            }`}
          >
            <span>{notice.text}</span>
            <span className="flex items-center gap-3">
              {notice.tone === "success" ? (
                <Link href="/cart" className="text-[11px] font-extrabold underline">
                  View cart
                </Link>
              ) : null}
              <button type="button" onClick={() => setNotice(null)} className="text-[11px] font-bold underline">
                Dismiss
              </button>
            </span>
          </div>
        ) : null}

        {/* Compact, full-width retail entrance. Wholesale no longer shares this row. */}
        <section
          aria-labelledby="marketplace-hero-heading"
          data-storefront-hero
          className={`mt-4 overflow-hidden rounded-[24px] ${
            showHero ? "relative bg-[#07351f]" : "border border-[#e1e8de] bg-white"
          }`}
        >
          {showHero ? (
            <>
              {!missingArt["/generated/shop/hero-desktop.webp"] ? (
                <img
                  src="/generated/shop/hero-desktop.webp"
                  alt=""
                  fetchPriority="high"
                  onError={() => markMissing("/generated/shop/hero-desktop.webp")}
                  className="absolute inset-0 h-full w-full object-cover object-[72%_center] sm:object-[66%_center]"
                />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-r from-[#041f12] via-[#041f12]/90 to-[#041f12]/10" aria-hidden />
              <div className="relative flex flex-col justify-between gap-5 px-5 py-5 sm:px-8 sm:py-8 lg:px-10 lg:py-9">
                <div className="max-w-[36rem]">
                  <p className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[9.5px] font-extrabold uppercase tracking-[0.16em] text-[#f5b52e] ring-1 ring-white/15">
                    <Store className="h-3 w-3" aria-hidden />
                    Retail marketplace
                  </p>
                  <h1
                    id="marketplace-hero-heading"
                    className="mt-3 font-display text-[28px] font-extrabold leading-[1.08] tracking-[-0.02em] text-white sm:text-[36px] lg:text-[42px]"
                  >
                    Everyday retail, from sellers you can check.
                  </h1>
                  <p className="mt-2.5 max-w-lg text-[12px] leading-5 text-white/80 sm:text-[13px] sm:leading-6">
                    Shop phones, fashion, home, groceries and more. Demonstration listings are labelled, and checkout uses your
                    NaijaDeals account.
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    <Link
                      href="/naijashop/categories"
                      className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-[#f5b52e] px-2 text-[11px] font-extrabold text-[#14241b] transition hover:bg-[#ffd15e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#07351f] sm:gap-2 sm:px-5 sm:text-[12px]"
                    >
                      Browse departments
                      <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                    </Link>
                    <Link
                      href="/naijashop/help"
                      className="inline-flex h-11 items-center justify-center rounded-full border border-white/30 bg-white/5 px-2 text-[11px] font-bold text-white transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:px-5 sm:text-[12px]"
                    >
                      How buying works
                    </Link>
                  </div>
                </div>
                <ul className="mt-4 hidden flex-wrap gap-x-4 gap-y-2 text-[10px] font-semibold text-white/85 sm:flex sm:text-[10.5px]">
                  <li className="flex items-center gap-1.5">
                    <BadgeCheck className="h-3.5 w-3.5 text-[#8ed14b]" aria-hidden />
                    Demonstration listings labelled
                  </li>
                  <li className="flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-[#8ed14b]" aria-hidden />
                    Escrow-protected checkout
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Truck className="h-3.5 w-3.5 text-[#8ed14b]" aria-hidden />
                    Tracked delivery
                  </li>
                </ul>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-3 px-5 py-6 sm:px-8 sm:py-8 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <p className="text-[9.5px] font-extrabold uppercase tracking-[0.16em] text-[#0f7a4a]">NaijaDeals Marketplace</p>
                <h1 id="marketplace-hero-heading" className="mt-2 font-display text-[28px] font-extrabold leading-tight tracking-tight text-[#14241b] sm:text-[36px]">
                  Everyday retail, from sellers you can check.
                </h1>
                <p className="mt-2 text-[12.5px] leading-6 text-[#4b5b51]">
                  Browse published seller listings by department. Demonstration inventory is labelled and checkout uses your
                  NaijaDeals account.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href="/naijashop/categories" className="inline-flex h-11 items-center gap-2 rounded-full bg-[#07351f] px-5 text-[12px] font-extrabold text-white">
                  Browse departments <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link href="/naijashop/help" className="inline-flex h-11 items-center rounded-full border border-[#b9cbb4] px-5 text-[12px] font-extrabold text-[#0b5c33]">
                  How buying works
                </Link>
              </div>
            </div>
          )}
        </section>

        {/* Compact taxonomy shortcuts; the full hierarchy stays in All departments. */}
        {taxonomyStatus === "ready" && shortcutNodes.length > 0 ? (
          <section aria-labelledby="category-shortcuts-heading" className="mt-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id="category-shortcuts-heading" className="font-display text-[19px] font-extrabold tracking-tight text-[#14241b] sm:text-[21px]">
                  Shop by category
                </h2>
                <p className="mt-0.5 text-[10.5px] leading-5 text-[#566359]">{listingFact}</p>
              </div>
              <Link
                href="/naijashop/categories"
                className="inline-flex items-center gap-1 rounded text-[11px] font-extrabold text-[#0b5c33] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33]"
              >
                All departments
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
            <ul className="mt-2.5 grid grid-cols-4 gap-2 sm:grid-cols-8">
              {shortcutNodes.map((shortcut) => {
                const image = shortcut.node.imageUrl;
                return (
                  <li key={shortcut.slug} className="min-w-0">
                    <Link
                      href={`/naijashop/c/${shortcut.slug}`}
                      data-category-shortcut={shortcut.slug}
                      className="group flex h-full min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-[#e1e8de] bg-white px-1 py-1.5 text-center transition hover:-translate-y-0.5 hover:border-[#c7d7c2] hover:shadow-[0_10px_22px_rgba(7,53,31,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2 sm:gap-1.5 sm:py-2"
                    >
                      <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-[#eef4ea] sm:h-12 sm:w-12">
                        {image && !missingArt[image] ? (
                          <img
                            src={image}
                            alt=""
                            loading="lazy"
                            onError={() => markMissing(image)}
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <Store className="h-5 w-5 text-[#7a9c80]" aria-hidden />
                        )}
                      </span>
                      <span className="min-w-0 break-words text-[10px] font-extrabold leading-tight text-[#14241b] sm:text-[11px]">
                        {shortcut.label}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {taxonomyStatus === "error" ? (
          <p role="status" className="mt-3 rounded-xl border border-[#eadfc6] bg-[#fbf4e4] px-3 py-2 text-[11px] leading-5 text-[#7a4c00]">
            The published department directory could not be loaded, so category shortcuts are hidden.
            {categoriesStatus === "ready" ? " The fallback directory and All departments still work." : " The fallback directory could not be loaded either."}
          </p>
        ) : null}

        {status === "loading" ? <MarketplaceSkeleton /> : null}

        {status === "error" ? (
          <div role="alert" className="mt-6 rounded-3xl border border-[#f0c8c2] bg-[#fdf2f0] p-6">
            <AlertCircle className="h-6 w-6 text-[#b42318]" aria-hidden />
            <h2 className="mt-2 font-display text-[20px] font-extrabold text-[#7a1c12]">We couldn&apos;t load the listings</h2>
            <p className="mt-1 max-w-2xl text-[12px] leading-6 text-[#8a1c14]">
              {error || "The marketplace catalogue is unavailable right now."}
            </p>
            <button
              type="button"
              onClick={() => setReloadKey((value) => value + 1)}
              className="mt-3 inline-flex h-10 items-center rounded-full bg-[#7a1c12] px-4 text-[11.5px] font-extrabold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a1c12] focus-visible:ring-offset-2"
            >
              Try again
            </button>
          </div>
        ) : null}

        {status === "ready" && products.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-[#dfe8dc] bg-white px-5 py-10 text-center">
            <Store className="mx-auto h-8 w-8 text-[#7a9c80]" aria-hidden />
            <h2 className="mt-3 font-display text-[22px] font-extrabold text-[#14241b]">No published seller listings yet</h2>
            <p className="mx-auto mt-1 max-w-xl text-[12px] leading-6 text-[#4b5b51]">
              The marketplace shows only published listings from reviewed sellers; demonstration inventory is labelled. Sample and test rows are
              hidden until a seller publishes stock.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link href="/sell" className="inline-flex h-10 items-center gap-2 rounded-full bg-[#07351f] px-4 text-[11.5px] font-extrabold text-white">
                Open a seller account <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
              <Link href="/naijashop/categories" className="inline-flex h-10 items-center rounded-full border border-[#b9cbb4] px-4 text-[11.5px] font-extrabold text-[#0b5c33]">
                Browse departments
              </Link>
            </div>
          </div>
        ) : null}

        {status === "ready" && showShelves && discovery.exploreItems.length > 0 ? (
          <ProductShelf
            shelf={exploreShelf}
            items={discovery.exploreItems}
            onAdd={addToCart}
            addingId={addingId}
            addedId={addedId}
          />
        ) : null}

        {status === "ready" && showShelves
          ? discovery.shelves.map(({ shelf, items }) => (
              <ProductShelf key={shelf.id} shelf={shelf} items={items} onAdd={addToCart} addingId={addingId} addedId={addedId} />
            ))
          : null}

        {status === "ready" && discovery.african.length > 0 ? (
          <AfricanDiscovery items={discovery.african} />
        ) : null}

        {status !== "loading" ? (
          <section data-storefront-wholesale aria-labelledby="bulk-heading" className="mt-8 overflow-hidden rounded-[28px] bg-[#07351f] text-white">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-7 p-5 sm:p-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-10 lg:p-10">
              <div className="min-w-0">
                <p className="break-words text-[9.5px] font-extrabold uppercase tracking-[0.18em] text-[#f5b52e]">Wholesale &amp; bulk</p>
                <h2 id="bulk-heading" className="mt-2 break-words font-display text-[25px] font-extrabold leading-tight tracking-tight sm:text-[30px]">
                  Source in bulk. Move it with Deliveries &amp; Freight.
                </h2>
                <p className="mt-2 max-w-xl text-[11.5px] leading-6 text-[#c3d9c7] sm:text-[12.5px]">
                  NaijaDeals does not run a combined wholesale checkout with tiered pricing yet. Today, bulk buying starts with a producer
                  quote and ends with independent freight — both are available in the ecosystem.
                </p>
                <ol className="mt-5 grid gap-2 sm:grid-cols-2">
                  {[
                    { icon: Leaf, title: "Ask a producer", body: "Request the quantity from a NaijaFresh farm; the farm sets its own quote.", href: "/naijafresh/business", cta: "Bulk produce" },
                    { icon: Truck, title: "Book freight", body: "Independent Deliveries & Freight transporters quote larger loads.", href: "/naijasend/quote", cta: "Freight quote" }
                  ].map((step, index) => (
                    <li key={step.title} className="rounded-2xl bg-white/[0.06] p-3 ring-1 ring-white/10">
                      <div className="flex items-center gap-2">
                        <step.icon className="h-4 w-4 text-[#8ed14b]" aria-hidden />
                        <span className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-[#8fb89a]">Step {index + 1}</span>
                      </div>
                      <p className="mt-1.5 text-[12px] font-extrabold">{step.title}</p>
                      <p className="mt-0.5 text-[10.5px] leading-4 text-[#c3d9c7]">{step.body}</p>
                      <Link href={step.href} className="mt-2 inline-flex items-center gap-1 text-[10.5px] font-extrabold text-[#f5b52e] hover:underline">
                        {step.cta} <ArrowRight className="h-3 w-3" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ol>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href="/naijafresh/business"
                    className="inline-flex h-10 items-center gap-2 rounded-full bg-[#f5b52e] px-4 text-[11.5px] font-extrabold text-[#14241b] transition hover:bg-[#ffd15e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    Request a producer quote
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                  <Link
                    href="/naijasend/quote"
                    className="inline-flex h-10 items-center rounded-full border border-white/30 px-4 text-[11.5px] font-extrabold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    Get a freight quote
                  </Link>
                </div>
              </div>

              <div className="rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[12px] font-extrabold">Listings with deeper stock</h3>
                  <Boxes className="h-4 w-4 text-[#8ed14b]" aria-hidden />
                </div>
                <p className="mt-1 text-[10px] leading-4 text-[#9fc3a9]">
                  Seller-reported availability. Listed prices are retail unit prices.
                </p>
                {status === "ready" ? (
                  bulkStock.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {bulkStock.map((product) => {
                        const available = availableUnits(product);
                        return (
                          <li key={product.id}>
                            <Link
                              href={`/product/${product.slug}`}
                              className="flex items-center gap-3 rounded-xl bg-white/[0.06] p-2.5 ring-1 ring-white/10 transition hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f5b52e]"
                            >
                              <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-white">
                                {product.images?.[0]?.url ? (
                                  <img src={product.images[0].url} alt="" className="h-full w-full object-contain p-1" loading="lazy" />
                                ) : (
                                  <Store className="h-4 w-4 text-[#7a9c80]" aria-hidden />
                                )}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[11.5px] font-bold text-white">{product.name}</span>
                                <span className="mt-0.5 block truncate text-[9.5px] text-[#9fc3a9]">
                                  {product.vendor?.name ?? "Seller"} · {available} units · {naira(Number(product.priceKobo))}
                                </span>
                              </span>
                              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-[#f5b52e]" aria-hidden />
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="mt-3 rounded-xl bg-white/[0.05] p-3 text-[10.5px] leading-5 text-[#c3d9c7]">
                      No listing currently reports 20 or more units. Ask a producer for the quantity you need instead.
                    </p>
                  )
                ) : (
                  <p className="mt-3 rounded-xl bg-white/[0.05] p-3 text-[10.5px] leading-5 text-[#c3d9c7]">
                    Availability could not be loaded. The producer and freight links still work.
                  </p>
                )}
                <p className="mt-3 text-[9.5px] leading-4 text-[#9fc3a9]">
                  A wholesale price must be quoted by the seller; this page does not generate a tiered or discounted bulk price.
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {/* Seller invitation is deliberately subordinate to retail discovery. */}
        <section data-seller-invite aria-labelledby="seller-invite-heading" className="mt-4 rounded-2xl border border-[#e1e8de] bg-white px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-[9.5px] font-extrabold uppercase tracking-[0.16em] text-[#0f7a4a]">For sellers</p>
              <h2 id="seller-invite-heading" className="mt-1 font-display text-[18px] font-extrabold tracking-tight text-[#14241b]">
                Have stock to sell?
              </h2>
              <p className="mt-1 max-w-2xl text-[11px] leading-5 text-[#566359]">
                Apply for a seller account to publish eligible stock on the marketplace.
              </p>
            </div>
            <Link
              href="/sell"
              className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border border-[#b9cbb4] px-4 text-[11.5px] font-extrabold text-[#0b5c33] transition hover:bg-[#eef5eb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2"
            >
              Open a seller account
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

/** A retail shelf: real heading link, real cards, no filler or promo placeholder. */
function ProductShelf({
  shelf,
  items,
  onAdd,
  addingId,
  addedId
}: {
  shelf: ShelfView;
  items: ApiProduct[];
  onAdd: (product: ApiProduct) => void;
  addingId: string;
  addedId: string;
}) {
  return (
    <section
      aria-labelledby={`shelf-${shelf.id}`}
      data-storefront-shelf={shelf.id}
      data-shelf-slugs={shelf.slugs.length > 0 ? shelf.slugs.join(" ") : "*"}
      className="mt-7"
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[9.5px] font-extrabold uppercase tracking-[0.16em] text-[#0f7a4a]">Demonstration catalogue</p>
          <h2 id={`shelf-${shelf.id}`} className="mt-1 break-words font-display text-[20px] font-extrabold tracking-tight text-[#14241b] sm:text-[24px]">
            {shelf.title}
          </h2>
          <p className="mt-1 max-w-2xl text-[10.5px] leading-5 text-[#566359]">{shelf.description}</p>
        </div>
        <Link
          href={shelf.href}
          className="inline-flex items-center gap-1 rounded text-[11px] font-extrabold text-[#0b5c33] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33]"
        >
          {shelf.linkLabel}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 lg:grid-cols-4">
        {items.map((product) => (
          <li key={product.id} className="min-w-0">
            <MarketplaceProductCard
              product={product}
              onAdd={onAdd}
              adding={addingId === product.id}
              added={addedId === product.id}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Editorial African discovery band. It reuses approved demonstration listing
 * images and the seller's own item names, and explicitly avoids adding an
 * origin or maker claim.
 */
function AfricanDiscovery({ items }: { items: ApiProduct[] }) {
  return (
    <section
      aria-labelledby="african-discovery-heading"
      data-african-feature
      className="mt-8 overflow-hidden rounded-[26px] bg-[#07351f] text-white"
    >
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="min-w-0 p-5 sm:p-8">
          <p className="text-[9.5px] font-extrabold uppercase tracking-[0.18em] text-[#f5b52e]">African discovery</p>
          <h2 id="african-discovery-heading" className="mt-2 break-words font-display text-[24px] font-extrabold leading-tight tracking-tight sm:text-[28px]">
            African print, handwoven cloth and natural care.
          </h2>
          <p className="mt-2 max-w-lg text-[11.5px] leading-6 text-[#c3d9c7] sm:text-[12.5px]">
            Explore demonstration listings for African-print fabric, handwoven cloth, shea butter and black soap. Item names and
            imagery come from the listing; no maker or origin is claimed where the seller has not recorded one.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              { label: "African-print fabrics", href: "/naijashop/c/african-print-fabrics" },
              { label: "Handwoven & dyed", href: "/naijashop/c/handwoven-dyed-fabrics" },
              { label: "Shea & natural butters", href: "/naijashop/c/shea-natural-butters" }
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="inline-flex h-9 items-center rounded-full border border-white/25 px-3 text-[10.5px] font-extrabold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
        <ul className="grid min-w-0 grid-cols-2 gap-2 p-3 sm:gap-3 sm:p-6">
          {items.map((product) => (
            <li key={product.id} data-african-item={product.slug} className="min-w-0">
              <Link
                href={`/product/${product.slug}`}
                className="group flex h-full min-w-0 flex-col overflow-hidden rounded-xl bg-white text-[#14241b] transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(0,0,0,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f5b52e] focus-visible:ring-offset-2 focus-visible:ring-offset-[#07351f]"
              >
                <span className="relative block aspect-[4/3] overflow-hidden bg-[#f6f8f4]">
                  <img
                    src={product.images?.[0]?.url}
                    alt={product.images?.[0]?.alt || product.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
                  />
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-[#F2D48C] px-1.5 py-0.5 text-[8.5px] font-extrabold uppercase tracking-wide text-[#07351f]">
                    DEMO
                  </span>
                </span>
                <span className="flex min-w-0 flex-1 flex-col p-2.5">
                  <span className="line-clamp-2 break-words text-[11px] font-bold leading-4">{product.name}</span>
                  <span className="mt-1 text-[12px] font-extrabold tracking-tight">{naira(Number(product.priceKobo))}</span>
                  <span className="mt-0.5 text-[9px] font-semibold text-[#566359]">Illustrative demonstration listing</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function MarketplaceSkeleton() {
  return (
    <section aria-busy="true" aria-label="Loading marketplace listings" className="mt-6">
      <p className="sr-only">Loading marketplace listings…</p>
      <div className="h-4 w-40 animate-pulse rounded-full bg-[#e3ebdf]" />
      <div className="mt-2 h-6 w-64 animate-pulse rounded-full bg-[#e3ebdf]" />
      <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <li key={index} className="overflow-hidden rounded-2xl border border-[#e1e8de] bg-white" aria-hidden>
            <div className="aspect-square animate-pulse bg-[#eef3ec]" />
            <div className="space-y-2 p-3">
              <div className="h-2.5 w-20 animate-pulse rounded-full bg-[#eef3ec]" />
              <div className="h-3 w-full animate-pulse rounded-full bg-[#eef3ec]" />
              <div className="h-3 w-2/3 animate-pulse rounded-full bg-[#eef3ec]" />
              <div className="h-4 w-24 animate-pulse rounded-full bg-[#eef3ec]" />
              <div className="h-9 w-full animate-pulse rounded-full bg-[#eef3ec]" />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
