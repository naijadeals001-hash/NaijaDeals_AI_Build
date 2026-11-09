import { NextResponse } from "next/server";
import { jsonError, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/services/core/audit.service";

export const dynamic = "force-dynamic";

const STALE_MS = 90_000;

/**
 * Operations view of driver positions for ONE work session.
 *
 * Access requires `deliveries:read`. A session reference is mandatory — there is
 * no endpoint that returns every driver at once, so positions cannot be scraped
 * in bulk. Each read is audited with the operator, the session and how many
 * fixes were returned. Freshness is computed here, never assumed by the client.
 */
export async function GET(request: Request) {
  try {
    const admin = await requireAdminPermission("deliveries:read");
    const sessionRef = new URL(request.url).searchParams.get("sessionRef");
    if (!sessionRef) throw new ApiError(400, "session_required", "sessionRef is required; bulk position feeds are not exposed.");
    const limit = Math.min(500, Math.max(1, Number(new URL(request.url).searchParams.get("limit") ?? 100)));

    const [latest, trail] = await Promise.all([
      prisma.locationPing.findFirst({ where: { sessionRef }, orderBy: { capturedAt: "desc" }, select: { latitude: true, longitude: true, accuracyM: true, speedMps: true, headingDeg: true, capturedAt: true, source: true, userId: true } }),
      prisma.locationPing.findMany({ where: { sessionRef }, orderBy: { capturedAt: "desc" }, take: limit, select: { latitude: true, longitude: true, capturedAt: true } })
    ]);
    if (!latest) throw new ApiError(404, "no_positions", "No positions have been recorded for that session.");

    await recordAudit({
      actorId: admin.id,
      action: "location.positions_viewed",
      entity: "LocationPing",
      entityId: sessionRef,
      metadata: { sessionRef, returned: trail.length }
    });

    const ageMs = Date.now() - latest.capturedAt.getTime();
    return NextResponse.json(jsonSafe({
      sessionRef,
      driverUserId: latest.userId,
      live: ageMs <= STALE_MS,
      stale: ageMs > STALE_MS,
      ageSeconds: Math.round(ageMs / 1000),
      latest,
      trail: trail.slice().reverse()
    }));
  } catch (error) {
    return jsonError(error);
  }
}
