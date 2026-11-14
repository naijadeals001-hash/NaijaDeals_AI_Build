import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import type { SessionUser } from "@/lib/auth/session";
import { assertRegion, vendorScopeWhere } from "@/lib/auth/scope";
import { recordAudit } from "@/lib/services/core/audit.service";
import { recordSystemEvent } from "@/lib/services/core/event.service";
import { notifyVendorOwner } from "@/lib/services/core/notification.service";
import { log } from "@/lib/infra/logger";
import { assertSellerCategoryEligibility } from "./eligibility";
import {
  ADMIN_CATEGORY_INCLUDE,
  createCategoryRecord,
  regulatedScopeDecision,
  slugifyCategoryName,
  validateCategoryCreateInput,
  type AdminCategoryRecord
} from "./nodes";
import {
  categoryPath,
  isPlainObject,
  normaliseOptions,
  readText,
  sortCategoryRows
} from "./shared";

export type AdminTaxonomyNode = {
  id: string;
  key: string | null;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  parentId: string | null;
  level: number;
  isSelectable: boolean;
  showOnHomepage: boolean;
  /** Browsing rail/directory visibility, independent of publication and merchandising. */
  browsingVisible: boolean;
  /** Regulated goods need an explicit country rule before publishing. */
  isRegulated: boolean;
  deprecatedAt: Date | null;
  isActive: boolean;
  isDemo: boolean;
  sortOrder: number;
  createdAt: Date;
  productCount: number;
  subtreeProductCount: number;
  aliases: Array<{ id: string; alias: string; locale: string }>;
  attributes: Array<{
    id: string;
    key: string;
    label: string;
    type: string;
    required: boolean;
    options: string[] | null;
  }>;
  countryRules: Array<{ countryCode: string; canPublish: boolean; note: string | null }>;
  children: AdminTaxonomyNode[];
};

export type AdminCategoryRequestView = {
  id: string;
  sellerId: string;
  seller: { id: string; name: string; countryCode: string; market: string } | null;
  suggestedName: string;
  description: string;
  parentId: string | null;
  parentPath: string | null;
  parent: { id: string; name: string; slug: string } | null;
  imageUrl: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  adminNote: string | null;
  resolvedCategoryId: string | null;
  resolvedCategoryPath: string | null;
  resolvedCategory: { id: string; name: string; slug: string } | null;
  createdAt: Date;
  updatedAt: Date;
};

type CategoryBrief = { id: string; name: string; slug: string };

function scopeCountry(actor: SessionUser): string | null {
  return actor.scopeCountryCode ? actor.scopeCountryCode.toUpperCase() : null;
}

function toAdminNode(record: AdminCategoryRecord, visibleCountry: string | null): AdminTaxonomyNode {
  return {
    id: record.id,
    key: record.key,
    name: record.name,
    slug: record.slug,
    description: record.description,
    imageUrl: record.imageUrl,
    imageAlt: record.imageAlt,
    parentId: record.parentId,
    level: record.level,
    isSelectable: record.isSelectable,
    showOnHomepage: record.showOnHomepage,
    browsingVisible: record.browsingVisible,
    isRegulated: record.isRegulated,
    deprecatedAt: record.deprecatedAt,
    isActive: record.isActive,
    isDemo: record.isDemo,
    sortOrder: record.sortOrder,
    createdAt: record.createdAt,
    productCount: record._count.products,
    subtreeProductCount: 0,
    aliases: record.aliases.map((alias) => ({ id: alias.id, alias: alias.alias, locale: alias.locale })),
    attributes: record.attributes.map((attribute) => ({
      id: attribute.id,
      key: attribute.key,
      label: attribute.label,
      type: attribute.type,
      required: attribute.required,
      options: normaliseOptions(attribute.options)
    })),
    countryRules: record.countryRules
      .filter((rule) => !visibleCountry || rule.countryCode === visibleCountry)
      .map((rule) => ({ countryCode: rule.countryCode, canPublish: rule.canPublish, note: rule.note })),
    children: []
  };
}

/**
 * Builds the complete administrative forest, including inactive, deprecated,
 * orphaned and (defensively) cyclic rows. Nothing is hidden from an
 * administrator, but recursion is guarded so bad legacy data cannot hang the
 * console.
 */
export function buildAdminTaxonomyTree(records: AdminCategoryRecord[], actor: SessionUser): AdminTaxonomyNode[] {
  const visibleCountry = scopeCountry(actor);
  const nodes = new Map(records.map((record) => [record.id, toAdminNode(record, visibleCountry)]));
  const children = new Map<string, AdminTaxonomyNode[]>();
  for (const node of nodes.values()) {
    if (!node.parentId || !nodes.has(node.parentId)) continue;
    const list = children.get(node.parentId) ?? [];
    list.push(node);
    children.set(node.parentId, list);
  }

  const claimed = new Set<string>();
  const finalise = (node: AdminTaxonomyNode, visiting: Set<string>): number => {
    if (claimed.has(node.id) || visiting.has(node.id)) {
      node.children = [];
      node.subtreeProductCount = node.productCount;
      return node.productCount;
    }
    claimed.add(node.id);
    visiting.add(node.id);
    const kids = sortCategoryRows(children.get(node.id) ?? []);
    let total = node.productCount;
    const kept: AdminTaxonomyNode[] = [];
    for (const child of kids) {
      if (claimed.has(child.id)) continue;
      kept.push(child);
      total += finalise(child, visiting);
    }
    node.children = kept;
    node.subtreeProductCount = total;
    visiting.delete(node.id);
    return total;
  };

  const roots = sortCategoryRows(
    [...nodes.values()].filter((node) => !node.parentId || !nodes.has(node.parentId))
  );
  for (const root of roots) finalise(root, new Set());

  // A pure cycle has no root; surface every unclaimed node as a root so it can
  // be repaired instead of being invisible.
  for (const node of sortCategoryRows([...nodes.values()])) {
    if (claimed.has(node.id)) continue;
    roots.push(node);
    finalise(node, new Set());
  }

  return roots;
}

async function enrichRequests(
  rows: Array<{
    id: string;
    sellerId: string;
    suggestedName: string;
    description: string;
    parentId: string | null;
    imageUrl: string | null;
    status: "PENDING" | "APPROVED" | "REJECTED";
    adminNote: string | null;
    resolvedCategoryId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>
): Promise<AdminCategoryRequestView[]> {
  if (rows.length === 0) return [];
  const sellerIds = [...new Set(rows.map((row) => row.sellerId))];
  const [vendors, categories] = await Promise.all([
    prisma.vendor.findMany({
      where: { id: { in: sellerIds } },
      select: { id: true, name: true, countryCode: true, market: true }
    }),
    prisma.category.findMany({
      select: { id: true, parentId: true, name: true, slug: true }
    })
  ]);
  const vendorsById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
  const categoriesById = new Map(categories.map((category) => [category.id, category]));

  return rows.map((row) => ({
    id: row.id,
    sellerId: row.sellerId,
    seller: vendorsById.get(row.sellerId) ?? null,
    suggestedName: row.suggestedName,
    description: row.description,
    parentId: row.parentId,
    parentPath: row.parentId ? categoryPath(row.parentId, categoriesById) : null,
    parent: row.parentId ? categoriesById.get(row.parentId) ?? null : null,
    imageUrl: row.imageUrl,
    status: row.status,
    adminNote: row.adminNote,
    resolvedCategoryId: row.resolvedCategoryId,
    resolvedCategoryPath: row.resolvedCategoryId ? categoryPath(row.resolvedCategoryId, categoriesById) : null,
    resolvedCategory: row.resolvedCategoryId ? categoriesById.get(row.resolvedCategoryId) ?? null : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }));
}

function normaliseRequestStatus(value: string | null | undefined): "PENDING" | "APPROVED" | "REJECTED" | null {
  const status = (value ?? "PENDING").toUpperCase();
  if (status === "ALL") return null;
  if (status === "PENDING" || status === "APPROVED" || status === "REJECTED") return status;
  throw new ApiError(400, "invalid_status", "status must be PENDING, APPROVED, REJECTED or ALL.");
}

/**
 * Admin request queue, scoped to the seller's operating country/city when the
 * administrator has a regional scope. Requests from a seller whose Vendor row
 * is missing are visible only to platform-wide administrators because their
 * geography cannot be verified.
 */
export async function listAdminCategoryRequests(
  actor: SessionUser,
  statusInput?: string | null
): Promise<{ requests: AdminCategoryRequestView[] }> {
  const status = normaliseRequestStatus(statusInput);
  const vendorScope = vendorScopeWhere(actor);
  let sellerIds: string[] | null = null;
  if (vendorScope.countryCode || vendorScope.market) {
    const vendors = await prisma.vendor.findMany({ where: vendorScope, select: { id: true } });
    sellerIds = vendors.map((vendor) => vendor.id);
    if (sellerIds.length === 0) return { requests: [] };
  }

  const rows = await prisma.categoryRequest.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(sellerIds ? { sellerId: { in: sellerIds } } : {})
    },
    orderBy: { createdAt: "desc" }
  });
  return { requests: await enrichRequests(rows) };
}

async function uniqueSlug(tx: Prisma.TransactionClient, base: string): Promise<string> {
  const stem = (base || "category").slice(0, 70);
  let candidate = stem;
  let suffix = 2;
  while (await tx.category.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${stem.slice(0, 66)}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

async function uniqueKey(tx: Prisma.TransactionClient, slug: string): Promise<string> {
  const stem = (slug.replace(/-/g, "_") || "category").slice(0, 60);
  let candidate = stem;
  let suffix = 2;
  while (await tx.category.findUnique({ where: { key: candidate }, select: { id: true } })) {
    candidate = `${stem.slice(0, 56)}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function createBodyFromRequest(input: {
  request: { suggestedName: string; description: string; parentId: string | null; imageUrl: string | null };
  createCategory: unknown;
  key: string;
  slug: string;
}): Record<string, unknown> {
  const overrides = isPlainObject(input.createCategory) ? input.createCategory : {};
  const hasParentOverride = Object.prototype.hasOwnProperty.call(overrides, "parentId");
  const body: Record<string, unknown> = {
    parentId: hasParentOverride ? overrides.parentId : input.request.parentId,
    key: input.key,
    slug: input.slug,
    name: typeof overrides.name === "string" ? overrides.name : input.request.suggestedName,
    description: typeof overrides.description === "string" ? overrides.description : input.request.description,
    imageUrl: typeof overrides.imageUrl === "string" ? overrides.imageUrl : input.request.imageUrl
  };
  for (const field of ["imageAlt", "isSelectable", "showOnHomepage", "browsingVisible", "isActive", "sortOrder"] as const) {
    if (overrides[field] !== undefined) body[field] = overrides[field];
  }
  return body;
}

async function notifyResolution(input: {
  actorId: string;
  vendorId: string;
  requestId: string;
  suggestedName: string;
  status: "APPROVED" | "REJECTED";
  note: string | null;
}) {
  try {
    await notifyVendorOwner({
      vendorId: input.vendorId,
      kind: input.status === "APPROVED" ? "category_request_approved" : "category_request_rejected",
      title: input.status === "APPROVED" ? "Category request approved" : "Category request rejected",
      body:
        input.status === "APPROVED"
          ? `Your suggested category "${input.suggestedName}" is now available.${input.note ? ` ${input.note}` : ""}`
          : input.note ?? `Your suggested category "${input.suggestedName}" was not approved.`,
      href: "/seller"
    });
  } catch (error) {
    // The audit row is the durable record; delivery failure must not turn a
    // committed resolution into an error for the administrator.
    log.warn("taxonomy.category_request.notification_failed", {
      requestId: input.requestId,
      actorId: input.actorId,
      error: error instanceof Error ? error.name : "unknown"
    });
    await recordSystemEvent({
      type: "taxonomy.category_request.notification_failed",
      actorId: input.actorId,
      entity: "CategoryRequest",
      entityId: input.requestId,
      payload: { status: input.status }
    }).catch(() => undefined);
  }
}

/**
 * Resolves a seller category request by assigning an existing category or
 * creating one. The request status claim and any category creation commit
 * together, so two administrators cannot both approve the same request.
 */
export async function resolveCategoryRequest(input: {
  actor: SessionUser;
  requestId: string;
  body: Record<string, unknown>;
}): Promise<{ request: AdminCategoryRequestView; category: CategoryBrief | null }> {
  const action = input.body.action;
  if (action !== "APPROVED" && action !== "REJECTED") {
    throw new ApiError(400, "validation_error", 'action must be "APPROVED" or "REJECTED".');
  }

  const rawNote = typeof input.body.note === "string" ? input.body.note.trim() : input.body.note;
  const note =
    action === "REJECTED"
      ? readText(rawNote, "Rejection note", 3, 1000)
      : rawNote === undefined || rawNote === null || rawNote === ""
        ? null
        : readText(rawNote, "Note", 3, 1000);

  const request = await prisma.categoryRequest.findUnique({ where: { id: input.requestId } });
  if (!request) throw new ApiError(404, "request_not_found", "Category request not found.");

  const vendor = await prisma.vendor.findUnique({
    where: { id: request.sellerId },
    select: { id: true, ownerId: true, name: true, countryCode: true, market: true }
  });
  if (!vendor) {
    throw new ApiError(409, "seller_missing", "This request's seller account no longer exists; it cannot be resolved.");
  }
  assertRegion(input.actor, { countryCode: vendor.countryCode, city: vendor.market });

  if (request.status !== "PENDING") {
    throw new ApiError(409, "request_already_resolved", "This category request has already been resolved.");
  }

  if (action === "REJECTED") {
    const claimed = await prisma.$transaction(async (tx) => {
      const changed = await tx.categoryRequest.updateMany({
        where: { id: request.id, status: "PENDING" },
        data: { status: "REJECTED", adminNote: note, resolvedCategoryId: null }
      });
      if (changed.count !== 1) {
        throw new ApiError(409, "request_already_resolved", "This category request changed before it could be rejected.");
      }
      await recordAudit({
        tx,
        actorId: input.actor.id,
        action: "taxonomy.category_request.rejected",
        entity: "CategoryRequest",
        entityId: request.id,
        metadata: { sellerId: request.sellerId, suggestedName: request.suggestedName, note }
      });
      return tx.categoryRequest.findUniqueOrThrow({ where: { id: request.id } });
    });

    await notifyResolution({
      actorId: input.actor.id,
      vendorId: request.sellerId,
      requestId: request.id,
      suggestedName: request.suggestedName,
      status: "REJECTED",
      note
    });

    const [view] = await enrichRequests([claimed]);
    return { request: view, category: null };
  }

  const categoryId = typeof input.body.categoryId === "string" ? input.body.categoryId.trim() : "";
  const wantsCreate = input.body.createCategory !== undefined && input.body.createCategory !== null && input.body.createCategory !== false;
  if (categoryId && wantsCreate) {
    throw new ApiError(400, "validation_error", "Provide categoryId or createCategory, not both.");
  }
  if (!categoryId && !wantsCreate) {
    throw new ApiError(400, "validation_error", "Choose an existing category or request creation of a new one.");
  }
  if (wantsCreate && input.body.createCategory !== true && !isPlainObject(input.body.createCategory)) {
    throw new ApiError(400, "validation_error", "createCategory must be true or an object.");
  }

  const outcome = await prisma.$transaction(async (tx) => {
    const current = await tx.categoryRequest.findUnique({ where: { id: request.id } });
    if (!current || current.status !== "PENDING") {
      throw new ApiError(409, "request_already_resolved", "This category request changed before it could be approved.");
    }

    let resolvedCategoryId = categoryId;
    if (resolvedCategoryId) {
      await assertSellerCategoryEligibility({
        db: tx,
        categoryId: resolvedCategoryId,
        countryCode: vendor.countryCode
      });
    } else {
      const overrides = isPlainObject(input.body.createCategory) ? input.body.createCategory : {};
      const providedSlug = typeof overrides.slug === "string" ? overrides.slug.trim() : "";
      const slug = providedSlug || (await uniqueSlug(tx, slugifyCategoryName(current.suggestedName)));
      const providedKey = typeof overrides.key === "string" ? overrides.key.trim() : "";
      const key = providedKey || (await uniqueKey(tx, slug));
      const createValues = await validateCategoryCreateInput(
        tx,
        createBodyFromRequest({
          request: current,
          createCategory: input.body.createCategory,
          key,
          slug
        })
      );
      const created = await createCategoryRecord(tx, input.actor.id, createValues);
      resolvedCategoryId = created.id;
      await recordAudit({
        tx,
        actorId: input.actor.id,
        action: "taxonomy.category.created",
        entity: "Category",
        entityId: created.id,
        metadata: {
          source: "category_request",
          requestId: current.id,
          name: created.name,
          slug: created.slug,
          key: created.key,
          parentId: created.parentId,
          level: created.level,
          isRegulated: created.isRegulated,
          scope: regulatedScopeDecision(input.actor)
        }
      });
    }

    const changed = await tx.categoryRequest.updateMany({
      where: { id: current.id, status: "PENDING" },
      data: { status: "APPROVED", adminNote: note, resolvedCategoryId }
    });
    if (changed.count !== 1) {
      throw new ApiError(409, "request_already_resolved", "This category request changed before it could be approved.");
    }

    await recordAudit({
      tx,
      actorId: input.actor.id,
      action: "taxonomy.category_request.approved",
      entity: "CategoryRequest",
      entityId: current.id,
      metadata: {
        sellerId: current.sellerId,
        suggestedName: current.suggestedName,
        resolvedCategoryId,
        createdCategory: !categoryId,
        note
      }
    });

    const resolved = await tx.categoryRequest.findUniqueOrThrow({ where: { id: current.id } });
    return { request: resolved, categoryId: resolvedCategoryId };
  });

  await notifyResolution({
    actorId: input.actor.id,
    vendorId: request.sellerId,
    requestId: request.id,
    suggestedName: request.suggestedName,
    status: "APPROVED",
    note
  });

  const [view] = await enrichRequests([outcome.request]);
  const category = await prisma.category.findUnique({
    where: { id: outcome.categoryId },
    select: { id: true, name: true, slug: true }
  });
  return { request: view, category };
}

export async function getAdminTaxonomy(actor: SessionUser): Promise<{
  departments: AdminTaxonomyNode[];
  requests: AdminCategoryRequestView[];
}> {
  const records = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
    include: ADMIN_CATEGORY_INCLUDE
  });
  const pending = await listAdminCategoryRequests(actor, "PENDING");
  return { departments: buildAdminTaxonomyTree(records, actor), requests: pending.requests };
}
