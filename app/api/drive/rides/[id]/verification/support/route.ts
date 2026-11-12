import { NextResponse } from "next/server";
import { overrideRideVerification } from "@/lib/services/core/drive.service";
import {
  assertSameOrigin,
  jsonError,
  readJson,
  requireAdminPermission,
  requireString
} from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

/**
 * Exceptional, audited pickup-code support handling.
 *
 * Only Control Center staff with `rides:write` may reset or verify a code. The
 * raw code is never returned here; the rider's own endpoint shows the new code
 * after a reset. Every call writes an AuditLog row with the reason.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("rides:write");
    const body = await readJson<Record<string, unknown>>(request);
    const action = requireString(body.action, "Action", 20);
    if (action !== "reset" && action !== "verify") {
      return NextResponse.json(
        { error: "Action must be reset or verify.", code: "invalid_action" },
        { status: 400 }
      );
    }
    const result = await overrideRideVerification({
      adminId: admin.id,
      rideId: params.id,
      action,
      reason: requireString(body.reason, "Reason", 300)
    });
    return NextResponse.json(jsonSafe(result), {
      headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" }
    });
  } catch (error) {
    return jsonError(error);
  }
}
