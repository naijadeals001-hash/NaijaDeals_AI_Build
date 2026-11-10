import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireUser } from "@/lib/auth/guard";
import { affiliateSummary } from "@/lib/services/affiliate/service";

/**
 * The signed-in user's affiliate state. Returns `{ enrolled: false }` for a user
 * with no profile, so the page can show the enrolment form without an error.
 *
 * Every amount here is derived from persisted conversion rows.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const profile = await prisma.affiliateProfile.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        status: true,
        displayName: true,
        audienceCity: true,
        termsVersion: true,
        approvedAt: true,
        suspendedReason: true,
        createdAt: true
      }
    });

    if (!profile) return NextResponse.json({ enrolled: false });

    const [summary, links, conversions] = await Promise.all([
      affiliateSummary(profile.id),
      prisma.affiliateLink.findMany({
        where: { affiliateId: profile.id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, code: true, destination: true, active: true, createdAt: true }
      }),
      prisma.affiliateConversion.findMany({
        where: { affiliateId: profile.id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          entityType: true,
          entityId: true,
          amountKobo: true,
          state: true,
          ruleVersion: true,
          ledgerReference: true,
          createdAt: true
        }
      })
    ]);

    return NextResponse.json({ enrolled: true, profile, summary, links, conversions });
  } catch (error) {
    return jsonError(error);
  }
}
