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

// Import layout components
import { ModuleSwitcher } from "./admin-module-switcher";
import { ModuleWorkspaceHeader } from "./admin-module-workspace-header";
import { DriveKPICards, EcosystemKPICards } from "./admin-kpi-cards";
import { OperationsMap } from "./admin-operations-map";
import { ServicePerformance } from "./admin-service-performance";
import { RevenueTrend } from "./admin-revenue-trend";
import { DriverStatus } from "./admin-driver-status";
import { ActivityPanel } from "./admin-activity-panel";
import { AlertsPanel } from "./admin-alerts-panel";
import { QuickActions } from "./admin-quick-actions";
import { EcosystemHealth } from "./admin-ecosystem-health";
import { EcosystemSummary } from "./admin-ecosystem-summary";
import { PlannedModules } from "./admin-planned-modules";

type Tab = "overview" | "orders" | "applications" | "products" | "payments" | "users" | "deliveries" | "rides" | "payouts" | "audit";

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
  userRoles?: string[];
  userActorType?: string;
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
  userRoles = ["admin"],
  userActorType = "ADMIN",
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
  const { t } = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  // Extract selected module from path or query string
  const getCurrentModule = () => {
    if (!pathname) return "drive"; // Default to NaijaDrive as per reference design
    const match = pathname.match(/[?&]module=([a-z]+)/);
    return match ? match[1] : "drive";
  };

  const currentModule = getCurrentModule();

  useEffect(() => {
    // Sync query string changes
  }, [pathname]);

  // Format real data for KPI cards
  const kpiData = {
    totalTrips: ridesData.length > 0 ? ridesData.length : overviewState.data?.orders ?? 0,
    activeDrivers: overviewState.data?.vendors ?? 0,
    registeredRiders: overviewState.data?.users ?? 0,
    grossRevenue: koboToNaira(overviewState.data?.grossVerifiedKobo ?? 0),
    platformCommission: koboToNaira(Math.round((Number(overviewState.data?.grossVerifiedKobo ?? 0)) * 0.2)),
    avgPickupTime: 3.8,
  };

  // Format real active trips
  const activeTripsList = ridesData.map((ride) => ({
    id: ride.id,
    rideNumber: ride.rideNumber,
    pickupLabel: ride.pickupLabel,
    dropoffLabel: ride.dropoffLabel,
    status: ride.status,
    vehicleClass: ride.vehicleClass,
    fareKobo: Number(ride.fareKobo),
    currency: ride.currency,
    driverName: ride.driver?.user?.name || "Assigning...",
    riderName: ride.rider?.name || "Rider",
  }));

  return (
    <div className="space-y-6">
      {/* Top Horizontal Module Switcher */}
      <ModuleSwitcher userRoles={userRoles} userActorType={userActorType} />

      {/* Selected Module Workspace Header & Sub-Nav Tabs */}
      <ModuleWorkspaceHeader moduleId={currentModule} userRoles={userRoles} />

      {/* Workspace Status Alerts / Notices */}
      {notice && (
        <div role="status" className="rounded-xl bg-[#00E676]/10 border border-[#00E676]/30 p-4 text-sm font-bold text-[#00E676]">
          {notice}
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-xl border border-crimson/30 bg-crimson/10 p-4 text-sm font-bold text-crimson">
          {error}
        </div>
      )}

      {/* Main Grid Layout matching Reference Design */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left / Center Main Content Area (8 or 9 cols on large desktop) */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-6">
          {/* KPI Cards Row */}
          {currentModule === "drive" ? (
            <DriveKPICards data={kpiData} loading={overviewState.loading} />
          ) : (
            <EcosystemKPICards data={kpiData} loading={overviewState.loading} />
          )}

          {/* Operations Map & Active Trips Split */}
          <OperationsMap
            activeTrips={activeTripsList}
            loading={overviewState.loading}
            onViewAllTrips={() => router.push(`/admin?module=${currentModule}&tab=trips`)}
          />

          {/* Service Performance Table */}
          <ServicePerformance loading={overviewState.loading} />

          {/* Revenue Trend Chart */}
          <RevenueTrend loading={overviewState.loading} />

          {/* Driver Status Donut & Breakdown */}
          <DriverStatus loading={overviewState.loading} />

          {/* Quick Actions Grid */}
          <QuickActions userRoles={userRoles} userActorType={userActorType} />

          {/* Activity & System Alerts Grid */}
          <div className="grid gap-6 sm:grid-cols-2">
            <ActivityPanel loading={overviewState.loading} />
            <AlertsPanel loading={overviewState.loading} />
          </div>
        </div>

        {/* Right Status Column (3 or 4 cols on large desktop) */}
        <div className="lg:col-span-4 xl:col-span-3 space-y-6">
          {/* Ecosystem Health */}
          <EcosystemHealth loading={overviewState.loading} />

          {/* Ecosystem Summary */}
          <EcosystemSummary
            data={{
              totalUsers: overviewState.data?.users,
              totalOrdersTrips: overviewState.data?.orders,
              totalRevenue: koboToNaira(overviewState.data?.grossVerifiedKobo ?? 0),
              platformEarnings: koboToNaira(Math.round((Number(overviewState.data?.grossVerifiedKobo ?? 0)) * 0.2)),
            }}
            loading={overviewState.loading}
          />

          {/* Planned Modules Roadmap */}
          <PlannedModules userRoles={userRoles} userActorType={userActorType} />
        </div>
      </div>
    </div>
  );
}