import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getPublicDriveRoute } from "@/lib/services/core/drive.service";
import { jsonError } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

/**
 * Real OSRM road geometry between two bookable landmarks.
 *
 * A null route is an honest answer, not an error: the map then shows the two
 * markers with a "route unavailable" notice and never draws a decorative straight
 * line. The quote itself remains server-authoritative and is not changed here.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const result = await getPublicDriveRoute(params.get("pickup"), params.get("dropoff"));
    return NextResponse.json(jsonSafe(result), {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return jsonError(error);
  }
}
