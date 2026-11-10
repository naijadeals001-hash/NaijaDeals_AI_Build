import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireUser, assertSameOrigin } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

/**
 * Aura conversations for the signed-in user.
 *
 * Every query is filtered by the session's user id, so one account can never
 * read, rename or delete another's conversation even if it guesses an id.
 */
export async function GET() {
  try {
    const user = await requireUser();
    const conversations = await prisma.auraConversation.findMany({
      where: { userId: user.id, archived: false },
      orderBy: { updatedAt: "desc" },
      take: 60,
      select: { id: true, title: true, updatedAt: true, createdAt: true, _count: { select: { messages: true } } }
    });
    const saved = await prisma.auraMessage.count({
      where: { saved: true, conversation: { userId: user.id } }
    });
    return NextResponse.json(jsonSafe({ conversations, savedCount: saved }));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin(request);
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const conversation = await prisma.auraConversation.create({
      data: { userId: user.id, title: typeof body?.title === "string" ? body.title.slice(0, 80) : "New conversation" }
    });
    return NextResponse.json(jsonSafe({ conversation }), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await assertSameOrigin(request);
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const id = String(body?.id ?? "");
    if (!id) return NextResponse.json({ error: "A conversation id is required.", code: "id_required" }, { status: 400 });

    const data: { title?: string; archived?: boolean } = {};
    if (typeof body?.title === "string") {
      const title = body.title.trim().slice(0, 80);
      if (!title) return NextResponse.json({ error: "A title is required.", code: "title_required" }, { status: 400 });
      data.title = title;
    }
    if (typeof body?.archived === "boolean") data.archived = body.archived;
    if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update.", code: "no_change" }, { status: 400 });

    // Ownership is part of the WHERE clause, not a separate check that could drift.
    const result = await prisma.auraConversation.updateMany({ where: { id, userId: user.id }, data });
    if (result.count === 0) return NextResponse.json({ error: "Conversation not found.", code: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await assertSameOrigin(request);
    const user = await requireUser();
    const id = request.nextUrl.searchParams.get("id") ?? "";
    if (!id) return NextResponse.json({ error: "A conversation id is required.", code: "id_required" }, { status: 400 });
    const result = await prisma.auraConversation.deleteMany({ where: { id, userId: user.id } });
    if (result.count === 0) return NextResponse.json({ error: "Conversation not found.", code: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
