import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, optionalString, readJson, requireString, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/services/core/serialize";
import { recordAudit } from "@/lib/services/core/audit.service";

export const dynamic = "force-dynamic";

/** The signed-in creator's editable artist profile. */
export async function GET() {
  try {
    const user = await requireUser();
    const artist = await prisma.streamArtist.findUnique({
      where: { userId: user.id },
      select: { id: true, name: true, slug: true, bio: true, avatarUrl: true, coverUrl: true, genres: true, countryCode: true, verified: true }
    });
    if (!artist) return NextResponse.json({ error: "No artist profile.", code: "no_artist" }, { status: 404 });
    return NextResponse.json(jsonSafe({ artist, account: { name: user.name, email: user.email } }));
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const artist = await prisma.streamArtist.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!artist) return NextResponse.json({ error: "No artist profile.", code: "no_artist" }, { status: 404 });

    const genres = Array.isArray(body.genres) ? body.genres.slice(0, 5).map((g) => String(g).slice(0, 40)) : undefined;
    const updated = await prisma.streamArtist.update({
      where: { id: artist.id },
      data: {
        name: body.name === undefined ? undefined : requireString(body.name, "Artist name", 80),
        bio: body.bio === undefined ? undefined : (optionalString(body.bio, 1000) ?? null),
        avatarUrl: body.avatarUrl === undefined ? undefined : (optionalString(body.avatarUrl, 500) ?? null),
        coverUrl: body.coverUrl === undefined ? undefined : (optionalString(body.coverUrl, 500) ?? null),
        genres
      },
      select: { id: true, name: true, slug: true, bio: true, avatarUrl: true, coverUrl: true, genres: true }
    });
    await recordAudit({ actorId: user.id, action: "stream.profile_updated", entity: "StreamArtist", entityId: artist.id });
    return NextResponse.json(jsonSafe(updated));
  } catch (error) {
    return jsonError(error);
  }
}
