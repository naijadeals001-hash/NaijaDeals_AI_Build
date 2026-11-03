/**
 * Single source of truth for Control Center module and tab navigation.
 *
 * Only capabilities with a real data source in `lib/services/core/admin.service.ts`
 * and the `/api/admin/*` routes are listed as available. Anything else must be
 * shown as unavailable instead of rendering fabricated content.
 */

export const ADMIN_TABS = [
  "overview",
  "orders",
  "deliveries",
  "rides",
  "payouts",
  "products",
  "applications",
  "payments",
  "disputes",
  "freight",
  "users",
  "vendors",
  "couriers",
  "drivers",
  "audit",
  "settings"
] as const;

export type AdminTab = (typeof ADMIN_TABS)[number];

export const ADMIN_MODULES = [
  "ecosystem",
  "shop",
  "eats",
  "drive",
  "send",
  "gigs",
  "stay",
  "stream",
  "pay",
  "fresh",
  "aura"
] as const;

export type AdminModule = (typeof ADMIN_MODULES)[number];

/** Modules whose backend data exists in this build. */
export const IMPLEMENTED_MODULES: AdminModule[] = ["ecosystem", "shop", "drive", "send", "pay"];

/**
 * Older links used `?tab=trips` and `?tab=sellers`. Keep them working rather
 * than dropping the user on an empty workspace.
 */
const TAB_ALIASES: Record<string, AdminTab> = {
  trips: "rides",
  sellers: "applications",
  "seller-applications": "applications",
  vendor: "vendors",
  courier: "couriers",
  driver: "drivers",
  "audit-log": "audit",
  payouts: "payouts",
  finance: "payments"
};

export function normalizeModule(value?: string | null): AdminModule {
  if (value && (ADMIN_MODULES as readonly string[]).includes(value)) {
    return value as AdminModule;
  }
  return "ecosystem";
}

export function normalizeTab(value?: string | null): AdminTab {
  if (!value) return "overview";
  if ((ADMIN_TABS as readonly string[]).includes(value)) return value as AdminTab;
  return TAB_ALIASES[value] ?? "overview";
}

export function isImplementedModule(moduleId: string): boolean {
  return (IMPLEMENTED_MODULES as string[]).includes(moduleId);
}

/** Real module tabs. Unavailable tabs are disabled in the header, not faked. */
export const MODULE_TABS: Record<AdminModule, Array<{ id: AdminTab; label: string }>> = {
  ecosystem: [
    { id: "overview", label: "Overview" },
    { id: "orders", label: "Orders" },
    { id: "users", label: "Users" },
    { id: "vendors", label: "Vendors" },
    { id: "payments", label: "Payments" },
    { id: "disputes", label: "Disputes" },
    { id: "audit", label: "Audit log" }
  ],
  shop: [
    { id: "overview", label: "Overview" },
    { id: "orders", label: "Orders" },
    { id: "products", label: "Products" },
    { id: "applications", label: "Seller applications" },
    { id: "deliveries", label: "Deliveries" },
    { id: "payments", label: "Payments" },
    { id: "disputes", label: "Disputes" }
  ],
  eats: [{ id: "overview", label: "Overview" }],
  drive: [
    { id: "overview", label: "Overview" },
    { id: "rides", label: "Trips" },
    { id: "drivers", label: "Drivers" },
    { id: "payments", label: "Finance" },
    { id: "audit", label: "Audit log" }
  ],
  send: [
    { id: "overview", label: "Overview" },
    { id: "deliveries", label: "Deliveries" },
    { id: "couriers", label: "Couriers" },
    { id: "freight", label: "Freight" },
    { id: "audit", label: "Audit log" }
  ],
  gigs: [{ id: "overview", label: "Overview" }],
  stay: [{ id: "overview", label: "Overview" }],
  stream: [{ id: "overview", label: "Overview" }],
  pay: [
    { id: "overview", label: "Overview" },
    { id: "payments", label: "Payments" },
    { id: "payouts", label: "Payouts" },
    { id: "disputes", label: "Disputes" },
    { id: "audit", label: "Audit log" }
  ],
  fresh: [{ id: "overview", label: "Overview" }],
  aura: [{ id: "overview", label: "Overview" }]
};

export const TAB_LABELS: Record<AdminTab, string> = {
  overview: "Overview",
  orders: "Orders",
  deliveries: "Deliveries",
  rides: "Trips",
  payouts: "Payouts",
  products: "Products",
  applications: "Seller applications",
  payments: "Payments",
  disputes: "Disputes",
  freight: "Freight",
  users: "Users",
  vendors: "Vendors",
  couriers: "Couriers",
  drivers: "Drivers",
  audit: "Audit log",
  settings: "Settings"
};

export function buildAdminHref(input: { module?: string; tab?: string; geo?: string }): string {
  const params = new URLSearchParams();
  if (input.module && input.module !== "ecosystem") params.set("module", input.module);
  if (input.tab && input.tab !== "overview") params.set("tab", input.tab);
  if (input.geo && input.geo !== "all") params.set("geo", input.geo);
  const query = params.toString();
  return query ? `/admin?${query}` : "/admin";
}
