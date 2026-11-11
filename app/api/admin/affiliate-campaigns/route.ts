import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin, jsonError, requireAdminPermission } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/services/core/audit.service";
import { jsonSafe } from "@/lib/services/core/serialize";
import { isSupportedAffiliateVertical, SUPPORTED_AFFILIATE_VERTICALS } from "@/lib/services/affiliate/verticals";

/** Campaign administration. Creation and editing need affiliates:manage. */

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminPermission("affiliates:read");
    const campaigns = await prisma.affiliateCampaign.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
    return NextResponse.json(jsonSafe(campaigns));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("affiliates:manage");
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const slug = String(body.slug ?? "").trim().toLowerCase();
    const name = String(body.name ?? "").trim();
    const bps = Number(body.commissionBps ?? 0);
    const budget = BigInt(String(body.budgetKobo ?? "0"));
    const vertical = String(body.vertical ?? "shop").trim().toLowerCase();
    if (!isSupportedAffiliateVertical(vertical)) return NextResponse.json({ error: `vertical must be one of: ${SUPPORTED_AFFILIATE_VERTICALS.join(", ")}.`, code: "unsupported_vertical" }, { status: 400 });
    if (!/^[a-z0-9-]{3,60}$/.test(slug)) return NextResponse.json({ error: "slug must be 3-60 lowercase characters", code: "invalid_slug" }, { status: 400 });
    if (name.length < 3) return NextResponse.json({ error: "name is required", code: "invalid_name" }, { status: 400 });
    if (!Number.isInteger(bps) || bps < 0 || bps > 5000) return NextResponse.json({ error: "commissionBps must be 0-5000", code: "invalid_bps" }, { status: 400 });
    if (budget <= 0n) return NextResponse.json({ error: "budgetKobo must be positive", code: "invalid_budget" }, { status: 400 });
    const campaign = await prisma.affiliateCampaign.create({
      data: {
        slug, name, vertical, status: "DRAFT", funding: "PLATFORM",
        commissionBps: bps, budgetKobo: budget, attributionDays: Number(body.attributionDays ?? 30),
        commissionBasis: body.commissionBasis === "TOTAL" ? "TOTAL" : "SUBTOTAL", ruleVersion: 1
      }
    });
    await recordAudit({ actorId: admin.id, action: "affiliate.campaign_created", entity: "AffiliateCampaign", entityId: campaign.id, metadata: { slug, commissionBps: bps, budgetKobo: budget.toString() } });
    return NextResponse.json(jsonSafe(campaign), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
