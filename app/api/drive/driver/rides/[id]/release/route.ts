import { NextResponse } from "next/server";
import { releaseRide } from "@/lib/services/core/drive.service";
import { assertSameOrigin, jsonError, readJson, requireDriver } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireDriver();
    const body = await readJson<Record<string, unknown>>(request).catch(() => ({}) as Record<string, unknown>);
    const ride = await releaseRide({
      userId: user.id,
      rideId: params.id,
      reason: typeof body.reason === "string" ? body.reason : null
    });
    return NextResponse.json(jsonSafe(ride));
  } catch (error) {
    return jsonError(error);
  }
}
