"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, Loader2, PackageCheck, Plus, Store } from "lucide-react";
import {
  ApiRequestError,
  apiClient,
  koboToNaira,
  statusLabel,
  type ApiCategory,
  type ApiOrder,
  type SellerOverview
} from "@/lib/api-client";

const sellerActions: Record<string, Array<{ status: "accepted" | "preparing" | "ready_for_pickup"; label: string }>> = {
  vendor_notified: [{ status: "accepted", label: "Accept order" }],
  accepted: [{ status: "preparing", label: "Start preparing" }],
  preparing: [{ status: "ready_for_pickup", label: "Ready for pickup" }]
};

export function SellerDashboard() {
  const [overview, setOverview] = useState<SellerOverview | null>(null);
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "not-seller">("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [showProductForm, setShowProductForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    categoryId: "",
    priceNaira: "",
    imageUrl: "/products/tecno-spark-20.svg",
    quantity: "5"
  });

  const load = useCallback(async () => {
    try {
      const [data, cats] = await Promise.all([apiClient.sellerOverview(), apiClient.getCategories()]);
      setOverview(data);
      setCategories(cats);
      setForm((current) => ({ ...current, categoryId: current.categoryId || cats[0]?.id || "" }));
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
    const priceKobo = Math.round(Number(form.priceNaira) * 100);
    if (!Number.isInteger(priceKobo) || priceKobo <= 0) {
      setError("Enter a valid price in naira.");
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
        quantity: Number(form.quantity)
      });
      setNotice("Product published.");
      setShowProductForm(false);
      setForm((current) => ({ ...current, name: "", description: "", priceNaira: "" }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish product.");
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

      {notice ? <div role="status" className="rounded-xl bg-primary-soft p-3 text-sm font-bold text-primary">{notice}</div> : null}
      {error ? (
        <div role="alert" className="rounded-xl border border-crimson/30 bg-crimson-soft p-3 text-sm font-bold text-crimson">
          {error}
        </div>
      ) : null}

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
          <h2 className="font-display text-xl font-extrabold">Products</h2>
          <button onClick={() => setShowProductForm((open) => !open)} className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-primary px-3 text-sm font-bold text-white">
            <Plus className="h-4 w-4" /> Add product
          </button>
        </div>
        {showProductForm ? (
          <form onSubmit={createProduct} className="mt-3 grid gap-2 rounded-xl bg-surface-low p-3 sm:grid-cols-2">
            <label>
              <span className="text-sm font-black">Name</span>
              <input required value={form.name} onChange={(event) => setForm((c) => ({ ...c, name: event.target.value }))} className="mt-1 min-h-10 w-full rounded-lg border border-border-soft px-3 text-sm" />
            </label>
            <label>
              <span className="text-sm font-black">Price (naira)</span>
              <input required inputMode="decimal" value={form.priceNaira} onChange={(event) => setForm((c) => ({ ...c, priceNaira: event.target.value }))} className="mt-1 min-h-10 w-full rounded-lg border border-border-soft px-3 text-sm" />
            </label>
            <label>
              <span className="text-sm font-black">Category</span>
              <select value={form.categoryId} onChange={(event) => setForm((c) => ({ ...c, categoryId: event.target.value }))} className="mt-1 min-h-10 w-full rounded-lg border border-border-soft px-3 text-sm">
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="text-sm font-black">Stock</span>
              <input required inputMode="numeric" value={form.quantity} onChange={(event) => setForm((c) => ({ ...c, quantity: event.target.value }))} className="mt-1 min-h-10 w-full rounded-lg border border-border-soft px-3 text-sm" />
            </label>
            <label className="sm:col-span-2">
              <span className="text-sm font-black">Image URL (https or local /path)</span>
              <input required value={form.imageUrl} onChange={(event) => setForm((c) => ({ ...c, imageUrl: event.target.value }))} className="mt-1 min-h-10 w-full rounded-lg border border-border-soft px-3 text-sm" />
            </label>
            <label className="sm:col-span-2">
              <span className="text-sm font-black">Description</span>
              <textarea required value={form.description} onChange={(event) => setForm((c) => ({ ...c, description: event.target.value }))} className="mt-1 min-h-20 w-full rounded-lg border border-border-soft px-3 py-2 text-sm" />
            </label>
            <button type="submit" disabled={busy === "new-product"} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-bold text-white disabled:opacity-60">
              {busy === "new-product" ? "Publishing..." : "Publish product"}
            </button>
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
