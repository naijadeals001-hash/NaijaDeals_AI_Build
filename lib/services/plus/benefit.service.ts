import { Prisma, type PlusBenefit, type PlusPublishStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/api-error";
import type { SessionUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/services/core/audit.service";
import { requirePlusPermission } from "./access";
import {
  assertWindow,
  imagePair,
  normaliseCountries,
  optionalText,
  parseKey,
  parseOptionalDate,
  parseSortOrder,
  requiredText
} from "./validation";

/**
 * Genuine Plus+ benefits.
 *
 * A standard NaijaDeals service is not a Plus+ benefit and must never be stored
 * here. A benefit can only be published after it is attached to a plan.
 */

const STATUSES: readonly PlusPublishStatus[] = ["DRAFT", "PUBLISHED", "ARCHIVED"];

export type BenefitWithPlan = Prisma.PlusBenefitGetPayload<{ include: { plan: true } }>;

function parseStatus(value: unknown): PlusPublishStatus | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !STATUSES.includes(value as PlusPublishStatus)) {
    throw new ApiError(400, "validation_error", `status must be one of: ${STATUSES.join(", ")}.`);
  }
  return value as PlusPublishStatus;
}

async function planIdOf(value: unknown): Promise<string | null> {
  const planId = optionalText(value, "planId", 100);
  if (!planId) return null;
  const plan = await prisma.plusPlan.findUnique({ where: { id: planId }, select: { id: true } });
  if (!plan) throw new ApiError(404, "plan_not_found", "The Plus+ plan does not exist.");
  return planId;
}

async function findBenefit(id: string): Promise<BenefitWithPlan> {
  const benefit = await prisma.plusBenefit.findUnique({ where: { id }, include: { plan: true } });
  if (!benefit) throw new ApiError(404, "not_found", "Plus+ benefit not found.");
  return benefit;
}

export async function listBenefits(options: { status?: unknown } = {}): Promise<BenefitWithPlan[]> {
  const status = parseStatus(options.status);
  return prisma.plusBenefit.findMany({
    where: status ? { status } : undefined,
    include: { plan: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    take: 300
  });
}

export async function createBenefit(actor: SessionUser, input: Record<string, unknown>): Promise<BenefitWithPlan> {
  requirePlusPermission(actor, "plus:content:write");
  if (input.status !== undefined && input.status !== "DRAFT") {
    throw new ApiError(400, "status_via_publish", "New benefits start as DRAFT; use the publish route to make one public.");
  }
  const startsAt = parseOptionalDate(input.startsAt, "startsAt");
  const endsAt = parseOptionalDate(input.endsAt, "endsAt");
  assertWindow(startsAt, endsAt);
  const media = imagePair(input.imageUrl, input.imageAlt);

  try {
    const benefit = await prisma.plusBenefit.create({
      data: {
        key: parseKey(input.key),
        title: requiredText(input.title, "title"),
        description: requiredText(input.description, "description", 2000),
        planId: await planIdOf(input.planId),
        status: "DRAFT",
        countries: normaliseCountries(input.countries),
        startsAt,
        endsAt,
        sortOrder: parseSortOrder(input.sortOrder),
        imageUrl: media.imageUrl,
        imageAlt: media.imageAlt
      },
      include: { plan: true }
    });
    await recordAudit({
      actorId: actor.id,
      action: "plus.benefit.created",
      entity: "PlusBenefit",
      entityId: benefit.id,
      metadata: { key: benefit.key, planId: benefit.planId }
    });
    return benefit;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ApiError(409, "duplicate_key", "A Plus+ benefit with that key already exists.");
    }
    throw error;
  }
}

export async function updateBenefit(actor: SessionUser, id: string, input: Record<string, unknown>): Promise<BenefitWithPlan> {
  requirePlusPermission(actor, "plus:content:write");
  const existing = await findBenefit(id);
  if (input.status !== undefined) {
    throw new ApiError(400, "status_via_publish", "Status changes use the publish or archive route.");
  }

  const data: Prisma.PlusBenefitUpdateInput = {};
  const changed: string[] = [];
  if ("title" in input) {
    data.title = requiredText(input.title, "title");
    changed.push("title");
  }
  if ("description" in input) {
    data.description = requiredText(input.description, "description", 2000);
    changed.push("description");
  }
  if ("planId" in input) {
    const planId = await planIdOf(input.planId);
    data.plan = planId ? { connect: { id: planId } } : { disconnect: true };
    changed.push("planId");
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

  const benefit = await prisma.plusBenefit.update({ where: { id }, data, include: { plan: true } });
  await recordAudit({
    actorId: actor.id,
    action: "plus.benefit.updated",
    entity: "PlusBenefit",
    entityId: benefit.id,
    metadata: { key: benefit.key, fields: changed }
  });
  return benefit;
}

export async function publishBenefit(actor: SessionUser, id: string): Promise<BenefitWithPlan> {
  requirePlusPermission(actor, "plus:content:publish");
  const existing = await findBenefit(id);
  if (existing.status === "PUBLISHED") return existing;
  if (!existing.planId) {
    throw new ApiError(409, "plan_required", "Attach the benefit to a plan before publishing it.");
  }
  if (!existing.title.trim() || !existing.description.trim()) {
    throw new ApiError(400, "benefit_incomplete", "A benefit needs a title and description before publication.");
  }
  if (existing.imageUrl && !existing.imageAlt?.trim()) {
    throw new ApiError(400, "benefit_incomplete", "A benefit image needs alternative text before publication.");
  }
  assertWindow(existing.startsAt, existing.endsAt);

  const benefit = await prisma.plusBenefit.update({
    where: { id },
    data: { status: "PUBLISHED" },
    include: { plan: true }
  });
  await recordAudit({
    actorId: actor.id,
    action: "plus.benefit.published",
    entity: "PlusBenefit",
    entityId: benefit.id,
    metadata: { key: benefit.key, planId: benefit.planId, previousStatus: existing.status }
  });
  return benefit;
}

export async function archiveBenefit(actor: SessionUser, id: string): Promise<BenefitWithPlan> {
  requirePlusPermission(actor, "plus:content:publish");
  const existing = await findBenefit(id);
  if (existing.status === "ARCHIVED") return existing;

  const benefit = await prisma.plusBenefit.update({
    where: { id },
    data: { status: "ARCHIVED" },
    include: { plan: true }
  });
  await recordAudit({
    actorId: actor.id,
    action: "plus.benefit.archived",
    entity: "PlusBenefit",
    entityId: benefit.id,
    metadata: { key: benefit.key, previousStatus: existing.status }
  });
  return benefit;
}
