/**
 * Renders the three original NaijaDeals module illustrations to the JPEGs the
 * homepage actually serves.
 *
 * These modules have no context-appropriate source photograph on disk, so they use
 * the project's own generated artwork instead of borrowing another module's food or
 * solar photograph. The artwork is a vector scene (accommodation, music/creators,
 * concierge/support) and is rasterised here at the same 1024x768 shape as the
 * photographic cards, so the layout and the byte budget stay identical.
 *
 * This is an illustration, not a photograph. Replace it with supplied photography
 * when it exists.
 *
 * Usage: node scripts/render-module-art.mjs
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const generatedDir = path.join(root, "public", "generated");
const outDir = path.join(root, "public", "real-photography");

const mapping = {
  "module-stay.svg": "module-stay",
  "module-stream.svg": "module-stream",
  "module-aura.svg": "module-aura"
};

fs.mkdirSync(outDir, { recursive: true });

for (const [source, base] of Object.entries(mapping)) {
  const file = path.join(generatedDir, source);
  if (!fs.existsSync(file)) {
    throw new Error(`missing artwork: ${file}`);
  }

  const svg = fs.readFileSync(file);
  const target = path.join(outDir, `${base}.jpg`);

  // density 160 renders the 640x480 viewBox at 1.5x before the 1024x768 resize,
  // which keeps the vector edges crisp.
  await sharp(svg, { density: 160 })
    .resize(1024, 768, { fit: "cover" })
    .flatten({ background: "#0b1026" })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(target);

  const size = fs.statSync(target).size;
  const meta = await sharp(target).metadata();
  console.log(`${base}.jpg  ${meta.width}x${meta.height}  ${(size / 1024).toFixed(0)} KB`);
}
