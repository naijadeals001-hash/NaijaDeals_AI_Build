import type { Config } from "tailwindcss";
import fs from "node:fs";
import path from "node:path";

/**
 * This workspace contains a stray `app/index` directory whose ACL denies every
 * read to the build user, so a blanket `./app/**` content glob makes fast-glob
 * descend into it and abort compilation with EPERM. A negative glob does not
 * help, because fast-glob only filters results after it has already traversed
 * the directory. Enumerate the readable top-level app directories instead and
 * escape glob metacharacters in route-group names such as `(public)`, `[slug]`
 * and `@modal`.
 */
function escapeGlobSegment(segment: string) {
  return segment.replace(/[()\[\]{}*?+@!]/g, (character) => `[${character}]`);
}

function appContentGlobs(): string[] {
  const fallback = "./app/**/*.{js,ts,jsx,tsx,mdx}";
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(path.join(process.cwd(), "app"), { withFileTypes: true });
  } catch {
    return [fallback];
  }

  const globs = ["./app/*.{js,ts,jsx,tsx,mdx}"];
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    // Unreadable leftover directory; it contains no source we can or should scan.
    if (entry.name === "index") continue;
    globs.push(`./app/${escapeGlobSegment(entry.name)}/**/*.{js,ts,jsx,tsx,mdx}`);
  }
  return globs;
}

const config: Config = {
  content: [
    ...appContentGlobs(),
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#ffffff",
        ink: "#191c1e",
        muted: "#4B5563",
        surface: "#f8f9fb",
        "surface-low": "#f3f4f6",
        "surface-mid": "#edeef0",
        "border-soft": "#d8dfd8",
        primary: "#006d38",
        "primary-live": "#00a859",
        "primary-soft": "#e7f8ed",
        amber: "#F59E0B",
        "amber-strong": "#B45309",
        "amber-soft": "#FEF3C7",
        crimson: "#EF4444",
        "crimson-soft": "#FEE2E2",
        night: "#101418"
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Plus Jakarta Sans", "Inter", "system-ui", "sans-serif"]
      },
      boxShadow: {
        soft: "0 18px 50px rgba(16, 24, 40, 0.08)",
        lift: "0 10px 28px rgba(0, 109, 56, 0.12)"
      }
    }
  },
  plugins: []
};

export default config;
