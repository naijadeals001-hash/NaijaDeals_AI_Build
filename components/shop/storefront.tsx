"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Flag,
  Gamepad2,
  Grid2x2,
  Heart,
  Home as HomeIcon,
  Laptop,
  MapPin,
  Menu,
  Package,
  Search,
  Shirt,
  ShoppingBasket,
  ShoppingCart,
  Sparkles,
  Smartphone,
  Store,
  Tag,
  Truck,
  User,
  Wallet,
  Zap
} from "lucide-react";
import { apiClient, type ApiCategory, type ApiProduct } from "@/lib/api-client";
import type { ShopProduct } from "./product-card";
import { ShopHeroCarousel, type ShopHeroSlide } from "./hero-carousel";
import { DepartmentSidebar, PrimePanel } from "./department-sidebar";
import { ShopProductCard } from "./product-card";

/** Approved launch campaign, used until an operator publishes slides. */
const LAUNCH_SLIDES: ShopHeroSlide[] = [
  {
    id: "african-brands",
    eyebrow: "NaijaShop",
    headline: "Big deals on African brands",
    body: "Electronics, fashion, home and groceries from verified Nigerian sellers — escrow-protected, with tracked delivery nationwide.",
    ctaLabel: "Shop the deals",
    ctaHref: "/naijashop/deals",
    imageUrl: "/generated/shop/hero-desktop.webp",
    sideTitle: "NaijaShop Prime",
    sideBody: "Faster delivery, Prime-only deals and early access to sales.",
    sideCtaLabel: "See Prime plans",
    sideCtaHref: "/naijashop/prime"
  },
  {
    id: "electronics",
    eyebrow: "Electronics hub",
    headline: "Phones, laptops and power that last",
    body: "Compare verified sellers side by side. Every checkout is protected until your order arrives.",
    ctaLabel: "Shop electronics",
    ctaHref: "/naijashop/c/phones-tablets",
    imageUrl: "/generated/shop/hero-electronics.webp",
    sideTitle: "Solar and power",
    sideBody: "Inverters, panels and power banks built for Nigerian power realities.",
    sideCtaLabel: "Shop power",
    sideCtaHref: "/naijashop/c/power-solar"
  },
  {
    id: "fashion",
    eyebrow: "Fashion",
    headline: "Fashion for every style",
    body: "Trendy, authentic and affordable — from Nigerian makers to your door.",
    ctaLabel: "Shop fashion",
    ctaHref: "/naijashop/c/fashion",
    imageUrl: "/generated/shop/hero-fashion.webp",
    sideTitle: "Support Nigerian sellers",
    sideBody: "Local businesses, verified before they list.",
    sideCtaLabel: "Meet our sellers",
    sideCtaHref: "/naijashop/sellers"
  }
];

const SERVICE_TILES = [
  { label: "Today's Deals", href: "/naijashop/deals", icon: Tag },
  { label: "Flash Sales", href: "/naijashop/deals", icon: Zap },
  { label: "Bestsellers", href: "/naijashop/bestsellers", icon: Sparkles },
  { label: "NaijaShop Prime", href: "/naijashop/prime", icon: Package },
  { label: "Local Sellers", href: "/naijashop/sellers", icon: Store },
  { label: "Electronics", href: "/naijashop/c/phones-tablets", icon: Smartphone },
  { label: "Fashion", href: "/naijashop/c/fashion", icon: Shirt },
  { label: "Home & Kitchen", href: "/naijashop/c/home-kitchen", icon: HomeIcon },
  { label: "Made in Nigeria", href: "/naijashop/sellers", icon: Flag }
];

const BOTTOM_NAV = [
  { label: "Home", href: "/naijashop", icon: HomeIcon },
  { label: "Categories", href: "/naijashop/categories", icon: Grid2x2 },
  { label: "Cart", href: "/cart", icon: ShoppingCart },
  { label: "Account", href: "/account", icon: User }
];

/**
 * Acceptance suites create throwaway listings named "Variant Fixture …",
 * "Test checkout …", "Last unit …" and similar. They are real database rows but
 * never part of the storefront, so they must not appear in any shelf or deal.
 */
const TEST_LISTING = /^(variant fixture|test |upload test|last unit|product test)\b|-mw[0-9a-z]{8,}$/i;

type StorefrontConfig = {
  announcement?: string;
  showHero?: boolean;
  showShelves?: boolean;
  shelfLimit?: number;
  heroSlides?: ShopHeroSlide[];
};

export function NaijaShopStorefront() {
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [cartCount, setCartCount] = useState(0);
  const [addingId, setAddingId] = useState("");
  const [destination, setDestination] = useState("Lagos, Nigeria");
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [config, setConfig] = useState<StorefrontConfig>({});
  const [missingArt, setMissingArt] = useState<Record<string, boolean>>({});
  const markMissing = (key: string) => setMissingArt((current) => (current[key] ? current : { ...current, [key]: true }));
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    Promise.all([apiClient.getProducts(), apiClient.getCategories()])
      .then(([items, cats]) => {
        if (!active) return;
        setProducts(items.filter((product) => !TEST_LISTING.test(product.name) && !TEST_LISTING.test(product.slug ?? "")));
        setCategories(cats);
        setStatus("ready");
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load the marketplace.");
        setStatus("error");
      });
    Promise.allSettled([apiClient.getCart(), apiClient.getAddresses()]).then(([cart, addresses]) => {
      if (!active) return;
      if (cart.status === "fulfilled") {
        const value = cart.value as { items?: Array<{ quantity: number; savedForLater?: boolean }> };
        setCartCount(value?.items?.filter((item) => !item.savedForLater).reduce((sum, item) => sum + item.quantity, 0) ?? 0);
      }
      if (addresses.status === "fulfilled") {
        const list = addresses.value as Array<{ city?: string; state?: string; isDefault?: boolean }>;
        const chosen = list.find((address) => address.isDefault) ?? list[0];
        if (chosen) setDestination([chosen.city, chosen.state].filter(Boolean).join(", "));
      }
    });
    fetch("/api/storefront")
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => active && value && setConfig(value as StorefrontConfig))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const slides = config.heroSlides && config.heroSlides.length > 0 ? config.heroSlides : LAUNCH_SLIDES;
  const shelfLimit = config.shelfLimit && config.shelfLimit > 0 ? config.shelfLimit : 4;
  const byCategory = useMemo(() => {
    const map = new Map<string, ApiProduct[]>();
    for (const product of products) {
      const key = product.category?.slug ?? "other";
      map.set(key, [...(map.get(key) ?? []), product]);
    }
    return map;
  }, [products]);

  // Real brands only: the mockup's brand strip shows recognisable names, but we
  // list what the catalogue actually contains rather than implying partnerships.
  const brands = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of products) {
      const brand = product.brand?.trim();
      if (!brand || /demo|sample|inventory/i.test(brand)) continue;
      counts.set(brand, (counts.get(brand) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [products]);

  const deals = useMemo(
    () =>
      [...products]
        .filter((product) => product.priceKobo && (product.stock ? product.stock.quantity - product.stock.reserved > 0 : true))
        .sort((a, b) => Number(a.priceKobo) - Number(b.priceKobo))
        .slice(0, 6),
    [products]
  );

  async function addToCart(product: ShopProduct) {
    setAddingId(product.id);
    setNotice("");
    try {
      await apiClient.addCartItem(product.id, 1);
      setCartCount((count) => count + 1);
      setNotice(`${product.name} added to cart.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not add to cart.";
      setNotice(/sign in|unauthor|401/i.test(message) ? "Sign in to add items to your cart." : message);
    } finally {
      setAddingId("");
    }
  }

  return (
    <div className="w-full max-w-full overflow-x-clip bg-white text-[#0f1111]">
      <a
        href="#shop-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[100] focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-[13px] focus:font-bold focus:text-[#0f1111] focus:shadow-lg"
      >
        Skip to content
      </a>
      {/* ---------- Header ---------- */}
      <header className="bg-[#0f1b2d] text-white">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4">
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            className="grid h-9 w-9 place-items-center rounded hover:bg-white/10 lg:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>

          <Link href="/naijashop" className="flex min-w-0 shrink items-center gap-1.5" aria-label="NaijaShop home">
            <span className="text-[18px] font-extrabold tracking-tight sm:text-[24px] lg:text-[26px]">
              Naija<span className="text-[#f7b733]">Shop</span>
            </span>
            <span className="hidden text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50 sm:block">Africa&apos;s marketplace</span>
            <span className="sr-only">NaijaDeals</span>
          </Link>

          <Link href="/account#addresses" className="hidden shrink-0 items-start gap-1.5 rounded px-2 text-[11px] leading-tight text-white/80 hover:text-white xl:flex">
            <MapPin className="mt-0.5 h-4 w-4 text-[#f7b733]" aria-hidden />
            <span>
              <span className="block text-white/60">Deliver to</span>
              <span className="block text-[13px] font-bold text-white">{destination}</span>
            </span>
          </Link>

          <form action="/naijashop/search" method="get" className="order-last flex w-full min-w-0 items-stretch overflow-hidden rounded-md bg-white sm:max-w-[560px] lg:order-none lg:flex-1">
            <label htmlFor="shop-q" className="sr-only">
              Search NaijaShop products, brands and categories
            </label>
            <input
              id="shop-q"
              name="q"
              type="search"
              placeholder="Search NaijaShop (products, brands, categories)…"
              className="min-h-10 w-full min-w-0 flex-1 bg-white px-3 text-[13px] text-[#0f1111] outline-none placeholder:text-[#6b7280]"
            />
            <button type="submit" aria-label="Search" className="grid w-11 place-items-center bg-[#ffb020] text-[#12100a] transition hover:bg-[#f59e0b]">
              <Search className="h-4 w-4" aria-hidden />
            </button>
          </form>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <Link href="/account" className="hidden flex-col px-2 text-[11px] leading-tight hover:text-[#f7b733] md:flex">
              <span className="whitespace-nowrap text-white/60">Hello, sign in</span>
              <span className="whitespace-nowrap text-[13px] font-bold">Account &amp; Lists</span>
            </Link>
            <Link href="/orders" className="hidden flex-col px-2 text-[11px] leading-tight hover:text-[#f7b733] lg:flex">
              <span className="whitespace-nowrap text-white/60">Returns</span>
              <span className="whitespace-nowrap text-[13px] font-bold">&amp; Orders</span>
            </Link>
            <Link href="/account" aria-label="Account" className="grid h-9 w-9 shrink-0 place-items-center rounded hover:bg-white/10 md:hidden">
              <User className="h-5 w-5" aria-hidden />
            </Link>
            <Link href="/cart" className="relative flex shrink-0 items-center gap-1.5 rounded px-2 py-1 hover:text-[#f7b733]" aria-label={`Cart, ${cartCount} items`}>
              <ShoppingCart className="h-6 w-6" aria-hidden />
              <span className="absolute -top-0.5 left-4 grid h-4 min-w-4 place-items-center rounded-full bg-[#f7b733] px-1 text-[10px] font-black text-[#12100a]">
                {cartCount}
              </span>
              <span className="hidden whitespace-nowrap text-[13px] font-bold lg:inline">Cart</span>
            </Link>
          </div>
        </div>

        {/* Department strip */}
        <nav aria-label="Primary" aria-description="NaijaShop departments" className="border-t border-white/10 bg-[#132339]">
          <div className="mx-auto flex max-w-[1600px] items-center gap-1 overflow-x-auto px-2 text-[12.5px] [scrollbar-width:none] sm:px-4">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="flex shrink-0 items-center gap-1.5 px-2 py-2 font-bold hover:text-[#f7b733]"
            >
              <Menu className="h-4 w-4" aria-hidden /> All
            </button>
            <Link href="/naijashop/deals" className="shrink-0 px-2 py-2 hover:text-[#f7b733]">Deals</Link>
            {categories.map((category) => (
              <Link key={category.id} href={`/naijashop/c/${category.slug}`} className="shrink-0 px-2 py-2 hover:text-[#f7b733]">
                {category.name}
              </Link>
            ))}
          </div>
        </nav>
      </header>

      {menuOpen ? (
        <div className="fixed inset-0 z-[60] flex" role="dialog" aria-modal="true" aria-label="Browse departments">
          <button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} className="absolute inset-0 bg-black/55" />
          <div className="relative flex h-full w-[86%] max-w-sm flex-col overflow-y-auto bg-white text-[#0f1111] shadow-2xl">
            <p className="flex items-center gap-2 bg-[#0f1b2d] px-4 py-3 text-[15px] font-bold text-white">
              <User className="h-5 w-5" aria-hidden /> Hello
            </p>
            <p className="border-b border-[#e3e6e6] px-4 py-2 text-[12px] font-bold text-[#565959]">Shop by department</p>
            <ul>
              {categories.map((category) => (
                <li key={category.id}>
                  <Link href={`/naijashop/c/${category.slug}`} onClick={() => setMenuOpen(false)} className="flex items-center justify-between px-4 py-2.5 text-[13.5px] hover:bg-[#f3f4f6]">
                    {category.name}
                    <ChevronRight className="h-4 w-4 text-[#565959]" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
            <p className="border-y border-[#e3e6e6] px-4 py-2 text-[12px] font-bold text-[#565959]">Help &amp; settings</p>
            <ul className="pb-8">
              {[
                { label: "Your account", href: "/account" },
                { label: "Your orders", href: "/orders" },
                { label: "Your cart", href: "/cart" },
                { label: "NaijaPay wallet", href: "/wallet" },
                { label: "Sell on NaijaShop", href: "/sell" },
                { label: "Customer service", href: "/naijashop/help" }
              ].map((item) => (
                <li key={item.href}>
                  <Link href={item.href} onClick={() => setMenuOpen(false)} className="block px-4 py-2.5 text-[13.5px] hover:bg-[#f3f4f6]">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <main id="shop-main" className="mx-auto w-full max-w-[1600px] px-2 pb-24 sm:px-4 lg:pb-10">
        {notice ? (
          <p role="status" className="mb-2 flex items-center justify-between gap-3 rounded bg-[#e7f6ec] px-3 py-2 text-[12px] font-semibold text-[#0b5c2e]">
            {notice}
            <button type="button" onClick={() => setNotice("")} className="text-[11px] font-bold underline">
              Dismiss
            </button>
          </p>
        ) : null}

        {/* Hero band — sidebar | hero + quick access | Prime, as in the mockup */}
        {config.showHero === false ? null : (
          <div className="flex flex-col gap-2 pt-2 lg:flex-row lg:items-stretch">
            <DepartmentSidebar categories={categories} />
            <div className="min-w-0 lg:flex-1">
              <ShopHeroCarousel slides={slides} />
            </div>
            <PrimePanel />
          </div>
        )}

        {/* Service tiles — compact strip under the hero */}
        <section aria-label="Quick links" className="mt-2 rounded-lg bg-white px-1 py-1.5 ring-1 ring-[#e3e6e6]">
          <ul className="grid grid-cols-6 gap-0.5 lg:grid-cols-12">
            {SERVICE_TILES.map((tile, index) => (
              <li key={tile.label} className={index >= 6 ? "hidden lg:block" : ""}>
                <Link href={tile.href} className="flex flex-col items-center gap-0.5 rounded px-1 py-1 text-center hover:bg-[#f7f8f8]">
                  <tile.icon className="h-4 w-4 text-[#005f4b] sm:h-[18px] sm:w-[18px]" aria-hidden />
                  <span className="text-[9px] font-semibold leading-[1.15] sm:text-[10px]">{tile.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {status === "error" ? (
          <p role="alert" className="mt-3 rounded border border-[#f5c2c0] bg-[#fdf2f2] p-3 text-[12.5px] text-[#8a1c14]">
            {error}
          </p>
        ) : null}
        {status === "loading" ? (
          <p className="mt-6 text-center text-[12.5px] text-[#565959]">Loading the marketplace…</p>
        ) : null}

        {/* Deals of the day */}
        {deals.length > 0 ? (
          <section aria-labelledby="deals-heading" className="mt-4 rounded-lg bg-white p-3 ring-1 ring-[#e3e6e6]">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 id="deals-heading" className="flex items-center gap-2 font-display text-[19px] font-extrabold">
                Deals of the day
                <span className="rounded bg-[#cc0c39] px-1.5 py-0.5 text-[10px] font-bold text-white">Limited time</span>
              </h2>
              <Link href="/naijashop/deals" className="text-[12px] font-semibold text-[#007185] hover:underline">
                See all deals
              </Link>
            </div>
            <ul className="-mx-2 flex snap-x gap-2 overflow-x-auto px-2 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-2 sm:overflow-visible sm:px-0 lg:grid-cols-7">
              {deals.slice(0, 8).map((product) => (
                <li key={product.id} className="w-[45vw] max-w-[180px] shrink-0 snap-start sm:w-auto sm:max-w-none">
                  <ShopProductCard product={product} onAdd={addToCart} adding={addingId === product.id} variant="deal" />
                </li>
              ))}
              <li className="hidden lg:block">
                <Link href="/naijashop/sellers" className="relative flex h-full flex-col justify-end overflow-hidden rounded-lg bg-[#0d3b23] p-3 text-white">
                  <img src="/generated/shop/banner-sellers.webp" alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />
                  <span className="relative">
                    <span className="block font-display text-[14px] font-extrabold leading-tight">Support Nigerian sellers</span>
                    <span className="mt-0.5 block text-[10px] text-white/85">Shop from verified local businesses.</span>
                    <span className="mt-1.5 inline-block rounded bg-[#ffd814] px-2 py-0.5 text-[10px] font-bold text-[#0f1111]">Shop local</span>
                  </span>
                </Link>
              </li>
            </ul>
          </section>
        ) : null}

        {/* Prime card (mobile mockup places it under the deals row) */}
        <section aria-labelledby="prime-card" className="mt-3 rounded-lg bg-[#eaf2ff] p-3 lg:hidden">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p id="prime-card" className="font-display text-[17px] font-extrabold">
                NaijaShop <span className="text-[#1a4fb4]">Prime</span>
              </p>
              <p className="mt-0.5 text-[11px] leading-4 text-[#414d63]">Fast delivery, exclusive deals and more benefits</p>
            </div>
            <Link href="/naijashop/prime" className="shrink-0 rounded-full bg-[#ffc43d] px-3 py-1.5 text-[11.5px] font-bold text-[#12100a]">
              Join Prime
            </Link>
          </div>
          <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10.5px] font-semibold text-[#243049]">
            <li>✓ Free &amp; faster delivery</li>
            <li>✓ Prime-only deals</li>
            <li>✓ Early access to sales</li>
            <li>✓ Escrow protection</li>
          </ul>
        </section>

        {/* Category tiles */}
        <section aria-labelledby="category-heading" className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="category-heading" className="font-display text-[19px] font-extrabold">Shop by category</h2>
            <Link href="/naijashop/categories" className="text-[12px] font-semibold text-[#007185] hover:underline">
              See all categories
            </Link>
          </div>
          <ul className="-mx-2 flex snap-x gap-2 overflow-x-auto px-2 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-3 sm:overflow-visible sm:px-0 lg:grid-cols-4 xl:grid-cols-8">
            {categories.map((category) => {
              const override = (category as ApiCategory & { imageUrl?: string | null }).imageUrl;
              const url = override ?? `/generated/shop/category-${category.slug}.webp`;
              return (
                <li key={category.id} className="w-[104px] shrink-0 snap-start sm:w-auto">
                  <Link href={`/naijashop/c/${category.slug}`} data-category={category.slug} className="group block overflow-hidden rounded-lg bg-white ring-1 ring-[#e3e6e6] transition hover:shadow-md">
                    <div className="aspect-[4/3] w-full overflow-hidden bg-[#f7f8f8]">
                      {!missingArt[url] ? (
                        <img src={url} alt={category.name} loading="lazy" onError={() => markMissing(url)} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                      ) : (
                        <div className="grid h-full w-full place-items-center bg-[#f0f2f2] text-[11px] font-semibold text-[#565959]">{category.name}</div>
                      )}
                    </div>
                    <p className="px-1 py-1.5 text-center text-[11px] font-bold leading-tight sm:text-[12px]">{category.name}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Product shelves */}
        {config.showShelves === false
          ? null
          : categories.map((category) => {
              const items = (byCategory.get(category.slug) ?? []).slice(0, shelfLimit);
              if (items.length === 0) return null;
              return (
                <section key={category.id} aria-labelledby={`shelf-${category.slug}`} className="mt-4 rounded-lg bg-white p-3 ring-1 ring-[#e3e6e6]">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 id={`shelf-${category.slug}`} className="font-display text-[18px] font-extrabold">
                      {category.name}
                    </h2>
                    <Link href={`/naijashop/c/${category.slug}`} className="text-[12px] font-semibold text-[#007185] hover:underline">
                      See more
                    </Link>
                  </div>
                  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {items.map((product) => (
                      <li key={product.id}>
                        <ShopProductCard product={product} onAdd={addToCart} adding={addingId === product.id} />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}

        {/* Trending electronics + fashion banner (mockup: shelf left, promo right) */}
        {(() => {
          const electronics = (byCategory.get("phones-tablets") ?? []).concat(byCategory.get("computers") ?? []).slice(0, 6);
          if (electronics.length === 0) return null;
          return (
            <section aria-labelledby="trending-electronics" className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 id="trending-electronics" className="font-display text-[18px] font-extrabold">Trending in Electronics</h2>
                <Link href="/naijashop/c/phones-tablets" className="text-[12px] font-semibold text-[#007185] hover:underline">See more ›</Link>
              </div>
              <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_290px]">
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  {electronics.map((product) => (
                    <li key={product.id}>
                      <ShopProductCard product={product} onAdd={addToCart} adding={addingId === product.id} />
                    </li>
                  ))}
                </ul>
                <Link href="/naijashop/c/fashion" className="relative hidden min-h-[220px] overflow-hidden rounded-lg bg-[#3a2417] xl:block">
                  <img src="/generated/shop/hero-fashion.webp" alt="" className="absolute inset-0 h-full w-full object-cover" />
                  <span className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" aria-hidden />
                  <span className="relative flex h-full flex-col justify-center gap-1 p-4 text-white">
                    <span className="font-display text-[19px] font-extrabold leading-tight">Fashion for Every Style</span>
                    <span className="text-[11px] text-white/85">Trendy, authentic and affordable.</span>
                    <span className="mt-1 w-fit rounded-full bg-[#ffd814] px-3 py-1 text-[11px] font-bold text-[#0f1111]">Shop Fashion</span>
                  </span>
                </Link>
              </div>
            </section>
          );
        })()}

        {/* Lower promotional banners */}
        <section aria-label="Promotions" className="mt-4 grid gap-3 lg:grid-cols-3">
          {[
            { title: "Electronics hub", body: "Top gadgets and fast delivery.", cta: "Shop electronics", href: "/naijashop/c/phones-tablets", image: "/generated/shop/banner-electronics.webp", tint: "from-[#3b2f7a]" },
            { title: "Fast, reliable delivery", body: "Tracked to all 36 states + FCT.", cta: "How delivery works", href: "/naijashop/help", image: "/generated/shop/banner-delivery.webp", tint: "from-[#0b5c3b]" },
            { title: "Support Nigerian sellers", body: "Shop verified local businesses.", cta: "Shop local sellers", href: "/naijashop/sellers", image: "/generated/shop/banner-sellers.webp", tint: "from-[#7a3b12]" }
          ].map((banner) => (
            <Link key={banner.title} href={banner.href} className={`relative block min-h-[132px] overflow-hidden rounded-lg bg-gradient-to-r ${banner.tint} to-[#0f1111]`}>
              {!missingArt[banner.image] ? (
                <img src={banner.image} alt="" loading="lazy" onError={() => markMissing(banner.image)} className="absolute inset-0 h-full w-full object-cover opacity-60" />
              ) : null}
              <span className="relative flex h-full flex-col justify-center gap-1 p-4 text-white">
                <span className="font-display text-[17px] font-extrabold">{banner.title}</span>
                <span className="text-[11.5px] text-white/85">{banner.body}</span>
                <span className="mt-1 w-fit rounded-full bg-white px-3 py-1 text-[11px] font-bold text-[#0f1111]">{banner.cta}</span>
              </span>
            </Link>
          ))}
        </section>

        {/* Shop by brand — only brands that exist in the catalogue are listed. */}
        {brands.length > 0 ? (
          <section aria-labelledby="brands-heading" className="mt-4 rounded-lg bg-white p-3 ring-1 ring-[#e3e6e6]">
            <div className="mb-2 flex items-center justify-between">
              <h2 id="brands-heading" className="font-display text-[17px] font-extrabold">Shop by brand</h2>
              <Link href="/naijashop/categories" className="text-[12px] font-semibold text-[#007185] hover:underline">See all brands ›</Link>
            </div>
            <ul className="flex flex-wrap gap-2">
              {brands.map((brand) => (
                <li key={brand.name}>
                  <Link href={`/naijashop/search?q=${encodeURIComponent(brand.name)}`} className="block rounded border border-[#e3e6e6] px-4 py-2 text-[12.5px] font-bold hover:border-[#007185]">
                    {brand.name} <span className="font-normal text-[#565959]">({brand.count})</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Trust strip */}
        <section aria-label="Why shop with NaijaShop" className="mt-4 grid gap-2 rounded-lg bg-white p-3 ring-1 ring-[#e3e6e6] sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Truck, title: "Nationwide delivery", body: "To all 36 states and the FCT." },
            { icon: Wallet, title: "Secure payments", body: "Escrow-protected with NaijaPay." },
            { icon: Package, title: "Tracked orders", body: "Follow every order to your door." },
            { icon: Heart, title: "Support local", body: "Empowering Nigerian businesses." }
          ].map((item) => (
            <div key={item.title} className="flex items-start gap-2">
              <item.icon className="mt-0.5 h-5 w-5 text-[#005f4b]" aria-hidden />
              <div>
                <p className="text-[12.5px] font-bold">{item.title}</p>
                <p className="text-[11.5px] text-[#565959]">{item.body}</p>
              </div>
            </div>
          ))}
        </section>

        <p className="mt-4 text-center">
          <a href="#top" className="rounded bg-[#37475a] px-4 py-2 text-[12px] font-semibold text-white hover:bg-[#485769]">
            Back to top
          </a>
        </p>
      </main>

      {/* Mobile bottom navigation */}
      <nav aria-label="Mobile" aria-description="NaijaShop bottom navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e3e6e6] bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="grid grid-cols-4">
          {BOTTOM_NAV.map((item) => (
            <li key={item.label}>
              <Link href={item.href} className="flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-semibold text-[#565959] hover:text-[#0f1111]">
                <item.icon className="h-5 w-5" aria-hidden />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
