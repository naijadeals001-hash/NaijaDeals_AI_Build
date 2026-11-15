import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jsonError } from "@/lib/auth/guard";
import { requireAutomationConsumer } from "@/lib/services/core/automation-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, private", Vary: "Cookie" };

/** Sanitized operator view: counts and dead-letter identity, never payloads. */
export async function GET(request: NextRequest) {
  try {
    requireAutomationConsumer(request);
    const groups = await prisma.notificationIntent.groupBy({ by: ["status"], _count: { _all: true } });
    const dead = await prisma.notificationIntent.findMany({
      where: { status: "DEAD" },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: { id: true, eventType: true, entityType: true, entityId: true, attempts: true, lastError: true, updatedAt: true }
    });
    return NextResponse.json(
      {
        counts: Object.fromEntries(groups.map((row) => [row.status, row._count._all])),
        dead: dead.map((row) => ({ ...row, lastError: row.lastError?.slice(0, 160) ?? null, updatedAt: row.updatedAt.toISOString() }))
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    return jsonError(error);
  }
}
