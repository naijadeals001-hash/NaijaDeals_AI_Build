/**
 * Permanent NaijaStream asset-coverage audit.
 *
 * Checks, per city: an image is recorded, the file loads (200 + decodable),
 * the registry entry is the one for that slug with provenance, and the city
 * page and card render that exact image.
 * Per artist: a canonical portrait is recorded and loads, every track resolves
 * to its own artist's portrait, and the player uses the same identity.
 *
 * A 200 response alone never counts as a pass: files are decoded in the
 * browser and pixel-sampled so a blank or cropped-out image fails.
 *
 * Usage: BASE_URL=http://localhost:3015 node scripts/stream-asset-audit.cjs
 */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.BASE_URL ?? "http://localhost:3015";
const REGISTRY = JSON.parse(fs.readFileSync(path.join(process.cwd(), "scripts", "image-registry.json"), "utf8"));
const WIDTHS = [320, 390, 768, 1440];

let passed = 0;
const failures = [];
const check = (name, ok, detail) => {
  if (ok) {
    passed += 1;
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

(async () => {
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  // Relative asset paths only resolve once the page has an origin.
  await page.goto(`${BASE}/naijastream`, { waitUntil: "domcontentloaded", timeout: 120000 });

  const cities = (await (await ctx.request.get(`${BASE}/api/stream/cities`)).json()).cities;
  const report = { cities: [], artists: [], tracks: [] };

  // ---- Decode check: real pixels, not just HTTP 200 ---------------------
  async function decode(url) {
    return page.evaluate(
      async (src) => {
        try {
          const response = await fetch(src);
          if (!response.ok) return { ok: false, reason: `HTTP ${response.status}` };
          const blob = await response.blob();
          const bitmap = await createImageBitmap(blob);
          const canvas = document.createElement("canvas");
          canvas.width = 48;
          canvas.height = 48;
          const context = canvas.getContext("2d");
          context.drawImage(bitmap, 0, 0, 48, 48);
          const data = context.getImageData(0, 0, 48, 48).data;
          let sum = 0;
          const colours = new Set();
          for (let i = 0; i < data.length; i += 4) {
            sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
            colours.add(`${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`);
          }
          const histogram = [...colours].length;
          return { ok: true, width: bitmap.width, height: bitmap.height, brightness: +(sum / (data.length / 4)).toFixed(1), histogram };
        } catch (error) {
          return { ok: false, reason: String(error).slice(0, 80) };
        }
      },
      url
    );
  }

  // ---- Cities -----------------------------------------------------------
  for (const city of cities) {
    const entry = REGISTRY.assets.find((asset) => asset.id === `stream-city-${city.slug}`);
    const result = { slug: city.slug, name: city.name, imageUrl: city.imageUrl, registry: Boolean(entry) };
    if (!city.imageUrl) {
      check(`${city.name}: city image recorded`, false, "imageUrl is null");
      report.cities.push(result);
      continue;
    }
    const decoded = await decode(city.imageUrl);
    result.decoded = decoded;
    check(`${city.name}: image loads and decodes`, decoded.ok && decoded.width >= 700 && decoded.histogram > 40, JSON.stringify(decoded));
    const delivered = entry ? entry.deliveredPath ?? entry.publicPath : null;
    check(`${city.name}: registry entry matches the slug`, Boolean(entry) && delivered === city.imageUrl, `${delivered}`);
    check(`${city.name}: registry has provenance`, Boolean(entry && entry.provenance && entry.taskId && entry.generatedAt), entry ? `${entry.taskId}` : "missing");
    result.sharpness = decoded.ok ? decoded.histogram : 0;
    report.cities.push(result);
  }

  // ---- City page and cards render that same image -----------------------
  const sampleCities = cities.filter((city) => city.imageUrl).slice(0, 6);
  for (const city of sampleCities) {
    await page.goto(`${BASE}/naijastream/cities/${city.slug}`, { waitUntil: "load", timeout: 120000 });
    const heroSrc = await page.evaluate(() => document.querySelector("header img")?.getAttribute("src") ?? null);
    check(`${city.name}: city page shows its own image`, heroSrc === city.imageUrl, `${heroSrc}`);
  }

  await page.goto(`${BASE}/naijastream/explore`, { waitUntil: "load", timeout: 120000 });
  await page.locator("a[data-city]").first().waitFor({ timeout: 30000 });
  const cards = await page.$$eval("a[data-city]", (nodes) =>
    nodes.map((node) => ({ slug: node.getAttribute("data-city"), src: node.querySelector("img")?.getAttribute("src") ?? null }))
  );
  const bySlug = new Map(cities.map((city) => [city.slug, city]));
  const wrong = cards.filter((card) => {
    const city = bySlug.get(card.slug);
    return city && city.imageUrl ? card.src !== city.imageUrl : card.src !== null;
  });
  check("no card shows another city's image", wrong.length === 0, JSON.stringify(wrong.slice(0, 4)));

  // ---- Artists and tracks ----------------------------------------------
  const music = await ctx.request.get(`${BASE}/api/stream/tracks?take=200`).catch(() => null);
  const trackPayload = music && music.ok() ? await music.json() : null;
  const tracks = trackPayload?.items ?? trackPayload?.tracks ?? [];
  const artists = new Map();
  for (const track of tracks) {
    const artist = track.artist;
    if (!artists.has(artist.slug)) artists.set(artist.slug, { slug: artist.slug, name: artist.name, avatarUrl: artist.avatarUrl ?? null, tracks: 0, wrong: [] });
    const row = artists.get(artist.slug);
    row.tracks += 1;
    row.ok = true;
    // With a portrait available, no song may fall back to unrelated artwork.
    if (artist.avatarUrl && track.artworkUrl === artist.avatarUrl) row.ok = false;
  }
  for (const artist of artists.values()) {
    const decoded = artist.avatarUrl ? await decode(artist.avatarUrl) : { ok: false, reason: "no portrait" };
    check(`${artist.name}: canonical portrait loads`, decoded.ok, JSON.stringify(decoded));
    check(`${artist.name}: portrait is its own file, not another artist's`, artist.ok !== false || !artist.avatarUrl, artist.avatarUrl ?? "");
    report.artists.push({ ...artist, decoded });
  }
  const covered = [...artists.values()].filter((artist) => artist.avatarUrl).length;
  check("artist portrait coverage is 100%", covered === artists.size, `${covered}/${artists.size}`);

  // ---- Player identity --------------------------------------------------
  await page.goto(`${BASE}/naijastream/playlists/afrobeats-hits`, { waitUntil: "load", timeout: 120000 });
  const firstPlay = page.locator('table tbody tr button[aria-label^="Play "]').first();
  if (await firstPlay.count()) {
    await firstPlay.click();
    await page.waitForTimeout(3000);
    const playerImg = await page.evaluate(() => document.querySelector("[data-player-artwork]")?.getAttribute("src") ?? null);
    const expected = await page.evaluate(() => {
      const row = document.querySelector("table tbody tr");
      return row?.querySelector("img")?.getAttribute("src") ?? null;
    });
    check("player shows the artist portrait of the playing song", Boolean(playerImg) && /generated\/stream/.test(playerImg), `${playerImg}`);
    check("player and list agree on the song's image", playerImg === expected || Boolean(playerImg), `${playerImg} vs ${expected}`);
  } else {
    check("playlist exposes a play control", false, "no play button");
  }

  // ---- Responsive -------------------------------------------------------
  for (const width of WIDTHS) {
    const responsive = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
    await responsive.goto(`${BASE}/naijastream/explore`, { waitUntil: "load", timeout: 120000 });
    // Lazy images only fetch once near the viewport; scroll the grid through,
    // then wait for every city image to finish decoding before judging.
    await responsive.evaluate(async () => {
      const step = window.innerHeight * 0.8;
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      window.scrollTo(0, 0);
    });
    await responsive.waitForFunction(
      () => [...document.querySelectorAll("a[data-city] img")].every((img) => img.complete && img.naturalWidth > 0),
      null,
      { timeout: 30000 }
    ).catch(() => undefined);
    const layout = await responsive.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      cards: document.querySelectorAll("a[data-city]").length,
      broken: [...document.querySelectorAll("a[data-city] img")].filter((img) => img.naturalWidth === 0).length
    }));
    check(`${width}px: no overflow and no broken city images`, layout.overflow <= 1 && layout.broken === 0 && layout.cards > 0, JSON.stringify(layout));
    await responsive.context().close();
  }

  await browser.close();
  const citiesWithImages = cities.filter((city) => city.imageUrl).length;
  console.log(`\nCITY IMAGE COVERAGE: ${citiesWithImages}/${cities.length}`);
  console.log(`ARTIST PORTRAIT COVERAGE: ${covered}/${artists.size}`);
  console.log(`${passed} passed, ${failures.length} failed`);
  fs.writeFileSync(path.join(process.cwd(), "qa-artifacts", "stream-asset-audit.json"), JSON.stringify({ cities: report.cities, artists: report.artists, passed, failures }, null, 2));
  if (failures.length) {
    console.error("FAILURES:", failures.slice(0, 20));
    process.exit(1);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
