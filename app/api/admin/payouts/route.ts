import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPayout } from "@/lib/services/core/admin.service";
import { assertLiveFinancialOperations } from "@/lib/payments/boundary";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission, requireString } from "@/lib/auth/guard";
import { assertVendorRegion, vendorScopeWhere } from "@/lib/auth/scope";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const admin = await requireAdminPermission("finance:read");
    const scope = vendorScopeWhere(admin);
    const payouts = await prisma.payout.findMany({
      where: Object.keys(scope).length > 0 ? { vendor: scope } : undefined,
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
    const admin = await requireAdminPermission("finance:payouts:write");
    assertLiveFinancialOperations("Vendor payout creation");
    const body = await readJson<Record<string, unknown>>(request);
    const periodStart = new Date(requireString(body.periodStart, "Period start", 40));
    const periodEnd = new Date(requireString(body.periodEnd, "Period end", 40));
    if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
      return NextResponse.json({ error: "Invalid payout period.", code: "validation_error" }, { status: 400 });
    }
    const vendorId = requireString(body.vendorId, "Vendor", 100);
    await assertVendorRegion(admin, vendorId);
    const payout = await createPayout({
      adminId: admin.id,
      vendorId,
      periodStart,
      periodEnd
    });
    return NextResponse.json(jsonSafe(payout), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
