/**
 * Builds the web-ready module photography used by the homepage cards.
 *
 * The original photographs are ~2.5 MB each, far too heavy for a mobile-first
 * product in a metered-data market. This script reads the originals from
 * PHOTO_SOURCE_DIR (default: the owner's "Uber and Bolt/pictures" folder) and
 * writes 1024x768 JPEGs to public/real-photography/.
 *
 * Usage: node scripts/optimize-photography.mjs
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const sourceDir =
  process.env.PHOTO_SOURCE_DIR ?? "C:\\Users\\User\\Documents\\Uber and Bolt\\pictures";
const outDir = path.join(process.cwd(), "public", "real-photography");

/** Source photograph -> published file name.
 *
 * NaijaStay, NaijaStream and Aura AI are deliberately absent: their cards use the
 * original generated NaijaDeals artwork in `public/generated/`, rasterised by
 * `scripts/render-module-art.mjs`. Keeping them out of this map means re-running this
 * photography script can never overwrite those three with an unrelated food or solar
 * photograph again.
 */
const mapping = {
  "NaijaShop Electronics Market in Nigeria.png": "module-shop",
  "Steaming Nigerian Jollof Rice Feast.png": "module-eats",
  "Vibrant Nigerian Market Produce Stall.png": "module-fresh",
  "NaijaDrive at Lagos Sunset.png": "module-drive",
  "NaijaSend Delivery in Lagos.png": "module-send",
  "NaijaGigs AC Repair in Lagos.png": "module-gigs",
  "NaijaWallet Market Payments in Nigeria.png": "module-wallet",
  "NaijaEats Jollof Feast.png": "hero-ecosystem"
};

fs.mkdirSync(outDir, { recursive: true });

let before = 0;
let after = 0;

for (const [file, base] of Object.entries(mapping)) {
  const source = path.join(sourceDir, file);
  if (!fs.existsSync(source)) {
    console.warn(`skip ${file}: not found in ${sourceDir}`);
    continue;
  }

  const input = fs.readFileSync(source);
  before += input.length;

  const target = path.join(outDir, `${base}.jpg`);
  await sharp(input)
    .rotate()
    .resize(1024, 768, { fit: "cover", position: "attention" })
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(target);

  const size = fs.statSync(target).size;
  after += size;
  console.log(`${base}.jpg  ${(input.length / 1024 / 1024).toFixed(2)} MB -> ${(size / 1024).toFixed(0)} KB`);
}

console.log(`\ntotal ${(before / 1024 / 1024).toFixed(1)} MB -> ${(after / 1024 / 1024).toFixed(1)} MB`);
