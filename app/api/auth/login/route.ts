import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, sessionCookieOptions, SESSION_COOKIE, toPublicSessionUser } from "@/lib/auth/session";
import { ApiError, assertSameOrigin, jsonError, readJson, requireString } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJson<Record<string, unknown>>(request);
    const email = requireString(body.email, "Email", 254).toLowerCase();
    const password = requireString(body.password, "Password", 200);

    const user = await prisma.user.findUnique({
      where: { email },
      include: { roles: { include: { role: true } }, vendors: true }
    });
    // Always perform a hash comparison to keep timing roughly constant.
    const valid = await verifyPassword(password, user?.passwordHash ?? null);
    if (!user || !valid) throw new ApiError(401, "invalid_credentials", "Email or password is incorrect.");

    const session = await createSession(user.id, request.headers.get("user-agent"));
    const response = NextResponse.json({ user: await toPublicSessionUser(user) });
    response.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.maxAge));
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
