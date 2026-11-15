import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jsonError, requireAdminPermission } from "@/lib/auth/guard";
import { getStaffTicket, staffScope } from "@/lib/services/core/support.service";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, context: { params: { id: string } }) {
  try {
    const admin = await requireAdminPermission("support:read");
    return NextResponse.json(await getStaffTicket(staffScope(admin), context.params.id));
  } catch (error) {
    return jsonError(error);
  }
}
