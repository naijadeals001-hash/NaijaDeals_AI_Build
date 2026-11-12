import { Prisma, type PlusPromotion, type PlusPromotionKind, type PlusPromotionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/api-error";
import type { SessionUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/services/core/audit.service";
import { requirePlusPermission } from "./access";
import {
  assertWindow,
  imagePair,
  normaliseCountries,
  optionalLinkUrl,
  optionalText,
  parseKey,
  parseOptionalDate,
  parseSortOrder,
  requiredText
} from "./validation";

/**
 * House promotions and sponsored advertisements.
 *
 * House content follows the editorial publish permission. Sponsored content
 * must pass advertiser review before publication and always carries a sponsor
 * name and disclosure label. No advertiser, campaign bidding or billing engine
 * exists here; `campaignRef` is an opaque reference supplied by an operator.
 */

const KINDS: readonly PlusPromotionKind[] = ["HOUSE", "SPONSORED"];
const STATUSES: readonly PlusPromotionStatus[] = [
  "DRAFT",
  "PENDING_REVIEW",
  "APPROVED",
  "PUBLISHED",
  "REJECTED",
  "ARCHIVED"
];

function parseKind(value: unknown): PlusPromotionKind {
  if (typeof value !== "string" || !KINDS.includes(value as PlusPromotionKind)) {
    throw new ApiError(400, "validation_error", `kind must be one of: ${KINDS.join(", ")}.`);
  }
  return value as PlusPromotionKind;
}

function assertSponsoredDisclosure(label: string): string {
  const trimmed = label.trim();
  if (/^naijadeals$/i.test(trimmed)) {
    throw new ApiError(400, "invalid_disclosure", "A sponsored disclosure cannot be labelled NaijaDeals.");
  }
  if (!/sponsored|advertisement/i.test(trimmed)) {
    throw new ApiError(400, "invalid_disclosure", 'A sponsored disclosure must contain "Sponsored" or "Advertisement".');
  }
  return trimmed;
}

function stateChanged(): never {
  throw new ApiError(409, "state_changed", "This promotion changed while the action was being applied. Reload and try again.");
}

export async function getPromotion(id: string): Promise<PlusPromotion> {
  const promotion = await prisma.plusPromotion.findUnique({ where: { id } });
  if (!promotion) throw new ApiError(404, "not_found", "Plus+ promotion not found.");
  return promotion;
}

export async function listPromotions(options: { status?: unknown; kind?: unknown } = {}): Promise<PlusPromotion[]> {
  const status = options.status === undefined || options.status === null || options.status === ""
    ? null
    : options.status;
  if (status !== null && (typeof status !== "string" || !STATUSES.includes(status as PlusPromotionStatus))) {
    throw new ApiError(400, "validation_error", `status must be one of: ${STATUSES.join(", ")}.`);
  }
  const kind = options.kind === undefined || options.kind === null || options.kind === "" ? null : options.kind;
  if (kind !== null && (typeof kind !== "string" || !KINDS.includes(kind as PlusPromotionKind))) {
    throw new ApiError(400, "validation_error", `kind must be one of: ${KINDS.join(", ")}.`);
  }
  return prisma.plusPromotion.findMany({
    where: {
      ...(status ? { status: status as PlusPromotionStatus } : {}),
      ...(kind ? { kind: kind as PlusPromotionKind } : {})
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    take: 300
  });
}

async function findPromotion(id: string): Promise<PlusPromotion> {
  return getPromotion(id);
}

export async function createPromotion(actor: SessionUser, input: Record<string, unknown>): Promise<PlusPromotion> {
  requirePlusPermission(actor, "plus:content:write");
  if (input.status !== undefined && input.status !== "DRAFT") {
    throw new ApiError(400, "status_via_workflow", "New promotions start as DRAFT.");
  }
  const kind = parseKind(input.kind);
  const sponsorName = optionalText(input.sponsorName, "sponsorName", 160);
  if (kind === "HOUSE" && sponsorName) {
    throw new ApiError(400, "house_promotion_sponsor", "A house promotion cannot name a sponsor.");
  }
  const startsAt = parseOptionalDate(input.startsAt, "startsAt");
  const endsAt = parseOptionalDate(input.endsAt, "endsAt");
  assertWindow(startsAt, endsAt);
  const media = imagePair(input.imageUrl, input.imageAlt);
  const requestedDisclosure = optionalText(input.disclosureLabel, "disclosureLabel", 60) ?? "Sponsored";
  const disclosureLabel = kind === "SPONSORED" ? assertSponsoredDisclosure(requestedDisclosure) : requestedDisclosure;

  try {
    const promotion = await prisma.plusPromotion.create({
      data: {
        key: parseKey(input.key),
        kind,
        title: requiredText(input.title, "title"),
        body: requiredText(input.body, "body", 2000),
        imageUrl: media.imageUrl,
        imageAlt: media.imageAlt,
        href: optionalLinkUrl(input.href, "href"),
        status: "DRAFT",
        countries: normaliseCountries(input.countries),
        startsAt,
        endsAt,
        sponsorName,
        disclosureLabel,
        campaignRef: optionalText(input.campaignRef, "campaignRef", 200),
        sortOrder: parseSortOrder(input.sortOrder)
      }
    });
    await recordAudit({
      actorId: actor.id,
      action: "plus.promotion.created",
      entity: "PlusPromotion",
      entityId: promotion.id,
      metadata: { key: promotion.key, kind: promotion.kind, sponsorName: promotion.sponsorName }
    });
    return promotion;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ApiError(409, "duplicate_key", "A Plus+ promotion with that key already exists.");
    }
    throw error;
  }
}

export async function updatePromotion(actor: SessionUser, id: string, input: Record<string, unknown>): Promise<PlusPromotion> {
  requirePlusPermission(actor, "plus:content:write");
  const existing = await findPromotion(id);
  if (existing.status !== "DRAFT" && existing.status !== "REJECTED") {
    throw new ApiError(409, "promotion_not_editable", "A promotion can only be edited while it is DRAFT or REJECTED.");
  }
  if (input.status !== undefined) throw new ApiError(400, "status_via_workflow", "Promotion status changes use the workflow routes.");

  const data: Prisma.PlusPromotionUpdateInput = {};
  const changed: string[] = [];
  if ("kind" in input) {
    const kind = parseKind(input.kind);
    if (kind !== existing.kind) throw new ApiError(409, "kind_immutable", "A promotion's kind cannot change after creation.");
  }
  if ("title" in input) {
    data.title = requiredText(input.title, "title");
    changed.push("title");
  }
  if ("body" in input) {
    data.body = requiredText(input.body, "body", 2000);
    changed.push("body");
  }
  if ("href" in input) {
    data.href = optionalLinkUrl(input.href, "href");
    changed.push("href");
  }
  if ("countries" in input) {
    data.countries = normaliseCountries(input.countries);
    changed.push("countries");
  }
  if ("startsAt" in input) {
    data.startsAt = parseOptionalDate(input.startsAt, "startsAt");
    changed.push("startsAt");
  }
  if ("endsAt" in input) {
    data.endsAt = parseOptionalDate(input.endsAt, "endsAt");
    changed.push("endsAt");
  }
  if ("sponsorName" in input) {
    const sponsorName = optionalText(input.sponsorName, "sponsorName", 160);
    if (existing.kind === "HOUSE" && sponsorName) {
      throw new ApiError(400, "house_promotion_sponsor", "A house promotion cannot name a sponsor.");
    }
    data.sponsorName = sponsorName;
    changed.push("sponsorName");
  }
  if ("disclosureLabel" in input) {
    const label = optionalText(input.disclosureLabel, "disclosureLabel", 60) ?? "Sponsored";
    data.disclosureLabel = existing.kind === "SPONSORED" ? assertSponsoredDisclosure(label) : label;
    changed.push("disclosureLabel");
  }
  if ("campaignRef" in input) {
    data.campaignRef = optionalText(input.campaignRef, "campaignRef", 200);
    changed.push("campaignRef");
  }
  if ("sortOrder" in input) {
    data.sortOrder = parseSortOrder(input.sortOrder);
    changed.push("sortOrder");
  }
  if ("imageUrl" in input || "imageAlt" in input) {
    const media = imagePair(
      "imageUrl" in input ? input.imageUrl : existing.imageUrl,
      "imageAlt" in input ? input.imageAlt : existing.imageAlt
    );
    data.imageUrl = media.imageUrl;
    data.imageAlt = media.imageAlt;
    changed.push("image");
  }

  const startsAt = data.startsAt !== undefined ? (data.startsAt as Date | null) : existing.startsAt;
  const endsAt = data.endsAt !== undefined ? (data.endsAt as Date | null) : existing.endsAt;
  assertWindow(startsAt, endsAt);

  const updated = await prisma.plusPromotion.updateMany({
    where: { id, status: existing.status },
    data: { ...data, updatedAt: new Date() }
  });
  if (updated.count === 0) stateChanged();
  const promotion = await prisma.plusPromotion.findUniqueOrThrow({ where: { id } });
  await recordAudit({
    actorId: actor.id,
    action: "plus.promotion.updated",
    entity: "PlusPromotion",
    entityId: promotion.id,
    metadata: { key: promotion.key, fields: changed }
  });
  return promotion;
}

export async function submitPromotion(actor: SessionUser, id: string): Promise<PlusPromotion> {
  const existing = await findPromotion(id);
  if (existing.kind === "SPONSORED") {
    requirePlusPermission(actor, "plus:content:write");
    if (existing.status === "PENDING_REVIEW") return existing;
    if (existing.status !== "DRAFT" && existing.status !== "REJECTED") {
      throw new ApiError(409, "invalid_transition", "Only a DRAFT or REJECTED sponsored promotion can be submitted for review.");
    }
    const updated = await prisma.plusPromotion.updateMany({
      where: { id, status: existing.status },
      data: { status: "PENDING_REVIEW", approvedAt: null, approvedById: null, updatedAt: new Date() }
    });
    if (updated.count === 0) stateChanged();
    const promotion = await prisma.plusPromotion.findUniqueOrThrow({ where: { id } });
    await recordAudit({
      actorId: actor.id,
      action: "plus.promotion.submitted",
      entity: "PlusPromotion",
      entityId: promotion.id,
      metadata: { key: promotion.key, kind: promotion.kind, previousStatus: existing.status }
    });
    return promotion;
  }

  requirePlusPermission(actor, "plus:content:publish");
  if (existing.status === "APPROVED") return existing;
  if (existing.status !== "DRAFT") {
    throw new ApiError(409, "invalid_transition", "Only a DRAFT house promotion can be approved.");
  }
  return approveHousePromotion(actor, existing, "plus.promotion.submitted");
}

async function approveHousePromotion(actor: SessionUser, promotion: PlusPromotion, action: string): Promise<PlusPromotion> {
  const updated = await prisma.plusPromotion.updateMany({
    where: { id: promotion.id, status: promotion.status },
    data: { status: "APPROVED", approvedAt: new Date(), approvedById: actor.id, updatedAt: new Date() }
  });
  if (updated.count === 0) stateChanged();
  const approved = await prisma.plusPromotion.findUniqueOrThrow({ where: { id: promotion.id } });
  await recordAudit({
    actorId: actor.id,
    action,
    entity: "PlusPromotion",
    entityId: approved.id,
    metadata: { key: approved.key, kind: approved.kind, previousStatus: promotion.status }
  });
  return approved;
}

export async function approvePromotion(actor: SessionUser, id: string): Promise<PlusPromotion> {
  const existing = await findPromotion(id);
  if (existing.kind === "HOUSE") {
    requirePlusPermission(actor, "plus:content:publish");
    if (existing.status === "APPROVED") return existing;
    if (existing.status !== "DRAFT") {
      throw new ApiError(409, "invalid_transition", "Only a DRAFT house promotion can be approved.");
    }
    return approveHousePromotion(actor, existing, "plus.promotion.approved");
  }

  requirePlusPermission(actor, "plus:advertiser:approve");
  if (existing.status === "APPROVED") return existing;
  if (existing.status !== "PENDING_REVIEW") {
    throw new ApiError(409, "invalid_transition", "A sponsored promotion must be submitted for review before approval.");
  }
  const sponsorName = existing.sponsorName?.trim();
  const disclosureLabel = existing.disclosureLabel?.trim();
  if (!sponsorName) {
    throw new ApiError(409, "sponsor_required", "A sponsored promotion needs a sponsor name before approval.");
  }
  if (!disclosureLabel) {
    throw new ApiError(409, "disclosure_required", "A sponsored promotion needs a disclosure label before approval.");
  }
  try {
    assertSponsoredDisclosure(disclosureLabel);
  } catch (error) {
    if (error instanceof ApiError) throw new ApiError(409, error.code, error.message);
    throw error;
  }

  const updated = await prisma.plusPromotion.updateMany({
    where: { id, status: "PENDING_REVIEW" },
    data: { status: "APPROVED", approvedAt: new Date(), approvedById: actor.id, updatedAt: new Date() }
  });
  if (updated.count === 0) stateChanged();
  const approved = await prisma.plusPromotion.findUniqueOrThrow({ where: { id } });
  await recordAudit({
    actorId: actor.id,
    action: "plus.promotion.approved",
    entity: "PlusPromotion",
    entityId: approved.id,
    metadata: { key: approved.key, kind: approved.kind, sponsorName: approved.sponsorName }
  });
  return approved;
}

export async function rejectPromotion(actor: SessionUser, id: string, input: Record<string, unknown> = {}): Promise<PlusPromotion> {
  requirePlusPermission(actor, "plus:advertiser:approve");
  const existing = await findPromotion(id);
  if (existing.kind !== "SPONSORED") {
    throw new ApiError(409, "not_sponsored", "Only sponsored promotions go through advertiser review.");
  }
  if (existing.status === "REJECTED") return existing;
  if (existing.status !== "PENDING_REVIEW") {
    throw new ApiError(409, "invalid_transition", "Only a promotion in review can be rejected.");
  }
  const reason = optionalText(input.reason, "reason", 500);

  const updated = await prisma.plusPromotion.updateMany({
    where: { id, status: "PENDING_REVIEW" },
    data: { status: "REJECTED", approvedAt: null, approvedById: null, updatedAt: new Date() }
  });
  if (updated.count === 0) stateChanged();
  const rejected = await prisma.plusPromotion.findUniqueOrThrow({ where: { id } });
  await recordAudit({
    actorId: actor.id,
    action: "plus.promotion.rejected",
    entity: "PlusPromotion",
    entityId: rejected.id,
    metadata: { key: rejected.key, kind: rejected.kind, reason }
  });
  return rejected;
}

export async function publishPromotion(actor: SessionUser, id: string): Promise<PlusPromotion> {
  requirePlusPermission(actor, "plus:content:publish");
  const existing = await findPromotion(id);
  if (existing.status === "PUBLISHED") return existing;
  if (existing.status !== "APPROVED") {
    throw new ApiError(409, "invalid_transition", "A promotion must be approved before it can be published.");
  }
  if (existing.kind === "SPONSORED") {
    if (!existing.sponsorName?.trim()) {
      throw new ApiError(409, "sponsor_required", "A sponsored promotion needs a sponsor name before publication.");
    }
    if (!existing.disclosureLabel?.trim()) {
      throw new ApiError(409, "disclosure_required", "A sponsored promotion needs a disclosure label before publication.");
    }
    try {
      assertSponsoredDisclosure(existing.disclosureLabel);
    } catch (error) {
      if (error instanceof ApiError) throw new ApiError(409, error.code, error.message);
      throw error;
    }
  }
  if (existing.imageUrl && !existing.imageAlt?.trim()) {
    throw new ApiError(400, "promotion_incomplete", "A promotion image needs alternative text before publication.");
  }
  assertWindow(existing.startsAt, existing.endsAt);

  const updated = await prisma.plusPromotion.updateMany({
    where: { id, status: "APPROVED" },
    data: { status: "PUBLISHED", updatedAt: new Date() }
  });
  if (updated.count === 0) stateChanged();
  const promotion = await prisma.plusPromotion.findUniqueOrThrow({ where: { id } });
  await recordAudit({
    actorId: actor.id,
    action: "plus.promotion.published",
    entity: "PlusPromotion",
    entityId: promotion.id,
    metadata: { key: promotion.key, kind: promotion.kind, sponsorName: promotion.sponsorName }
  });
  return promotion;
}

export async function archivePromotion(actor: SessionUser, id: string): Promise<PlusPromotion> {
  requirePlusPermission(actor, "plus:content:publish");
  const existing = await findPromotion(id);
  if (existing.status === "ARCHIVED") return existing;

  const updated = await prisma.plusPromotion.updateMany({
    where: { id, status: existing.status },
    data: { status: "ARCHIVED", updatedAt: new Date() }
  });
  if (updated.count === 0) stateChanged();
  const promotion = await prisma.plusPromotion.findUniqueOrThrow({ where: { id } });
  await recordAudit({
    actorId: actor.id,
    action: "plus.promotion.archived",
    entity: "PlusPromotion",
    entityId: promotion.id,
    metadata: { key: promotion.key, previousStatus: existing.status }
  });
  return promotion;
}
