import { NextResponse } from "next/server";
import { cancelRide } from "@/lib/services/core/drive.service";
import { assertSameOrigin, jsonError, readJson, requireAdmin } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireAdmin();
    const body = await readJson<Record<string, unknown>>(request).catch(() => ({}) as Record<string, unknown>);
    const ride = await cancelRide({
      actorId: user.id,
      isAdmin: true,
      rideId: params.id,
      reason: typeof body.reason === "string" ? body.reason : "Cancelled by the Control Center."
    });
    return NextResponse.json(jsonSafe(ride));
  } catch (error) {
    return jsonError(error);
  }
}
