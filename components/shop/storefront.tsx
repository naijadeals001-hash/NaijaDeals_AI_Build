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
  Truck,
  Wallet
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

type Department = {
  id: string;
  name: string;
  slug: string;
  imageUrl?: string | null;
  description?: string | null;
  isSelectable?: boolean;
  showOnHomepage?: boolean;
  children?: Department[];
};

function toDepartment(node: PublicTaxonomyNode): Department {
  return {
    id: node.id,
    name: node.name,
    slug: node.slug,
    imageUrl: node.imageUrl ?? null,
    description: node.description ?? null,
    isSelectable: node.isSelectable !== false,
    showOnHomepage: node.showOnHomepage === true,
    children: (node.children ?? []).map(toDepartment)
  };
}

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

function departmentSlugs(department: Department): string[] {
  const slugs = [department.slug];
  for (const child of department.children ?? []) slugs.push(...departmentSlugs(child));
  return slugs;
}

function departmentListingCount(department: Department, byCategory: Map<string, ApiProduct[]>): number {
  return departmentSlugs(department).reduce((total, slug) => total + (byCategory.get(slug)?.length ?? 0), 0);
}

function naira(value: number) {
  return `₦${new Intl.NumberFormat("en-NG", { maximumFractionDigits: 2 }).format(value / 100)}`;
}

/**
 * NaijaDeals Marketplace storefront.
 *
 * The page keeps the working catalogue, cart, address and storefront-config
 * fetches from the previous storefront but presents them in the owner-approved
 * NaijaDeals system: a text wordmark, a scoped search, clear retail and
 * wholesale entrances, real departments and seller-fact product cards.
 *
 * Nothing here invents stock, discounts, ratings, delivery times or wholesale
 * pricing. Variant products route to their options, and the bulk section links
 * to the producer-quote and freight workflows that actually exist today.
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

    // The homepage shows only departments the owner marked `showOnHomepage`.
    // The legacy list stays as a labelled fallback while that endpoint is
    // unavailable; the difference is stated in the department section.
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

  const byCategory = useMemo(() => {
    const map = new Map<string, ApiProduct[]>();
    for (const product of products) {
      const key = product.category?.slug ?? "other";
      map.set(key, [...(map.get(key) ?? []), product]);
    }
    return map;
  }, [products]);

  // Prefer the published taxonomy; then the canonical department directory; if
  // both fail, derive departments from the live products so navigation still
  // works rather than disappearing.
  const departments = useMemo<Department[]>(() => {
    if (taxonomyTree.length > 0) return taxonomyTree;
    if (categories.length > 0) {
      return categories.map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        imageUrl: (category as ApiCategory & { imageUrl?: string | null }).imageUrl ?? null
      }));
    }
    const map = new Map<string, Department>();
    for (const product of products) {
      const category = product.category;
      if (!category || map.has(category.slug)) continue;
      map.set(category.slug, { id: category.id, name: category.name, slug: category.slug, imageUrl: null });
    }
    return [...map.values()];
  }, [taxonomyTree, categories, products]);

  // Homepage shelves and cards follow the owner's `showOnHomepage` selection.
  // While the taxonomy endpoint is unavailable, the published directory is a
  // labelled fallback instead of an invented featured list.
  const homepageDepartments = useMemo(
    () => (taxonomyStatus === "ready" ? departments.filter((department) => department.showOnHomepage) : departments),
    [taxonomyStatus, departments]
  );
  const featuredDepartmentCount = useMemo(
    () => departments.filter((department) => department.showOnHomepage).length,
    [departments]
  );

  const sellerCount = useMemo(() => new Set(products.map((product) => product.vendor?.id).filter(Boolean)).size, [products]);

  const priceDrops = useMemo(() => {
    const seen = new Set<string>();
    return products
      .filter((product) => {
        if (product.compareAtKobo === null || product.compareAtKobo === undefined) return false;
        const price = Number(product.priceKobo);
        const compare = Number(product.compareAtKobo);
        if (!Number.isFinite(price) || !Number.isFinite(compare) || compare <= price) return false;
        const available = availableUnits(product);
        return available === null || available > 0;
      })
      .sort((a, b) => {
        const discount = (product: ApiProduct) =>
          (Number(product.compareAtKobo) - Number(product.priceKobo)) / Number(product.compareAtKobo);
        return discount(b) - discount(a);
      })
      .filter((product) => {
        const key = product.name.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 4);
  }, [products]);

  // Prefer shelves whose products are not already shown in the price-drop row,
  // so a visitor does not see the same item twice in consecutive sections.
  const shelves = useMemo(() => {
    const decorated = homepageDepartments
      .map((department) => ({ ...department, items: (byCategory.get(department.slug) ?? []).slice(0, shelfLimit) }))
      .filter((department) => department.items.length > 0);
    const dropCategories = new Set(priceDrops.map((product) => product.category?.slug));
    const preferred = decorated.filter((department) => !dropCategories.has(department.slug));
    const fallback = decorated.filter((department) => dropCategories.has(department.slug));
    return [...preferred, ...fallback].slice(0, 4);
  }, [homepageDepartments, byCategory, shelfLimit, priceDrops]);

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

        {/* Retail entrance (left) and wholesale entrance (right). */}
        <section aria-labelledby="marketplace-hero-heading" className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          {showHero ? (
            <div className="relative overflow-hidden rounded-[26px] bg-[#07351f]">
              <img
                src="/generated/shop/hero-desktop.webp"
                alt=""
                fetchPriority="high"
                className="absolute inset-0 h-full w-full object-cover object-[64%_center]"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#041f12] via-[#041f12]/90 to-[#041f12]/15" aria-hidden />
              <div className="relative flex min-h-[410px] flex-col justify-between p-5 sm:min-h-[440px] sm:p-8 lg:min-h-[460px] lg:p-10">
                <div>
                  <p className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[9.5px] font-extrabold uppercase tracking-[0.16em] text-[#f5b52e] ring-1 ring-white/15">
                    <Store className="h-3 w-3" aria-hidden />
                    Retail marketplace
                  </p>
                  <h1
                    id="marketplace-hero-heading"
                    className="mt-4 max-w-[36rem] font-display text-[29px] font-extrabold leading-[1.08] tracking-[-0.02em] text-white sm:text-[38px] lg:text-[44px]"
                  >
                    Everyday retail, from sellers you can check.
                  </h1>
                  <p className="mt-3 max-w-lg text-[12.5px] leading-6 text-white/80 sm:text-[13.5px]">
                    Shop electronics, fashion, home, beauty and groceries from sellers across Africa, with demonstration inventory clearly labelled. Checkout with your NaijaDeals
                    account, protected by escrow until delivery.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Link
                      href="/naijashop/categories"
                      className="inline-flex h-11 items-center gap-2 rounded-full bg-[#f5b52e] px-5 text-[12px] font-extrabold text-[#14241b] transition hover:bg-[#ffd15e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#07351f]"
                    >
                      Browse departments
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                    <Link
                      href="/naijashop/help"
                      className="inline-flex h-11 items-center rounded-full border border-white/30 bg-white/5 px-5 text-[12px] font-bold text-white transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    >
                      How buying works
                    </Link>
                  </div>
                </div>
                <ul className="mt-7 flex flex-wrap gap-x-4 gap-y-2 text-[10px] font-semibold text-white/85 sm:text-[10.5px]">
                  <li className="flex items-center gap-1.5">
                    <BadgeCheck className="h-3.5 w-3.5 text-[#8ed14b]" aria-hidden />
                    Listings from sellers, with demonstration inventory labelled
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
            </div>
          ) : (
            <div className="rounded-[26px] border border-[#e1e8de] bg-white p-6 sm:p-8">
              <p className="text-[9.5px] font-extrabold uppercase tracking-[0.16em] text-[#0f7a4a]">NaijaDeals Marketplace</p>
              <h1 id="marketplace-hero-heading" className="mt-2 font-display text-[30px] font-extrabold leading-tight tracking-tight text-[#14241b] sm:text-[38px]">
                Retail and bulk buying in one place.
              </h1>
              <p className="mt-2 max-w-xl text-[12.5px] leading-6 text-[#4b5b51]">
                Browse live seller listings by department, or start a producer quote for a larger order. Every retail checkout uses your
                NaijaDeals account.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/naijashop/categories" className="inline-flex h-10 items-center gap-2 rounded-full bg-[#07351f] px-4 text-[12px] font-extrabold text-white">
                  Browse departments <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link href="/naijafresh/business" className="inline-flex h-10 items-center rounded-full border border-[#b9cbb4] px-4 text-[12px] font-extrabold text-[#0b5c33]">
                  Bulk buying
                </Link>
              </div>
            </div>
          )}

          <div className="flex min-w-0 flex-col gap-3">
            <aside className="flex flex-1 flex-col rounded-[26px] border border-[#eadfc6] bg-[#fbf4e4] p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <span className="rounded-full bg-[#07351f] px-3 py-1 text-[9px] font-extrabold uppercase tracking-[0.15em] text-[#f5b52e]">
                  Wholesale &amp; bulk
                </span>
                <Boxes className="h-5 w-5 text-[#0b5c33]" aria-hidden />
              </div>
              <h2 className="mt-3 font-display text-[21px] font-extrabold leading-tight tracking-tight text-[#14241b] sm:text-[23px]">
                Buying for a shop, kitchen or project?
              </h2>
              <p className="mt-2 text-[11.5px] leading-5 text-[#4b5b51]">
                A combined wholesale checkout is not live yet. Bulk quantities are quoted directly by producers, and larger loads move through
                independent Deliveries & Freight transporters.
              </p>
              <ul className="mt-3 space-y-1.5 text-[11px] font-semibold text-[#3d4f43]">
                <li className="flex items-center gap-2">
                  <Leaf className="h-4 w-4 shrink-0 text-[#0b5c33]" aria-hidden />
                  Farm and producer bulk quotes
                </li>
                <li className="flex items-center gap-2">
                  <Truck className="h-4 w-4 shrink-0 text-[#0b5c33]" aria-hidden />
                  Freight and larger-load transport
                </li>
              </ul>
              <div className="mt-4 rounded-xl border border-[#e3d6bb] bg-white/60 p-3">
                <p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-[#0b5c33]">How a bulk order moves</p>
                <p className="mt-1 text-[10.5px] leading-4 text-[#4b5b51]">
                  Producer quote, then a Deliveries & Freight quote, then delivery. Quotes are requests; nothing is charged until you book.
                </p>
              </div>
              <div className="mt-auto flex flex-col gap-2 pt-5">
                <Link
                  href="/naijafresh/business"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#0b5c33] px-4 text-[11.5px] font-extrabold text-white transition hover:bg-[#07351f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#07351f] focus-visible:ring-offset-2"
                >
                  Request a bulk quote
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
                <Link
                  href="/naijasend/quote"
                  className="inline-flex h-10 items-center justify-center rounded-full border border-[#0b5c33]/30 px-4 text-[11.5px] font-extrabold text-[#0b5c33] transition hover:bg-[#eef4ea] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33]"
                >
                  Get freight quotes
                </Link>
                <p className="text-[9.5px] leading-4 text-[#566359]">
                  Bulk prices come from the producer&apos;s own quote. Retail listing prices are not wholesale prices.
                </p>
              </div>
            </aside>

            <div className="grid grid-cols-3 divide-x divide-[#e1e8de] rounded-2xl border border-[#e1e8de] bg-white px-1 py-3">
              {[
                { value: status === "ready" ? products.length.toLocaleString("en-NG") : "—", label: "listings" },
                { value: status === "ready" ? sellerCount.toLocaleString("en-NG") : "—", label: "sellers" },
                { value: status === "ready" ? departments.length.toLocaleString("en-NG") : "—", label: "departments" }
              ].map((stat) => (
                <div key={stat.label} className="px-2 text-center">
                  <p className="font-display text-[17px] font-extrabold leading-none text-[#07351f]">{stat.value}</p>
                  <p className="mt-1 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[#566359]">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          aria-label="Marketplace protections"
          className="mt-3 grid grid-cols-2 gap-2 rounded-2xl border border-[#e1e8de] bg-white p-3 sm:grid-cols-4 sm:p-4"
        >
          {[
            { icon: BadgeCheck, title: "Reviewed sellers", body: "Seller accounts are reviewed before listings go live." },
            { icon: ShieldCheck, title: "Escrow checkout", body: "Paid orders are held until delivery is confirmed." },
            { icon: Truck, title: "Tracked delivery", body: "Delivery events are recorded by Deliveries & Freight." },
            { icon: Wallet, title: "One account", body: "Cart, orders and addresses across NaijaDeals." }
          ].map((item) => (
            <div key={item.title} className="flex items-start gap-2">
              <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-[#0f7a4a]" aria-hidden />
              <div className="min-w-0">
                <p className="text-[11.5px] font-extrabold leading-tight text-[#14241b]">{item.title}</p>
                <p className="mt-0.5 text-[10px] leading-4 text-[#566359]">{item.body}</p>
              </div>
            </div>
          ))}
        </section>

        <section aria-labelledby="departments-heading" className="mt-8">
          <SectionHeading eyebrow="Departments" title="Shop by department" id="departments-heading" href="/naijashop/categories" linkLabel="All departments" />
          <p className="mt-1 text-[10.5px] leading-5 text-[#566359]">
            {taxonomyStatus === "ready"
              ? `${departments.length} departments published · ${departments.filter((department) => departmentListingCount(department, byCategory) > 0).length} with live stock · ${featuredDepartmentCount} featured on the homepage.`
              : taxonomyStatus === "loading"
                ? "Loading the published department directory…"
                : `${departments.length} departments published. The homepage selection could not be loaded, so the published directory is shown.`}
          </p>
          {taxonomyStatus === "ready" && homepageDepartments.length === 0 ? (
            <div className="mt-3 rounded-2xl border border-dashed border-[#cfdccb] bg-white p-5 text-[12px] leading-6 text-[#4b5b51]">
              <p className="font-extrabold text-[#14241b]">No department is featured on the homepage right now.</p>
              <p className="mt-1">
                The published directory is still available. Homepage departments are chosen in the Control Center
                taxonomy, not by product count.
              </p>
              <Link
                href="/naijashop/categories"
                className="mt-2 inline-flex items-center gap-1 font-extrabold text-[#0b5c33] underline"
              >
                Browse all departments <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          ) : null}
          {homepageDepartments.length > 0 ? (
            <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4">
              {homepageDepartments.map((department) => {
                const count = departmentListingCount(department, byCategory);
                const url = department.imageUrl || `/generated/shop/category-${department.slug}.webp`;
                return (
                  <li key={department.id}>
                    <Link
                      href={`/naijashop/c/${department.slug}`}
                      className="group block overflow-hidden rounded-2xl border border-[#e1e8de] bg-white transition duration-300 hover:-translate-y-0.5 hover:border-[#c7d7c2] hover:shadow-[0_14px_30px_rgba(7,53,31,0.09)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2"
                    >
                      <div className="aspect-[16/10] w-full overflow-hidden bg-[#eef4ea]">
                        {!missingArt[url] ? (
                          <img
                            src={url}
                            alt=""
                            loading="lazy"
                            onError={() => markMissing(url)}
                            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.05]"
                          />
                        ) : (
                          <span className="grid h-full w-full place-items-center bg-[#eef4ea]">
                            <Store className="h-6 w-6 text-[#7a9c80]" aria-hidden />
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                        <span className="min-w-0">
                          <span className="block truncate text-[12px] font-extrabold text-[#14241b] sm:text-[13px]">{department.name}</span>
                          <span className="mt-0.5 block text-[10px] font-semibold text-[#566359]">
                            {status === "ready"
                              ? count > 0
                                ? `${count} ${count === 1 ? "listing" : "listings"}`
                                : "Published — no live stock yet"
                              : status === "loading"
                                ? "Loading stock…"
                                : "Stock unavailable"}
                          </span>
                        </span>
                        <ArrowUpRight className="h-4 w-4 shrink-0 text-[#0f7a4a]" aria-hidden />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {categoriesStatus === "error" && taxonomyStatus !== "ready" ? (
            <p className="mt-2 text-[11px] text-[#8a4a10]">
              The department directory could not be refreshed. Showing departments found in live listings.
            </p>
          ) : null}
        </section>

        {status === "loading" ? <MarketplaceSkeleton /> : null}

        {status === "error" ? (
          <div role="alert" className="mt-8 rounded-3xl border border-[#f0c8c2] bg-[#fdf2f0] p-6">
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
          <div className="mt-8 rounded-3xl border border-[#dfe8dc] bg-white px-5 py-10 text-center">
            <Store className="mx-auto h-8 w-8 text-[#7a9c80]" aria-hidden />
            <h2 className="mt-3 font-display text-[22px] font-extrabold text-[#14241b]">No live seller listings yet</h2>
            <p className="mx-auto mt-1 max-w-xl text-[12px] leading-6 text-[#4b5b51]">
              The marketplace shows only published listings from reviewed sellers; demonstration inventory is labelled. Sample and test rows are hidden until a real seller
              publishes stock.
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

        {status === "ready" && showShelves && priceDrops.length > 0 ? (
          <section aria-labelledby="price-drops-heading" className="mt-8">
            <SectionHeading eyebrow="Real reductions" title="Seller price drops" id="price-drops-heading" href="/naijashop/deals" linkLabel="More low prices" />
            <p className="mt-1 text-[10.5px] leading-5 text-[#566359]">
              Reductions appear only where a seller recorded a higher compare-at price.
            </p>
            <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 lg:grid-cols-4">
              {priceDrops.map((product) => (
                <li key={product.id} className="min-w-0">
                  <MarketplaceProductCard
                    product={product}
                    onAdd={addToCart}
                    adding={addingId === product.id}
                    added={addedId === product.id}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {status === "ready" && showShelves
          ? shelves.map((department) => (
              <section key={department.id} aria-labelledby={`shelf-${department.slug}`} className="mt-8">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className="text-[9.5px] font-extrabold uppercase tracking-[0.16em] text-[#0f7a4a]">Live listings</p>
                    <h2 id={`shelf-${department.slug}`} className="mt-1 font-display text-[21px] font-extrabold tracking-tight text-[#14241b] sm:text-[24px]">
                      {department.name}
                    </h2>
                  </div>
                  <Link
                    href={`/naijashop/c/${department.slug}`}
                    className="inline-flex items-center gap-1 rounded text-[11px] font-extrabold text-[#0b5c33] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33]"
                  >
                    View all {department.name}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </div>
                <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 lg:grid-cols-4">
                  {department.items.map((product) => (
                    <li key={product.id} className="min-w-0">
                      <MarketplaceProductCard
                        product={product}
                        onAdd={addToCart}
                        adding={addingId === product.id}
                        added={addedId === product.id}
                      />
                    </li>
                  ))}
                  {department.items.length < shelfLimit ? (
                    <li className="min-w-0">
                      <Link
                        href={`/naijashop/c/${department.slug}`}
                        className="group relative flex h-full min-h-[18rem] overflow-hidden rounded-2xl bg-[#07351f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2"
                      >
                        {!missingArt[department.imageUrl || `/generated/shop/category-${department.slug}.webp`] ? (
                          <img
                            src={department.imageUrl || `/generated/shop/category-${department.slug}.webp`}
                            alt=""
                            loading="lazy"
                            onError={() => markMissing(department.imageUrl || `/generated/shop/category-${department.slug}.webp`)}
                            className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                          />
                        ) : null}
                        <span className="absolute inset-0 bg-gradient-to-t from-[#041f12]/95 via-[#041f12]/55 to-[#041f12]/10" aria-hidden />
                        <span className="relative mt-auto p-4 text-white">
                          <span className="block text-[9px] font-extrabold uppercase tracking-[0.16em] text-[#8ed14b]">More in</span>
                          <span className="mt-1 block font-display text-[20px] font-extrabold leading-tight">{department.name}</span>
                          <span className="mt-1 block text-[10.5px] leading-4 text-white/80">
                            See every live listing in this department.
                          </span>
                          <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-extrabold text-[#f5b52e]">
                            View all
                            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                          </span>
                        </span>
                      </Link>
                    </li>
                  ) : null}
                </ul>
              </section>
            ))
          : null}

        {status !== "loading" ? (
          <section aria-labelledby="bulk-heading" className="mt-10 overflow-hidden rounded-[28px] bg-[#07351f] text-white">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-7 p-5 sm:p-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-10 lg:p-10">
              <div className="min-w-0">
                <p className="break-words text-[9.5px] font-extrabold uppercase tracking-[0.18em] text-[#f5b52e]">Producer and wholesale connections</p>
                <h2 id="bulk-heading" className="mt-2 break-words font-display text-[25px] font-extrabold leading-tight tracking-tight sm:text-[30px]">
                  Source in bulk. Move it with Deliveries & Freight.
                </h2>
                <p className="mt-2 max-w-xl text-[11.5px] leading-6 text-[#c3d9c7] sm:text-[12.5px]">
                  NaijaDeals does not run a combined wholesale checkout with tiered pricing yet. Today, bulk buying starts with a producer
                  quote and ends with independent freight — both are live in the ecosystem.
                </p>
                <ol className="mt-5 grid gap-2 sm:grid-cols-3">
                  {[
                    { icon: Leaf, title: "Ask a producer", body: "Request the quantity from a NaijaFresh farm; the farm sets its own quote.", href: "/naijafresh/business", cta: "Bulk produce" },
                    { icon: Truck, title: "Book freight", body: "Independent Deliveries & Freight transporters quote larger loads.", href: "/naijasend/quote", cta: "Freight quote" },
                    { icon: Store, title: "Sell onward", body: "Apply for a seller account if you are buying to resell.", href: "/sell", cta: "Start selling" }
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
                    Live availability could not be loaded. The producer and freight links still work.
                  </p>
                )}
                <p className="mt-3 text-[9.5px] leading-4 text-[#9fc3a9]">
                  A wholesale price must be quoted by the seller; this page does not generate a tiered or discounted bulk price.
                </p>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  id,
  href,
  linkLabel
}: {
  eyebrow: string;
  title: string;
  id: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <p className="text-[9.5px] font-extrabold uppercase tracking-[0.16em] text-[#0f7a4a]">{eyebrow}</p>
        <h2 id={id} className="mt-1 font-display text-[22px] font-extrabold tracking-tight text-[#14241b] sm:text-[26px]">
          {title}
        </h2>
      </div>
      {href && linkLabel ? (
        <Link
          href={href}
          className="inline-flex items-center gap-1 rounded text-[11px] font-extrabold text-[#0b5c33] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33]"
        >
          {linkLabel}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

function MarketplaceSkeleton() {
  return (
    <section aria-busy="true" aria-label="Loading marketplace listings" className="mt-8">
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
