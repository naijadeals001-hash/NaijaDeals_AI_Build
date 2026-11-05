import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ApiError, jsonError, requireUser } from "@/lib/auth/guard";
import { SESSION_COOKIE, hashToken } from "@/lib/auth/session";
import { recordAudit } from "@/lib/services/core/audit.service";

export const dynamic = "force-dynamic";

/**
 * Revoke one of the signed-in account's own sessions (sign out a device).
 * The current session cannot be revoked here — use normal sign-out.
 */
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const session = await prisma.session.findUnique({ where: { id: params.id } });
    if (!session || session.userId !== user.id) {
      throw new ApiError(404, "session_not_found", "Session not found on this account.");
    }
    const currentToken = cookies().get(SESSION_COOKIE)?.value;
    if (currentToken && session.tokenHash === hashToken(currentToken)) {
      throw new ApiError(400, "current_session", "Use sign out to end the current session.");
    }
    await prisma.session.delete({ where: { id: session.id } });
    await recordAudit({
      actorId: user.id,
      action: "account.session_revoked",
      entity: "Session",
      entityId: session.id,
      metadata: { userAgent: session.userAgent }
    });
    return NextResponse.json({ revoked: true, id: session.id });
  } catch (error) {
    return jsonError(error);
  }
}
