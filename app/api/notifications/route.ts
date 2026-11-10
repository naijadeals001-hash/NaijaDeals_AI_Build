import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin, jsonError, requireUser } from "@/lib/auth/guard";

/**
 * The signed-in user's in-app feed.
 *
 * This reads `PartnerNotification`, the table the seller, driver, courier, gigs
 * and stream screens already render. The delivery engine writes here through its
 * in-app transport, so there is one feed rather than a second copy.
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const take = Math.min(Math.max(Number(request.nextUrl.searchParams.get("take") ?? 20), 1), 50);
    const unreadOnly = request.nextUrl.searchParams.get("unread") === "1";

    const [items, unread] = await Promise.all([
      prisma.partnerNotification.findMany({
        where: { userId: user.id, ...(unreadOnly ? { readAt: null } : {}) },
        orderBy: { createdAt: "desc" },
        take
      }),
      prisma.partnerNotification.count({ where: { userId: user.id, readAt: null } })
    ]);

    return NextResponse.json({ items, unread });
  } catch (error) {
    return jsonError(error);
  }
}

/** Marks the caller's feed as read. Scoped by userId, never by supplied ids alone. */
export async function PATCH(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = (await request.json().catch(() => ({}))) as { id?: string };
    const result = await prisma.partnerNotification.updateMany({
      where: { userId: user.id, readAt: null, ...(body.id ? { id: body.id } : {}) },
      data: { readAt: new Date() }
    });
    return NextResponse.json({ updated: result.count });
  } catch (error) {
    return jsonError(error);
  }
}
