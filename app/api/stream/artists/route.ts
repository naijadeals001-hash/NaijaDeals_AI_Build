import { NextResponse } from "next/server";
import { jsonError } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { listArtists } from "@/lib/services/stream/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams.get("q")?.slice(0, 120) || undefined;
    return NextResponse.json(jsonSafe({ artists: await listArtists({ q }) }));
  } catch (error) {
    return jsonError(error);
  }
}
