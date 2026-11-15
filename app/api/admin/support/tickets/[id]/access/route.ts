import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission } from "@/lib/auth/guard";
import { issueGuestAccess, revokeGuestAccess, staffScope } from "@/lib/services/core/support.service";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/api-error";

export const dynamic = "force-dynamic";

/** Issue or revoke guest access for one ticket. The raw token is returned once. */
export async function POST(request: NextRequest, context: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("support:assign");
    const body = await readJson<{ action?: unknown }>(request);
    const action = String(body.action ?? "");
    const scope = staffScope(admin);
    const ticket = await prisma.supportTicket.findFirst({
      where: { id: context.params.id, ...(scope.countryCode ? { countryCode: scope.countryCode } : {}) },
      select: { id: true, userId: true }
    });
    if (!ticket) throw new ApiError(404, "ticket_not_found", "That support ticket was not found.");
    if (action === "issue") {
      if (ticket.userId) throw new ApiError(409, "not_a_guest_ticket", "Signed-in customers use their account; no guest link is needed.");
      return NextResponse.json(await issueGuestAccess(ticket.id, admin.id), { status: 201 });
    }
    if (action === "revoke") {
      const count = await revokeGuestAccess(ticket.id, admin.id);
      return NextResponse.json({ revoked: count });
    }
    return NextResponse.json({ error: "invalid_action", message: "Use action=issue or action=revoke." }, { status: 422 });
  } catch (error) {
    return jsonError(error);
  }
}
