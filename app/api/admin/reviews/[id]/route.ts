import { NextResponse } from "next/server";
import {
  assertSameOrigin,
  jsonError,
  optionalString,
  readJson,
  requireAdminPermission
} from "@/lib/auth/guard";
import { assertProductRegion } from "@/lib/auth/scope";
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
 * A rejection reason is recorded in the audit trail; it is not published.
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
    const reason = optionalString(body.reason, 500) ?? "";
    if (action === "REJECT" && reason.length === 0) {
      throw new ApiError(400, "reason_required", "A reason is required to reject a review.");
    }

    const review = await prisma.review.findUnique({
      where: { id: params.id },
      select: { id: true, status: true, productId: true, rating: true, product: { select: { countryCode: true } } }
    });
    if (!review) throw new ApiError(404, "review_not_found", "Review not found.");
    await assertProductRegion(admin, review.productId);

    const nextStatus = action === "APPROVE" ? "APPROVED" : "REJECTED";
    if (review.status === nextStatus) {
      return NextResponse.json(jsonSafe({ id: review.id, status: review.status, productId: review.productId, rating: review.rating, unchanged: true }));
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.review.update({
        where: { id: review.id },
        data: { status: nextStatus },
        select: {
          id: true,
          status: true,
          productId: true,
          rating: true,
          product: { select: { name: true, slug: true } }
        }
      });
      await recordAudit({
        tx,
        actorId: admin.id,
        action: action === "APPROVE" ? "review.approved" : "review.rejected",
        entity: "Review",
        entityId: review.id,
        metadata: {
          productId: review.productId,
          productCountryCode: review.product.countryCode,
          rating: review.rating,
          previousStatus: review.status,
          nextStatus,
          ...(reason ? { reason } : {})
        }
      });
      return row;
    });
    return NextResponse.json(jsonSafe(updated));
  } catch (error) {
    return jsonError(error);
  }
}
