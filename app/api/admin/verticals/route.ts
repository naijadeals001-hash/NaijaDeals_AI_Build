import { NextResponse } from "next/server";
import { jsonError, requireAdminPermission } from "@/lib/auth/guard";
import { listVerticalControls } from "@/lib/services/core/vertical-activation.service";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

/**
 * Control Center → Service activation.
 *
 * Read is available to every Control Center operator with dashboard access.
 * Writing is gated separately by the super-admin-only `verticals:write`
 * permission on the per-vertical PATCH/DELETE route.
 */
export async function GET() {
  try {
    await requireAdminPermission("dashboard:read");
    return NextResponse.json(jsonSafe(await listVerticalControls()), {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return jsonError(error);
  }
}
