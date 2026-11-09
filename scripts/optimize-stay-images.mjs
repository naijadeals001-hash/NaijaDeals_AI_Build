/**
 * Converts NaijaStay PNGs to WebP (max 1024px) and rebuilds the manifest.
 * A PNG is always re-converted when it is present, because a regenerated asset
 * must replace the old WebP — the earlier version skipped conversion whenever a
 * .webp already existed, which silently kept stale images.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
const DIR = path.join(process.cwd(), "public", "generated", "stay");
const KEEP = path.join(DIR, "originals");
fs.mkdirSync(KEEP, { recursive: true });
let converted = 0;
for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith(".png"))) {
  const source = path.join(DIR, file);
  const target = path.join(DIR, file.replace(/\.png$/, ".webp"));
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", source, "-vf", "scale='min(1024,iw)':-2", "-c:v", "libwebp", "-quality", "82", target]);
  fs.copyFileSync(source, path.join(KEEP, file));
  fs.rmSync(source);
  converted += 1;
}
const assets = {};
for (const f of fs.readdirSync(DIR).filter((f) => f.endsWith(".webp"))) assets[f.replace(".webp", "")] = `generated/stay/${f}`;
fs.writeFileSync(path.join(DIR, "manifest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), assets }, null, 2));
const size = Object.values(assets).reduce((s, p) => s + fs.statSync(path.join(process.cwd(), "public", p)).size, 0);
console.log(JSON.stringify({ converted, assets: Object.keys(assets).length, totalMB: Number((size / 1048576).toFixed(1)) }));
