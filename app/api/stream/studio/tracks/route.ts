import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireString, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";
import { notifyFollowersOfRelease } from "@/lib/services/stream/service";

export const dynamic = "force-dynamic";

/**
 * Create a draft track for the signed-in artist. Publishing requires a real
 * audioUrl (uploaded media) and a rights declaration — until object storage is
 * configured, tracks stay DRAFT and are never publicly playable.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const artist = await prisma.streamArtist.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!artist) throw new ApiError(403, "artist_required", "Create your artist profile first.");
    const body = await readJson<Record<string, unknown>>(request);
    const title = requireString(body.title, "Title", 140);
    // An uploaded, processed audio asset is required — this is what makes the
    // track playable. Duration comes from the media asset, not the client.
    const mediaId = body.mediaId ? requireString(body.mediaId, "Media", 60) : "";
    if (!mediaId) throw new ApiError(400, "media_required", "Upload an audio file first.");
    const media = await prisma.streamMediaAsset.findFirst({
      where: { id: mediaId, ownerId: user.id, kind: "AUDIO" },
      select: { id: true, status: true, durationSec: true }
    });
    if (!media) throw new ApiError(404, "media_not_found", "Audio upload not found on your account.");
    if (media.status !== "READY") throw new ApiError(409, "media_not_ready", "Audio is still processing — try again shortly.");
    const durationSec = media.durationSec ?? 0;
    if (!Number.isInteger(durationSec) || durationSec <= 0) throw new ApiError(400, "invalid_duration", "Audio duration could not be read.");
    const base = title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "track";
    let slug = `${base}-${Date.now().toString(36)}`;
    const track = await prisma.streamTrack.create({
      data: {
        artistId: artist.id,
        title,
        slug,
        durationSec,
        audioUrl: `/api/stream/media/${media.id}/stream`,
        genre: body.genre ? requireString(body.genre, "Genre", 40) : null,
        language: body.language ? requireString(body.language, "Language", 40) : null,
        explicit: Boolean(body.explicit),
        artworkUrl: body.artworkUrl ? requireString(body.artworkUrl, "Artwork", 500) : null,
        rightsDeclared: Boolean(body.rightsDeclared),
        isSample: false,
        status: "DRAFT"
      },
      select: { id: true, title: true, slug: true, status: true }
    });
    // Drafts do not notify; publishing does (see the publish endpoint).
    return NextResponse.json(jsonSafe(track), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
