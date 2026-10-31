import { NextResponse } from "next/server";
import type { RideStatus } from "@prisma/client";
import { driverUpdateRideStatus } from "@/lib/services/core/drive.service";
import { assertSameOrigin, jsonError, readJson, requireDriver, requireString } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

const allowed: Array<Extract<RideStatus, "driver_arriving" | "in_progress" | "completed">> = [
  "driver_arriving",
  "in_progress",
  "completed"
];

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireDriver();
    const body = await readJson<Record<string, unknown>>(request);
    const status = requireString(body.status, "Status", 40) as (typeof allowed)[number];
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: "Unknown ride status.", code: "invalid_status" }, { status: 400 });
    }
    const ride = await driverUpdateRideStatus({ userId: user.id, rideId: params.id, status });
    return NextResponse.json(jsonSafe(ride));
  } catch (error) {
    return jsonError(error);
  }
}
