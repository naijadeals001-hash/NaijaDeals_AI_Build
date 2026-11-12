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

/**
 * Plus+-scoped service readiness.
 *
 * The shared service registry (`lib/data/public-services.ts`) carries catalogue
 * statuses; this map is deliberately separate so the Plus+ page never inherits a
 * blanket "LIVE" label. A label is only "Verified" when a recorded executed
 * suite or document covers the service's main journey — see
 * `docs/plus/service-readiness-audit.md` for the evidence and residual gaps.
 *
 * Readiness is not launch status and not country eligibility. Plus+ eligibility
 * remains derived only from active plans (`lib/services/plus/availability.ts`).
 */
export type PlusServiceReadinessLabel = "Verified" | "Available — limited verification" | "Preview";

export type PlusServiceReadiness = {
  serviceKey: string;
  label: PlusServiceReadinessLabel;
  /** What the label covers, and what it explicitly does not claim. */
  scope: string;
  /** Exact suite or document supporting "Verified". */
  evidence: string;
  /** Known gap that remains even where the label is Verified. */
  residualGap: string;
  /**
   * Plus+-scoped display copy used only when the registry description states a
   * capability the implementation does not have. Other cards keep their
   * Control Center description unchanged.
   */
  displayDescription?: string;
};

export const plusServiceReadiness: Record<string, PlusServiceReadiness> = {
  shop: {
    serviceKey: "shop",
    label: "Available — limited verification",
    scope: "Storefront and discovery suites passed; checkout was not re-run at this HEAD.",
    evidence: "naijashop-qa.cjs 43/43, naijashop-four-card-qa.cjs 70/70, naijashop-mobile-qa.cjs 85/85; marketplace-tests.ts 13/13 and 12/13",
    residualGap: "Full Shop suite not re-run after 2026-11-12 escrow repairs; seller payouts, receipts and wholesale pricing are not started.",
  },
  drive: {
    serviceKey: "drive",
    label: "Available — limited verification",
    scope: "Pickup verification, receipts and ratings passed; the quote/dispatch suite predates the pickup gate.",
    evidence: "drive-verification-rating-acceptance.ts 172/172; drive-tests.ts 28/28 recorded 2026-11-03",
    residualGap: "Quote/dispatch journey not re-run at HEAD; rider notification route, driver documents and driver payouts are blocked.",
  },
  eats: {
    serviceKey: "eats",
    label: "Verified",
    scope: "Discovery, basket, kitchen, dispatch, rider and onboarding journeys executed.",
    evidence: "naijaeats-functional-check.cjs 23/23, naijaeats-cart-check.cjs 13/13, naijaeats-operator-check.cjs 9/9, naijaeats-delivery-e2e.cjs 22/22, naijaeats-dispatch-failure.cjs 6/6, partner-lifecycle-tests.mjs 9/9",
    residualGap: "Demo kitchens only; no real restaurant onboarding run; no approved delivery fee.",
  },
  send: {
    serviceKey: "send",
    label: "Verified",
    scope: "Marketplace booking, transport state machine, tracking and provider onboarding executed.",
    evidence: "naijasend-e2e.cjs 46/46, naijasend-transport-e2e.cjs 37/37",
    residualGap: "No contracted carrier APIs; enterprise, air/sea/rail and turn-by-turn navigation are blocked.",
  },
  gigs: {
    serviceKey: "gigs",
    label: "Verified",
    scope: "Discovery, booking/escrow, professional verification, reviews and earnings executed.",
    evidence: "gigs-e2e-tests.mjs 42/42, gigs-journey-browser.cjs 20/20",
    residualGap: "No KYC/document verification or professional payouts; commission is inherited and unapproved.",
  },
  stay: {
    serviceKey: "stay",
    label: "Verified",
    scope: "Discovery, atomic holds, payment, cancellation and reviews executed.",
    evidence: "naijastay-e2e.cjs 25/25 including the simultaneous-hold race",
    residualGap: "No real host supply or host payout; guest messaging and admin UI are not complete.",
  },
  fresh: {
    serviceKey: "fresh",
    label: "Verified",
    scope: "Storefront, basket/checkout, farm dispatch and bulk quotes executed.",
    evidence: "naijafresh-responsive-qa.cjs 401/401, naijafresh-e2e.cjs 51/51",
    residualGap: "Demo farms/listings only; real farmer onboarding and commercial terms remain blocked.",
  },
  stream: {
    serviceKey: "stream",
    label: "Verified",
    scope: "Catalogue/playback, playlists, creator upload, royalties and premium flows executed.",
    evidence: "stream-tests.mjs 23/23, stream-upload-verify.cjs 11/11, stream-royalty-tests.ts 8/8, stream-royalty-flow.mjs 7/7, stream-premium-verify.cjs 11/11",
    residualGap: "No licensed catalogue or artist payout; creator rooms are not implemented.",
    displayDescription: "African music, playlists and creator uploads."
  },
  pay: {
    serviceKey: "pay",
    label: "Available — limited verification",
    scope: "Wallet ledger, transfers, escrow, refunds and vendor payouts executed on the local test rail.",
    evidence: "wallet-reconcile.ts CLEAN; payments-funding-webhook-acceptance.ts 24/24; pay-transfer-tests.ts 23/23; escrow suites 156/156, 89/89, 32/32",
    residualGap: "No live payment provider; bills, withdrawals and MFA are not built.",
  },
  earn: {
    serviceKey: "earn",
    label: "Verified",
    scope: "Enrolment, attribution, commission, settlement and recovery executed.",
    evidence: "affiliate-verify.ts 12/12, affiliate-destination-verify.ts 11/11, affiliate-financial-acceptance.ts 6 checks, affiliate-settlement-verify.ts 10/10",
    residualGap: "Only Shop orders are attributable; external affiliate payouts and KYC/tax onboarding are blocked.",
  }
};

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
  /** Plus+-scoped readiness; null for a general card or an unaudited service key. */
  readiness: PlusServiceReadiness | null;
  /** True when a service-keyed card has no audited readiness entry. */
  readinessUnassessed: boolean;
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
      .map((card) => {
        const readiness = card.serviceKey ? plusServiceReadiness[card.serviceKey] ?? null : null;
        return {
          id: card.id,
          key: card.key,
          title: card.title,
          // A Plus+-scoped correction applies only where the registry copy
          // states a capability the implementation does not have.
          description: readiness?.displayDescription ?? card.description,
          imageUrl: card.imageUrl,
          imageAlt: card.imageAlt,
          href: card.href,
          serviceKey: card.serviceKey,
          countries: card.countries,
          readiness,
          readinessUnassessed: Boolean(card.serviceKey) && readiness === null
        };
      });

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
  return "It is not open: no plan, price, member benefit or billing setup has been approved for any country.";
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
    question: "Which member benefits are included?",
    answer:
      "Only approved benefits attached to an available plan appear. They are member benefits, not standard NaijaDeals services, and no benefit is enforced as an entitlement in another service yet."
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
