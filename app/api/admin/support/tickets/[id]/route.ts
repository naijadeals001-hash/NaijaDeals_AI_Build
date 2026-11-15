import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jsonError, requireAdminPermission } from "@/lib/auth/guard";
import { getStaffTicket, staffScope } from "@/lib/services/core/support.service";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, private", Vary: "Cookie" };



export async function GET(_request: NextRequest, context: { params: { id: string } }) {
  try {
    const admin = await requireAdminPermission("support:read");
    return NextResponse.json(await getStaffTicket(staffScope(admin), context.params.id), { headers: NO_STORE });
  } catch (error) {
    return jsonError(error);
  }
}
