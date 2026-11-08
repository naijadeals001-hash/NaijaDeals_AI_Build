import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";
import { enqueueMediaProcessing } from "@/lib/services/stream/processing";
import { removeUpload } from "@/lib/services/stream/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Owner-scoped processing status. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const asset = await prisma.streamMediaAsset.findFirst({
      where: { id: params.id, ownerId: user.id },
      select: { id: true, kind: true, status: true, durationSec: true, width: true, height: true, error: true, attempts: true, originalName: true }
    });
    if (!asset) throw new ApiError(404, "media_not_found", "Media not found on your account.");
    return NextResponse.json(jsonSafe(asset));
  } catch (error) {
    return jsonError(error);
  }
}

/** Retry a failed processing job. */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const asset = await prisma.streamMediaAsset.findFirst({ where: { id: params.id, ownerId: user.id }, select: { id: true } });
    if (!asset) throw new ApiError(404, "media_not_found", "Media not found on your account.");
    const queued = await enqueueMediaProcessing(asset.id);
    return NextResponse.json(queued);
  } catch (error) {
    return jsonError(error);
  }
}

/** Delete media the owner no longer uses. */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const asset = await prisma.streamMediaAsset.findFirst({ where: { id: params.id, ownerId: user.id } });
    if (!asset) throw new ApiError(404, "media_not_found", "Media not found on your account.");
    const inUse = await prisma.streamTrack.count({ where: { audioUrl: `/api/stream/media/${asset.id}/stream` } });
    if (inUse > 0) throw new ApiError(409, "media_in_use", "Unpublish the track using this audio first.");
    await removeUpload(asset.storageKey).catch(() => undefined);
    await prisma.streamMediaAsset.delete({ where: { id: asset.id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return jsonError(error);
  }
}
