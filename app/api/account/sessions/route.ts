import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { jsonError, requireUser } from "@/lib/auth/guard";
import { SESSION_COOKIE, hashToken } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** List the signed-in account's own sessions; the current one is flagged. */
export async function GET() {
  try {
    const user = await requireUser();
    const currentToken = cookies().get(SESSION_COOKIE)?.value;
    const currentHash = currentToken ? hashToken(currentToken) : "";
    const sessions = await prisma.session.findMany({
      where: { userId: user.id },
      select: { id: true, tokenHash: true, userAgent: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: "desc" }
    });
    return NextResponse.json({
      sessions: sessions.map(({ tokenHash, ...session }) => ({ ...session, current: tokenHash === currentHash }))
    });
  } catch (error) {
    return jsonError(error);
  }
}
