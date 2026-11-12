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
 *    missing value stays missing. In particular, country eligibility is never
 *    inferred from country configuration: only an explicit server flag counts
 *    as "plan enabled".
 * 2. No mutation is reported as successful before the response arrives. Every
 *    mutation resolves to the server's own payload (and message when it sends
 *    one) or throws a PlusApiError carrying the server's status and error code
 *    verbatim, so panels can surface refusals such as
 *    `paid_activation_not_approved` instead of inventing success.
 */

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

export type PlusCountryAvailability = {
  code: string;
  name: string;
  currency: string | null;
  /**
   * True only when the server explicitly reports a plan enabled for the
   * country. Country configuration alone is never eligibility.
   */
  planEnabled: boolean | null;
};

export type PlusPlanCountry = {
  code: string;
  name: string;
  enabled: boolean | null;
};

export type PlusPlanTerm = {
  id: string;
  version: string | null;
  status: string;
  summary: string | null;
  effectiveAt: string | null;
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
  countries: PlusPlanCountry[];
  terms: PlusPlanTerm[];
  activatedAt: string | null;
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
  counts: Array<{ key: string; count: number }>;
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
    enabled: readBoolean(value, ["planEnabled", "enabled", "active"])
  };
}

export function normalizePlan(record: PlusJson): PlusPlan {
  const terms = Array.isArray(record.terms)
    ? record.terms.filter(isRecord).map((term) => ({
        id: readString(term, ["id"]) ?? "",
        version: readString(term, ["version", "label", "name"]),
        status: (readString(term, ["status"]) ?? "UNKNOWN").toUpperCase(),
        summary: readString(term, ["summary", "description", "body"]),
        effectiveAt: readString(term, ["effectiveAt", "effectiveFrom"]),
        approvedAt: readString(term, ["approvedAt"])
      }))
    : [];
  const countries = Array.isArray(record.countries)
    ? record.countries.map(normalizePlanCountry).filter((country): country is PlusPlanCountry => country !== null)
    : [];

  return {
    id: readString(record, ["id"]) ?? "",
    name: readString(record, ["name", "title"]) ?? "Unnamed plan",
    code: readString(record, ["code", "slug"]),
    status: (readString(record, ["status"]) ?? "UNKNOWN").toUpperCase(),
    description: readString(record, ["description"]),
    priceMinor: readMinorUnits(record, ["priceMinor", "priceKobo", "price"]),
    currency: readString(record, ["currency", "currencyCode"]),
    billingPeriod: readString(record, ["billingPeriod", "period", "interval"]),
    countries,
    terms: terms.filter((term) => term.id.length > 0),
    activatedAt: readString(record, ["activatedAt", "activeFrom"])
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

  const counts: Array<{ key: string; count: number }> = [];
  if (isRecord(payload.counts)) {
    for (const [key, value] of Object.entries(payload.counts)) {
      const numeric =
        typeof value === "number"
          ? value
          : typeof value === "string" && /^\d+$/.test(value.trim())
            ? Number(value.trim())
            : Number.NaN;
      if (Number.isFinite(numeric) && numeric >= 0) {
        counts.push({ key, count: Math.trunc(numeric) });
      }
    }
  }

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
            planEnabled: readBoolean(country, [
              "planEnabled",
              "plusPlanEnabled",
              "membershipEnabled",
              "planAvailable",
              "eligible"
            ])
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
  title: string;
  description: string;
  imageUrl: string | null;
  imageAlt: string | null;
  destination: string | null;
  serviceKey: string | null;
  sortOrder: number | null;
  language: string | null;
  countries: string[];
  startsAt: string | null;
  endsAt: string | null;
  status: string;
  publishedAt: string | null;
};

export type PlusContentInput = {
  title: string;
  description: string;
  imageUrl: string;
  imageAlt: string;
  destination: string;
  serviceKey: string;
  language: string;
  countries: string[];
  startsAt: string | null;
  endsAt: string | null;
  sortOrder?: number;
};

export function normalizeContent(record: PlusJson): PlusContentItem {
  const nestedImage = isRecord(record.image) ? record.image : null;
  return {
    id: readString(record, ["id"]) ?? "",
    title: readString(record, ["title", "name"]) ?? "Untitled card",
    description: readString(record, ["description", "body"]) ?? "",
    imageUrl:
      readString(record, ["imageUrl", "imagePath"]) ?? (nestedImage ? readString(nestedImage, ["url", "src"]) : null),
    imageAlt:
      readString(record, ["imageAlt", "alt"]) ?? (nestedImage ? readString(nestedImage, ["alt", "alternativeText"]) : null),
    destination: readString(record, ["destination", "href", "linkUrl"]),
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
  title: string;
  description: string;
  planId: string | null;
  planName: string | null;
  status: string;
  publishedAt: string | null;
};

export type PlusBenefitInput = {
  title: string;
  description: string;
  planId: string;
};

export function normalizeBenefit(record: PlusJson): PlusBenefit {
  const nestedPlan = isRecord(record.plan) ? record.plan : null;
  return {
    id: readString(record, ["id"]) ?? "",
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

export const PROMOTION_TYPES = ["HOUSE_PROMOTION", "MEMBER_BENEFIT", "SPONSORED_ADVERTISEMENT"] as const;
export type PromotionType = (typeof PROMOTION_TYPES)[number];

export type PlusPromotion = {
  id: string;
  title: string;
  description: string;
  type: PromotionType | "UNKNOWN";
  sponsorName: string | null;
  disclosureLabel: string | null;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string | null;
};

export type PlusPromotionInput = {
  title: string;
  description: string;
  type: PromotionType;
  sponsorName: string | null;
  disclosureLabel: string | null;
  startsAt: string | null;
  endsAt: string | null;
};

export function normalizePromotion(record: PlusJson): PlusPromotion {
  const rawType = (readString(record, ["type", "promotionType"]) ?? "UNKNOWN").toUpperCase();
  return {
    id: readString(record, ["id"]) ?? "",
    title: readString(record, ["title", "name"]) ?? "Untitled promotion",
    description: readString(record, ["description", "body"]) ?? "",
    type: (PROMOTION_TYPES as readonly string[]).includes(rawType) ? (rawType as PromotionType) : "UNKNOWN",
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
    create(input: PlusContentInput) {
      return mutate("/api/admin/plus/content", "POST", input);
    },
    update(id: string, input: PlusContentInput) {
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
    create(input: { name: string; description: string | null; priceMinor: number; currency: string; billingPeriod: string }) {
      return mutate("/api/admin/plus/plans", "POST", input);
    },
    update(id: string, input: { priceMinor: number; currency: string; billingPeriod: string }) {
      return mutate(`/api/admin/plus/plans/${encodeURIComponent(id)}`, "PATCH", input);
    },
    addCountry(id: string, countryCode: string) {
      return mutate(`/api/admin/plus/plans/${encodeURIComponent(id)}/countries`, "POST", { countryCode });
    },
    addTerm(id: string, input: { version: string; summary: string | null; effectiveAt: string | null }) {
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
    create(input: PlusBenefitInput) {
      return mutate("/api/admin/plus/benefits", "POST", input);
    },
    update(id: string, input: PlusBenefitInput) {
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
    create(input: PlusPromotionInput) {
      return mutate("/api/admin/plus/promotions", "POST", input);
    },
    update(id: string, input: PlusPromotionInput) {
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
