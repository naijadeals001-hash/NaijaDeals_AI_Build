import { Prisma, type PlusContentCard, type PlusPublishStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/api-error";
import type { SessionUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/services/core/audit.service";
import { hasPermission } from "@/lib/auth/permissions";
import { requirePlusPermission } from "./access";
import {
  assertImageUrl,
  assertLinkUrl,
  assertServiceKey,
  assertWindow,
  normaliseCountries,
  parseKey,
  parseLanguage,
  parseOptionalDate,
  parseSortOrder,
  requiredText
} from "./validation";

/**
 * Plus+ awareness-card configuration.
 *
 * Creation starts as DRAFT and draft editing needs `plus:content:write`.
 * Editing a PUBLISHED card needs `plus:content:publish`, and publication,
 * archival and reordering of published rows are separate publisher actions.
 */

const CONTENT_STATUSES: readonly PlusPublishStatus[] = ["DRAFT", "PUBLISHED", "ARCHIVED"];

function parseStatus(value: unknown): PlusPublishStatus | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !CONTENT_STATUSES.includes(value as PlusPublishStatus)) {
    throw new ApiError(400, "validation_error", `status must be one of: ${CONTENT_STATUSES.join(", ")}.`);
  }
  return value as PlusPublishStatus;
}

function duplicateKey(error: unknown, entity: string): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new ApiError(409, "duplicate_key", `A ${entity} with that key already exists.`);
  }
  throw error;
}

/**
 * Editing a PUBLISHED row is a publication action. A writer may prepare drafts,
 * but only a publisher may alter live copy; otherwise an editor could replace a
 * reviewed card without any second approval.
 */
function requirePublishedEditPermission(actor: SessionUser): void {
  if (!hasPermission(actor, "plus:content:publish")) {
    throw new ApiError(403, "published_requires_publisher", "Editing published content requires the plus:content:publish permission.");
  }
}

function stateChanged(): never {
  throw new ApiError(409, "state_changed", "This record changed while the action was being applied. Reload and try again.");
}

async function findCard(id: string): Promise<PlusContentCard> {
  const card = await prisma.plusContentCard.findUnique({ where: { id } });
  if (!card) throw new ApiError(404, "not_found", "Plus+ content card not found.");
  return card;
}

/** Validate the fields a card needs before it can be shown publicly. */
function assertPublishable(card: PlusContentCard): void {
  if (!card.title.trim() || !card.description.trim()) {
    throw new ApiError(400, "content_incomplete", "A content card needs a title and description before publication.");
  }
  if (!card.imageAlt.trim()) throw new ApiError(400, "content_incomplete", "A content card needs image alternative text before publication.");
  if (!card.imageUrl.trim()) throw new ApiError(400, "content_incomplete", "A content card needs an image before publication.");
  if (!card.href.trim()) throw new ApiError(400, "content_incomplete", "A content card needs a destination before publication.");
  assertImageUrl(card.imageUrl);
  assertLinkUrl(card.href);
  assertWindow(card.startsAt, card.endsAt);
}

export async function listContent(options: { status?: unknown } = {}): Promise<PlusContentCard[]> {
  const status = parseStatus(options.status);
  return prisma.plusContentCard.findMany({
    where: status ? { status } : undefined,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    take: 500
  });
}

export async function createContent(actor: SessionUser, input: Record<string, unknown>): Promise<PlusContentCard> {
  requirePlusPermission(actor, "plus:content:write");
  if (input.status !== undefined && input.status !== "DRAFT") {
    throw new ApiError(400, "status_via_publish", "New content cards start as DRAFT; use the publish route to make one public.");
  }

  const startsAt = parseOptionalDate(input.startsAt, "startsAt");
  const endsAt = parseOptionalDate(input.endsAt, "endsAt");
  assertWindow(startsAt, endsAt);

  const sortOrder =
    input.sortOrder === undefined || input.sortOrder === null || input.sortOrder === ""
      ? ((await prisma.plusContentCard.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? -10) + 10
      : parseSortOrder(input.sortOrder);

  try {
    const card = await prisma.plusContentCard.create({
      data: {
        key: parseKey(input.key),
        title: requiredText(input.title, "title"),
        description: requiredText(input.description, "description", 2000),
        imageUrl: assertImageUrl(input.imageUrl),
        imageAlt: requiredText(input.imageAlt, "imageAlt", 400),
        href: assertLinkUrl(input.href),
        serviceKey: assertServiceKey(input.serviceKey),
        sortOrder,
        status: "DRAFT",
        language: parseLanguage(input.language),
        countries: normaliseCountries(input.countries),
        startsAt,
        endsAt,
        createdById: actor.id,
        updatedById: actor.id
      }
    });
    await recordAudit({
      actorId: actor.id,
      action: "plus.content.created",
      entity: "PlusContentCard",
      entityId: card.id,
      metadata: { key: card.key }
    });
    return card;
  } catch (error) {
    return duplicateKey(error, "content card");
  }
}

export async function updateContent(actor: SessionUser, id: string, input: Record<string, unknown>): Promise<PlusContentCard> {
  const existing = await findCard(id);
  if (existing.status === "PUBLISHED") requirePublishedEditPermission(actor);
  else requirePlusPermission(actor, "plus:content:write");
  if (input.status !== undefined) {
    throw new ApiError(400, "status_via_publish", "Status changes use the publish or archive route.");
  }

  const data: Prisma.PlusContentCardUpdateInput = { updatedById: actor.id };
  const changed: string[] = [];

  if ("title" in input) {
    data.title = requiredText(input.title, "title");
    changed.push("title");
  }
  if ("description" in input) {
    data.description = requiredText(input.description, "description", 2000);
    changed.push("description");
  }
  if ("imageUrl" in input) {
    data.imageUrl = assertImageUrl(input.imageUrl);
    changed.push("imageUrl");
  }
  if ("imageAlt" in input) {
    data.imageAlt = requiredText(input.imageAlt, "imageAlt", 400);
    changed.push("imageAlt");
  }
  if ("href" in input) {
    data.href = assertLinkUrl(input.href);
    changed.push("href");
  }
  if ("serviceKey" in input) {
    data.serviceKey = assertServiceKey(input.serviceKey);
    changed.push("serviceKey");
  }
  if ("sortOrder" in input) {
    data.sortOrder = parseSortOrder(input.sortOrder);
    changed.push("sortOrder");
  }
  if ("language" in input) {
    data.language = parseLanguage(input.language);
    changed.push("language");
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

  const startsAt = data.startsAt !== undefined ? (data.startsAt as Date | null) : existing.startsAt;
  const endsAt = data.endsAt !== undefined ? (data.endsAt as Date | null) : existing.endsAt;
  assertWindow(startsAt, endsAt);

  let card: PlusContentCard;
  try {
    card = await prisma.plusContentCard.update({ where: { id, status: existing.status }, data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") stateChanged();
    throw error;
  }
  await recordAudit({
    actorId: actor.id,
    action: "plus.content.updated",
    entity: "PlusContentCard",
    entityId: card.id,
    metadata: { key: card.key, fields: changed }
  });
  return card;
}

export async function publishContent(actor: SessionUser, id: string): Promise<PlusContentCard> {
  requirePlusPermission(actor, "plus:content:publish");
  const existing = await findCard(id);
  assertPublishable(existing);
  if (existing.status === "PUBLISHED") return existing;

  const updated = await prisma.plusContentCard.updateMany({
    where: { id, status: existing.status },
    data: { status: "PUBLISHED", updatedById: actor.id, updatedAt: new Date() }
  });
  if (updated.count === 0) stateChanged();
  const card = await prisma.plusContentCard.findUniqueOrThrow({ where: { id } });
  await recordAudit({
    actorId: actor.id,
    action: "plus.content.published",
    entity: "PlusContentCard",
    entityId: card.id,
    metadata: { key: card.key, previousStatus: existing.status }
  });
  return card;
}

export async function archiveContent(actor: SessionUser, id: string): Promise<PlusContentCard> {
  requirePlusPermission(actor, "plus:content:publish");
  const existing = await findCard(id);
  if (existing.status === "ARCHIVED") return existing;

  const result = await prisma.plusContentCard.updateMany({
    where: { id, status: existing.status },
    data: { status: "ARCHIVED", updatedById: actor.id, updatedAt: new Date() }
  });
  if (result.count === 0) stateChanged();
  const card = await prisma.plusContentCard.findUniqueOrThrow({ where: { id } });
  await recordAudit({
    actorId: actor.id,
    action: "plus.content.archived",
    entity: "PlusContentCard",
    entityId: card.id,
    metadata: { key: card.key, previousStatus: existing.status }
  });
  return card;
}

export async function reorderContent(actor: SessionUser, rawIds: unknown): Promise<PlusContentCard[]> {
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    throw new ApiError(400, "validation_error", "ids must be a non-empty array of content card ids.");
  }
  const ids = rawIds.map((value) => {
    if (typeof value !== "string" || !value.trim()) {
      throw new ApiError(400, "validation_error", "ids must contain only content card ids.");
    }
    return value.trim();
  });
  if (new Set(ids).size !== ids.length) throw new ApiError(400, "duplicate_id", "ids must not contain duplicates.");

  const found = await prisma.plusContentCard.findMany({ where: { id: { in: ids } }, select: { id: true, status: true } });
  if (found.length !== ids.length) {
    const missing = ids.filter((id) => !found.some((row) => row.id === id));
    throw new ApiError(404, "content_not_found", `Unknown content card id(s): ${missing.join(", ")}.`);
  }

  if (found.some((row) => row.status === "PUBLISHED")) requirePublishedEditPermission(actor);
  else requirePlusPermission(actor, "plus:content:write");

  const updated = await prisma.$transaction(
    ids.map((id, index) =>
      prisma.plusContentCard.update({
        where: { id },
        data: { sortOrder: index * 10, updatedById: actor.id }
      })
    )
  );
  await recordAudit({
    actorId: actor.id,
    action: "plus.content.reordered",
    entity: "PlusContentCard",
    entityId: null,
    metadata: { ids }
  });
  return updated;
}
