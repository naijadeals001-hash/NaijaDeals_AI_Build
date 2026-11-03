"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  ShieldCheck,
  ShoppingCart,
  Star,
  Store,
  Truck,
  Wallet
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
        <span className="absolute left-3 top-3 z-10 rounded bg-amber-soft px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-strong">
          Sample
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
          {product.variants && product.variants.length > 0 ? (
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
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [addingId, setAddingId] = useState("");
  const PAGE_SIZE = 12;

  useEffect(() => {
    let active = true;
    Promise.all([apiClient.getProducts(), apiClient.getCategories()])
      .then(([items, cats]) => {
        if (!active) return;
        setProducts(items);
        setCategories(cats);
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
      return true;
    });

    const sorted = [...list];
    if (sort === "price-asc") sorted.sort((a, b) => Number(a.priceKobo) - Number(b.priceKobo));
    if (sort === "price-desc") sorted.sort((a, b) => Number(b.priceKobo) - Number(a.priceKobo));
    if (sort === "rating") sorted.sort((a, b) => (b.rating?.average ?? 0) - (a.rating?.average ?? 0) || (b.rating?.count ?? 0) - (a.rating?.count ?? 0));
    return sorted;
  }, [catalogue, category, priceBand, minRating, inStockOnly, sort, priceBands]);

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

  const hasFilters = category !== "all" || priceBand !== "all" || minRating > 0 || inStockOnly;

  return (
    <div className="space-y-0">
      <MarketplaceBar categories={categories} />

      <nav aria-label="Shop departments" className="mt-3 flex gap-1.5 overflow-x-auto pb-2">
        <button
          type="button"
          onClick={() => { setCategory("all"); resetPage(); }}
          aria-pressed={category === "all"}
          className={chipClass(category === "all")}
        >
          All departments
        </button>
        {categories.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => { setCategory(item.slug); resetPage(); }}
            aria-pressed={category === item.slug}
            className={chipClass(category === item.slug)}
          >
            {item.name}
          </button>
        ))}
      </nav>

      <section className="mt-2 overflow-hidden rounded-lg border border-border-soft bg-canvas">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">NaijaShop marketplace</p>
            <h1 className="mt-1 font-display text-2xl font-extrabold sm:text-3xl">Shop verified Nigerian sellers</h1>
            <p className="mt-1 text-sm text-muted">
              Escrow-protected checkout, tracked delivery and server-verified payments — {catalogue.length} listings from {vendors} sellers.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center text-[11px] font-bold text-muted sm:w-auto">
            <div className="rounded-lg bg-surface-low px-3 py-2">
              <ShieldCheck className="mx-auto mb-1 h-4 w-4 text-primary" aria-hidden="true" />
              Escrow
            </div>
            <div className="rounded-lg bg-surface-low px-3 py-2">
              <Truck className="mx-auto mb-1 h-4 w-4 text-primary" aria-hidden="true" />
              Tracked
            </div>
            <div className="rounded-lg bg-surface-low px-3 py-2">
              <PackageCheck className="mx-auto mb-1 h-4 w-4 text-primary" aria-hidden="true" />
              Returns
            </div>
          </div>
        </div>
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

      {showSamples ? (
        <div role="status" className="mt-4 rounded-lg border border-amber-strong/40 bg-amber/10 px-4 py-3 text-sm text-ink">
          <strong>Sample catalogue.</strong> These are demonstration rows seeded for local development, not real seller listings.
          Real listings appear when verified sellers publish products from their dashboard.
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

      <div className="mt-4 grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className={showFilters ? "block" : "hidden lg:block"}>
        <ShopFilters
          categories={categories}
          categoryCounts={categoryCounts}
          category={category}
          onCategory={(value) => { setCategory(value); resetPage(); }}
          priceBands={priceBands}
          priceBand={priceBand}
          onPriceBand={(value) => { setPriceBand(value); resetPage(); }}
          minRating={minRating}
          onMinRating={(value) => { setMinRating(value); resetPage(); }}
          inStockOnly={inStockOnly}
          onInStockOnly={(value) => { setInStockOnly(value); resetPage(); }}
          hasFilters={hasFilters}
          onClear={() => { setCategory("all"); setPriceBand("all"); setMinRating(0); setInStockOnly(false); resetPage(); }}
        />
        </div>

        <section aria-label="Products">
          <div className="flex flex-col gap-2 rounded-lg border border-border-soft bg-surface-low px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-bold text-ink">
              {status === "ready" ? (
                filtered.length > 0 ? (
                  <>
                    Showing <span className="text-primary">{filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}–{Math.min(filtered.length, currentPage * PAGE_SIZE)}</span> of {filtered.length} results
                  </>
                ) : (
                  "No results"
                )
              ) : (
                "Loading products…"
              )}
            </p>
            <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowFilters((value) => !value)}
              aria-expanded={showFilters}
              className="min-h-9 rounded-lg border border-border-soft bg-canvas px-3 text-xs font-bold text-ink lg:hidden"
            >
              Filters
            </button>
            <label className="flex items-center gap-2 text-xs font-bold text-muted">
              Sort by:
              <select
                value={sort}
                onChange={(event) => { setSort(event.target.value); resetPage(); }}
                className="min-h-9 rounded-lg border border-border-soft bg-canvas px-2 text-sm font-semibold text-ink focus:border-primary focus:outline-none"
              >
                <option value="featured">Featured</option>
                <option value="price-asc">Price: low to high</option>
                <option value="price-desc">Price: high to low</option>
                <option value="rating">Average customer review</option>
              </select>
            </label>
            </div>
          </div>

          {status === "loading" ? <div className="mt-4"><Loading /></div> : null}
          {status === "error" ? <div className="mt-4"><ErrorBox message={error} /></div> : null}
          {status === "ready" && filtered.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-border-soft bg-canvas p-10 text-center">
              <PackageCheck className="mx-auto mb-3 h-8 w-8 text-primary" aria-hidden="true" />
              <p className="font-bold">No listings match these filters.</p>
              <p className="mt-1 text-sm text-muted">Try clearing a filter or browsing all departments.</p>
              {hasFilters ? (
                <button
                  type="button"
                  onClick={() => { setCategory("all"); setPriceBand("all"); setMinRating(0); setInStockOnly(false); resetPage(); }}
                  className="mt-4 min-h-10 rounded-lg border border-border-soft px-4 text-sm font-bold text-primary"
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          ) : null}
          {status === "ready" && visible.length > 0 ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {visible.map((product) => (
                <div key={product.id} className={addingId === product.id ? "pointer-events-none opacity-60" : ""}>
                  <ShopResultCard product={product} onAdd={add} />
                </div>
              ))}
            </div>
          ) : null}

          {pageCount > 1 ? (
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={currentPage === 1}
                className="min-h-10 rounded-lg border border-border-soft px-4 text-sm font-bold disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm font-bold text-muted" aria-live="polite">
                Page {currentPage} of {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                disabled={currentPage === pageCount}
                className="min-h-10 rounded-lg border border-border-soft px-4 text-sm font-bold disabled:opacity-40"
              >
                Next
              </button>
            </div>
          ) : null}
        </section>
      </div>
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
    <div className="rounded-lg bg-[#0b1a13] px-3 py-2.5 text-white sm:px-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-4">
        <Link href="/" className="flex items-center gap-2 rounded px-2 py-1 text-sm font-extrabold">
          <span className="grid h-7 w-7 place-items-center rounded bg-primary-live text-[11px] font-black text-[#04140f]">ND</span>
          NaijaDeals
        </Link>

        <div className="hidden items-start gap-1.5 px-2 text-xs leading-tight text-white/80 sm:flex">
          <MapPin className="mt-0.5 h-4 w-4 text-primary-live" aria-hidden="true" />
          <span>
            Deliver to <span className="font-extrabold text-white">Lagos, Nigeria</span>
          </span>
        </div>

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
            className={`h-3.5 w-3.5 ${value >= star - 0.25 ? "fill-[#f3b33d] text-[#f3b33d]" : "fill-transparent text-[#c9a227]"}`}
          />
        ))}
      </span>
      <span className="font-bold text-[#007185]">{count > 0 ? count.toLocaleString() : "0"}</span>
    </span>
  );
}

function ShopResultCard({ product, onAdd }: { product: ApiProduct; onAdd: (product: ApiProduct) => void }) {
  const available = product.available ?? 0;
  const discount = product.compareAtKobo && Number(product.compareAtKobo) > Number(product.priceKobo)
    ? Math.round((1 - Number(product.priceKobo) / Number(product.compareAtKobo)) * 100)
    : 0;

  return (
    <article className="flex h-full flex-col rounded-lg border border-border-soft bg-canvas p-3 transition hover:shadow-soft">
      {product.isSample ? (
        <span className="mb-1 inline-flex w-fit items-center rounded bg-amber-soft px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-strong">
          Sample
        </span>
      ) : null}
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
          <span className="rounded bg-[#cc0c39] px-1.5 py-0.5 text-[10px] font-black text-white">-{discount}%</span>
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
        {product.variants && product.variants.length > 0 ? (
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
      {status === "ready" ? (
        <>
          <p className="text-sm font-bold text-muted">{products.length} result(s)</p>
          {products.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border-soft bg-canvas p-8 text-center">
              <p className="font-bold">No products matched your filters.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
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
        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
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

export function NaijaEatsPage() {
  return (
    <div className="rounded-2xl border border-border-soft bg-canvas p-8">
      <h1 className="font-display text-2xl font-extrabold">NaijaEats</h1>
      <p className="mt-2 text-sm text-muted">
        Food ordering is not configured in this environment. There are no restaurant credentials, menus or dispatch
        partners connected, so ordering is disabled rather than simulated.
      </p>
    </div>
  );
}

export function NaijaSendPage() {
  return (
    <div className="rounded-2xl border border-border-soft bg-canvas p-8">
      <h1 className="font-display text-2xl font-extrabold">NaijaSend</h1>
      <p className="mt-2 text-sm text-muted">
        Marketplace delivery is handled by the NaijaSend manual courier workflow with recorded pickup, transit and
        delivery events. Third-party courier credentials are not configured.
      </p>
    </div>
  );
}
