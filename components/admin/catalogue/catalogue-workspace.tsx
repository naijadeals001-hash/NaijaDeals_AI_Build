"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { COUNTRIES } from "@/lib/config/commerce";

type Department = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  isDemo: boolean;
  _count?: { products: number };
};

type Product = {
  id: string;
  name: string;
  slug: string;
  description: string;
  priceKobo: string;
  countryCode: string;
  currency: string | null;
  status: string;
  isDemo: boolean;
  categoryId: string;
  category: Department | null;
  images: Array<{ id?: string; url: string; alt: string | null }>;
  stock: { quantity: number; reserved: number; lowStockLevel: number } | null;
  vendor?: { name: string; status: string } | null;
};

type Catalogue = { departments: Department[]; products: Product[]; demoVendor: { name: string } | null };
type ImageDraft = { url: string; alt: string };
type ValidationState = {
  name: string;
  valid: boolean;
  issues: Array<{ field: string; message: string }>;
  product?: {
    status: string;
    priceKobo: string;
    currency: string | null;
    quantity: number | null;
    reserved: number | null;
    available: number;
    slug: string;
  };
};

const enabledCountries = Object.values(COUNTRIES).filter((country) => country.enabled);

const emptyDepartment = {
  id: "",
  name: "",
  slug: "",
  description: "",
  imageUrl: "",
  sortOrder: "",
  isDemo: true,
  isActive: true
};

const emptyProduct = {
  id: "",
  name: "",
  slug: "",
  description: "",
  price: "",
  currency: "NGN",
  countryCode: "NG",
  categoryId: "",
  quantity: "0",
  lowStockLevel: "3",
  images: [{ url: "", alt: "" }] as ImageDraft[],
  isDemo: true
};

function formatMoney(priceKobo: string | number | bigint, currency: string | null) {
  const minor = Number(priceKobo);
  if (!Number.isFinite(minor)) return `${currency ?? "—"} —`;
  const major = minor / 100;
  const amount = major.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!currency) return amount;
  return currency === "NGN" ? `₦${amount} NGN` : `${currency} ${amount}`;
}

function availableStock(stock: Product["stock"]) {
  return stock ? Math.max(stock.quantity - stock.reserved, 0) : 0;
}

export function CatalogueWorkspace({ canWrite, canRead }: { canWrite: boolean; canRead: boolean }) {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [department, setDepartment] = useState({ ...emptyDepartment });
  const [product, setProduct] = useState({ ...emptyProduct });
  const [preview, setPreview] = useState<Product | null>(null);
  const [validation, setValidation] = useState<ValidationState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/catalogue", { cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error ?? `Catalogue could not be loaded (HTTP ${response.status}).`);
        return;
      }
      const data = (await response.json()) as Catalogue;
      setCatalogue(data);
      setProduct((current) =>
        current.categoryId || !data.departments[0] ? current : { ...current, categoryId: data.departments[0].id }
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Catalogue could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canRead) void load();
    else setLoading(false);
  }, [canRead, load]);

  const departments = catalogue?.departments ?? [];
  const products = catalogue?.products ?? [];

  async function send(
    url: string,
    method: "POST" | "PATCH",
    body: Record<string, unknown>,
    successMessage: string,
    issueName = product.name
  ) {
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
        const issues = Array.isArray(data?.details?.issues) ? data.details.issues : [];
        setError(`${data.error ?? "Request failed."}${data.code ? ` (${data.code})` : ""}`);
        if (issues.length) {
          setValidation({ name: issueName, valid: false, issues });
        }
        return null;
      }
      setMessage(successMessage);
      await load();
      return data as Record<string, unknown>;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Request failed.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveDepartment() {
    if (!department.name.trim() || !department.description.trim()) {
      setError("Department name and description are required.");
      return;
    }
    const saved = department.id
      ? await send(
          "/api/admin/catalogue/departments",
          "PATCH",
          {
            id: department.id,
            name: department.name,
            slug: department.slug.trim() || undefined,
            description: department.description,
            imageUrl: department.imageUrl,
            sortOrder: department.sortOrder === "" ? undefined : Number(department.sortOrder),
            isDemo: department.isDemo,
            isActive: department.isActive
          },
          "Department saved. Its ordering and visibility are now live in the shared navigation."
        )
      : await send(
          "/api/admin/catalogue/departments",
          "POST",
          {
            name: department.name,
            slug: department.slug.trim() || undefined,
            description: department.description,
            imageUrl: department.imageUrl,
            sortOrder: department.sortOrder === "" ? undefined : Number(department.sortOrder),
            isDemo: department.isDemo
          },
          "Department created. Attach imagery and a product next."
        );
    if (saved) setDepartment({ ...emptyDepartment });
  }

  async function saveProduct() {
    if (!product.name.trim() || !product.description.trim() || !product.categoryId || !product.price.trim()) {
      setError("Product name, description, price and department are required.");
      return;
    }
    const major = Number(product.price.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(major) || major <= 0) {
      setError("Price must be a positive amount.");
      return;
    }
    if (product.quantity === "" || !Number.isInteger(Number(product.quantity)) || Number(product.quantity) < 0) {
      setError("Inventory quantity must be a non-negative whole number.");
      return;
    }
    if (product.lowStockLevel !== "" && (!Number.isInteger(Number(product.lowStockLevel)) || Number(product.lowStockLevel) < 0)) {
      setError("Low stock level must be a non-negative whole number.");
      return;
    }
    const images = product.images
      .map((image) => ({ url: image.url.trim(), alt: image.alt.trim() }))
      .filter((image) => image.url);
    const body = {
      id: product.id || undefined,
      name: product.name,
      slug: product.slug.trim() || undefined,
      description: product.description,
      priceKobo: Math.round(major * 100),
      currency: product.currency,
      countryCode: product.countryCode,
      categoryId: product.categoryId,
      quantity: Number(product.quantity),
      lowStockLevel: Number(product.lowStockLevel || 3),
      images,
      isDemo: product.isDemo
    };
    const saved = product.id
      ? await send("/api/admin/catalogue/products", "PATCH", body, "Product saved. Validate it before publishing.")
      : await send("/api/admin/catalogue/products", "POST", body, "Draft created. Validate and preview it before publishing.");
    if (saved) {
      setValidation(null);
      setPreview(null);
      setProduct({ ...emptyProduct, categoryId: departments[0]?.id ?? "" });
    }
  }

  async function moderate(entry: Product, action: "publish" | "unpublish" | "archive" | "validate") {
    if (action === "validate") {
      setBusy(true);
      setError("");
      setMessage("");
      try {
        const response = await fetch("/api/admin/catalogue/products", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: entry.id, action })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setError(data.error ?? `Validation failed (HTTP ${response.status}).`);
          return;
        }
        setValidation(data as ValidationState);
        setPreview(entry);
        setMessage(data.valid ? "Validation passed. Preview the listing, then publish." : "Validation found blocking issues.");
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "Validation failed.");
      } finally {
        setBusy(false);
      }
      return;
    }
    const labels = {
      publish: "Product published. It is now publicly visible.",
      unpublish: "Product unpublished. It has been removed from public access.",
      archive: "Product archived. It remains readable in historical orders but is not public."
    } as const;
    await send("/api/admin/catalogue/products", "PATCH", { id: entry.id, action }, labels[action], entry.name);
  }

  const activeCount = useMemo(() => products.filter((entry) => entry.status === "ACTIVE").length, [products]);
  const draftCount = useMemo(() => products.filter((entry) => entry.status === "DRAFT").length, [products]);
  const archivedCount = useMemo(() => products.filter((entry) => entry.status === "ARCHIVED").length, [products]);

  function editDepartment(entry: Department) {
    setDepartment({
      id: entry.id,
      name: entry.name,
      slug: entry.slug,
      description: entry.description ?? "",
      imageUrl: entry.imageUrl ?? "",
      sortOrder: String(entry.sortOrder),
      isDemo: entry.isDemo,
      isActive: entry.isActive
    });
    setError("");
    setMessage("");
  }

  function editProduct(entry: Product) {
    setProduct({
      id: entry.id,
      name: entry.name,
      slug: entry.slug,
      description: entry.description,
      price: String(Number(entry.priceKobo) / 100),
      currency: entry.currency ?? COUNTRIES[entry.countryCode]?.currency ?? "NGN",
      countryCode: entry.countryCode,
      categoryId: entry.categoryId,
      quantity: String(entry.stock?.quantity ?? 0),
      lowStockLevel: String(entry.stock?.lowStockLevel ?? 3),
      images:
        entry.images.length > 0
          ? entry.images.map((image) => ({ url: image.url, alt: image.alt ?? "" }))
          : [{ url: "", alt: "" }],
      isDemo: entry.isDemo
    });
    setValidation(null);
    setError("");
    setMessage("");
  }

  function updateImage(index: number, patch: Partial<ImageDraft>) {
    setProduct((current) => ({
      ...current,
      images: current.images.map((image, position) => (position === index ? { ...image, ...patch } : image))
    }));
  }

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
          Create or edit a department, attach approved imagery, set explicit currency and inventory, validate and
          preview a product, then publish or unpublish it. Every action is permission-checked and region-scoped
          server-side and written to the audit log.
        </p>
        <p className="mt-2 text-xs font-bold text-[#F2D48C]">
          DEMO records are demonstration inventory. They must never be presented as real seller verification or live
          supply.
        </p>
      </header>

      {error ? (
        <div role="alert" className="rounded-xl border border-[#F85149]/50 bg-[#F85149]/10 p-3 text-sm text-[#FFB4AE]">
          {error}
        </div>
      ) : null}
      {message ? (
        <div role="status" className="rounded-xl border border-[#00E676]/40 bg-[#00E676]/10 p-3 text-sm text-[#B7FFD4]">
          {message}
        </div>
      ) : null}
      {!canWrite ? (
        <div className="rounded-xl border border-[#F2D48C]/40 bg-[#F2D48C]/10 p-3 text-sm text-[#F2D48C]">
          Read-only: your role lacks `products:moderate`. Editing controls are disabled.
        </div>
      ) : null}
      {loading && !catalogue ? (
        <div role="status" className="rounded-2xl border border-[#21262D] bg-[#0B0E14] p-6 text-sm text-[#8B949E]">
          Loading departments and listings…
        </div>
      ) : null}
      {!loading && !catalogue && error ? (
        <button
          type="button"
          onClick={() => void load()}
          className="min-h-10 rounded-lg border border-[#30363D] px-4 text-sm font-bold"
        >
          Retry catalogue load
        </button>
      ) : null}

      <section className="rounded-2xl border border-[#21262D] bg-[#0B0E14] p-4" aria-labelledby="department-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="department-heading" className="text-lg font-extrabold">
            1. Department
          </h2>
          <span className="text-xs text-[#8B949E]">{departments.length} departments</span>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-xs font-bold">
            Name
            <input
              value={department.name}
              disabled={!canWrite}
              onChange={(event) => setDepartment({ ...department, name: event.target.value })}
              className="mt-1 min-h-10 w-full rounded-lg border border-[#30363D] bg-[#161B22] px-3 text-sm"
            />
          </label>
          <label className="text-xs font-bold">
            Slug (editable, lowercase hyphens)
            <input
              value={department.slug}
              disabled={!canWrite}
              onChange={(event) => setDepartment({ ...department, slug: event.target.value })}
              placeholder="auto from name when left blank"
              className="mt-1 min-h-10 w-full rounded-lg border border-[#30363D] bg-[#161B22] px-3 text-sm"
            />
          </label>
          <label className="text-xs font-bold">
            Order (lower appears first)
            <input
              value={department.sortOrder}
              disabled={!canWrite}
              inputMode="numeric"
              onChange={(event) => setDepartment({ ...department, sortOrder: event.target.value })}
              placeholder="blank = append"
              className="mt-1 min-h-10 w-full rounded-lg border border-[#30363D] bg-[#161B22] px-3 text-sm"
            />
          </label>
          <label className="text-xs font-bold">
            Image (project path or https URL)
            <input
              value={department.imageUrl}
              disabled={!canWrite}
              onChange={(event) => setDepartment({ ...department, imageUrl: event.target.value })}
              placeholder="/generated/shop/category-home-kitchen.webp"
              className="mt-1 min-h-10 w-full rounded-lg border border-[#30363D] bg-[#161B22] px-3 text-sm"
            />
          </label>
          <label className="text-xs font-bold md:col-span-2">
            Description
            <textarea
              value={department.description}
              disabled={!canWrite}
              onChange={(event) => setDepartment({ ...department, description: event.target.value })}
              rows={2}
              className="mt-1 w-full rounded-lg border border-[#30363D] bg-[#161B22] px-3 py-2 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-bold">
            <input
              type="checkbox"
              checked={department.isDemo}
              disabled={!canWrite}
              onChange={(event) => setDepartment({ ...department, isDemo: event.target.checked })}
            />
            Demonstration department
          </label>
          {department.id ? (
            <label className="flex items-center gap-2 text-xs font-bold">
              <input
                type="checkbox"
                checked={department.isActive}
                disabled={!canWrite}
                onChange={(event) => setDepartment({ ...department, isActive: event.target.checked })}
              />
              Active (visible in Shop navigation)
            </label>
          ) : null}
        </div>
        <p className="mt-3 rounded-lg border border-[#F2D48C]/30 bg-[#F2D48C]/10 p-2 text-xs text-[#F2D48C]">
          Department image alt text is not persisted yet: the proposed `Category.imageAlt` column is pending the
          coordinator-owned migration. Product images require accessible alt text today.
        </p>
        {department.imageUrl ? (
          <div className="mt-3 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={department.imageUrl} alt="" className="h-16 w-24 rounded-lg object-cover" />
            <span className="text-xs text-[#8B949E]">Preview must render before publishing products in this department.</span>
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canWrite || busy}
            onClick={() => void saveDepartment()}
            className="min-h-10 rounded-lg bg-[#00E676] px-4 text-sm font-extrabold text-[#04140B] disabled:opacity-50"
          >
            {department.id ? "Save department" : "Create department"}
          </button>
          {department.id ? (
            <button
              type="button"
              onClick={() => setDepartment({ ...emptyDepartment })}
              className="min-h-10 rounded-lg border border-[#30363D] px-4 text-sm font-bold"
            >
              Cancel edit
            </button>
          ) : null}
        </div>
        {departments.length === 0 ? (
          <p className="mt-4 text-sm text-[#8B949E]">No departments yet. Create the first one above.</p>
        ) : (
          <ul className="mt-4 divide-y divide-[#21262D]">
            {departments.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="font-bold">
                  {entry.name}
                  <span className="ml-2 text-xs text-[#8B949E]">
                    /{entry.slug} · order {entry.sortOrder} · {entry._count?.products ?? 0} listings ·{" "}
                    {entry.isActive ? "active" : "inactive"}
                    {entry.isDemo ? " · DEMO" : ""}
                  </span>
                </span>
                <span className="flex gap-2">
                  {entry.isActive ? (
                    <a
                      href={`/naijashop/c/${entry.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-bold text-[#58A6FF] underline"
                    >
                      View public
                    </a>
                  ) : (
                    <span className="text-xs text-[#8B949E]">Hidden from navigation</span>
                  )}
                  <button
                    type="button"
                    disabled={!canWrite}
                    onClick={() => editDepartment(entry)}
                    className="text-xs font-bold text-[#F2D48C] underline disabled:opacity-50"
                  >
                    Edit
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-[#21262D] bg-[#0B0E14] p-4" aria-labelledby="product-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="product-heading" className="text-lg font-extrabold">
            2. Product
          </h2>
          <span className="text-xs text-[#8B949E]">
            {products.length} listings · {activeCount} published · {draftCount} drafts · {archivedCount} archived
          </span>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-xs font-bold">
            Name
            <input
              value={product.name}
              disabled={!canWrite}
              onChange={(event) => setProduct({ ...product, name: event.target.value })}
              className="mt-1 min-h-10 w-full rounded-lg border border-[#30363D] bg-[#161B22] px-3 text-sm"
            />
          </label>
          <label className="text-xs font-bold">
            Slug (editable, unique)
            <input
              value={product.slug}
              disabled={!canWrite}
              onChange={(event) => setProduct({ ...product, slug: event.target.value })}
              placeholder="auto from name when left blank"
              className="mt-1 min-h-10 w-full rounded-lg border border-[#30363D] bg-[#161B22] px-3 text-sm"
            />
          </label>
          <label className="text-xs font-bold">
            Fulfilment country (fixed after creation)
            <select
              value={product.countryCode}
              disabled={!canWrite || Boolean(product.id)}
              onChange={(event) => {
                const country = COUNTRIES[event.target.value];
                setProduct({
                  ...product,
                  countryCode: event.target.value,
                  currency: country?.currency ?? product.currency
                });
              }}
              className="mt-1 min-h-10 w-full rounded-lg border border-[#30363D] bg-[#161B22] px-3 text-sm disabled:opacity-60"
            >
              {enabledCountries.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name} ({country.currency})
                  {country.deliveryEnabled ? "" : " — checkout not enabled"}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold">
            Currency (from country)
            <input
              value={product.currency}
              readOnly
              aria-readonly="true"
              className="mt-1 min-h-10 w-full rounded-lg border border-[#30363D] bg-[#0D1117] px-3 text-sm text-[#8B949E]"
            />
          </label>
          <label className="text-xs font-bold">
            Price ({product.currency})
            <input
              value={product.price}
              disabled={!canWrite}
              inputMode="decimal"
              onChange={(event) => setProduct({ ...product, price: event.target.value })}
              className="mt-1 min-h-10 w-full rounded-lg border border-[#30363D] bg-[#161B22] px-3 text-sm"
            />
          </label>
          <label className="text-xs font-bold">
            Department
            <select
              value={product.categoryId}
              disabled={!canWrite}
              onChange={(event) => setProduct({ ...product, categoryId: event.target.value })}
              className="mt-1 min-h-10 w-full rounded-lg border border-[#30363D] bg-[#161B22] px-3 text-sm"
            >
              <option value="">Choose a department</option>
              {departments.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                  {entry.isActive ? "" : " (inactive)"}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold">
            Inventory quantity
            <input
              value={product.quantity}
              disabled={!canWrite}
              inputMode="numeric"
              onChange={(event) => setProduct({ ...product, quantity: event.target.value })}
              className="mt-1 min-h-10 w-full rounded-lg border border-[#30363D] bg-[#161B22] px-3 text-sm"
            />
          </label>
          <label className="text-xs font-bold">
            Low stock level
            <input
              value={product.lowStockLevel}
              disabled={!canWrite}
              inputMode="numeric"
              onChange={(event) => setProduct({ ...product, lowStockLevel: event.target.value })}
              className="mt-1 min-h-10 w-full rounded-lg border border-[#30363D] bg-[#161B22] px-3 text-sm"
            />
          </label>
          <label className="text-xs font-bold md:col-span-2">
            Description
            <textarea
              value={product.description}
              disabled={!canWrite}
              onChange={(event) => setProduct({ ...product, description: event.target.value })}
              rows={2}
              className="mt-1 w-full rounded-lg border border-[#30363D] bg-[#161B22] px-3 py-2 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-bold">
            <input
              type="checkbox"
              checked={product.isDemo}
              disabled={!canWrite}
              onChange={(event) => setProduct({ ...product, isDemo: event.target.checked })}
            />
            Demonstration listing (DEMO)
          </label>
        </div>

        <fieldset className="mt-4 rounded-xl border border-[#30363D] p-3">
          <legend className="px-1 text-xs font-extrabold uppercase tracking-wide text-[#8B949E]">
            Images (first image is the cover)
          </legend>
          <div className="space-y-3">
            {product.images.map((image, index) => (
              <div key={index} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                <label className="text-xs font-bold">
                  Image {index + 1} (project path or https URL)
                  <input
                    value={image.url}
                    disabled={!canWrite}
                    onChange={(event) => updateImage(index, { url: event.target.value })}
                    className="mt-1 min-h-10 w-full rounded-lg border border-[#30363D] bg-[#161B22] px-3 text-sm"
                  />
                </label>
                <label className="text-xs font-bold">
                  Accessible image text {index + 1}
                  <input
                    value={image.alt}
                    disabled={!canWrite}
                    onChange={(event) => updateImage(index, { alt: event.target.value })}
                    className="mt-1 min-h-10 w-full rounded-lg border border-[#30363D] bg-[#161B22] px-3 text-sm"
                  />
                </label>
                <button
                  type="button"
                  disabled={!canWrite || product.images.length === 1}
                  onClick={() =>
                    setProduct((current) => ({
                      ...current,
                      images: current.images.filter((_, position) => position !== index)
                    }))
                  }
                  className="min-h-10 self-end rounded-lg border border-[#30363D] px-3 text-xs font-bold disabled:opacity-40"
                >
                  Remove image {index + 1}
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!canWrite || product.images.length >= 6}
              onClick={() => setProduct((current) => ({ ...current, images: [...current.images, { url: "", alt: "" }] }))}
              className="min-h-10 rounded-lg border border-[#30363D] px-3 text-xs font-bold disabled:opacity-40"
            >
              Add another image
            </button>
            <span className="text-xs text-[#8B949E]">
              Publishing requires at least one image and alt text on every image.
            </span>
          </div>
        </fieldset>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canWrite || busy}
            onClick={() => void saveProduct()}
            className="min-h-10 rounded-lg bg-[#00E676] px-4 text-sm font-extrabold text-[#04140B] disabled:opacity-50"
          >
            {product.id ? "Save product" : "Create draft"}
          </button>
          {product.id ? (
            <button
              type="button"
              onClick={() => {
                setProduct({ ...emptyProduct, categoryId: departments[0]?.id ?? "" });
                setValidation(null);
              }}
              className="min-h-10 rounded-lg border border-[#30363D] px-4 text-sm font-bold"
            >
              Cancel edit
            </button>
          ) : null}
        </div>

        {validation ? (
          <div
            data-testid="catalogue-validation"
            className={`mt-4 rounded-xl border p-3 text-sm ${
              validation.valid
                ? "border-[#00E676]/40 bg-[#00E676]/10 text-[#B7FFD4]"
                : "border-[#F85149]/50 bg-[#F85149]/10 text-[#FFB4AE]"
            }`}
          >
            <p className="font-extrabold">
              {validation.valid ? "Validation passed" : `${validation.issues.length} blocking issue(s)`} —{" "}
              {validation.name}
            </p>
            {validation.issues.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {validation.issues.map((issue) => (
                  <li key={`${issue.field}-${issue.message}`}>
                    <span className="font-bold">{issue.field}:</span> {issue.message}
                  </li>
                ))}
              </ul>
            ) : validation.product ? (
              <p className="mt-1 text-xs">
                Status {validation.product.status} ·{" "}
                {formatMoney(validation.product.priceKobo, validation.product.currency)} ·{" "}
                {validation.product.available} available
              </p>
            ) : null}
          </div>
        ) : null}

        {preview ? (
          <div
            data-testid="catalogue-preview"
            className="mt-4 grid gap-3 rounded-xl border border-[#58A6FF]/40 bg-[#101826] p-3 sm:grid-cols-[140px_1fr]"
          >
            <div>
              {preview.images[0]?.url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={preview.images[0].url} alt={preview.images[0].alt ?? ""} className="h-28 w-full rounded-lg object-cover" />
              ) : (
                <div className="flex h-28 w-full items-center justify-center rounded-lg border border-dashed border-[#30363D] text-xs text-[#8B949E]">
                  No image
                </div>
              )}
            </div>
            <div className="text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-extrabold">{preview.name}</h3>
                <span className="rounded bg-[#F2D48C]/20 px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-[#F2D48C]">
                  {preview.status}
                </span>
                {preview.isDemo ? (
                  <span className="rounded bg-[#F2D48C]/20 px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-[#F2D48C]">
                    DEMO
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-[#8B949E]">
                {preview.category?.name ?? "No department"} · /product/{preview.slug}
              </p>
              <p className="mt-1 font-bold">
                {formatMoney(preview.priceKobo, preview.currency)} ·{" "}
                {availableStock(preview.stock)} available of {preview.stock?.quantity ?? 0}
              </p>
              <p className="mt-1 text-xs text-[#8B949E]">
                {preview.status === "ACTIVE"
                  ? "This listing is publicly visible."
                  : preview.status === "ARCHIVED"
                    ? "Archived listings are not publicly visible; historical order snapshots remain readable."
                    : "Draft: the public product page returns 404 until it is published."}
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
                {preview.status === "ACTIVE" ? (
                  <a
                    href={`/product/${preview.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#58A6FF] underline"
                  >
                    Open public page
                  </a>
                ) : null}
                <button type="button" onClick={() => setPreview(null)} className="text-[#8B949E] underline">
                  Close preview
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <caption className="sr-only">Catalogue listings with moderation actions</caption>
            <thead className="text-[10px] uppercase tracking-wide text-[#8B949E]">
              <tr>
                <th className="py-2">Product</th>
                <th>Department</th>
                <th>Status</th>
                <th>Price</th>
                <th>Inventory</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#21262D]">
              {products.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-4 text-sm text-[#8B949E]">
                    No listings yet. Create a draft above.
                  </td>
                </tr>
              ) : null}
              {products.map((entry) => (
                <tr key={entry.id}>
                  <td className="py-2 pr-3">
                    <span className="font-bold">{entry.name}</span>
                    <span className="ml-2 text-xs text-[#8B949E]">{entry.isDemo ? "DEMO" : "live"}</span>
                    <span className="mt-0.5 block text-[10px] text-[#8B949E]">/{entry.slug}</span>
                  </td>
                  <td className="pr-3 text-[#8B949E]">{entry.category?.name ?? "—"}</td>
                  <td className="pr-3">
                    <span
                      className={
                        entry.status === "ACTIVE"
                          ? "text-[#00E676]"
                          : entry.status === "DRAFT"
                            ? "text-[#F2D48C]"
                            : "text-[#FFB4AE]"
                      }
                    >
                      {entry.status}
                    </span>
                  </td>
                  <td className="pr-3 font-bold">{formatMoney(entry.priceKobo, entry.currency)}</td>
                  <td className="pr-3">
                    <span className="font-bold">{availableStock(entry.stock)}</span>
                    <span className="text-xs text-[#8B949E]"> / {entry.stock?.quantity ?? 0} on hand</span>
                  </td>
                  <td className="py-2 text-right">
                    <div className="flex flex-wrap justify-end gap-2 text-xs font-bold">
                      <button
                        type="button"
                        disabled={!canWrite || busy}
                        onClick={() => {
                          setPreview(entry);
                          setValidation(null);
                        }}
                        className="text-[#58A6FF] underline disabled:opacity-50"
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        disabled={!canWrite || busy}
                        onClick={() => editProduct(entry)}
                        className="text-[#F2D48C] underline disabled:opacity-50"
                      >
                        Edit
                      </button>
                      {entry.status !== "ARCHIVED" ? (
                        <button
                          type="button"
                          disabled={!canWrite || busy}
                          onClick={() => void moderate(entry, "validate")}
                          className="text-[#58A6FF] underline disabled:opacity-50"
                        >
                          Validate
                        </button>
                      ) : null}
                      {entry.status === "DRAFT" ? (
                        <button
                          type="button"
                          disabled={!canWrite || busy}
                          onClick={() => void moderate(entry, "publish")}
                          className="text-[#00E676] underline disabled:opacity-50"
                        >
                          Publish
                        </button>
                      ) : null}
                      {entry.status === "ACTIVE" ? (
                        <button
                          type="button"
                          disabled={!canWrite || busy}
                          onClick={() => void moderate(entry, "unpublish")}
                          className="text-[#FFB4AE] underline disabled:opacity-50"
                        >
                          Unpublish
                        </button>
                      ) : null}
                      {entry.status === "DRAFT" || entry.status === "ACTIVE" ? (
                        <button
                          type="button"
                          disabled={!canWrite || busy}
                          onClick={() => void moderate(entry, "archive")}
                          className="text-[#8B949E] underline disabled:opacity-50"
                        >
                          Archive
                        </button>
                      ) : null}
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
