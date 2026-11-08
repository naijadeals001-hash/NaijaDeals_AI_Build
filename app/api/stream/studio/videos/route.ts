import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireString, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Publish a video from an uploaded, processed VIDEO asset. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const mediaId = requireString(body.mediaId, "Media", 60);
    const title = requireString(body.title, "Title", 140);
    const media = await prisma.streamMediaAsset.findFirst({ where: { id: mediaId, ownerId: user.id, kind: "VIDEO" }, select: { id: true, status: true, durationSec: true } });
    if (!media) throw new ApiError(404, "media_not_found", "Video upload not found on your account.");
    if (media.status !== "READY") throw new ApiError(409, "media_not_ready", "Video is still processing.");
    const artist = await prisma.streamArtist.findUnique({ where: { userId: user.id }, select: { id: true } });
    const slug = `video-${media.id.slice(-8)}`;
    const video = await prisma.streamVideo.upsert({
      where: { slug },
      update: { title, status: "PUBLISHED", publishedAt: new Date() },
      create: {
        artistId: artist?.id ?? null,
        title,
        slug,
        description: typeof body.description === "string" ? body.description.slice(0, 600) : null,
        videoUrl: `/api/stream/media/${media.id}/stream`,
        posterUrl: typeof body.posterUrl === "string" ? body.posterUrl.slice(0, 500) : null,
        durationSec: media.durationSec ?? 0,
        status: "PUBLISHED",
        publishedAt: new Date(),
        isSample: false
      },
      select: { id: true, slug: true, title: true }
    });
    await prisma.streamMediaAsset.update({ where: { id: media.id }, data: { publicVisible: true } });
    return NextResponse.json(jsonSafe(video), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
