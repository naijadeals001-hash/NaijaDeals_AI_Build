import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Incoming = { clientId?: unknown; latitude?: unknown; longitude?: unknown; accuracyM?: unknown; speedMps?: unknown; headingDeg?: unknown; capturedAt?: unknown; source?: unknown };

/** Rejects coordinates outside Earth's ranges and absurd accuracy values. */
function validNumber(value: unknown, min: number, max: number) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/**
 * Uploads a batch of location fixes for an active work session.
 *
 * - `clientId` is unique per device, so a retried batch cannot duplicate rows.
 * - Only the owning user may post to their session.
 * - The session must belong to work the user actually holds: a NaijaDrive trip
 *   they are driving, or a NaijaSend shipment they are assigned to.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const sessionRef = String(body.sessionRef ?? "");
    const fixes = Array.isArray(body.fixes) ? (body.fixes as Incoming[]) : [];
    if (!sessionRef) throw new ApiError(400, "session_required", "sessionRef is required.");
    if (!fixes.length) return NextResponse.json({ accepted: 0 });
    if (fixes.length > 200) throw new ApiError(400, "batch_too_large", "Send at most 200 fixes per batch.");

    const authorised = await ownsSession(user.id, sessionRef);
    if (!authorised) throw new ApiError(403, "not_your_session", "You are not working on that session.");

    const device = await prisma.deviceRegistration.findFirst({ where: { userId: user.id, revokedAt: null }, orderBy: { lastSeenAt: "desc" }, select: { id: true } });
    const deviceId = device?.id ?? (await prisma.deviceRegistration.create({ data: { userId: user.id, platform: "web" }, select: { id: true } })).id;

    const rows = fixes
      .map((fix) => {
        const lat = validNumber(fix.latitude, -90, 90);
        const lng = validNumber(fix.longitude, -180, 180);
        const clientId = typeof fix.clientId === "string" ? fix.clientId.slice(0, 80) : "";
        const capturedAt = typeof fix.capturedAt === "string" ? new Date(fix.capturedAt) : null;
        if (lat === null || lng === null || !clientId || !capturedAt || Number.isNaN(capturedAt.getTime())) return null;
        return {
          deviceId,
          userId: user.id,
          sessionRef,
          latitude: lat,
          longitude: lng,
          accuracyM: validNumber(fix.accuracyM, 0, 100_000),
          speedMps: validNumber(fix.speedMps, 0, 200),
          headingDeg: validNumber(fix.headingDeg, 0, 360),
          capturedAt,
          clientId,
          source: fix.source === "native" ? "native" : "browser"
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (!rows.length) throw new ApiError(400, "no_valid_fixes", "No valid coordinates in that batch.");

    // skipDuplicates makes re-uploading the same queue a no-op.
    const result = await prisma.locationPing.createMany({ data: rows, skipDuplicates: true });
    await prisma.deviceRegistration.update({ where: { id: deviceId }, data: { lastSeenAt: new Date() } }).catch(() => null);
    return NextResponse.json(jsonSafe({ accepted: result.count, received: rows.length }));
  } catch (error) {
    return jsonError(error);
  }
}

/** Latest fix per session for the caller's own active work, with a stale flag. */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const sessionRef = new URL(request.url).searchParams.get("sessionRef");
    if (!sessionRef) throw new ApiError(400, "session_required", "sessionRef is required.");
    const authorised = await ownsSession(user.id, sessionRef);
    if (!authorised) throw new ApiError(403, "not_your_session", "You are not working on that session.");
    const latest = await prisma.locationPing.findFirst({ where: { sessionRef }, orderBy: { capturedAt: "desc" } });
    const stale = !latest || Date.now() - latest.capturedAt.getTime() > 90_000;
    return NextResponse.json(jsonSafe({ latest, stale }));
  } catch (error) {
    return jsonError(error);
  }
}

/** Sessions are namespaced: drive:<rideId> and send:<shipmentId>. */
async function ownsSession(userId: string, sessionRef: string) {
  const [kind, id] = sessionRef.split(":");
  if (!id) return false;
  if (kind === "drive") {
    const ride = await prisma.ride.findFirst({ where: { id, driver: { userId } }, select: { id: true } });
    return Boolean(ride);
  }
  if (kind === "send") {
    const assignment = await prisma.shipmentAssignment.findFirst({
      where: { shipmentId: id, revokedAt: null, providerId: { in: (await prisma.logisticsProvider.findMany({ where: { ownerId: userId }, select: { id: true } })).map((row) => row.id) } },
      select: { id: true }
    });
    return Boolean(assignment);
  }
  return false;
}
