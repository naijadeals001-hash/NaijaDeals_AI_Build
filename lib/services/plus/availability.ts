import type { PlusBillingPeriod, PlusPlanTerm } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { COUNTRIES, formatMoney } from "@/lib/config/commerce";
import { isSafeHref } from "./validation";

/**
 * Public Plus+ availability.
 *
 * Eligibility comes only from an ACTIVE plan, an enabled PlusPlanCountry row
 * and — when the plan has a positive price — an approved, currently effective
 * term and `paidActivationApproved`. Marketplace commerce configuration is not
 * consulted here and cannot make a country eligible.
 */

export type PlusAvailablePlan = {
  id: string;
  code: string;
  name: string;
  priceMinor: string | null;
  currency: string;
  billingPeriod: PlusBillingPeriod | null;
  priceLabel: string;
  termVersion: number | null;
  termsUrl: string | null;
  cancellationSummary: string | null;
};

export type PlusCountryAvailability = {
  code: string;
  name: string;
  currency: string;
  available: boolean;
  plans: PlusAvailablePlan[];
};

export type PlusAvailability = {
  countries: PlusCountryAvailability[];
  plans: PlusAvailablePlan[];
  membershipOpen: boolean;
  paidActivationApproved: boolean;
  /** No Plus+ subscription checkout integration exists in this build. */
  checkoutConfigured: false;
  activePlanCount: number;
  availableCountryCodes: string[];
};

const PERIOD_SUFFIX: Record<PlusBillingPeriod, string> = {
  MONTHLY: "/month",
  ANNUAL: "/year",
  NONE: ""
};

export function planPriceLabel(priceMinor: bigint | null, currency: string, billingPeriod: PlusBillingPeriod | null): string {
  if (priceMinor === null) return "Price not published";
  if (priceMinor === BigInt(0)) return "Free";
  const amount = formatMoney(priceMinor, currency);
  return `${amount}${billingPeriod ? PERIOD_SUFFIX[billingPeriod] : ""}`;
}

function effectiveTerm(terms: PlusPlanTerm[], now: Date): PlusPlanTerm | null {
  return (
    terms.find(
      (term) =>
        term.approvedAt !== null &&
        term.effectiveFrom.getTime() <= now.getTime() &&
        (term.effectiveTo === null || term.effectiveTo.getTime() > now.getTime())
    ) ?? null
  );
}

export async function getPlusAvailability(now: Date = new Date()): Promise<PlusAvailability> {
  const plans = await prisma.plusPlan.findMany({
    where: { status: "ACTIVE" },
    include: {
      countries: { where: { enabled: true } },
      terms: { where: { approvedAt: { not: null } }, orderBy: { version: "desc" } }
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
  });

  const byCountry = new Map<string, PlusAvailablePlan[]>();
  const availablePlans = new Map<string, PlusAvailablePlan>();
  let anyPaidActivationApproved = false;

  for (const plan of plans) {
    const priced = plan.priceMinor !== null && plan.priceMinor > BigInt(0);
    const term = effectiveTerm(plan.terms, now);
    if (priced && (!plan.paidActivationApproved || !term)) continue;
    if (priced && plan.paidActivationApproved && term) anyPaidActivationApproved = true;

    const displayMinor = priced ? term?.priceMinor ?? plan.priceMinor : plan.priceMinor;
    const currency = priced && term ? term.currency : plan.currency;
    const billingPeriod = term?.billingPeriod ?? plan.billingPeriod;
    const entry: PlusAvailablePlan = {
      id: plan.id,
      code: plan.code,
      name: plan.name,
      priceMinor: displayMinor === null ? null : displayMinor.toString(),
      currency,
      billingPeriod,
      priceLabel: planPriceLabel(displayMinor, currency, billingPeriod),
      termVersion: term?.version ?? null,
      termsUrl: term?.termsUrl && isSafeHref(term.termsUrl) ? term.termsUrl : null,
      cancellationSummary: term?.cancellationSummary ?? null
    };
    availablePlans.set(plan.id, entry);

    for (const country of plan.countries) {
      const current = byCountry.get(country.countryCode) ?? [];
      current.push(entry);
      byCountry.set(country.countryCode, current);
    }
  }

  const countries: PlusCountryAvailability[] = Object.values(COUNTRIES).map((country) => {
    const plansForCountry = byCountry.get(country.code) ?? [];
    return {
      code: country.code,
      name: country.name,
      currency: country.currency,
      available: plansForCountry.length > 0,
      plans: plansForCountry
    };
  });

  const availableCountryCodes = countries.filter((country) => country.available).map((country) => country.code);

  return {
    countries,
    plans: [...availablePlans.values()],
    membershipOpen: availableCountryCodes.length > 0,
    paidActivationApproved: anyPaidActivationApproved,
    checkoutConfigured: false,
    activePlanCount: plans.length,
    availableCountryCodes
  };
}
