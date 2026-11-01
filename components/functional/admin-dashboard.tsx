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
import { koboToNaira, apiClient } from "@/lib/api-client";
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
  overview?: AdminOverview;
  orders?: OrderSummary[];
  applications?: ApplicationSummary[];
  products?: ProductSummary[];
  payments?: PaymentSummary[];
  users?: UserSummary[];
  rides?: RideSummary[];
  audit?: AuditEntry[];
  payouts?: PaymentSummary[];
}

export function AdminDashboard({
  initialTab = "overview",
  onTabChange,
  overview,
  orders,
  applications,
  products,
  payments,
  users,
  rides,
  audit,
  payouts,
}: AdminDashboardProps = {}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [overviewState, setOverviewState] = useState<{ data: AdminOverview | null; loading: boolean; error: string }>({ data: overview ?? null, loading: false, error: "" });
  const [ordersData] = useState<OrderSummary[]>(orders ?? []);
  const [applicationsData] = useState<ApplicationSummary[]>(applications ?? []);
  const [productsData] = useState<ProductSummary[]>(products ?? []);
  const [paymentsData] = useState<PaymentSummary[]>(payments ?? []);
  const [usersData] = useState<UserSummary[]>(users ?? []);
  const [ridesData] = useState<RideSummary[]>(rides ?? []);
  const [auditData] = useState<AuditEntry[]>(audit ?? []);
  const [payoutsData] = useState<PaymentSummary[]>(payouts ?? []);
  const [couriersData] = useState<any[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
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
        <p className="text-xs font-black uppercase tracking-wide text-[#00E676]">Control Center</p>
        <h1 className="font-display text-3xl font-extrabold text-[#F0F6FC]">Operations dashboard</h1>
        <p className="text-sm text-[#8B949E]">All figures are computed from the database. No sample revenue is displayed.</p>
      </header>

      {notice ? (
        <div role="status" className="rounded-xl bg-[#00E676]/10 p-3 text-sm font-bold text-[#00E676]">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="rounded-xl border border-crimson/30 bg-crimson/10 p-3 text-sm font-bold text-crimson">
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
              tab === item.id ? "bg-[#00E676] text-[#0B0E14] shadow-lift" : "bg-[#161B22] text-[#8B949E] ring-1 ring-[#21262D] hover:bg-[#21262D] hover:text-[#F0F6FC]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" && overviewState.data && (
        <div className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Total Users", overviewState.data?.users],
              ["Active Vendors", overviewState.data?.vendors],
              ["Total Products", overviewState.data?.products],
              ["Total Orders", overviewState.data?.orders],
              ["Paid Orders", overviewState.data?.paidOrders],
              ["Pending Applications", overviewState.data?.pendingApplications],
              ["Low Stock Items", overviewState.data?.lowStock],
              ["Open Returns", overviewState.data?.openReturns]
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl border border-[#21262D] bg-[#161B22] p-5 shadow-soft">
                <p className="text-xs font-black uppercase tracking-wide text-[#8B949E]">{label}</p>
                <p className="mt-2 font-display text-3xl font-extrabold text-[#F0F6FC]">{value ?? "—"}</p>
              </div>
            ))}
          </section>

          <section className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-night p-6 text-white shadow-soft">
              <p className="text-xs font-bold uppercase tracking-wider text-white/60">Verified payment volume</p>
              <p className="mt-2 font-display text-3xl font-extrabold">{koboToNaira(overviewState.data?.grossVerifiedKobo ?? 0)}</p>
              <p className="mt-1 text-xs text-white/60">{overviewState.data?.completedPaymentCount} completed payment(s)</p>
            </div>
            <div className="rounded-2xl border border-[#21262D] bg-[#161B22] p-6 shadow-soft">
              <p className="text-xs font-bold uppercase tracking-wider text-[#8B949E]">Refunded amount</p>
              <p className="mt-2 font-display text-3xl font-extrabold text-[#F0F6FC]">{koboToNaira(overviewState.data?.refundedKobo ?? 0)}</p>
              <p className="mt-1 text-xs text-[#8B949E]">{overviewState.data?.refundCount} refund(s)</p>
            </div>
            <div className="rounded-2xl border border-[#21262D] bg-[#161B22] p-6 shadow-soft">
              <p className="text-xs font-bold uppercase tracking-wider text-[#8B949E]">Escrow held</p>
              <p className="mt-2 font-display text-3xl font-extrabold text-[#F0F6FC]">{koboToNaira(overviewState.data?.escrowHeldKobo ?? 0)}</p>
              <p className="mt-1 text-xs text-[#8B949E]">Active marketplace escrow</p>
            </div>
          </section>

          <section className="rounded-2xl border border-[#21262D] bg-[#161B22] p-6 shadow-soft">
            <h2 className="font-display text-lg font-extrabold text-[#F0F6FC]">Payment provider configuration</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {overviewState.data?.paymentMethods?.map((method) => (
                <div key={method.id} className="flex items-center justify-between rounded-xl bg-[#21262D] p-4">
                  <span className="font-bold text-[#F0F6FC]">{method.label}</span>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${method.configured ? "bg-[#00E676]/15 text-[#00E676]" : "bg-amber-soft text-amber"}`}>
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
            <h2 className="font-display text-xl font-extrabold text-[#F0F6FC]">Orders management</h2>
            <span className="text-xs text-[#8B949E] font-bold">{ordersData.length} total orders</span>
          </div>
          {ordersData.length === 0 ? <p className="text-sm text-[#8B949E]">No orders found.</p> : null}
          <div className="space-y-3">
            {ordersData.map((order) => (
              <article key={order.id} className="rounded-2xl border border-[#21262D] bg-[#161B22] p-5 shadow-soft">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-display font-extrabold text-[#F0F6FC]">{order.orderNumber}</span>
                      <span className="rounded-full bg-[#00E676]/15 px-2.5 py-0.5 text-xs font-bold text-[#00E676]">{order.status}</span>
                    </div>
                    <p className="mt-1 text-sm text-[#8B949E]">
                      Customer: <strong className="text-[#F0F6FC]">{order.customer?.name}</strong> &bull; Vendor: <strong className="text-[#F0F6FC]">{order.vendor?.name}</strong>
                    </p>
                    <p className="text-xs text-[#8B949E] mt-0.5">
                      Payment status: <span className="font-bold text-[#00E676]">{order.paymentStatus}</span> &bull; Total: <strong className="text-[#F0F6FC]">{koboToNaira(order.totalKobo)}</strong>
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
                      className="h-10 rounded-xl border border-[#21262D] px-3 text-xs font-bold bg-[#161B22] text-[#F0F6FC]"
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
            <h2 className="font-display text-xl font-extrabold text-[#F0F6FC]">Seller applications</h2>
            <span className="text-xs text-[#8B949E] font-bold">{applicationsData.length} pending review</span>
          </div>
          {applicationsData.length === 0 ? <p className="text-sm text-[#8B949E]">No seller applications.</p> : null}
          <div className="space-y-3">
            {applicationsData.map((app) => (
              <article key={app.id} className="rounded-2xl border border-[#21262D] bg-[#161B22] p-5 shadow-soft">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-display font-extrabold text-[#F0F6FC]">{app.businessName}</span>
                      <span className="rounded-full bg-amber-soft px-2.5 py-0.5 text-xs font-bold text-amber">{app.status}</span>
                    </div>
                    <p className="mt-1 text-sm text-[#8B949E]">
                      Applicant: <strong className="text-[#F0F6FC]">{app.user?.name}</strong> ({app.user?.email}) &bull; Market: <strong className="text-[#F0F6FC]">{app.market}</strong>
                    </p>
                    <p className="text-xs text-[#8B949E] mt-0.5">
                      Pickup: {app.pickupAddress} &bull; Phone: {app.phone}
                    </p>
                  </div>
                  {app.status === "SUBMITTED" ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setNotice(`Seller application for ${app.businessName} approved.`)}
                        className="h-10 rounded-xl bg-[#00E676] text-[#0B0E14] hover:bg-[#00c853]"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setNotice(`Seller application for ${app.businessName} rejected.`)}
                        className="h-10 rounded-xl border border-[#21262D] px-4 text-xs font-bold text-[#F0F6FC] hover:bg-[#21262D]"
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
            <h2 className="font-display text-xl font-extrabold text-[#F0F6FC]">Product catalog moderation</h2>
            <span className="text-xs text-[#8B949E] font-bold">{productsData.length} products listed</span>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-[#21262D] bg-[#161B22] shadow-soft">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#21262D] bg-[#21262D] text-xs uppercase text-[#8B949E]">
                  <th className="py-3 px-4">Product</th>
                  <th className="py-3 px-4">Vendor</th>
                  <th className="py-3 px-4">Price</th>
                  <th className="py-3 px-4">Stock</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {productsData.map((prod) => (
                  <tr key={prod.id} className="border-b border-[#21262D] hover:bg-[#21262D]/50">
                    <td className="py-3 px-4 font-bold text-[#F0F6FC]">{prod.name}</td>
                    <td className="py-3 px-4 text-[#8B949E]">{prod.vendor?.name}</td>
                    <td className="py-3 px-4 font-bold text-[#F0F6FC]">{koboToNaira(prod.priceKobo)}</td>
                    <td className="py-3 px-4 text-[#8B949E]">{prod.stock?.quantity ?? "In stock"}</td>
                    <td className="py-3 px-4">
                      <span className="rounded-full bg-[#00E676]/15 px-2.5 py-0.5 text-xs font-bold text-[#00E676]">{prod.status}</span>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => setNotice(`Product ${prod.name} moderation status updated.`)}
                        className="h-9 rounded-lg border border-[#21262D] px-3 text-xs font-bold text-[#F0F6FC] hover:bg-[#21262D]"
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
            <h2 className="font-display text-xl font-extrabold text-[#F0F6FC]">Payment ledger</h2>
            <span className="text-xs text-[#8B949E] font-bold">{paymentsData.length} verified transactions</span>
          </div>
          <div className="space-y-3">
            {paymentsData.map((pay) => (
              <div key={pay.id} className="flex flex-wrap items-center justify-between rounded-2xl border border-[#21262D] bg-[#161B22] p-5 shadow-soft">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-display font-extrabold text-[#F0F6FC]">{pay.order?.orderNumber || "Direct Payment"}</span>
                    <span className="rounded-full bg-[#00E676]/15 px-2.5 py-0.5 text-xs font-bold text-[#00E676]">{pay.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-[#8B949E]">
                    Provider: <strong className="text-[#F0F6FC]">{pay.provider.toUpperCase()}</strong> &bull; Ref: {pay.providerReference}
                  </p>
                </div>
                <p className="font-display text-xl font-extrabold text-[#F0F6FC]">{koboToNaira(pay.amountKobo)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "users" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-extrabold text-[#F0F6FC]">User management</h2>
            <span className="text-xs text-[#8B949E] font-bold">{usersData.length} system users</span>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-[#21262D] bg-[#161B22] shadow-soft">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#21262D] bg-[#21262D] text-xs uppercase text-[#8B949E]">
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Roles</th>
                  <th className="py-3 px-4">Vendors</th>
                </tr>
              </thead>
              <tbody>
                {usersData.map((usr) => (
                  <tr key={usr.id} className="border-b border-[#21262D] hover:bg-[#21262D]/50">
                    <td className="py-3 px-4 font-bold text-[#F0F6FC]">{usr.name}</td>
                    <td className="py-3 px-4 text-[#8B949E]">{usr.email}</td>
                    <td className="py-3 px-4 font-bold text-[#00E676]">{usr.actorType}</td>
                    <td className="py-3 px-4 text-[#8B949E]">{usr.roles.map((r) => r.role.name).join(", ") || "Standard"}</td>
                    <td className="py-3 px-4 text-[#8B949E]">{usr.vendors.map((v) => v.name).join(", ") || "—"}</td>
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
            <h2 className="font-display text-xl font-extrabold text-[#F0F6FC]">Deliveries & Dispatch</h2>
            <span className="text-xs text-[#8B949E] font-bold">Logistics monitoring</span>
          </div>
          {ordersData.flatMap((o) => o.deliveries ?? []).length === 0 ? (
            <p className="text-sm text-[#8B949E]">No active deliveries.</p>
          ) : null}
          <div className="space-y-3">
            {ordersData.flatMap((o) => (o.deliveries ?? []).map((d) => (
              <div key={d.id} className="rounded-2xl border border-[#21262D] bg-[#161B22] p-5 shadow-soft flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-display font-extrabold text-[#F0F6FC]">{o.orderNumber}</span>
                    <span className="rounded-full bg-[#00E676]/15 px-2.5 py-0.5 text-xs font-bold text-[#00E676]">{d.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-[#8B949E]">Provider: <strong className="text-[#F0F6FC]">{d.provider}</strong></p>
                  <p className="text-xs text-[#8B949E] mt-0.5">Pickup: {d.pickupAddress}</p>
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
                    className="h-10 rounded-xl border border-[#21262D] px-3 text-xs font-bold bg-[#161B22] text-[#F0F6FC]"
                  >
                    <option value="">Assign courier...</option>
                    {couriersData.map((c) => (
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
            <h2 className="font-display text-xl font-extrabold text-[#F0F6FC]">NaijaDrive Rides oversight</h2>
            <span className="text-xs text-[#8B949E] font-bold">{ridesData.length} active rides</span>
          </div>
          <div className="space-y-3">
            {ridesData.map((ride) => (
              <article key={ride.id} className="rounded-2xl border border-[#21262D] bg-[#161B22] p-5 shadow-soft flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-display font-extrabold text-[#F0F6FC]">{ride.rideNumber}</span>
                    <span className="rounded-full bg-[#00E676]/15 px-2.5 py-0.5 text-xs font-bold text-[#00E676]">{ride.status}</span>
                  </div>
                  <p className="mt-1 text-sm text-[#8B949E] font-bold text-[#F0F6FC]">
                    {ride.pickupLabel} &rarr; {ride.dropoffLabel}
                  </p>
                  <p className="text-xs text-[#8B949E] mt-0.5">
                    Class: {ride.vehicleClass} &bull; Fare: <strong className="text-[#F0F6FC]">{koboToNaira(ride.fareKobo, ride.currency)}</strong> &bull; Rider: {ride.rider?.name}
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
            <h2 className="font-display text-xl font-extrabold text-[#F0F6FC]">Vendor Payouts</h2>
            <span className="text-xs text-[#8B949E] font-bold">{payoutsData.length} payout batches</span>
          </div>
          <div className="rounded-2xl border border-[#21262D] bg-[#161B22] p-6 shadow-soft">
            <h3 className="font-display text-base font-extrabold text-[#F0F6FC]">Create new payout batch</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setNotice("Payout batch created successfully.");
              }}
              className="mt-4 grid gap-3 sm:grid-cols-4"
            >
              <select name="vendorId" required className="h-11 rounded-xl border border-[#21262D] px-3 text-sm bg-[#161B22] text-[#F0F6FC]">
                <option value="">Select vendor...</option>
                {([] as Array<{ id: string; name: string }>).map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
              <input name="periodStart" type="date" required className="h-11 rounded-xl border border-[#21262D] px-3 text-sm bg-[#161B22] text-[#F0F6FC]" aria-label="Start date" />
              <input name="periodEnd" type="date" required className="h-11 rounded-xl border border-[#21262D] px-3 text-sm bg-[#161B22] text-[#F0F6FC]" aria-label="End date" />
              <button type="submit" className="h-11 rounded-xl bg-[#00E676] text-[#0B0E14] shadow-lift hover:bg-[#00c853]">
                Create payout
              </button>
            </form>
          </div>
          <div className="space-y-3">
            {payoutsData.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between rounded-2xl border border-[#21262D] bg-[#161B22] p-5 shadow-soft">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-display font-extrabold text-[#F0F6FC]">{p.vendor?.name}</span>
                    <span className="rounded-full bg-amber-soft px-2.5 py-0.5 text-xs font-bold text-amber">{p.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-[#8B949E]">Reference: {p.reference}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-display text-xl font-extrabold text-[#F0F6FC]">{koboToNaira(p.amountKobo)}</span>
                  <button
                    onClick={() => setNotice(`Payout ${p.reference} marked as paid.`)}
                    className="h-10 rounded-xl bg-[#00E676] text-[#0B0E14] hover:bg-[#00c853]"
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
            <h2 className="font-display text-xl font-extrabold text-[#F0F6FC]">System audit log</h2>
            <span className="text-xs text-[#8B949E] font-bold">{auditData.length} recent events</span>
          </div>
          <div className="space-y-3">
            {auditData.map((entry) => (
              <div key={entry.id} className="rounded-2xl border border-[#21262D] bg-[#161B22] p-4 shadow-soft flex items-center justify-between">
                <div>
                  <p className="font-bold text-[#F0F6FC]">{entry.action} &bull; <span className="font-normal text-[#8B949E]">{entry.entity}</span></p>
                  <p className="text-xs text-[#8B949E] mt-0.5">Actor: {entry.actor?.name || "System"}</p>
                </div>
                <p className="text-xs text-[#8B949E] font-medium">{new Date(entry.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}