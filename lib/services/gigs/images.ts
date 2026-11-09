import fs from "node:fs";
import path from "node:path";

/**
 * Resolves Kie.ai assets for the NaijaGigs homepage. Read from disk at request
 * time so the provenance registry never enters the client bundle.
 */
type Manifest = { assets: Record<string, string> };
let cache: { at: number; data: Manifest } | null = null;

function manifest(): Manifest {
  const now = Date.now();
  if (cache && now - cache.at < 60_000) return cache.data;
  try {
    const data = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "generated", "gigs", "manifest.json"), "utf8")) as Manifest;
    cache = { at: now, data };
    return data;
  } catch {
    return { assets: {} };
  }
}

export function gigsImage(id: string) {
  const file = manifest().assets[id];
  return file ? `/${file}` : null;
}

/** Category art: the new mockup set first, then the earlier generated assets. */
export function gigsCategoryImage(slug: string) {
  const direct: Record<string, string> = {
    "building-renovation": "gigs-card-interior-painting",
    "home-repairs": "gigs-card-generator-repair",
    "repairs-maintenance": "gigs-card-generator-repair",
    "electrical-solar": "gigs-spot-solar",
    "cleaning-services": "gigs-card-deep-cleaning",
    "plumbing-services": "gigs2-cat-plumbing",
    "climbing-services": "gigs2-cat-climbing",
    "beauty-wellness": "gigs-hero-hairdresser",
    "events-catering": "gigs-spot-catering",
    "tech-digital": "gigs-card-web-development",
    "design-creative": "gigs-spot-video",
    "business-services": "gigs2-cat-business",
    "transportation-moving": "gigs2-cat-transport"
  };
  const id = direct[slug];
  return id ? gigsImage(id) : null;
}
