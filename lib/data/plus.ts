import { prisma } from "@/lib/prisma";
import { getPlusAvailability, type PlusAvailability, type PlusCountryAvailability } from "@/lib/services/plus/availability";
import {
  isSafeHref,
  isSafeImageUrl,
  targetsMarketplace,
  windowContains
} from "@/lib/services/plus/validation";

/**
 * Public Plus+ landing-page data.
 *
 * Everything merchandised on the page comes from databases rows the Control
 * Center can audit. There is no hardcoded plan, card, benefit or promotion.
 * A read failure returns an explicit unavailable state so the page can answer
 * honestly with HTTP 200 instead of crashing or falling back to invented data.
 */

export type PlusAwarenessCard = {
  id: string;
  key: string;
  title: string;
  description: string;
  imageUrl: string;
  imageAlt: string;
  href: string;
  serviceKey: string | null;
  countries: string[];
};

export type PlusPublicBenefit = {
  id: string;
  key: string;
  title: string;
  description: string;
  imageUrl: string | null;
  imageAlt: string | null;
  planName: string;
  planCode: string;
  priceLabel: string;
  eligibleCountries: Array<{ code: string; name: string }>;
};

export type PlusPublicPromotion = {
  id: string;
  key: string;
  kind: "HOUSE" | "SPONSORED";
  title: string;
  body: string;
  imageUrl: string | null;
  imageAlt: string | null;
  href: string | null;
  sponsorName: string | null;
  disclosureLabel: string;
  countries: string[];
};

export type PlusPublicFlags = {
  membershipOpen: boolean;
  checkoutConfigured: false;
  paidActivationApproved: boolean;
  activePlanCount: number;
};

export type PlusPublicData = {
  state: "ready" | "unavailable";
  cards: PlusAwarenessCard[];
  benefits: PlusPublicBenefit[];
  promotions: PlusPublicPromotion[];
  countries: PlusCountryAvailability[];
  flags: PlusPublicFlags;
};

export const plusUnavailableData: PlusPublicData = {
  state: "unavailable",
  cards: [],
  benefits: [],
  promotions: [],
  countries: [],
  flags: {
    membershipOpen: false,
    checkoutConfigured: false,
    paidActivationApproved: false,
    activePlanCount: 0
  }
};

function safeImage(imageUrl: string | null, imageAlt: string | null): { imageUrl: string | null; imageAlt: string | null } {
  if (imageUrl && imageAlt && isSafeImageUrl(imageUrl)) return { imageUrl, imageAlt };
  return { imageUrl: null, imageAlt: null };
}

function planCountryIndex(availability: PlusAvailability): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const country of availability.countries) {
    for (const plan of country.plans) {
      const current = index.get(plan.id) ?? [];
      current.push(country.code);
      index.set(plan.id, current);
    }
  }
  return index;
}

export async function loadPlusPublicData(now: Date = new Date()): Promise<PlusPublicData> {
  try {
    const [availability, contentRows, benefitRows, promotionRows] = await Promise.all([
      getPlusAvailability(now),
      prisma.plusContentCard.findMany({
        where: { status: "PUBLISHED", language: "en" },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        take: 40
      }),
      prisma.plusBenefit.findMany({
        where: { status: "PUBLISHED" },
        include: { plan: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        take: 40
      }),
      prisma.plusPromotion.findMany({
        where: { status: "PUBLISHED" },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        take: 20
      })
    ]);

    const cards: PlusAwarenessCard[] = contentRows
      .filter(
        (card) =>
          windowContains(now, card.startsAt, card.endsAt) &&
          targetsMarketplace(card.countries) &&
          isSafeImageUrl(card.imageUrl) &&
          Boolean(card.imageAlt.trim()) &&
          isSafeHref(card.href)
      )
      .map((card) => ({
        id: card.id,
        key: card.key,
        title: card.title,
        description: card.description,
        imageUrl: card.imageUrl,
        imageAlt: card.imageAlt,
        href: card.href,
        serviceKey: card.serviceKey,
        countries: card.countries
      }));

    const planCountries = planCountryIndex(availability);
    const availablePlanById = new Map(availability.plans.map((plan) => [plan.id, plan]));
    const benefits: PlusPublicBenefit[] = [];
    for (const benefit of benefitRows) {
      if (!windowContains(now, benefit.startsAt, benefit.endsAt)) continue;
      if (!targetsMarketplace(benefit.countries)) continue;
      if (!benefit.planId || !benefit.plan) continue;
      const availablePlan = availablePlanById.get(benefit.planId);
      if (!availablePlan) continue;
      const countriesForPlan = planCountries.get(benefit.planId) ?? [];
      const eligibleCodes = benefit.countries.length > 0
        ? countriesForPlan.filter((code) => benefit.countries.includes(code))
        : countriesForPlan;
      if (eligibleCodes.length === 0) continue;
      const media = safeImage(benefit.imageUrl, benefit.imageAlt);
      benefits.push({
        id: benefit.id,
        key: benefit.key,
        title: benefit.title,
        description: benefit.description,
        imageUrl: media.imageUrl,
        imageAlt: media.imageAlt,
        planName: benefit.plan.name,
        planCode: benefit.plan.code,
        priceLabel: availablePlan.priceLabel,
        eligibleCountries: eligibleCodes.map((code) => {
          const country = availability.countries.find((candidate) => candidate.code === code);
          return { code, name: country?.name ?? code };
        })
      });
    }

    const promotions: PlusPublicPromotion[] = [];
    for (const promotion of promotionRows) {
      if (!windowContains(now, promotion.startsAt, promotion.endsAt)) continue;
      if (!targetsMarketplace(promotion.countries)) continue;
      if (promotion.kind === "SPONSORED") {
        if (!promotion.sponsorName?.trim() || !promotion.disclosureLabel?.trim()) continue;
      }
      const media = safeImage(promotion.imageUrl, promotion.imageAlt);
      promotions.push({
        id: promotion.id,
        key: promotion.key,
        kind: promotion.kind,
        title: promotion.title,
        body: promotion.body,
        imageUrl: media.imageUrl,
        imageAlt: media.imageAlt,
        href: promotion.href && isSafeHref(promotion.href) ? promotion.href : null,
        sponsorName: promotion.kind === "SPONSORED" ? promotion.sponsorName : null,
        disclosureLabel: promotion.kind === "SPONSORED" ? promotion.disclosureLabel : "NaijaDeals",
        countries: promotion.countries
      });
    }

    return {
      state: "ready",
      cards,
      benefits,
      promotions,
      countries: availability.countries,
      flags: {
        membershipOpen: availability.membershipOpen,
        checkoutConfigured: false,
        paidActivationApproved: availability.paidActivationApproved,
        activePlanCount: availability.activePlanCount
      }
    };
  } catch {
    // The failure is reported on the page as an unavailable configuration;
    // database details never reach the response.
    console.error("[plus] public configuration could not be read");
    return plusUnavailableData;
  }
}

export type PlusStatusLabels = {
  membership: string;
  checkout: string;
  billing: string;
  plan: string;
};

export function plusStatusLabels(data: PlusPublicData): PlusStatusLabels {
  if (data.state === "unavailable") {
    return {
      membership: "Status unavailable",
      checkout: "No checkout",
      billing: "Unavailable",
      plan: "Status unavailable"
    };
  }
  return {
    membership: data.flags.membershipOpen ? "Membership open" : "Membership not open",
    checkout: "No checkout",
    billing: "Unavailable",
    plan:
      data.flags.activePlanCount === 0
        ? "Not configured"
        : `${data.flags.activePlanCount} ${data.flags.activePlanCount === 1 ? "plan" : "plans"} active`
  };
}

export function plusMembershipSummary(data: PlusPublicData): string {
  if (data.state === "unavailable") {
    return "The Plus+ configuration could not be read for this request, so availability is reported as unavailable.";
  }
  if (data.flags.membershipOpen) {
    return "At least one approved plan is enabled for a country. This page still has no checkout, so it cannot enrol you.";
  }
  return "It is not open: no plan, price, exclusive benefit or billing setup has been approved for any country.";
}

export type PlusFaqItem = { question: string; answer: string };

export const plusFaqs: PlusFaqItem[] = [
  {
    question: "Is Plus+ available now?",
    answer:
      "Availability is read from the current plan configuration. A country is only eligible when an active plan is enabled for it and, if the plan is priced, its approved commercial terms are effective. This page has no join flow regardless of status."
  },
  {
    question: "Can I pay, start a trial or pre-register?",
    answer:
      "No. This build contains no Plus+ billing form, trial or payment step, and it does not collect waitlist or email details."
  },
  {
    question: "Which exclusive benefits are included?",
    answer:
      "Only approved benefits attached to an available plan appear. Standard NaijaDeals services are not Plus+ benefits and are never relabelled as such."
  },
  {
    question: "Which countries can join?",
    answer:
      "Only countries shown as Available in the eligibility section. Until a Plus+ plan is enabled for a country, it remains Not yet available. Marketplace delivery or checkout configuration is not Plus+ eligibility."
  },
  {
    question: "Does Plus+ change my existing orders, wallet or service access?",
    answer:
      "No. This page attaches no membership to any account and changes no order, wallet or service terms."
  },
  {
    question: "How will I know when membership opens?",
    answer:
      "This page is the public source of truth in this build. There is no Plus+ waitlist or notification signup collecting contact details."
  },
  {
    question: "Why does the page show other NaijaDeals services?",
    answer:
      "The ecosystem link opens the real service directory. Those services have their own pricing and terms; they are not included with Plus+."
  }
];
