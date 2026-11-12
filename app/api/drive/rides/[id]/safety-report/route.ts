import { NextResponse } from "next/server";
import { listRideSafetyReports, submitRideSafetyReport } from "@/lib/services/core/drive.service";
import {
  assertSameOrigin,
  jsonError,
  readJson,
  requireString,
  requireUser
} from "@/lib/auth/guard";
import { isAdmin } from "@/lib/auth/session";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

/**
 * Safety reports are operational records, separate from ratings and reviews.
 * There is no public testimonial surface for them.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const reports = await listRideSafetyReports({
      userId: user.id,
      isAdmin: isAdmin(user),
      rideId: params.id
    });
    return NextResponse.json(jsonSafe({ reports }), {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const report = await submitRideSafetyReport({
      userId: user.id,
      rideId: params.id,
      category: requireString(body.category, "Category", 40),
      details: requireString(body.details, "Details", 1500)
    });
    return NextResponse.json(jsonSafe(report), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
