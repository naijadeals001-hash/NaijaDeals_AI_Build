import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";
import { notifyFollowersOfRelease } from "@/lib/services/stream/service";

export const dynamic = "force-dynamic";

/**
 * Publish or unpublish a track. Requires ownership, an audio file and a rights
 * declaration; publishing notifies followers (real notifications).
 */
export async function POST(request: Request, { params }: { params: { slug: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<{ publish?: unknown }>(request);
    const publish = body.publish !== false;
    const track = await prisma.streamTrack.findFirst({
      where: { slug: params.slug, artist: { userId: user.id } },
      select: { id: true, title: true, slug: true, audioUrl: true, rightsDeclared: true, artistId: true, status: true }
    });
    if (!track) throw new ApiError(404, "track_not_found", "Track not found on your artist account.");
    if (publish) {
      if (!track.audioUrl) throw new ApiError(409, "audio_required", "Upload audio before publishing.");
      if (!track.rightsDeclared) throw new ApiError(409, "rights_required", "Declare rights before publishing.");
    }
    const updated = await prisma.streamTrack.update({
      where: { id: track.id },
      data: { status: publish ? "PUBLISHED" : "UNPUBLISHED", publishedAt: publish ? new Date() : null },
      select: { slug: true, status: true }
    });
    const notified = publish && track.status !== "PUBLISHED" ? await notifyFollowersOfRelease(track.artistId, track.title, track.slug) : 0;
    return NextResponse.json(jsonSafe({ ...updated, notifiedFollowers: notified }));
  } catch (error) {
    return jsonError(error);
  }
}
