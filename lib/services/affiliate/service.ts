import { randomBytes } from "node:crypto";
import type { AffiliateConversion, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/services/core/audit.service";

/**
 * NaijaDeals Affiliate — attribution and commission accrual.
 *
 * Scope of this module: enrolment, links, first-party touches and the creation
 * of commission records. It deliberately does NOT move money. Nothing here
 * credits a wallet or posts to the ledger; settlement is a separate step that
 * must be reviewed on its own, because a commission credit is a real liability.
 *
 * Commission safety rules enforced here:
 *  - the qualifying rule version is frozen onto the conversion, so a later rule
 *    edit cannot change an earned amount;
 *  - `dedupeKey` is unique, so a replayed order event cannot pay twice;
 *  - the campaign budget is claimed with a conditional update, so two concurrent
 *    conversions cannot overrun it;
 *  - attribution comes from a server-recorded touch, never from a client value.
 */

const TOUCH_COOKIE_TTL_DEFAULT_DAYS = 30;

export function affiliateCode(): string {
  return randomBytes(5).toString("hex").toUpperCase();
}

/** Idempotent enrolment. Applying twice returns the existing profile. */
export async function applyAffiliate(input: {
  userId: string;
  termsVersion: string;
  displayName?: string | null;
  audienceCity?: string | null;
}) {
  const existing = await prisma.affiliateProfile.findUnique({ where: { userId: input.userId } });
  if (existing) return existing;

  const profile = await prisma.affiliateProfile.create({
    data: {
      userId: input.userId,
      termsVersion: input.termsVersion,
      termsAcceptedAt: new Date(),
      displayName: input.displayName?.slice(0, 80) ?? null,
      audienceCity: input.audienceCity?.slice(0, 80) ?? null,
      status: "APPLIED"
    }
  });
  await recordAudit({
    actorId: input.userId,
    action: "affiliate.applied",
    entity: "AffiliateProfile",
    entityId: profile.id,
    metadata: { termsVersion: input.termsVersion }
  });
  return profile;
}

export async function decideAffiliate(input: {
  actorId: string;
  affiliateId: string;
  approve: boolean;
  reason?: string;
}) {
  const profile = await prisma.affiliateProfile.findUnique({ where: { id: input.affiliateId } });
  if (!profile) throw new ApiError(404, "affiliate_not_found", "That affiliate does not exist.");

  const updated = await prisma.affiliateProfile.update({
    where: { id: profile.id },
    data: input.approve
      ? { status: "APPROVED", approvedAt: new Date(), suspendedReason: null }
      : { status: "REJECTED", suspendedReason: input.reason?.slice(0, 300) ?? "Not approved." }
  });
  await recordAudit({
    actorId: input.actorId,
    action: input.approve ? "affiliate.approved" : "affiliate.rejected",
    entity: "AffiliateProfile",
    entityId: profile.id,
    metadata: { reason: input.reason ?? null }
  });
  return updated;
}

/** Creates a tracked link. Only an approved affiliate and an active campaign. */
export async function createLink(input: { affiliateId: string; campaignId: string; destination: string }) {
  const profile = await prisma.affiliateProfile.findUnique({ where: { id: input.affiliateId } });
  if (!profile || profile.status !== "APPROVED") {
    throw new ApiError(403, "affiliate_not_approved", "Only an approved affiliate can create links.");
  }
  const campaign = await prisma.affiliateCampaign.findUnique({ where: { id: input.campaignId } });
  if (!campaign || campaign.status !== "ACTIVE") {
    throw new ApiError(409, "campaign_inactive", "That campaign is not accepting traffic.");
  }
  // Internal paths only: a link can never become an open redirect.
  if (!input.destination.startsWith("/") || input.destination.startsWith("//")) {
    throw new ApiError(400, "invalid_destination", "Destination must be an internal path such as /product/abc.");
  }

  return prisma.affiliateLink.create({
    data: { affiliateId: profile.id, campaignId: campaign.id, code: affiliateCode(), destination: input.destination }
  });
}

/**
 * Records a landing. Called by the redirect route, server-side, with the visitor
 * key derived on the server. Returns null when the code is unknown or inactive,
 * so the caller can redirect without attribution rather than fail the visit.
 */
export async function resolveTouch(input: { code: string; visitorKey: string; userId?: string | null; consent: boolean }) {
  const link = await prisma.affiliateLink.findUnique({
    where: { code: input.code },
    include: { campaign: true, affiliate: true }
  });
  if (!link || !link.active) return null;
  if (link.campaign.status !== "ACTIVE") return null;
  if (link.affiliate.status !== "APPROVED") return null;

  const days = link.campaign.attributionDays || TOUCH_COOKIE_TTL_DEFAULT_DAYS;
  const touch = await prisma.attributionTouch.create({
    data: {
      linkId: link.id,
      visitorKey: input.visitorKey,
      userId: input.userId ?? null,
      consent: input.consent,
      expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    }
  });
  return { link, touch };
}

/** The most recent non-expired touch for this visitor, if any. */
export async function findAttribution(visitorKey: string, at = new Date()) {
  return prisma.attributionTouch.findFirst({
    where: { visitorKey, expiresAt: { gt: at } },
    orderBy: { landedAt: "desc" },
    include: { link: { include: { campaign: true, affiliate: true } } }
  });
}

/** Latest non-expired touch recorded while this user was signed in. */
export async function findAttributionForUser(userId: string, at = new Date()) {
  return prisma.attributionTouch.findFirst({
    where: { userId, consent: true, expiresAt: { gt: at } },
    orderBy: { landedAt: "desc" },
    include: { link: { include: { campaign: true, affiliate: true } } }
  });
}

export type ConversionInput = {
  entityType: string;
  entityId: string;
  basisKobo: bigint;
  visitorKey?: string;
  userId?: string;
  now?: Date;
};

/**
 * Creates the commission record for a qualifying event.
 *
 * Idempotent by `dedupeKey`. Returns `{ created: false }` when the same
 * qualifying event arrives again. Returns `{ created: false, reason }` when there
 * is no valid attribution or the campaign budget is exhausted — a missing
 * commission must never fail the customer's order.
 */
export async function recordConversion(input: ConversionInput): Promise<
  { created: true; conversion: AffiliateConversion } | { created: false; reason: string }
> {
  const now = input.now ?? new Date();
  const dedupeKey = `${input.entityType}:${input.entityId}`;

  const existing = await prisma.affiliateConversion.findUnique({ where: { dedupeKey } });
  if (existing) return { created: false, reason: "duplicate" };

  const touch = input.userId
    ? await findAttributionForUser(input.userId, now)
    : await findAttribution(input.visitorKey ?? "", now);
  if (!touch || !touch.consent) return { created: false, reason: "no_attribution" };
  const campaign = touch.link.campaign;
  if (campaign.status !== "ACTIVE") return { created: false, reason: "campaign_inactive" };
  if (campaign.effectiveTo && campaign.effectiveTo < now) return { created: false, reason: "campaign_ended" };
  if (touch.link.affiliate.status !== "APPROVED") return { created: false, reason: "affiliate_not_approved" };

  const basis = campaign.commissionBasis === "TOTAL" ? input.basisKobo : input.basisKobo;
  const amount =
    campaign.commissionFlatKobo !== null && campaign.commissionFlatKobo !== undefined
      ? campaign.commissionFlatKobo
      : (basis * BigInt(campaign.commissionBps)) / 10_000n;
  if (amount <= 0n) return { created: false, reason: "zero_commission" };

  // Atomic budget claim: the update only applies while it still fits.
  const claimed = await prisma.affiliateCampaign.updateMany({
    where: {
      id: campaign.id,
      status: "ACTIVE",
      OR: [{ budgetKobo: 0n }, { spentKobo: { lte: campaign.budgetKobo - amount } }]
    },
    data: { spentKobo: { increment: amount } }
  });
  if (claimed.count === 0) return { created: false, reason: "budget_exhausted" };

  try {
    const conversion = await prisma.affiliateConversion.create({
      data: {
        dedupeKey,
        affiliateId: touch.link.affiliateId,
        campaignId: campaign.id,
        linkId: touch.linkId,
        entityType: input.entityType,
        entityId: input.entityId,
        ruleVersion: campaign.ruleVersion,
        commissionBps: campaign.commissionBps,
        basisKobo: basis,
        amountKobo: amount,
        state: "TRACKED",
        reversibleUntil: new Date(now.getTime() + campaign.attributionDays * 24 * 60 * 60 * 1000)
      }
    });
    return { created: true, conversion };
  } catch (error) {
    // A concurrent request won the dedupe race: release the budget claim.
    await prisma.affiliateCampaign.update({ where: { id: campaign.id }, data: { spentKobo: { decrement: amount } } });
    if ((error as Prisma.PrismaClientKnownRequestError).code === "P2002") {
      return { created: false, reason: "duplicate" };
    }
    throw error;
  }
}

/**
 * Moves a tracked conversion along the state machine. Settlement — the step that
 * would credit an affiliate wallet — is intentionally not implemented here.
 */
export async function updateConversionState(input: {
  actorId: string;
  conversionId: string;
  to: "VALIDATING" | "APPROVED" | "REJECTED" | "DISPUTED" | "REVERSED";
  reason?: string;
}) {
  const allowed: Record<string, string[]> = {
    TRACKED: ["VALIDATING", "REJECTED", "DISPUTED"],
    VALIDATING: ["APPROVED", "REJECTED", "DISPUTED"],
    APPROVED: ["DISPUTED", "REVERSED"],
    DISPUTED: ["APPROVED", "REJECTED"],
    REJECTED: [],
    REVERSED: [],
    PAYABLE: ["DISPUTED", "REVERSED"],
    PAYING: [],
    PAID: ["REVERSED"]
  };

  const current = await prisma.affiliateConversion.findUnique({ where: { id: input.conversionId } });
  if (!current) throw new ApiError(404, "conversion_not_found", "That conversion does not exist.");
  if (!allowed[current.state]?.includes(input.to)) {
    throw new ApiError(409, "invalid_transition", `A ${current.state} conversion cannot become ${input.to}.`);
  }

  const updated = await prisma.affiliateConversion.update({
    where: { id: current.id },
    data: { state: input.to, reason: input.reason?.slice(0, 300) ?? null }
  });
  await recordAudit({
    actorId: input.actorId,
    action: `affiliate.conversion_${input.to.toLowerCase()}`,
    entity: "AffiliateConversion",
    entityId: current.id,
    metadata: { from: current.state, to: input.to, amountKobo: current.amountKobo.toString() }
  });
  return updated;
}

/** Totals for a dashboard, derived from conversion rows, not cached counters. */
export async function affiliateSummary(affiliateId: string) {
  const rows = await prisma.affiliateConversion.groupBy({
    by: ["state"],
    where: { affiliateId },
    _sum: { amountKobo: true },
    _count: { _all: true }
  });
  const byState = Object.fromEntries(
    rows.map((row) => [row.state, { count: row._count._all, amountKobo: (row._sum.amountKobo ?? 0n).toString() }])
  );
  const clicks = await prisma.attributionTouch.count({
    where: { link: { affiliateId } }
  });
  return { byState, clicks };
}
