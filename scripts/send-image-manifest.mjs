/**
 * Builds public/generated/send/manifest.json from the provenance registry so the
 * app resolves NaijaSend images without bundling the registry. Prefers WebP.
 * Usage: node scripts/send-image-manifest.mjs
 */
import fs from "node:fs";
import path from "node:path";

const registry = JSON.parse(fs.readFileSync(path.join(process.cwd(), "scripts", "image-registry.json"), "utf8"));
const assets = {};
for (const asset of registry.assets.filter((a) => a.vertical === "send" && a.storagePath)) {
  const webp = asset.storagePath.replace(/\.png$/, ".webp");
  assets[asset.id] = fs.existsSync(path.join(process.cwd(), "public", webp)) ? webp : asset.storagePath;
}
const out = path.join(process.cwd(), "public", "generated", "send", "manifest.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), model: registry.model, assets }, null, 2));
console.log(JSON.stringify({ written: out, assets: Object.keys(assets).length }));
