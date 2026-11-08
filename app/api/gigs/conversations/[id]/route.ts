import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireString, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { getConversationForUser, sendConversationMessage } from "@/lib/services/gigs/service";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const conversation = await getConversationForUser(user.id, params.id);
    if (!conversation) return NextResponse.json({ error: "Conversation not found.", code: "not_found" }, { status: 404 });
    return NextResponse.json(jsonSafe(conversation));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const message = await sendConversationMessage(user.id, params.id, requireString(body.body, "Message", 4000));
    return NextResponse.json(jsonSafe(message), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
