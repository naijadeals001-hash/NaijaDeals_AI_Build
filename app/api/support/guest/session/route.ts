import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, readJson } from "@/lib/auth/guard";
import { sessionCookieOptions } from "@/lib/auth/session";
import { GUEST_ACCESS_COOKIE, exchangeGuestToken } from "@/lib/services/core/support.service";
import { requestIdentity, supportRateLimit } from "@/lib/services/core/support-rate-limit";

export const dynamic = "force-dynamic";

/**
 * Exchange a one-time guest access token for an httpOnly cookie.
 *
 * The token is accepted only in this POST body and never written to a URL,
 * referrer or cookie name; the resulting cookie is scoped to this site and
 * expires with the token.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const limited = supportRateLimit("guestAccess", requestIdentity(request));
    if (!limited.allowed) {
      return NextResponse.json(
        { error: "rate_limited", message: "Too many attempts. Try again later.", retryAfterSeconds: limited.retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } }
      );
    }
    const body = await readJson<{ token?: unknown }>(request);
    const token = typeof body.token === "string" ? body.token : "";
    const result = await exchangeGuestToken(token);
    const response = NextResponse.json(result);
    const maxAge = Math.max(60, Math.floor((new Date(result.expiresAt).getTime() - Date.now()) / 1000));
    response.cookies.set(GUEST_ACCESS_COOKIE, token, sessionCookieOptions(maxAge));
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
