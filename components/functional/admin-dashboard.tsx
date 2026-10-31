"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, Loader2, ShieldCheck } from "lucide-react";
import {
  ApiRequestError,
  apiClient,
  koboToNaira,
  statusLabel,
  type AdminOverview,
  type ApiOrder,
  type ApiRide
} from "@/lib/api-client";

type Tab = "overview" | "orders" | "applications" | "products" | "payments" | "users" | "deliveries" | "rides" | "payouts" | "audit";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "orders", label: "Orders" },
  { id: "applications", label: "Seller applications" },
  { id: "products", label: "Products" },
  { id: "payments", label: "Payments" },
  { id: "users", label: "Users" },
  { id: "deliveries", label: "Deliveries" },
  { id: "rides", label: "Rides" },
  { id: "payouts", label: "Payouts" },
  { id: "audit", label: "Audit log" }
];

export function AdminDashboard() {
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [applications, setApplications] = useState<Array<Record<string, unknown>>>([]);
  const [products, setProducts] = useState<Array<Record<string, unknown>>>([]);
  const [payments, setPayments] = useState<Array<Record<string, unknown>>>([]);
  const [users, setUsers] = useState<Array<Record<string, unknown>>>([]);
  const [couriers, setCouriers] = useState<Array<Record<string, unknown>>>([]);
  const [rides, setRides] = useState<ApiRide[]>([]);
  const [payouts, setPayouts] = useState<Array<Record<string, unknown>>>([]);
  const [vendors, setVendors] = useState<Array<Record<string, unknown>>>([]);
  const [audit, setAudit] = useState<Array<Record<string, unknown>>>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "forbidden">("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const [ov, ord, apps, prods, pays, usrs, cours, outs, vends, logs, rideList] = await Promise.all([
        apiClient.adminOverview(),
        apiClient.adminOrders(),
        apiClient.adminApplications(),
        apiClient.adminProducts(),
        apiClient.adminPayments(),
        apiClient.adminUsers(),
        apiClient.adminCouriers(),
        apiClient.adminPayouts(),
        apiClient.adminVendors(),
        apiClient.adminAuditLogs(),
        apiClient.adminRides()
      ]);
      setOverview(ov);
      setOrders(ord);
      setApplications(apps);
      setProducts(prods);
      setPayments(pays);
      setUsers(usrs);
      setCouriers(cours);
      setPayouts(outs);
      setVendors(vends);
      setAudit(logs);
      setRides(rideList.rides);
      setStatus("ready");
    } catch (err) {
      if (err instanceof ApiRequestError && (err.status === 401 || err.status === 403)) setStatus("forbidden");
      else {
        setError(err instanceof Error ? err.message : "Unable to load Control Center.");
        setStatus("error");
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(key: string, action: () => Promise<unknown>, message: string) {
    setBusy(key);
    setError("");
    try {
      await action();
      setNotice(message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
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
  if (status === "forbidden") {
    return (
      <div className="rounded-2xl border border-border-soft bg-canvas p-8 text-center">
        <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-primary" />
        <h1 className="font-display text-2xl font-extrabold">Administrator access required</h1>
        <p className="mt-2 text-sm text-muted">The Control Center is separate from public shopping.</p>
        <Link href="/login?next=/admin" className="mt-4 inline-block rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white">
          Sign in as administrator
        </Link>
      </div>
    );
  }
  if (status === "error" || !overview) {
    return (
      <div role="alert" className="rounded-xl border border-crimson/30 bg-crimson-soft p-4 font-bold text-crimson">
        <AlertCircle className="mb-1 h-4 w-4" /> {error || "Control Center unavailable."}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-black uppercase tracking-wide text-primary">Control Center</p>
        <h1 className="font-display text-3xl font-extrabold">Operations dashboard</h1>
        <p className="text-sm text-muted">All figures are computed from the database. No sample revenue is displayed.</p>
      </header>

      {notice ? <div role="status" className="rounded-xl bg-primary-soft p-3 text-sm font-bold text-primary">{notice}</div> : null}
      {error ? (
        <div role="alert" className="rounded-xl border border-crimson/30 bg-crimson-soft p-3 text-sm font-bold text-crimson">
          {error}
        </div>
      ) : null}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`min-h-10 whitespace-nowrap rounded-full px-4 text-sm font-bold ${tab === item.id ? "bg-primary text-white" : "bg-canvas text-muted ring-1 ring-border-soft"}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="space-y-4">
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Users", overview.users],
              ["Vendors", overview.vendors],
              ["Products", overview.products],
              ["Orders", overview.orders],
              ["Paid orders", overview.paidOrders],
              ["Pending applications", overview.pendingApplications],
              ["Low stock", overview.lowStock],
              ["Open returns", overview.openReturns]
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl border border-border-soft bg-canvas p-4">
                <p className="text-xs font-black uppercase tracking-wide text-muted">{label}</p>
                <p className="font-display text-3xl font-extrabold">{value}</p>
              </div>
            ))}
          </section>
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-night p-4 text-white">
              <p className="text-xs font-bold uppercase text-white/60">Verified payment volume</p>
              <p className="font-display text-2xl font-extrabold">{koboToNaira(overview.grossVerifiedKobo)}</p>
              <p className="text-xs text-white/60">{overview.completedPaymentCount} completed payment(s)</p>
            </div>
            <div className="rounded-2xl border border-border-soft bg-canvas p-4">
              <p className="text-xs font-bold uppercase text-muted">Refunded</p>
              <p className="font-display text-2xl font-extrabold">{koboToNaira(overview.refundedKobo)}</p>
              <p className="text-xs text-muted">{overview.refundCount} refund(s)</p>
            </div>
            <div className="rounded-2xl border border-border-soft bg-canvas p-4">
              <p className="text-xs font-bold uppercase text-muted">Escrow held</p>
              <p className="font-display text-2xl font-extrabold">{koboToNaira(overview.escrowHeldKobo)}</p>
            </div>
          </section>
          <section className="rounded-2xl border border-border-soft bg-canvas p-4">
            <h2 className="font-display text-lg font-extrabold">Payment provider configuration</h2>
            <div className="mt-2 space-y-1 text-sm">
              {overview.paymentMethods.map((method) => (
                <p key={method.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-surface-low p-2">
                  <span className="font-bold">{method.label}</span>
                  <span className={method.configured ? "font-bold text-primary" : "font-bold text-amber"}>
                    {method.configured ? "Configured" : method.reason || "Not configured"}
                  </span>
                </p>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {tab === "orders" ? (
        <section className="space-y-2">
          {orders.length === 0 ? <p className="text-sm text-muted">No orders.</p> : null}
          {orders.map((order) => (
            <article key={order.id} className="rounded-2xl border border-border-soft bg-canvas p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <p className="font-bold">
                    {order.orderNumber} · {order.customer?.name} · {order.vendor?.name}
                  </p>
                  <p className="text-xs text-muted">
                    {statusLabel(order.status)} · payment {statusLabel(order.paymentStatus)} · {koboToNaira(order.totalKobo)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <select
                    aria-label={`Status for ${order.orderNumber}`}
                    defaultValue=""
                    onChange={(event) => {
                      if (!event.target.value) return;
                      void run(
                        `${order.id}-${event.target.value}`,
                        () => apiClient.adminOrderStatus(order.id, event.target.value),
                        `Order ${order.orderNumber} updated to ${statusLabel(event.target.value)}.`
                      );
                      event.target.value = "";
                    }}
                    className="min-h-9 rounded-lg border border-border-soft px-2 text-xs font-bold"
                  >
                    <option value="">Change status...</option>
                    {["accepted", "preparing", "ready_for_pickup", "courier_assigned", "picked_up", "in_transit", "delivered", "completed", "cancelled", "refunded"].map((value) => (
                      <option key={value} value={value}>
                        {statusLabel(value)}
                      </option>
                    ))}
                  </select>
                  {order.paymentStatus === "paid" ? (
                    <button
                      disabled={busy.startsWith(order.id)}
                      onClick={() =>
                        void run(`${order.id}-refund`, () => apiClient.adminOrderStatus(order.id, "refunded", "Administrator refund."), `Order ${order.orderNumber} refunded.`)
                      }
                      className="min-h-9 rounded-lg border border-crimson/40 px-2 text-xs font-bold text-crimson"
                    >
                      Refund
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {tab === "applications" ? (
        <section className="space-y-2">
          {applications.length === 0 ? <p className="text-sm text-muted">No seller applications.</p> : null}
          {applications.map((application) => {
            const user = application.user as { name?: string; email?: string } | undefined;
            return (
              <article key={String(application.id)} className="rounded-2xl border border-border-soft bg-canvas p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <p className="font-bold">
                      {String(application.businessName)} · {statusLabel(String(application.status))}
                    </p>
                    <p className="text-xs text-muted">
                      {user?.name} ({user?.email}) · {String(application.market)} · pickup {String(application.pickupAddress)} · {String(application.phone)}
                    </p>
                  </div>
                  {application.status === "SUBMITTED" ? (
                    <div className="flex gap-2">
                      <button
                        disabled={busy === String(application.id)}
                        onClick={() => void run(String(application.id), () => apiClient.adminReviewApplication(String(application.id), "approve"), "Seller approved.")}
                        className="min-h-9 rounded-lg bg-primary px-3 text-xs font-bold text-white"
                      >
                        Approve
                      </button>
                      <button
                        disabled={busy === String(application.id)}
                        onClick={() => void run(String(application.id), () => apiClient.adminReviewApplication(String(application.id), "reject"), "Seller rejected.")}
                        className="min-h-9 rounded-lg border border-border-soft px-3 text-xs font-bold"
                      >
                        Reject
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </section>
      ) : null}

      {tab === "products" ? (
        <section className="overflow-x-auto rounded-2xl border border-border-soft bg-canvas p-4">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-border-soft text-xs uppercase text-muted">
                <th className="py-2">Product</th>
                <th className="py-2">Vendor</th>
                <th className="py-2">Price</th>
                <th className="py-2">Stock</th>
                <th className="py-2">Status</th>
                <th className="py-2">Moderate</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const vendor = product.vendor as { name?: string } | undefined;
                const stock = product.stock as { quantity?: number } | null;
                return (
                  <tr key={String(product.id)} className="border-b border-border-soft">
                    <td className="py-2 font-bold">{String(product.name)}</td>
                    <td className="py-2">{vendor?.name}</td>
                    <td className="py-2">{koboToNaira(String(product.priceKobo))}</td>
                    <td className="py-2">{stock?.quantity ?? "variants"}</td>
                    <td className="py-2">{statusLabel(String(product.status))}</td>
                    <td className="py-2">
                      <button
                        onClick={() =>
                          void run(
                            String(product.id),
                            () => apiClient.adminModerateProduct(String(product.id), product.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"),
                            "Product moderation updated."
                          )
                        }
                        className="min-h-9 rounded-lg border border-border-soft px-2 text-xs font-bold"
                      >
                        {product.status === "ACTIVE" ? "Suspend" : "Activate"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}

      {tab === "payments" ? (
        <section className="space-y-2">
          {payments.map((payment) => {
            const order = payment.order as { orderNumber?: string; vendor?: { name?: string } } | undefined;
            return (
              <div key={String(payment.id)} className="flex flex-wrap justify-between gap-2 rounded-xl border border-border-soft bg-canvas p-3 text-sm">
                <div>
                  <p className="font-bold">
                    {order?.orderNumber} · {String(payment.provider)} · {statusLabel(String(payment.status))}
                  </p>
                  <p className="text-xs text-muted">{String(payment.providerReference)}</p>
                </div>
                <p className="font-black">{koboToNaira(String(payment.amountKobo))}</p>
              </div>
            );
          })}
          {payments.length === 0 ? <p className="text-sm text-muted">No payments recorded.</p> : null}
        </section>
      ) : null}

      {tab === "users" ? (
        <section className="overflow-x-auto rounded-2xl border border-border-soft bg-canvas p-4">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border-soft text-xs uppercase text-muted">
                <th className="py-2">Name</th>
                <th className="py-2">Email</th>
                <th className="py-2">Type</th>
                <th className="py-2">Roles</th>
                <th className="py-2">Vendors</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const roles = (user.roles as Array<{ role: { name: string } }> | undefined) ?? [];
                const vendorList = (user.vendors as Array<{ name: string; status: string }> | undefined) ?? [];
                return (
                  <tr key={String(user.id)} className="border-b border-border-soft">
                    <td className="py-2 font-bold">{String(user.name)}</td>
                    <td className="py-2">{String(user.email)}</td>
                    <td className="py-2">{String(user.actorType)}</td>
                    <td className="py-2">{roles.map((entry) => entry.role.name).join(", ")}</td>
                    <td className="py-2">{vendorList.map((vendor) => `${vendor.name} (${vendor.status})`).join(", ") || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}

      {tab === "deliveries" ? (
        <section className="space-y-3">
          {orders.flatMap((order) =>
            (order.deliveries ?? []).map((delivery) => (
              <div key={delivery.id} className="rounded-2xl border border-border-soft bg-canvas p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <p className="font-bold">
                      {order.orderNumber} · {statusLabel(delivery.status)} · {delivery.provider}
                    </p>
                    <p className="text-xs text-muted">Pickup: {delivery.pickupAddress}</p>
                    <p className="text-xs text-muted">Drop-off: {delivery.dropoffAddress}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label={`Assign courier for ${order.orderNumber}`}
                      defaultValue=""
                      onChange={(event) => {
                        if (!event.target.value) return;
                        void run(delivery.id, () => apiClient.adminAssignCourier(delivery.id, event.target.value), "Courier assigned.");
                        event.target.value = "";
                      }}
                      className="min-h-9 rounded-lg border border-border-soft px-2 text-xs font-bold"
                    >
                      <option value="">Assign courier...</option>
                      {couriers.map((courier) => (
                        <option key={String(courier.id)} value={String(courier.id)}>
                          {String(courier.name)}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={`Delivery status for ${order.orderNumber}`}
                      defaultValue=""
                      onChange={(event) => {
                        if (!event.target.value) return;
                        void run(delivery.id, () => apiClient.adminDeliveryStatus(delivery.id, event.target.value), "Delivery status updated.");
                        event.target.value = "";
                      }}
                      className="min-h-9 rounded-lg border border-border-soft px-2 text-xs font-bold"
                    >
                      <option value="">Status...</option>
                      {["pickup_started", "picked_up", "in_transit", "delivery_attempted", "delivered", "failed", "returned", "assigned"].map((value) => (
                        <option key={value} value={value}>
                          {statusLabel(value)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))
          )}
          {orders.every((order) => (order.deliveries ?? []).length === 0) ? <p className="text-sm text-muted">No deliveries.</p> : null}
        </section>
      ) : null}

      {tab === "rides" ? (
        <section className="space-y-3">
          <p className="text-sm text-muted">
            Every NaijaDrive ride, newest first. Cancelling here refunds a NaijaPay hold for rides that have not
            started and records an administrator audit entry.
          </p>
          {rides.length === 0 ? <p className="text-sm text-muted">No rides yet.</p> : null}
          {rides.map((ride) => {
            const cancellable = ["requested", "driver_assigned", "driver_arriving"].includes(ride.status);
            return (
              <article key={ride.id} className="rounded-2xl border border-border-soft bg-canvas p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold">
                      {ride.rideNumber} · {ride.pickupLabel} → {ride.dropoffLabel}
                    </p>
                    <p className="text-xs text-muted">
                      {statusLabel(ride.status)} · {ride.vehicleClass} · {koboToNaira(ride.fareKobo, ride.currency)} ·{" "}
                      {ride.paymentMethod === "wallet" ? "NaijaPay" : "Cash"} · payment {statusLabel(ride.paymentStatus)}
                    </p>
                    <p className="text-xs text-muted">
                      Rider {ride.rider?.name ?? "—"}
                      {ride.driver?.user?.name ? ` · Driver ${ride.driver.user.name}` : " · No driver assigned"}
                      {ride.cancellationReason ? ` · ${ride.cancellationReason}` : ""}
                    </p>
                  </div>
                  {cancellable ? (
                    <button
                      disabled={busy === `${ride.id}-admin-cancel`}
                      onClick={() =>
                        void run(
                          `${ride.id}-admin-cancel`,
                          () => apiClient.adminCancelRide(ride.id, "Cancelled by the Control Center."),
                          `Ride ${ride.rideNumber} cancelled.`
                        )
                      }
                      className="min-h-9 rounded-lg border border-crimson/40 px-3 text-xs font-bold text-crimson"
                    >
                      {busy === `${ride.id}-admin-cancel` ? "Cancelling…" : "Cancel ride"}
                    </button>
                  ) : (
                    <span className="self-start rounded-full bg-surface-low px-3 py-1 text-xs font-bold text-muted">
                      {ride.status === "completed" ? "Completed" : ride.status === "cancelled" ? "Cancelled" : "In progress"}
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      ) : null}

      {tab === "payouts" ? (
        <section className="space-y-3">
          <div className="rounded-2xl border border-border-soft bg-canvas p-4">
            <h2 className="font-display text-lg font-extrabold">Create payout</h2>
            <p className="text-xs text-muted">Payouts are calculated from paid orders in the selected period.</p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                const vendorId = String(data.get("vendorId") ?? "");
                const start = String(data.get("periodStart") ?? "");
                const end = String(data.get("periodEnd") ?? "");
                if (!vendorId || !start || !end) return;
                void run("payout", () => apiClient.adminCreatePayout(vendorId, new Date(start).toISOString(), new Date(end).toISOString()), "Payout created.");
                event.currentTarget.reset();
              }}
              className="mt-2 grid gap-2 sm:grid-cols-4"
            >
              <select name="vendorId" required className="min-h-10 rounded-lg border border-border-soft px-2 text-sm">
                <option value="">Vendor...</option>
                {vendors.map((vendor) => (
                  <option key={String(vendor.id)} value={String(vendor.id)}>
                    {String(vendor.name)}
                  </option>
                ))}
              </select>
              <input name="periodStart" type="date" required className="min-h-10 rounded-lg border border-border-soft px-2 text-sm" aria-label="Period start" />
              <input name="periodEnd" type="date" required className="min-h-10 rounded-lg border border-border-soft px-2 text-sm" aria-label="Period end" />
              <button type="submit" className="min-h-10 rounded-lg bg-primary px-3 text-sm font-bold text-white">
                Create
              </button>
            </form>
          </div>
          {payouts.map((payout) => (
            <div key={String(payout.id)} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-soft bg-canvas p-3 text-sm">
              <div>
                <p className="font-bold">
                  {String((payout.vendor as { name?: string } | undefined)?.name)} · {statusLabel(String(payout.status))}
                </p>
                <p className="text-xs text-muted">{String(payout.reference)}</p>
              </div>
              <div className="flex items-center gap-2">
                <p className="font-black">{koboToNaira(String(payout.amountKobo))}</p>
                {payout.status !== "PAID" ? (
                  <button onClick={() => void run(String(payout.id), () => apiClient.adminPayPayout(String(payout.id)), "Payout marked paid.")} className="min-h-9 rounded-lg bg-primary px-3 text-xs font-bold text-white">
                    Mark paid
                  </button>
                ) : null}
              </div>
            </div>
          ))}
          {payouts.length === 0 ? <p className="text-sm text-muted">No payouts.</p> : null}
        </section>
      ) : null}

      {tab === "audit" ? (
        <section className="space-y-2">
          {audit.map((entry) => (
            <div key={String(entry.id)} className="rounded-xl border border-border-soft bg-canvas p-3 text-sm">
              <p className="font-bold">
                {String(entry.action)} · {String(entry.entity)}
              </p>
              <p className="text-xs text-muted">
                {(entry.actor as { name?: string } | undefined)?.name ?? "System"} · {new Date(String(entry.createdAt)).toLocaleString()}
              </p>
            </div>
          ))}
          {audit.length === 0 ? <p className="text-sm text-muted">No audit entries.</p> : null}
        </section>
      ) : null}
    </div>
  );
}
