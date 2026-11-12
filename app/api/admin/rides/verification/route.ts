import { NextResponse } from "next/server";
import { listRideVerificationSupport } from "@/lib/services/core/drive.service";
import { jsonError, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

/**
 * Control Center pickup-code support queue.
 *
 * Requires `rides:write` because every row exposes a support reset/verify action.
 * The response carries verification state only; raw codes, salts and hashes are
 * never selected.
 */
export async function GET() {
  try {
    const admin = await requireAdminPermission("rides:write");
    return NextResponse.json(
      jsonSafe({ rides: await listRideVerificationSupport(), adminId: admin.id }),
      { headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" } }
    );
  } catch (error) {
    return jsonError(error);
  }
}
