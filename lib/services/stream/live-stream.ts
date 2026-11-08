import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/api-error";

/**
 * Local livestream engine built on FFmpeg HLS (no privileged services needed).
 *
 * The organiser "goes live" with a server-generated publish token; the server
 * runs an FFmpeg process that encodes a live source into HLS segments held in a
 * private directory. The event flips to LIVE only while FFmpeg is running and
 * the playlist exists. Viewers fetch the playlist/segments through an
 * authorised route, so private events stay private. When the stream stops the
 * event moves to ENDED and the last playlist is retained as a replay.
 */
export const LIVE_ROOT = process.env.STREAM_LIVE_ROOT
  ? path.resolve(process.env.STREAM_LIVE_ROOT)
  : path.join(process.cwd(), ".media-store", "live");

const processes = new Map<string, ChildProcess>();

export function publishToken(eventId: string) {
  // Deterministic per event + server secret: stable for the event, never public.
  const secret = process.env.STREAM_PUBLISH_SECRET ?? "local-dev-publish-secret";
  return Buffer.from(`${eventId}:${secret}`).toString("base64url");
}

function eventDir(eventId: string) {
  return path.join(LIVE_ROOT, eventId);
}

/** Start a live HLS encode from an approved local source file. */
export async function startLive(eventId: string) {
  if (processes.has(eventId)) return { alreadyRunning: true };
  const event = await prisma.streamLiveEvent.findUnique({ where: { id: eventId }, select: { id: true, slug: true, status: true } });
  if (!event) throw new ApiError(404, "event_not_found", "Event not found.");
  const source = process.env.STREAM_LIVE_SOURCE ?? path.join(process.cwd(), "public", "generated", "stream", "audio", "clip-live-lagos.mp4");
  if (!existsSync(source)) throw new ApiError(409, "source_missing", "Live source test pattern is not available.");

  const dir = eventDir(eventId);
  await mkdir(dir, { recursive: true });
  for (const file of await readdir(dir).catch(() => [])) await unlink(path.join(dir, file)).catch(() => undefined);

  const child = spawn(
    "ffmpeg",
    [
      "-y", "-loglevel", "error",
      "-re", "-stream_loop", "-1", "-i", source,
      "-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency", "-g", "50", "-sc_threshold", "0",
      "-c:a", "aac", "-b:a", "96k",
      "-f", "hls", "-hls_time", "2", "-hls_list_size", "6", "-hls_flags", "delete_segments+append_list+omit_endlist",
      "-hls_segment_filename", path.join(dir, "seg%03d.ts"),
      path.join(dir, "index.m3u8")
    ],
    { windowsHide: true, stdio: "ignore" }
  );
  processes.set(eventId, child);
  child.on("exit", () => {
    processes.delete(eventId);
    void prisma.streamLiveEvent
      .update({ where: { id: eventId }, data: { status: "ENDED", endedAt: new Date() } })
      .catch(() => undefined);
  });

  // Wait for the first playlist so LIVE is only reported once playable.
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (existsSync(path.join(dir, "index.m3u8"))) break;
  }
  await prisma.streamLiveEvent.update({ where: { id: eventId }, data: { status: "LIVE", startedAt: new Date(), streamUrl: `/api/stream/live/${event.slug}/hls/index.m3u8` } });
  return { started: true };
}

export async function stopLive(eventId: string) {
  const child = processes.get(eventId);
  if (child) {
    child.removeAllListeners("exit");
    child.kill("SIGINT");
    processes.delete(eventId);
  }
  await prisma.streamLiveEvent.update({ where: { id: eventId }, data: { status: "ENDED", endedAt: new Date() } }).catch(() => undefined);
  return { stopped: true };
}

export function isRunning(eventId: string) {
  return processes.has(eventId);
}

/** Read an HLS playlist/segment for an event (caller authorises the request). */
export async function readLiveFile(eventId: string, file: string) {
  const safe = path.basename(file);
  if (!/^[a-z0-9.]+\.(m3u8|ts)$/i.test(safe)) throw new ApiError(400, "invalid_file", "Invalid live media file.");
  const target = path.join(eventDir(eventId), safe);
  if (!existsSync(target)) throw new ApiError(404, "not_found", "Live segment is not available.");
  return { body: await readFile(target), contentType: safe.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/mp2t" };
}

/** Reconcile status on boot: anything marked LIVE without a process is ENDED. */
export async function recoverLiveState() {
  const live = await prisma.streamLiveEvent.findMany({ where: { status: "LIVE" }, select: { id: true } });
  for (const event of live) {
    if (!processes.has(event.id)) {
      await prisma.streamLiveEvent.update({ where: { id: event.id }, data: { status: "ENDED", endedAt: new Date() } }).catch(() => undefined);
    }
  }
  return live.length;
}
