import type { SessionUser } from "@/lib/auth/session";
import { roleNames } from "@/lib/auth/session";
import { ApiError, hasAdminConsoleAccess } from "@/lib/auth/guard";
import { COUNTRIES } from "@/lib/config/commerce";
import { CITIES } from "@/lib/config/regions";
import { verticals, type VerticalStatus } from "@/lib/data/ecosystem";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "./audit.service";

/**
 * Central service activation.
 *
 * One `VerticalActivation` row per (vertical, scope) controls whether a module
 * is reachable. Precedence is "most restrictive applicable rule wins":
 *
 *   1. a GLOBAL DISABLED row blocks every country and city;
 *   2. a GLOBAL PREVIEW row limits every location to authorized preview users;
 *   3. an applicable COUNTRY rule can restrict (or, when the parent permits
 *      public access, open) that country;
 *   4. an applicable CITY rule can restrict that city further;
 *   5. a local rule can never make a stricter parent more permissive: a
 *      country/city LIVE cannot upgrade a GLOBAL DISABLED/PREVIEW parent, and
 *      a city LIVE cannot upgrade a country DISABLED/PREVIEW parent;
 *   6. when no rule applies, the module's verified registry status is used
 *      (live -> LIVE, preview -> PREVIEW, setup/coming -> DISABLED).
 *
 * The effective status is the least permissive status among the GLOBAL rule,
 * the matching COUNTRY rule and the matching CITY rule. Ties are reported
 * against the most specific matching rule (CITY > COUNTRY > GLOBAL), so the
 * UI names the local rule an operator most directly configured. `rules`
 * exposes every contributing rule, including local rules that were ignored
 * because they would have loosened a stricter parent.
 *
 * A DISABLED module has no public storefront. PREVIEW is reachable only by an
 * authenticated Control Center user. LIVE is the normal public state. The
 * resolver is fail-closed only where an actual DISABLED/PREVIEW state applies:
 * a module with no rows keeps its existing registry behaviour, which is why
 * NaijaShop stays usable (registry: live) until an operator changes it.
 *
 * Enforcement is intentionally explicit. Only the verticals listed in
 * `VERTICAL_ENFORCEMENT` consult this service on their routes; the admin UI
 * states that a stored row for any other module is not yet effective and its
 * write controls are disabled.
 */

export const VERTICAL_SCOPE_TYPES = ["GLOBAL", "COUNTRY", "CITY"] as const;
export type VerticalScopeType = (typeof VERTICAL_SCOPE_TYPES)[number];

export const VERTICAL_ACTIVATION_STATUSES = ["DISABLED", "PREVIEW", "LIVE"] as const;
export type VerticalActivationStatusName = (typeof VERTICAL_ACTIVATION_STATUSES)[number];

export type ActivationRowView = {
  id: string;
  verticalKey: string;
  scopeType: VerticalScopeType;
  countryCode: string;
  cityCode: string;
  status: VerticalActivationStatusName;
  reason: string | null;
  updatedById: string | null;
  updatedAt: string;
};

export type EffectiveActivationSource = "database" | "registry";

/**
 * One rule that participated in the effective-state calculation.
 *
 * `ignored` means the rule is more permissive than the winning rule and
 * therefore cannot take effect while the stricter parent remains. It is kept
 * visible so an operator can see why a local LIVE did not open the scope.
 */
export type AppliedVerticalRule = {
  id: string | null;
  scopeType: VerticalScopeType;
  scopeLabel: string;
  status: VerticalActivationStatusName;
  reason: string | null;
  /** The rule that produced the effective status (ties resolve to the most specific scope). */
  responsible: boolean;
  /** This rule would loosen the effective state and is therefore not applied. */
  ignored: boolean;
};

export type EffectiveVerticalActivation = {
  verticalKey: string;
  status: VerticalActivationStatusName;
  /** Which rule produced the status. REGISTRY means no applicable row existed. */
  scope: VerticalScopeType | "REGISTRY";
  scopeLabel: string;
  countryCode: string | null;
  cityCode: string | null;
  reason: string | null;
  source: EffectiveActivationSource;
  rowId: string | null;
  registryStatus: VerticalStatus;
  /** A GLOBAL row exists and its status matches the effective status. */
  globalOverrideActive: boolean;
  /** A matching local row exists but is more permissive than the winning rule. */
  localOverrideIgnored: boolean;
  /** Every applicable GLOBAL/COUNTRY/CITY rule, including ignored ones. */
  rules: AppliedVerticalRule[];
};

export type VerticalEnforcement = {
  wired: boolean;
  state: "ENFORCED" | "NOT_WIRED";
  summary: string;
  points: string[];
};

export type VerticalDefinition = {
  key: string;
  name: string;
  publicLabel: string;
  href: string;
  registryStatus: VerticalStatus;
  defaultStatus: VerticalActivationStatusName;
};

export type VerticalImpact = {
  productsActive: number | null;
  vendorsVerified: number | null;
  openOrders: number | null;
  note: string;
};

export type VerticalControl = VerticalDefinition & {
  enforcement: VerticalEnforcement;
  effective: EffectiveVerticalActivation;
  rows: ActivationRowView[];
  countries: Array<{
    countryCode: string;
    countryName: string;
    effective: EffectiveVerticalActivation;
  }>;
  cities: Array<{
    countryCode: string;
    countryName: string;
    city: string;
    cityCode: string;
    effective: EffectiveVerticalActivation;
  }>;
  impact: VerticalImpact | null;
};

export type VerticalActivationAuditEntry = {
  id: string;
  action: string;
  actorName: string | null;
  actorId: string | null;
  entityId: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
};

const PUBLIC_LABELS: Record<string, string> = {
  shop: "Shop",
  eats: "Food",
  fresh: "Groceries",
  drive: "Drive",
  send: "Deliveries & Freight",
  gigs: "Services",
  stay: "Stays",
  stream: "Music",
  wallet: "Wallet & Payments",
  aura: "Aura AI"
};

/**
 * Which modules actually consult activation. A row for a NOT_WIRED module is
 * stored and audited but does not change that module's behaviour until its
 * own routes/services are wired in a later, separately verified slice.
 */
export const VERTICAL_ENFORCEMENT: Record<string, VerticalEnforcement> = {
  shop: {
    wired: true,
    state: "ENFORCED",
    summary: "Catalogue, product pages, new cart additions, checkout and new seller listings consult activation.",
    points: [
      "GET /api/products, GET /api/products/[id] and /product/[id]",
      "POST /api/cart/items (new additions only; the cart, orders and existing items stay readable)",
      "POST /api/checkout (new orders only; existing orders stay readable)",
      "POST/PATCH /api/seller/products (new or republished listings)",
      "/api/products/availability (homepage + Shop navigation signal)",
      "/naijashop storefront product API"
    ]
  },
  eats: {
    wired: false,
    state: "NOT_WIRED",
    summary: "Eats routes and services do not consult activation yet. A saved row has no runtime effect.",
    points: []
  },
  fresh: {
    wired: false,
    state: "NOT_WIRED",
    summary: "Fresh routes and services do not consult activation yet. A saved row has no runtime effect.",
    points: []
  },
  drive: {
    wired: false,
    state: "NOT_WIRED",
    summary: "Drive routes and services do not consult activation yet. A saved row has no runtime effect.",
    points: []
  },
  send: {
    wired: false,
    state: "NOT_WIRED",
    summary: "Send routes and services do not consult activation yet. A saved row has no runtime effect.",
    points: []
  },
  gigs: {
    wired: false,
    state: "NOT_WIRED",
    summary: "Gigs routes and services do not consult activation yet. A saved row has no runtime effect.",
    points: []
  },
  stay: {
    wired: true,
    state: "ENFORCED",
    summary: "Stay discovery, new holds and new host listings consult activation; existing holds, bookings, cancellation, reviews and support remain available.",
    points: [
      "/naijastay discovery, search, destinations and property pages (server-rendered pause state)",
      "POST /api/stay/hold (new reservations only)",
      "POST /api/stay/host and PUT /api/stay/host (new host applications/listings only)",
      "Existing holds can still be paid/cancelled through the accepted reservation flow",
      "Existing /naijastay/bookings, cancellation, review, host dashboard and help routes remain available"
    ]
  },
  stream: {
    wired: false,
    state: "NOT_WIRED",
    summary: "Stream routes and services do not consult activation yet. A saved row has no runtime effect.",
    points: []
  },
  wallet: {
    wired: false,
    state: "NOT_WIRED",
    summary: "Payment routes and services do not consult activation yet. A saved row has no runtime effect.",
    points: []
  },
  aura: {
    wired: false,
    state: "NOT_WIRED",
    summary: "Aura routes and services do not consult activation yet. A saved row has no runtime effect.",
    points: []
  }
};

export const VERTICAL_DEFINITIONS: VerticalDefinition[] = verticals.map((vertical) => ({
  key: vertical.key,
  name: vertical.name,
  publicLabel: PUBLIC_LABELS[vertical.key] ?? vertical.name,
  href: vertical.href,
  registryStatus: vertical.status,
  defaultStatus: registryStatusToActivation(vertical.status)
}));

export function registryStatusToActivation(status: VerticalStatus): VerticalActivationStatusName {
  if (status === "live") return "LIVE";
  if (status === "preview") return "PREVIEW";
  return "DISABLED";
}

export function verticalDefinition(key: string): VerticalDefinition {
  const definition = VERTICAL_DEFINITIONS.find((entry) => entry.key === key);
  if (!definition) throw new ApiError(400, "unknown_vertical", "That service is not part of the vertical registry.");
  return definition;
}

export function normaliseCountryCode(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase();
}

export function normaliseCityCode(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Display name for a stored city code, falling back to the code itself. */
export function cityDisplayName(countryCode: string, cityCode: string): string {
  const match = (CITIES[countryCode] ?? []).find((city) => normaliseCityCode(city) === cityCode);
  return match ?? cityCode;
}

/** Canonical city code for a configured city, or null when it is not in the country catalogue. */
export function configuredCityCode(countryCode: string, value: string | null | undefined): string | null {
  const code = normaliseCityCode(value);
  if (!code) return null;
  const match = (CITIES[countryCode] ?? []).find((city) => normaliseCityCode(city) === code);
  return match ? code : null;
}

function scopeLabel(input: {
  scope: VerticalScopeType | "REGISTRY";
  countryCode: string | null;
  cityCode: string | null;
}): string {
  if (input.scope === "GLOBAL") return "All locations (GLOBAL rule)";
  if (input.scope === "REGISTRY") return "Registry default";
  if (input.scope === "COUNTRY" && input.countryCode) {
    return COUNTRIES[input.countryCode]?.name ?? input.countryCode;
  }
  if (input.scope === "CITY" && input.countryCode && input.cityCode) {
    return `${cityDisplayName(input.countryCode, input.cityCode)}, ${COUNTRIES[input.countryCode]?.name ?? input.countryCode}`;
  }
  return "Location scope";
}

type RowLike = {
  id: string | null;
  scopeType: string;
  countryCode: string | null;
  cityCode: string | null;
  status: string;
  reason: string | null;
};

function isStatus(value: string): value is VerticalActivationStatusName {
  return (VERTICAL_ACTIVATION_STATUSES as readonly string[]).includes(value);
}

/**
 * Openness ranking: the smallest value is the most restrictive state.
 * A parent rule can only be loosened by a child when the parent is already
 * LIVE; the resolver always takes the minimum, so no local rule can bypass a
 * stricter GLOBAL or COUNTRY rule.
 */
const STATUS_RANK: Record<VerticalActivationStatusName, number> = {
  DISABLED: 0,
  PREVIEW: 1,
  LIVE: 2
};

/**
 * Tie-break specificity: when several applicable rules carry the effective
 * status, report the most specific one. This makes a city/country rule the
 * visible reason for a local pause while a stricter ancestor remains the
 * reason when it is the only rule at that status.
 */
const SCOPE_SPECIFICITY: Record<VerticalScopeType, number> = {
  CITY: 0,
  COUNTRY: 1,
  GLOBAL: 2
};

type ApplicableRule = {
  row: RowLike;
  scopeType: VerticalScopeType;
  scopeLabel: string;
  status: VerticalActivationStatusName;
  rank: number;
  specificity: number;
};

function normaliseRowStatus(row: RowLike): VerticalActivationStatusName | null {
  const value = String(row.status ?? "").trim().toUpperCase();
  return isStatus(value) ? value : null;
}

/**
 * Pure effective-state resolver. Exported so the acceptance script can prove
 * precedence without depending on database state.
 *
 * Contract: effective = the least permissive status among the GLOBAL rule, the
 * matching COUNTRY rule and the matching CITY rule (when a country/city target
 * is supplied). With no applicable rule, the registry status is the default.
 */
export function evaluateVerticalActivation(input: {
  verticalKey: string;
  registryStatus: VerticalStatus;
  rows: RowLike[];
  countryCode?: string | null;
  cityCode?: string | null;
}): EffectiveVerticalActivation {
  const countryCode = normaliseCountryCode(input.countryCode) || null;
  const cityCode = normaliseCityCode(input.cityCode) || null;
  const rows = input.rows.filter((row) => normaliseRowStatus(row) !== null);
  const registryStatus = input.registryStatus;

  const base = {
    verticalKey: input.verticalKey,
    registryStatus,
    countryCode,
    cityCode
  };

  const applicable: ApplicableRule[] = [];
  const add = (row: RowLike, scopeType: VerticalScopeType) => {
    const status = normaliseRowStatus(row);
    if (!status) return;
    applicable.push({
      row,
      scopeType,
      scopeLabel: scopeLabel({ scope: scopeType, countryCode, cityCode }),
      status,
      rank: STATUS_RANK[status],
      specificity: SCOPE_SPECIFICITY[scopeType]
    });
  };

  for (const row of rows) {
    if (row.scopeType === "GLOBAL") {
      add(row, "GLOBAL");
      continue;
    }
    if (!countryCode) continue;
    if (row.scopeType === "COUNTRY" && normaliseCountryCode(row.countryCode) === countryCode) {
      add(row, "COUNTRY");
      continue;
    }
    if (
      row.scopeType === "CITY" &&
      Boolean(cityCode) &&
      normaliseCountryCode(row.countryCode) === countryCode &&
      normaliseCityCode(row.cityCode) === cityCode
    ) {
      add(row, "CITY");
    }
  }

  if (applicable.length === 0) {
    return {
      ...base,
      status: registryStatusToActivation(registryStatus),
      scope: "REGISTRY",
      scopeLabel: scopeLabel({ scope: "REGISTRY", countryCode, cityCode }),
      reason: `Registry status is ${registryStatus}; no activation rule applies.`,
      source: "registry",
      rowId: null,
      globalOverrideActive: false,
      localOverrideIgnored: false,
      rules: []
    };
  }

  // Most restrictive first; ties go to the most specific scope (CITY before
  // COUNTRY before GLOBAL) and then to a stable row id for bad duplicate data.
  const ordered = [...applicable].sort(
    (a, b) =>
      a.rank - b.rank ||
      a.specificity - b.specificity ||
      String(a.row.id ?? "").localeCompare(String(b.row.id ?? ""))
  );
  const winner = ordered[0];
  const effectiveRank = winner.rank;
  const global = applicable.find((entry) => entry.scopeType === "GLOBAL") ?? null;

  const rules = [...applicable]
    .sort((a, b) => SCOPE_SPECIFICITY[b.scopeType] - SCOPE_SPECIFICITY[a.scopeType] || a.rank - b.rank)
    .map<AppliedVerticalRule>((entry) => ({
      id: entry.row.id,
      scopeType: entry.scopeType,
      scopeLabel: entry.scopeLabel,
      status: entry.status,
      reason: entry.row.reason,
      responsible: entry === winner,
      // Only a country/city rule can be "ignored" for trying to loosen a
      // stricter parent. A GLOBAL row that is less restrictive than a local
      // rule still sets the permission floor and is never labelled ignored.
      ignored: entry.scopeType !== "GLOBAL" && entry.rank > effectiveRank
    }));

  return {
    ...base,
    status: winner.status,
    scope: winner.scopeType,
    scopeLabel: winner.scopeLabel,
    reason: winner.row.reason,
    source: "database",
    rowId: winner.row.id,
    globalOverrideActive: Boolean(global && global.status === winner.status),
    localOverrideIgnored: applicable.some(
      (entry) => entry.scopeType !== "GLOBAL" && entry.rank > effectiveRank
    ),
    rules
  };
}

/** True when the status is reachable for the caller. PREVIEW needs an authorized staff user. */
export function activationAllowsAccess(
  status: VerticalActivationStatusName,
  options: { previewAuthorized?: boolean } = {}
): boolean {
  if (status === "LIVE") return true;
  if (status === "PREVIEW") return Boolean(options.previewAuthorized);
  return false;
}

/** Preview users are authenticated Control Center accounts; customers are not preview users. */
export function canPreviewVertical(user: SessionUser | null | undefined): boolean {
  if (!user) return false;
  if (roleNames(user).includes("super_admin")) return true;
  return hasAdminConsoleAccess(user);
}

/**
 * One shared preview-authorization decision for server pages, route handlers
 * and navigation consumers.
 *
 * The session read is dynamic so importing the pure resolver in a script does
 * not pull `next/headers` into module initialisation. Every caller that needs
 * to know whether PREVIEW applies to this request must use this helper instead
 * of re-deriving the role check.
 */
export async function previewAuthorizationForRequest(): Promise<{
  user: SessionUser | null;
  previewAuthorized: boolean;
}> {
  const { getSessionUser } = await import("@/lib/auth/session");
  const user = await getSessionUser().catch(() => null);
  return { user, previewAuthorized: canPreviewVertical(user) };
}

const CACHE_TTL_MS = 5_000;
let rowCache: { loadedAt: number; rows: ActivationRowView[] } | null = null;

export function clearVerticalActivationCache() {
  rowCache = null;
}

function mapRow(row: {
  id: string;
  verticalKey: string;
  scopeType: string;
  countryCode: string;
  cityCode: string;
  status: string;
  reason: string | null;
  updatedById: string | null;
  updatedAt: Date;
}): ActivationRowView {
  if (!isStatus(row.status)) {
    throw new ApiError(500, "invalid_activation_status", "A stored activation status is not recognised.");
  }
  if (!(VERTICAL_SCOPE_TYPES as readonly string[]).includes(row.scopeType)) {
    throw new ApiError(500, "invalid_activation_scope", "A stored activation scope is not recognised.");
  }
  return {
    id: row.id,
    verticalKey: row.verticalKey,
    scopeType: row.scopeType as VerticalScopeType,
    countryCode: row.countryCode,
    cityCode: row.cityCode,
    status: row.status,
    reason: row.reason,
    updatedById: row.updatedById,
    updatedAt: row.updatedAt.toISOString()
  };
}

async function loadActivationRows(options: { fresh?: boolean } = {}): Promise<ActivationRowView[]> {
  if (!options.fresh && rowCache && Date.now() - rowCache.loadedAt < CACHE_TTL_MS) {
    return rowCache.rows;
  }
  const rows = await prisma.verticalActivation.findMany({
    orderBy: [{ verticalKey: "asc" }, { scopeType: "asc" }, { countryCode: "asc" }, { cityCode: "asc" }]
  });
  const mapped = rows.map(mapRow);
  rowCache = { loadedAt: Date.now(), rows: mapped };
  return mapped;
}

export type VerticalAccessOptions = {
  countryCode?: string | null;
  cityCode?: string | null;
  previewAuthorized?: boolean;
  fresh?: boolean;
};

export async function effectiveVerticalActivation(
  verticalKey: string,
  options: VerticalAccessOptions = {}
): Promise<EffectiveVerticalActivation> {
  const definition = verticalDefinition(verticalKey);
  const rows = await loadActivationRows({ fresh: options.fresh });
  return evaluateVerticalActivation({
    verticalKey,
    registryStatus: definition.registryStatus,
    rows: rows.filter((row) => row.verticalKey === verticalKey),
    countryCode: options.countryCode,
    cityCode: options.cityCode
  });
}

export async function verticalAccess(
  verticalKey: string,
  options: VerticalAccessOptions = {}
): Promise<{ effective: EffectiveVerticalActivation; accessible: boolean }> {
  const effective = await effectiveVerticalActivation(verticalKey, options);
  return {
    effective,
    accessible: activationAllowsAccess(effective.status, { previewAuthorized: options.previewAuthorized })
  };
}

export function unavailableMessage(
  definition: VerticalDefinition,
  effective: EffectiveActivationStatusInput
): string {
  const place = effective.cityCode
    ? `${cityDisplayName(effective.countryCode ?? "", effective.cityCode)}, ${
        COUNTRIES[effective.countryCode ?? ""]?.name ?? effective.countryCode
      }`
    : effective.countryCode
      ? COUNTRIES[effective.countryCode]?.name ?? effective.countryCode
      : "";
  if (effective.status === "PREVIEW") {
    return `${definition.publicLabel} is in preview and is not open to the public yet.`;
  }
  return `${definition.publicLabel} is not available${place ? ` in ${place}` : ""} yet. Existing orders, receipts and support remain available.`;
}

type EffectiveActivationStatusInput = Pick<
  EffectiveVerticalActivation,
  "status" | "countryCode" | "cityCode"
>;

/**
 * Throws the stable public refusal used by product and checkout routes.
 * `statusCode` is 404 for browse/detail and 409 for a checkout attempt.
 */
export async function assertVerticalAccess(
  verticalKey: string,
  options: VerticalAccessOptions & { statusCode?: number; message?: string } = {}
): Promise<EffectiveVerticalActivation> {
  const definition = verticalDefinition(verticalKey);
  const effective = await effectiveVerticalActivation(verticalKey, options);
  if (activationAllowsAccess(effective.status, { previewAuthorized: options.previewAuthorized })) {
    return effective;
  }
  throw new ApiError(
    options.statusCode ?? 404,
    "vertical_unavailable",
    options.message ?? unavailableMessage(definition, effective),
    {
      vertical: verticalKey,
      status: effective.status,
      scope: effective.scope,
      countryCode: effective.countryCode,
      cityCode: effective.cityCode,
      retryable: false
    }
  );
}

/** Convenience wrapper for every Shop enforcement point. */
export function assertShopAccess(
  options: VerticalAccessOptions & { statusCode?: number; message?: string } = {}
) {
  return assertVerticalAccess("shop", options);
}

async function singleImpact(): Promise<VerticalImpact | null> {
  const [productsActive, vendorsVerified, openOrders] = await Promise.all([
    prisma.product
      .count({ where: { status: "ACTIVE", isSample: false, vendor: { status: "VERIFIED" } } })
      .catch(() => null),
    prisma.vendor.count({ where: { status: "VERIFIED" } }).catch(() => null),
    prisma.order
      .count({ where: { status: { notIn: ["completed", "cancelled", "refunded"] } } })
      .catch(() => null)
  ]);
  return {
    productsActive,
    vendorsVerified,
    openOrders,
    note: "Existing orders, returns, disputes and support stay readable and manageable regardless of this setting."
  };
}

function rowsFor(rows: ActivationRowView[], verticalKey: string): ActivationRowView[] {
  return rows.filter((row) => row.verticalKey === verticalKey);
}

function buildControl(
  definition: VerticalDefinition,
  rows: ActivationRowView[],
  impact: VerticalImpact | null
): VerticalControl {
  const verticalRows = rowsFor(rows, definition.key);
  const effective = evaluateVerticalActivation({
    verticalKey: definition.key,
    registryStatus: definition.registryStatus,
    rows: verticalRows
  });

  const countries = Object.values(COUNTRIES).map((country) => ({
    countryCode: country.code,
    countryName: country.name,
    effective: evaluateVerticalActivation({
      verticalKey: definition.key,
      registryStatus: definition.registryStatus,
      rows: verticalRows,
      countryCode: country.code
    })
  }));

  const cities = Object.entries(CITIES).flatMap(([countryCode, list]) =>
    list.map((city) => ({
      countryCode,
      countryName: COUNTRIES[countryCode]?.name ?? countryCode,
      city,
      cityCode: normaliseCityCode(city),
      effective: evaluateVerticalActivation({
        verticalKey: definition.key,
        registryStatus: definition.registryStatus,
        rows: verticalRows,
        countryCode,
        cityCode: normaliseCityCode(city)
      })
    }))
  );

  return {
    ...definition,
    enforcement: VERTICAL_ENFORCEMENT[definition.key] ?? {
      wired: false,
      state: "NOT_WIRED",
      summary: "This service does not consult activation yet.",
      points: []
    },
    effective,
    rows: verticalRows,
    countries,
    cities,
    impact
  };
}

export type VerticalControlSnapshot = {
  generatedAt: string;
  verticals: VerticalControl[];
  countries: Array<{ code: string; name: string; currency: string }>;
  cities: Record<string, Array<{ city: string; cityCode: string }>>;
  audit: VerticalActivationAuditEntry[];
};

export async function listVerticalControls(options: { fresh?: boolean } = {}): Promise<VerticalControlSnapshot> {
  const rows = await loadActivationRows({ fresh: options.fresh });
  const shopImpact = await singleImpact();
  const verticals = VERTICAL_DEFINITIONS.map((definition) => {
    const impact = definition.key === "shop" ? shopImpact : null;
    return buildControl(definition, rows, impact);
  });

  const auditRows = await prisma.auditLog
    .findMany({
      where: { entity: "VerticalActivation" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 25,
      include: { actor: { select: { name: true } } }
    })
    .catch(() => []);

  return {
    generatedAt: new Date().toISOString(),
    verticals,
    countries: Object.values(COUNTRIES).map((country) => ({
      code: country.code,
      name: country.name,
      currency: country.currency
    })),
    cities: Object.fromEntries(
      Object.entries(CITIES).map(([countryCode, list]) => [
        countryCode,
        list.map((city) => ({ city, cityCode: normaliseCityCode(city) }))
      ])
    ),
    audit: auditRows.map((row) => ({
      id: row.id,
      action: row.action,
      actorName: row.actor?.name ?? null,
      actorId: row.actorId,
      entityId: row.entityId,
      createdAt: row.createdAt.toISOString(),
      metadata: (row.metadata as Record<string, unknown> | null) ?? null
    }))
  };
}

type NormalisedScope = {
  scopeType: VerticalScopeType;
  countryCode: string;
  cityCode: string;
  city?: string;
};

function normaliseScopeInput(input: {
  scopeType: unknown;
  countryCode?: unknown;
  cityCode?: unknown;
  city?: unknown;
}): NormalisedScope {
  const scopeType = String(input.scopeType ?? "").trim().toUpperCase();
  if (!(VERTICAL_SCOPE_TYPES as readonly string[]).includes(scopeType)) {
    throw new ApiError(400, "invalid_scope", "scopeType must be GLOBAL, COUNTRY or CITY.");
  }

  if (scopeType === "GLOBAL") {
    if (String(input.countryCode ?? "").trim() || String(input.cityCode ?? input.city ?? "").trim()) {
      throw new ApiError(400, "invalid_scope", "A GLOBAL rule does not take a country or city.");
    }
    return { scopeType: "GLOBAL", countryCode: "", cityCode: "" };
  }

  const countryCode = normaliseCountryCode(input.countryCode as string | null | undefined);
  if (!COUNTRIES[countryCode]) {
    throw new ApiError(400, "unknown_country", "Choose an enabled country.");
  }

  if (scopeType === "COUNTRY") {
    if (String(input.cityCode ?? input.city ?? "").trim()) {
      throw new ApiError(400, "invalid_scope", "A COUNTRY rule does not take a city.");
    }
    return { scopeType: "COUNTRY", countryCode, cityCode: "" };
  }

  const cityCode = configuredCityCode(countryCode, (input.cityCode ?? input.city) as string | null | undefined);
  if (!cityCode) {
    throw new ApiError(400, "unknown_city", "Choose a city from the configured country catalogue.");
  }
  const city = (CITIES[countryCode] ?? []).find((entry) => normaliseCityCode(entry) === cityCode);
  return { scopeType: "CITY", countryCode, cityCode, city };
}

function readReason(value: unknown): string {
  const reason = String(value ?? "").trim();
  if (reason.length < 3) {
    throw new ApiError(400, "reason_required", "Record why this activation change is being made (at least 3 characters).");
  }
  if (reason.length > 500) {
    throw new ApiError(400, "validation_error", "The reason must be 500 characters or fewer.");
  }
  return reason;
}

function compareScope(a: ActivationRowView, scope: NormalisedScope) {
  return (
    a.scopeType === scope.scopeType &&
    normaliseCountryCode(a.countryCode) === scope.countryCode &&
    normaliseCityCode(a.cityCode) === scope.cityCode
  );
}

function targetEvaluation(
  definition: VerticalDefinition,
  rows: RowLike[],
  scope: NormalisedScope
): EffectiveVerticalActivation {
  return evaluateVerticalActivation({
    verticalKey: definition.key,
    registryStatus: definition.registryStatus,
    rows,
    countryCode: scope.countryCode || null,
    cityCode: scope.cityCode || null
  });
}

function scopeMetadata(scope: NormalisedScope) {
  return {
    scopeType: scope.scopeType,
    countryCode: scope.countryCode || null,
    cityCode: scope.cityCode || null,
    ...(scope.city ? { city: scope.city } : {})
  };
}

/**
 * Upsert one activation rule.
 *
 * Only an ENFORCED vertical may store a new status. Writing a row for a
 * NOT_WIRED module would look operational in the Control Center while no
 * route consulted it, so the server refuses it with a stable 409. Clearing a
 * stale inert row remains available for cleanup.
 */
export async function updateVerticalActivation(input: {
  actor: SessionUser;
  verticalKey: string;
  scopeType: unknown;
  countryCode?: unknown;
  cityCode?: unknown;
  city?: unknown;
  status: unknown;
  reason: unknown;
}): Promise<VerticalControl> {
  const definition = verticalDefinition(input.verticalKey);
  const enforcement = VERTICAL_ENFORCEMENT[definition.key];
  if (!enforcement?.wired) {
    throw new ApiError(
      409,
      "vertical_not_enforced",
      `${definition.publicLabel} does not consult service activation yet. No activation rule is accepted for a service whose routes would ignore it.`
    );
  }
  const scope = normaliseScopeInput(input);
  const status = String(input.status ?? "").trim().toUpperCase();
  if (!(VERTICAL_ACTIVATION_STATUSES as readonly string[]).includes(status)) {
    throw new ApiError(400, "invalid_status", "status must be DISABLED, PREVIEW or LIVE.");
  }
  const reason = readReason(input.reason);

  // A scoped operator cannot change a rule outside their own region. The
  // permission is super-admin only today; this guard keeps the contract safe
  // if it is ever delegated.
  const actorCountry = normaliseCountryCode(input.actor.scopeCountryCode);
  if (actorCountry) {
    if (!scope.countryCode || scope.countryCode !== actorCountry) {
      throw new ApiError(403, "out_of_scope", "This activation change is outside your assigned region.");
    }
  }

  const beforeRows = await loadActivationRows({ fresh: true });
  const currentRows = rowsFor(beforeRows, definition.key);
  const before = targetEvaluation(definition, currentRows, scope);

  const prospectiveRows: RowLike[] = currentRows.filter((row) => !compareScope(row, scope)).map((row) => ({
    id: row.id,
    scopeType: row.scopeType,
    countryCode: row.countryCode,
    cityCode: row.cityCode,
    status: row.status,
    reason: row.reason
  }));
  const after = targetEvaluation(
    definition,
    [
      ...prospectiveRows,
      {
        id: "pending",
        scopeType: scope.scopeType,
        countryCode: scope.countryCode,
        cityCode: scope.cityCode,
        status,
        reason
      }
    ],
    scope
  );

  await prisma.$transaction(async (tx) => {
    const row = await tx.verticalActivation.upsert({
      where: {
        verticalKey_scopeType_countryCode_cityCode: {
          verticalKey: definition.key,
          scopeType: scope.scopeType,
          countryCode: scope.countryCode,
          cityCode: scope.cityCode
        }
      },
      update: {
        status: status as VerticalActivationStatusName,
        reason,
        updatedById: input.actor.id
      },
      create: {
        verticalKey: definition.key,
        scopeType: scope.scopeType,
        countryCode: scope.countryCode,
        cityCode: scope.cityCode,
        status: status as VerticalActivationStatusName,
        reason,
        updatedById: input.actor.id
      }
    });
    await recordAudit({
      tx,
      actorId: input.actor.id,
      action: "vertical.updated",
      entity: "VerticalActivation",
      entityId: row.id,
      metadata: {
        verticalKey: definition.key,
        ...scopeMetadata(scope),
        before: {
          status: before.status,
          reason: before.reason,
          effectiveScope: before.scope,
          source: before.source
        },
        after: {
          status: after.status,
          reason: after.reason,
          effectiveScope: after.scope,
          source: after.source
        },
        storedStatus: status,
        enforcement: VERTICAL_ENFORCEMENT[definition.key]?.state ?? "NOT_WIRED"
      }
    });
  });

  clearVerticalActivationCache();
  const refreshed = await listVerticalControls({ fresh: true });
  const control = refreshed.verticals.find((entry) => entry.key === definition.key);
  if (!control) throw new ApiError(500, "internal_error", "The activation record could not be reloaded.");
  return control;
}

/**
 * Remove one rule so the scope inherits its next source (the least permissive
 * of GLOBAL/country, then registry). The deletion is audited with the same
 * before/after contract. Clearing is also allowed for a NOT_WIRED module so a
 * stale inert row can be removed without implying runtime control.
 */
export async function clearVerticalActivation(input: {
  actor: SessionUser;
  verticalKey: string;
  scopeType: unknown;
  countryCode?: unknown;
  cityCode?: unknown;
  city?: unknown;
  reason: unknown;
}): Promise<VerticalControl> {
  const definition = verticalDefinition(input.verticalKey);
  const scope = normaliseScopeInput(input);
  const reason = readReason(input.reason);

  const actorCountry = normaliseCountryCode(input.actor.scopeCountryCode);
  if (actorCountry) {
    if (!scope.countryCode || scope.countryCode !== actorCountry) {
      throw new ApiError(403, "out_of_scope", "This activation change is outside your assigned region.");
    }
  }

  const beforeRows = await loadActivationRows({ fresh: true });
  const currentRows = rowsFor(beforeRows, definition.key);
  const existing = currentRows.find((row) => compareScope(row, scope));
  if (!existing) {
    throw new ApiError(404, "activation_not_found", "There is no saved rule for that exact scope.");
  }
  const before = targetEvaluation(definition, currentRows, scope);
  const after = targetEvaluation(
    definition,
    currentRows.filter((row) => !compareScope(row, scope)),
    scope
  );

  await prisma.$transaction(async (tx) => {
    await tx.verticalActivation.delete({ where: { id: existing.id } });
    await recordAudit({
      tx,
      actorId: input.actor.id,
      action: "vertical.cleared",
      entity: "VerticalActivation",
      entityId: existing.id,
      metadata: {
        verticalKey: definition.key,
        ...scopeMetadata(scope),
        deleteReason: reason,
        before: {
          status: before.status,
          reason: before.reason,
          effectiveScope: before.scope,
          source: before.source,
          storedStatus: existing.status
        },
        after: {
          status: after.status,
          reason: after.reason,
          effectiveScope: after.scope,
          source: after.source
        }
      }
    });
  });

  clearVerticalActivationCache();
  const refreshed = await listVerticalControls({ fresh: true });
  const control = refreshed.verticals.find((entry) => entry.key === definition.key);
  if (!control) throw new ApiError(500, "internal_error", "The activation record could not be reloaded.");
  return control;
}
