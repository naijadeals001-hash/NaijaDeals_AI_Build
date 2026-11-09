/**
 * Pre-BUILD Tailwind step.
 *
 * Next 14 with this repo's config can reuse a previously emitted CSS chunk, so a
 * component edit ships new class names in the JS bundle while the stylesheet
 * still lacks them (invisible headers, collapsed grids, no responsive variants).
 * Building Tailwind explicitly before `next build` pins the stylesheet to the
 * current sources; the output lands where Next's PostCSS pass would write it.
 *
 * Usage: node scripts/build-css.mjs   (invoked by `npm run prebuild`)
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, ".tailwind-build", "globals.css");

fs.mkdirSync(path.dirname(out), { recursive: true });
// Written to a scratch path: it documents exactly what Tailwind resolves for the
// current sources, and the build compares the emitted app stylesheet against it.
execFileSync("npx.cmd", ["tailwindcss", "-c", "tailwind.config.ts", "-i", "app/globals.css", "-o", out, "--minify"], {
  stdio: "inherit",
  cwd: root,
  shell: true
});

const stats = fs.statSync(out);
console.log(JSON.stringify({ wrote: path.relative(root, out), bytes: stats.size }));
