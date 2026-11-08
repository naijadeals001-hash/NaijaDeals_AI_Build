import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { prisma } from "@/lib/prisma";
import { absolutePathFor, mediaExists } from "./storage";

const exec = promisify(execFile);
const MAX_ATTEMPTS = 3;
const running = new Set<string>();

/**
 * Media processing worker. Jobs are persisted on StreamMediaAsset.status so a
 * restart can resume PENDING/PROCESSING rows (run `recoverPendingJobs()` at
 * boot). Processing is bounded (one file at a time per asset, ffmpeg timeout)
 * and never runs inside a user-facing request.
 */
export async function enqueueMediaProcessing(assetId: string) {
  // Duplicate-job prevention: ignore if already queued/running.
  if (running.has(assetId)) return { queued: false, reason: "already_running" };
  const asset = await prisma.streamMediaAsset.findUnique({ where: { id: assetId }, select: { status: true } });
  if (!asset || asset.status === "READY" || asset.status === "PROCESSING") return { queued: false, reason: asset?.status ?? "missing" };
  setImmediate(() => {
    void processAsset(assetId).catch(() => undefined);
  });
  return { queued: true };
}

export async function processAsset(assetId: string) {
  if (running.has(assetId)) return { skipped: true };
  running.add(assetId);
  try {
    const asset = await prisma.streamMediaAsset.findUnique({ where: { id: assetId } });
    if (!asset) return { status: "MISSING" };
    if (asset.attempts >= MAX_ATTEMPTS) {
      await prisma.streamMediaAsset.update({ where: { id: assetId }, data: { status: "FAILED", error: "Retry limit reached." } });
      return { status: "FAILED" };
    }
    await prisma.streamMediaAsset.update({ where: { id: assetId }, data: { status: "PROCESSING", attempts: { increment: 1 }, error: null } });

    if (!(await mediaExists(asset.storageKey))) {
      throw new Error("Stored file is missing.");
    }
    const file = absolutePathFor(asset.storageKey);
    const probe = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration,bit_rate:stream=width,height,codec_type", "-of", "json", file], {
      timeout: 30_000,
      windowsHide: true
    });
    const parsed = JSON.parse(probe.stdout || "{}") as {
      format?: { duration?: string; bit_rate?: string };
      streams?: Array<{ width?: number; height?: number; codec_type?: string }>;
    };
    const duration = parsed.format?.duration ? Math.round(Number(parsed.format.duration)) : null;
    const bitrate = parsed.format?.bit_rate ? Number(parsed.format.bit_rate) : null;
    const videoStream = parsed.streams?.find((stream) => stream.codec_type === "video");

    await prisma.streamMediaAsset.update({
      where: { id: assetId },
      data: {
        status: "READY",
        durationSec: duration,
        bitrate,
        width: videoStream?.width ?? null,
        height: videoStream?.height ?? null,
        error: null
      }
    });
    return { status: "READY", duration };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "Processing failed.";
    const current = await prisma.streamMediaAsset.findUnique({ where: { id: assetId }, select: { attempts: true } });
    await prisma.streamMediaAsset.update({
      where: { id: assetId },
      data: { status: "FAILED", error: message, ...(current && current.attempts < MAX_ATTEMPTS ? {} : {}) }
    });
    return { status: "FAILED", error: message };
  } finally {
    running.delete(assetId);
  }
}

/** Resume work after a restart: re-queue anything not finished. */
export async function recoverPendingJobs() {
  const pending = await prisma.streamMediaAsset.findMany({
    where: { status: { in: ["PENDING", "PROCESSING"] }, attempts: { lt: MAX_ATTEMPTS } },
    select: { id: true },
    take: 50
  });
  for (const job of pending) await enqueueMediaProcessing(job.id);
  return pending.length;
}

export async function mediaStatus(assetId: string, ownerId: string) {
  return prisma.streamMediaAsset.findFirst({
    where: { id: assetId, ownerId },
    select: { id: true, status: true, durationSec: true, width: true, height: true, error: true, kind: true, attempts: true }
  });
}
