import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jsonError, requireAdminPermission } from "@/lib/auth/guard";
import { listStaffAssignees, listStaffTickets, staffScope } from "@/lib/services/core/support.service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminPermission("support:read");
    const url = new URL(request.url);
    const list = await listStaffTickets(staffScope(admin), {
      status: url.searchParams.get("status"),
      vertical: url.searchParams.get("vertical"),
      topic: url.searchParams.get("topic"),
      priority: url.searchParams.get("priority"),
      assignedToId: url.searchParams.get("assignedTo"),
      search: url.searchParams.get("q"),
      page: Number(url.searchParams.get("page") ?? 1) || 1,
      pageSize: Number(url.searchParams.get("pageSize") ?? 20) || 20
    });
    const assignees = await listStaffAssignees(staffScope(admin));
    return NextResponse.json({ ...list, assignees });
  } catch (error) {
    return jsonError(error);
  }
}
