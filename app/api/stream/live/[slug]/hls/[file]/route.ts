import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readLiveFile } from "@/lib/services/stream/live-stream";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Serve HLS playlist/segments for a public (free) live event. */
export async function GET(_request: Request, { params }: { params: { slug: string; file: string } }) {
  const event = await prisma.streamLiveEvent.findUnique({ where: { slug: params.slug }, select: { id: true, isFree: true } });
  if (!event) return NextResponse.json({ error: "Event not found.", code: "not_found" }, { status: 404 });
  if (!event.isFree) {
    return NextResponse.json({ error: "This is a ticketed event. Ticketing is not enabled.", code: "entitlement_required" }, { status: 402 });
  }
  try {
    const { body, contentType } = await readLiveFile(event.id, params.file);
    return new NextResponse(body, {
      status: 200,
      headers: { "Content-Type": contentType, "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" }
    });
  } catch {
    return NextResponse.json({ error: "Live segment not available.", code: "not_found" }, { status: 404 });
  }
}
