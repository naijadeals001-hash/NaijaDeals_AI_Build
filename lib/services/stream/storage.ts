import { randomBytes } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ApiError } from "@/lib/auth/api-error";

/**
 * Private local media store for NaijaStream uploads.
 *
 * Files live OUTSIDE `public/` (under MEDIA_ROOT, default `.media-store`) so they
 * are never served statically. Route handlers stream them only after the caller
 * passes an ownership/entitlement check, with HTTP byte-range support so audio
 * and video seeking work.
 *
 * Swap this module for S3/MinIO/R2 by implementing the same three functions; the
 * rest of the app depends on this contract only.
 */
export const MEDIA_ROOT = process.env.MEDIA_ROOT
  ? path.resolve(process.env.MEDIA_ROOT)
  : path.join(process.cwd(), ".media-store");

export const MAX_AUDIO_BYTES = 60 * 1024 * 1024; // 60 MB
export const MAX_VIDEO_BYTES = 300 * 1024 * 1024; // 300 MB
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB

export const AUDIO_TYPES: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/flac": "flac"
};

export const VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov"
};

export const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

export type MediaKind = "AUDIO" | "VIDEO" | "IMAGE";

export function limitsFor(kind: MediaKind) {
  if (kind === "AUDIO") return { types: AUDIO_TYPES, maxBytes: MAX_AUDIO_BYTES };
  if (kind === "VIDEO") return { types: VIDEO_TYPES, maxBytes: MAX_VIDEO_BYTES };
  return { types: IMAGE_TYPES, maxBytes: MAX_IMAGE_BYTES };
}

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 60);
}

/**
 * Validate and persist an uploaded file. The stored name is generated server
 * side, so a hostile filename cannot escape the media root.
 */
export async function storeUpload(input: {
  kind: MediaKind;
  ownerId: string;
  file: File;
}): Promise<{ storageKey: string; sizeBytes: number; mimeType: string; checksumPrefix: string }> {
  const { types, maxBytes } = limitsFor(input.kind);
  const mime = (input.file.type || "").toLowerCase();
  const ext = types[mime];
  if (!ext) {
    throw new ApiError(415, "unsupported_type", `Unsupported ${input.kind.toLowerCase()} type: ${mime || "unknown"}.`);
  }
  if (input.file.size <= 0) throw new ApiError(400, "empty_file", "The uploaded file is empty.");
  if (input.file.size > maxBytes) {
    throw new ApiError(413, "file_too_large", `File exceeds the ${Math.round(maxBytes / 1048576)} MB limit.`);
  }

  const bucket = path.join(MEDIA_ROOT, input.kind.toLowerCase());
  await mkdir(bucket, { recursive: true });
  const name = `${Date.now().toString(36)}-${randomBytes(8).toString("hex")}-${safeSegment(input.ownerId)}.${ext}`;
  const target = path.join(bucket, name);

  const buffer = Buffer.from(await input.file.arrayBuffer());
  // Content sniffing: reject files whose magic bytes contradict the claimed type.
  if (!sniffMatches(buffer, ext)) {
    throw new ApiError(415, "content_mismatch", "The file content does not match its declared type.");
  }
  await pipeline(Readable.from(buffer), createWriteStream(target));

  return {
    storageKey: `${input.kind.toLowerCase()}/${name}`,
    sizeBytes: buffer.byteLength,
    mimeType: mime,
    checksumPrefix: randomBytes(4).toString("hex")
  };
}

function sniffMatches(buffer: Buffer, ext: string) {
  const head = buffer.subarray(0, 12);
  switch (ext) {
    case "mp3":
      return head.toString("latin1", 0, 3) === "ID3" || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
    case "wav":
      return head.toString("latin1", 0, 4) === "RIFF";
    case "ogg":
      return head.toString("latin1", 0, 4) === "OggS";
    case "flac":
      return head.toString("latin1", 0, 4) === "fLaC";
    case "m4a":
    case "mp4":
    case "mov":
      // ISO-BMFF: the ftyp box may follow other small boxes, so scan the first
      // 32 bytes rather than assuming a fixed offset.
      return buffer.subarray(0, 32).includes(Buffer.from("ftyp", "latin1"));
    case "webm":
      return buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
    case "aac":
      return buffer[0] === 0xff && (buffer[1] & 0xf0) === 0xf0;
    case "jpg":
      return buffer[0] === 0xff && buffer[1] === 0xd8;
    case "png":
      return buffer[0] === 0x89 && head.toString("latin1", 1, 4) === "PNG";
    case "webp":
      return head.toString("latin1", 0, 4) === "RIFF" && head.toString("latin1", 8, 12) === "WEBP";
    default:
      return false;
  }
}

export function absolutePathFor(storageKey: string) {
  const resolved = path.resolve(MEDIA_ROOT, storageKey);
  if (!resolved.startsWith(path.resolve(MEDIA_ROOT) + path.sep)) {
    throw new ApiError(400, "invalid_key", "Invalid media key.");
  }
  return resolved;
}

export async function mediaExists(storageKey: string) {
  return existsSync(absolutePathFor(storageKey));
}

export async function mediaStat(storageKey: string) {
  return stat(absolutePathFor(storageKey));
}

export async function removeUpload(storageKey: string) {
  const target = absolutePathFor(storageKey);
  if (existsSync(target)) await unlink(target);
}

/**
 * Stream a stored file with HTTP Range support (206) so players can seek.
 * Callers must authorise the request before calling this.
 */
export async function streamMedia(storageKey: string, mimeType: string, rangeHeader: string | null) {
  const size = (await mediaStat(storageKey)).size;
  const abs = absolutePathFor(storageKey);
  const range = rangeHeader ? parseRange(rangeHeader, size) : null;

  if (!range) {
    const body = Readable.toWeb(createReadStream(abs)) as ReadableStream;
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(size),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=0, must-revalidate",
        "X-Content-Type-Options": "nosniff"
      }
    });
  }

  const body = Readable.toWeb(createReadStream(abs, { start: range.start, end: range.end })) as ReadableStream;
  return new Response(body, {
    status: 206,
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(range.end - range.start + 1),
      "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function parseRange(header: string, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, startRaw, endRaw] = match;
  let start = startRaw ? Number(startRaw) : 0;
  let end = endRaw ? Number(endRaw) : size - 1;
  if (!startRaw && endRaw) {
    // suffix range: last N bytes
    start = Math.max(0, size - Number(endRaw));
    end = size - 1;
  }
  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}
