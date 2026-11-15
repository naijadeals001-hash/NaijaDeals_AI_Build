import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission } from "@/lib/auth/guard";
import { setTicketPriority, setTicketStatus, staffScope } from "@/lib/services/core/support.service";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, context: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("support:write");
    const body = await readJson<{ status?: unknown; priority?: unknown }>(request);
    const scope = staffScope(admin);
    const result: Record<string, unknown> = {};
    if (body.status !== undefined) Object.assign(result, await setTicketStatus(admin, scope, context.params.id, body.status));
    if (body.priority !== undefined) Object.assign(result, await setTicketPriority(admin, scope, context.params.id, body.priority));
    if (!Object.keys(result).length) {
      return NextResponse.json({ error: "nothing_to_update", message: "Provide a status or priority." }, { status: 422 });
    }
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
