import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";
import { publishToken, startLive, stopLive, isRunning } from "@/lib/services/stream/live-stream";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function ownEvent(slug: string, userId: string) {
  const event = await prisma.streamLiveEvent.findFirst({ where: { slug }, select: { id: true, slug: true, organizerId: true, status: true } });
  if (!event) throw new ApiError(404, "event_not_found", "Event not found.");
  if (event.organizerId !== userId) throw new ApiError(403, "forbidden", "Only the organiser can control this stream.");
  return event;
}

export async function GET(_request: Request, { params }: { params: { slug: string } }) {
  try {
    const user = await requireUser();
    const event = await ownEvent(params.slug, user.id);
    // The organiser receives their publish token here (not exposed publicly).
    return NextResponse.json({ status: event.status, running: isRunning(event.id), publishToken: publishToken(event.id) });
  } catch (error) {
    return jsonError(error);
  }
}

/** action: "start" | "stop" — real HLS ingestion, owner/organiser only. */
export async function POST(request: Request, { params }: { params: { slug: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<{ action?: string; token?: string }>(request);
    const event = await ownEvent(params.slug, user.id);
    if (body.action === "stop") {
      await stopLive(event.id);
      return NextResponse.json({ status: "ENDED" });
    }
    if (body.action !== "start") throw new ApiError(400, "invalid_action", "action must be start or stop.");
    if (event.organizerId && body.token !== publishToken(event.id)) {
      throw new ApiError(403, "invalid_token", "Publish token does not match this event.");
    }
    const result = await startLive(event.id);
    const updated = await prisma.streamLiveEvent.findUnique({ where: { id: event.id }, select: { status: true, streamUrl: true } });
    return NextResponse.json(jsonSafe({ ...result, ...updated }));
  } catch (error) {
    return jsonError(error);
  }
}
