import { NextResponse } from "next/server";
import { verifyPassenger } from "@/lib/services/core/drive.service";
import { assertSameOrigin, jsonError, readJson, requireDriver, requireString } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

/** The assigned driver verifies the passenger's 4-digit code before starting. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireDriver();
    const body = await readJson<Record<string, unknown>>(request);
    const code = requireString(body.code, "Passenger code", 8);
    const result = await verifyPassenger({ userId: user.id, rideId: params.id, code });
    return NextResponse.json(jsonSafe(result));
  } catch (error) {
    return jsonError(error);
  }
}
