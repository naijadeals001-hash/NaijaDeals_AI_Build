import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, optionalString, readJson, requireAdminPermission, requireString } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";
import { calculateRoyalties } from "@/lib/services/stream/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminPermission("finance:read");
    const [pools, recent] = await Promise.all([
      prisma.streamRevenuePool.findMany({ orderBy: { period: "desc" }, take: 12 }),
      prisma.streamRoyaltyAccrual.findMany({ orderBy: { calculatedAt: "desc" }, take: 50, include: { track: { select: { title: true, artist: { select: { name: true } } } } } })
    ]);
    return NextResponse.json(jsonSafe({ pools, accruals: recent }));
  } catch (error) {
    return jsonError(error);
  }
}

/** Configure a period's royalty pool, or (action=calculate) run the accrual. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("finance:payouts:write");
    const body = await readJson<Record<string, unknown>>(request);
    if (body.action === "calculate") {
      const period = requireString(body.period, "Period", 7);
      return NextResponse.json(jsonSafe(await calculateRoyalties(period, admin.id)));
    }
    const period = requireString(body.period, "Period", 7);
    if (!/^\d{4}-\d{2}$/.test(period)) throw new ApiError(400, "invalid_period", "Period must be YYYY-MM.");
    const poolKobo = BigInt(String(body.poolKobo ?? ""));
    if (poolKobo <= BigInt(0)) throw new ApiError(400, "invalid_pool", "Pool must be a positive amount in kobo.");
    const pool = await prisma.streamRevenuePool.upsert({
      where: { period },
      update: { poolKobo, notes: optionalString(body.notes, 400) ?? null, createdBy: admin.id },
      create: { period, poolKobo, notes: optionalString(body.notes, 400) ?? null, createdBy: admin.id }
    });
    return NextResponse.json(jsonSafe(pool), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
