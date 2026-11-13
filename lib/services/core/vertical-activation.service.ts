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
 * is reachable. The precedence is deliberately simple and auditable:
 *
 *   1. a GLOBAL row wins everywhere, regardless of country/city rows;
 *   2. otherwise a CITY row applies inside that city;
 *   3. otherwise a COUNTRY row applies inside that country;
 *   4. otherwise the module's verified registry status is used
 *      (live -> LIVE, preview -> PREVIEW, setup/coming -> DISABLED).
 *
 * A DISABLED module has no public storefront. PREVIEW is reachable only by an
 * authenticated Control Center user. LIVE is the normal public state. The
 * resolver is fail-closed only where an actual DISABLED/PREVIEW state applies:
 * a module with no rows keeps its existing registry behaviour, which is why
 * NaijaShop stays usable (registry: live) until an operator changes it.
 *
 * Enforcement is intentionally explicit. Only the verticals listed in
 * `VERTICAL_ENFORCEMENT` consult this service on their routes; the admin UI
 * states that a stored row for any other module is not yet effective.
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
  /** A GLOBAL row is deciding for this country/city target. */
  globalOverrideActive: boolean;
  /** A matching local row exists but is overridden by GLOBAL. */
  localOverrideIgnored: boolean;
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
    summary: "Catalogue, checkout, product routes and new seller listings consult activation.",
    points: [
      "GET /api/products and GET /api/products/[id]",
      "POST /api/checkout (new orders only; existing orders stay readable)",
      "POST/PATCH /api/seller/products (new or republished listings)",
      "/api/products/availability (public homepage + Shop navigation signal)",
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
    wired: false,
    state: "NOT_WIRED",
    summary: "Stay routes and services do not consult activation yet. A saved row has no runtime effect.",
    points: []
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
  if (input.scope === "GLOBAL") return "All locations (GLOBAL override)";
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
 * Pure effective-state resolver. Exported so the acceptance script can prove
 * precedence without depending on database state.
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
  const rows = input.rows.filter((row) => isStatus(row.status));
  const registryStatus = input.registryStatus;

  const base = {
    verticalKey: input.verticalKey,
    registryStatus,
    countryCode,
    cityCode
  };

  const global = rows.find((row) => row.scopeType === "GLOBAL");
  if (global) {
    const local = rows.find((row) => {
      if (row.scopeType === "COUNTRY") {
        return Boolean(countryCode) && normaliseCountryCode(row.countryCode) === countryCode;
      }
      if (row.scopeType === "CITY") {
        return (
          Boolean(countryCode) &&
          Boolean(cityCode) &&
          normaliseCountryCode(row.countryCode) === countryCode &&
          normaliseCityCode(row.cityCode) === cityCode
        );
      }
      return false;
    });
    return {
      ...base,
      status: global.status as VerticalActivationStatusName,
      scope: "GLOBAL",
      scopeLabel: scopeLabel({ scope: "GLOBAL", countryCode, cityCode }),
      reason: global.reason,
      source: "database",
      rowId: global.id,
      globalOverrideActive: Boolean(countryCode || cityCode),
      localOverrideIgnored: Boolean(local)
    };
  }

  if (countryCode) {
    if (cityCode) {
      const city = rows.find(
        (row) =>
          row.scopeType === "CITY" &&
          normaliseCountryCode(row.countryCode) === countryCode &&
          normaliseCityCode(row.cityCode) === cityCode
      );
      if (city) {
        return {
          ...base,
          status: city.status as VerticalActivationStatusName,
          scope: "CITY",
          scopeLabel: scopeLabel({ scope: "CITY", countryCode, cityCode }),
          reason: city.reason,
          source: "database",
          rowId: city.id,
          globalOverrideActive: false,
          localOverrideIgnored: false
        };
      }
    }

    const country = rows.find(
      (row) => row.scopeType === "COUNTRY" && normaliseCountryCode(row.countryCode) === countryCode
    );
    if (country) {
      return {
        ...base,
        status: country.status as VerticalActivationStatusName,
        scope: "COUNTRY",
        scopeLabel: scopeLabel({ scope: "COUNTRY", countryCode, cityCode }),
        reason: country.reason,
        source: "database",
        rowId: country.id,
        globalOverrideActive: false,
        localOverrideIgnored: false
      };
    }
  }

  return {
    ...base,
    status: registryStatusToActivation(registryStatus),
    scope: "REGISTRY",
    scopeLabel: scopeLabel({ scope: "REGISTRY", countryCode, cityCode }),
    reason: `Registry status is ${registryStatus}; no activation rule applies.`,
    source: "registry",
    rowId: null,
    globalOverrideActive: false,
    localOverrideIgnored: false
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
 * Upsert one activation rule. A GLOBAL row is accepted here but, by contract,
 * overrides country/city rows until it is cleared.
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
 * Remove one rule so the scope inherits its next source (GLOBAL -> country ->
 * registry). The deletion is audited with the same before/after contract.
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
