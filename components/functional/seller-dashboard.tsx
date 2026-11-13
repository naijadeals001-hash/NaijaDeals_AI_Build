"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, Loader2, PackageCheck, Plus, Store, Trash2 } from "lucide-react";
import {
  ApiRequestError,
  apiClient,
  koboToNaira,
  statusLabel,
  type ApiOrder,
  type SellerOverview
} from "@/lib/api-client";
import { CategoryAttributeFields, CategoryPicker, validateAttributeValues } from "@/components/seller/category-picker";
import { CategoryRequestForm } from "@/components/seller/category-request-form";
import { taxonomyErrorMessage, type SellerCategory } from "@/lib/taxonomy-api";

const sellerActions: Record<string, Array<{ status: "accepted" | "preparing" | "ready_for_pickup"; label: string }>> = {
  vendor_notified: [{ status: "accepted", label: "Accept order" }],
  accepted: [{ status: "preparing", label: "Start preparing" }],
  preparing: [{ status: "ready_for_pickup", label: "Ready for pickup" }]
};

const PRODUCT_DRAFT_KEY = "naijashop:seller:product-draft:v1";

type ProductDraft = {
  name: string;
  description: string;
  categoryId: string;
  priceNaira: string;
  imageUrl: string;
  quantity: string;
  attributes: Record<string, string>;
};

const EMPTY_PRODUCT: ProductDraft = {
  name: "",
  description: "",
  categoryId: "",
  priceNaira: "",
  imageUrl: "/products/tecno-spark-20.svg",
  quantity: "5",
  attributes: {}
};

function readSavedDraft(): ProductDraft | null {
  try {
    const raw = window.localStorage.getItem(PRODUCT_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ProductDraft>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      name: typeof parsed.name === "string" ? parsed.name : "",
      description: typeof parsed.description === "string" ? parsed.description : "",
      categoryId: typeof parsed.categoryId === "string" ? parsed.categoryId : "",
      priceNaira: typeof parsed.priceNaira === "string" ? parsed.priceNaira : "",
      imageUrl: typeof parsed.imageUrl === "string" ? parsed.imageUrl : EMPTY_PRODUCT.imageUrl,
      quantity: typeof parsed.quantity === "string" ? parsed.quantity : EMPTY_PRODUCT.quantity,
      attributes:
        parsed.attributes && typeof parsed.attributes === "object" && !Array.isArray(parsed.attributes)
          ? Object.fromEntries(
              Object.entries(parsed.attributes as Record<string, unknown>)
                .filter(([, value]) => typeof value === "string")
                .map(([key, value]) => [key, value as string])
            )
          : {}
    };
  } catch {
    return null;
  }
}

function isMeaningfulDraft(draft: ProductDraft) {
  return Boolean(
    draft.name.trim() ||
      draft.description.trim() ||
      draft.categoryId ||
      draft.priceNaira.trim() ||
      draft.quantity.trim() !== EMPTY_PRODUCT.quantity ||
      Object.values(draft.attributes).some((value) => value.trim())
  );
}

export function SellerDashboard() {
  const [overview, setOverview] = useState<SellerOverview | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "not-seller">("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [showProductForm, setShowProductForm] = useState(false);
  const [profile, setProfile] = useState({
    name: "",
    description: "",
    pickupAddress: "",
    pickupPhone: "",
    payoutBank: "",
    payoutAccountName: "",
    payoutAccountNumber: ""
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [form, setForm] = useState<ProductDraft>({ ...EMPTY_PRODUCT, attributes: {} });
  const [selectedCategory, setSelectedCategory] = useState<SellerCategory | null>(null);
  const [attributeErrors, setAttributeErrors] = useState<Record<string, string>>({});
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestSeed, setRequestSeed] = useState("");
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const requestPanelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiClient.sellerOverview();
      setOverview(data);
      setProfile({
        name: data.vendor.name ?? "",
        description: data.vendor.description ?? "",
        pickupAddress: data.vendor.pickupAddress ?? "",
        pickupPhone: data.vendor.pickupPhone ?? "",
        payoutBank: data.vendor.payoutBank ?? "",
        payoutAccountName: data.vendor.payoutAccountName ?? "",
        payoutAccountNumber: data.vendor.payoutAccountNumber ?? ""
      });
      setStatus("ready");
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 403) setStatus("not-seller");
      else {
        setError(err instanceof Error ? err.message : "Unable to load seller dashboard.");
        setStatus("error");
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Restore an unfinished listing draft once per mount. The saved category id is
  // resolved against the live seller categories by the picker, so a category
  // that has since been deprecated simply comes back as "not selected".
  useEffect(() => {
    if (draftHydrated) return;
    const saved = readSavedDraft();
    if (saved) {
      setForm(saved);
      if (isMeaningfulDraft(saved)) {
        setShowProductForm(true);
        setDraftRestored(true);
      }
    }
    setDraftHydrated(true);
  }, [draftHydrated]);

  useEffect(() => {
    if (!draftHydrated) return;
    try {
      if (isMeaningfulDraft(form)) {
        window.localStorage.setItem(PRODUCT_DRAFT_KEY, JSON.stringify(form));
      } else {
        window.localStorage.removeItem(PRODUCT_DRAFT_KEY);
      }
    } catch {
      /* storage can be unavailable (private mode, quota); the form still works */
    }
  }, [form, draftHydrated]);

  function clearDraft() {
    try {
      window.localStorage.removeItem(PRODUCT_DRAFT_KEY);
    } catch {
      /* ignore storage failures */
    }
    setForm({ ...EMPTY_PRODUCT, attributes: {} });
    setSelectedCategory(null);
    setAttributeErrors({});
    setDraftRestored(false);
  }

  function openCategoryRequest(seed: string) {
    setRequestSeed(seed);
    setShowRequestForm(true);
    window.requestAnimationFrame(() =>
      requestPanelRef.current?.scrollIntoView({ block: "start", behavior: "smooth" })
    );
  }

  async function saveProfile() {
    setSavingProfile(true);
    setError("");
    setNotice("");
    try {
      await apiClient.sellerUpdateProfile(profile);
      setNotice("Business profile saved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function advance(order: ApiOrder, next: "accepted" | "preparing" | "ready_for_pickup") {
    setBusy(order.id);
    setError("");
    try {
      await apiClient.sellerOrderStatus(order.id, next);
      setNotice(`Order ${order.orderNumber} moved to ${statusLabel(next)}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update order.");
    } finally {
      setBusy("");
    }
  }

  async function createProduct(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    setAttributeErrors({});
    if (!form.categoryId || !selectedCategory) {
      setError("Choose a category from the published hierarchy before saving the draft.");
      return;
    }
    if (!selectedCategory.canPublish) {
      setError(selectedCategory.restrictionNote || "That category is not open to sellers in your market.");
      return;
    }
    const priceKobo = Math.round(Number(form.priceNaira) * 100);
    if (!Number.isFinite(priceKobo) || !Number.isInteger(priceKobo) || priceKobo <= 0) {
      setError("Enter a valid price in naira.");
      return;
    }
    const quantity = Number(form.quantity);
    if (!Number.isInteger(quantity) || quantity < 0) {
      setError("Stock must be a whole number of units.");
      return;
    }
    const { errors: attributeIssues, payload: attributePayload } = validateAttributeValues(
      selectedCategory.attributes,
      form.attributes
    );
    if (Object.keys(attributeIssues).length > 0) {
      setAttributeErrors(attributeIssues);
      setError("Complete the required category attributes before saving the draft.");
      return;
    }
    setBusy("new-product");
    try {
      await apiClient.sellerCreateProduct({
        name: form.name,
        description: form.description,
        categoryId: form.categoryId,
        priceKobo: String(priceKobo),
        imageUrl: form.imageUrl,
        quantity,
        attributes: attributePayload
      });
      // The seller API creates DRAFT listings; say so rather than claiming publication.
      setNotice("Listing saved as a draft. Drafts are not visible in the marketplace until the catalogue is published.");
      setShowProductForm(false);
      setForm({ ...EMPTY_PRODUCT, attributes: {} });
      setSelectedCategory(null);
      setDraftRestored(false);
      try {
        window.localStorage.removeItem(PRODUCT_DRAFT_KEY);
      } catch {
        /* storage can be unavailable; the saved draft simply stays on this device */
      }
      await load();
    } catch (err) {
      setError(taxonomyErrorMessage(err));
    } finally {
      setBusy("");
    }
  }

  async function updateStock(productId: string, quantity: number) {
    setBusy(productId);
    setError("");
    try {
      await apiClient.sellerUpdateProduct(productId, { quantity });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update stock.");
    } finally {
      setBusy("");
    }
  }

  async function toggleProduct(productId: string, status: "ACTIVE" | "ARCHIVED") {
    setBusy(productId);
    try {
      await apiClient.sellerUpdateProduct(productId, { status });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update product.");
    } finally {
      setBusy("");
    }
  }

  async function resolveReturn(id: string, action: "approve" | "reject" | "receive") {
    setBusy(id);
    try {
      await apiClient.sellerReturnAction(id, action);
      setNotice(`Return ${action}d.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update return.");
    } finally {
      setBusy("");
    }
  }

  if (status === "loading") {
    return (
      <div className="grid min-h-64 place-items-center rounded-2xl border border-border-soft bg-canvas">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (status === "not-seller") {
    return (
      <div className="rounded-2xl border border-border-soft bg-canvas p-8 text-center">
        <Store className="mx-auto mb-3 h-8 w-8 text-primary" />
        <h1 className="font-display text-2xl font-extrabold">Seller access required</h1>
        <p className="mt-2 text-sm text-muted">Apply for a seller account, then an administrator will review it.</p>
        <Link href="/sell" className="mt-4 inline-block rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white">
          Apply to sell
        </Link>
      </div>
    );
  }
  if (status === "error" || !overview) {
    return (
      <div role="alert" className="rounded-xl border border-crimson/30 bg-crimson-soft p-4 font-bold text-crimson">
        <AlertCircle className="mb-1 h-4 w-4" /> {error || "Seller dashboard unavailable."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-primary">Seller hub</p>
          <h1 className="font-display text-3xl font-extrabold">{overview.vendor.name}</h1>
          <p className="text-sm text-muted">
            {overview.vendor.market} · pickup: {overview.vendor.pickupAddress} · {overview.vendor.pickupPhone}
          </p>
        </div>
        <Link href="/" className="text-sm font-bold text-primary underline">
          View storefront
        </Link>
      </header>

      {overview.vendor.status === "SUSPENDED" ? (
        <div role="alert" className="rounded-xl border border-crimson/30 bg-crimson-soft p-3 text-sm font-bold text-[#991B1B]">
          This seller account is suspended{overview.vendor.suspendedReason ? `: ${overview.vendor.suspendedReason}` : "."} Products are
          hidden from the catalogue and new listings or order actions are blocked. Existing orders stay visible so you can
          finish any active work.
        </div>
      ) : null}
      {notice ? <div role="status" className="rounded-xl bg-primary-soft p-3 text-sm font-bold text-primary">{notice}</div> : null}
      {error ? (
        <div role="alert" className="rounded-xl border border-crimson/30 bg-crimson-soft p-3 text-sm font-bold text-[#991B1B]">
          {error}
        </div>
      ) : null}

      <section className="rounded-2xl border border-border-soft bg-canvas p-5">
        <p className="text-xs font-black uppercase tracking-wide text-muted">NaijaPay ledger</p>
        <div className="mt-2 flex flex-wrap gap-8">
          <div>
            <p className="text-xs font-semibold text-muted">Available balance</p>
            <p className="font-display text-2xl font-extrabold text-primary">{koboToNaira(overview.wallet.availableKobo)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted">Held in escrow</p>
            <p className="font-display text-2xl font-extrabold">{koboToNaira(overview.wallet.heldKobo)}</p>
          </div>
          <p className="max-w-xs self-end text-[11px] leading-snug text-muted">
            Balances come from the vendor wallet ledger, not from order totals.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-border-soft bg-canvas p-5">
        <h2 className="font-display text-lg font-extrabold">Business profile</h2>
        <p className="mt-1 text-xs text-muted">Payout changes are audited. Only the last four digits are stored in the audit trail.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold uppercase tracking-wide text-muted">Business name
            <input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} className="mt-1 block min-h-10 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm font-semibold text-ink" />
          </label>
          <label className="text-xs font-bold uppercase tracking-wide text-muted">Pickup phone
            <input value={profile.pickupPhone} onChange={(e) => setProfile({ ...profile, pickupPhone: e.target.value })} className="mt-1 block min-h-10 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm font-semibold text-ink" />
          </label>
          <label className="text-xs font-bold uppercase tracking-wide text-muted sm:col-span-2">Pickup address
            <input value={profile.pickupAddress} onChange={(e) => setProfile({ ...profile, pickupAddress: e.target.value })} className="mt-1 block min-h-10 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm font-semibold text-ink" />
          </label>
          <label className="text-xs font-bold uppercase tracking-wide text-muted sm:col-span-2">Description
            <textarea rows={2} value={profile.description} onChange={(e) => setProfile({ ...profile, description: e.target.value })} className="mt-1 block w-full rounded-lg border border-border-soft bg-surface-low px-3 py-2 text-sm font-semibold text-ink" />
          </label>
          <label className="text-xs font-bold uppercase tracking-wide text-muted">Payout bank
            <input value={profile.payoutBank} onChange={(e) => setProfile({ ...profile, payoutBank: e.target.value })} className="mt-1 block min-h-10 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm font-semibold text-ink" />
          </label>
          <label className="text-xs font-bold uppercase tracking-wide text-muted">Account name
            <input value={profile.payoutAccountName} onChange={(e) => setProfile({ ...profile, payoutAccountName: e.target.value })} className="mt-1 block min-h-10 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm font-semibold text-ink" />
          </label>
          <label className="text-xs font-bold uppercase tracking-wide text-muted">Account number
            <input value={profile.payoutAccountNumber} onChange={(e) => setProfile({ ...profile, payoutAccountNumber: e.target.value })} className="mt-1 block min-h-10 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm font-semibold text-ink" />
          </label>
        </div>
        <button type="button" onClick={() => void saveProfile()} disabled={savingProfile} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white disabled:opacity-60">
          {savingProfile ? "Saving…" : "Save profile"}
        </button>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Products", String(overview.stats.productCount)],
          ["Pending orders", String(overview.stats.pendingOrderCount)],
          ["Low stock", String(overview.stats.lowStockCount)],
          ["Open returns", String(overview.stats.openReturnCount)]
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-border-soft bg-canvas p-4">
            <p className="text-xs font-black uppercase tracking-wide text-muted">{label}</p>
            <p className="font-display text-3xl font-extrabold">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-border-soft bg-canvas p-5">
        <h2 className="font-display text-xl font-extrabold">Settlement summary</h2>
        <p className="text-xs text-muted">Based on paid orders only. Commission is {overview.vendor.commissionBps / 100}%.</p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-bold uppercase text-muted">Gross merchandise</dt>
            <dd className="font-display text-2xl font-extrabold">{koboToNaira(overview.stats.grossKobo)}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase text-muted">Commission</dt>
            <dd className="font-display text-2xl font-extrabold">{koboToNaira(overview.stats.commissionKobo)}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase text-muted">Net payable</dt>
            <dd className="font-display text-2xl font-extrabold text-primary">{koboToNaira(overview.stats.netKobo)}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-border-soft bg-canvas p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-extrabold">Orders</h2>
          <span className="text-xs font-bold text-muted">Only paid orders can be prepared</span>
        </div>
        {overview.orders.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No orders yet.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {overview.orders.map((order) => (
              <article key={order.id} className="rounded-xl bg-surface-low p-3">
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <p className="font-bold">
                      {order.orderNumber} · {statusLabel(order.status)}
                    </p>
                    <p className="text-xs text-muted">
                      {order.contactName} · {order.contactPhone} · {order.deliveryAddress}
                    </p>
                    <p className="text-xs text-muted">
                      {order.items.map((item) => `${item.quantity}× ${item.productName}`).join(", ")}
                    </p>
                  </div>
                  <p className="font-black text-primary">{koboToNaira(order.totalKobo)}</p>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(sellerActions[order.status] ?? []).map((action) => (
                    <button
                      key={action.status}
                      disabled={busy === order.id}
                      onClick={() => void advance(order, action.status)}
                      className="min-h-10 rounded-lg bg-primary px-3 text-sm font-bold text-white disabled:opacity-60"
                    >
                      {action.label}
                    </button>
                  ))}
                  {order.deliveries?.[0] ? (
                    <Link href={`/tracking/${order.deliveries[0].id}`} className="min-h-10 rounded-lg border border-border-soft px-3 py-2 text-sm font-bold">
                      Tracking
                    </Link>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border-soft bg-canvas p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-xl font-extrabold">Products</h2>
            <p className="text-xs text-muted">New listings are saved as drafts; the marketplace only shows published listings.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowProductForm((open) => !open)}
              aria-expanded={showProductForm}
              aria-controls="seller-product-form"
              className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-primary px-3 text-sm font-bold text-white"
            >
              <Plus className="h-4 w-4" aria-hidden /> {showProductForm ? "Hide draft form" : "Add product"}
            </button>
            {isMeaningfulDraft(form) ? (
              <button
                type="button"
                onClick={clearDraft}
                className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-border-soft px-3 text-sm font-bold text-muted"
              >
                <Trash2 className="h-4 w-4" aria-hidden /> Discard draft
              </button>
            ) : null}
          </div>
        </div>

        {draftRestored ? (
          <p role="status" className="mt-3 rounded-xl bg-primary-soft p-3 text-[12px] font-semibold text-primary">
            Restored an unfinished listing draft saved on this device. Categories are re-checked against the live seller
            hierarchy before the draft can be submitted.
            <button type="button" onClick={() => setDraftRestored(false)} className="ml-2 underline">
              Dismiss
            </button>
          </p>
        ) : null}

        {showProductForm ? (
          <form
            id="seller-product-form"
            onSubmit={createProduct}
            noValidate
            className="mt-3 grid gap-3 rounded-xl bg-surface-low p-3 sm:grid-cols-2"
          >
            <label>
              <span className="text-sm font-black">Name</span>
              <input
                required
                value={form.name}
                onChange={(event) => setForm((c) => ({ ...c, name: event.target.value }))}
                className="mt-1 min-h-10 w-full rounded-lg border border-border-soft bg-canvas px-3 text-sm"
              />
            </label>
            <label>
              <span className="text-sm font-black">Price (naira)</span>
              <input
                required
                inputMode="decimal"
                value={form.priceNaira}
                onChange={(event) => setForm((c) => ({ ...c, priceNaira: event.target.value }))}
                className="mt-1 min-h-10 w-full rounded-lg border border-border-soft bg-canvas px-3 text-sm"
              />
            </label>
            <label>
              <span className="text-sm font-black">Stock</span>
              <input
                required
                inputMode="numeric"
                value={form.quantity}
                onChange={(event) => setForm((c) => ({ ...c, quantity: event.target.value }))}
                className="mt-1 min-h-10 w-full rounded-lg border border-border-soft bg-canvas px-3 text-sm"
              />
            </label>
            <label className="sm:col-span-2">
              <span className="text-sm font-black">Image URL (https or local /path)</span>
              <input
                required
                value={form.imageUrl}
                onChange={(event) => setForm((c) => ({ ...c, imageUrl: event.target.value }))}
                className="mt-1 min-h-10 w-full rounded-lg border border-border-soft bg-canvas px-3 text-sm"
              />
            </label>
            <label className="sm:col-span-2">
              <span className="text-sm font-black">Description</span>
              <textarea
                required
                rows={3}
                value={form.description}
                onChange={(event) => setForm((c) => ({ ...c, description: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-border-soft bg-canvas px-3 py-2 text-sm"
              />
            </label>

            <div className="sm:col-span-2">
              <CategoryPicker
                value={form.categoryId}
                onSelect={(category) => {
                  setSelectedCategory(category);
                  setAttributeErrors({});
                  setForm((current) =>
                    category
                      ? {
                          ...current,
                          categoryId: category.id,
                          // Attribute keys belong to one category; switching
                          // categories starts a clean attribute set.
                          attributes: current.categoryId === category.id ? current.attributes : {}
                        }
                      : { ...current, categoryId: "", attributes: {} }
                  );
                }}
                onRequestCategory={(query) => openCategoryRequest(query)}
              />
            </div>

            {selectedCategory && selectedCategory.attributes.length > 0 ? (
              <div className="sm:col-span-2">
                <CategoryAttributeFields
                  attributes={selectedCategory.attributes}
                  values={form.attributes}
                  errors={attributeErrors}
                  onChange={(key, value) => {
                    setAttributeErrors((current) => {
                      if (!current[key]) return current;
                      const next = { ...current };
                      delete next[key];
                      return next;
                    });
                    setForm((current) => ({ ...current, attributes: { ...current.attributes, [key]: value } }));
                  }}
                />
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <button
                type="submit"
                disabled={busy === "new-product"}
                className="min-h-11 rounded-lg bg-primary px-4 text-sm font-bold text-white disabled:opacity-60"
              >
                {busy === "new-product" ? "Saving draft…" : "Save draft listing"}
              </button>
              <p className="text-[11px] leading-4 text-muted">
                Saving never publishes. Draft fields stay in this browser until you submit or discard them.
              </p>
            </div>
          </form>
        ) : null}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border-soft text-xs uppercase text-muted">
                <th className="py-2">Product</th>
                <th className="py-2">Price</th>
                <th className="py-2">Stock</th>
                <th className="py-2">Status</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {overview.products.map((product) => (
                <tr key={product.id} className="border-b border-border-soft">
                  <td className="py-2">
                    <Link href={`/product/${product.slug}`} className="font-bold hover:text-primary">
                      {product.name}
                    </Link>
                  </td>
                  <td className="py-2 font-bold">{koboToNaira(product.priceKobo)}</td>
                  <td className="py-2">
                    {product.variants && product.variants.length > 0 ? (
                      <span>{product.variants.reduce((total, variant) => total + variant.stock, 0)} (variants)</span>
                    ) : (
                      <input
                        type="number"
                        min={0}
                        defaultValue={product.stock?.quantity ?? 0}
                        onBlur={(event) => {
                          const value = Number(event.target.value);
                          if (Number.isInteger(value) && value >= 0 && value !== (product.stock?.quantity ?? 0)) {
                            void updateStock(product.id, value);
                          }
                        }}
                        className="min-h-9 w-20 rounded-lg border border-border-soft px-2"
                        aria-label={`Stock for ${product.name}`}
                      />
                    )}
                  </td>
                  <td className="py-2">{statusLabel(product.status)}</td>
                  <td className="py-2">
                    <button
                      onClick={() => void toggleProduct(product.id, product.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE")}
                      className="min-h-9 rounded-lg border border-border-soft px-2 text-xs font-bold"
                    >
                      {product.status === "ACTIVE" ? "Archive" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div ref={requestPanelRef}>
        <CategoryRequestForm
          open={showRequestForm}
          initialName={requestSeed}
          onClose={() => setShowRequestForm(false)}
          onSubmitted={() => setNotice("Category request sent for Control Center review.")}
        />
      </div>

      <section className="rounded-2xl border border-border-soft bg-canvas p-5">
        <h2 className="font-display text-xl font-extrabold">Returns</h2>
        {overview.returns.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No return requests.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {overview.returns.map((request) => (
              <div key={request.id} className="rounded-xl bg-surface-low p-3">
                <p className="font-bold">
                  {request.order.orderNumber} · {statusLabel(request.status)}
                </p>
                <p className="text-sm text-muted">
                  {request.user.name}: {request.reason}
                </p>
                <div className="mt-2 flex gap-2">
                  {request.status === "REQUESTED" ? (
                    <>
                      <button onClick={() => void resolveReturn(request.id, "approve")} className="min-h-9 rounded-lg bg-primary px-3 text-xs font-bold text-white">
                        Approve
                      </button>
                      <button onClick={() => void resolveReturn(request.id, "reject")} className="min-h-9 rounded-lg border border-border-soft px-3 text-xs font-bold">
                        Reject
                      </button>
                    </>
                  ) : null}
                  {request.status === "APPROVED" ? (
                    <button onClick={() => void resolveReturn(request.id, "receive")} className="min-h-9 rounded-lg bg-primary px-3 text-xs font-bold text-white">
                      Receive and refund
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="flex items-center gap-2 text-xs text-muted">
        <PackageCheck className="h-4 w-4" /> Delivery is assigned by the Control Center. Seller pickup details are
        shared only with the assigned courier.
      </p>
    </div>
  );
}
