import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission } from "@/lib/auth/guard";
import { assignTicket, staffScope } from "@/lib/services/core/support.service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("support:assign");
    const body = await readJson<{ assigneeId?: unknown }>(request);
    const assigneeId = typeof body.assigneeId === "string" && body.assigneeId ? body.assigneeId : null;
    return NextResponse.json(await assignTicket(admin, staffScope(admin), context.params.id, assigneeId));
  } catch (error) {
    return jsonError(error);
  }
}
