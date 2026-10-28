import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { destroySession, SESSION_COOKIE } from "@/lib/auth/session";
import { assertSameOrigin, jsonError } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await destroySession(cookies().get(SESSION_COOKIE)?.value);
    const response = NextResponse.json({ signedOut: true });
    response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
