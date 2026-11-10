import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { resolveTouch } from "@/lib/services/affiliate/service";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/infra/logger";

/**
 * Affiliate landing: /r/<code>
 *
 * Records a first-party touch, then redirects to the campaign destination. The
 * visitor key comes from the existing `nd_visitor` cookie that middleware issues;
 * it is never read from the query string. Consent is taken from the platform's
 * own consent cookie, so an unconsented visit is still redirected but earns no
 * attribution.
 *
 * The destination comes from the stored link, not from the request, so this can
 * never become an open redirect.
 */

export const dynamic = "force-dynamic";

const CONSENT_COOKIE = "nd_consent";

export async function GET(request: NextRequest, { params }: { params: { code: string } }) {
  const jar = cookies();
  const code = params.code?.trim().toUpperCase();
  if (!code || !/^[A-Z0-9]{6,16}$/.test(code)) {
    return NextResponse.redirect(new URL("/", request.url), 302);
  }

  const visitorKey = jar.get("nd_visitor")?.value;
  const consent = jar.get(CONSENT_COOKIE)?.value === "all";
  const session = jar.get("nd_session")?.value;

  let userId: string | null = null;
  if (session) {
    const { createHash } = await import("node:crypto");
    const hashed = createHash("sha256").update(session).digest("hex");
    const row = await prisma.session.findFirst({ where: { tokenHash: hashed }, select: { userId: true } }).catch(() => null);
    userId = row?.userId ?? null;
  }

  const touch = visitorKey
    ? await resolveTouch({ code, visitorKey, userId, consent }).catch((error) => {
        log.warn("affiliate.touch_failed", { code, error: error instanceof Error ? error.message.slice(0, 120) : "unknown" });
        return null;
      })
    : null;

  if (!touch) {
    // Unknown, inactive or untracked: send the visitor somewhere useful rather
    // than failing the journey or looping.
    return NextResponse.redirect(new URL("/", request.url), 302);
  }

  const destination = touch.link.destination.startsWith("/") ? touch.link.destination : "/";
  return NextResponse.redirect(new URL(destination, request.url), 302);
}
