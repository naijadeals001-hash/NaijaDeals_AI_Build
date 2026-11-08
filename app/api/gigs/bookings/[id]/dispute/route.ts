import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, optionalString, readJson, requireString, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { openBookingDispute } from "@/lib/services/gigs/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const dispute = await openBookingDispute(user.id, params.id, {
      reason: requireString(body.reason, "Reason", 200),
      details: optionalString(body.details, 3000) ?? undefined
    });
    return NextResponse.json(jsonSafe(dispute), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
