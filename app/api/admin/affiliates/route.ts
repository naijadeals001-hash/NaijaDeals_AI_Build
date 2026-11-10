import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin, jsonError, requireAdminPermission } from "@/lib/auth/guard";
import { decideAffiliate } from "@/lib/services/affiliate/service";
import { jsonSafe } from "@/lib/services/core/serialize";

/**
 * Affiliate administration. Reading needs affiliates:read; changing a decision
 * needs affiliates:manage, which only admin and super_admin hold.
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAdminPermission("affiliates:read");
    const status = request.nextUrl.searchParams.get("status");
    const rows = await prisma.affiliateProfile.findMany({
      where: status ? { status: status as never } : {},
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { id: true, name: true, email: true } } }
    });
    return NextResponse.json(jsonSafe(rows));
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("affiliates:manage");
    const body = (await request.json().catch(() => ({}))) as {
      affiliateId?: string;
      decision?: "approve" | "reject" | "suspend";
      reason?: string;
    };
    if (!body.affiliateId || !body.decision) {
      return NextResponse.json({ error: "affiliateId and decision are required.", code: "invalid_request" }, { status: 400 });
    }
    if (body.decision === "suspend") {
      const updated = await prisma.affiliateProfile.update({
        where: { id: body.affiliateId },
        data: { status: "SUSPENDED", suspendedReason: (body.reason ?? "Suspended by an administrator.").slice(0, 300) }
      });
      return NextResponse.json(jsonSafe(updated));
    }
    const updated = await decideAffiliate({
      actorId: admin.id,
      affiliateId: body.affiliateId,
      approve: body.decision === "approve",
      reason: body.reason
    });
    return NextResponse.json(jsonSafe(updated));
  } catch (error) {
    return jsonError(error);
  }
}
