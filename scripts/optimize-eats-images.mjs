/**
 * Converts the approved NaijaEats artwork to WebP for delivery.
 * Two sizes: 1280px for heroes/banners and 640px for dish and restaurant cards.
 *
 * Usage: node scripts/optimize-eats-images.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "public", "generated", "eats");
const files = fs.readdirSync(DIR).filter((file) => file.endsWith(".png"));
let before = 0;
let after = 0;
let converted = 0;

for (const file of files) {
  const source = path.join(DIR, file);
  before += fs.statSync(source).size;
  for (const [suffix, width] of [["", 1280], ["-card", 640]]) {
    const target = path.join(DIR, file.replace(/\.png$/, `${suffix}.webp`));
    if (!fs.existsSync(target)) {
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", source, "-vf", `scale='min(${width},iw)':-2`, "-c:v", "libwebp", "-quality", "82", "-compression_level", "6", target]);
      converted += 1;
    }
    after += fs.statSync(target).size;
  }
}
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
console.log(JSON.stringify({ files: files.length, converted, before: mb(before), after: mb(after) }));
