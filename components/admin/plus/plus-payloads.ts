/**
 * Plus+ admin request payloads.
 *
 * The server contract is authoritative and is enforced by
 * `lib/services/plus/*.service.ts`. Every payload is built here so the forms
 * and the contract check exercise the same field names:
 *
 * - content: `key` + `href` (not `destination`)
 * - plans: `code`
 * - terms: numeric `version` + `effectiveFrom`
 * - benefits: `key`
 * - promotions: `kind` (HOUSE|SPONSORED) + `body`
 * - plan countries: explicit `enabled`
 *
 * Nothing in this module talks to the network.
 */

export type BillingPeriod = "MONTHLY" | "ANNUAL" | "NONE";
export const BILLING_PERIODS: readonly BillingPeriod[] = ["MONTHLY", "ANNUAL", "NONE"];

export type PromotionKind = "HOUSE" | "SPONSORED";
export const PROMOTION_KINDS: readonly PromotionKind[] = ["HOUSE", "SPONSORED"];

/** Mirrors `parseKey` in lib/services/plus/validation.ts. */
export const PLUS_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{2,79}$/;
/** Mirrors `parsePlanCode` in lib/services/plus/validation.ts. */
export const PLAN_CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{2,49}$/;

export type PlusContentPayload = {
  key: string;
  title: string;
  description: string;
  imageUrl: string;
  imageAlt: string;
  href: string;
  serviceKey: string;
  language: string;
  countries: string[];
  startsAt: string | null;
  endsAt: string | null;
  sortOrder?: number;
};

export type PlusPlanPayload = {
  code: string;
  name: string;
  description: string;
  priceMinor: number;
  currency: string;
  billingPeriod: BillingPeriod;
};

export type PlusPlanPricingPayload = {
  priceMinor: number;
  currency: string;
  billingPeriod: BillingPeriod;
};

export type PlusPaidActivationPayload = { paidActivationApproved: true };

export type PlusPlanTermPayload = {
  version: number;
  effectiveFrom: string;
  effectiveTo?: string;
  billingPeriod: BillingPeriod;
  cancellationSummary?: string;
};

export type PlusBenefitPayload = {
  key: string;
  title: string;
  description: string;
  planId: string;
};

export type PlusPromotionPayload = {
  key: string;
  kind: PromotionKind;
  title: string;
  body: string;
  sponsorName: string | null;
  disclosureLabel: string | null;
  startsAt: string | null;
  endsAt: string | null;
};

export type PlusCountryPayload = {
  countryCode: string;
  enabled: boolean;
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Suggests a server-valid key from human title text.
 *
 * The server key pattern is lowercase letters, digits, hyphens and underscores
 * starting with a letter or digit; it does not allow a colon, so the prefix and
 * slug are joined with a hyphen.
 */
export function suggestKey(prefix: string, value: string, maxLength = 80): string {
  const cleanPrefix = slugify(prefix).slice(0, 20) || "key";
  const room = Math.max(3, maxLength - cleanPrefix.length - 1);
  const slug = slugify(value).slice(0, room).replace(/-+$/g, "") || "entry";
  let candidate = `${cleanPrefix}-${slug}`.slice(0, maxLength).replace(/-+$/g, "");
  if (candidate.length < 3) candidate = `${cleanPrefix}-entry`.slice(0, maxLength);
  return candidate;
}

/** Suggests a server-valid plan code (3-50 chars) from the plan name. */
export function suggestPlanCode(value: string): string {
  return suggestKey("plan", value, 50);
}

export function isValidPlusKey(value: string): boolean {
  return PLUS_KEY_PATTERN.test(value);
}

export function isValidPlanCode(value: string): boolean {
  return PLAN_CODE_PATTERN.test(value);
}

function iso(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function buildContentPayload(input: {
  key: string;
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
}): PlusContentPayload {
  return {
    key: input.key.trim().toLowerCase(),
    title: input.title.trim(),
    description: input.description.trim(),
    imageUrl: input.imageUrl.trim(),
    imageAlt: input.imageAlt.trim(),
    href: input.destination.trim(),
    serviceKey: input.serviceKey,
    language: input.language.trim(),
    countries: [...input.countries],
    startsAt: iso(input.startsAt),
    endsAt: iso(input.endsAt),
    ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder })
  };
}

export function buildPlanPayload(input: {
  code: string;
  name: string;
  description: string;
  priceMinor: number;
  currency: string;
  billingPeriod: BillingPeriod;
}): PlusPlanPayload {
  return {
    code: input.code.trim().toLowerCase(),
    name: input.name.trim(),
    description: input.description.trim(),
    priceMinor: input.priceMinor,
    currency: input.currency.trim().toUpperCase(),
    billingPeriod: input.billingPeriod
  };
}

export function buildPlanPricingPayload(input: {
  priceMinor: number;
  currency: string;
  billingPeriod: BillingPeriod;
}): PlusPlanPricingPayload {
  return {
    priceMinor: input.priceMinor,
    currency: input.currency.trim().toUpperCase(),
    billingPeriod: input.billingPeriod
  };
}

export function buildPaidActivationPayload(): PlusPaidActivationPayload {
  return { paidActivationApproved: true };
}

export function buildPlanTermPayload(input: {
  version: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
  billingPeriod: BillingPeriod;
  cancellationSummary?: string | null;
}): PlusPlanTermPayload {
  const effectiveFrom = iso(input.effectiveFrom);
  if (!effectiveFrom) throw new Error("effectiveFrom must be a valid ISO date.");
  const effectiveTo = input.effectiveTo ? iso(input.effectiveTo) : null;
  const summary = input.cancellationSummary?.trim();
  return {
    version: input.version,
    effectiveFrom,
    ...(effectiveTo ? { effectiveTo } : {}),
    billingPeriod: input.billingPeriod,
    ...(summary ? { cancellationSummary: summary } : {})
  };
}

export function buildBenefitPayload(input: {
  key: string;
  title: string;
  description: string;
  planId: string;
}): PlusBenefitPayload {
  return {
    key: input.key.trim().toLowerCase(),
    title: input.title.trim(),
    description: input.description.trim(),
    planId: input.planId
  };
}

export function buildPromotionPayload(input: {
  key: string;
  kind: PromotionKind;
  title: string;
  body: string;
  sponsorName: string | null;
  disclosureLabel: string | null;
  startsAt: string | null;
  endsAt: string | null;
}): PlusPromotionPayload {
  const sponsored = input.kind === "SPONSORED";
  return {
    key: input.key.trim().toLowerCase(),
    kind: input.kind,
    title: input.title.trim(),
    body: input.body.trim(),
    sponsorName: sponsored ? input.sponsorName?.trim() || null : null,
    disclosureLabel: sponsored ? input.disclosureLabel?.trim() || null : null,
    startsAt: iso(input.startsAt),
    endsAt: iso(input.endsAt)
  };
}

export function buildCountryPayload(countryCode: string, enabled: boolean): PlusCountryPayload {
  return { countryCode: countryCode.trim().toUpperCase(), enabled };
}
