/** Builds public/generated/stay/manifest.json from the provenance registry. */
import fs from "node:fs";
import path from "node:path";
const registry = JSON.parse(fs.readFileSync(path.join(process.cwd(), "scripts", "image-registry.json"), "utf8"));
const assets = {};
for (const a of registry.assets.filter((x) => x.vertical === "stay" && x.storagePath)) {
  const webp = a.storagePath.replace(/\.png$/, ".webp");
  assets[a.id] = fs.existsSync(path.join(process.cwd(), "public", webp)) ? webp : a.storagePath;
}
const out = path.join(process.cwd(), "public", "generated", "stay", "manifest.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), assets }, null, 2));
console.log(JSON.stringify({ written: out, assets: Object.keys(assets).length }));
