"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Loader2,
  MapPin,
  PackageCheck,
  Search,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  ShoppingCart,
  Bike,
  Coffee,
  CakeSlice,
  Salad,
  Soup,
  Sandwich,
  Pizza,
  Star,
  Store,
  Truck,
  Wallet,
  Smartphone,
  UtensilsCrossed,
  Laptop,
  Sofa,
  Shirt,
  Sparkles,
  ShoppingBasket,
  BatteryCharging,
  Gamepad2,
  Tag,
  Flame,
  Award,
  PackagePlus
} from "lucide-react";
import {
  ApiRequestError,
  apiClient,
  koboToNaira,
  statusLabel,
  type ApiCart,
  type ApiCategory,
  type ApiOrder,
  type ApiPaymentMethod,
  type ApiProduct,
  type CheckoutResult
} from "@/lib/api-client";
import { ModuleLanding } from "@/components/sections/module-landing";

function ErrorBox({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div role="alert" className="rounded-xl border border-crimson/30 bg-crimson-soft p-4 text-sm font-semibold text-crimson">
      <AlertCircle className="mb-1 h-5 w-5" />
      <p>{message}</p>
      {action}
    </div>
  );
}

function Loading() {
  return (
    <div className="grid min-h-64 place-items-center rounded-2xl border border-border-soft bg-canvas">
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading" />
    </div>
  );
}

export function ProductCard({ product, onAdd }: { product: ApiProduct; onAdd?: (product: ApiProduct) => void }) {
  const rating = product.rating;
  const available = product.available ?? 0;
  return (
    <article className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-border-soft bg-canvas shadow-sm transition hover:shadow-soft">
      {product.isSample ? (
        <span className="absolute left-3 top-3 z-10 rounded bg-amber-soft px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#B45309]">
          Sample
        </span>
      ) : null}
      {product.saleMode === "contact" ? (
        <span className="absolute right-3 top-3 z-10 rounded bg-night px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
          Contact seller
        </span>
      ) : null}
      <Link href={`/product/${product.slug}`} className="block bg-surface-low">
        <img
          src={product.images[0]?.url || "/products/tecno-spark-20.svg"}
          alt={product.images[0]?.alt || product.name}
          className="aspect-[4/3] w-full object-cover"
          loading="lazy"
        />
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">{product.category.name}</p>
        <Link href={`/product/${product.slug}`} className="mt-1 line-clamp-2 font-display text-base font-extrabold hover:text-primary">
          {product.name}
        </Link>
        <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-muted">
          <Store className="h-3.5 w-3.5" /> {product.vendor.name}
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs">
          {rating?.average ? (
            <span className="inline-flex items-center gap-1 font-bold text-amber">
              <Star className="h-3.5 w-3.5 fill-amber text-amber" /> {rating.average} ({rating.count})
            </span>
          ) : (
            <span className="text-muted">No reviews yet</span>
          )}
          <span className={available > 0 ? "text-primary" : "text-crimson"}>{available > 0 ? `${available} available` : "Out of stock"}</span>
        </div>
        <div className="mt-auto pt-3">
          <p className="font-display text-xl font-extrabold text-primary">{koboToNaira(product.priceKobo)}</p>
          {product.compareAtKobo ? (
            <p className="text-xs text-muted line-through">{koboToNaira(product.compareAtKobo)}</p>
          ) : null}
          {product.saleMode === "contact" ? (
            <Link
              href={`/product/${product.slug}`}
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-night bg-canvas px-4 text-sm font-bold text-ink"
            >
              <Store className="h-4 w-4" />
              Contact seller
            </Link>
          ) : product.variants && product.variants.length > 0 ? (
            <Link
              href={`/product/${product.slug}`}
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white"
            >
              <ShoppingCart className="h-4 w-4" />
              Choose options
            </Link>
          ) : (
            <button
              onClick={() => onAdd?.(product)}
              disabled={!onAdd || available === 0}
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-surface-mid disabled:text-muted"
            >
              <ShoppingCart className="h-4 w-4" />
              {available === 0 ? "Out of stock" : "Add to cart"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export function NaijaShopPage() {
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("featured");
  const [priceBand, setPriceBand] = useState("all");
  const [minRating, setMinRating] = useState(0);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [showSamples, setShowSamples] = useState(false);
  const [preset, setPreset] = useState<"all" | "deals" | "top" | "new">("all");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [addingId, setAddingId] = useState("");
  const PAGE_SIZE = 12;
  const collectionRef = useRef<HTMLDivElement>(null);

  // Amazon-inspired CSS grid pattern classes (commented out for ESLint parsing)
  // const gridPatterns = {
  //   twoPack: "grid-template-areas: \"a b\" grid-template-columns: repeat(2,1fr) grid-template-rows: repeat(2,1fr)",
  //   threePack: "grid-template-areas: \"a a\" grid-template-columns: repeat(2,1fr) grid-template-rows: repeat(3,1fr) \"b c\"",
  //   fourPack: "grid-template-areas: \"a b\" grid-template-columns: repeat(2,1fr) grid-template-rows: repeat(2,1fr) \"c d\"",
  //   ninePack: "grid-template-columns: repeat(12,1fr) grid-template-rows: repeat(3,1fr)",
  // };

  useEffect(() => {
    let active = true;
    Promise.all([apiClient.getProducts(), apiClient.getCategories()])
      .then(([items, cats]) => {
        if (!active) return;
        setProducts(items);
        setCategories(cats);
        if (items.every((item) => item.isSample)) setShowSamples(true);
        setStatus("ready");
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load the marketplace.");
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);

  // The public storefront only shows genuine seller listings. Seeded demo rows are
  // flagged in the database and stay behind an explicit, clearly-labelled toggle.
  const realProducts = useMemo(() => products.filter((product) => !product.isSample), [products]);
  const catalogue = showSamples ? products : realProducts;

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of catalogue) counts.set(product.category.slug, (counts.get(product.category.slug) ?? 0) + 1);
    return counts;
  }, [catalogue]);

  const priceBands = useMemo(
    () => [
      { id: "all", label: "All prices", min: 0, max: Number.POSITIVE_INFINITY },
      { id: "under-10k", label: "Under \u20a610,000", min: 0, max: 1_000_000 },
      { id: "10k-50k", label: "\u20a610,000 \u2013 \u20a649,999", min: 1_000_000, max: 5_000_000 },
      { id: "50k-100k", label: "\u20a650,000 \u2013 \u20a699,999", min: 5_000_000, max: 10_000_000 },
      { id: "100k-plus", label: "\u20a6100,000 & above", min: 10_000_000, max: Number.POSITIVE_INFINITY }
    ],
    []
  );

  const filtered = useMemo(() => {
    const band = priceBands.find((item) => item.id === priceBand) ?? priceBands[0];
    const list = catalogue.filter((product) => {
      if (category !== "all" && product.category.slug !== category) return false;
      const price = Number(product.priceKobo);
      if (price < band.min || price > band.max) return false;
      if (minRating > 0 && (product.rating?.average ?? 0) < minRating) return false;
      if (inStockOnly && (product.available ?? 0) <= 0) return false;
      if (preset === "deals" && !(product.compareAtKobo && Number(product.compareAtKobo) > Number(product.priceKobo))) return false;
      return true;
    });

    const sorted = [...list];
    if (sort === "price-asc") sorted.sort((a, b) => Number(a.priceKobo) - Number(b.priceKobo));
    if (sort === "price-desc") sorted.sort((a, b) => Number(b.priceKobo) - Number(a.priceKobo));
    if (sort === "rating" || preset === "top") sorted.sort((a, b) => (b.rating?.average ?? 0) - (a.rating?.average ?? 0) || (b.rating?.count ?? 0) - (a.rating?.count ?? 0));
    return sorted;
  }, [catalogue, category, priceBand, minRating, inStockOnly, sort, priceBands, preset]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const vendors = useMemo(() => new Set(catalogue.map((product) => product.vendor.id)).size, [catalogue]);

  function resetPage() {
    setPage(1);
  }

  async function add(product: ApiProduct) {
    setAddingId(product.id);
    setNotice("");
    setError("");
    try {
      await apiClient.addCartItem(product.id, 1, product.variants?.[0]?.id ?? null);
      setNotice(`${product.name} added to your cart.`);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) {
        setError("Sign in to add items to your cart.");
      } else {
        setError(err instanceof Error ? err.message : "Could not add this item.");
      }
    } finally {
      setAddingId("");
    }
  }

  const hasFilters = category !== "all" || priceBand !== "all" || minRating > 0 || inStockOnly || preset !== "all";
  const dealCount = catalogue.filter((product) => product.compareAtKobo && Number(product.compareAtKobo) > Number(product.priceKobo)).length;
  const ratedCount = catalogue.filter((product) => (product.rating?.count ?? 0) > 0).length;
  const categoryIcon = (name: string) => {
    const key = name.toLowerCase();
    if (/phone|tablet/.test(key)) return Smartphone;
    if (/computer|laptop/.test(key)) return Laptop;
    if (/home|kitchen|furniture/.test(key)) return Sofa;
    if (/fashion|cloth|shoe/.test(key)) return Shirt;
    if (/beauty|health|care/.test(key)) return Sparkles;
    if (/grocer/.test(key)) return ShoppingBasket;
    if (/power|solar|energy/.test(key)) return BatteryCharging;
    if (/gaming|game/.test(key)) return Gamepad2;
    return Tag;
  };

  return (
    <div className="space-y-0">
      <MarketplaceBar categories={categories} />

      <nav aria-label="Shop departments" className="-mx-3 mt-0 flex items-center gap-0.5 overflow-x-auto bg-[#232f3e] px-2 py-1.5 text-white sm:-mx-5 sm:px-4 lg:-mx-8 lg:px-6">
        <Link href="/search" className="whitespace-nowrap rounded px-2.5 py-1 text-xs font-bold hover:bg-white/10">All departments</Link>
        {categories.map((item) => (
          <Link key={item.id} href={`/search?category=${item.slug}`} className="whitespace-nowrap rounded px-2.5 py-1 text-xs font-bold hover:bg-white/10">
            {item.name}
          </Link>
        ))}
      </nav>

      {showSamples ? (
        <p className="mt-2 rounded border border-[#B45309]/30 bg-amber/10 px-3 py-2 text-[11px] text-ink">
          <strong>Demo catalogue.</strong> Sample listings are shown to preview the storefront; live seller listings replace them.
        </p>
      ) : null}

      <section aria-label="Featured collections" className="relative mt-3">
        <button
          type="button"
          aria-label="Previous collections"
          onClick={() => collectionRef.current?.scrollBy({ left: -340, behavior: "smooth" })}
          className="absolute left-0 top-1/2 z-10 hidden h-12 w-9 -translate-y-1/2 items-center justify-center rounded-r bg-white/90 text-[#0f1111] shadow hover:bg-white sm:flex"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div ref={collectionRef} className="flex snap-x gap-3 overflow-x-auto scroll-smooth pb-1">
          {categories.slice(0, 6).map((item, index) => {
            const items = products.filter((product) => product.category.id === item.id).slice(0, 4);
            const backgrounds = ["#007185", "#b12704", "#0b6b3a", "#b0008f", "#9a3f00", "#232f3e"];
            return (
              <article
                key={item.id}
                className="relative flex min-h-[360px] w-[300px] shrink-0 snap-start flex-col justify-between overflow-hidden rounded-lg p-4 text-white sm:w-[340px]"
                style={{ backgroundColor: backgrounds[index % backgrounds.length] }}
              >
                <div>
                  <h2 className="font-display text-2xl font-extrabold leading-tight">{item.name}</h2>
                  <p className="mt-1 text-xs text-white/95">Shop verified sellers in this department.</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {items.length > 0 ? items.map((product) => (
                    <Link key={product.id} href={`/product/${product.slug}`} className="grid aspect-square place-items-center rounded bg-white/95 p-2">
                      <img src={product.images[0]?.url || "/products/tecno-spark-20.svg"} alt={product.name} className="h-full w-full object-contain" style={{ width: "100%", height: "100%", objectFit: "contain" }} loading="lazy" />
                    </Link>
                  )) : <span className="col-span-2 text-xs text-white/80">New listings coming soon.</span>}
                </div>
                <Link href={`/search?category=${item.slug}`} className="mt-3 w-fit rounded bg-white px-3 py-1.5 text-xs font-bold text-[#0f1111] hover:bg-[#f7fafa]">
                  Shop now
                </Link>
              </article>
            );
          })}
        </div>
        <button
          type="button"
          aria-label="Next collections"
          onClick={() => collectionRef.current?.scrollBy({ left: 340, behavior: "smooth" })}
          className="absolute right-0 top-1/2 z-10 hidden h-12 w-9 -translate-y-1/2 items-center justify-center rounded-l bg-white/90 text-[#0f1111] shadow hover:bg-white sm:flex"
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </section>

      <section aria-label="Recommended collections" className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {categories.slice(0, 8).map((item) => {
          const items = products.filter((product) => product.category.id === item.id).slice(0, 4);
          return (
            <article key={item.id} className="rounded-lg border border-border-soft bg-canvas p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="line-clamp-1 text-lg font-extrabold text-[#0f1111]">{item.name}</h2>
                <Link href={`/search?category=${item.slug}`} className="shrink-0 text-xs font-bold text-[#007185] hover:underline">
                  See more
                </Link>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {items.length > 0 ? items.map((product) => (
                  <Link key={product.id} href={`/product/${product.slug}`} className="group">
                    <div className="grid h-24 place-items-center rounded bg-white p-1">
                      <img src={product.images[0]?.url || "/products/tecno-spark-20.svg"} alt={product.name} className="h-full w-full object-contain" style={{ width: "100%", height: "100%", objectFit: "contain" }} loading="lazy" />
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-[#0f1111] group-hover:text-[#c45500] group-hover:underline">{product.name}</p>
                  </Link>
                )) : <p className="col-span-2 text-xs text-muted">Listings coming soon.</p>}
              </div>
            </article>
          );
        })}
      </section>

      <section className="mt-4 rounded-lg border border-border-soft bg-canvas px-4 py-5 text-center">
        <h2 className="font-display text-xl font-extrabold text-[#0f1111]">See personalized recommendations</h2>
        <Link href="/login?next=/naijashop" className="mt-2 inline-flex min-h-9 items-center rounded-lg bg-[#ffd814] px-6 text-sm font-bold text-[#0f1111] hover:bg-[#f7ca00]">
          Sign in
        </Link>
        <p className="mt-1 text-[11px] text-[#565959]">New customer? <Link href="/register" className="text-[#007185] underline">Start here.</Link></p>
      </section>

      {notice ? (
        <div role="status" className="mt-4 rounded-lg border border-primary/20 bg-primary-soft p-3 text-sm font-bold text-primary">
          {notice}{" "}
          <Link href="/cart" className="underline">
            View cart
          </Link>
        </div>
      ) : null}
      {error ? (
        <div className="mt-4">
          <ErrorBox
            message={error}
            action={
              <Link href="/login" className="mt-2 inline-block font-bold underline">
                Sign in
              </Link>
            }
          />
        </div>
      ) : null}



      {!showSamples && realProducts.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border-soft bg-canvas p-8 text-center">
          <PackageCheck className="mx-auto mb-3 h-8 w-8 text-primary" aria-hidden="true" />
          <p className="font-bold">No live seller listings yet.</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            The storefront only shows products published by verified sellers. Once a seller adds a product it appears here with
            its real photos, stock and price.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link href="/sell" className="inline-flex min-h-10 items-center rounded-lg bg-primary px-4 text-sm font-bold text-white">
              Sell on NaijaDeals
            </Link>
            <button
              type="button"
              onClick={() => setShowSamples(true)}
              className="inline-flex min-h-10 items-center rounded-lg border border-border-soft px-4 text-sm font-bold text-ink"
            >
              View sample catalogue (demo)
            </button>
          </div>
        </div>
      ) : null}

    </div>
  );
}

function chipClass(active: boolean) {
  return [
    "min-h-9 whitespace-nowrap rounded-full px-3.5 text-xs font-bold transition",
    active ? "bg-primary text-white" : "border border-border-soft bg-canvas text-ink hover:border-primary/40 hover:text-primary"
  ].join(" ");
}

function MarketplaceBar({ categories }: { categories: ApiCategory[] }) {
  const [scope, setScope] = useState("all");
  return (
    <div className="-mx-3 bg-[#131921] px-3 py-2.5 text-white sm:-mx-5 sm:px-5 lg:-mx-8 lg:px-8">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-4">
        <Link href="/" className="flex items-center gap-2 rounded px-2 py-1 text-sm font-extrabold">
          <span className="grid h-7 w-7 place-items-center rounded bg-primary-live text-[11px] font-black text-[#04140f]">ND</span>
          NaijaDeals
        </Link>

        <Link href="/account" className="hidden items-start gap-1.5 px-2 text-xs leading-tight text-white/80 hover:text-white sm:flex">
          <MapPin className="mt-0.5 h-4 w-4 text-primary-live" aria-hidden="true" />
          <span>
            Deliver to <span className="font-extrabold text-white">Lagos, Nigeria</span>
          </span>
        </Link>

        <form action="/search" method="get" className="flex flex-1 items-stretch overflow-hidden rounded-lg bg-white text-ink">
          <label htmlFor="shop-department" className="sr-only">
            Search department
          </label>
          <select
            id="shop-department"
            name="category"
            value={scope}
            onChange={(event) => setScope(event.target.value)}
            className="hidden max-w-[9.5rem] border-r border-border-soft bg-surface-low px-2 text-xs font-semibold text-ink sm:block"
          >
            <option value="all">All departments</option>
            {categories.map((item) => (
              <option key={item.id} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>
          <label htmlFor="shop-search" className="sr-only">
            Search NaijaShop
          </label>
          <input
            id="shop-search"
            name="q"
            type="search"
            placeholder="Search NaijaShop products, brands and sellers"
            className="min-h-10 min-w-0 flex-1 bg-white px-3 text-sm text-ink outline-none placeholder:text-muted/70"
          />
          <button type="submit" className="grid w-11 place-items-center bg-[#f3b33d] text-[#0b1a13] transition hover:bg-[#e5a52f]" aria-label="Search">
            <Search className="h-4 w-4" aria-hidden="true" />
          </button>
        </form>

        <div className="flex items-center gap-4 text-xs font-bold">
          <Link href="/account" className="hidden leading-tight hover:text-primary-live sm:block">
            <span className="block text-white/70">Hello, sign in</span>
            <span className="text-sm">Account &amp; lists</span>
          </Link>
          <Link href="/orders" className="hidden leading-tight hover:text-primary-live sm:block">
            <span className="block text-white/70">Returns</span>
            <span className="text-sm">&amp; Orders</span>
          </Link>
          <Link href="/cart" className="flex items-center gap-1.5 rounded px-1 py-1 hover:text-primary-live">
            <ShoppingCart className="h-5 w-5" aria-hidden="true" />
            <span className="text-sm">Cart</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

function ShopFilters(props: {
  categories: ApiCategory[];
  categoryCounts: Map<string, number>;
  category: string;
  onCategory: (value: string) => void;
  priceBands: Array<{ id: string; label: string; min: number; max: number }>;
  priceBand: string;
  onPriceBand: (value: string) => void;
  minRating: number;
  onMinRating: (value: number) => void;
  inStockOnly: boolean;
  onInStockOnly: (value: boolean) => void;
  hasFilters: boolean;
  onClear: () => void;
}) {
  return (
    <aside aria-label="Filter results" className="space-y-4">
      <details open className="rounded-lg border border-border-soft bg-canvas lg:open">
        <summary className="cursor-pointer list-none px-4 py-3 font-extrabold">
          Department
          <span className="float-right text-xs font-bold text-muted lg:hidden">tap to change</span>
        </summary>
        <ul className="space-y-1 px-3 pb-3 text-sm">
          <li>
            <button
              type="button"
              onClick={() => props.onCategory("all")}
              aria-pressed={props.category === "all"}
              className={filterItemClass(props.category === "all")}
            >
              All departments <span className="text-xs text-muted">({[...props.categoryCounts.values()].reduce((a, b) => a + b, 0)})</span>
            </button>
          </li>
          {props.categories.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => props.onCategory(item.slug)}
                aria-pressed={props.category === item.slug}
                className={filterItemClass(props.category === item.slug)}
              >
                {item.name} <span className="text-xs text-muted">({props.categoryCounts.get(item.slug) ?? 0})</span>
              </button>
            </li>
          ))}
        </ul>
      </details>

      <details open className="rounded-lg border border-border-soft bg-canvas">
        <summary className="cursor-pointer list-none px-4 py-3 font-extrabold">Price</summary>
        <ul className="space-y-1 px-3 pb-3 text-sm">
          {props.priceBands.map((band) => (
            <li key={band.id}>
              <button
                type="button"
                onClick={() => props.onPriceBand(band.id)}
                aria-pressed={props.priceBand === band.id}
                className={filterItemClass(props.priceBand === band.id)}
              >
                {band.label}
              </button>
            </li>
          ))}
        </ul>
      </details>

      <details open className="rounded-lg border border-border-soft bg-canvas">
        <summary className="cursor-pointer list-none px-4 py-3 font-extrabold">Customer review</summary>
        <ul className="space-y-1 px-3 pb-3 text-sm">
          {[4, 3, 0].map((value) => (
            <li key={value}>
              <button
                type="button"
                onClick={() => props.onMinRating(value)}
                aria-pressed={props.minRating === value}
                className={filterItemClass(props.minRating === value)}
              >
                {value === 0 ? "All ratings" : `${value} stars & up`}
              </button>
            </li>
          ))}
        </ul>
      </details>

      <details open className="rounded-lg border border-border-soft bg-canvas">
        <summary className="cursor-pointer list-none px-4 py-3 font-extrabold">Availability</summary>
        <label className="flex items-center gap-2 px-4 pb-4 text-sm font-semibold">
          <input
            type="checkbox"
            checked={props.inStockOnly}
            onChange={(event) => props.onInStockOnly(event.target.checked)}
            className="h-4 w-4 accent-[#006d38]"
          />
          In stock only
        </label>
      </details>

      {props.hasFilters ? (
        <button type="button" onClick={props.onClear} className="w-full rounded-lg border border-border-soft px-3 py-2 text-sm font-bold text-primary">
          Clear all filters
        </button>
      ) : null}
    </aside>
  );
}

function filterItemClass(active: boolean) {
  return [
    "w-full rounded px-2 py-1.5 text-left transition",
    active ? "bg-primary-soft font-extrabold text-primary" : "font-semibold text-ink hover:text-primary"
  ].join(" ");
}

function Stars({ average, count }: { average: number | null | undefined; count: number }) {
  const value = average ?? 0;
  if (count === 0) return <span className="text-[11px] text-muted">No reviews yet</span>;
  return (
    <span className="flex items-center gap-1 text-xs" aria-label={count > 0 ? `${value.toFixed(1)} out of 5 stars, ${count} reviews` : "No reviews yet"}>
      <span className="flex" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-3.5 w-3.5 ${value >= star - 0.25 ? "fill-[#00E676]" : "fill-transparent"}`}
          />
        ))}
      </span>
      <span className="font-bold text-primary">{count > 0 ? count.toLocaleString() : "0"}</span>
    </span>
  );
}

function ShopResultRow({ product, onAdd }: { product: ApiProduct; onAdd: (product: ApiProduct) => void }) {
  const available = product.available ?? 0;
  const rating = product.rating?.average ?? 0;
  const reviewCount = product.rating?.count ?? 0;
  const discount = product.compareAtKobo && Number(product.compareAtKobo) > Number(product.priceKobo)
    ? Math.round((1 - Number(product.priceKobo) / Number(product.compareAtKobo)) * 100)
    : 0;

  return (
    <article className="flex gap-4 p-4 transition hover:bg-[#f7fafa]">
      <Link href={`/product/${product.slug}`} className="grid h-40 w-40 shrink-0 place-items-center overflow-hidden rounded-md border border-border-soft bg-white">
        <img
          src={product.images[0]?.url || "/products/tecno-spark-20.svg"}
          alt={product.images[0]?.alt || product.name}
          className="h-full w-full object-contain p-2"
          loading="lazy"
        />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {product.isSample ? <span className="rounded bg-amber-soft px-1.5 py-0.5 text-[10px] font-black uppercase text-[#B45309]">Sample</span> : null}
          {product.saleMode === "contact" ? <span className="rounded bg-[#131921] px-1.5 py-0.5 text-[10px] font-black uppercase text-white">Contact seller</span> : null}
        </div>
        <Link href={`/product/${product.slug}`} className="mt-0.5 line-clamp-2 text-lg font-medium leading-snug text-[#0f1111] hover:text-[#c45500] hover:underline">
          {product.name}
        </Link>
        <div className="mt-1 flex items-center gap-1 text-sm" aria-label={reviewCount ? `${rating.toFixed(1)} out of 5 stars, ${reviewCount} ratings` : "No ratings yet"}>
          <span className="text-[#ffa41c]" aria-hidden="true">{"★".repeat(Math.round(rating))}<span className="text-[#d5d9d9]">{"★".repeat(5 - Math.round(rating))}</span></span>
          <span className="text-xs text-[#007185]">{reviewCount > 0 ? `${reviewCount} ratings` : "No ratings yet"}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-2">
          <span className="text-2xl font-medium text-[#0f1111]">{koboToNaira(product.priceKobo)}</span>
          {discount > 0 ? (
            <>
              <span className="text-xs text-muted line-through">{koboToNaira(product.compareAtKobo as string)}</span>
              <span className="rounded bg-[#00E676] px-1.5 py-0.5 text-[10px] font-bold text-[#04140f]">-{discount}%</span>
            </>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-[#0f1111]">Delivery to <span className="font-bold">Lagos</span> · options shown at checkout</p>
        <p className="text-xs text-muted">Sold by {product.vendor?.name ?? "a verified seller"}{available > 0 ? ` · ${available} in stock` : " · out of stock"}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {product.saleMode === "contact" ? (
            <Link href={`/product/${product.slug}`} className="rounded-full bg-[#ffd814] px-4 py-1.5 text-xs font-bold text-[#0f1111] hover:bg-[#f7ca00]">Contact seller</Link>
          ) : (
            <button
              type="button"
              onClick={() => onAdd(product)}
              disabled={available <= 0}
              className="rounded-full bg-[#ffd814] px-4 py-1.5 text-xs font-bold text-[#0f1111] hover:bg-[#f7ca00] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add to cart
            </button>
          )}
          <Link href={`/product/${product.slug}`} className="text-xs font-bold text-[#007185] hover:underline">View details</Link>
        </div>
      </div>
    </article>
  );
}

function ShopResultCard({ product, onAdd }: { product: ApiProduct; onAdd: (product: ApiProduct) => void }) {
  const available = product.available ?? 0;
  const discount = product.compareAtKobo && Number(product.compareAtKobo) > Number(product.priceKobo)
    ? Math.round((1 - Number(product.priceKobo) / Number(product.compareAtKobo)) * 100)
    : 0;

  return (
    <article className="flex h-full flex-col rounded-lg border border-border-soft bg-canvas p-3 transition hover:shadow-soft">
      <div className="mb-1 flex items-center gap-1.5">
        {product.isSample ? (
          <span className="inline-flex w-fit items-center rounded bg-amber-soft px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#B45309]">
            Sample
          </span>
        ) : null}
        {product.saleMode === "contact" ? (
          <span className="inline-flex w-fit items-center rounded bg-[#0b1a13] px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
            Contact seller
          </span>
        ) : null}
      </div>
      <Link href={`/product/${product.slug}`} className="grid place-items-center bg-white">
        <img
          src={product.images[0]?.url || "/products/tecno-spark-20.svg"}
          alt={product.images[0]?.alt || product.name}
          width={400}
          height={400}
          loading="lazy"
          className="aspect-square w-full object-contain p-2"
        />
      </Link>
      <Link href={`/product/${product.slug}`} className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-ink hover:text-primary">
        {product.name}
      </Link>
      <div className="mt-1 flex items-center gap-2">
        <Stars average={product.rating?.average} count={product.rating?.count ?? 0} />
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
        <span className="font-display text-lg font-extrabold text-ink">{koboToNaira(product.priceKobo)}</span>
        {discount > 0 ? (
          <span className="rounded bg-[#00E676] px-1.5 py-0.5 text-[10px] font-black text-white">-{discount}%</span>
        ) : null}
      </div>
      {product.compareAtKobo ? (
        <p className="text-[11px] text-muted">
          List: <span className="line-through">{koboToNaira(product.compareAtKobo)}</span>
        </p>
      ) : null}
      <p className="mt-1 text-[11px] font-semibold text-muted">
        {available > 0 ? (available <= 3 ? `Only ${available} left in stock` : "In stock") : "Currently unavailable"}
      </p>
      <p className="text-[11px] text-muted">Sold by {product.vendor.name}</p>
      <div className="mt-auto pt-3">
        {product.saleMode === "contact" ? (
          <Link
            href={`/product/${product.slug}`}
            className="inline-flex min-h-9 w-full items-center justify-center rounded-full border border-[#0b1a13] px-3 text-xs font-bold text-ink transition hover:bg-surface-low"
          >
            Contact seller
          </Link>
        ) : product.variants && product.variants.length > 0 ? (
          <Link
            href={`/product/${product.slug}`}
            className="inline-flex min-h-9 w-full items-center justify-center rounded-full bg-[#ffd814] px-3 text-xs font-bold text-[#0b1a13] transition hover:bg-[#f7ca00]"
          >
            See options
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => onAdd(product)}
            disabled={available === 0}
            className="inline-flex min-h-9 w-full items-center justify-center rounded-full bg-[#ffd814] px-3 text-xs font-bold text-[#0b1a13] transition hover:bg-[#f7ca00] disabled:cursor-not-allowed disabled:bg-surface-mid disabled:text-muted"
          >
            {available === 0 ? "Out of stock" : "Add to cart"}
          </button>
        )}
      </div>
    </article>
  );
}

export function SearchPage() {
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [category, setCategory] = useState(params.get("category") ?? "all");
  const [sort, setSort] = useState(params.get("sort") ?? "newest");
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState("");
  const router = useRouter();

  async function add(product: ApiProduct) {
    setAdding(product.id);
    setError("");
    try {
      await apiClient.addCartItem(product.id, 1);
      setNotice(`${product.name} added to cart.`);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) {
        router.push("/login?next=/cart");
        return;
      }
      setError(err instanceof Error ? err.message : "Could not add this item to the cart.");
    } finally {
      setAdding("");
    }
  }

  const load = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const items = await apiClient.getProducts({ q: query, category, sort });
      setProducts(items);
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
      setStatus("error");
    }
  }, [query, category, sort]);

  useEffect(() => {
    void apiClient.getCategories().then(setCategories).catch(() => undefined);
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => void load(), 250);
    return () => clearTimeout(timeout);
  }, [load]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-3xl font-extrabold">Search NaijaShop</h1>
        <p className="text-sm text-muted">Results are filtered from live product inventory.</p>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
        className="grid gap-3 rounded-2xl border border-border-soft bg-canvas p-4 sm:grid-cols-[1fr_200px_180px_auto]"
      >
        <label className="block">
          <span className="text-xs font-black uppercase text-muted">Search</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Phone, laptop, blender..."
            className="mt-1 min-h-11 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm font-semibold outline-none focus:border-primary"
          />
        </label>
        <label className="block">
          <span className="text-xs font-black uppercase text-muted">Category</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm font-semibold"
          >
            <option value="all">All categories</option>
            {categories.map((item) => (
              <option key={item.id} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-black uppercase text-muted">Sort</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm font-semibold"
          >
            <option value="newest">Newest</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
            <option value="trust">Seller trust</option>
          </select>
        </label>
        <button type="submit" className="min-h-11 self-end rounded-lg bg-primary px-5 text-sm font-bold text-white">
          Search
        </button>
      </form>

      {status === "loading" ? <Loading /> : null}
      {status === "error" ? <ErrorBox message={error} /> : null}
      {notice ? <div role="status" className="rounded-lg border border-primary/20 bg-primary-soft p-3 text-sm font-bold text-primary">{notice} <Link href="/cart" className="underline">View cart</Link></div> : null}
      {status === "ready" ? (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border-soft pb-2">
            <h2 className="text-xl font-extrabold text-[#0f1111]">Results</h2>
            <p className="text-sm text-muted">1–{products.length} of {products.length} results{query ? ` for "${query}"` : ""}</p>
          </div>
          {products.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border-soft bg-canvas p-8 text-center">
              <p className="font-bold">No products matched your filters.</p>
              <p className="mt-1 text-sm text-muted">Try a broader search or browse a department from the shop header.</p>
            </div>
          ) : (
            <div className="divide-y divide-border-soft rounded-lg border border-border-soft bg-canvas">
              {products.map((product) => (
                <div key={product.id} className={adding === product.id ? "pointer-events-none opacity-60" : ""}>
                  <ShopResultRow product={product} onAdd={add} />
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

export function ShopCartPage() {
  const [cart, setCart] = useState<ApiCart | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "signed-out">("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      setCart(await apiClient.getCart());
      setStatus("ready");
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) setStatus("signed-out");
      else {
        setError(err instanceof Error ? err.message : "Unable to load cart.");
        setStatus("error");
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function update(itemId: string, quantity: number, savedForLater?: boolean) {
    setBusy(itemId);
    try {
      setCart(await apiClient.updateCartItem(itemId, quantity, savedForLater));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update cart.");
    } finally {
      setBusy("");
    }
  }

  async function remove(itemId: string) {
    setBusy(itemId);
    try {
      setCart(await apiClient.deleteCartItem(itemId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove item.");
    } finally {
      setBusy("");
    }
  }

  if (status === "loading") return <Loading />;
  if (status === "signed-out") {
    return (
      <div className="rounded-2xl border border-border-soft bg-canvas p-8 text-center">
        <ShoppingCart className="mx-auto mb-3 h-8 w-8 text-primary" />
        <h1 className="font-display text-2xl font-extrabold">Sign in to see your cart</h1>
        <Link href="/login" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-sm font-bold text-white">
          Sign in
        </Link>
      </div>
    );
  }
  if (status === "error" || !cart) return <ErrorBox message={error || "Cart unavailable."} />;

  const active = cart.items.filter((item) => !item.savedForLater);
  const saved = cart.items.filter((item) => item.savedForLater);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold">Your cart</h1>
          <p className="text-sm text-muted">{active.length} line item(s)</p>
        </div>
        <Link href="/naijashop" className="text-sm font-bold text-primary underline">
          Continue shopping
        </Link>
      </header>
      {error ? <ErrorBox message={error} /> : null}
      {active.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-soft bg-canvas p-8 text-center">
          <p className="font-bold">Your cart is empty.</p>
          <Link href="/naijashop" className="mt-3 inline-block text-sm font-bold text-primary underline">
            Browse products
          </Link>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols[2]">
          <div className="space-y-3">
            {active.map((item) => (
              <article key={item.id} className="flex gap-3 rounded-2xl border border-border-soft bg-canvas p-3">
                <img src={item.product.images[0]?.url} alt="" className="h-24 w-24 rounded-xl object-cover" />
                <div className="min-w-0 flex-1">
                  <Link href={`/product/${item.product.slug}`} className="font-bold hover:text-primary">
                    {item.product.name}
                  </Link>
                  {item.variant ? <p className="text-xs font-semibold text-muted">{item.variant.name}</p> : null}
                  <p className="mt-1 text-sm font-bold text-primary">
                    {koboToNaira(item.variant?.priceKobo ?? item.product.priceKobo)}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center rounded-lg border border-border-soft">
                      <button
                        aria-label="Decrease quantity"
                        disabled={busy === item.id || item.quantity <= 1}
                        onClick={() => void update(item.id, item.quantity - 1)}
                        className="min-h-9 min-w-9 text-lg font-bold disabled:opacity-40"
                      >
                        −
                      </button>
                      <span className="min-w-8 text-center text-sm font-bold">{item.quantity}</span>
                      <button
                        aria-label="Increase quantity"
                        disabled={busy === item.id}
                        onClick={() => void update(item.id, item.quantity + 1)}
                        className="min-h-9 min-w-9 text-lg font-bold"
                      >
                        +
                      </button>
                    </div>
                    <button onClick={() => void update(item.id, item.quantity, true)} className="text-xs font-bold text-muted underline">
                      Save for later
                    </button>
                    <button onClick={() => void remove(item.id)} className="text-xs font-bold text-crimson underline">
                      Remove
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <aside className="h-fit rounded-2xl border border-border-soft bg-canvas p-5">
            <h2 className="font-display text-xl font-extrabold">Summary</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Subtotal</dt>
                <dd className="font-bold">{koboToNaira(cart.totals.subtotalKobo)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Delivery</dt>
                <dd className="font-bold">Calculated at checkout</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Escrow fee</dt>
                <dd className="font-bold">1% at checkout</dd>
              </div>
            </dl>
            <Link href="/checkout" className="mt-5 flex min-h-12 items-center justify-center rounded-xl bg-primary text-sm font-bold text-white">
              Proceed to checkout
            </Link>
            <p className="mt-3 text-xs text-muted">Final total is recalculated on the server before payment.</p>
          </aside>
        </div>
      )}
      {saved.length > 0 ? (
        <section className="rounded-2xl border border-border-soft bg-canvas p-4">
          <h2 className="font-display text-lg font-extrabold">Saved for later ({saved.length})</h2>
          <div className="mt-3 space-y-2">
            {saved.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface-low p-3">
                <div>
                  <p className="text-sm font-bold">{item.product.name}</p>
                  <p className="text-xs text-muted">{koboToNaira(item.variant?.priceKobo ?? item.product.priceKobo)}</p>
                </div>
                <button
                  onClick={() => void update(item.id, 1, false)}
                  className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white"
                >
                  Move to cart
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

type AddressForm = {
  label: string;
  contactName: string;
  contactPhone: string;
  countryCode: string;
  state: string;
  city: string;
  line1: string;
  line2: string;
  postalCode: string;
};

const emptyAddress: AddressForm = {
  label: "Home",
  contactName: "",
  contactPhone: "",
  countryCode: "NG",
  state: "Lagos",
  city: "Ikeja",
  line1: "",
  line2: "",
  postalCode: ""
};

export function ShopCheckoutPage() {
  const router = useRouter();
  const [address, setAddress] = useState<AddressForm>(emptyAddress);
  const [saveAddress, setSaveAddress] = useState(true);
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [status, setStatus] = useState<"form" | "submitting" | "paying" | "error">("form");
  const [error, setError] = useState("");
  const [methods, setMethods] = useState<ApiPaymentMethod[]>([]);
  const [selected, setSelected] = useState("");
  const [payingOrder, setPayingOrder] = useState("");

  useEffect(() => {
    apiClient
      .getPaymentMethods("NG")
      .then((data) => {
        setMethods(data.methods);
        setSelected(data.methods[0]?.id ?? "");
      })
      .catch(() => undefined);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("submitting");
    setError("");
    try {
      const checkout = await apiClient.checkout({ address, saveAddress });
      setResult(checkout);
      setStatus("form");
      if (checkout.paymentMethods.length > 0) setSelected(checkout.paymentMethods[0].id);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) {
        router.push("/login");
        return;
      }
      setError(err instanceof Error ? err.message : "Checkout failed.");
      setStatus("error");
    }
  }

  async function pay(orderId: string) {
    if (!selected) {
      setError("Choose a configured payment method.");
      return;
    }
    setPayingOrder(orderId);
    setStatus("paying");
    setError("");
    try {
      const payment = await apiClient.initializePayment(orderId, selected);
      if (payment.redirectUrl) {
        window.location.href = payment.redirectUrl;
        return;
      }
      const confirmed = await apiClient.confirmPayment(payment.reference, selected);
      if (confirmed.status === "COMPLETED") {
        router.push("/orders?paid=1");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment could not be verified.");
      setStatus("error");
    } finally {
      setPayingOrder("");
    }
  }

  if (!result) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <header>
          <h1 className="font-display text-3xl font-extrabold">Checkout</h1>
          <p className="text-sm text-muted">Delivery is calculated from the destination state and city.</p>
        </header>
        {error ? <ErrorBox message={error} /> : null}
        <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-border-soft bg-canvas p-5 sm:grid-cols-2">
          {(
            [
              ["contactName", "Full name"],
              ["contactPhone", "Phone number"],
              ["line1", "Street address"],
              ["line2", "Apartment / landmark (optional)"],
              ["city", "City"],
              ["state", "State"]
            ] as Array<[keyof AddressForm, string]>
          ).map(([field, label]) => (
            <label key={field} className={field === "line1" || field === "line2" ? "sm:col-span-2" : ""}>
              <span className="text-sm font-black">{label}</span>
              <input
                required={field !== "line2"}
                value={address[field]}
                onChange={(event) => setAddress((current) => ({ ...current, [field]: event.target.value }))}
                className="mt-1 min-h-11 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm font-semibold outline-none focus:border-primary"
              />
            </label>
          ))}
          <label>
            <span className="text-sm font-black">Country</span>
            <select
              value={address.countryCode}
              onChange={(event) => setAddress((current) => ({ ...current, countryCode: event.target.value }))}
              className="mt-1 min-h-11 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm font-semibold"
            >
              <option value="NG">Nigeria</option>
            </select>
          </label>
          <label>
            <span className="text-sm font-black">Address label</span>
            <input
              value={address.label}
              onChange={(event) => setAddress((current) => ({ ...current, label: event.target.value }))}
              className="mt-1 min-h-11 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm font-semibold"
            />
          </label>
          <label className="flex items-center gap-2 sm:col-span-2">
            <input type="checkbox" checked={saveAddress} onChange={(event) => setSaveAddress(event.target.checked)} className="h-4 w-4" />
            <span className="text-sm font-semibold">Save this address to my account</span>
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={status === "submitting"}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white disabled:opacity-60"
            >
              {status === "submitting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Review order and choose payment
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="font-display text-3xl font-extrabold">Pay for your order</h1>
        <p className="text-sm text-muted">
          Stock has been reserved. Payment is confirmed with the provider on our server before the seller is notified.
        </p>
      </header>
      {error ? <ErrorBox message={error} /> : null}
      {result.paymentMethods.length === 0 ? (
        <ErrorBox
          message="No payment method is configured on this server. The order is saved with reserved stock, but it cannot be paid until a provider is configured. Add PAYSTACK_SECRET_KEY or FLUTTERWAVE_SECRET_KEY to .env, or enable the local test provider with ENABLE_TEST_PAYMENTS=true for local verification."
          action={
            <Link href="/orders" className="mt-2 inline-block font-bold underline">
              View order
            </Link>
          }
        />
      ) : (
        <section className="rounded-2xl border border-border-soft bg-canvas p-5">
          <h2 className="font-display text-xl font-extrabold">Payment method</h2>
          <div className="mt-3 space-y-2">
            {result.paymentMethods.map((method) => (
              <label key={method.id} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${selected === method.id ? "border-primary bg-primary-soft" : "border-border-soft"}`}>
                <input
                  type="radio"
                  name="payment"
                  value={method.id}
                  checked={selected === method.id}
                  onChange={() => setSelected(method.id)}
                  className="mt-1"
                />
                <span>
                  <span className="flex items-center gap-2 font-bold">
                    {method.id === "wallet" ? <Wallet className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                    {method.label}
                  </span>
                  <span className="text-sm text-muted">{method.description}</span>
                </span>
              </label>
            ))}
          </div>
        </section>
      )}

      <div className="space-y-3">
        {result.orders.map((order) => (
          <article key={order.orderId} className="rounded-2xl border border-border-soft bg-canvas p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-muted">{order.orderNumber}</p>
                <p className="font-display text-lg font-extrabold">{order.vendorName}</p>
                <p className="text-sm text-muted">{statusLabel("payment_pending")}</p>
              </div>
              <p className="font-display text-2xl font-extrabold text-primary">{koboToNaira(order.totalKobo)}</p>
            </div>
            <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted">Subtotal</dt>
                <dd className="font-bold">{koboToNaira(order.subtotalKobo)}</dd>
              </div>
              <div>
                <dt className="text-muted">Delivery</dt>
                <dd className="font-bold">{koboToNaira(order.deliveryFeeKobo)}</dd>
              </div>
              <div>
                <dt className="text-muted">Escrow fee (1%)</dt>
                <dd className="font-bold">{koboToNaira(order.escrowFeeKobo)}</dd>
              </div>
            </dl>
            <button
              onClick={() => void pay(order.orderId)}
              disabled={result.paymentMethods.length === 0 || payingOrder === order.orderId}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-surface-mid disabled:text-muted sm:w-auto"
            >
              {payingOrder === order.orderId ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {selected === "test" ? "Confirm local test payment" : selected === "wallet" ? "Pay from wallet" : "Pay securely"}
            </button>
          </article>
        ))}
      </div>
      <p className="text-xs text-muted">
        If a provider redirects you away, return to <Link href="/orders" className="underline">Orders</Link> to see the
        verified status. Duplicate callbacks are ignored.
      </p>
    </div>
  );
}

function PayOrderPanel({ order, onPaid }: { order: ApiOrder; onPaid: () => void }) {
  const [methods, setMethods] = useState<ApiPaymentMethod[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiClient
      .getPaymentMethods(order.currency === "NGN" ? "NG" : "NG")
      .then((data) => {
        setMethods(data.methods);
        setSelected(data.methods[0]?.id ?? "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load payment methods."));
  }, [order.currency]);

  async function pay() {
    setBusy(true);
    setError("");
    try {
      const payment = await apiClient.initializePayment(order.id, selected);
      if (payment.redirectUrl) {
        window.location.href = payment.redirectUrl;
        return;
      }
      await apiClient.confirmPayment(payment.reference, selected);
      onPaid();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl bg-surface-low p-3">
      {error ? <p className="mb-2 text-sm font-bold text-crimson">{error}</p> : null}
      {methods.length === 0 ? (
        <p className="text-sm font-semibold text-muted">No payment provider is configured on this server.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Payment method"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            className="min-h-10 rounded-lg border border-border-soft bg-canvas px-3 text-sm font-bold"
          >
            {methods.map((method) => (
              <option key={method.id} value={method.id}>
                {method.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => void pay()}
            disabled={busy}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            Pay {koboToNaira(order.totalKobo)}
          </button>
        </div>
      )}
    </div>
  );
}

export function OrdersPageApi() {
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "signed-out">("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reviewFor, setReviewFor] = useState<{ orderId: string; productId: string } | null>(null);
  const [review, setReview] = useState({ rating: 5, title: "", body: "" });

  const load = useCallback(async () => {
    try {
      setOrders(await apiClient.getOrders());
      setStatus("ready");
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) setStatus("signed-out");
      else {
        setError(err instanceof Error ? err.message : "Unable to load orders.");
        setStatus("error");
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancel(order: ApiOrder) {
    if (!window.confirm(`Cancel order ${order.orderNumber}? Reserved stock will be released.`)) return;
    setError("");
    try {
      const result = await apiClient.cancelOrder(order.id, "Cancelled from the orders page.");
      setNotice(result.refunded ? "Order cancelled and refunded." : "Order cancelled and stock released.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel order.");
    }
  }

  async function confirmDelivery(order: ApiOrder) {
    setError("");
    try {
      await apiClient.confirmOrder(order.id);
      setNotice("Delivery confirmed. Escrow released to the seller.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not confirm delivery.");
    }
  }

  async function requestReturn(order: ApiOrder) {
    const reason = window.prompt("Why are you returning this order?");
    if (!reason) return;
    setError("");
    try {
      await apiClient.requestReturn(order.id, reason);
      setNotice("Return requested. The seller will review it.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not request a return.");
    }
  }

  async function submitReview(event: React.FormEvent) {
    event.preventDefault();
    if (!reviewFor) return;
    setError("");
    try {
      await apiClient.createReview({ ...reviewFor, ...review });
      setNotice("Review submitted for moderation.");
      setReviewFor(null);
      setReview({ rating: 5, title: "", body: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit review.");
    }
  }

  if (status === "loading") return <Loading />;
  if (status === "signed-out") {
    return (
      <div className="rounded-2xl border border-border-soft bg-canvas p-8 text-center">
        <PackageCheck className="mx-auto mb-3 h-8 w-8 text-primary" />
        <h1 className="font-display text-2xl font-extrabold">Sign in to view orders</h1>
        <Link href="/login" className="mt-4 inline-block rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-3xl font-extrabold">Your orders</h1>
        <p className="text-sm text-muted">Payment, fulfilment and delivery status are recorded server-side.</p>
      </header>
      {notice ? <div role="status" className="rounded-xl bg-primary-soft p-4 text-sm font-bold text-primary">{notice}</div> : null}
      {error ? <ErrorBox message={error} /> : null}
      {orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-soft bg-canvas p-8 text-center">
          <p className="font-bold">No orders yet.</p>
          <Link href="/naijashop" className="mt-3 inline-block text-sm font-bold text-primary underline">
            Start shopping
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const delivery = order.deliveries?.[0];
            const canCancel = ["created", "payment_pending", "vendor_notified"].includes(order.status);
            const canConfirm = order.status === "delivered";
            const canReturn = ["delivered", "completed"].includes(order.status) && !order.returnRequests?.length;
            const unpaid = order.paymentStatus === "pending" && ["created", "payment_pending"].includes(order.status);
            return (
              <article key={order.id} className="rounded-2xl border border-border-soft bg-canvas p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-muted">{order.orderNumber}</p>
                    <p className="font-display text-lg font-extrabold">{order.vendor?.name ?? "Seller"}</p>
                    <p className="text-xs text-muted">{new Date(order.createdAt).toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-xl font-extrabold text-primary">{koboToNaira(order.totalKobo, order.currency)}</p>
                    <span className="mt-1 inline-flex rounded-full bg-primary-soft px-3 py-1 text-xs font-black text-primary">
                      {statusLabel(order.status)}
                    </span>
                    <p className="mt-1 text-xs font-bold text-muted">Payment: {statusLabel(order.paymentStatus)}</p>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-sm">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex justify-between gap-3 rounded-lg bg-surface-low p-2">
                      <span className="font-semibold">
                        {item.quantity}× {item.productName} {item.variantName ? `(${item.variantName})` : ""}
                      </span>
                      <span className="font-bold">{koboToNaira(item.totalKobo)}</span>
                    </div>
                  ))}
                </div>
                {delivery ? (
                  <p className="mt-3 flex items-center gap-2 text-sm text-muted">
                    <Truck className="h-4 w-4 text-primary" /> Delivery: {statusLabel(delivery.status)} ·{" "}
                    <Link href={`/tracking/${delivery.id}`} className="font-bold text-primary underline">
                      Track
                    </Link>
                  </p>
                ) : null}
                {order.returnRequests?.length ? (
                  <p className="mt-2 text-sm font-bold text-amber">Return: {statusLabel(order.returnRequests[0].status)}</p>
                ) : null}
                {unpaid ? <PayOrderPanel order={order} onPaid={() => void load()} /> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {canCancel ? (
                    <button onClick={() => void cancel(order)} className="min-h-10 rounded-lg border border-border-soft px-3 text-sm font-bold">
                      Cancel order
                    </button>
                  ) : null}
                  {canConfirm ? (
                    <button onClick={() => void confirmDelivery(order)} className="min-h-10 rounded-lg bg-primary px-3 text-sm font-bold text-white">
                      Confirm delivery
                    </button>
                  ) : null}
                  {canReturn ? (
                    <button onClick={() => void requestReturn(order)} className="min-h-10 rounded-lg border border-border-soft px-3 text-sm font-bold">
                      Request return
                    </button>
                  ) : null}
                  {["delivered", "completed"].includes(order.status)
                    ? order.items.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => setReviewFor({ orderId: order.id, productId: item.productId })}
                          className="min-h-10 rounded-lg border border-border-soft px-3 text-sm font-bold"
                        >
                          Review {item.productName}
                        </button>
                      ))
                    : null}
                </div>
                {reviewFor?.orderId === order.id ? (
                  <form onSubmit={submitReview} className="mt-3 grid gap-2 rounded-xl bg-surface-low p-3">
                    <label className="text-sm font-bold">
                      Rating
                      <select
                        value={review.rating}
                        onChange={(event) => setReview((current) => ({ ...current, rating: Number(event.target.value) }))}
                        className="ml-2 min-h-9 rounded-lg border border-border-soft px-2"
                      >
                        {[5, 4, 3, 2, 1].map((value) => (
                          <option key={value} value={value}>
                            {value} star{value > 1 ? "s" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <input
                      required
                      placeholder="Review title"
                      value={review.title}
                      onChange={(event) => setReview((current) => ({ ...current, title: event.target.value }))}
                      className="min-h-10 rounded-lg border border-border-soft px-3 text-sm"
                    />
                    <textarea
                      required
                      placeholder="What was your experience?"
                      value={review.body}
                      onChange={(event) => setReview((current) => ({ ...current, body: event.target.value }))}
                      className="min-h-20 rounded-lg border border-border-soft px-3 py-2 text-sm"
                    />
                    <div className="flex gap-2">
                      <button type="submit" className="min-h-10 rounded-lg bg-primary px-4 text-sm font-bold text-white">
                        Submit review
                      </button>
                      <button type="button" onClick={() => setReviewFor(null)} className="min-h-10 rounded-lg border border-border-soft px-4 text-sm font-bold">
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function NaijaPayPage() {
  const [wallet, setWallet] = useState<Record<string, unknown> | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "signed-out">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    apiClient
      .getWallet()
      .then((data) => {
        setWallet(data);
        setStatus("ready");
      })
      .catch((err) => {
        if (err instanceof ApiRequestError && err.status === 401) setStatus("signed-out");
        else {
          setError(err instanceof Error ? err.message : "Unable to load wallet.");
          setStatus("error");
        }
      });
  }, []);

  if (status === "loading") return <Loading />;
  if (status === "signed-out") {
    return (
      <div className="rounded-2xl border border-border-soft bg-canvas p-8 text-center">
        <Wallet className="mx-auto mb-3 h-8 w-8 text-primary" />
        <h1 className="font-display text-2xl font-extrabold">Sign in to view your NaijaPay wallet</h1>
        <Link href="/login" className="mt-4 inline-block rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white">
          Sign in
        </Link>
      </div>
    );
  }
  if (status === "error" || !wallet) return <ErrorBox message={error || "Wallet unavailable."} />;

  const transactions = (wallet.transactions as Array<Record<string, unknown>>) ?? [];
  const escrowHolds = (wallet.escrowHolds as Array<Record<string, unknown>>) ?? [];
  const openEscrowHolds = escrowHolds.filter((hold) => hold.status === "held" || hold.status === "disputed");
  // "Held in escrow" is the money protected on this customer's orders. It is not
  // always the wallet's heldKobo: card/bank payments are held by the platform,
  // not deducted from the NaijaPay wallet.
  const heldInEscrowKobo = openEscrowHolds.reduce(
    (total, hold) => total + Number(hold.amountKobo ?? 0),
    0
  );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-3xl font-extrabold">NaijaPay wallet</h1>
        <p className="text-sm text-muted">Balances are ledger-backed. Escrow holds are shown separately.</p>
      </header>
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-night p-5 text-white">
          <p className="text-xs font-bold uppercase tracking-wide text-white/60">Available</p>
          <p className="mt-1 font-display text-3xl font-extrabold">{koboToNaira(String(wallet.availableKobo ?? 0))}</p>
        </div>
        <div className="rounded-2xl border border-border-soft bg-canvas p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Held in escrow</p>
          <p className="mt-1 font-display text-3xl font-extrabold">{koboToNaira(String(heldInEscrowKobo))}</p>
        </div>
        <div className="rounded-2xl border border-border-soft bg-canvas p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Open escrow holds</p>
          <p className="mt-1 font-display text-3xl font-extrabold">{openEscrowHolds.length}</p>
        </div>
      </section>
      <section className="rounded-2xl border border-border-soft bg-canvas p-5">
        <h2 className="font-display text-xl font-extrabold">Escrow holds</h2>
        {escrowHolds.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No escrow holds yet.</p>
        ) : (
          <div className="mt-3 divide-y divide-border-soft">
            {escrowHolds.map((hold) => {
              const order = hold.order as { orderNumber?: string } | null;
              return (
                <div key={String(hold.id)} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                  <div>
                    <p className="font-bold">{order?.orderNumber ?? "Order"}</p>
                    <p className="text-xs text-muted">
                      {String(hold.status)} · {String(hold.reason)}
                    </p>
                  </div>
                  <p className="font-black">{koboToNaira(String(hold.amountKobo))}</p>
                </div>
              );
            })}
          </div>
        )}
      </section>
      <section className="rounded-2xl border border-border-soft bg-canvas p-5">
        <h2 className="font-display text-xl font-extrabold">Transactions</h2>
        {transactions.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No wallet transactions yet.</p>
        ) : (
          <div className="mt-3 divide-y divide-border-soft">
            {transactions.map((tx) => (
              <div key={String(tx.id)} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                <div>
                  <p className="font-bold">{String(tx.description)}</p>
                  <p className="text-xs text-muted">
                    {String(tx.type)} · {String(tx.reference)}
                  </p>
                </div>
                <p className="font-black">{koboToNaira(String(tx.amountKobo))}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function TrackingPageReal({ id }: { id: string }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "signed-out">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    apiClient
      .getTracking(id)
      .then((payload) => {
        setData(payload);
        setStatus("ready");
      })
      .catch((err) => {
        if (err instanceof ApiRequestError && err.status === 401) setStatus("signed-out");
        else {
          setError(err instanceof Error ? err.message : "Unable to load tracking.");
          setStatus("error");
        }
      });
  }, [id]);

  if (status === "loading") return <Loading />;
  if (status === "signed-out") {
    return (
      <div className="rounded-2xl border border-border-soft bg-canvas p-8 text-center">
        <Truck className="mx-auto mb-3 h-8 w-8 text-primary" />
        <h1 className="font-display text-2xl font-extrabold">Sign in to view tracking</h1>
        <Link href="/login" className="mt-4 inline-block rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white">
          Sign in
        </Link>
      </div>
    );
  }
  if (status === "error" || !data) return <ErrorBox message={error || "Tracking unavailable."} />;

  const events = (data.events as Array<Record<string, unknown>>) ?? [];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-3xl font-extrabold">Delivery tracking</h1>
        <p className="text-sm text-muted">
          Order {String(data.orderNumber)} · {statusLabel(String(data.status))}
        </p>
      </header>
      <section className="rounded-2xl border border-border-soft bg-canvas p-5">
        <div className="flex flex-wrap gap-6 text-sm">
          <p className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" /> Pickup: {String(data.pickupAddress)}
          </p>
          <p className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-primary" /> Drop-off: {String(data.dropoffAddress)}
          </p>
        </div>
        <ol className="mt-5 space-y-4">
          {events.map((event, index) => (
            <li key={String(event.id)} className="flex gap-3">
              <span className={`mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-black ${index === events.length - 1 ? "bg-primary text-white" : "bg-primary-soft text-primary"}`}>
                {index + 1}
              </span>
              <div>
                <p className="font-bold">{String(event.label)}</p>
                <p className="text-sm text-muted">{String(event.description)}</p>
                <p className="text-xs text-muted">{new Date(String(event.createdAt)).toLocaleString()}</p>
              </div>
            </li>
          ))}
        </ol>
        {events.length === 0 ? <p className="text-sm text-muted">No tracking events yet.</p> : null}
      </section>
    </div>
  );
}

export function AdminOpsPage() {
  return (
    <div className="rounded-2xl border border-border-soft bg-canvas p-8 text-center">
      <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-primary" />
      <h1 className="font-display text-2xl font-extrabold">Control Center</h1>
      <p className="mt-2 text-sm text-muted">Administration is separate from public shopping.</p>
      <Link href="/admin" className="mt-4 inline-block rounded-xl bg-night px-5 py-3 text-sm font-bold text-white">
        Open Control Center
      </Link>
    </div>
  );
}

const EATS_CATEGORY_IMAGES: Record<string, string> = {
  "All food": "/food/naijaeats/feast.jpg",
  "Nigerian meals": "/food/naijaeats/feast.jpg",
  "Fast food": "/food/naijaeats/fast-food.jpg",
  "Buka & local spots": "/food/naijaeats/buka.jpg",
  Breakfast: "/food/naijaeats/breakfast.jpg",
  Shawarma: "/food/naijaeats/shawarma.jpg",
  Drinks: "/food/naijaeats/drinks.jpg",
  Desserts: "/food/naijaeats/desserts.jpg",
  "Healthy eats": "/food/naijaeats/healthy.jpg",
  "Swallows & soups": "/food/naijaeats/eba-soup.jpg"
};

const EATS_CATEGORY_ICONS: Array<{ label: string; match: (cuisine: string) => boolean; icon: typeof UtensilsCrossed }> = [
  { label: "Nigerian meals", match: (cuisine) => /nigerian|home/i.test(cuisine), icon: UtensilsCrossed },
  { label: "Fast food", match: (cuisine) => /fast|burger|pizza/i.test(cuisine), icon: Sandwich },
  { label: "Buka & local spots", match: (cuisine) => /buka|local|home/i.test(cuisine), icon: Soup },
  { label: "Breakfast", match: (cuisine) => /breakfast|akara|pastry/i.test(cuisine), icon: Coffee },
  { label: "Shawarma", match: (cuisine) => /shawarma|wrap/i.test(cuisine), icon: Pizza },
  { label: "Drinks", match: (cuisine) => /drink|juice|bar/i.test(cuisine), icon: CakeSlice },
  { label: "Desserts", match: (cuisine) => /dessert|cake|pastry/i.test(cuisine), icon: CakeSlice },
  { label: "Healthy eats", match: (cuisine) => /salad|healthy|grill/i.test(cuisine), icon: Salad },
  { label: "Swallows & soups", match: (cuisine) => /soup|swallow|home/i.test(cuisine), icon: Soup }
];

export function NaijaEatsPage() {
  const [restaurants, setRestaurants] = useState<EatsRestaurantRow[]>([]);
  const [market, setMarket] = useState("all");
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"delivery" | "pickup">("delivery");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [cart, setCart] = useState<Record<string, { restaurantId: string; name: string; priceKobo: string; quantity: number }>>({});
  const [checkout, setCheckout] = useState({ contactName: "", contactPhone: "", deliveryAddress: "", notes: "" });
  const [paying, setPaying] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [payError, setPayError] = useState("");
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/eats/restaurants", { cache: "no-store" });
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) throw new Error(body?.error ?? `Request failed with HTTP ${res.status}`);
        setRestaurants(Array.isArray(body) ? (body as EatsRestaurantRow[]) : []);
        setStatus("ready");
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : "Could not load kitchens.");
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const markets = Array.from(new Set(restaurants.map((row) => row.market))).sort();
  const needle = query.trim().toLowerCase();
  const filtered = restaurants.filter((row) => {
    if (market !== "all" && row.market !== market) return false;
    if (category !== "all") {
      const definition = EATS_CATEGORY_ICONS.find((item) => item.label === category);
      if (definition && !definition.match(row.cuisine)) return false;
    }
    if (needle) {
      const haystack = [row.name, row.cuisine, row.market, ...row.menuItems.map((item) => item.name)]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

  const cartLines = Object.entries(cart);
  const cartCount = cartLines.reduce((total, [, line]) => total + line.quantity, 0);
  const cartTotal = cartLines.reduce((total, [, line]) => total + Number(line.priceKobo) * line.quantity, 0);

  function addItem(restaurant: EatsRestaurantRow, item: EatsMenuItemRow) {
    setPayError("");
    setCart((current) => {
      const existingRestaurant = Object.values(current)[0]?.restaurantId;
      const base = existingRestaurant && existingRestaurant !== restaurant.id ? {} : { ...current };
      const line = base[item.id];
      base[item.id] = {
        restaurantId: restaurant.id,
        name: item.name,
        priceKobo: item.priceKobo,
        quantity: Math.min((line?.quantity ?? 0) + 1, 10)
      };
      return base;
    });
  }

  function changeQuantity(id: string, delta: number) {
    setCart((current) => {
      const line = current[id];
      if (!line) return current;
      const quantity = line.quantity + delta;
      const next = { ...current };
      if (quantity <= 0) delete next[id];
      else next[id] = { ...line, quantity: Math.min(quantity, 10) };
      return next;
    });
  }

  async function pay() {
    const restaurantId = Object.values(cart)[0]?.restaurantId;
    if (!restaurantId || cartLines.length === 0) return;
    setPaying(true);
    setPayError("");
    try {
      const res = await fetch("/api/eats/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantId,
          items: cartLines.map(([menuItemId, line]) => ({ menuItemId, quantity: line.quantity })),
          deliveryAddress: checkout.deliveryAddress,
          contactName: checkout.contactName,
          contactPhone: checkout.contactPhone,
          notes: checkout.notes
        })
      });
      if (res.status === 401) {
        router.push("/login?next=/naijaeats");
        return;
      }
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `Payment failed with HTTP ${res.status}`);
      setCart({});
      router.push(`/naijaeats/orders/${body.id}`);
    } catch (caught) {
      setPayError(caught instanceof Error ? caught.message : "Could not place the order.");
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-3xl bg-[#0b1a13] text-white">
        <div className="flex flex-wrap items-center gap-3 rounded-t-3xl border-b border-white/10 bg-[#08200f] px-4 py-3">
          <span className="inline-flex items-center gap-2 font-display text-lg font-extrabold">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary-live text-[#04140f]">
              <UtensilsCrossed className="h-4 w-4" aria-hidden="true" />
            </span>
            NaijaEats
          </span>
          <p className="hidden text-[11px] font-semibold text-white/60 sm:block">Food delivery across Nigeria and Africa</p>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold">
              <MapPin className="h-3.5 w-3.5 text-primary-live" aria-hidden="true" />
              <span className="sr-only">Delivery area</span>
              <select
                value={market}
                onChange={(event) => setMarket(event.target.value)}
                className="max-w-40 bg-transparent text-xs font-bold text-white outline-none"
              >
                <option value="all" className="text-ink">All Lagos areas</option>
                {markets.map((item) => (
                  <option key={item} value={item} className="text-ink">{item}</option>
                ))}
              </select>
            </label>
            <Link href="/cart" className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white">
              Cart
            </Link>
            <Link href="/login?next=/naijaeats" className="rounded-full bg-primary-live px-3 py-1.5 text-xs font-extrabold text-[#04140f]">
              Sign in
            </Link>
          </div>
        </div>

        <div className="grid gap-0 lg:grid-cols-[1.02fr_0.98fr]">
          <div className="p-5 sm:p-7">
            <h1 className="font-display text-3xl font-extrabold leading-tight sm:text-4xl">
              Your favourite meals, <span className="text-primary-live">delivered fast</span>
            </h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-white/75">
              Order from verified kitchens, local bukas and popular eateries near you. Menus come straight from the
              kitchen; ordering opens when that kitchen is connected to dispatch.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setMode("delivery")}
                className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-xs font-extrabold ${mode === "delivery" ? "bg-primary-live text-[#04140f]" : "border border-white/20 text-white/80"}`}
              >
                <Bike className="h-4 w-4" aria-hidden="true" /> Delivery
              </button>
              <button
                type="button"
                onClick={() => setMode("pickup")}
                className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-xs font-extrabold ${mode === "pickup" ? "bg-primary-live text-[#04140f]" : "border border-white/20 text-white/80"}`}
              >
                <ShoppingBasket className="h-4 w-4" aria-hidden="true" /> Pickup
              </button>
              <span
                aria-disabled="true"
                title="Dine-in is not available in this build"
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-4 text-xs font-extrabold text-white/40"
              >
                <UtensilsCrossed className="h-4 w-4" aria-hidden="true" /> Dine in
              </span>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-2xl bg-white p-1.5 text-ink">
              <Search className="ml-2 h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search for restaurants, dishes or cuisines…"
                className="min-h-11 w-full min-w-0 bg-transparent px-1 text-sm font-semibold outline-none placeholder:text-muted/70"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-bold text-white/70">
              <span className="inline-flex items-center gap-1"><Bike className="h-3.5 w-3.5 text-primary-live" aria-hidden="true" /> Delivery</span>
              <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-primary-live" aria-hidden="true" /> Safe and reliable</span>
              <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5 text-primary-live" aria-hidden="true" /> Verified kitchens</span>
            </div>
          </div>
          <div className="relative min-h-[300px] lg:min-h-[430px]">
            <img
              src="/brand-photography/eats-jollof-delivery.jpg"
              alt="NaijaEats courier holding a green delivery bag beside jollof rice, grilled chicken and plantain"
              className="absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition: "50% 60%" }}
              fetchPriority="high"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0b1a13] via-[#0b1a13]/60 to-transparent" />
          </div>
        </div>
      </section>

      <section aria-label="Food categories" className="rounded-2xl border border-border-soft bg-canvas p-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setCategory("all")}
            className={`flex w-24 shrink-0 flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 text-center ${category === "all" ? "border-primary bg-primary-soft" : "border-border-soft"}`}
          >
            <img src="/food/naijaeats/feast.jpg" alt="" aria-hidden="true" className="h-14 w-14 rounded-full object-cover" style={{ objectPosition: "35% 45%" }} />
            <span className="text-[10px] font-bold leading-tight">All food</span>
          </button>
          {EATS_CATEGORY_ICONS.map((item) => {
            const Icon = item.icon;
            const active = category === item.label;
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => setCategory(active ? "all" : item.label)}
                className={`flex w-20 shrink-0 flex-col items-center gap-1 rounded-xl border px-2 py-2 text-center ${active ? "border-primary bg-primary-soft" : "border-border-soft"}`}
              >
                <img src={EATS_CATEGORY_IMAGES[item.label] ?? "/food/jollof.jpg"} alt="" aria-hidden="true" className="h-14 w-14 rounded-full object-cover" style={{ objectPosition: "68% 50%" }} />
                <span className="text-[10px] font-bold leading-tight">{item.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section aria-label="Popular restaurants" className="rounded-2xl border border-border-soft bg-canvas p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-xl font-extrabold">Popular restaurants near you</h2>
          <span className="text-xs font-bold text-muted">{filtered.length} kitchen{filtered.length === 1 ? "" : "s"}</span>
        </div>
        {status === "loading" ? <p className="mt-4 text-sm text-muted">Loading kitchens…</p> : null}
        {status === "error" ? <p role="alert" className="mt-4 text-sm font-bold text-crimson">{error}</p> : null}
        {status === "ready" && filtered.length === 0 ? (
          <p className="mt-4 rounded-xl border border-border-soft bg-surface-low p-4 text-sm text-muted">
            No kitchens match this search yet. Try another area or cuisine; restaurant partners appear here after
            verification.
          </p>
        ) : null}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {filtered.map((restaurant, index) => {
            const prices = restaurant.menuItems.map((item) => Number(item.priceKobo));
            const min = prices.length ? Math.min(...prices) : 0;
            const max = prices.length ? Math.max(...prices) : 0;
            return (
              <article key={restaurant.id} className="overflow-hidden rounded-2xl border border-border-soft bg-canvas">
                <div className="relative flex h-36 items-end p-3">
                  <img
                    src={/grill|suya/i.test(restaurant.cuisine) ? "/food/suya.jpg" : "/food/naijaeats/buka.jpg"}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full object-cover"
                    style={{ objectPosition: index % 2 === 0 ? "50% 50%" : "50% 45%" }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#04140f]/80 via-[#04140f]/20 to-transparent" />
                  {restaurant.isSample ? (
                    <span className="absolute right-2 top-2 rounded bg-amber-soft px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#B45309]">QA sample</span>
                  ) : null}
                  <span className="absolute left-3 top-3 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold text-white">{index + 1 < 10 ? "0" : ""}{index + 1}</span>
                </div>
                <div className="p-4">
                  <h3 className="font-display text-base font-extrabold">{restaurant.name}</h3>
                  <p className="mt-0.5 text-xs font-semibold text-muted">{restaurant.cuisine} · {restaurant.market}</p>
                  <p className="mt-2 text-[11px] text-muted">{restaurant.menuItems.length} menu item{restaurant.menuItems.length === 1 ? "" : "s"} · {min === max ? koboToNaira(min) : `${koboToNaira(min)} – ${koboToNaira(max)}`}</p>
                  <ul className="mt-2 space-y-1">
                    {(expanded[restaurant.id] ? restaurant.menuItems : restaurant.menuItems.slice(0, 2)).map((item) => (
                      <li key={item.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate font-semibold">{item.name}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="font-bold text-primary">{koboToNaira(item.priceKobo)}</span>
                          <button
                            type="button"
                            onClick={() => addItem(restaurant, item)}
                            aria-label={`Add ${item.name} to order`}
                            className="grid h-7 w-7 place-items-center rounded-full bg-primary text-white"
                          >
                            +
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                  {restaurant.menuItems.length > 2 ? (
                    <button
                      type="button"
                      onClick={() => setExpanded({ ...expanded, [restaurant.id]: !expanded[restaurant.id] })}
                      className="mt-2 text-xs font-bold text-primary underline"
                    >
                      {expanded[restaurant.id] ? "Show less" : `Browse menu (${restaurant.menuItems.length})`}
                    </button>
                  ) : (
                    <button type="button" onClick={() => setExpanded({ ...expanded, [restaurant.id]: true })} className="mt-2 text-xs font-bold text-primary underline">Browse menu</button>
                  )}
                  <p className="mt-2 rounded-lg bg-surface-low px-2 py-1.5 text-[10px] font-semibold text-muted">
                    Pay from NaijaPay; the kitchen accepts and prepares your order next.
                  </p>
                </div>
              </article>
            );
          })}
          <article className="flex flex-col justify-between rounded-2xl bg-[#0b6b3a] p-5 text-white">
            <div>
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/15">
                <UtensilsCrossed className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-3 font-display text-xl font-extrabold">Run a kitchen?</h3>
              <p className="mt-1 text-xs leading-relaxed text-white/90">
                Publish your menu, take orders and get paid through NaijaDeals. Verification comes first; dispatch
                switches on per kitchen.
              </p>
            </div>
            <Link href="/sell" className="mt-4 inline-flex min-h-10 w-fit items-center gap-2 rounded-xl bg-white px-4 text-xs font-extrabold text-[#0b1a13]">
              Apply as a restaurant partner
            </Link>
          </article>
        </div>
      </section>

      {cartCount > 0 ? (
        <section aria-label="Your order" className="rounded-2xl border border-primary/30 bg-canvas p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-extrabold">Your order</h2>
            <span className="text-xs font-bold text-muted">{cartCount} item{cartCount === 1 ? "" : "s"} · {koboToNaira(cartTotal)}</span>
          </div>
          <ul className="mt-3 divide-y divide-border-soft">
            {cartLines.map(([id, line]) => (
              <li key={id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{line.name}</span>
                  <span className="text-xs text-muted">{koboToNaira(line.priceKobo)} each</span>
                </span>
                <span className="flex items-center gap-2">
                  <button type="button" onClick={() => changeQuantity(id, -1)} aria-label={`Remove one ${line.name}`} className="grid h-8 w-8 place-items-center rounded-full border border-border-soft">−</button>
                  <span className="w-6 text-center text-sm font-bold">{line.quantity}</span>
                  <button type="button" onClick={() => changeQuantity(id, 1)} aria-label={`Add one ${line.name}`} className="grid h-8 w-8 place-items-center rounded-full border border-border-soft">+</button>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-bold uppercase tracking-wide text-muted">Name
              <input value={checkout.contactName} onChange={(event) => setCheckout({ ...checkout, contactName: event.target.value })} className="mt-1 block min-h-10 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm font-semibold text-ink" />
            </label>
            <label className="text-xs font-bold uppercase tracking-wide text-muted">Phone
              <input value={checkout.contactPhone} onChange={(event) => setCheckout({ ...checkout, contactPhone: event.target.value })} className="mt-1 block min-h-10 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm font-semibold text-ink" />
            </label>
            <label className="text-xs font-bold uppercase tracking-wide text-muted sm:col-span-2">Delivery address
              <input value={checkout.deliveryAddress} onChange={(event) => setCheckout({ ...checkout, deliveryAddress: event.target.value })} className="mt-1 block min-h-10 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm font-semibold text-ink" />
            </label>
            <label className="text-xs font-bold uppercase tracking-wide text-muted sm:col-span-2">Notes for the kitchen (optional)
              <input value={checkout.notes} onChange={(event) => setCheckout({ ...checkout, notes: event.target.value })} className="mt-1 block min-h-10 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm font-semibold text-ink" />
            </label>
          </div>

          {payError ? <p role="alert" className="mt-3 rounded-lg border border-crimson/30 bg-crimson-soft p-2 text-xs font-bold text-[#991B1B]">{payError}</p> : null}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-muted">Paid from your NaijaPay balance. No delivery fee is charged in this build.</p>
            <button
              type="button"
              onClick={() => void pay()}
              disabled={paying || !checkout.contactName || !checkout.contactPhone || !checkout.deliveryAddress}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-extrabold text-white disabled:opacity-50"
            >
              {paying ? "Paying…" : `Pay ${koboToNaira(cartTotal)} with NaijaPay`}
            </button>
          </div>
        </section>
      ) : null}

      <p className="text-center text-[10px] text-muted">
        Food photography from Wikimedia Commons contributors (CC0 / CC BY / CC BY-SA).{" "}
        <a href="/credits" className="font-bold text-primary underline">Photo credits</a>
      </p>
    </div>
  );
}

interface EatsMenuItemRow {
  id: string;
  name: string;
  description: string | null;
  priceKobo: string;
  available: boolean;
}

interface EatsRestaurantRow {
  id: string;
  slug: string;
  name: string;
  cuisine: string;
  market: string;
  address: string;
  phone: string;
  isSample: boolean;
  menuItems: EatsMenuItemRow[];
}

export function NaijaFreshPage() {
  return (
    <ModuleLanding
      name="NaijaFresh"
      icon={ShoppingBasket}
      headline="Fresh groceries from Lagos markets, once vendors are connected"
      description="NaijaFresh is the grocery vertical of your NaijaDeals account. Market vendors, catalogue and delivery slots are not connected yet, so ordering stays disabled — no invented produce, prices or delivery times."
      chips={["Same NaijaDeals account", "Vendor-verified produce", "Honest setup state"]}
      image={{
        src: "/brand-photography/fresh-market-groceries.jpg",
        alt: "Brand illustration of a Lagos market vendor filling a NaijaFresh bag with tomatoes, okra, greens and plantain"
      }}
      features={[
        { icon: Store, title: "Verified vendors", body: "Market sellers pass onboarding before their produce is listed." },
        { icon: ShieldCheck, title: "Escrow-protected", body: "Produce is paid through the same held-funds flow as NaijaShop." },
        { icon: ShoppingBasket, title: "Honest availability", body: "No stock, price or delivery slot is invented while the vertical is unconfigured." }
      ]}
      status={{
        title: "Setup status",
        body: "Grocery ordering is not configured in this environment. There are no market-vendor integrations, grocery catalogues or delivery slots connected, so ordering is disabled rather than simulated."
      }}
      primaryCta={{ label: "Become a vendor", href: "/sell" }}
      secondaryCta={{ label: "Browse NaijaShop", href: "/naijashop" }}
      partner={{
        title: "Earn with NaijaFresh",
        body: "Market vendors keep their own catalogue and payout account; produce goes live only after onboarding and a connected payout method.",
        links: [
          { label: "Become a vendor", href: "/sell" },
          { label: "How setup works", href: "/help" }
        ]
      }}
    />
  );
}
function NaijaSendLanding() {
  return (
    <ModuleLanding
      name="NaijaSend"
      icon={Truck}
      headline="Send parcels across town, tracked at every step"
      description="Marketplace delivery runs on the NaijaSend manual courier workflow: pickup, transit and delivery events are recorded by the assigned courier, and escrow releases on confirmed delivery."
      chips={["Recorded events", "Escrow-protected", "Lagos coverage"]}
      image={{
        src: "/brand-photography/send-airport-logistics.jpg",
        alt: "Brand illustration of a green NaijaSend truck at the Murtala Muhammed airport cargo hub"
      }}
      features={[
        { icon: PackageCheck, title: "Recorded events", body: "Pickup, transit and delivery are server records — no simulated courier movement." },
        { icon: ShieldCheck, title: "Escrow release", body: "Funds stay held until the buyer or admin confirms delivery." },
        { icon: MapPin, title: "Lagos coverage", body: "City-wide courier assignment. External carrier credentials are not configured." }
      ]}
      status={{
        title: "Setup status",
        body: "The manual courier workflow is live for marketplace orders. External carrier integrations are not configured, so no third-party pickup promise is made and no parcel is marked delivered without a recorded event."
      }}
      primaryCta={{ label: "Track an order", href: "/orders" }}
      secondaryCta={{ label: "Browse NaijaShop", href: "/naijashop" }}
    />
  );
}

export function NaijaSendPage() {
  return (
    <div className="space-y-5">
      <NaijaSendLanding />
      <FreightQuoteForm />
    </div>
  );
}

const FREIGHT_SERVICES = [
  { id: "bus", label: "Bus cargo", hint: "Terminal-to-terminal luggage bay" },
  { id: "air", label: "Air freight", hint: "Airport-to-airport cargo" },
  { id: "truck", label: "Truck / haulage", hint: "Long-haul truckload or shared space" },
  { id: "last_mile", label: "Last-mile pickup", hint: "Courier collects from your address" }
];

const FREIGHT_STATUS: Record<string, string> = {
  quote_requested: "Quote requested",
  quoted: "Quoted",
  carrier_assigned: "Carrier assigned",
  in_transit: "In transit",
  delivered: "Delivered",
  cancelled: "Cancelled"
};

interface FreightEventRow {
  status: string;
  note: string | null;
  createdAt: string;
}

interface FreightRow {
  id: string;
  reference: string;
  serviceType: string;
  originCity: string;
  destinationCity: string;
  commodity: string;
  weightKg: number;
  carrierName: string | null;
  quoteKobo: string | number | null;
  status: string;
  createdAt: string;
  events?: FreightEventRow[];
}

function FreightQuoteForm() {
  const [requests, setRequests] = useState<FreightRow[]>([]);
  const [signedOut, setSignedOut] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<string>("");
  const [form, setForm] = useState({
    serviceType: "bus",
    originCity: "Lagos",
    destinationCity: "",
    commodity: "",
    weightKg: "20",
    dimensions: "",
    pickupRequired: false,
    notes: ""
  });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/send/freight", { cache: "no-store" });
      if (res.status === 401) {
        setSignedOut(true);
        return;
      }
      const body = await res.json().catch(() => null);
      if (res.ok && Array.isArray(body)) setRequests(body as FreightRow[]);
    } catch {
      // The form still works; history is a convenience.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setCreated("");
    try {
      const res = await fetch("/api/send/freight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, weightKg: Number(form.weightKg) })
      });
      const body = await res.json().catch(() => null);
      if (res.status === 401) {
        setSignedOut(true);
        throw new Error("Sign in to request a freight quote.");
      }
      if (!res.ok) throw new Error(body?.error ?? `Request failed with HTTP ${res.status}`);
      setCreated(body.reference);
      setForm((current) => ({ ...current, commodity: "", destinationCity: "", dimensions: "", notes: "" }));
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not submit the quote request.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section id="freight-quote" className="rounded-3xl border border-border-soft bg-canvas p-5 sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-primary">Freight quote</p>
          <h2 className="mt-1 font-display text-2xl font-extrabold">Quote, book and track cargo</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Tell us the route and the load. An operator reviews every request before a carrier is assigned — no
            automatic price or pickup promise is made.
          </p>
        </div>
        <Link href="/orders" className="text-sm font-bold text-primary underline">
          Track an order
        </Link>
      </div>

      {signedOut ? (
        <div className="mt-4 rounded-xl border border-primary/20 bg-primary-soft p-4 text-sm">
          <p className="font-bold text-primary">Sign in to request a freight quote</p>
          <Link href="/login?next=/naijasend" className="mt-2 inline-flex min-h-10 items-center rounded-lg bg-primary px-4 text-xs font-bold text-white">
            Sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-5 grid gap-4 lg:grid-cols-2">
          <fieldset className="lg:col-span-2">
            <legend className="text-xs font-black uppercase tracking-wide text-muted">Service</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {FREIGHT_SERVICES.map((service) => (
                <label
                  key={service.id}
                  className={`cursor-pointer rounded-xl border p-3 ${form.serviceType === service.id ? "border-primary bg-primary-soft" : "border-border-soft bg-surface-low"}`}
                >
                  <input
                    type="radio"
                    name="freight-service"
                    value={service.id}
                    checked={form.serviceType === service.id}
                    onChange={() => setForm({ ...form, serviceType: service.id })}
                    className="sr-only"
                  />
                  <span className="block text-sm font-extrabold">{service.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted">{service.hint}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="text-xs font-bold uppercase tracking-wide text-muted">
            Origin city
            <input required value={form.originCity} onChange={(e) => setForm({ ...form, originCity: e.target.value })} className="mt-1 block min-h-11 w-full rounded-xl border border-border-soft bg-surface-low px-3 text-sm font-semibold text-ink" />
          </label>
          <label className="text-xs font-bold uppercase tracking-wide text-muted">
            Destination city
            <input required value={form.destinationCity} onChange={(e) => setForm({ ...form, destinationCity: e.target.value })} className="mt-1 block min-h-11 w-full rounded-xl border border-border-soft bg-surface-low px-3 text-sm font-semibold text-ink" />
          </label>
          <label className="text-xs font-bold uppercase tracking-wide text-muted">
            Commodity
            <input required value={form.commodity} onChange={(e) => setForm({ ...form, commodity: e.target.value })} placeholder="e.g. dried pepper sacks" className="mt-1 block min-h-11 w-full rounded-xl border border-border-soft bg-surface-low px-3 text-sm font-semibold text-ink" />
          </label>
          <label className="text-xs font-bold uppercase tracking-wide text-muted">
            Weight (kg)
            <input required type="number" min={1} max={40000} value={form.weightKg} onChange={(e) => setForm({ ...form, weightKg: e.target.value })} className="mt-1 block min-h-11 w-full rounded-xl border border-border-soft bg-surface-low px-3 text-sm font-semibold text-ink" />
          </label>
          <label className="text-xs font-bold uppercase tracking-wide text-muted">
            Dimensions (optional)
            <input value={form.dimensions} onChange={(e) => setForm({ ...form, dimensions: e.target.value })} placeholder="e.g. 120 × 80 × 90 cm" className="mt-1 block min-h-11 w-full rounded-xl border border-border-soft bg-surface-low px-3 text-sm font-semibold text-ink" />
          </label>
          <label className="flex items-center gap-2 self-end text-sm font-semibold">
            <input type="checkbox" checked={form.pickupRequired} onChange={(e) => setForm({ ...form, pickupRequired: e.target.checked })} className="h-4 w-4 accent-[#00A651]" />
            Pick up from my address
          </label>
          <label className="text-xs font-bold uppercase tracking-wide text-muted lg:col-span-2">
            Notes (optional)
            <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1 block w-full rounded-xl border border-border-soft bg-surface-low px-3 py-2 text-sm font-semibold text-ink" />
          </label>

          {error ? <p role="alert" className="lg:col-span-2 rounded-xl border border-crimson/30 bg-crimson-soft p-3 text-sm font-bold text-crimson">{error}</p> : null}
          {created ? (
            <p role="status" className="lg:col-span-2 rounded-xl border border-primary/20 bg-primary-soft p-3 text-sm font-bold text-primary">
              Quote request {created} received. An operator will review the route and assign a carrier.
            </p>
          ) : null}

          <div className="lg:col-span-2">
            <button type="submit" disabled={saving} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-extrabold text-white disabled:opacity-60">
              {saving ? "Submitting…" : "Request freight quote"}
              <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            </button>
          </div>
        </form>
      )}

      {requests.length > 0 ? (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-y border-border-soft text-[11px] uppercase tracking-wide text-muted">
                <th className="px-3 py-2 font-bold">Reference</th>
                <th className="px-3 py-2 font-bold">Route</th>
                <th className="px-3 py-2 font-bold">Service</th>
                <th className="px-3 py-2 font-bold">Weight</th>
                <th className="px-3 py-2 font-bold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {requests.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 font-bold">{row.reference}</td>
                  <td className="px-3 py-2 text-xs">{row.originCity} → {row.destinationCity}</td>
                  <td className="px-3 py-2 text-xs">{row.serviceType}</td>
                  <td className="px-3 py-2 text-xs">{row.weightKg} kg</td>
                  <td className="px-3 py-2 text-xs">
                    {FREIGHT_STATUS[row.status] ?? row.status}
                    {row.carrierName ? <span className="block text-[10px] text-muted">{row.carrierName}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {requests.some((row) => (row.events?.length ?? 0) > 0) ? (
        <div className="mt-6 space-y-3">
          <h3 className="text-sm font-extrabold">Shipment milestones</h3>
          {requests
            .filter((row) => (row.events?.length ?? 0) > 0)
            .map((row) => (
              <div key={row.id} className="rounded-xl border border-border-soft bg-surface-low p-3">
                <p className="text-xs font-extrabold">
                  {row.reference} · {row.originCity} → {row.destinationCity}
                </p>
                <ol className="mt-2 space-y-1 text-[11px] text-muted">
                  {(row.events ?? []).map((event, index) => (
                    <li key={index}>
                      <span className="font-bold text-ink">{FREIGHT_STATUS[event.status] ?? event.status}</span>
                      {event.note ? ` · ${event.note}` : ""}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
        </div>
      ) : null}
    </section>
  );
}

