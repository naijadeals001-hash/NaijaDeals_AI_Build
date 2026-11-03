"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Database, Info } from "lucide-react";
import { koboToNaira } from "@/lib/api-client";
import {
  buildAdminHref,
  isImplementedModule,
  normalizeModule,
  normalizeTab,
  type AdminModule,
  type AdminTab
} from "@/lib/admin/admin-navigation";

import { ModuleSwitcher } from "./admin-module-switcher";
import { ModuleWorkspaceHeader } from "./admin-module-workspace-header";
import { OverviewKpis, type KpiItem } from "./admin-kpi-cards";
import { OperationsMap } from "./admin-operations-map";
import { ServicePerformance } from "./admin-service-performance";
import { RevenueTrend } from "./admin-revenue-trend";
import { DriverStatus } from "./admin-driver-status";
import { ActivityPanel, type ActivityItem } from "./admin-activity-panel";
import { AlertsPanel, type AlertItem } from "./admin-alerts-panel";
import { QuickActions } from "./admin-quick-actions";
import { EcosystemHealth } from "./admin-ecosystem-health";
import { EcosystemSummary } from "./admin-ecosystem-summary";
import { PlannedModules } from "./admin-planned-modules";
import { WorkspaceTabContent, type Row } from "./admin-workspace-tabs";

export interface AdminOverview {
  users: number;
  vendors: number;
  products: number;
  orders: number;
  paidOrders: number;
  pendingApplications: number;
  lowStock: number;
  openReturns: number;
  disputes?: number;
  auditLogs?: number;
  grossVerifiedKobo: string;
  completedPaymentCount: number;
  refundedKobo: string;
  refundCount: number;
  escrowHeldKobo?: string;
  ordersByStatus?: Array<{ status: string; count: number }>;
  paymentMethods: Array<{ id: string; label: string; configured: boolean; reason?: string }>;
}

interface AdminDashboardProps {
  initialTab: AdminTab;
  initialModule: AdminModule;
  overview: AdminOverview | null;
  orders: Row[];
  applications: Row[];
  products: Row[];
  payments: Row[];
  users: Row[];
  rides: Row[];
  audit: Row[];
  payouts: Row[];
  vendors: Row[];
  couriers: Row[];
  loadErrors: string[];
  loadedAt: string;
  userRoles: string[];
  userActorType: string;
  isSuperAdmin: boolean;
}

const ACTIVE_RIDE_STATUSES = ["requested", "driver_assigned", "driver_arriving", "in_progress"];

function numberOf(input: unknown): number {
  const parsed = Number(input ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sumMoney(rows: Row[], field: string): number {
  return rows.reduce((total, row) => total + numberOf(row[field]), 0);
}

function rowCountry(row: Row): string | undefined {
  const candidates = [
    row.countryCode,
    row.scopeCountryCode,
    row.vendor?.countryCode,
    row.customer?.countryCode
  ];
  const match = candidates.find((value) => typeof value === "string" && value.trim().length > 0);
  return match ? String(match).toUpperCase() : undefined;
}

/** Country-level filter for module tables; "ALL" keeps every row. */
function filterRowsByGeo(rows: Row[], geo: string): Row[] {
  if (geo === "ALL") return rows;
  return rows.filter((row) => rowCountry(row) === geo);
}

function daysAgo(count: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - (count - 1));
  return date;
}

export function AdminDashboard(props: AdminDashboardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const moduleId = normalizeModule(searchParams.get("module") ?? props.initialModule);
  const tabId = normalizeTab(searchParams.get("tab") ?? props.initialTab);
  const geo = (searchParams.get("geo") ?? "all").toUpperCase();

  const navigate = useCallback(
    (target: { module?: string; tab?: string; geo?: string }) => {
      router.push(buildAdminHref({ module: target.module ?? moduleId, tab: target.tab ?? tabId, geo: target.geo }));
    },
    [moduleId, router, tabId]
  );

  const refresh = useCallback(() => router.refresh(), [router]);

  const overview = props.overview;
  const rides = filterRowsByGeo(props.rides, geo);
  const orders = filterRowsByGeo(props.orders, geo);
  const payments = filterRowsByGeo(props.payments, geo);
  const users = filterRowsByGeo(props.users, geo);
  const payouts = filterRowsByGeo(props.payouts, geo);
  const products = filterRowsByGeo(props.products, geo);
  const applications = filterRowsByGeo(props.applications, geo);
  const vendors = filterRowsByGeo(props.vendors, geo);
  const couriers = filterRowsByGeo(props.couriers, geo);
  const audit = filterRowsByGeo(props.audit, geo);

  const activeRides = useMemo(() => rides.filter((ride) => ACTIVE_RIDE_STATUSES.includes(String(ride.status))), [rides]);

  const driverUsers = useMemo(
    () =>
      users.filter((user) => {
        const roles = Array.isArray(user.roles) ? user.roles.map((entry: Row) => entry?.role?.name) : [];
        return roles.includes("driver") || user.actorType === "DRIVER";
      }),
    [users]
  );

  const driversOnTrip = useMemo(() => {
    const ids = new Set<string>();
    activeRides.forEach((ride) => {
      const id = ride.driverId ?? ride.driver?.id;
      if (id) ids.add(String(id));
    });
    return ids.size;
  }, [activeRides]);

  const deliveries = useMemo(
    () =>
      orders.flatMap((order) =>
        (Array.isArray(order.deliveries) ? order.deliveries : []).map((delivery: Row) => ({
          ...delivery,
          orderId: order.id,
          orderNumber: order.orderNumber
        }) as Row)
      ),
    [orders]
  );

  const completedOrders = useMemo(
    () => orders.filter((order) => ["delivered", "completed"].includes(String(order.status))).length,
    [orders]
  );
  const cancelledOrders = useMemo(
    () => orders.filter((order) => ["cancelled", "refunded"].includes(String(order.status))).length,
    [orders]
  );
  const completedRides = useMemo(() => rides.filter((ride) => String(ride.status) === "completed").length, [rides]);
  const cancelledRides = useMemo(() => rides.filter((ride) => String(ride.status) === "cancelled").length, [rides]);
  const completedDeliveries = useMemo(() => deliveries.filter((delivery) => String(delivery.status) === "delivered").length, [deliveries]);
  const failedDeliveries = useMemo(
    () => deliveries.filter((delivery) => ["failed", "returned"].includes(String(delivery.status))).length,
    [deliveries]
  );

  const grossVerified = koboToNaira(overview?.grossVerifiedKobo ?? 0);
  const escrowHeld = koboToNaira(overview?.escrowHeldKobo ?? 0);
  const refunded = koboToNaira(overview?.refundedKobo ?? 0);

  const configuredProviders = (overview?.paymentMethods ?? []).filter((method) => method.configured).length;
  const totalProviders = (overview?.paymentMethods ?? []).length;

  const kpis: KpiItem[] = useMemo(() => {
    const base: KpiItem[] = [
      { label: "Users", value: numberOf(overview?.users).toLocaleString(), icon: "users", accent: "blue" },
      { label: "Orders", value: numberOf(overview?.orders).toLocaleString(), icon: "orders", accent: "green" },
      { label: "Paid orders", value: numberOf(overview?.paidOrders).toLocaleString(), icon: "paid", accent: "violet" },
      { label: "Gross verified", value: grossVerified, icon: "money", accent: "amber" },
      { label: "Escrow held", value: escrowHeld, icon: "shield", accent: "orange" },
      { label: "Pending applications", value: numberOf(overview?.pendingApplications).toLocaleString(), icon: "applications", accent: "pink" }
    ];

    if (moduleId === "drive") {
      return [
        { label: "Trips", value: rides.length.toLocaleString(), icon: "orders", accent: "blue" },
        { label: "Active trips", value: activeRides.length.toLocaleString(), icon: "route", accent: "green" },
        { label: "Drivers", value: driverUsers.length.toLocaleString(), icon: "users", accent: "violet" },
        { label: "Completed trips", value: completedRides.toLocaleString(), icon: "paid", accent: "amber" },
        { label: "Gross verified", value: grossVerified, icon: "money", accent: "orange" },
        { label: "Escrow held", value: escrowHeld, icon: "shield", accent: "pink" }
      ];
    }

    if (moduleId === "shop") {
      return [
        { label: "Orders", value: orders.length.toLocaleString(), icon: "orders", accent: "blue" },
        { label: "Completed", value: completedOrders.toLocaleString(), icon: "paid", accent: "green" },
        { label: "Cancelled / refunded", value: cancelledOrders.toLocaleString(), icon: "applications", accent: "violet" },
        { label: "Products", value: numberOf(overview?.products).toLocaleString(), icon: "route", accent: "amber" },
        { label: "Vendors", value: numberOf(overview?.vendors).toLocaleString(), icon: "users", accent: "orange" },
        { label: "Gross verified", value: grossVerified, icon: "money", accent: "pink" }
      ];
    }

    if (moduleId === "send") {
      return [
        { label: "Deliveries", value: deliveries.length.toLocaleString(), icon: "orders", accent: "blue" },
        { label: "Delivered", value: completedDeliveries.toLocaleString(), icon: "paid", accent: "green" },
        { label: "Failed / returned", value: failedDeliveries.toLocaleString(), icon: "applications", accent: "violet" },
        { label: "Couriers", value: props.couriers.length.toLocaleString(), icon: "users", accent: "amber" },
        { label: "Gross verified", value: grossVerified, icon: "money", accent: "orange" },
        { label: "Refunded", value: refunded, icon: "shield", accent: "pink" }
      ];
    }

    if (moduleId === "pay") {
      return [
        { label: "Payments", value: payments.length.toLocaleString(), icon: "orders", accent: "blue" },
        { label: "Gross verified", value: grossVerified, icon: "money", accent: "green" },
        { label: "Refunded", value: refunded, icon: "applications", accent: "violet" },
        { label: "Payouts", value: props.payouts.length.toLocaleString(), icon: "route", accent: "amber" },
        { label: "Escrow held", value: escrowHeld, icon: "shield", accent: "orange" },
        { label: "Providers configured", value: `${configuredProviders}/${totalProviders}`, icon: "users", accent: "pink" }
      ];
    }

    return base;
  }, [
    activeRides.length,
    cancelledOrders,
    completedDeliveries,
    completedOrders,
    completedRides,
    configuredProviders,
    deliveries.length,
    driverUsers.length,
    escrowHeld,
    failedDeliveries,
    grossVerified,
    moduleId,
    orders.length,
    overview?.orders,
    overview?.paidOrders,
    overview?.pendingApplications,
    overview?.products,
    overview?.users,
    overview?.vendors,
    payments.length,
    props.couriers.length,
    props.payouts.length,
    refunded,
    rides.length,
    totalProviders
  ]);

  const revenuePoints = useMemo(() => {
    const start = daysAgo(7);
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      const dayKey = day.toISOString().slice(0, 10);
      const dayPayments = payments.filter((payment) => {
        if (String(payment.status).toUpperCase() !== "COMPLETED") return false;
        const created = payment.createdAt ?? payment.verifiedAt;
        if (!created) return false;
        const parsed = new Date(String(created));
        return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === dayKey;
      });
      return {
        date: dayKey,
        revenueKobo: sumMoney(dayPayments, "amountKobo"),
        transactions: dayPayments.length
      };
    });
  }, [payments]);

  const serviceMetrics = useMemo(() => {
    const paidOrders = orders.filter((order) => String(order.paymentStatus) === "paid");
    const paidRides = rides.filter((ride) => ["paid", "held"].includes(String(ride.paymentStatus)));
    return [
      {
        service: "NaijaShop orders",
        total: orders.length,
        completed: completedOrders,
        cancelled: cancelledOrders,
        revenueKobo: sumMoney(paidOrders, "totalKobo")
      },
      {
        service: "NaijaDrive trips",
        total: rides.length,
        completed: completedRides,
        cancelled: cancelledRides,
        revenueKobo: sumMoney(paidRides, "fareKobo")
      },
      {
        service: "Deliveries",
        total: deliveries.length,
        completed: completedDeliveries,
        cancelled: failedDeliveries,
        revenueKobo: sumMoney(deliveries, "feeKobo")
      }
    ];
  }, [
    cancelledOrders,
    cancelledRides,
    completedDeliveries,
    completedOrders,
    completedRides,
    deliveries,
    failedDeliveries,
    orders,
    rides
  ]);

  const activities: ActivityItem[] = useMemo(
    () =>
      props.audit.slice(0, 12).map((entry) => ({
        id: String(entry.id),
        action: String(entry.action ?? "activity"),
        entity: String(entry.entity ?? "System"),
        actor: entry.actor?.name ? String(entry.actor.name) : undefined,
        timestamp: entry.createdAt ? new Date(String(entry.createdAt)).toLocaleString("en-NG", { dateStyle: "short", timeStyle: "short" }) : "—",
        status: String(entry.action ?? "").includes("reject") || String(entry.action ?? "").includes("fail") ? "warning" : "info"
      })),
    [props.audit]
  );

  const alerts: AlertItem[] = useMemo(() => {
    const items: AlertItem[] = [];
    if ((overview?.pendingApplications ?? 0) > 0) {
      items.push({
        id: "pending-applications",
        severity: "info",
        title: `${overview?.pendingApplications} seller application${overview?.pendingApplications === 1 ? "" : "s"} awaiting review`,
        description: "Approving an application creates a verified vendor and vendor wallet.",
        module: "NaijaShop",
        actionLabel: "Review applications",
        actionHref: "/admin?module=shop&tab=applications"
      });
    }
    if ((overview?.lowStock ?? 0) > 0) {
      items.push({
        id: "low-stock",
        severity: "warning",
        title: `${overview?.lowStock} inventory record${overview?.lowStock === 1 ? "" : "s"} at or below 3 units`,
        description: "Low stock is measured from InventoryStock.quantity ≤ 3.",
        module: "NaijaShop",
        actionLabel: "Open products",
        actionHref: "/admin?module=shop&tab=products"
      });
    }
    if ((overview?.openReturns ?? 0) > 0) {
      items.push({
        id: "open-returns",
        severity: "warning",
        title: `${overview?.openReturns} return request${overview?.openReturns === 1 ? "" : "s"} open`,
        description: "Requested, approved or received returns still need a decision.",
        module: "NaijaShop",
        actionLabel: "Open orders",
        actionHref: "/admin?tab=orders"
      });
    }
    if ((overview?.disputes ?? 0) > 0) {
      items.push({
        id: "open-disputes",
        severity: "critical",
        title: `${overview?.disputes} unresolved dispute${overview?.disputes === 1 ? "" : "s"}`,
        description: "Escrow release is blocked while a dispute remains unresolved.",
        module: "Escrow",
        actionLabel: "Open audit log",
        actionHref: "/admin?tab=audit"
      });
    }
    const failedPayments = payments.filter((payment) => String(payment.status).toUpperCase() === "FAILED").length;
    if (failedPayments > 0) {
      items.push({
        id: "failed-payments",
        severity: "warning",
        title: `${failedPayments} failed payment record${failedPayments === 1 ? "" : "s"}`,
        description: "Review provider references before retrying collection.",
        module: "NaijaPay",
        actionLabel: "Open payments",
        actionHref: "/admin?module=pay&tab=payments"
      });
    }
    props.loadErrors.forEach((error, index) => {
      items.push({
        id: `load-error-${index}`,
        severity: "critical",
        title: "An admin data source failed to load",
        description: error,
        module: "System",
        actionLabel: "Retry",
        actionHref: "/admin"
      });
    });
    return items;
  }, [
    overview?.disputes,
    overview?.lowStock,
    overview?.openReturns,
    overview?.pendingApplications,
    payments,
    props.loadErrors
  ]);

  const superAdminOnly = props.isSuperAdmin;

  return (
    <div className="min-w-0 space-y-6">
      <ModuleSwitcher userRoles={props.userRoles} userActorType={props.userActorType} moduleId={moduleId} />

      <ModuleWorkspaceHeader
        moduleId={moduleId}
        userRoles={props.userRoles}
        currentTab={tabId}
        isSuperAdmin={superAdminOnly}
        onNavigate={navigate}
      />

      <div className="flex flex-col gap-2 rounded-xl border border-[#21262D] bg-[#0B0E14] px-4 py-3 text-xs text-[#8B949E] sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-center gap-2">
          <Database className="h-3.5 w-3.5" aria-hidden="true" />
          Loaded from the local PostgreSQL database at{" "}
          {new Date(props.loadedAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}
        </span>
        <span className="flex items-center gap-2">
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
          {props.loadErrors.length === 0 ? "All admin endpoints responded." : `${props.loadErrors.length} endpoint(s) failed.`}
        </span>
      </div>

      {props.loadErrors.length > 0 && (
        <div role="alert" className="rounded-xl border border-crimson/30 bg-crimson/10 p-4 text-sm text-crimson">
          <p className="flex items-center gap-2 font-bold">
            <AlertCircle className="h-4 w-4" aria-hidden="true" /> Some admin data could not be loaded
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
            {props.loadErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {tabId === "overview" ? (
        !isImplementedModule(moduleId) ? (
          <ModuleNotAvailable moduleId={moduleId} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="min-w-0 space-y-6 lg:col-span-8 xl:col-span-9">
              <OverviewKpis items={kpis} />

              <OperationsMap
                activeTrips={activeRides.map((ride) => ({
                  id: String(ride.id),
                  rideNumber: String(ride.rideNumber ?? "—"),
                  pickupLabel: String(ride.pickupLabel ?? "—"),
                  dropoffLabel: String(ride.dropoffLabel ?? "—"),
                  status: String(ride.status ?? "requested"),
                  driverName: ride.driver?.user?.name ? String(ride.driver.user.name) : "Unassigned",
                  fare: koboToNaira(ride.fareKobo ?? 0)
                }))}
                driverCount={driverUsers.length}
                driversOnTrip={driversOnTrip}
                onViewAllTrips={() => navigate({ tab: "rides" })}
              />

              <ServicePerformance metrics={serviceMetrics} />

              <RevenueTrend points={revenuePoints} />

              <DriverStatus registeredDrivers={driverUsers.length} driversOnTrip={driversOnTrip} activeTrips={activeRides.length} />

              <QuickActions isSuperAdmin={superAdminOnly} onNavigate={(tab) => navigate({ tab })} />

              <div className="grid gap-6 sm:grid-cols-2">
                <ActivityPanel activities={activities} />
                <AlertsPanel alerts={alerts} />
              </div>
            </div>

            <div className="min-w-0 space-y-6 lg:col-span-4 xl:col-span-3">
              <EcosystemHealth paymentMethods={overview?.paymentMethods ?? []} loadErrors={props.loadErrors} />
              <EcosystemSummary
                data={{
                  users: numberOf(overview?.users),
                  ordersAndTrips: numberOf(overview?.orders) + rides.length,
                  grossVerified,
                  escrowHeld,
                  refunded
                }}
              />
              <PlannedModules isSuperAdmin={superAdminOnly} />
            </div>
          </div>
        )
      ) : (
        <>
        {geo !== "all" ? (
          <p role="status" className="mb-4 rounded-xl border border-[#21262D] bg-[#161B22] px-4 py-2 text-sm text-[#8B949E]">
            Region filter is active for module tables. Summary cards above remain platform-wide.
          </p>
        ) : null}
        <WorkspaceTabContent
          tab={tabId}
          orders={orders}
          deliveries={deliveries}
          rides={rides}
          payouts={payouts}
          products={products}
          applications={applications}
          payments={payments}
          users={users}
          vendors={vendors}
          couriers={couriers}
          audit={audit}
          isSuperAdmin={superAdminOnly}
          initialQuery={searchParams.get("q") ?? ""}
          onRefresh={refresh}
        />
        </>
      )}
    </div>
  );
}

function ModuleNotAvailable({ moduleId }: { moduleId: string }) {
  return (
    <section className="rounded-2xl border border-[#21262D] bg-[#161B22] p-8">
      <h2 className="font-display text-xl font-extrabold text-[#F0F6FC]">
        {moduleId.charAt(0).toUpperCase() + moduleId.slice(1)} is not available in this build
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-[#8B949E]">
        This module appears in the ecosystem navigation because it is part of the roadmap, but it has no database
        models, API routes or operational workflows in this repository yet. No sample metrics are shown.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <a href="/admin" className="rounded-xl bg-[#00E676] px-4 py-2 text-sm font-bold text-[#0B0E14]">
          Back to Ecosystem overview
        </a>
        <a
          href="/admin?module=shop&tab=applications"
          className="rounded-xl border border-[#21262D] bg-[#0B0E14] px-4 py-2 text-sm font-bold text-[#F0F6FC]"
        >
          Review real seller applications
        </a>
      </div>
    </section>
  );
}
