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
    const durationSec = Number(body.durationSec ?? 0);
    if (!Number.isInteger(durationSec) || durationSec <= 0 || durationSec > 4 * 60 * 60) {
      throw new ApiError(400, "invalid_duration", "Duration must be between 1 second and 4 hours.");
    }
    const base = title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "track";
    let slug = `${base}-${Date.now().toString(36)}`;
    const track = await prisma.streamTrack.create({
      data: {
        artistId: artist.id,
        title,
        slug,
        durationSec,
        genre: body.genre ? requireString(body.genre, "Genre", 40) : null,
        language: body.language ? requireString(body.language, "Language", 40) : null,
        explicit: Boolean(body.explicit),
        artworkUrl: body.artworkUrl ? requireString(body.artworkUrl, "Artwork", 500) : null,
        rightsDeclared: Boolean(body.rightsDeclared),
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
