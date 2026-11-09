import fs from "node:fs";
import path from "node:path";

/**
 * Resolves the Kie.ai asset generated for a NaijaFresh listing, farm, category
 * or promotional band.
 *
 * Every card must show a real generated image, so this is the single source of
 * truth for the mapping. The manifest is read from disk at request time rather
 * than imported, so it never enters the client bundle and picks up newly
 * generated assets without a rebuild.
 */
type Manifest = { assets: Record<string, string> };

let cache: { at: number; data: Manifest } | null = null;

function manifest(): Manifest {
  const now = Date.now();
  if (cache && now - cache.at < 60_000) return cache.data;
  try {
    const file = path.join(process.cwd(), "public", "generated", "fresh", "manifest.json");
    const data = JSON.parse(fs.readFileSync(file, "utf8")) as Manifest;
    cache = { at: now, data };
    return data;
  } catch {
    return { assets: {} };
  }
}

function asset(id: string) {
  const storagePath = manifest().assets[id];
  return storagePath ? `/${storagePath}` : null;
}

/** A farmer-uploaded image always wins; otherwise the generated asset. */
export function produceImage(listing: { slug: string; imageUrl: string | null }) {
  return listing.imageUrl ?? asset(`prod-${listing.slug}`);
}

export function farmImage(slug: string, avatarUrl: string | null) {
  return avatarUrl ?? asset(`farm-${slug}`);
}

export function categoryImage(categorySlug: string) {
  return asset(`cat-${categorySlug}`);
}

export function sceneImage(id: "hero" | "promo-home" | "promo-business" | "promo-farmer" | "promo-seasonal" | "promo-app") {
  return asset(id);
}
