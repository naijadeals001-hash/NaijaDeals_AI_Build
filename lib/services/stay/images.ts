import fs from "node:fs";
import path from "node:path";

/** Kie.ai assets for NaijaStay, resolved at request time from the provenance registry. */
type Manifest = { assets: Record<string, string> };
let cache: { at: number; data: Manifest } | null = null;

function manifest(): Manifest {
  const now = Date.now();
  if (cache && now - cache.at < 60_000) return cache.data;
  try {
    const data = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "generated", "stay", "manifest.json"), "utf8")) as Manifest;
    cache = { at: now, data };
    return data;
  } catch {
    return { assets: {} };
  }
}

export function stayImage(id: string) {
  const file = manifest().assets[id];
  return file ? `/${file}` : null;
}

export function categoryImage(slug: string) {
  const map: Record<string, string> = {
    hotels: "stay-cat-hotels",
    "serviced-apartments": "stay-cat-serviced",
    "short-term-rentals": "stay-cat-short-term",
    "long-term-rentals": "stay-cat-long-term",
    "houses-for-sale": "stay-cat-long-term",
    "land-and-plots": "stay-cat-land",
    "student-accommodation": "stay-cat-student",
    "corporate-stays": "stay-cat-corporate",
    "vacation-homes": "stay-cat-vacation",
    "event-conference-spaces": "stay-cat-event"
  };
  return stayImage(map[slug] ?? "stay-cat-hotels");
}
