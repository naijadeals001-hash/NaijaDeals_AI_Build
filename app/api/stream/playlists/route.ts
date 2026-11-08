import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireString, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { createPlaylist, listPlaylists } from "@/lib/services/stream/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const editorial = new URL(request.url).searchParams.get("editorial") === "true";
    return NextResponse.json(jsonSafe({ playlists: await listPlaylists({ editorial }) }));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const playlist = await createPlaylist(user.id, {
      title: requireString(body.title, "Playlist name", 80),
      description: body.description ? requireString(body.description, "Description", 400) : undefined
    });
    return NextResponse.json(jsonSafe(playlist), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
