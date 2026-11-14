"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Boxes,
  ChevronDown,
  CircleHelp,
  Grid2x2,
  Leaf,
  MapPin,
  Package,
  Plus,
  Search,
  ShoppingCart,
  Store,
  Tag,
  TrendingUp,
  Truck,
  User,
  X
} from "lucide-react";
import { apiClient, type ApiCategory, type ApiProduct, type SessionUser } from "@/lib/api-client";
import { getPublicTaxonomy, type PublicTaxonomyNode } from "@/lib/taxonomy-api";
import { NaijaDealsLogo } from "@/components/brand/naijadeals-logo";
import { useLocale } from "@/lib/i18n/locale-provider";
import { AllDrawer, ShopPanelFrame, type DepartmentStatus, type ShopDepartment } from "./all-drawer";
import { AccountMenu, rememberRecentlyViewed } from "./account-menu";
import { ShopSiteFooter } from "./shop-site-footer";

/**
 * Cart badge events. The storefront and other client islands announce the
 * authoritative cart total returned by the cart API; the header never invents
 * or increments a count locally.
 */
export const SHOP_CART_COUNT_EVENT = "naijashop:cart-count";

export function announceShopCartCount(count: number) {
  if (typeof window === "undefined" || !Number.isFinite(count)) return;
  window.dispatchEvent(new CustomEvent(SHOP_CART_COUNT_EVENT, { detail: { count } }));
}

type ShopPanel = "all" | "account" | "more" | "location" | null;

/** Same fixture exclusion the storefront applies to every public shelf. */
const FIXTURE_LISTING = /^(variant fixture|test |upload test|last unit|product test)\b|-mw[0-9a-z]{8,}$/i;

type SavedAddress = {
  label?: string | null;
  line1?: string | null;
  city?: string | null;
  state?: string | null;
  isDefault?: boolean;
};

function addressSummary(address: SavedAddress | null) {
  if (!address) return "";
  const area = [address.city, address.state].filter(Boolean).join(", ");
  return area || address.line1?.trim() || "Saved address";
}

function finiteCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

function toShopDepartment(node: PublicTaxonomyNode): ShopDepartment {
  return {
    id: node.id,
    name: node.name,
    slug: node.slug,
    imageUrl: node.imageUrl ?? null,
    description: node.description ?? null,
    isSelectable: node.isSelectable !== false,
    showOnHomepage: node.showOnHomepage === true,
    productCount: finiteCount(node.productCount),
    subtreeProductCount: finiteCount(node.subtreeProductCount) ?? finiteCount(node.productCount),
    canPublish: node.canPublish,
    restrictionNote: node.restrictionNote,
    children: (node.children ?? []).map(toShopDepartment)
  };
}

type SearchScope = { slug: string; name: string; path: string; rootSlug: string };

function collectSearchScopes(departments: ShopDepartment[]): SearchScope[] {
  const rows: SearchScope[] = [];
  const walk = (nodes: ShopDepartment[], trail: string[], rootSlug: string) => {
    for (const node of nodes) {
      const path = [...trail, node.name];
      const root = trail.length === 0 ? node.slug : rootSlug;
      rows.push({ slug: node.slug, name: node.name, path: path.join(" › "), rootSlug: root });
      if (node.children?.length) walk(node.children, path, root);
    }
  };
  walk(departments, [], "");
  return rows;
}

/**
 * The single Marketplace header and page frame.
 *
 * Desktop and mobile use exactly the same DOM: one search form, one account
 * control, one location control and one navigation row. `order-*` utilities
 * reflow those blocks into the required phone rows instead of rendering a
 * second mobile header. Panels (All, Account & Lists, More, delivery location)
 * share ShopPanelFrame, so Escape, backdrop close, focus return, focus trapping
 * and scroll lock behave the same everywhere.
 */
export function ShopShell({ children, initialShopAvailability = null }: { children: ReactNode; initialShopAvailability?: { available: boolean; status: "LIVE" | "PREVIEW" | "DISABLED"; message?: string | null } | null }) {
  return (
    <div
      data-shop-shell
      className="flex min-h-screen w-full max-w-full flex-col bg-[#f4f7f2] text-[#14241b]"
      onClickCapture={(event) => rememberRecentlyViewed(event.target)}
    >
      <a
        href="#shop-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[100] focus:rounded-full focus:bg-[#07351f] focus:px-4 focus:py-2 focus:text-[12px] focus:font-bold focus:text-white"
      >
        Skip to marketplace content
      </a>
      <ShopHeader initialShopAvailability={initialShopAvailability} />
      <main id="shop-main" tabIndex={-1} className="min-w-0 flex-1 outline-none">
        {children}
      </main>
      <ShopSiteFooter />
    </div>
  );
}

function ShopHeader({ initialShopAvailability = null }: { initialShopAvailability?: { available: boolean; status: "LIVE" | "PREVIEW" | "DISABLED"; message?: string | null } | null }) {
  const pathname = usePathname();
  const { city, cities, setCity, country } = useLocale();

  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [departmentTree, setDepartmentTree] = useState<ShopDepartment[]>([]);
  const [taxonomyAvailable, setTaxonomyAvailable] = useState(false);
  const [directoryNotice, setDirectoryNotice] = useState("");
  const [categoriesStatus, setCategoriesStatus] = useState<DepartmentStatus>("loading");
  const [sessionUser, setSessionUser] = useState<SessionUser | null | undefined>(undefined);
  const [cartCount, setCartCount] = useState(0);
  const [address, setAddress] = useState<SavedAddress | null>(null);
  const [openPanel, setOpenPanel] = useState<ShopPanel>(null);
  const [scope, setScope] = useState("");
  const [query, setQuery] = useState("");
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [countsStatus, setCountsStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [shopAvailability, setShopAvailability] = useState<{
    available: boolean;
    status: "LIVE" | "PREVIEW" | "DISABLED";
    message?: string | null;
  } | null>(initialShopAvailability);
  const shopUnavailable = shopAvailability?.available === false;
  const shopPreview = shopAvailability?.status === "PREVIEW" && shopAvailability.available;

  const allReturnFocusRef = useRef<HTMLElement | null>(null);
  const accountReturnFocusRef = useRef<HTMLElement | null>(null);
  const moreReturnFocusRef = useRef<HTMLElement | null>(null);
  const locationReturnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let active = true;
    setCategoriesStatus("loading");
    // The published taxonomy for the selected country/city is the navigation
    // source of truth. If it fails, the drawer reports that honestly instead of
    // falling back to an unscoped category list from another market.
    getPublicTaxonomy({ country, city })
      .then(({ departments }) => {
        if (!active) return;
        const tree = departments.map(toShopDepartment);
        setDepartmentTree(tree);
        setCategories(
          tree.map((department) => ({ id: department.id, name: department.name, slug: department.slug }))
        );
        setTaxonomyAvailable(true);
        setDirectoryNotice("");
        setCategoriesStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        // Never substitute the unscoped /api/categories list after a market
        // switch: it would silently present another market's departments.
        setTaxonomyAvailable(false);
        setCategories([]);
        setDepartmentTree([]);
        setDirectoryNotice(
          "The published taxonomy for this market could not be loaded. All departments and account links remain available; retry after the service recovers."
        );
        setCategoriesStatus("error");
      });
    return () => {
      active = false;
    };
  }, [country, city]);

  useEffect(() => {
    let active = true;
    // Establish the session before requesting protected cart and address data.
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((value: { user?: SessionUser | null } | null) => {
        if (!active) return;
        const user = value?.user ?? null;
        setSessionUser(user);
        if (!user) return;
        return Promise.allSettled([apiClient.getCart(), apiClient.getAddresses()]).then(([cart, addresses]) => {
          if (!active) return;
          if (cart.status === "fulfilled") {
            const items = cart.value.items ?? [];
            setCartCount(items.filter((item) => !item.savedForLater).reduce((sum, item) => sum + item.quantity, 0));
          }
          if (addresses.status === "fulfilled") {
            const list = addresses.value as unknown as SavedAddress[];
            setAddress(list.find((row) => row.isDefault) ?? list[0] ?? null);
          }
        });
      })
      .catch(() => {
        if (active) setSessionUser(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onCartCount = (event: Event) => {
      const detail = (event as CustomEvent<{ count?: number }>).detail;
      if (!detail || typeof detail.count !== "number" || !Number.isFinite(detail.count)) return;
      setCartCount(Math.max(0, Math.floor(detail.count)));
    };
    window.addEventListener(SHOP_CART_COUNT_EVENT, onCartCount);
    return () => window.removeEventListener(SHOP_CART_COUNT_EVENT, onCartCount);
  }, []);

  // Shop navigation must agree with the catalogue/checkout resolver. A paused
  // market replaces the marketplace section rail with an explicit notice while
  // leaving Account, Orders and support routes reachable.
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ country });
    if (city) params.set("city", city);
    fetch(`/api/products/availability?${params.toString()}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((value: { available: boolean; status: "LIVE" | "PREVIEW" | "DISABLED"; message?: string | null } | null) => {
        if (active && value && typeof value.available === "boolean") setShopAvailability(value);
      })
      .catch(() => {
        /* Keep the last known state; the page's own catalogue request still refuses. */
      });
    return () => {
      active = false;
    };
  }, [country, city]);

  // Keep the single search field in step with the applied URL. The header is
  // shared by every Marketplace route, so a category page seeds the department
  // scope and a results page seeds the query instead of showing a blank field.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setQuery((params.get("q") ?? "").slice(0, 120));
    const match = pathname?.match(/^\/naijashop\/c\/([^/]+)/);
    if (!match) {
      setScope("");
      return;
    }
    try {
      setScope(decodeURIComponent(match[1]));
    } catch {
      setScope(match[1]);
    }
  }, [pathname]);

  // Listing counts are only needed once the All drawer is opened. Fetch
  // them on demand instead of downloading the catalogue for every shop route.
  useEffect(() => {
    if (openPanel !== "all") return;
    let active = true;
    setCountsStatus("loading");
    apiClient
      .getProducts({ country, city })
      .then((items) => {
        if (!active) return;
        const list: ApiProduct[] = Array.isArray(items) ? items : [];
        const counts: Record<string, number> = {};
        const seen = new Set<string>();
        for (const product of list) {
          if (product.isSample || FIXTURE_LISTING.test(product.name) || FIXTURE_LISTING.test(product.slug ?? "")) continue;
          if (product.id && seen.has(product.id)) continue;
          if (product.id) seen.add(product.id);
          const slug = product.category?.slug;
          if (!slug) continue;
          counts[slug] = (counts[slug] ?? 0) + 1;
        }
        setCategoryCounts(counts);
        setCountsStatus("ready");
      })
      .catch(() => {
        if (active) setCountsStatus("error");
      });
    return () => {
      active = false;
    };
  }, [openPanel, country, city]);

  const departments = departmentTree;
  const searchScopes = useMemo(() => collectSearchScopes(departmentTree), [departmentTree]);
  const activeScope = searchScopes.find((entry) => entry.slug === scope) ?? null;
  const fallbackCategory = categories.find((category) => category.slug === scope) ?? null;
  const selectedScopeLabel = activeScope?.name ?? fallbackCategory?.name ?? scope;
  const activeRootSlug =
    activeScope?.rootSlug ?? (categories.some((category) => category.slug === scope) ? scope : "");
  const action = scope ? `/naijashop/c/${scope}` : "/naijashop/search";
  const firstName = sessionUser?.name?.split(" ")[0] ?? null;
  const accountGreeting = sessionUser ? `Hello, ${firstName}` : sessionUser === null ? "Hello, sign in" : "Hello";
  const savedAddress = useMemo(() => addressSummary(address), [address]);
  const locationLabel = savedAddress || city.trim();
  const locationAria = locationLabel
    ? `Deliver to ${locationLabel}. Change delivery location`
    : "Choose delivery location. Change delivery location";

  function openAll(trigger: HTMLElement) {
    allReturnFocusRef.current = trigger;
    setOpenPanel("all");
  }

  function openAccount(trigger: HTMLElement) {
    accountReturnFocusRef.current = trigger;
    setOpenPanel("account");
  }

  function openMore(trigger: HTMLElement) {
    moreReturnFocusRef.current = trigger;
    setOpenPanel("more");
  }

  function openLocation(trigger: HTMLElement) {
    locationReturnFocusRef.current = trigger;
    setOpenPanel("location");
  }

  function closePanels() {
    setOpenPanel(null);
  }

  function chooseCity(next: string) {
    if (!next || next === city) {
      closePanels();
      return;
    }
    setCity(next);
    closePanels();
  }

  return (
    <>
      <header
        data-shop-header
        data-shop-availability={shopAvailability?.status ?? "loading"}
        className="relative z-40 border-b border-[#dce6d8] bg-white lg:sticky lg:top-0 lg:shadow-[0_10px_28px_rgba(7,53,31,0.06)]"
      >
        <div className="mx-auto max-w-[1440px] px-2.5 sm:px-6 lg:px-8">
          {/*
            Required phone reflow, from one DOM:
            1 logo · Account & Lists · Orders · Cart
            2 department selector · search field · search button
            3 delivery location + change control
            4 All · Price drops · Bestsellers · More
          */}
          <div className="flex flex-wrap items-center gap-x-1 gap-y-1 pb-1.5 pt-2 sm:gap-x-2 lg:flex-nowrap lg:gap-4 lg:pb-2 lg:pt-3">
            <Link
              href="/naijashop"
              aria-label="NaijaDeals Marketplace home"
              className="order-1 flex min-w-0 shrink-0 flex-col rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2"
            >
              <NaijaDealsLogo tone="onLight" size="md" />
              <span className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.18em] text-[#0f7a4a] sm:text-[8.5px]">
                Marketplace
              </span>
            </Link>

            <div className="order-2 ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1 lg:order-4 lg:ml-0">
              <button
                type="button"
                onClick={(event) => openAccount(event.currentTarget)}
                aria-label={
                  sessionUser
                    ? `Account and lists for ${sessionUser.name}`
                    : sessionUser === null
                      ? "Account and lists. Sign in"
                      : "Account and lists"
                }
                aria-haspopup="dialog"
                aria-expanded={openPanel === "account"}
                aria-controls="shop-account-panel"
                className="flex min-h-10 min-w-0 items-center gap-1 rounded-full px-1 py-1 transition hover:bg-[#eef4ea] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] sm:px-2"
              >
                <User className="h-4 w-4 shrink-0 text-[#0b5c33] sm:h-5 sm:w-5" aria-hidden />
                <span className="flex min-w-0 flex-col text-left leading-tight">
                  <span className="hidden max-w-[8rem] truncate text-[9px] font-semibold text-[#566359] sm:block">
                    {accountGreeting}
                  </span>
                  <span className="whitespace-nowrap text-[10px] font-extrabold text-[#14241b] sm:text-[11px] lg:text-[11.5px]">
                    Account &amp; Lists
                  </span>
                </span>
              </button>

              <Link
                href="/orders"
                aria-label="Returns and orders"
                className="flex min-h-10 items-center gap-0.5 rounded-full px-1 py-1 transition hover:bg-[#eef4ea] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] sm:gap-1.5 sm:px-1.5"
              >
                <Package className="h-4 w-4 shrink-0 text-[#0b5c33] sm:h-5 sm:w-5" aria-hidden />
                <span className="whitespace-nowrap text-[10px] font-extrabold text-[#14241b] sm:text-[11px] lg:hidden">
                  Orders
                </span>
                <span className="hidden flex-col leading-tight lg:flex">
                  <span className="text-[9.5px] font-semibold text-[#566359]">Returns</span>
                  <span className="text-[11.5px] font-extrabold text-[#14241b]">&amp; Orders</span>
                </span>
              </Link>

              <Link
                href="/cart"
                aria-label={`Cart, ${cartCount} ${cartCount === 1 ? "item" : "items"}`}
                className="relative flex min-h-10 items-center gap-0.5 rounded-full px-1 py-1 transition hover:bg-[#eef4ea] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] sm:gap-1.5 sm:px-1.5"
              >
                <span className="relative">
                  <ShoppingCart className="h-4 w-4 text-[#0b5c33] sm:h-5 sm:w-5" aria-hidden />
                  <span
                    className="absolute -right-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#f26b21] px-1 text-[9px] font-black leading-none text-white"
                    aria-hidden
                  >
                    {cartCount}
                  </span>
                </span>
                <span className="whitespace-nowrap text-[10px] font-extrabold text-[#14241b] sm:text-[11px]">Cart</span>
              </Link>
            </div>

            <div className="order-3 w-full min-w-0 lg:order-2 lg:w-auto lg:flex-1">
              <form
                action={action}
                method="get"
                role="search"
                aria-label="Search the NaijaDeals marketplace"
                className="w-full"
              >
                <label htmlFor="shop-search-input" className="sr-only">
                  {selectedScopeLabel ? `Search within ${selectedScopeLabel}` : "Search all departments"}
                </label>
                <div className="flex h-11 min-w-0 items-stretch overflow-hidden rounded-full border border-[#cfdccb] bg-[#f6f8f4] transition focus-within:border-[#0b5c33] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#0b5c33]/15">
                  {departments.length > 0 ? (
                    <>
                      <label htmlFor="shop-search-scope" className="sr-only">
                        Limit search to a department, category or subcategory
                      </label>
                      <select
                        id="shop-search-scope"
                        value={scope}
                        onChange={(event) => setScope(event.target.value)}
                        className="h-11 w-[5.25rem] shrink-0 cursor-pointer truncate rounded-l-full border-r border-[#dce6d8] bg-transparent py-0 pl-2.5 pr-1 text-[11px] font-bold text-[#0b4d2e] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0b5c33] sm:w-auto sm:max-w-[10rem] sm:pl-4 sm:pr-2 sm:text-[11.5px]"
                      >
                        <option value="">All departments</option>
                        {departments.map((department) => (
                          <option key={department.id} value={department.slug}>
                            {department.name} — all
                          </option>
                        ))}
                        {departments.map((department) => {
                          const descendants = searchScopes.filter(
                            (entry) => entry.rootSlug === department.slug && entry.slug !== department.slug
                          );
                          if (descendants.length === 0) return null;
                          return (
                            <optgroup key={`scope-group-${department.id}`} label={department.name}>
                              {descendants.map((entry) => (
                                <option key={entry.slug} value={entry.slug}>
                                  {entry.path}
                                </option>
                              ))}
                            </optgroup>
                          );
                        })}
                        {scope && !searchScopes.some((entry) => entry.slug === scope) ? (
                          <option value={scope}>{selectedScopeLabel || scope} (current selection)</option>
                        ) : null}
                      </select>
                    </>
                  ) : null}
                  <Search className="ml-2 hidden h-4 w-4 shrink-0 self-center text-[#566359] sm:block" aria-hidden />
                  <input
                    id="shop-search-input"
                    name="q"
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value.slice(0, 120))}
                    maxLength={120}
                    enterKeyHint="search"
                    autoComplete="off"
                    placeholder={selectedScopeLabel ? `Search in ${selectedScopeLabel}` : "Search products, brands and categories"}
                    className="min-w-0 flex-1 bg-transparent px-2.5 text-[12px] text-[#14241b] outline-none placeholder:text-[#566359] sm:px-3 sm:text-[13px]"
                  />
                  <button
                    type="submit"
                    aria-label={selectedScopeLabel ? `Search in ${selectedScopeLabel}` : "Search all departments"}
                    className="grid w-11 shrink-0 place-items-center bg-[#f26b21] text-white transition hover:bg-[#d95a12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#07351f]"
                  >
                    <Search className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </form>
            </div>

            <button
              type="button"
              onClick={(event) => openLocation(event.currentTarget)}
              aria-label={locationAria}
              aria-haspopup="dialog"
              aria-expanded={openPanel === "location"}
              aria-controls="shop-location-panel"
              className="order-4 flex min-h-10 w-full min-w-0 items-center gap-1 rounded-lg px-1.5 py-0.5 text-left transition hover:bg-[#eef4ea] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] lg:order-3 lg:w-auto lg:max-w-[16rem] lg:shrink-0 lg:px-2 lg:py-1"
            >
              <MapPin className="h-4 w-4 shrink-0 text-[#0f7a4a]" aria-hidden />
              <span className="min-w-0 leading-tight">
                <span className="block text-[9px] font-semibold text-[#566359]">Deliver to</span>
                <span className="flex min-w-0 items-center gap-1">
                  <span
                    className={`truncate text-[11px] font-extrabold ${
                      locationLabel ? "text-[#14241b]" : "text-[#0b5c33]"
                    }`}
                  >
                    {locationLabel || "Choose delivery location"}
                  </span>
                  <ChevronDown className="h-3 w-3 shrink-0 text-[#4b5b51]" aria-hidden />
                </span>
              </span>
              <span className="ml-auto shrink-0 text-[10px] font-bold text-[#0b5c33] lg:ml-1">Change</span>
            </button>
          </div>
        </div>

        {shopPreview ? (
          <div role="status" className="border-t border-[#eef3ec] bg-[#f2f7ef] px-2 py-2 text-[11.5px] font-semibold leading-relaxed text-[#0b5c33] sm:px-5 lg:px-8">
            Preview mode: Shop is visible to authorized Control Center accounts only. Public catalogue, cart
            additions and checkout remain refused until the service is set to LIVE.
          </div>
        ) : null}

        {shopUnavailable ? (
          <div role="status" className="border-t border-[#eef3ec] bg-[#fff8e6] px-2 py-2.5 text-[11.5px] leading-relaxed text-[#5c4300] sm:px-5 lg:px-8">
            <strong className="font-extrabold">Shop is paused in this market.</strong>{" "}
            {shopAvailability?.message ??
              "New orders and listings are unavailable. Existing orders, receipts and support remain available."}{" "}
            <Link href="/orders" className="font-bold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33]">
              View orders
            </Link>
            {" · "}
            <Link href="/naijashop/help" className="font-bold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33]">
              Get help
            </Link>
          </div>
        ) : (
        <nav aria-label="Marketplace sections" className="border-t border-[#eef3ec] bg-[#f7faf4]">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-0.5 px-2 sm:px-5 lg:px-8">
            <button
              type="button"
              onClick={(event) => openAll(event.currentTarget)}
              aria-label={
                departmentTree.length > 0
                  ? `Open all departments (${departmentTree.length} departments, ${searchScopes.length} published nodes)`
                  : "Open all departments"
              }
              aria-haspopup="dialog"
              aria-expanded={openPanel === "all"}
              aria-controls="shop-all-panel"
              className="flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap px-1.5 text-[10.5px] font-extrabold text-[#07351f] transition hover:text-[#0b5c33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] sm:gap-1.5 sm:px-2 sm:text-[11.5px]"
            >
              <Grid2x2 className="h-3.5 w-3.5" aria-hidden />
              All
            </button>
            <span className="hidden h-4 w-px shrink-0 bg-[#dbe5d7] sm:block" aria-hidden />
            <Link
              href="/naijashop/deals"
              aria-current={pathname === "/naijashop/deals" ? "page" : undefined}
              className="flex min-h-11 shrink-0 items-center whitespace-nowrap px-1.5 text-[10.5px] font-extrabold text-[#b8440a] transition hover:text-[#8f3508] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b8440a] sm:px-2 sm:text-[11.5px]"
            >
              Price drops
            </Link>
            <Link
              href="/naijashop/bestsellers"
              aria-current={pathname === "/naijashop/bestsellers" ? "page" : undefined}
              className="flex min-h-11 shrink-0 items-center whitespace-nowrap px-1.5 text-[10.5px] font-semibold text-[#3d4f43] transition hover:text-[#0b5c33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] sm:px-2 sm:text-[11.5px]"
            >
              Bestsellers
            </Link>
            <button
              type="button"
              onClick={(event) => openMore(event.currentTarget)}
              aria-label="More marketplace options"
              aria-haspopup="dialog"
              aria-expanded={openPanel === "more"}
              aria-controls="shop-more-panel"
              className="flex min-h-11 shrink-0 items-center gap-0.5 whitespace-nowrap px-1.5 text-[10.5px] font-semibold text-[#3d4f43] transition hover:text-[#0b5c33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] sm:gap-1 sm:px-2 sm:text-[11.5px]"
            >
              More
              <ChevronDown className="h-3 w-3" aria-hidden />
            </button>

            {/* One scrollable row: the rail must stay a fixed height however many departments exist.
                The rail is a named, focusable region so keyboard and screen-reader users can
                reach the horizontal list and scroll it with the arrow keys. */}
            <div
              role="region"
              aria-label="Marketplace departments"
              tabIndex={0}
              data-shop-department-rail
              className="hidden min-w-0 flex-1 flex-nowrap items-center gap-x-0.5 overflow-x-auto [scrollbar-width:none] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0b5c33] xl:flex"
            >
              {categories.map((category) => (
                <Link
                  key={category.id}
                  href={`/naijashop/c/${category.slug}`}
                  aria-current={activeRootSlug === category.slug ? "page" : undefined}
                  className="flex min-h-11 shrink-0 items-center whitespace-nowrap px-2 text-[11.5px] font-semibold text-[#3d4f43] transition hover:text-[#0b5c33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33]"
                >
                  {category.name}
                </Link>
              ))}
            </div>
          </div>
        </nav>
        )}
      </header>

      <AllDrawer
        open={openPanel === "all"}
        onClose={() => setOpenPanel(null)}
        returnFocusRef={allReturnFocusRef}
        departments={departments}
        categoryCounts={categoryCounts}
        departmentsStatus={categoriesStatus}
        countsAvailable={countsStatus === "ready"}
        signedIn={sessionUser === undefined ? null : sessionUser !== null}
        taxonomyAvailable={taxonomyAvailable}
        directoryNotice={directoryNotice}
      />

      <AccountMenu
        open={openPanel === "account"}
        onClose={() => setOpenPanel(null)}
        returnFocusRef={accountReturnFocusRef}
        user={sessionUser}
        onSignedOut={() => {
          setSessionUser(null);
          setCartCount(0);
          setAddress(null);
        }}
      />

      <MorePanel
        open={openPanel === "more"}
        onClose={() => setOpenPanel(null)}
        returnFocusRef={moreReturnFocusRef}
      />

      <LocationPanel
        open={openPanel === "location"}
        onClose={() => setOpenPanel(null)}
        returnFocusRef={locationReturnFocusRef}
        address={address}
        savedAddress={savedAddress}
        city={city}
        cities={cities}
        onChooseCity={chooseCity}
      />
    </>
  );
}

function MorePanel({
  open,
  onClose,
  returnFocusRef
}: {
  open: boolean;
  onClose: () => void;
  returnFocusRef: React.RefObject<HTMLElement | null>;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <ShopPanelFrame
      open={open}
      onClose={onClose}
      side="right"
      panelId="shop-more-panel"
      labelledBy="shop-more-title"
      panelRef={panelRef}
      initialFocusRef={closeButtonRef}
      returnFocusRef={returnFocusRef}
    >
      <header className="shrink-0 bg-[#07351f] px-4 pb-3.5 pt-4 text-white">
        <div className="flex items-start gap-2.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-[#8ed14b]" aria-hidden>
            <Grid2x2 className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-[#8fb89a]">NaijaDeals Marketplace</p>
            <h2 id="shop-more-title" className="mt-0.5 truncate text-[17px] font-extrabold leading-tight">
              More
            </h2>
            <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-4 text-[#b9d5bd]">
              Buying services, help and the rest of the shop.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close more menu"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f5b52e]"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <section aria-labelledby="shop-more-services">
          <h3 id="shop-more-services" className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#0f7a4a]">
            Buying &amp; services
          </h3>
          <ul className="mt-2 divide-y divide-[#eef3ec]">
            <MoreRow href="/naijafresh/business" label="Bulk buying" description="Ask a producer for a quote; nothing is charged until you book." icon={Leaf} onClose={onClose} />
            <MoreRow href="/naijasend" label="Freight" description="Independent transporters quote larger loads." icon={Truck} onClose={onClose} />
            <MoreRow href="/sell" label="Sell on NaijaDeals" description="Apply for a verified seller account." icon={Store} onClose={onClose} />
            <MoreRow href="/naijashop/help" label="Help" description="Delivery, payments, returns and account help." icon={CircleHelp} onClose={onClose} />
          </ul>
        </section>

        <section aria-labelledby="shop-more-browse" className="mt-5">
          <h3 id="shop-more-browse" className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#0f7a4a]">
            Browse the marketplace
          </h3>
          <ul className="mt-2 divide-y divide-[#eef3ec]">
            <MoreRow href="/naijashop/categories" label="All departments" description="Every published department in one place." icon={Grid2x2} onClose={onClose} />
            <MoreRow href="/naijashop/deals" label="Price drops" description="Only listings with a seller-recorded reduction." icon={Tag} onClose={onClose} />
            <MoreRow href="/naijashop/bestsellers" label="Bestsellers" description="Popular listings ordered by price, not sales rank." icon={TrendingUp} onClose={onClose} />
            <MoreRow href="/naijashop/plus" label="Plus membership" description="Membership benefits and current status." icon={Plus} onClose={onClose} />
          </ul>
        </section>

        <div className="mt-5 rounded-2xl border border-[#e1e8de] bg-[#f7faf4] p-3.5">
          <p className="flex items-center gap-2 text-[11.5px] font-extrabold text-[#14241b]">
            <Boxes className="h-4 w-4 text-[#0b5c33]" aria-hidden />
            One account across NaijaDeals
          </p>
          <p className="mt-1 text-[10.5px] leading-4 text-[#566359]">
            Your cart, addresses and orders are shared with the rest of the ecosystem. Bulk prices come from the
            producer&apos;s own quote, not from a retail listing price.
          </p>
        </div>
      </div>
    </ShopPanelFrame>
  );
}

function MoreRow({
  href,
  label,
  description,
  icon: Icon,
  onClose
}: {
  href: string;
  label: string;
  description: string;
  icon: typeof Leaf;
  onClose: () => void;
}) {
  return (
    <li>
      <Link
        href={href}
        onClick={onClose}
        className="group flex min-h-12 items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-[#eef4ea] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-inset"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#eef4ea] text-[#0b5c33]">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-extrabold leading-tight text-[#14241b] group-hover:text-[#0b5c33]">
            {label}
          </span>
          <span className="mt-0.5 block text-[10.5px] leading-4 text-[#566359]">{description}</span>
        </span>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#7a9c80]" aria-hidden />
      </Link>
    </li>
  );
}

function LocationPanel({
  open,
  onClose,
  returnFocusRef,
  address,
  savedAddress,
  city,
  cities,
  onChooseCity
}: {
  open: boolean;
  onClose: () => void;
  returnFocusRef: React.RefObject<HTMLElement | null>;
  address: SavedAddress | null;
  savedAddress: string;
  city: string;
  cities: string[];
  onChooseCity: (next: string) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <ShopPanelFrame
      open={open}
      onClose={onClose}
      side="right"
      panelId="shop-location-panel"
      labelledBy="shop-location-title"
      panelRef={panelRef}
      initialFocusRef={closeButtonRef}
      returnFocusRef={returnFocusRef}
    >
      <header className="shrink-0 bg-[#07351f] px-4 pb-3.5 pt-4 text-white">
        <div className="flex items-start gap-2.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-[#8ed14b]" aria-hidden>
            <MapPin className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-[#8fb89a]">NaijaDeals Marketplace</p>
            <h2 id="shop-location-title" className="mt-0.5 truncate text-[17px] font-extrabold leading-tight">
              Delivery location
            </h2>
            <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-4 text-[#b9d5bd]">
              {savedAddress ? `Saved delivery address: ${savedAddress}.` : "Choose where you are shopping from."}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close delivery location menu"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f5b52e]"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {address ? (
          <div className="rounded-2xl border border-[#cfe0ca] bg-[#eef4ea] p-3.5">
            <p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-[#0f7a4a]">Saved delivery address</p>
            <p className="mt-1 text-[12.5px] font-extrabold text-[#14241b]">{savedAddress}</p>
            {address.line1 ? <p className="mt-0.5 text-[11px] leading-4 text-[#4b5b51]">{address.line1}</p> : null}
            {address.label ? <p className="mt-0.5 text-[10.5px] text-[#566359]">{address.label}</p> : null}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[#cfdccb] bg-[#f7faf4] p-3.5">
            <p className="text-[12.5px] font-extrabold text-[#14241b]">No delivery address saved</p>
            <p className="mt-1 text-[11px] leading-5 text-[#566359]">
              Choose a city below to browse the marketplace, or add an address to use at checkout.
            </p>
          </div>
        )}

        <label htmlFor="shop-location-city" className="mt-4 block text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#566359]">
          Marketplace city
        </label>
        <div className="relative mt-1">
          <select
            id="shop-location-city"
            value={city}
            onChange={(event) => onChooseCity(event.target.value)}
            className="h-11 w-full appearance-none rounded-xl border border-[#cfdccb] bg-white pl-3 pr-9 text-[13px] font-semibold text-[#14241b] outline-none transition focus:border-[#0b5c33] focus-visible:ring-2 focus-visible:ring-[#0b5c33]/20"
          >
            <option value="" disabled>
              {savedAddress ? "Choose a browsing city" : "Choose delivery location"}
            </option>
            {cities.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4b5b51]" aria-hidden />
        </div>
        <p className="mt-2 text-[10.5px] leading-4 text-[#566359]">
          {savedAddress
            ? "Your saved delivery address stays unchanged. This city only sets the Marketplace browsing context."
            : "This city is a browsing preference. A delivery address and delivery fee are confirmed at checkout."}
        </p>

        <Link
          href="/account#addresses"
          onClick={onClose}
          className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#b9cbb4] px-4 text-[12px] font-extrabold text-[#0b5c33] transition hover:bg-[#eef4ea] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2"
        >
          Manage delivery addresses
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </ShopPanelFrame>
  );
}
