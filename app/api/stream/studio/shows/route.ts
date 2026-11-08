import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireString, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";

export const dynamic = "force-dynamic";

/** Create a podcast show for the signed-in artist. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const artist = await prisma.streamArtist.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!artist) throw new ApiError(403, "artist_required", "Create your creator profile first.");
    const body = await readJson<Record<string, unknown>>(request);
    const title = requireString(body.title, "Title", 120);
    const slug = `${title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50)}-${Date.now().toString(36)}`;
    const show = await prisma.streamShow.create({
      data: {
        artistId: artist.id,
        title,
        slug,
        description: typeof body.description === "string" ? body.description.slice(0, 600) : null,
        category: typeof body.category === "string" ? body.category.slice(0, 40) : "Culture",
        coverUrl: typeof body.coverUrl === "string" ? body.coverUrl.slice(0, 500) : null,
        published: true,
        isSample: false
      },
      select: { id: true, slug: true, title: true }
    });
    return NextResponse.json(jsonSafe(show), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
