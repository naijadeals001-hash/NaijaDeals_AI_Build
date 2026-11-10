import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin, jsonError, requireAdminPermission } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/services/core/audit.service";
import { jsonSafe } from "@/lib/services/core/serialize";

/**
 * Affiliate reversal review queue.
 *
 * Reading needs affiliates:read; resolving needs affiliates:manage. A parked
 * intent has no frozen basis, so the reviewer supplies the historical basis and
 * the evidence it came from. The current campaign is never consulted: inferring
 * from an editable field is how history gets rewritten.
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAdminPermission("affiliates:read");
    const take = Math.min(Math.max(Number(request.nextUrl.searchParams.get("take") ?? 20), 1), 100);
    const orderId = request.nextUrl.searchParams.get("orderId") ?? undefined;
    const rows = await prisma.affiliateReversalIntent.findMany({
      where: { state: "FAILED", lastError: { startsWith: "review_required:" }, ...(orderId ? { orderId } : {}) },
      orderBy: { updatedAt: "desc" },
      take,
      select: { id: true, refundId: true, orderId: true, amountKobo: true, eligibleKobo: true, allocationPolicy: true, attempts: true, lastError: true, updatedAt: true }
    });
    return NextResponse.json(jsonSafe({ rows, count: rows.length }));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("affiliates:manage");
    const body = (await request.json().catch(() => ({}))) as {
      intentId?: string; basisType?: string; basisKobo?: string; evidenceRef?: string; reason?: string;
    };
    if (!body.intentId || !body.basisType || !body.basisKobo || !body.evidenceRef || !body.reason) {
      return NextResponse.json({ error: "intentId, basisType, basisKobo, evidenceRef and reason are required.", code: "invalid_request" }, { status: 400 });
    }
    if (body.basisType !== "SUBTOTAL" && body.basisType !== "TOTAL") {
      return NextResponse.json({ error: "basisType must be SUBTOTAL or TOTAL.", code: "invalid_basis" }, { status: 400 });
    }
    if (!/^[0-9]+$/.test(body.basisKobo) || body.evidenceRef.trim().length < 5 || body.reason.trim().length < 5) {
      return NextResponse.json({ error: "basisKobo must be whole kobo, and evidence and reason at least five characters.", code: "invalid_evidence" }, { status: 400 });
    }

    const intent = await prisma.affiliateReversalIntent.findUnique({ where: { id: body.intentId } });
    if (!intent) return NextResponse.json({ error: "Intent not found.", code: "not_found" }, { status: 404 });
    if (intent.state !== "FAILED") {
      return NextResponse.json({ error: `Intent is ${intent.state}, not awaiting review.`, code: "not_reviewable" }, { status: 409 });
    }

    const conversion = await prisma.affiliateConversion.findFirst({
      where: { entityType: "Order", entityId: intent.orderId }, orderBy: { createdAt: "desc" }
    });
    if (!conversion) return NextResponse.json({ error: "No conversion for this order.", code: "no_conversion" }, { status: 409 });

    // The reviewer states the historical basis; the eligible share is derived from
    // it, capped by what the conversion recorded and by what remains unallocated.
    const basisKobo = BigInt(body.basisKobo);
    if (basisKobo <= 0n || basisKobo > conversion.basisKobo) {
      return NextResponse.json({ error: "basisKobo must be positive and no greater than the recorded basis.", code: "invalid_basis" }, { status: 400 });
    }
    const paid = body.basisType === "TOTAL" ? basisKobo : conversion.basisKobo;
    const priorEligible = await prisma.affiliateReversalIntent.aggregate({
      where: { orderId: intent.orderId, eligibleKobo: { not: null }, id: { not: intent.id } },
      _sum: { eligibleKobo: true }
    });
    const alreadyAllocated = priorEligible._sum.eligibleKobo ?? 0n;
    const remaining = conversion.basisKobo - alreadyAllocated;
    const share = paid > 0n ? (intent.amountKobo * basisKobo) / paid : 0n;
    const eligibleKobo = share < remaining ? share : remaining;
    if (eligibleKobo <= 0n) {
      return NextResponse.json({ error: "Computed allocation is zero.", code: "invalid_allocation" }, { status: 400 });
    }

    const claimed = await prisma.affiliateReversalIntent.updateMany({
      where: { id: intent.id, state: "FAILED", lastError: { startsWith: "review_required:" } },
      data: { eligibleKobo, allocationPolicy: `review_${body.basisType.toLowerCase()}_v1`, state: "PENDING", attempts: 0, lastError: null }
    });
    if (claimed.count === 0) {
      return NextResponse.json({ error: "Another reviewer resolved this intent.", code: "contended" }, { status: 409 });
    }

    await recordAudit({
      actorId: admin.id,
      action: "affiliate.reversal_review_resolved",
      entity: "AffiliateReversalIntent",
      entityId: intent.id,
      metadata: { basisType: body.basisType, basisKobo: basisKobo.toString(), eligibleKobo: eligibleKobo.toString(), evidenceRef: body.evidenceRef, reason: body.reason }
    });

    return NextResponse.json({ id: intent.id, eligibleKobo: eligibleKobo.toString(), policy: `review_${body.basisType.toLowerCase()}_v1`, requeued: true });
  } catch (error) {
    return jsonError(error);
  }
}
