import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { assertSameOrigin, jsonError, readJson } from "@/lib/auth/guard";
import { getSessionUser } from "@/lib/auth/session";
import { GUEST_ACCESS_COOKIE, guestCookieName, postCustomerReply } from "@/lib/services/core/support.service";
import { requestIdentity, supportRateLimit } from "@/lib/services/core/support-rate-limit";

const NO_STORE = { "Cache-Control": "no-store, private", Vary: "Cookie" };

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: { reference: string } }) {
  try {
    assertSameOrigin(request);
    const user = await getSessionUser();
    const guestToken =
      cookies().get(guestCookieName(context.params.reference))?.value ??
      cookies().get(GUEST_ACCESS_COOKIE)?.value ??
      null;
    const limited = supportRateLimit("reply", user?.id ?? requestIdentity(request));
    if (!limited.allowed) {
      return NextResponse.json(
        { error: "rate_limited", message: "Too many replies. Please wait before sending again.", retryAfterSeconds: limited.retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } }
      );
    }
    const body = await readJson<{ message?: unknown }>(request);
    const reply = await postCustomerReply(context.params.reference, { userId: user?.id ?? null, guestToken }, body.message);
    return NextResponse.json(reply, { status: 201, headers: NO_STORE });
  } catch (error) {
    return jsonError(error);
  }
}
