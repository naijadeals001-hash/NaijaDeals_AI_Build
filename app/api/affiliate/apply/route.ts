import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, requireUser } from "@/lib/auth/guard";
import { applyAffiliate } from "@/lib/services/affiliate/service";

/**
 * Affiliate enrolment. The user is always the signed-in session; the body cannot
 * name a different affiliate.
 */

export const dynamic = "force-dynamic";

const TERMS_VERSION = "affiliate-2026-11";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = (await request.json().catch(() => ({}))) as {
      displayName?: string;
      audienceCity?: string;
      acceptTerms?: boolean;
    };

    if (body.acceptTerms !== true) {
      return NextResponse.json({ error: "You must accept the programme terms.", code: "terms_required" }, { status: 400 });
    }

    const profile = await applyAffiliate({
      userId: user.id,
      termsVersion: TERMS_VERSION,
      displayName: body.displayName,
      audienceCity: body.audienceCity
    });

    return NextResponse.json({
      id: profile.id,
      status: profile.status,
      termsVersion: profile.termsVersion,
      appliedAt: profile.createdAt
    });
  } catch (error) {
    return jsonError(error);
  }
}
