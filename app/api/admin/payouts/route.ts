import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPayout } from "@/lib/services/core/admin.service";
import { assertSameOrigin, jsonError, readJson, requireAdmin, requireString } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const payouts = await prisma.payout.findMany({
      include: { vendor: { select: { name: true, slug: true } } },
      orderBy: { createdAt: "desc" }
    });
    return NextResponse.json(jsonSafe(payouts));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const body = await readJson<Record<string, unknown>>(request);
    const periodStart = new Date(requireString(body.periodStart, "Period start", 40));
    const periodEnd = new Date(requireString(body.periodEnd, "Period end", 40));
    if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
      return NextResponse.json({ error: "Invalid payout period.", code: "validation_error" }, { status: 400 });
    }
    const payout = await createPayout({
      adminId: admin.id,
      vendorId: requireString(body.vendorId, "Vendor", 100),
      periodStart,
      periodEnd
    });
    return NextResponse.json(jsonSafe(payout), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
