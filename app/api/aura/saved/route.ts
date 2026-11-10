import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireUser, assertSameOrigin } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

/**
 * Saved responses and plans for the signed-in user.
 *
 * Saving is a per-user flag on a message they own; unsaving clears it. Both are
 * filtered by the conversation's owner so a message id alone is not enough.
 */
export async function GET() {
  try {
    const user = await requireUser();
    const [messages, plans] = await Promise.all([
      prisma.auraMessage.findMany({
        where: { saved: true, conversation: { userId: user.id } },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, content: true, createdAt: true, conversationId: true, attachments: true }
      }),
      prisma.auraPlan.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: { id: true, title: true, city: true, status: true, components: true, updatedAt: true }
      })
    ]);
    return NextResponse.json(jsonSafe({ messages, plans }));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin(request);
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const messageId = String(body?.messageId ?? "");
    const saved = Boolean(body?.saved);
    if (!messageId) return NextResponse.json({ error: "A message id is required.", code: "id_required" }, { status: 400 });

    const owned = await prisma.auraMessage.findFirst({ where: { id: messageId, conversation: { userId: user.id } }, select: { id: true } });
    if (!owned) return NextResponse.json({ error: "Message not found.", code: "not_found" }, { status: 404 });

    await prisma.auraMessage.update({ where: { id: messageId }, data: { saved } });
    return NextResponse.json({ ok: true, saved });
  } catch (error) {
    return jsonError(error);
  }
}

/** Removes a saved plan. */
export async function DELETE(request: NextRequest) {
  try {
    await assertSameOrigin(request);
    const user = await requireUser();
    const planId = request.nextUrl.searchParams.get("planId") ?? "";
    if (!planId) return NextResponse.json({ error: "A plan id is required.", code: "id_required" }, { status: 400 });
    const result = await prisma.auraPlan.deleteMany({ where: { id: planId, userId: user.id } });
    if (result.count === 0) return NextResponse.json({ error: "Plan not found.", code: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
