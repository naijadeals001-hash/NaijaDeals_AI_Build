import { prisma } from "@/lib/prisma";
import { getPlusAvailability, type PlusCountryAvailability } from "./availability";

/**
 * Control Center overview for Plus+.
 *
 * Counts describe configuration rows, not customers or money. `checkoutConfigured`
 * is hard false because this build has no Plus+ subscription payment path.
 */

export type PlusOverview = {
  generatedAt: string;
  flags: {
    membershipOpen: boolean;
    checkoutConfigured: false;
    paidActivationApproved: boolean;
  };
  counts: {
    content: { total: number; draft: number; published: number; archived: number };
    plans: { total: number; draft: number; active: number; retired: number };
    memberships: { total: number; invited: number; active: number; pastDue: number; cancelled: number; expired: number };
    benefits: { total: number; draft: number; published: number; archived: number };
    promotions: {
      total: number;
      draft: number;
      pendingReview: number;
      approved: number;
      published: number;
      rejected: number;
      archived: number;
      house: number;
      sponsored: number;
    };
  };
  countries: PlusCountryAvailability[];
  plans: Array<{
    id: string;
    code: string;
    name: string;
    status: string;
    currency: string;
    priceMinor: string | null;
    billingPeriod: string | null;
    paidActivationApproved: boolean;
    countryCodes: string[];
    approvedTermVersions: number[];
  }>;
};

function emptyCounts() {
  return {
    total: 0,
    draft: 0,
    published: 0,
    archived: 0
  };
}

export async function getPlusOverview(): Promise<PlusOverview> {
  const [contentGroups, planGroups, membershipGroups, benefitGroups, promotionGroups, promotionKinds, plans, availability] =
    await Promise.all([
      prisma.plusContentCard.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.plusPlan.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.plusMembership.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.plusBenefit.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.plusPromotion.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.plusPromotion.groupBy({ by: ["kind"], _count: { _all: true } }),
      prisma.plusPlan.findMany({
        include: {
          countries: true,
          terms: { where: { approvedAt: { not: null } }, orderBy: { version: "asc" } }
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        take: 200
      }),
      getPlusAvailability()
    ]);

  const content = emptyCounts();
  for (const group of contentGroups) {
    const count = group._count._all;
    content.total += count;
    if (group.status === "DRAFT") content.draft = count;
    if (group.status === "PUBLISHED") content.published = count;
    if (group.status === "ARCHIVED") content.archived = count;
  }

  const benefits = emptyCounts();
  for (const group of benefitGroups) {
    const count = group._count._all;
    benefits.total += count;
    if (group.status === "DRAFT") benefits.draft = count;
    if (group.status === "PUBLISHED") benefits.published = count;
    if (group.status === "ARCHIVED") benefits.archived = count;
  }

  const planCounts = { total: 0, draft: 0, active: 0, retired: 0 };
  for (const group of planGroups) {
    const count = group._count._all;
    planCounts.total += count;
    if (group.status === "DRAFT") planCounts.draft = count;
    if (group.status === "ACTIVE") planCounts.active = count;
    if (group.status === "RETIRED") planCounts.retired = count;
  }

  const memberships = { total: 0, invited: 0, active: 0, pastDue: 0, cancelled: 0, expired: 0 };
  for (const group of membershipGroups) {
    const count = group._count._all;
    memberships.total += count;
    if (group.status === "INVITED") memberships.invited = count;
    if (group.status === "ACTIVE") memberships.active = count;
    if (group.status === "PAST_DUE") memberships.pastDue = count;
    if (group.status === "CANCELLED") memberships.cancelled = count;
    if (group.status === "EXPIRED") memberships.expired = count;
  }

  const promotions = {
    total: 0,
    draft: 0,
    pendingReview: 0,
    approved: 0,
    published: 0,
    rejected: 0,
    archived: 0,
    house: 0,
    sponsored: 0
  };
  for (const group of promotionGroups) {
    const count = group._count._all;
    promotions.total += count;
    if (group.status === "DRAFT") promotions.draft = count;
    if (group.status === "PENDING_REVIEW") promotions.pendingReview = count;
    if (group.status === "APPROVED") promotions.approved = count;
    if (group.status === "PUBLISHED") promotions.published = count;
    if (group.status === "REJECTED") promotions.rejected = count;
    if (group.status === "ARCHIVED") promotions.archived = count;
  }
  for (const group of promotionKinds) {
    if (group.kind === "HOUSE") promotions.house = group._count._all;
    if (group.kind === "SPONSORED") promotions.sponsored = group._count._all;
  }

  return {
    generatedAt: new Date().toISOString(),
    flags: {
      membershipOpen: availability.membershipOpen,
      checkoutConfigured: false,
      paidActivationApproved: availability.paidActivationApproved
    },
    counts: { content, plans: planCounts, memberships, benefits, promotions },
    countries: availability.countries,
    plans: plans.map((plan) => ({
      id: plan.id,
      code: plan.code,
      name: plan.name,
      status: plan.status,
      currency: plan.currency,
      priceMinor: plan.priceMinor === null ? null : plan.priceMinor.toString(),
      billingPeriod: plan.billingPeriod,
      paidActivationApproved: plan.paidActivationApproved,
      countryCodes: plan.countries.filter((country) => country.enabled).map((country) => country.countryCode),
      approvedTermVersions: plan.terms.map((term) => term.version)
    }))
  };
}
