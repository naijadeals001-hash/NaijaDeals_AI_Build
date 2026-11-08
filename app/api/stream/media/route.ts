import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";
import { storeUpload, type MediaKind } from "@/lib/services/stream/storage";
import { enqueueMediaProcessing } from "@/lib/services/stream/processing";
import { recordAudit } from "@/lib/services/core/audit.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const KINDS: MediaKind[] = ["AUDIO", "VIDEO", "IMAGE"];
const PURPOSES = ["TRACK", "EPISODE", "VIDEO", "ARTWORK"] as const;

/** List the caller's own media assets. */
export async function GET() {
  try {
    const user = await requireUser();
    const assets = await prisma.streamMediaAsset.findMany({
      where: { ownerId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, kind: true, status: true, originalName: true, sizeBytes: true, durationSec: true, purpose: true, error: true, createdAt: true }
    });
    return NextResponse.json(jsonSafe({ assets }));
  } catch (error) {
    return jsonError(error);
  }
}

/** Authenticated multipart upload → private store → processing job. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const form = await request.formData();
    const file = form.get("file");
    const kindRaw = String(form.get("kind") ?? "AUDIO").toUpperCase();
    const purpose = String(form.get("purpose") ?? "TRACK").toUpperCase();
    if (!(file instanceof File)) throw new ApiError(400, "file_required", "Attach a file in the 'file' field.");
    if (!KINDS.includes(kindRaw as MediaKind)) throw new ApiError(400, "invalid_kind", "kind must be AUDIO, VIDEO or IMAGE.");
    if (!(PURPOSES as readonly string[]).includes(purpose)) throw new ApiError(400, "invalid_purpose", "Unknown upload purpose.");

    const stored = await storeUpload({ kind: kindRaw as MediaKind, ownerId: user.id, file });
    const asset = await prisma.streamMediaAsset.create({
      data: {
        ownerId: user.id,
        kind: kindRaw,
        storageKey: stored.storageKey,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        originalName: file.name.slice(0, 200),
        purpose,
        status: "PENDING"
      },
      select: { id: true, kind: true, status: true, sizeBytes: true }
    });
    await recordAudit({ actorId: user.id, action: "stream.media_uploaded", entity: "StreamMediaAsset", entityId: asset.id, metadata: { kind: kindRaw, bytes: stored.sizeBytes } });
    // Metadata extraction runs as a background job (not inside this request).
    void enqueueMediaProcessing(asset.id);
    return NextResponse.json(jsonSafe(asset), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
