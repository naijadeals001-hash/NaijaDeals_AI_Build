import { NextResponse } from "next/server";
import { getDriverPresence, setDriverPresence } from "@/lib/services/core/drive.service";
import { assertSameOrigin, jsonError, readJson, requireDriver } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

/**
 * Authoritative driver presence.
 *
 * GET recovers the server state after a refresh and expires a presence whose
 * heartbeat has passed the documented TTL. POST starts or ends presence, or sends
 * a heartbeat with the browser's real coordinates. A client cannot post online
 * minutes; every timestamp is written here.
 */
export async function GET() {
  try {
    const user = await requireDriver();
    return NextResponse.json(jsonSafe(await getDriverPresence(user.id)));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireDriver();
    const body = await readJson<Record<string, unknown>>(request);
    const action = String(body.action ?? "");
    if (action !== "go_online" && action !== "go_offline" && action !== "heartbeat") {
      return NextResponse.json(
        { error: "action must be go_online, go_offline or heartbeat.", code: "validation_error" },
        { status: 400 }
      );
    }
    const presence = await setDriverPresence({
      userId: user.id,
      action,
      latitude: body.latitude,
      longitude: body.longitude,
      accuracyM: body.accuracyM
    });
    return NextResponse.json(jsonSafe(presence));
  } catch (error) {
    return jsonError(error);
  }
}
