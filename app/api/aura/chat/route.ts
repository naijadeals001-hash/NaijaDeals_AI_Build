import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireUser, assertSameOrigin } from "@/lib/auth/guard";
import { runTurn } from "@/lib/aura/chat";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Aura chat turn — Server-Sent Events.
 *
 * The user's message is persisted first, then the assistant streams. Every event
 * is a discrete JSON line so the client can render status changes, cards and a
 * pending action without parsing markdown.
 *
 * Cancellation: the browser aborting this request aborts the upstream provider
 * call (the signal is threaded through), so Stop genuinely stops generation.
 *
 * Nothing here executes a consequential action. `prepare_transfer` produces a
 * proposal that the separate confirm endpoint must act on.
 */
export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin(request);
    const user = await requireUser();
    const body = await request.json().catch(() => null);

    const message = String(body?.message ?? "").trim().slice(0, 4000);
    if (!message) return jsonError(Object.assign(new Error("Type a message first."), { status: 400, code: "message_required" }));

    let conversationId = String(body?.conversationId ?? "");
    if (conversationId) {
      // Ownership check before writing anything into the conversation.
      const owned = await prisma.auraConversation.findFirst({ where: { id: conversationId, userId: user.id }, select: { id: true } });
      if (!owned) return jsonError(Object.assign(new Error("Conversation not found."), { status: 404, code: "not_found" }));
    } else {
      const created = await prisma.auraConversation.create({ data: { userId: user.id } });
      conversationId = created.id;
    }

    await prisma.auraMessage.create({ data: { conversationId, role: "user", content: message } });
    await prisma.auraConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });

    const signal = request.signal;
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: unknown) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch {
            // The client disconnected; the generator will observe the abort signal.
          }
        };
        send({ type: "conversation", conversationId });

        try {
          for await (const event of runTurn({ userId: user.id, conversationId, signal })) {
            send(event);
            if (signal.aborted) break;
          }
        } catch (error) {
          send({ type: "error", code: "turn_failed", message: error instanceof Error ? error.message : "Aura could not finish that." });
        } finally {
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
      }
    });
  } catch (error) {
    return jsonError(error);
  }
}
