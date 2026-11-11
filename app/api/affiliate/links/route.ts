import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin, jsonError, requireUser } from "@/lib/auth/guard";
import { createLink } from "@/lib/services/affiliate/service";
import { jsonSafe } from "@/lib/services/core/serialize";
import { SUPPORTED_AFFILIATE_VERTICALS } from "@/lib/services/affiliate/verticals";

/** Campaign discovery and link creation for the signed-in affiliate. */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const now = new Date();
    const take = Math.min(Math.max(Number(request.nextUrl.searchParams.get("take") ?? 20), 1), 50);
    const cursor = request.nextUrl.searchParams.get("cursor");
    const campaigns = await prisma.affiliateCampaign.findMany({
      where: { status: "ACTIVE", vertical: { in: [...SUPPORTED_AFFILIATE_VERTICALS] }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true, slug: true, name: true, vertical: true, commissionBps: true,
        commissionFlatKobo: true, commissionBasis: true, attributionDays: true,
        budgetKobo: true, spentKobo: true
      }
    });
    const hasMore = campaigns.length > take;
    const page = hasMore ? campaigns.slice(0, take) : campaigns;
    return NextResponse.json(jsonSafe({
      rows: page.map((row) => ({
        id: row.id, slug: row.slug, name: row.name, vertical: row.vertical,
        commissionBps: row.commissionBps,
        commissionFlatKobo: row.commissionFlatKobo ? row.commissionFlatKobo.toString() : null,
        commissionBasis: row.commissionBasis,
        attributionDays: row.attributionDays,
        budgetRemainingKobo: (row.budgetKobo - row.spentKobo).toString()
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null
    }));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const profile = await prisma.affiliateProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!profile) {
      return NextResponse.json({ error: "Apply to the programme first.", code: "not_enrolled" }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as { campaignId?: string; destination?: string };
    if (!body.campaignId || !body.destination) {
      return NextResponse.json({ error: "campaignId and destination are required.", code: "invalid_request" }, { status: 400 });
    }
    const link = await createLink({ affiliateId: profile.id, campaignId: body.campaignId, destination: body.destination });
    return NextResponse.json({ id: link.id, code: link.code, destination: link.destination, path: `/r/${link.code}` }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
