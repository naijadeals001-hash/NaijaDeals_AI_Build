import { headers } from "next/headers";
import { filterRowsByRegion, type AdminRegion } from "@/lib/admin/region";

/**
 * Server-side loader for the Control Center.
 *
 * Next.js App Router pages cannot rely on `params` for query strings, and the
 * admin endpoints return a mix of arrays and envelope objects. Normalising them
 * here keeps every client component receiving arrays and makes failures
 * explicit instead of silently rendering zeroes.
 */

export interface AdminOverviewData {
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

export interface AdminPageData {
  overview: AdminOverviewData | null;
  orders: Array<Record<string, unknown>>;
  applications: Array<Record<string, unknown>>;
  products: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
  users: Array<Record<string, unknown>>;
  rides: Array<Record<string, unknown>>;
  audit: Array<Record<string, unknown>>;
  payouts: Array<Record<string, unknown>>;
  vendors: Array<Record<string, unknown>>;
  couriers: Array<Record<string, unknown>>;
  loadErrors: string[];
  loadedAt: string;
}

const ENDPOINTS = {
  overview: "/api/admin/overview",
  orders: "/api/admin/orders",
  applications: "/api/admin/applications",
  products: "/api/admin/products",
  payments: "/api/admin/payments",
  users: "/api/admin/users",
  rides: "/api/admin/rides",
  audit: "/api/admin/audit-logs",
  payouts: "/api/admin/payouts",
  vendors: "/api/admin/vendors",
  couriers: "/api/admin/couriers"
} as const;

type EndpointKey = keyof typeof ENDPOINTS;

async function fetchJson(baseUrl: string, cookie: string, path: string) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: cookie ? { Cookie: cookie } : undefined,
    cache: "no-store"
  });
  if (!res.ok) {
    throw new Error(`${path} returned HTTP ${res.status}`);
  }
  return res.json();
}

function asArray(value: unknown, envelopeKey?: string): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
  if (value && typeof value === "object" && envelopeKey) {
    const inner = (value as Record<string, unknown>)[envelopeKey];
    if (Array.isArray(inner)) return inner as Array<Record<string, unknown>>;
  }
  return [];
}

export async function loadAdminPageData(region: AdminRegion = "ALL"): Promise<AdminPageData> {
  const headersList = headers();
  const host = headersList.get("host") ?? "localhost:3100";
  const forwardedProto = headersList.get("x-forwarded-proto");
  const protocol = forwardedProto ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  const baseUrl = `${protocol}://${host}`;
  const cookie = headersList.get("cookie") ?? "";

  const keys = Object.keys(ENDPOINTS) as EndpointKey[];
  const loadErrors: string[] = [];

  const results = await Promise.all(
    keys.map(async (key) => {
      try {
        const value = await fetchJson(baseUrl, cookie, ENDPOINTS[key]);
        return [key, value] as const;
      } catch (error) {
        loadErrors.push(`${ENDPOINTS[key]}: ${error instanceof Error ? error.message : "request failed"}`);
        return [key, null] as const;
      }
    })
  );

  const raw = Object.fromEntries(results) as Record<EndpointKey, unknown>;

  // Region filtering happens on the server so rows outside the selected (or
  // permitted) region never reach the client payload.
  const data: AdminPageData = {
    overview: raw.overview && typeof raw.overview === "object" ? (raw.overview as AdminOverviewData) : null,
    orders: filterRowsByRegion(asArray(raw.orders), region),
    applications: filterRowsByRegion(asArray(raw.applications), region),
    products: filterRowsByRegion(asArray(raw.products), region),
    payments: filterRowsByRegion(asArray(raw.payments), region),
    users: filterRowsByRegion(asArray(raw.users), region),
    rides: asArray(raw.rides, "rides"),
    audit: asArray(raw.audit),
    payouts: filterRowsByRegion(asArray(raw.payouts), region),
    vendors: filterRowsByRegion(asArray(raw.vendors), region),
    couriers: asArray(raw.couriers),
    loadErrors,
    loadedAt: new Date().toISOString()
  };
  return data;
}
