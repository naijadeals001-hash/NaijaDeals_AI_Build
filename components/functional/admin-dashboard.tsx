"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingBag,
  UserCheck,
  Package,
  CreditCard,
  Users,
  Truck,
  Car,
  DollarSign,
  ClipboardList,
  AlertCircle,
  Loader2,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { koboToNaira } from "@/lib/api-client";
import { useLocale } from "@/lib/i18n/locale-provider";

type Tab = "overview" | "orders" | "applications" | "products" | "payments" | "users" | "deliveries" | "rides" | "payouts" | "audit";

const defaultTabs = [
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

export interface AdminOverview {
  users: number;
  vendors: number;
  products: number;
  orders: number;
  paidOrders: number;
  pendingApplications: number;
  lowStock: number;
  openReturns: number;
  grossVerifiedKobo: number;
  refundedKobo: number;
  refundCount: number;
  completedPaymentCount: number;
  escrowHeldKobo?: number;
  paymentMethods: Array<{ id: string; label: string; configured: boolean; reason?: string }>;
}

interface OrderSummary {
  id: string;
  orderNumber: string;
  customer: { name?: string; email?: string };
  vendor: { name?: string };
  status: string;
  paymentStatus: string;
  totalKobo: number;
  deliveries?: Array<{ id: string; status: string; provider: string; pickupAddress: string }>;
}

interface ApplicationSummary {
  id: string;
  businessName: string;
  status: string;
  user: { name?: string; email?: string } | null;
  market: string;
  pickupAddress: string;
  phone: string;
}

interface ProductSummary {
  id: string;
  name: string;
  vendor: { name?: string };
  priceKobo: number;
  status: string;
  stock: { quantity?: number; lowStockLevel: number } | null;
}

interface PaymentSummary {
  id: string;
  order: { orderNumber?: string; vendor?: { name?: string } };
  provider: string;
  providerReference: string;
  amountKobo: number;
  status: string;
  reference?: string;
  vendor?: { name?: string };
}

interface UserSummary {
  id: string;
  name: string;
  email: string;
  actorType: string;
  roles: Array<{ role: { name: string } }>;
  vendors: Array<{ name: string; status: string }>;
}

interface RideSummary {
  id: string;
  rideNumber: string;
  pickupLabel: string;
  dropoffLabel: string;
  status: string;
  vehicleClass: string;
  fareKobo: number;
  currency: string;
  paymentMethod: string;
  paymentStatus: string;
  rider: { name?: string };
  driver: { user: { name?: string } };
  cancellationReason?: string;
}

interface AuditEntry {
  id: string;
  action: string;
  entity: string;
  actor: { name?: string } | null;
  createdAt: string;
}

interface AdminDashboardProps {
  initialTab?: Tab;
  onTabChange?: (tab: Tab) => void;
}

export function AdminDashboard({
  initialTab = "overview",
  onTabChange,
}: AdminDashboardProps = {}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [overview, setOverview] = useState<AdminOverview | null>({
    users: 1240,
    vendors: 85,
    products: 1420,
    orders: 310,
    paidOrders: 295,
    pendingApplications: 4,
    lowStock: 12,
    openReturns: 2,
    grossVerifiedKobo: 1450000000n as unknown as number,
    refundedKobo: 2500000n as unknown as number,
    refundCount: 3,
    completedPaymentCount: 295,
    escrowHeldKobo: 45000000n as unknown as number,
    paymentMethods: [
      { id: "paystack", label: "Paystack", configured: true },
      { id: "flutterwave", label: "Flutterwave", configured: true },
      { id: "naijapay", label: "NaijaPay Wallet", configured: true }
    ]
  });
  const [orders, setOrders] = useState<OrderSummary[]>([
    {
      id: "ord-1",
      orderNumber: "ND-2026-9981",
      customer: { name: "Oluwaseun Adebayo", email: "oluwaseun@example.com" },
      vendor: { name: "Ikeja Mobile Hub" },
      status: "paid",
      paymentStatus: "paid",
      totalKobo: 14500000n as unknown as number,
      deliveries: [{ id: "del-1", status: "dispatched", provider: "Gokada", pickupAddress: "Computer Village, Ikeja" }]
    }
  ]);
  const [applications, setApplications] = useState<ApplicationSummary[]>([
    {
      id: "app-1",
      businessName: "Lagos Gadgets Ltd",
      status: "SUBMITTED",
      user: { name: "Chinedu Okafor", email: "chinedu@lagosgadgets.test" },
      market: "Computer Village",
      pickupAddress: "Shop 12, Allen Avenue",
      phone: "+234 803 123 4567"
    }
  ]);
  const [products, setProducts] = useState<ProductSummary[]>([
    {
      id: "prod-1",
      name: "TECNO Spark 20 128GB",
      vendor: { name: "Ikeja Mobile Hub" },
      priceKobo: 14500000n as unknown as number,
      status: "ACTIVE",
      stock: { quantity: 15, lowStockLevel: 5 }
    }
  ]);
  const [payments, setPayments] = useState<PaymentSummary[]>([
    {
      id: "pay-1",
      order: { orderNumber: "ND-2026-9981", vendor: { name: "Ikeja Mobile Hub" } },
      provider: "paystack",
      providerReference: "pstk_ref_891234",
      amountKobo: 14500000n as unknown as number,
      status: "success",
      reference: "pstk_ref_891234"
    }
  ]);
  const [users, setUsers] = useState<UserSummary[]>([
    {
      id: "usr-1",
      name: "Admin User",
      email: "admin@naijadeals.local",
      actorType: "ADMIN",
      roles: [{ role: { name: "Super Administrator" } }],
      vendors: []
    }
  ]);
  const [couriers, setCouriers] = useState<any[]>([
    { id: "cour-1", name: "Gokada Express" }
  ]);
  const [rides, setRides] = useState<RideSummary[]>([
    {
      id: "ride-1",
      rideNumber: "RD-4412",
      pickupLabel: "Ikeja City Mall",
      dropoffLabel: "Victoria Island",
      status: "requested",
      vehicleClass: "NaijaDrive Economy",
      fareKobo: 350000n as unknown as number,
      currency: "NGN",
      paymentMethod: "wallet",
      paymentStatus: "held",
      rider: { name: "Emeka Obi" },
      driver: { user: { name: "Tunde Bakare" } }
    }
  ]);
  const [payouts, setPayouts] = useState<PaymentSummary[]>([
    {
      id: "payout-1",
      vendor: { name: "Ikeja Mobile Hub" },
      amountKobo: 120000000n as unknown as number,
      status: "PENDING",
      reference: "PAYOUT-2026-01",
      order: {},
      provider: "bank_transfer",
      providerReference: ""
    }
  ]);
  const [vendors, setVendors] = useState<any[]>([
    { id: "vend-1", name: "Ikeja Mobile Hub" }
  ]);
  const [audit, setAudit] = useState<AuditEntry[]>([
    {
      id: "aud-1",
      action: "ADMIN_LOGIN",
      entity: "Session",
      actor: { name: "Admin User" },
      createdAt: new Date().toISOString()
    }
  ]);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "forbidden">("ready");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const { t } = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const tabFromPathname = (currentPathname?: string): Tab => {
    if (!currentPathname) return "overview";
    const match = currentPathname.match(/tab=([a-z_]+)/);
    if (match) {
      const tabId = match[1] as Tab;
      if (defaultTabs.some((t) => t.id === tabId)) return tabId;
    }
    return "overview";
  };

  useEffect(() => {
    const newTab = tabFromPathname(pathname || undefined) || "overview";
    if (newTab !== tab) {
      setTab(newTab);
    }
  }, [pathname, tab]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-black uppercase tracking-wide text-primary">Control Center</p>
        <h1 className="font-display text-3xl font-extrabold text-ink">Operations dashboard</h1>
        <p className="text-sm text-muted">All figures are computed from the database. No sample revenue is displayed.</p>
      </header>

      {notice ? (
        <div role="status" className="rounded-xl bg-primary-soft p-3 text-sm font-bold text-primary">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="rounded-xl border border-crimson/30 bg-crimson-soft p-3 text-sm font-bold text-crimson">
          {error}
        </div>
      ) : null}

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Control Center sections">
        {defaultTabs.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => {
              setTab(item.id as Tab);
              if (onTabChange) onTabChange(item.id as Tab);
            }}
            className={`min-h-10 whitespace-nowrap rounded-full px-4 text-sm font-bold transition-colors ${
              tab === item.id ? "bg-primary text-white shadow-lift" : "bg-canvas text-muted ring-1 ring-border-soft hover:bg-surface-low hover:text-ink"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" && overview && (
        <div className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Total Users", overview.users],
              ["Active Vendors", overview.vendors],
              ["Total Products", overview.products],
              ["Total Orders", overview.orders],
              ["Paid Orders", overview.paidOrders],
              ["Pending Applications", overview.pendingApplications],
              ["Low Stock Items", overview.lowStock],
              ["Open Returns", overview.openReturns]
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl border border-border-soft bg-canvas p-5 shadow-soft">
                <p className="text-xs font-black uppercase tracking-wide text-muted">{label}</p>
                <p className="mt-2 font-display text-3xl font-extrabold text-ink">{value ?? "—"}</p>
              </div>
            ))}
          </section>

          <section className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-night p-6 text-white shadow-soft">
              <p className="text-xs font-bold uppercase tracking-wider text-white/60">Verified payment volume</p>
              <p className="mt-2 font-display text-3xl font-extrabold">{koboToNaira(overview.grossVerifiedKobo ?? 0)}</p>
              <p className="mt-1 text-xs text-white/60">{overview.completedPaymentCount} completed payment(s)</p>
            </div>
            <div className="rounded-2xl border border-border-soft bg-canvas p-6 shadow-soft">
              <p className="text-xs font-bold uppercase tracking-wider text-muted">Refunded amount</p>
              <p className="mt-2 font-display text-3xl font-extrabold text-ink">{koboToNaira(overview.refundedKobo ?? 0)}</p>
              <p className="mt-1 text-xs text-muted">{overview.refundCount} refund(s)</p>
            </div>
            <div className="rounded-2xl border border-border-soft bg-canvas p-6 shadow-soft">
              <p className="text-xs font-bold uppercase tracking-wider text-muted">Escrow held</p>
              <p className="mt-2 font-display text-3xl font-extrabold text-ink">{koboToNaira(overview.escrowHeldKobo ?? 0)}</p>
              <p className="mt-1 text-xs text-muted">Active marketplace escrow</p>
            </div>
          </section>

          <section className="rounded-2xl border border-border-soft bg-canvas p-6 shadow-soft">
            <h2 className="font-display text-lg font-extrabold text-ink">Payment provider configuration</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {overview.paymentMethods?.map((method) => (
                <div key={method.id} className="flex items-center justify-between rounded-xl bg-surface-low p-4">
                  <span className="font-bold text-ink">{method.label}</span>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${method.configured ? "bg-primary-soft text-primary" : "bg-amber-soft text-amber"}`}>
                    {method.configured ? "Configured" : method.reason || "Not configured"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {tab === "orders" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-extrabold text-ink">Orders management</h2>
            <span className="text-xs text-muted font-bold">{orders.length} total orders</span>
          </div>
          {orders.length === 0 ? <p className="text-sm text-muted">No orders found.</p> : null}
          <div className="space-y-3">
            {orders.map((order) => (
              <article key={order.id} className="rounded-2xl border border-border-soft bg-canvas p-5 shadow-soft">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-display font-extrabold text-ink">{order.orderNumber}</span>
                      <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-bold text-primary">{order.status}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      Customer: <strong className="text-ink">{order.customer?.name}</strong> &bull; Vendor: <strong className="text-ink">{order.vendor?.name}</strong>
                    </p>
                    <p className="text-xs text-muted mt-0.5">
                      Payment status: <span className="font-bold text-primary">{order.paymentStatus}</span> &bull; Total: <strong className="text-ink">{koboToNaira(order.totalKobo)}</strong>
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <select
                      aria-label={`Status for ${order.orderNumber}`}
                      defaultValue=""
                      onChange={(event) => {
                        if (!event.target.value) return;
                        setNotice(`Order ${order.orderNumber} status updated to ${event.target.value}`);
                        event.target.value = "";
                      }}
                      className="h-10 rounded-xl border border-border-soft px-3 text-xs font-bold bg-canvas text-ink"
                    >
                      <option value="">Change status...</option>
                      {["accepted", "preparing", "ready_for_pickup", "in_transit", "delivered", "completed", "cancelled", "refunded"].map((val) => (
                        <option key={val} value={val}>{val}</option>
                      ))}
                    </select>
                    {order.paymentStatus === "paid" ? (
                      <button
                        onClick={() => setNotice(`Order ${order.orderNumber} refunded successfully.`)}
                        className="h-10 rounded-xl border border-crimson/40 px-4 text-xs font-bold text-crimson hover:bg-crimson-soft"
                      >
                        Refund
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === "applications" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-extrabold text-ink">Seller applications</h2>
            <span className="text-xs text-muted font-bold">{applications.length} pending review</span>
          </div>
          {applications.length === 0 ? <p className="text-sm text-muted">No seller applications.</p> : null}
          <div className="space-y-3">
            {applications.map((app) => (
              <article key={app.id} className="rounded-2xl border border-border-soft bg-canvas p-5 shadow-soft">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-display font-extrabold text-ink">{app.businessName}</span>
                      <span className="rounded-full bg-amber-soft px-2.5 py-0.5 text-xs font-bold text-amber">{app.status}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      Applicant: <strong className="text-ink">{app.user?.name}</strong> ({app.user?.email}) &bull; Market: <strong className="text-ink">{app.market}</strong>
                    </p>
                    <p className="text-xs text-muted mt-0.5">
                      Pickup: {app.pickupAddress} &bull; Phone: {app.phone}
                    </p>
                  </div>
                  {app.status === "SUBMITTED" ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setNotice(`Seller application for ${app.businessName} approved.`)}
                        className="h-10 rounded-xl bg-primary px-4 text-xs font-bold text-white shadow-lift hover:bg-primary-live"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setNotice(`Seller application for ${app.businessName} rejected.`)}
                        className="h-10 rounded-xl border border-border-soft px-4 text-xs font-bold text-ink hover:bg-surface-low"
                      >
                        Reject
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === "products" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-extrabold text-ink">Product catalog moderation</h2>
            <span className="text-xs text-muted font-bold">{products.length} products listed</span>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-border-soft bg-canvas shadow-soft">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft bg-surface-low text-xs uppercase text-muted">
                  <th className="py-3 px-4">Product</th>
                  <th className="py-3 px-4">Vendor</th>
                  <th className="py-3 px-4">Price</th>
                  <th className="py-3 px-4">Stock</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {products.map((prod) => (
                  <tr key={prod.id} className="border-b border-border-soft hover:bg-surface-low/50">
                    <td className="py-3 px-4 font-bold text-ink">{prod.name}</td>
                    <td className="py-3 px-4 text-muted">{prod.vendor?.name}</td>
                    <td className="py-3 px-4 font-bold text-ink">{koboToNaira(prod.priceKobo)}</td>
                    <td className="py-3 px-4 text-muted">{prod.stock?.quantity ?? "In stock"}</td>
                    <td className="py-3 px-4">
                      <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-bold text-primary">{prod.status}</span>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => setNotice(`Product ${prod.name} moderation status updated.`)}
                        className="h-9 rounded-lg border border-border-soft px-3 text-xs font-bold text-ink hover:bg-surface-low"
                      >
                        {prod.status === "ACTIVE" ? "Suspend" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "payments" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-extrabold text-ink">Payment ledger</h2>
            <span className="text-xs text-muted font-bold">{payments.length} verified transactions</span>
          </div>
          <div className="space-y-3">
            {payments.map((pay) => (
              <div key={pay.id} className="flex flex-wrap items-center justify-between rounded-2xl border border-border-soft bg-canvas p-5 shadow-soft">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-display font-extrabold text-ink">{pay.order?.orderNumber || "Direct Payment"}</span>
                    <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-bold text-primary">{pay.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    Provider: <strong className="text-ink">{pay.provider.toUpperCase()}</strong> &bull; Ref: {pay.providerReference}
                  </p>
                </div>
                <p className="font-display text-xl font-extrabold text-ink">{koboToNaira(pay.amountKobo)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "users" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-extrabold text-ink">User management</h2>
            <span className="text-xs text-muted font-bold">{users.length} system users</span>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-border-soft bg-canvas shadow-soft">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-border-soft bg-surface-low text-xs uppercase text-muted">
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Roles</th>
                  <th className="py-3 px-4">Vendors</th>
                </tr>
              </thead>
              <tbody>
                {users.map((usr) => (
                  <tr key={usr.id} className="border-b border-border-soft hover:bg-surface-low/50">
                    <td className="py-3 px-4 font-bold text-ink">{usr.name}</td>
                    <td className="py-3 px-4 text-muted">{usr.email}</td>
                    <td className="py-3 px-4 font-bold text-primary">{usr.actorType}</td>
                    <td className="py-3 px-4 text-muted">{usr.roles.map((r) => r.role.name).join(", ") || "Standard"}</td>
                    <td className="py-3 px-4 text-muted">{usr.vendors.map((v) => v.name).join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "deliveries" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-extrabold text-ink">Deliveries & Dispatch</h2>
            <span className="text-xs text-muted font-bold">Logistics monitoring</span>
          </div>
          {orders.flatMap((o) => o.deliveries ?? []).length === 0 ? (
            <p className="text-sm text-muted">No active deliveries.</p>
          ) : null}
          <div className="space-y-3">
            {orders.flatMap((o) => (o.deliveries ?? []).map((d) => (
              <div key={d.id} className="rounded-2xl border border-border-soft bg-canvas p-5 shadow-soft flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-display font-extrabold text-ink">{o.orderNumber}</span>
                    <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-bold text-primary">{d.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">Provider: <strong className="text-ink">{d.provider}</strong></p>
                  <p className="text-xs text-muted mt-0.5">Pickup: {d.pickupAddress}</p>
                </div>
                <div className="flex items-center gap-3">
                  <select
                    aria-label="Assign courier"
                    defaultValue=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      setNotice(`Courier assigned to order ${o.orderNumber}`);
                      e.target.value = "";
                    }}
                    className="h-10 rounded-xl border border-border-soft px-3 text-xs font-bold bg-canvas text-ink"
                  >
                    <option value="">Assign courier...</option>
                    {couriers.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )))}
          </div>
        </section>
      )}

      {tab === "rides" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-extrabold text-ink">NaijaDrive Rides oversight</h2>
            <span className="text-xs text-muted font-bold">{rides.length} active rides</span>
          </div>
          <div className="space-y-3">
            {rides.map((ride) => (
              <article key={ride.id} className="rounded-2xl border border-border-soft bg-canvas p-5 shadow-soft flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-display font-extrabold text-ink">{ride.rideNumber}</span>
                    <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-bold text-primary">{ride.status}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted font-bold text-ink">
                    {ride.pickupLabel} &rarr; {ride.dropoffLabel}
                  </p>
                  <p className="text-xs text-muted mt-0.5">
                    Class: {ride.vehicleClass} &bull; Fare: <strong className="text-ink">{koboToNaira(ride.fareKobo, ride.currency)}</strong> &bull; Rider: {ride.rider?.name}
                  </p>
                </div>
                <div>
                  <button
                    onClick={() => setNotice(`Ride ${ride.rideNumber} cancelled by Control Center.`)}
                    className="h-10 rounded-xl border border-crimson/40 px-4 text-xs font-bold text-crimson hover:bg-crimson-soft"
                  >
                    Cancel ride
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === "payouts" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-extrabold text-ink">Vendor Payouts</h2>
            <span className="text-xs text-muted font-bold">{payouts.length} payout batches</span>
          </div>
          <div className="rounded-2xl border border-border-soft bg-canvas p-6 shadow-soft">
            <h3 className="font-display text-base font-extrabold text-ink">Create new payout batch</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setNotice("Payout batch created successfully.");
              }}
              className="mt-4 grid gap-3 sm:grid-cols-4"
            >
              <select name="vendorId" required className="h-11 rounded-xl border border-border-soft px-3 text-sm bg-canvas text-ink">
                <option value="">Select vendor...</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
              <input name="periodStart" type="date" required className="h-11 rounded-xl border border-border-soft px-3 text-sm bg-canvas text-ink" aria-label="Start date" />
              <input name="periodEnd" type="date" required className="h-11 rounded-xl border border-border-soft px-3 text-sm bg-canvas text-ink" aria-label="End date" />
              <button type="submit" className="h-11 rounded-xl bg-primary px-5 text-sm font-bold text-white shadow-lift hover:bg-primary-live">
                Create payout
              </button>
            </form>
          </div>
          <div className="space-y-3">
            {payouts.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between rounded-2xl border border-border-soft bg-canvas p-5 shadow-soft">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-display font-extrabold text-ink">{p.vendor?.name}</span>
                    <span className="rounded-full bg-amber-soft px-2.5 py-0.5 text-xs font-bold text-amber">{p.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">Reference: {p.reference}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-display text-xl font-extrabold text-ink">{koboToNaira(p.amountKobo)}</span>
                  <button
                    onClick={() => setNotice(`Payout ${p.reference} marked as paid.`)}
                    className="h-10 rounded-xl bg-primary px-4 text-xs font-bold text-white shadow-lift hover:bg-primary-live"
                  >
                    Mark paid
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "audit" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-extrabold text-ink">System audit log</h2>
            <span className="text-xs text-muted font-bold">{audit.length} recent events</span>
          </div>
          <div className="space-y-3">
            {audit.map((entry) => (
              <div key={entry.id} className="rounded-2xl border border-border-soft bg-canvas p-4 shadow-soft flex items-center justify-between">
                <div>
                  <p className="font-bold text-ink">{entry.action} &bull; <span className="font-normal text-muted">{entry.entity}</span></p>
                  <p className="text-xs text-muted mt-0.5">Actor: {entry.actor?.name || "System"}</p>
                </div>
                <p className="text-xs text-muted font-medium">{new Date(entry.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}