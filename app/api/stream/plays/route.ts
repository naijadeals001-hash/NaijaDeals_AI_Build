import { NextResponse } from "next/server";
import { assertSameOrigin, getOptionalUserId, jsonError, readJson } from "@/lib/auth/guard";
import { recordPlay } from "@/lib/services/stream/service";
import { ApiError } from "@/lib/auth/api-error";

export const dynamic = "force-dynamic";

/** Report a play. Deduplicated per 30s bucket; only ≥30s listens count. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const userId = await getOptionalUserId();
    const body = await readJson<Record<string, unknown>>(request);
    const trackId = typeof body.trackId === "string" ? body.trackId : "";
    const secondsPlayed = Number(body.secondsPlayed ?? 0);
    if (!trackId) throw new ApiError(400, "track_required", "trackId is required.");
    if (!Number.isFinite(secondsPlayed) || secondsPlayed < 0) throw new ApiError(400, "invalid_seconds", "secondsPlayed must be a number.");
    return NextResponse.json(await recordPlay({ trackId, userId: userId ?? undefined, secondsPlayed: Math.min(secondsPlayed, 3600) }));
  } catch (error) {
    return jsonError(error);
  }
}
