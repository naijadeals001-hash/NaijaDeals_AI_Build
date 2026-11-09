/**
 * Builds public/generated/fresh/manifest.json from the image registry so the
 * app can resolve listing/farm/category images without bundling the whole
 * provenance registry. Run after scripts/generate-fresh-images.mjs.
 *
 * Usage: node scripts/fresh-image-manifest.mjs
 */
import fs from "node:fs";
import path from "node:path";

const registry = JSON.parse(fs.readFileSync(path.join(process.cwd(), "scripts", "image-registry.json"), "utf8"));
// Prefer the optimised WebP when it exists; the registry keeps the original PNG path.
const fresh = registry.assets.filter((asset) => asset.vertical === "fresh" && asset.storagePath);
const served = (storagePath) => {
  const webp = storagePath.replace(/\.png$/, ".webp");
  if (storagePath.endsWith(".png") && fs.existsSync(path.join(process.cwd(), "public", webp))) return webp;
  return storagePath;
};

const manifest = {
  generatedAt: new Date().toISOString(),
  model: registry.model,
  assets: Object.fromEntries(fresh.map((asset) => [asset.id, served(asset.storagePath)]))
};
const out = path.join(process.cwd(), "public", "generated", "fresh", "manifest.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ written: out, assets: fresh.length }));
