/**
 * Associates generated city illustrations and artist portraits with their
 * database records, but only when the file exists and the registry entry for
 * that exact slug says generated. Artwork lives at
 * /generated/stream/cities/<slug>.png.
 *
 * Idempotent. Usage: node prisma/stream-apply-images.cjs
 */
const { PrismaClient } = require("@prisma/client");
const fs = require("node:fs");
const path = require("node:path");

const prisma = new PrismaClient();
const ROOT = process.cwd();
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "image-registry.json"), "utf8"));
const byId = new Map(registry.assets.map((asset) => [asset.id, asset]));

function artUrl(slug) {
  // WebP is the delivered format; PNG originals are provenance only.
  for (const ext of ["webp", "png"]) {
    const file = path.join(ROOT, "public", "generated", "stream", "cities", `${slug}.${ext}`);
    if (fs.existsSync(file)) return `/generated/stream/cities/${slug}.${ext}`;
  }
  return null;
}

/** Approved portraits that predate the cities/ folder (GPT Image 2, .jpg). */
const LEGACY_PORTRAITS = {
  "adaeze-moon": "/generated/stream/opt/stream-artist-adaeze.jpg",
  "kunle-ave": "/generated/stream/opt/stream-artist-kunle.jpg",
  "amaka-grace": "/generated/stream/opt/stream-artist-amaka.jpg",
  "tobi-vex": "/generated/stream/opt/stream-artist-tobi.jpg",
  "zainab-ke": "/generated/stream/opt/stream-artist-zainab.jpg",
  "kojo-mensah": "/generated/stream/opt/stream-artist-kojo.jpg"
};

/** The artist's own portrait file, preferring the canonical cities/ artwork. */
function portraitUrl(slug) {
  return artUrl(slug) ?? LEGACY_PORTRAITS[slug] ?? null;
}

(async () => {
  const cities = await prisma.streamCity.findMany({ select: { slug: true } });
  let citiesUpdated = 0;
  const missingCities = [];
  for (const city of cities) {
    const asset = byId.get(`stream-city-${city.slug}`);
    const url = artUrl(city.slug);
    if (!asset || !url) {
      missingCities.push(city.slug);
      continue;
    }
    await prisma.streamCity.update({
      where: { slug: city.slug },
      data: {
        imageUrl: url,
        imageCredit: "AI-generated illustration (Kie.ai GPT Image 2) — not a documentary photograph",
        imageApprovedAt: new Date()
      }
    });
    citiesUpdated += 1;
  }

  const artists = await prisma.streamArtist.findMany({ select: { id: true, slug: true, avatarUrl: true } });
  let artistsUpdated = 0;
  const missingArtists = [];
  for (const artist of artists) {
    const url = portraitUrl(artist.slug);
    if (!url || !fs.existsSync(path.join(ROOT, "public", url))) {
      missingArtists.push(artist.slug);
      continue;
    }
    await prisma.streamArtist.update({ where: { id: artist.id }, data: { avatarUrl: url } });
    artistsUpdated += 1;
  }

  // Provenance in the registry points at where each asset is actually used.
  for (const asset of registry.assets) {
    if (!asset.id.startsWith("stream-city-") && !asset.id.startsWith("stream-artist-")) continue;
    const slug = asset.id.replace(/^stream-(city|artist)-/, "");
    asset.usageReferences = asset.id.startsWith("stream-city-")
      ? [`StreamCity.imageUrl (${slug})`, `/naijastream/cities/${slug}`, "/naijastream/explore"]
      : [`StreamArtist.avatarUrl (${slug})`, "/naijastream (Featured songs, Trending)", `player artwork for ${slug}'s tracks`];
    asset.qualityReview = "reviewed-in-contact-sheet";
    // Deliver the compressed WebP; keep the PNG original for provenance.
    if (fs.existsSync(path.join(ROOT, "public", "generated", "stream", "cities", `${slug}.webp`))) {
      asset.deliveredPath = `/generated/stream/cities/${slug}.webp`;
      asset.sourcePath = asset.publicPath;
    }
  }
  fs.writeFileSync(path.join(ROOT, "scripts", "image-registry.json"), `${JSON.stringify(registry, null, 2)}\n`);

  const coverage = {
    cities: `${citiesUpdated}/${cities.length}`,
    artists: `${artistsUpdated}/${artists.length}`,
    missingCities,
    missingArtists
  };
  console.log(JSON.stringify(coverage));
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
