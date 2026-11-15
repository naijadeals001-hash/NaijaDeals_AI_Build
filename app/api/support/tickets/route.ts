import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, readJson } from "@/lib/auth/guard";
import { getSessionUser } from "@/lib/auth/session";
import { createTicket, listCustomerTickets, supportVerticalOptions } from "@/lib/services/core/support.service";
import { requestIdentity, supportRateLimit } from "@/lib/services/core/support-rate-limit";

export const dynamic = "force-dynamic";

/** Public vertical options so the form and the server share one registry. */
export async function GET() {
  return NextResponse.json({ verticals: supportVerticalOptions() });
}

/**
 * Create a support ticket.
 *
 * Works for signed-in customers and for guests. The response never claims an
 * email was sent: when email delivery is not configured the ticket is still
 * durable and a one-time guest access link is returned instead.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const body = await readJson<Record<string, unknown>>(request);
    const user = await getSessionUser();
    const limited = supportRateLimit("submit", user?.id ?? requestIdentity(request));
    if (!limited.allowed) {
      return NextResponse.json(
        { error: "rate_limited", message: "Too many enquiries. Please wait before submitting again.", retryAfterSeconds: limited.retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } }
      );
    }

    const result = await createTicket({
      actor: user ? { userId: user.id, name: user.name, email: user.email } : null,
      guestName: body.name,
      email: body.email,
      vertical: body.vertical,
      topic: body.topic,
      subject: body.subject,
      message: body.message,
      countryCode: user?.countryCode ?? (typeof body.countryCode === "string" ? body.countryCode : null),
      idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : null
    });

    return NextResponse.json(
      {
        reference: result.ticket.reference,
        duplicate: result.duplicate,
        accessToken: result.accessToken,
        accessExpiresAt: result.accessExpiresAt,
        // Truthful delivery state: this build has no configured outbound email
        // provider, so nothing is claimed to have been emailed.
        emailDelivery: "unavailable"
      },
      { status: result.duplicate ? 200 : 201 }
    );
  } catch (error) {
    return jsonError(error);
  }
}

/** Customer ticket list (own tickets only). */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function PATCH(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "unauthorized", message: "Sign in to view your tickets." }, { status: 401 });
    const body = await readJson<{ page?: unknown; pageSize?: unknown }>(request);
    const page = Number(body.page ?? 1);
    const pageSize = Number(body.pageSize ?? 20);
    const list = await listCustomerTickets(user.id, Number.isFinite(page) ? page : 1, Number.isFinite(pageSize) ? pageSize : 20);
    return NextResponse.json(list);
  } catch (error) {
    return jsonError(error);
  }
}
