/**
 * Converts generated NaijaShop PNGs to WebP (1024px, quality 82) for delivery.
 * Originals stay on disk and in the registry for provenance.
 *
 * Usage: node scripts/optimize-shop-images.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "public", "generated", "shop");
const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((file) => file.endsWith(".png")) : [];
let before = 0;
let after = 0;
let converted = 0;
for (const file of files) {
  const source = path.join(DIR, file);
  const target = path.join(DIR, file.replace(/\.png$/, ".webp"));
  before += fs.statSync(source).size;
  if (!fs.existsSync(target)) {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", source, "-vf", "scale='min(1024,iw)':-2", "-c:v", "libwebp", "-quality", "82", "-compression_level", "6", target]);
    converted += 1;
  }
  after += fs.statSync(target).size;
}
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
console.log(JSON.stringify({ files: files.length, converted, before: mb(before), after: mb(after), saved: before ? `${Math.round((1 - after / before) * 100)}%` : "0%" }));
