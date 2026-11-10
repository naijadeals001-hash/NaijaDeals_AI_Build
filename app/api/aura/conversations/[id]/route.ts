import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

/** One owned conversation with its messages. */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const conversation = await prisma.auraConversation.findFirst({
      where: { id: params.id, userId: user.id },
      include: { messages: { orderBy: { createdAt: "asc" }, take: 200 } }
    });
    if (!conversation) return NextResponse.json({ error: "Conversation not found.", code: "not_found" }, { status: 404 });
    return NextResponse.json(jsonSafe({ conversation }));
  } catch (error) {
    return jsonError(error);
  }
}
