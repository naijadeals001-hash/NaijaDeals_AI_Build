import fs from "node:fs";
import path from "node:path";

/**
 * Resolves the Kie.ai asset generated for a NaijaSend section. Read from disk at
 * request time so newly generated images appear without a rebuild and the
 * provenance registry never enters the client bundle.
 */
type Manifest = { assets: Record<string, string> };
let cache: { at: number; data: Manifest } | null = null;

function manifest(): Manifest {
  const now = Date.now();
  if (cache && now - cache.at < 60_000) return cache.data;
  try {
    const data = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "generated", "send", "manifest.json"), "utf8")) as Manifest;
    cache = { at: now, data };
    return data;
  } catch {
    return { assets: {} };
  }
}

/** Returns `/generated/send/<id>.webp` (or `.png`) when the asset exists. */
export function sendImage(id: string) {
  const file = manifest().assets[id];
  return file ? `/${file}` : null;
}
