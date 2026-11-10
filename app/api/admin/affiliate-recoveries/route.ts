import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin, jsonError, requireAdminPermission } from "@/lib/auth/guard";
import { collectRecovery, writeOffRecovery, recoverySummary } from "@/lib/services/affiliate/recovery";
import { jsonSafe } from "@/lib/services/core/serialize";

/**
 * Commission shortfall administration.
 * Reading needs affiliates:read; collecting or writing off needs
 * affiliates:manage, and both are audited inside the service.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminPermission("affiliates:read");
    const [rows, summary] = await Promise.all([
      prisma.affiliateRecovery.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
      recoverySummary()
    ]);
    return NextResponse.json(jsonSafe({ rows, summary }));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("affiliates:manage");
    const body = (await request.json().catch(() => ({}))) as {
      recoveryId?: string;
      action?: "collect" | "write-off";
      amountKobo?: string;
      reason?: string;
    };
    if (!body.recoveryId || !body.action) {
      return NextResponse.json({ error: "recoveryId and action are required.", code: "invalid_request" }, { status: 400 });
    }
    if (body.action === "write-off") {
      if (!body.reason || body.reason.trim().length < 5) {
        return NextResponse.json({ error: "A written reason is required.", code: "reason_required" }, { status: 400 });
      }
      return NextResponse.json(await writeOffRecovery({ actorId: admin.id, recoveryId: body.recoveryId, reason: body.reason }));
    }
    if (!body.amountKobo || !/^[0-9]+$/.test(body.amountKobo)) {
      return NextResponse.json({ error: "amountKobo must be a whole number of kobo.", code: "invalid_amount" }, { status: 400 });
    }
    return NextResponse.json(await collectRecovery({ actorId: admin.id, recoveryId: body.recoveryId, amountKobo: BigInt(body.amountKobo) }));
  } catch (error) {
    return jsonError(error);
  }
}
