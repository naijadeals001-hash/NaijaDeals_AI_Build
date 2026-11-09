/** Converts NaijaStay PNGs to WebP (max 1024px) and rewrites the manifest. */
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
  if (!fs.existsSync(target)) { execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", source, "-vf", "scale='min(1024,iw)':-2", "-c:v", "libwebp", "-quality", "82", target]); converted += 1; }
  if (!fs.existsSync(path.join(KEEP, file))) fs.copyFileSync(source, path.join(KEEP, file));
  fs.rmSync(source);
}
const manifestPath = path.join(DIR, "manifest.json");
const registry = JSON.parse(fs.readFileSync(path.join(process.cwd(), "scripts", "image-registry.json"), "utf8"));
const assets = {};
for (const a of registry.assets.filter((x) => x.vertical === "stay" && x.storagePath)) {
  const webp = a.storagePath.replace(/\.png$/, ".webp");
  assets[a.id] = fs.existsSync(path.join(process.cwd(), "public", webp)) ? webp : a.storagePath;
}
fs.writeFileSync(manifestPath, JSON.stringify({ generatedAt: new Date().toISOString(), assets }, null, 2));
const size = fs.readdirSync(DIR).filter((f) => f.endsWith(".webp")).reduce((s, f) => s + fs.statSync(path.join(DIR, f)).size, 0);
console.log(JSON.stringify({ converted, totalWebp: Object.keys(assets).length, totalMB: Number((size / 1048576).toFixed(1)) }));
