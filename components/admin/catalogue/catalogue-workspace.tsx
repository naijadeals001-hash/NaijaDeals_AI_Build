"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Department = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  isActive: boolean;
  isDemo: boolean;
};

type Product = {
  id: string;
  name: string;
  slug: string;
  description: string;
  priceKobo: string;
  status: string;
  isDemo: boolean;
  categoryId: string;
  category: Department | null;
  images: Array<{ url: string; alt: string | null }>;
  stock: { quantity: number } | null;
};

type Catalogue = { departments: Department[]; products: Product[]; demoVendor: { name: string } | null };

const emptyDepartment = { id: "", name: "", description: "", imageUrl: "", isDemo: true, isActive: true };
const emptyProduct = {
  id: "",
  name: "",
  description: "",
  price: "",
  categoryId: "",
  imageUrl: "",
  imageAlt: "",
  isDemo: true
};

export function CatalogueWorkspace({ canWrite, canRead }: { canWrite: boolean; canRead: boolean }) {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [department, setDepartment] = useState({ ...emptyDepartment });
  const [product, setProduct] = useState({ ...emptyProduct });

  const load = useCallback(async () => {
    setError("");
    const response = await fetch("/api/admin/catalogue", { cache: "no-store" });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? `Catalogue could not be loaded (HTTP ${response.status}).`);
      return;
    }
    const data = (await response.json()) as Catalogue;
    setCatalogue(data);
    if (!product.categoryId && data.departments[0]) {
      setProduct((current) => ({ ...current, categoryId: data.departments[0].id }));
    }
  }, [product.categoryId]);

  useEffect(() => {
    if (canRead) void load();
  }, [canRead, load]);

  const departments = catalogue?.departments ?? [];
  const products = catalogue?.products ?? [];

  async function send(url: string, method: "POST" | "PATCH", body: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(`${data.error ?? "Request failed."}${data.code ? ` (${data.code})` : ""}`);
        return false;
      }
      setMessage(`Server confirmed: ${method} ${url} returned ${response.status}.`);
      await load();
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Request failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveDepartment() {
    const saved = department.id
      ? await send("/api/admin/catalogue/departments", "PATCH", {
          id: department.id,
          name: department.name,
          description: department.description,
          imageUrl: department.imageUrl,
          isDemo: department.isDemo,
          isActive: department.isActive
        })
      : await send("/api/admin/catalogue/departments", "POST", {
          name: department.name,
          description: department.description,
          imageUrl: department.imageUrl,
          isDemo: department.isDemo
        });
    if (saved) setDepartment({ ...emptyDepartment });
  }

  async function saveProduct() {
    const priceKobo = Math.round(Number(product.price.replace(/[^0-9.]/g, "")) * 100);
    const body = {
      id: product.id || undefined,
      name: product.name,
      description: product.description,
      priceKobo,
      categoryId: product.categoryId,
      imageUrl: product.imageUrl,
      imageAlt: product.imageAlt,
      isDemo: product.isDemo
    };
    const saved = product.id
      ? await send("/api/admin/catalogue/products", "PATCH", body)
      : await send("/api/admin/catalogue/products", "POST", body);
    if (saved) setProduct({ ...emptyProduct, categoryId: departments[0]?.id ?? "" });
  }

  async function moderate(id: string, action: "publish" | "unpublish") {
    await send("/api/admin/catalogue/products", "PATCH", { id, action });
  }

  const activeCount = useMemo(() => products.filter((entry) => entry.status === "ACTIVE").length, [products]);

  if (!canRead) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-[#21262D] bg-[#0B0E14] p-6 text-[#F0F6FC]">
        <h1 className="text-xl font-extrabold">Catalogue access restricted</h1>
        <p className="mt-2 text-sm text-[#8B949E]">Your role does not include `products:read`.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 text-[#F0F6FC]">
      <header>
        <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#00E676]">NaijaDeals Shop</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold sm:text-3xl">Catalogue workflow</h1>
        <p className="mt-2 max-w-3xl text-sm text-[#8B949E]">
          Create or edit a department, attach approved imagery, validate and preview a product, then publish or unpublish it.
          Every action is permission-checked server-side and written to the audit log.
        </p>
        <p className="mt-2 text-xs font-bold text-[#F2D48C]">
          DEMO records are demonstration inventory. They must never be presented as real seller verification or live supply.
        </p>
      </header>

      {error ? <div role="alert" className="rounded-xl border border-[#F85149]/50 bg-[#F85149]/10 p-3 text-sm text-[#FFB4AE]">{error}</div> : null}
      {message ? <div role="status" className="rounded-xl border border-[#00E676]/40 bg-[#00E676]/10 p-3 text-sm text-[#B7FFD4]">{message}</div> : null}
      {!canWrite ? <div className="rounded-xl border border-[#F2D48C]/40 bg-[#F2D48C]/10 p-3 text-sm text-[#F2D48C]">Read-only: your role lacks `products:moderate`. Editing controls are disabled.</div> : null}

      <section className="rounded-2xl border border-[#21262D] bg-[#0B0E14] p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-extrabold">1. Department</h2>
          <span className="text-xs text-[#8B949E]">{departments.length} departments</span>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-xs font-bold">
            Name
            <input value={department.name} disabled={!canWrite} onChange={(event) => setDepartment({ ...department, name: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-[#30363D] bg-[#161B22] px-3 text-sm" />
          </label>
          <label className="text-xs font-bold">
            Image (project path or https URL)
            <input value={department.imageUrl} disabled={!canWrite} onChange={(event) => setDepartment({ ...department, imageUrl: event.target.value })} placeholder="/generated/shop/category-home-kitchen.webp" className="mt-1 min-h-10 w-full rounded-lg border border-[#30363D] bg-[#161B22] px-3 text-sm" />
          </label>
          <label className="text-xs font-bold md:col-span-2">
            Description
            <textarea value={department.description} disabled={!canWrite} onChange={(event) => setDepartment({ ...department, description: event.target.value })} rows={2} className="mt-1 w-full rounded-lg border border-[#30363D] bg-[#161B22] px-3 py-2 text-sm" />
          </label>
          <label className="flex items-center gap-2 text-xs font-bold">
            <input type="checkbox" checked={department.isDemo} disabled={!canWrite} onChange={(event) => setDepartment({ ...department, isDemo: event.target.checked })} />
            Demonstration department
          </label>
          {department.id ? (
            <label className="flex items-center gap-2 text-xs font-bold">
              <input type="checkbox" checked={department.isActive} disabled={!canWrite} onChange={(event) => setDepartment({ ...department, isActive: event.target.checked })} />
              Active
            </label>
          ) : null}
        </div>
        {department.imageUrl ? (
          <div className="mt-3 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={department.imageUrl} alt="Department image preview" className="h-16 w-24 rounded-lg object-cover" />
            <span className="text-xs text-[#8B949E]">Preview must render before publishing products in this department.</span>
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={!canWrite || busy} onClick={() => void saveDepartment()} className="min-h-10 rounded-lg bg-[#00E676] px-4 text-sm font-extrabold text-[#04140B] disabled:opacity-50">
            {department.id ? "Save department" : "Create department"}
          </button>
          {department.id ? (
            <button type="button" onClick={() => setDepartment({ ...emptyDepartment })} className="min-h-10 rounded-lg border border-[#30363D] px-4 text-sm font-bold">
              Cancel edit
            </button>
          ) : null}
        </div>
        <ul className="mt-4 divide-y divide-[#21262D]">
          {departments.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className="font-bold">{entry.name} <span className="ml-1 text-xs text-[#8B949E]">{entry.isActive ? "active" : "inactive"}{entry.isDemo ? " · DEMO" : ""}</span></span>
              <span className="flex gap-2">
                <a href={`/naijashop/c/${entry.slug}`} target="_blank" rel="noreferrer" className="text-xs font-bold text-[#58A6FF] underline">View</a>
                <button type="button" disabled={!canWrite} onClick={() => setDepartment({ id: entry.id, name: entry.name, description: entry.description ?? "", imageUrl: entry.imageUrl ?? "", isDemo: entry.isDemo, isActive: entry.isActive })} className="text-xs font-bold text-[#F2D48C] underline disabled:opacity-50">Edit</button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-[#21262D] bg-[#0B0E14] p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-extrabold">2. Product</h2>
          <span className="text-xs text-[#8B949E]">{products.length} listings · {activeCount} published</span>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-xs font-bold">
            Name
            <input value={product.name} disabled={!canWrite} onChange={(event) => setProduct({ ...product, name: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-[#30363D] bg-[#161B22] px-3 text-sm" />
          </label>
          <label className="text-xs font-bold">
            Price (NGN)
            <input value={product.price} disabled={!canWrite} inputMode="decimal" onChange={(event) => setProduct({ ...product, price: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-[#30363D] bg-[#161B22] px-3 text-sm" />
          </label>
          <label className="text-xs font-bold">
            Department
            <select value={product.categoryId} disabled={!canWrite} onChange={(event) => setProduct({ ...product, categoryId: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-[#30363D] bg-[#161B22] px-3 text-sm">
              <option value="">Choose a department</option>
              {departments.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold">
            Image (project path or https URL)
            <input value={product.imageUrl} disabled={!canWrite} onChange={(event) => setProduct({ ...product, imageUrl: event.target.value })} placeholder="/generated/shop/product-…webp" className="mt-1 min-h-10 w-full rounded-lg border border-[#30363D] bg-[#161B22] px-3 text-sm" />
          </label>
          <label className="text-xs font-bold">
            Accessible image text
            <input value={product.imageAlt} disabled={!canWrite} onChange={(event) => setProduct({ ...product, imageAlt: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-[#30363D] bg-[#161B22] px-3 text-sm" />
          </label>
          <label className="text-xs font-bold md:col-span-2">
            Description
            <textarea value={product.description} disabled={!canWrite} onChange={(event) => setProduct({ ...product, description: event.target.value })} rows={2} className="mt-1 w-full rounded-lg border border-[#30363D] bg-[#161B22] px-3 py-2 text-sm" />
          </label>
          <label className="flex items-center gap-2 text-xs font-bold">
            <input type="checkbox" checked={product.isDemo} disabled={!canWrite} onChange={(event) => setProduct({ ...product, isDemo: event.target.checked })} />
            Demonstration listing
          </label>
        </div>
        {product.imageUrl ? (
          <div className="mt-3 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={product.imageUrl} alt="Product image preview" className="h-16 w-16 rounded-lg object-cover" />
            <span className="text-xs text-[#8B949E]">Preview only. Publishing requires the image to exist and have alt text.</span>
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={!canWrite || busy} onClick={() => void saveProduct()} className="min-h-10 rounded-lg bg-[#00E676] px-4 text-sm font-extrabold text-[#04140B] disabled:opacity-50">
            {product.id ? "Save product" : "Create draft"}
          </button>
          {product.id ? (
            <button type="button" onClick={() => setProduct({ ...emptyProduct, categoryId: departments[0]?.id ?? "" })} className="min-h-10 rounded-lg border border-[#30363D] px-4 text-sm font-bold">
              Cancel edit
            </button>
          ) : null}
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-[10px] uppercase tracking-wide text-[#8B949E]">
              <tr><th className="py-2">Product</th><th>Department</th><th>Status</th><th>Price</th><th className="text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-[#21262D]">
              {products.map((entry) => (
                <tr key={entry.id}>
                  <td className="py-2 pr-3">
                    <span className="font-bold">{entry.name}</span>
                    <span className="ml-2 text-xs text-[#8B949E]">{entry.isDemo ? "DEMO" : "live"}</span>
                  </td>
                  <td className="pr-3 text-[#8B949E]">{entry.category?.name ?? "—"}</td>
                  <td className="pr-3">
                    <span className={entry.status === "ACTIVE" ? "text-[#00E676]" : entry.status === "DRAFT" ? "text-[#F2D48C]" : "text-[#FFB4AE]"}>{entry.status}</span>
                  </td>
                  <td className="pr-3 font-bold">₦{(Number(entry.priceKobo) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}</td>
                  <td className="py-2 text-right">
                    <div className="flex flex-wrap justify-end gap-2 text-xs font-bold">
                      <a href={`/product/${entry.slug}`} target="_blank" rel="noreferrer" className="text-[#58A6FF] underline">Preview</a>
                      <button type="button" disabled={!canWrite || busy} onClick={() => setProduct({
                        id: entry.id,
                        name: entry.name,
                        description: entry.description,
                        price: String(Number(entry.priceKobo) / 100),
                        categoryId: entry.categoryId,
                        imageUrl: entry.images[0]?.url ?? "",
                        imageAlt: entry.images[0]?.alt ?? "",
                        isDemo: entry.isDemo
                      })} className="text-[#F2D48C] underline disabled:opacity-50">Edit</button>
                      {entry.status === "ACTIVE" ? (
                        <button type="button" disabled={!canWrite || busy} onClick={() => void moderate(entry.id, "unpublish")} className="text-[#FFB4AE] underline disabled:opacity-50">Unpublish</button>
                      ) : (
                        <button type="button" disabled={!canWrite || busy} onClick={() => void moderate(entry.id, "publish")} className="text-[#00E676] underline disabled:opacity-50">Publish</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
