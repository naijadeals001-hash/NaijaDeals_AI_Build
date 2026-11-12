"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { apiClient, type ApiCategory, type ApiProduct } from "@/lib/api-client";
import {
  BROWSE_PAGE_SIZE,
  BROWSE_SORTS,
  browseApiParams,
  browseHref,
  readBrowseFilters,
  type BrowseFilters,
  type BrowseSort
} from "./browse-query";
import { ShopProductCard, type ShopProduct } from "./product-card";
import { announceShopCartCount } from "./shop-header";

const SORT_LABELS: Record<BrowseSort, string> = {
  featured: "Featured",
  newest: "Newest arrivals",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
  name: "Name"
};

function prettifySlug(slug: string) {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/**
 * Category browse / deals / search-result grid.
 *
 * Every filter and sort is applied by the catalogue API against real product
 * fields. The address bar mirrors the applied state, so a search survives
 * pagination, department navigation, refresh and sharing. Empty, typo and
 * error states are explicit; no product, rating or discount is invented.
 */
export function CategoryBrowse({
  categorySlug,
  mode = "category",
  initialQuery = ""
}: {
  categorySlug?: string;
  mode?: "category" | "deals" | "all";
  initialQuery?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const defaultSort: BrowseSort = mode === "deals" ? "price-asc" : "featured";

  const [filters, setFilters] = useState<BrowseFilters>(() =>
    readBrowseFilters(new URLSearchParams(searchKey), { fallbackQuery: initialQuery, defaultSort })
  );
  const [queryDraft, setQueryDraft] = useState(filters.q);
  const [maxPriceDraft, setMaxPriceDraft] = useState(filters.maxPrice);

  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [pageInfo, setPageInfo] = useState({ total: 0, totalPages: 1 });
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState("");
  const [addingId, setAddingId] = useState("");

  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [categoriesStatus, setCategoriesStatus] = useState<"loading" | "ready" | "error">("loading");

  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const syncedSearchKey = useRef(searchKey);

  const syncUrl = useCallback(
    (next: BrowseFilters) => {
      if (typeof window === "undefined") return;
      const href = browseHref(pathname, next);
      window.history.replaceState(window.history.state, "", href);
    },
    [pathname]
  );

  const applyFilters = useCallback(
    (next: BrowseFilters) => {
      setFilters(next);
      syncUrl(next);
    },
    [syncUrl]
  );

  // External navigation (a Link carrying q/sort/maxPrice) rehydrates the grid.
  useEffect(() => {
    if (syncedSearchKey.current === searchKey) return;
    syncedSearchKey.current = searchKey;
    const next = readBrowseFilters(new URLSearchParams(searchKey), { fallbackQuery: initialQuery, defaultSort });
    setFilters(next);
    setQueryDraft(next.q);
    setMaxPriceDraft(next.maxPrice);
  }, [searchKey, initialQuery, defaultSort]);

  useEffect(() => {
    let active = true;
    apiClient
      .getCategories()
      .then((items) => {
        if (!active) return;
        setCategories(items);
        setCategoriesStatus("ready");
      })
      .catch(() => active && setCategoriesStatus("error"));
    return () => {
      active = false;
    };
  }, []);

  // Typing searches after a short pause; Enter applies immediately.
  useEffect(() => {
    const trimmed = queryDraft.trim().slice(0, 120);
    if (trimmed === filtersRef.current.q) return;
    const timeout = window.setTimeout(() => {
      const next = { ...filtersRef.current, q: trimmed, page: 1 };
      setFilters(next);
      syncUrl(next);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [queryDraft, syncUrl]);

  useEffect(() => {
    if (maxPriceDraft === filtersRef.current.maxPrice) return;
    const timeout = window.setTimeout(() => {
      const next = { ...filtersRef.current, maxPrice: maxPriceDraft, page: 1 };
      setFilters(next);
      syncUrl(next);
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [maxPriceDraft, syncUrl]);

  const { q, sort, maxPrice, page } = filters;

  useEffect(() => {
    let active = true;
    setStatus("loading");
    setError("");
    apiClient
      .getProductPage(
        browseApiParams({ q, sort, maxPrice, page }, mode === "category" ? categorySlug : undefined)
      )
      .then((data) => {
        if (!active) return;
        setProducts(data.items);
        setPageInfo({ total: data.total, totalPages: data.totalPages });
        setStatus("ready");
      })
      .catch((err) => {
        if (!active) return;
        setProducts([]);
        setError(err instanceof Error ? err.message : "Products could not be loaded.");
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [q, sort, maxPrice, page, categorySlug, mode, attempt]);

  const knownCategory = categories.find((item) => item.slug === categorySlug);
  const departmentMissing =
    mode === "category" && Boolean(categorySlug) && categoriesStatus === "ready" && !knownCategory;

  const heading =
    mode === "deals"
      ? "Today's deals"
      : mode === "all"
        ? q
          ? `Results for “${q}”`
          : "All products"
        : knownCategory?.name ?? (categorySlug ? prettifySlug(categorySlug) : "Category");

  const rangeStart = pageInfo.total === 0 ? 0 : Math.min((page - 1) * BROWSE_PAGE_SIZE + 1, pageInfo.total);
  const rangeEnd = Math.min(page * BROWSE_PAGE_SIZE, pageInfo.total);

  async function add(product: ShopProduct) {
    setAddingId(product.id);
    setNotice("");
    try {
      const cart = await apiClient.addCartItem(product.id, 1);
      // Keep the shared header badge at the server's authoritative total.
      announceShopCartCount(cart.items.filter((item) => !item.savedForLater).reduce((sum, item) => sum + item.quantity, 0));
      setNotice(`${product.name} added to cart.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not add to cart.";
      setNotice(/sign in|unauthor|401/i.test(message) ? "Sign in to add items to your cart." : message);
    } finally {
      setAddingId("");
    }
  }

  function clearFilters() {
    const cleared: BrowseFilters = { q: "", sort: defaultSort, maxPrice: "", page: 1 };
    setQueryDraft("");
    setMaxPriceDraft("");
    applyFilters(cleared);
  }

  function goToPage(nextPage: number) {
    const bounded = Math.min(Math.max(nextPage, 1), Math.max(pageInfo.totalPages, 1));
    applyFilters({ ...filtersRef.current, page: bounded });
    document.getElementById("browse-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function updateSort(value: BrowseSort) {
    applyFilters({ ...filtersRef.current, sort: value, page: 1 });
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    applyFilters({ ...filtersRef.current, q: queryDraft.trim().slice(0, 120), page: 1 });
  }

  return (
    <div className="bg-white px-3 py-4 text-[#0f1111] sm:px-5">
      <nav aria-label="Breadcrumb" className="text-[11.5px] text-[#565959]">
        <Link href="/naijashop" className="hover:text-[#c45500]">NaijaShop</Link>
        <span aria-hidden> › </span>
        <span>{heading}</span>
      </nav>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
        <h1 className="font-display text-[22px] font-extrabold">{heading}</h1>
        <p aria-live="polite" className="text-[12px] text-[#565959]">
          {status === "loading" && products.length === 0
            ? "Loading products…"
            : `${rangeStart}–${rangeEnd} of ${pageInfo.total} products`}
        </p>
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="space-y-4 rounded-lg p-3 ring-1 ring-[#e3e6e6]">
          <form onSubmit={submitSearch}>
            <label htmlFor="browse-q" className="text-[11px] font-bold uppercase tracking-wide text-[#565959]">Search</label>
            <div className="mt-1 flex items-stretch gap-1">
              <input
                id="browse-q"
                value={queryDraft}
                onChange={(event) => setQueryDraft(event.target.value.slice(0, 120))}
                type="search"
                maxLength={120}
                placeholder="Search in results"
                className="min-w-0 flex-1 rounded border border-[#d5d9d9] px-2 py-1.5 text-[12.5px] outline-none focus:border-[#007185]"
              />
              <button
                type="submit"
                aria-label="Apply search"
                className="shrink-0 rounded border border-[#d5d9d9] bg-[#f3f4f6] px-2 text-[12px] font-semibold hover:bg-[#e7e9e9]"
              >
                Go
              </button>
            </div>
          </form>
          <div>
            <label htmlFor="browse-price" className="text-[11px] font-bold uppercase tracking-wide text-[#565959]">Max price (₦)</label>
            <input
              id="browse-price"
              value={maxPriceDraft}
              onChange={(event) => setMaxPriceDraft(event.target.value.replace(/[^0-9]/g, "").slice(0, 12))}
              inputMode="numeric"
              maxLength={12}
              placeholder="Any"
              className="mt-1 w-full rounded border border-[#d5d9d9] px-2 py-1.5 text-[12.5px] outline-none focus:border-[#007185]"
            />
            <p className="mt-1 text-[10.5px] text-[#565959]">Whole Naira, e.g. 50000.</p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#565959]">Department</p>
            <ul className="mt-1 space-y-0.5">
              <li>
                <Link
                  href={browseHref("/naijashop/categories", filters, { page: 1 })}
                  className={`block rounded px-1.5 py-1 text-[12.5px] hover:text-[#c45500] ${mode === "all" ? "font-bold" : ""}`}
                >
                  All departments
                </Link>
              </li>
              {categories.map((category) => (
                <li key={category.id}>
                  <Link
                    href={browseHref(`/naijashop/c/${category.slug}`, filters, { page: 1 })}
                    aria-current={category.slug === categorySlug ? "page" : undefined}
                    className={`block rounded px-1.5 py-1 text-[12.5px] hover:text-[#c45500] ${
                      category.slug === categorySlug ? "font-bold" : ""
                    }`}
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
            {categoriesStatus === "error" ? (
              <p className="mt-1 text-[11px] text-[#8a1c14]">Departments could not be loaded.</p>
            ) : null}
          </div>
        </aside>

        <div id="browse-results">
          <div className="mb-2 flex items-center justify-end gap-2 text-[12px]">
            <label htmlFor="browse-sort" className="font-semibold text-[#565959]">Sort by</label>
            <select
              id="browse-sort"
              value={sort}
              onChange={(event) => updateSort(event.target.value as BrowseSort)}
              className="rounded border border-[#d5d9d9] bg-[#f3f4f6] px-2 py-1.5 text-[12px] font-semibold"
            >
              {BROWSE_SORTS.map((value) => (
                <option key={value} value={value}>
                  {SORT_LABELS[value]}
                </option>
              ))}
            </select>
          </div>

          {notice ? (
            <p role="status" className="mb-2 rounded bg-[#e7f6ec] px-3 py-2 text-[12px] font-semibold text-[#0b5c2e]">
              {notice}{" "}
              <Link href="/cart" className="underline">View cart</Link>
            </p>
          ) : null}

          {status === "loading" && products.length > 0 ? (
            <p role="status" className="mb-2 text-[11.5px] text-[#565959]">Updating results…</p>
          ) : null}
          {status === "loading" && products.length === 0 ? (
            <p role="status" className="py-10 text-center text-[12.5px] text-[#565959]">Loading products…</p>
          ) : null}
          {status === "error" ? (
            <div role="alert" className="rounded border border-[#f5c2c0] bg-[#fdf2f2] p-3 text-[12.5px] text-[#8a1c14]">
              <p>{error || "Products could not be loaded. Try again shortly."}</p>
              <button
                type="button"
                onClick={() => {
                  setAttempt((value) => value + 1);
                }}
                className="mt-2 rounded border border-[#8a1c14] px-3 py-1 font-semibold"
              >
                Try again
              </button>
            </div>
          ) : null}

          {status === "ready" && products.length === 0 ? (
            <div className="rounded border border-dashed border-[#d5d9d9] p-8 text-center text-[12.5px] text-[#565959]">
              {departmentMissing ? (
                <>
                  <p className="font-bold text-[#0f1111]">We couldn’t find that department.</p>
                  <p className="mt-1">It may have been renamed or removed.</p>
                  <Link href="/naijashop/categories" className="mt-2 inline-block font-semibold text-[#007185] hover:underline">
                    Browse all departments
                  </Link>
                </>
              ) : page > 1 && pageInfo.total > 0 ? (
                <>
                  <p className="font-bold text-[#0f1111]">No products on this page.</p>
                  <button type="button" onClick={() => goToPage(page - 1)} className="mt-2 font-semibold text-[#007185] hover:underline">
                    Go to the previous page
                  </button>
                </>
              ) : (
                <>
                  <p className="font-bold text-[#0f1111]">
                    {q ? `No products match “${q}”` : "No products match these filters yet."}
                  </p>
                  {maxPrice ? <p className="mt-1">The maximum price is ₦{Number(maxPrice).toLocaleString("en-NG")}.</p> : null}
                  <button type="button" onClick={clearFilters} className="mt-2 font-semibold text-[#007185] hover:underline">
                    Clear filters
                  </button>
                </>
              )}
            </div>
          ) : null}

          <ul aria-busy={status === "loading"} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((product) => (
              <li key={product.id}>
                <ShopProductCard product={product} onAdd={add} adding={addingId === product.id} />
              </li>
            ))}
          </ul>

          {pageInfo.totalPages > 1 ? (
            <nav aria-label="Search results pagination" className="mt-4 flex items-center justify-center gap-3 text-[12.5px]">
              <button
                type="button"
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
                className="rounded border border-[#d5d9d9] px-3 py-1.5 font-semibold disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <span className="font-semibold text-[#565959]">
                Page {page} of {pageInfo.totalPages}
              </span>
              <button
                type="button"
                onClick={() => goToPage(page + 1)}
                disabled={page >= pageInfo.totalPages}
                className="rounded border border-[#d5d9d9] px-3 py-1.5 font-semibold disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </nav>
          ) : null}
        </div>
      </div>
    </div>
  );
}
