import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireString, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Publish an episode from an uploaded, processed AUDIO asset to the caller's own show. */
export async function POST(request: Request, { params }: { params: { slug: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const show = await prisma.streamShow.findFirst({ where: { slug: params.slug, artist: { userId: user.id } }, select: { id: true } });
    if (!show) throw new ApiError(404, "show_not_found", "Show not found on your account.");
    const mediaId = requireString(body.mediaId, "Media", 60);
    const title = requireString(body.title, "Title", 140);
    const media = await prisma.streamMediaAsset.findFirst({ where: { id: mediaId, ownerId: user.id, kind: "AUDIO" }, select: { id: true, status: true, durationSec: true } });
    if (!media) throw new ApiError(404, "media_not_found", "Audio upload not found on your account.");
    if (media.status !== "READY") throw new ApiError(409, "media_not_ready", "Audio is still processing.");
    const count = await prisma.streamEpisode.count({ where: { showId: show.id } });
    const episode = await prisma.streamEpisode.create({
      data: {
        showId: show.id,
        title,
        slug: `${params.slug}-e${count + 1}-${Date.now().toString(36)}`,
        description: typeof body.description === "string" ? body.description.slice(0, 600) : null,
        audioUrl: `/api/stream/media/${media.id}/stream`,
        durationSec: media.durationSec ?? 0,
        season: Number(body.season ?? 1) || 1,
        episodeNo: count + 1,
        status: "PUBLISHED",
        publishedAt: new Date(),
        isSample: false
      },
      select: { id: true, slug: true, title: true }
    });
    await prisma.streamMediaAsset.update({ where: { id: media.id }, data: { publicVisible: true } });
    return NextResponse.json(jsonSafe(episode), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
