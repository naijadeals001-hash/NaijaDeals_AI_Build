import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOptionalUserId } from "@/lib/auth/guard";
import { streamMedia, mediaExists } from "@/lib/services/stream/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Authorised media delivery with byte-range support.
 *
 * Access rules: READY artwork is public; audio/video are served when the asset
 * is published (publicVisible) or the caller owns it. Unprocessed (draft) media
 * is owner-only, so an upload can be previewed before publishing but never leaks.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const asset = await prisma.streamMediaAsset.findUnique({
    where: { id: params.id },
    select: { storageKey: true, mimeType: true, ownerId: true, kind: true, status: true, publicVisible: true }
  });
  if (!asset) return NextResponse.json({ error: "Media not found.", code: "not_found" }, { status: 404 });

  const viewerId = await getOptionalUserId();
  const isOwner = viewerId !== null && viewerId === asset.ownerId;
  const publicOk = asset.status === "READY" && asset.publicVisible;
  if (!isOwner && !publicOk) {
    return NextResponse.json({ error: "Sign in or request access to this media.", code: "forbidden" }, { status: isOwner ? 403 : 401 });
  }
  if (!(await mediaExists(asset.storageKey))) {
    return NextResponse.json({ error: "Media file is missing.", code: "missing" }, { status: 404 });
  }
  return streamMedia(asset.storageKey, asset.mimeType, request.headers.get("range"));
}
