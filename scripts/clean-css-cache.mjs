/**
 * Tailwind's PostCSS cache can survive an incremental `next build`, leaving new
 * utility classes (including responsive variants) out of the emitted stylesheet
 * while the markup changes. That produced invisible headers and collapsed cards
 * three times in this repo, so every build starts from a clean CSS cache now.
 *
 * Usage: node scripts/clean-css-cache.mjs  (runs automatically via prebuild)
 */
import fs from "node:fs";
import path from "node:path";

const cacheRoot = path.join(process.cwd(), "node_modules", ".cache");
let removed = 0;
for (const dir of ["tailwindcss", "postcss"]) {
  const target = path.join(cacheRoot, dir);
  if (!fs.existsSync(target)) continue;
  fs.rmSync(target, { recursive: true, force: true });
  removed += 1;
}
console.log(JSON.stringify({ cleared: removed, cache: "node_modules/.cache/{tailwindcss,postcss}" }));
