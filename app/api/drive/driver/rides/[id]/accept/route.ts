import { NextResponse } from "next/server";
import { acceptRide } from "@/lib/services/core/drive.service";
import { assertSameOrigin, jsonError, requireDriver } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireDriver();
    const ride = await acceptRide({ userId: user.id, rideId: params.id });
    return NextResponse.json(jsonSafe(ride));
  } catch (error) {
    return jsonError(error);
  }
}
