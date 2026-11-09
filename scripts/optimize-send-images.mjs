/**
 * Converts generated NaijaFresh PNGs to WebP (quality 82, max 1024px) and
 * rewrites the manifest so the app serves the optimised files.
 *
 * Originals are kept in public/generated/send/originals/ (not referenced by
 * the app) so an image can be re-encoded without another paid generation.
 *
 * Usage: node scripts/optimize-fresh-images.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const DIR = path.join(process.cwd(), "public", "generated", "send");
const KEEP = path.join(DIR, "originals");
fs.mkdirSync(KEEP, { recursive: true });

let converted = 0;
for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith(".png"))) {
  const source = path.join(DIR, file);
  const target = path.join(DIR, file.replace(/\.png$/, ".webp"));
  if (!fs.existsSync(target)) {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", source, "-vf", "scale='min(1024,iw)':-2", "-c:v", "libwebp", "-quality", "82", target]);
    converted += 1;
  }
  if (!fs.existsSync(path.join(KEEP, file))) fs.copyFileSync(source, path.join(KEEP, file));
  fs.rmSync(source);
}

const manifestPath = path.join(DIR, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const existing = new Map(Object.entries(manifest.assets).map(([id, value]) => [id, value]));

// Build from the registry (every generated asset), preferring the WebP file on disk.
const registry = JSON.parse(fs.readFileSync(path.join(process.cwd(), "scripts", "image-registry.json"), "utf8"));
const assets = {};
for (const asset of registry.assets.filter((a) => a.vertical === "send" && a.storagePath)) {
  const webp = asset.storagePath.replace(/\.png$/, ".webp");
  assets[asset.id] = fs.existsSync(path.join(process.cwd(), "public", webp)) ? webp : existing.get(asset.id) ?? asset.storagePath;
}
fs.writeFileSync(manifestPath, JSON.stringify({ generatedAt: new Date().toISOString(), model: registry.model, assets }, null, 2));

const sizes = fs.readdirSync(DIR).filter((f) => f.endsWith(".webp")).reduce((sum, f) => sum + fs.statSync(path.join(DIR, f)).size, 0);
console.log(JSON.stringify({ converted, totalWebp: fs.readdirSync(DIR).filter((f) => f.endsWith(".webp")).length, totalMB: Number((sizes / 1024 / 1024).toFixed(1)), manifestAssets: Object.keys(manifest.assets).length }));
