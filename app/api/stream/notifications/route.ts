import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

/** NaijaStream notifications for the signed-in listener (shared notification store). */
export async function GET() {
  try {
    const user = await requireUser();
    const [items, unread] = await Promise.all([
      prisma.partnerNotification.findMany({
        where: { userId: user.id, kind: { startsWith: "stream." } },
        orderBy: { createdAt: "desc" },
        take: 50
      }),
      prisma.partnerNotification.count({ where: { userId: user.id, kind: { startsWith: "stream." }, readAt: null } })
    ]);
    return NextResponse.json(jsonSafe({ items, unread }));
  } catch (error) {
    return jsonError(error);
  }
}

/** Mark one (id) or all notifications read. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const where = body?.id
      ? { id: String(body.id), userId: user.id, kind: { startsWith: "stream." } }
      : { userId: user.id, kind: { startsWith: "stream." }, readAt: null };
    const result = await prisma.partnerNotification.updateMany({ where, data: { readAt: new Date() } });
    return NextResponse.json({ updated: result.count });
  } catch (error) {
    return jsonError(error);
  }
}
