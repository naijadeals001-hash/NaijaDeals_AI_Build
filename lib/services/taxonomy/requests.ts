import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/services/core/audit.service";
import { MAX_CATEGORY_LEVEL, categoryPath, readImagePath, readText } from "./shared";

export type SellerCategoryRequestView = {
  id: string;
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

/**
 * Records a seller's suggested category.
 *
 * The request is a durable PENDING row only: it does not create a category and
 * does not change any product's status, so a seller cannot publish by asking.
 * `sellerId` is the Vendor id (the seller identity used by product ownership);
 * the audit actor is the authenticated user.
 */
export async function createSellerCategoryRequest(input: {
  sellerId: string;
  actorId: string;
  body: Record<string, unknown>;
}): Promise<{ id: string; status: "PENDING" }> {
  const suggestedName = readText(input.body.suggestedName, "Suggested category name", 2, 120);
  const description = readText(input.body.description, "Description", 5, 2000);
  const imageUrl = readImagePath(input.body.imageUrl) ?? null;

  let parentId: string | null = null;
  if (input.body.parentId !== undefined && input.body.parentId !== null && input.body.parentId !== "") {
    parentId = readText(input.body.parentId, "Parent category", 1, 100);
    const parent = await prisma.category.findUnique({
      where: { id: parentId },
      select: { id: true, level: true, isActive: true, deprecatedAt: true }
    });
    if (!parent) throw new ApiError(400, "invalid_parent", "Choose a valid parent category.");
    if (!parent.isActive || parent.deprecatedAt) {
      throw new ApiError(400, "parent_unavailable", "The parent category is inactive or deprecated.");
    }
    if (parent.level >= MAX_CATEGORY_LEVEL) {
      throw new ApiError(400, "parent_too_deep", "The selected parent is already at the deepest supported level.");
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const request = await tx.categoryRequest.create({
      data: {
        sellerId: input.sellerId,
        suggestedName,
        description,
        parentId,
        imageUrl,
        status: "PENDING"
      }
    });
    await recordAudit({
      tx,
      actorId: input.actorId,
      action: "taxonomy.category_request.created",
      entity: "CategoryRequest",
      entityId: request.id,
      metadata: {
        sellerId: input.sellerId,
        suggestedName,
        parentId,
        hasImage: Boolean(imageUrl)
      }
    });
    return request;
  });

  return { id: created.id, status: "PENDING" };
}

export async function listSellerCategoryRequests(sellerId: string): Promise<{ requests: SellerCategoryRequestView[] }> {
  const requests = await prisma.categoryRequest.findMany({
    where: { sellerId },
    orderBy: { createdAt: "desc" }
  });

  const categories = await prisma.category.findMany({
    select: { id: true, parentId: true, name: true, slug: true }
  });
  const byId = new Map(categories.map((category) => [category.id, category]));

  return {
    requests: requests.map((request) => ({
      id: request.id,
      suggestedName: request.suggestedName,
      description: request.description,
      parentId: request.parentId,
      parentPath: request.parentId ? categoryPath(request.parentId, byId) : null,
      parent: request.parentId ? byId.get(request.parentId) ?? null : null,
      imageUrl: request.imageUrl,
      status: request.status,
      adminNote: request.adminNote,
      resolvedCategoryId: request.resolvedCategoryId,
      resolvedCategoryPath: request.resolvedCategoryId ? categoryPath(request.resolvedCategoryId, byId) : null,
      resolvedCategory: request.resolvedCategoryId ? byId.get(request.resolvedCategoryId) ?? null : null,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt
    }))
  };
}
