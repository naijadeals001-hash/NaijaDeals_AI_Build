"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiClient, type ApiCategory, type ApiProduct } from "@/lib/api-client";
import { ShopProductCard, type ShopProduct } from "./product-card";

type SortKey = "featured" | "price-asc" | "price-desc" | "name";

/**
 * Category browse / deals / search-result grid. Sorting and filtering run on
 * real catalogue fields only; counts come from the loaded products.
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
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [sort, setSort] = useState<SortKey>("featured");
  const [query, setQuery] = useState(initialQuery);
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [notice, setNotice] = useState("");
  const [addingId, setAddingId] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([apiClient.getProducts(), apiClient.getCategories()])
      .then(([items, cats]) => {
        if (!active) return;
        setProducts(items);
        setCategories(cats);
        setStatus("ready");
      })
      .catch(() => active && setStatus("error"));
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const cap = maxPrice ? Number(maxPrice) * 100 : null;
    const list = products.filter((product) => {
      if (mode === "category" && categorySlug && product.category?.slug !== categorySlug) return false;
      if (cap && Number(product.priceKobo) > cap) return false;
      if (query && !`${product.name} ${product.brand ?? ""} ${product.category?.name ?? ""}`.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
    if (mode === "deals") list.sort((a, b) => Number(a.priceKobo) - Number(b.priceKobo));
    if (sort === "price-asc") list.sort((a, b) => Number(a.priceKobo) - Number(b.priceKobo));
    if (sort === "price-desc") list.sort((a, b) => Number(b.priceKobo) - Number(a.priceKobo));
    if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [products, categorySlug, mode, query, sort, maxPrice]);

  const heading =
    mode === "deals" ? "Today's deals" : mode === "all" ? "All products" : categories.find((item) => item.slug === categorySlug)?.name ?? "Category";

  async function add(product: ShopProduct) {
    setAddingId(product.id);
    try {
      await apiClient.addCartItem(product.id, 1);
      setNotice(`${product.name} added to cart.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not add to cart.";
      setNotice(/sign in|unauthor|401/i.test(message) ? "Sign in to add items to your cart." : message);
    } finally {
      setAddingId("");
    }
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
        <p className="text-[12px] text-[#565959]">{filtered.length} of {products.length} products</p>
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="space-y-4 rounded-lg p-3 ring-1 ring-[#e3e6e6]">
          <div>
            <label htmlFor="browse-q" className="text-[11px] font-bold uppercase tracking-wide text-[#565959]">Search</label>
            <input
              id="browse-q"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              type="search"
              placeholder="Search in results"
              className="mt-1 w-full rounded border border-[#d5d9d9] px-2 py-1.5 text-[12.5px] outline-none focus:border-[#007185]"
            />
          </div>
          <div>
            <label htmlFor="browse-price" className="text-[11px] font-bold uppercase tracking-wide text-[#565959]">Max price (₦)</label>
            <input
              id="browse-price"
              value={maxPrice}
              onChange={(event) => setMaxPrice(event.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              placeholder="Any"
              className="mt-1 w-full rounded border border-[#d5d9d9] px-2 py-1.5 text-[12.5px] outline-none focus:border-[#007185]"
            />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#565959]">Department</p>
            <ul className="mt-1 space-y-0.5">
              <li>
                <Link href="/naijashop/categories" className={`block rounded px-1.5 py-1 text-[12.5px] hover:text-[#c45500] ${mode === "all" ? "font-bold" : ""}`}>All departments</Link>
              </li>
              {categories.map((category) => (
                <li key={category.id}>
                  <Link
                    href={`/naijashop/c/${category.slug}`}
                    className={`block rounded px-1.5 py-1 text-[12.5px] hover:text-[#c45500] ${category.slug === categorySlug ? "font-bold" : ""}`}
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <div>
          <div className="mb-2 flex items-center justify-end gap-2 text-[12px]">
            <label htmlFor="browse-sort" className="font-semibold text-[#565959]">Sort by</label>
            <select
              id="browse-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              className="rounded border border-[#d5d9d9] bg-[#f3f4f6] px-2 py-1.5 text-[12px] font-semibold"
            >
              <option value="featured">Featured</option>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
              <option value="name">Name</option>
            </select>
          </div>
          {notice ? <p role="status" className="mb-2 rounded bg-[#e7f6ec] px-3 py-2 text-[12px] font-semibold text-[#0b5c2e]">{notice}</p> : null}
          {status === "loading" ? <p className="py-10 text-center text-[12.5px] text-[#565959]">Loading products…</p> : null}
          {status === "error" ? <p role="alert" className="rounded border border-[#f5c2c0] bg-[#fdf2f2] p-3 text-[12.5px] text-[#8a1c14]">Products could not be loaded. Try again shortly.</p> : null}
          {status === "ready" && filtered.length === 0 ? (
            <p className="rounded border border-dashed border-[#d5d9d9] p-8 text-center text-[12.5px] text-[#565959]">
              No products match these filters yet.
            </p>
          ) : null}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((product) => (
              <li key={product.id}>
                <ShopProductCard product={product} onAdd={add} adding={addingId === product.id} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
