import { NextResponse } from "next/server";
import type { AffiliateCampaignStatus } from "@prisma/client";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin, jsonError, requireAdminPermission } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/services/core/audit.service";
import { jsonSafe } from "@/lib/services/core/serialize";
import { isSupportedAffiliateVertical } from "@/lib/services/affiliate/verticals";

/**
 * Campaign lifecycle.
 *
 * A campaign must be ACTIVE before an affiliate can discover it or create a
 * link, so activation is the deliberate step between drafting terms and opening
 * traffic. Only these transitions are legal: DRAFT or PAUSED → ACTIVE,
 * ACTIVE → PAUSED, and any non-ended state → ENDED. ENDED is terminal, because
 * reopening a campaign would change the rules attributed traffic is judged by.
 *
 * Activation is refused when the campaign cannot pay: no commission rule, no
 * remaining budget, or an expiry already in the past.
 */

export const dynamic = "force-dynamic";

const TRANSITIONS: Record<string, readonly string[]> = {
  DRAFT: ["ACTIVE", "ENDED"],
  ACTIVE: ["PAUSED", "ENDED"],
  PAUSED: ["ACTIVE", "ENDED"],
  ENDED: []
};

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("affiliates:manage");
    const body = (await request.json().catch(() => ({}))) as { status?: string };
    const next = String(body.status ?? "").trim().toUpperCase();
    if (!next) return NextResponse.json({ error: "status is required.", code: "invalid_status" }, { status: 400 });

    const campaign = await prisma.affiliateCampaign.findUnique({ where: { id: params.id } });
    if (!campaign) return NextResponse.json({ error: "Campaign not found.", code: "not_found" }, { status: 404 });

    const allowed = TRANSITIONS[campaign.status] ?? [];
    if (!allowed.includes(next)) {
      return NextResponse.json(
        { error: `A ${campaign.status} campaign cannot become ${next}.`, code: "invalid_transition", current: campaign.status, allowed },
        { status: 409 }
      );
    }

    if (next === "ACTIVE" && !isSupportedAffiliateVertical(campaign.vertical)) {
      return NextResponse.json({ error: `The ${campaign.vertical} vertical has no verified affiliate integration.`, code: "unsupported_vertical" }, { status: 409 });
    }
    if (next === "ACTIVE") {
      if (campaign.commissionBps <= 0 && (campaign.commissionFlatKobo ?? 0n) <= 0n) {
        return NextResponse.json({ error: "Set a percentage or flat commission before activating.", code: "invalid_commission" }, { status: 409 });
      }
      if (campaign.budgetKobo - campaign.spentKobo <= 0n) {
        return NextResponse.json({ error: "The campaign budget is exhausted.", code: "budget_exhausted" }, { status: 409 });
      }
      if (campaign.effectiveTo && campaign.effectiveTo.getTime() <= Date.now()) {
        return NextResponse.json({ error: "The campaign expiry has already passed.", code: "campaign_expired" }, { status: 409 });
      }
    }

    // Conditional on the status we read, so two administrators cannot both
    // apply a transition from the same starting state.
    const claimed = await prisma.affiliateCampaign.updateMany({
      where: { id: campaign.id, status: campaign.status },
      data: { status: next as AffiliateCampaignStatus }
    });
    if (claimed.count === 0) {
      return NextResponse.json({ error: "Another administrator changed this campaign.", code: "contended" }, { status: 409 });
    }

    const updated = await prisma.affiliateCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
    await recordAudit({
      actorId: admin.id,
      action: "affiliate.campaign_status_changed",
      entity: "AffiliateCampaign",
      entityId: campaign.id,
      metadata: { from: campaign.status, to: next, slug: campaign.slug }
    });
    return NextResponse.json(jsonSafe(updated));
  } catch (error) {
    return jsonError(error);
  }
}
