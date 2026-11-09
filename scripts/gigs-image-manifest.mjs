/** Builds public/generated/gigs/manifest.json from the provenance registry (WebP when present). */
import fs from "node:fs";
import path from "node:path";
const registry = JSON.parse(fs.readFileSync(path.join(process.cwd(), "scripts", "image-registry.json"), "utf8"));
const assets = {};
for (const asset of registry.assets.filter((a) => a.vertical === "gigs" && a.storagePath)) {
  const webp = asset.storagePath.replace(/\.png$/, ".webp");
  assets[asset.id] = fs.existsSync(path.join(process.cwd(), "public", webp)) ? webp : asset.storagePath;
}
const out = path.join(process.cwd(), "public", "generated", "gigs", "manifest.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), assets }, null, 2));
console.log(JSON.stringify({ written: out, assets: Object.keys(assets).length }));
