/**
 * Client for the NaijaDeals Plus+ Control Center API.
 *
 * The backend owns these routes and their schemas:
 *   /api/admin/plus/overview, /content, /plans, /benefits, /promotions
 *
 * Two rules shape this module:
 *
 * 1. Nothing is assumed. Field names are read tolerantly because the admin
 *    surface must keep working while the backend adds optional fields, but a
 *    missing value stays missing. Country availability comes only from the
 *    server (`available`, with the older `planEnabled` flag as a fallback);
 *    marketplace configuration is never treated as eligibility.
 * 2. No mutation is reported as successful before the response arrives. Every
 *    mutation resolves to the server's own payload (and message when it sends
 *    one) or throws a PlusApiError carrying the server's status and error code
 *    verbatim, so panels can surface refusals such as
 *    `paid_activation_not_approved` instead of inventing success.
 *
 * Request bodies are built by `plus-payloads.ts`; the server field names there
 * (`key`, `href`, `code`, `version`, `effectiveFrom`, `kind`, `body`,
 * `enabled`) are the authoritative contract.
 */

import type {
  PlusBenefitPayload,
  PlusContentPayload,
  PlusCountryPayload,
  PlusPaidActivationPayload,
  PlusPlanPayload,
  PlusPlanPricingPayload,
  PlusPlanTermPayload,
  PlusPromotionPayload,
  PromotionKind
} from "./plus-payloads";

export type PlusJson = Record<string, unknown>;

export class PlusApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = "PlusApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get permissionDenied() {
    return this.status === 403;
  }
}

function isRecord(value: unknown): value is PlusJson {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: PlusJson, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}

function readBoolean(record: PlusJson, keys: string[]): boolean | null {
  for (const key of keys) {
    const value = record[key];
    if (value === true) return true;
    if (value === false) return false;
  }
  return null;
}

function readInteger(record: PlusJson, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isInteger(value)) return value;
    if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
      const parsed = Number(value.trim());
      if (Number.isSafeInteger(parsed)) return parsed;
    }
  }
  return null;
}

/** Exact integer minor units as digits, with no arithmetic and no rounding. */
function readMinorUnits(record: PlusJson, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
    if (typeof value === "string" && /^\d+$/.test(value.trim())) return value.trim().replace(/^0+(?=\d)/, "");
  }
  return null;
}

function readMessage(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  return readString(payload, ["message", "detail"]);
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(method === "GET" || method === "HEAD" ? {} : { "Content-Type": "application/json" }),
        ...(init?.headers ?? {})
      }
    });
  } catch {
    throw new PlusApiError("Could not reach the Plus+ API. Check the connection and try again.", 0, "network_error");
  }

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`.trim();
    let code: string | undefined;
    let details: unknown;
    try {
      const body: unknown = await response.json();
      if (isRecord(body)) {
        const serverMessage = readString(body, ["error", "message"]);
        if (serverMessage) message = serverMessage;
        const serverCode = readString(body, ["code"]);
        if (serverCode) code = serverCode;
        if (body.details !== undefined) details = body.details;
      }
    } catch {
      // Non-JSON error (proxy page, 404 route): keep the HTTP status message.
    }
    throw new PlusApiError(message, response.status, code, details);
  }

  if (response.status === 204) return undefined as T;
  try {
    return (await response.json()) as T;
  } catch {
    throw new PlusApiError("The server response was not valid JSON.", 0, "invalid_response");
  }
}

export type PlusMutationResult = {
  message: string | null;
  payload: unknown;
};

async function mutate(path: string, method: "POST" | "PATCH", body?: unknown): Promise<PlusMutationResult> {
  const payload = await requestJson<unknown>(path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return { message: readMessage(payload), payload };
}

function extractRecords(payload: unknown, collectionKeys: string[]): PlusJson[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (isRecord(payload)) {
    for (const key of collectionKeys) {
      const value = payload[key];
      if (Array.isArray(value)) return value.filter(isRecord);
    }
  }
  throw new PlusApiError("The server returned an unexpected list response.", 0, "invalid_response");
}

function normalizeCountryCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toUpperCase() : null;
}

function readCountryCodes(record: PlusJson, keys: string[]): string[] {
  for (const key of keys) {
    const value = record[key];
    if (!Array.isArray(value)) continue;
    const codes = value
      .map((entry) => {
        if (typeof entry === "string") return normalizeCountryCode(entry);
        if (isRecord(entry)) return normalizeCountryCode(entry.countryCode ?? entry.code ?? entry.iso2);
        return null;
      })
      .filter((code): code is string => Boolean(code));
    return [...new Set(codes)];
  }
  return [];
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

export type PlusFlags = {
  /** null means the server did not report the flag; it is not treated as false. */
  membershipOpen: boolean | null;
  checkoutConfigured: boolean | null;
  paidActivationApproved: boolean | null;
};

export type PlusCountryPlan = {
  id: string | null;
  name: string;
  priceLabel: string | null;
};

export type PlusCountryAvailability = {
  code: string;
  name: string;
  currency: string | null;
  /**
   * True only when the server reports an ACTIVE plan available in the country.
   * `planEnabled` is accepted as a fallback for older responses.
   */
  available: boolean | null;
  plans: PlusCountryPlan[];
};

export type PlusCountLeaf = {
  /** The server's top-level count group, for example `content` or `plans`. */
  group: string;
  /** The leaf name inside the group, for example `total` or `pendingReview`. */
  key: string;
  count: number;
};

export type PlusPlanCountry = {
  code: string;
  name: string;
  enabled: boolean | null;
};

export type PlusPlanTerm = {
  id: string;
  version: number | null;
  status: string;
  priceMinor: string | null;
  currency: string | null;
  billingPeriod: string | null;
  cancellationSummary: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  approvedAt: string | null;
};

export type PlusPlan = {
  id: string;
  name: string;
  code: string | null;
  status: string;
  description: string | null;
  priceMinor: string | null;
  currency: string | null;
  billingPeriod: string | null;
  paidActivationApproved: boolean | null;
  countries: PlusPlanCountry[];
  terms: PlusPlanTerm[];
  approvedTermVersions: number[];
};

export type PlusMembershipRow = {
  id: string;
  member: string | null;
  planName: string | null;
  status: string;
  startedAt: string | null;
};

export type PlusEntitlementRow = {
  id: string;
  member: string | null;
  benefitName: string | null;
  planName: string | null;
  status: string;
  grantedAt: string | null;
};

export type PlusOverview = {
  counts: PlusCountLeaf[];
  flags: PlusFlags;
  plans: PlusPlan[];
  countries: PlusCountryAvailability[];
  /** null when the endpoint did not expose membership records at all. */
  memberships: PlusMembershipRow[] | null;
  /** null when the endpoint did not expose entitlement records at all. */
  entitlements: PlusEntitlementRow[] | null;
};

export function normalizePlanCountry(value: unknown): PlusPlanCountry | null {
  if (typeof value === "string") {
    const code = normalizeCountryCode(value);
    return code ? { code, name: code, enabled: null } : null;
  }
  if (!isRecord(value)) return null;
  const code = normalizeCountryCode(value.countryCode ?? value.code ?? value.iso2);
  if (!code) return null;
  return {
    code,
    name: readString(value, ["name", "countryName"]) ?? code,
    enabled: readBoolean(value, ["enabled", "planEnabled", "active"])
  };
}

function normalizeTerm(term: PlusJson): PlusPlanTerm {
  const approvedAt = readString(term, ["approvedAt", "approvedOn"]);
  return {
    id: readString(term, ["id"]) ?? "",
    version: readInteger(term, ["version"]),
    // Terms have no status column: approval is the `approvedAt` timestamp.
    status: approvedAt ? "APPROVED" : "PENDING_APPROVAL",
    priceMinor: readMinorUnits(term, ["priceMinor", "priceKobo"]),
    currency: readString(term, ["currency", "currencyCode"]),
    billingPeriod: readString(term, ["billingPeriod", "period"]),
    cancellationSummary: readString(term, ["cancellationSummary", "summary"]),
    effectiveFrom: readString(term, ["effectiveFrom", "effectiveAt", "effectiveFromDate"]),
    effectiveTo: readString(term, ["effectiveTo", "endsAt"]),
    approvedAt
  };
}

export function normalizePlan(record: PlusJson): PlusPlan {
  const terms = Array.isArray(record.terms)
    ? record.terms.filter(isRecord).map(normalizeTerm).filter((term) => term.id.length > 0)
    : [];
  const countries = Array.isArray(record.countries)
    ? record.countries.map(normalizePlanCountry).filter((country): country is PlusPlanCountry => country !== null)
    : readCountryCodes(record, ["countryCodes"]).map((code) => ({ code, name: code, enabled: true }));
  const approvedTermVersions = Array.isArray(record.approvedTermVersions)
    ? record.approvedTermVersions
        .map((value) => (typeof value === "number" ? value : Number(value)))
        .filter((value) => Number.isInteger(value))
    : terms.filter((term) => term.status === "APPROVED" && term.version !== null).map((term) => term.version as number);

  return {
    id: readString(record, ["id"]) ?? "",
    name: readString(record, ["name", "title"]) ?? "Unnamed plan",
    code: readString(record, ["code", "slug"]),
    status: (readString(record, ["status"]) ?? "UNKNOWN").toUpperCase(),
    description: readString(record, ["description"]),
    priceMinor: readMinorUnits(record, ["priceMinor", "priceKobo", "price"]),
    currency: readString(record, ["currency", "currencyCode"]),
    billingPeriod: readString(record, ["billingPeriod", "period", "interval"]),
    paidActivationApproved: readBoolean(record, ["paidActivationApproved"]),
    countries,
    terms,
    approvedTermVersions
  };
}

function readPersonName(record: PlusJson): string | null {
  const direct = readString(record, ["member", "userName", "name", "email"]);
  if (direct) return direct;
  const nested = record.user ?? record.customer;
  if (isRecord(nested)) return readString(nested, ["name", "email"]);
  return null;
}

function readNestedPlanName(record: PlusJson): string | null {
  const nested = record.plan;
  if (isRecord(nested)) return readString(nested, ["name", "title"]);
  return readString(record, ["planName"]);
}

function normalizeMemberships(value: unknown): PlusMembershipRow[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter(isRecord).map((row) => ({
    id: readString(row, ["id"]) ?? "",
    member: readPersonName(row),
    planName: readNestedPlanName(row),
    status: (readString(row, ["status"]) ?? "UNKNOWN").toUpperCase(),
    startedAt: readString(row, ["startedAt", "createdAt", "joinedAt"])
  }));
}

function normalizeEntitlements(value: unknown): PlusEntitlementRow[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter(isRecord).map((row) => ({
    id: readString(row, ["id"]) ?? "",
    member: readPersonName(row),
    benefitName:
      readString(row, ["benefitName", "name", "title"]) ??
      (isRecord(row.benefit) ? readString(row.benefit, ["name", "title"]) : null),
    planName: readNestedPlanName(row),
    status: (readString(row, ["status"]) ?? "UNKNOWN").toUpperCase(),
    grantedAt: readString(row, ["grantedAt", "createdAt"])
  }));
}

/**
 * The overview returns nested count groups:
 * `{ content: { total, draft, published, archived }, plans: {...}, ... }`.
 * Flat numeric leaves are still accepted.
 */
function collectCounts(value: unknown, path: string[], out: PlusCountLeaf[]): void {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    const group = path.length > 1 ? path[0] : "overview";
    const key = path.length > 1 ? path.slice(1).join(".") : path[0] ?? "count";
    out.push({ group, key, count: Math.trunc(value) });
    return;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const group = path.length > 1 ? path[0] : "overview";
    const key = path.length > 1 ? path.slice(1).join(".") : path[0] ?? "count";
    out.push({ group, key, count: Number(value.trim()) });
    return;
  }
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) collectCounts(child, [...path, key], out);
  }
}

function normalizeCountryPlans(value: unknown): PlusCountryPlan[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((plan) => ({
    id: readString(plan, ["id"]),
    name: readString(plan, ["name", "title"]) ?? "Unnamed plan",
    priceLabel: readString(plan, ["priceLabel", "price"])
  }));
}

export function normalizeOverview(payload: unknown): PlusOverview {
  if (!isRecord(payload)) {
    throw new PlusApiError("The server returned an unexpected overview response.", 0, "invalid_response");
  }

  const rawFlags = isRecord(payload.flags) ? payload.flags : {};
  const flags: PlusFlags = {
    membershipOpen: readBoolean(rawFlags, ["membershipOpen"]),
    checkoutConfigured: readBoolean(rawFlags, ["checkoutConfigured"]),
    paidActivationApproved: readBoolean(rawFlags, ["paidActivationApproved"])
  };

  const counts: PlusCountLeaf[] = [];
  collectCounts(payload.counts, [], counts);

  const plans = Array.isArray(payload.plans)
    ? payload.plans.filter(isRecord).map(normalizePlan).filter((plan) => plan.id.length > 0)
    : [];

  const countries = Array.isArray(payload.countries)
    ? payload.countries
        .filter(isRecord)
        .map((country) => {
          const code = normalizeCountryCode(country.code ?? country.countryCode ?? country.iso2);
          if (!code) return null;
          return {
            code,
            name: readString(country, ["name", "countryName"]) ?? code,
            currency: readString(country, ["currency", "currencyCode"]),
            available: readBoolean(country, [
              "available",
              "planEnabled",
              "plusPlanEnabled",
              "membershipEnabled",
              "planAvailable",
              "eligible"
            ]),
            plans: normalizeCountryPlans(country.plans)
          } satisfies PlusCountryAvailability;
        })
        .filter((country): country is PlusCountryAvailability => country !== null)
    : [];

  const memberships = normalizeMemberships(payload.memberships ?? payload.members);
  const entitlements = normalizeEntitlements(payload.entitlements);

  return { counts, flags, plans, countries, memberships, entitlements };
}

/* ------------------------------------------------------------------ */
/* Service-awareness content                                           */
/* ------------------------------------------------------------------ */

export type PlusContentItem = {
  id: string;
  key: string;
  title: string;
  description: string;
  imageUrl: string | null;
  imageAlt: string | null;
  href: string | null;
  serviceKey: string | null;
  sortOrder: number | null;
  language: string | null;
  countries: string[];
  startsAt: string | null;
  endsAt: string | null;
  status: string;
  publishedAt: string | null;
};

export function normalizeContent(record: PlusJson): PlusContentItem {
  const nestedImage = isRecord(record.image) ? record.image : null;
  return {
    id: readString(record, ["id"]) ?? "",
    key: readString(record, ["key"]) ?? "",
    title: readString(record, ["title", "name"]) ?? "Untitled card",
    description: readString(record, ["description", "body"]) ?? "",
    imageUrl:
      readString(record, ["imageUrl", "imagePath"]) ?? (nestedImage ? readString(nestedImage, ["url", "src"]) : null),
    imageAlt:
      readString(record, ["imageAlt", "alt"]) ?? (nestedImage ? readString(nestedImage, ["alt", "alternativeText"]) : null),
    // The server column is `href`; older payloads used `destination`.
    href: readString(record, ["href", "destination", "linkUrl"]),
    serviceKey: readString(record, ["serviceKey", "service"]),
    sortOrder: readInteger(record, ["sortOrder", "order", "position"]),
    language: readString(record, ["language", "locale"]),
    countries: readCountryCodes(record, ["countries", "countryCodes"]),
    startsAt: readString(record, ["startsAt", "startsOn", "startAt"]),
    endsAt: readString(record, ["endsAt", "endsOn", "endAt"]),
    status: (readString(record, ["status"]) ?? "UNKNOWN").toUpperCase(),
    publishedAt: readString(record, ["publishedAt"])
  };
}

/* ------------------------------------------------------------------ */
/* Benefits                                                            */
/* ------------------------------------------------------------------ */

export type PlusBenefit = {
  id: string;
  key: string;
  title: string;
  description: string;
  planId: string | null;
  planName: string | null;
  status: string;
  publishedAt: string | null;
};

export function normalizeBenefit(record: PlusJson): PlusBenefit {
  const nestedPlan = isRecord(record.plan) ? record.plan : null;
  return {
    id: readString(record, ["id"]) ?? "",
    key: readString(record, ["key"]) ?? "",
    title: readString(record, ["title", "name"]) ?? "Untitled benefit",
    description: readString(record, ["description", "body"]) ?? "",
    planId: readString(record, ["planId"]) ?? (nestedPlan ? readString(nestedPlan, ["id"]) : null),
    planName: nestedPlan ? readString(nestedPlan, ["name", "title"]) : readString(record, ["planName"]),
    status: (readString(record, ["status"]) ?? "UNKNOWN").toUpperCase(),
    publishedAt: readString(record, ["publishedAt"])
  };
}

/* ------------------------------------------------------------------ */
/* Promotions                                                          */
/* ------------------------------------------------------------------ */

export type PlusPromotion = {
  id: string;
  key: string;
  title: string;
  body: string;
  kind: PromotionKind | "UNKNOWN";
  sponsorName: string | null;
  disclosureLabel: string | null;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string | null;
};

function normalizePromotionKind(record: PlusJson): PromotionKind | "UNKNOWN" {
  const rawKind = readString(record, ["kind"])?.toUpperCase();
  if (rawKind === "HOUSE" || rawKind === "SPONSORED") return rawKind;
  // Defensive fallback for pre-contract rows that stored a descriptive `type`.
  const legacy = readString(record, ["type"])?.toUpperCase();
  if (legacy === "SPONSORED" || legacy === "SPONSORED_ADVERTISEMENT") return "SPONSORED";
  if (legacy === "HOUSE" || legacy === "HOUSE_PROMOTION" || legacy === "MEMBER_BENEFIT") return "HOUSE";
  return "UNKNOWN";
}

export function normalizePromotion(record: PlusJson): PlusPromotion {
  return {
    id: readString(record, ["id"]) ?? "",
    key: readString(record, ["key"]) ?? "",
    title: readString(record, ["title", "name"]) ?? "Untitled promotion",
    body: readString(record, ["body", "description"]) ?? "",
    kind: normalizePromotionKind(record),
    sponsorName: readString(record, ["sponsorName", "sponsor", "advertiserName"]),
    disclosureLabel: readString(record, ["disclosureLabel", "disclosure", "sponsoredLabel"]),
    status: (readString(record, ["status"]) ?? "UNKNOWN").toUpperCase(),
    startsAt: readString(record, ["startsAt", "startsOn"]),
    endsAt: readString(record, ["endsAt", "endsOn"]),
    createdAt: readString(record, ["createdAt"])
  };
}

/* ------------------------------------------------------------------ */
/* API surface                                                         */
/* ------------------------------------------------------------------ */

export const plusApi = {
  async getOverview(): Promise<PlusOverview> {
    return normalizeOverview(await requestJson<unknown>("/api/admin/plus/overview"));
  },

  content: {
    async list(): Promise<PlusContentItem[]> {
      const payload = await requestJson<unknown>("/api/admin/plus/content");
      return extractRecords(payload, ["items", "content", "cards", "results", "data"])
        .map(normalizeContent)
        .filter((item) => item.id.length > 0);
    },
    create(input: PlusContentPayload) {
      return mutate("/api/admin/plus/content", "POST", input);
    },
    update(id: string, input: PlusContentPayload) {
      return mutate(`/api/admin/plus/content/${encodeURIComponent(id)}`, "PATCH", input);
    },
    publish(id: string) {
      return mutate(`/api/admin/plus/content/${encodeURIComponent(id)}/publish`, "POST");
    },
    archive(id: string) {
      return mutate(`/api/admin/plus/content/${encodeURIComponent(id)}/archive`, "POST");
    },
    reorder(ids: string[]) {
      return mutate("/api/admin/plus/content/reorder", "POST", { ids });
    }
  },

  plans: {
    async list(): Promise<PlusPlan[]> {
      const payload = await requestJson<unknown>("/api/admin/plus/plans");
      return extractRecords(payload, ["items", "plans", "results", "data"])
        .map(normalizePlan)
        .filter((plan) => plan.id.length > 0);
    },
    create(input: PlusPlanPayload) {
      return mutate("/api/admin/plus/plans", "POST", input);
    },
    update(id: string, input: PlusPlanPricingPayload) {
      return mutate(`/api/admin/plus/plans/${encodeURIComponent(id)}`, "PATCH", input);
    },
    approvePaidActivation(id: string, input: PlusPaidActivationPayload) {
      return mutate(`/api/admin/plus/plans/${encodeURIComponent(id)}`, "PATCH", input);
    },
    addCountry(id: string, input: PlusCountryPayload) {
      return mutate(`/api/admin/plus/plans/${encodeURIComponent(id)}/countries`, "POST", input);
    },
    addTerm(id: string, input: PlusPlanTermPayload) {
      return mutate(`/api/admin/plus/plans/${encodeURIComponent(id)}/terms`, "POST", input);
    },
    approveTerm(id: string, termId: string) {
      return mutate(
        `/api/admin/plus/plans/${encodeURIComponent(id)}/terms/${encodeURIComponent(termId)}/approve`,
        "POST"
      );
    },
    activate(id: string) {
      return mutate(`/api/admin/plus/plans/${encodeURIComponent(id)}/activate`, "POST");
    }
  },

  benefits: {
    async list(): Promise<PlusBenefit[]> {
      const payload = await requestJson<unknown>("/api/admin/plus/benefits");
      return extractRecords(payload, ["items", "benefits", "results", "data"])
        .map(normalizeBenefit)
        .filter((benefit) => benefit.id.length > 0);
    },
    create(input: PlusBenefitPayload) {
      return mutate("/api/admin/plus/benefits", "POST", input);
    },
    update(id: string, input: PlusBenefitPayload) {
      return mutate(`/api/admin/plus/benefits/${encodeURIComponent(id)}`, "PATCH", input);
    },
    publish(id: string) {
      return mutate(`/api/admin/plus/benefits/${encodeURIComponent(id)}/publish`, "POST");
    },
    archive(id: string) {
      return mutate(`/api/admin/plus/benefits/${encodeURIComponent(id)}/archive`, "POST");
    }
  },

  promotions: {
    async list(): Promise<PlusPromotion[]> {
      const payload = await requestJson<unknown>("/api/admin/plus/promotions");
      return extractRecords(payload, ["items", "promotions", "results", "data"])
        .map(normalizePromotion)
        .filter((promotion) => promotion.id.length > 0);
    },
    create(input: PlusPromotionPayload) {
      return mutate("/api/admin/plus/promotions", "POST", input);
    },
    update(id: string, input: PlusPromotionPayload) {
      return mutate(`/api/admin/plus/promotions/${encodeURIComponent(id)}`, "PATCH", input);
    },
    submit(id: string) {
      return mutate(`/api/admin/plus/promotions/${encodeURIComponent(id)}/submit`, "POST");
    },
    approve(id: string) {
      return mutate(`/api/admin/plus/promotions/${encodeURIComponent(id)}/approve`, "POST");
    },
    reject(id: string, reason: string) {
      return mutate(`/api/admin/plus/promotions/${encodeURIComponent(id)}/reject`, "POST", { reason });
    },
    publish(id: string) {
      return mutate(`/api/admin/plus/promotions/${encodeURIComponent(id)}/publish`, "POST");
    },
    archive(id: string) {
      return mutate(`/api/admin/plus/promotions/${encodeURIComponent(id)}/archive`, "POST");
    }
  }
};

/** Capability set resolved on the server and passed to the client workspace. */
export type PlusCapabilities = {
  read: boolean;
  writeContent: boolean;
  publishContent: boolean;
  configureMembership: boolean;
  approveAdvertiser: boolean;
};
