import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/services/core/serialize";
import { recordAudit } from "@/lib/services/core/audit.service";
import { ApiError } from "@/lib/auth/api-error";

export const dynamic = "force-dynamic";

const ACTIONS = ["APPROVE", "REJECT"] as const;

/**
 * Moderation for customer product reviews.
 *
 * Reviews are created PENDING by `createReview` and only APPROVED rows are
 * aggregated into a product's rating, so without this endpoint nothing could
 * ever become visible. Approving is the only way a rating reaches the storefront.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("products:moderate");
    const body = await readJson<Record<string, unknown>>(request);
    const action = String(body.action ?? "").toUpperCase();
    if (!(ACTIONS as readonly string[]).includes(action)) {
      throw new ApiError(400, "validation_error", "action must be APPROVE or REJECT.");
    }

    const review = await prisma.review.findUnique({ where: { id: params.id }, select: { id: true, status: true, productId: true, rating: true } });
    if (!review) throw new ApiError(404, "review_not_found", "Review not found.");
    if (review.status === "APPROVED" && action === "APPROVE") {
      return NextResponse.json(jsonSafe({ ...review, unchanged: true }));
    }

    const updated = await prisma.review.update({
      where: { id: review.id },
      data: { status: action === "APPROVE" ? "APPROVED" : "REJECTED" },
      select: { id: true, status: true, productId: true, rating: true }
    });
    await recordAudit({
      actorId: admin.id,
      action: action === "APPROVE" ? "review.approved" : "review.rejected",
      entity: "Review",
      entityId: review.id,
      metadata: { productId: review.productId, rating: review.rating, previousStatus: review.status }
    });
    return NextResponse.json(jsonSafe(updated));
  } catch (error) {
    return jsonError(error);
  }
}

/** Pending queue for the Control Center. */
export async function GET() {
  try {
    await requireAdminPermission("products:moderate");
    const reviews = await prisma.review.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 100,
      select: {
        id: true,
        rating: true,
        title: true,
        body: true,
        createdAt: true,
        product: { select: { name: true, slug: true } },
        user: { select: { name: true } }
      }
    });
    return NextResponse.json(jsonSafe({ reviews }));
  } catch (error) {
    return jsonError(error);
  }
}
