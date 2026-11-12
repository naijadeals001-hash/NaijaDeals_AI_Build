import { NextResponse } from "next/server";
import { jsonError, requireAdminPermission } from "@/lib/auth/guard";
import { scopeOf } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";

export const dynamic = "force-dynamic";

const STATUS_FILTERS = ["PENDING", "APPROVED", "REJECTED", "ALL"] as const;

/**
 * Moderation queue for the Control Center.
 *
 * `?status=PENDING` (default) is the original pending queue. `APPROVED`,
 * `REJECTED` and `ALL` let the Reviews tab show both sides of the ledger. Rows
 * outside the caller's country scope are excluded before serialisation.
 */
export async function GET(request: Request) {
  try {
    const admin = await requireAdminPermission("products:moderate");
    const requested = new URL(request.url).searchParams.get("status")?.toUpperCase() ?? "PENDING";
    if (!(STATUS_FILTERS as readonly string[]).includes(requested)) {
      throw new ApiError(400, "invalid_status", "status must be PENDING, APPROVED, REJECTED or ALL.");
    }
    const { countryCode } = scopeOf(admin);
    const reviews = await prisma.review.findMany({
      where: {
        ...(requested === "ALL" ? {} : { status: requested as "PENDING" | "APPROVED" | "REJECTED" }),
        ...(countryCode ? { product: { countryCode } } : {})
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        rating: true,
        title: true,
        body: true,
        status: true,
        verifiedPurchase: true,
        createdAt: true,
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            countryCode: true,
            vendor: { select: { name: true } },
            images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true, alt: true } }
          }
        },
        order: { select: { orderNumber: true } },
        user: { select: { name: true } }
      }
    });
    return NextResponse.json(jsonSafe({ reviews }));
  } catch (error) {
    return jsonError(error);
  }
}
