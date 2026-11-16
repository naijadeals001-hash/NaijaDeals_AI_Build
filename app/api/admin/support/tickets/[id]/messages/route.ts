import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission } from "@/lib/auth/guard";
import { staffReply, staffScope } from "@/lib/services/core/support.service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("support:write");
    const body = await readJson<{ message?: unknown; internal?: unknown }>(request);
    const reply = await staffReply(admin, staffScope(admin), context.params.id, body.message, body.internal === true);
    return NextResponse.json(reply, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
