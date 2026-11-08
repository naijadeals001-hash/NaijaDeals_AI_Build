/**
 * NaijaStream discovery QA: every city card and its destination, category
 * colours and CTAs, featured-song artwork, the podcast rail, and responsive
 * layout at seven widths without horizontal overflow.
 *
 * Image identity is checked against the city record itself: a card may only
 * show the imageUrl approved for that slug, and a city without one must render
 * the explicit "photo pending" state — never another city's picture.
 *
 * Usage: BASE_URL=http://localhost:3015 node scripts/stream-discovery-qa.cjs
 */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.BASE_URL ?? "http://localhost:3015";
const OUT = path.join(process.cwd(), "qa-artifacts", "stream-discovery");
fs.mkdirSync(OUT, { recursive: true });

let passed = 0;
const failures = [];
const check = (name, ok, detail) => {
  if (ok) {
    passed += 1;
    console.log(`  PASS ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const WIDTHS = [320, 360, 390, 430, 768, 1024, 1440];

(async () => {
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });

  // ---- Explore catalogue as rendered ------------------------------------
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("pageerror", (error) => consoleErrors.push(String(error).slice(0, 120)));
  await page.goto(`${BASE}/naijastream/explore`, { waitUntil: "load", timeout: 120000 });
  await page.locator("a[data-city]").first().waitFor({ timeout: 30000 });

  const cards = await page.$$eval("a[data-city]", (nodes) =>
    nodes.map((node) => {
      const img = node.querySelector("img");
      return {
        slug: node.getAttribute("data-city"),
        href: node.getAttribute("href"),
        text: node.innerText.replace(/\s+/g, " ").trim(),
        imageSrc: img ? img.getAttribute("src") : null,
        hasPending: /photo pending/i.test(node.innerText),
        height: node.getBoundingClientRect().height
      };
    })
  );
  check("every city card is rendered", cards.length >= 35, `cards ${cards.length}`);
  check("every card links to its own city page", cards.every((card) => card.href === `/naijastream/cities/${card.slug}`), JSON.stringify(cards.filter((c) => c.href !== `/naijastream/cities/${c.slug}`).slice(0, 3)));
  check("no card collapses", cards.every((item) => item.height > 100), JSON.stringify(cards.filter((item) => item.height <= 100).map((item) => item.slug)));

  const api = await (await ctx.request.get(`${BASE}/api/stream/cities`)).json().catch(() => null);
  const approved = api?.cities ?? null;
  if (approved) {
    const mismatched = cards.filter((card) => {
      const record = approved.find((city) => city.slug === card.slug);
      if (!record) return true;
      return record.imageUrl ? card.imageSrc !== record.imageUrl : card.imageSrc !== null || !card.hasPending;
    });
    check("city imagery matches the approved record for that city", mismatched.length === 0, JSON.stringify(mismatched.map((c) => c.slug).slice(0, 5)));
    const covered = approved.filter((city) => city.imageUrl).length;
    console.log(`  INFO city image coverage: ${covered}/${approved.length} approved, ${approved.length - covered} awaiting approved photography`);
  } else {
    check("city catalogue API responds", false, "GET /api/stream/cities unavailable");
  }

  // Region tabs and country filter.
  const tabs = await page.getByRole("tab").allInnerTexts();
  check("five regional tabs plus All Africa", tabs.length === 6, JSON.stringify(tabs));
  await page.getByRole("tab", { name: /East Africa/ }).click();
  await page.waitForTimeout(400);
  const eastCount = await page.locator("a[data-city]").count();
  check("East Africa tab filters the grid", eastCount === 6, `visible ${eastCount}`);
  await page.selectOption("select", "Kenya");
  await page.waitForTimeout(400);
  const kenyaCount = await page.locator("a[data-city]").count();
  check("country filter narrows within a region", kenyaCount === 2, `visible ${kenyaCount}`);
  await page.getByRole("tab", { name: /All Africa/ }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, "explore-desktop.png") });

  // City destinations: every city resolves and never 404s.
  const deadLinks = [];
  for (const card of cards) {
    const res = await ctx.request.get(`${BASE}/naijastream/cities/${card.slug}`);
    if (res.status() !== 200) deadLinks.push(`${card.slug}:${res.status()}`);
  }
  check("every city destination responds 200", deadLinks.length === 0, deadLinks.slice(0, 5).join(", "));

  // City page with content renders its content sections.
  await page.goto(`${BASE}/naijastream/cities/lagos`, { waitUntil: "load", timeout: 120000 });
  const lagos = await page.evaluate(() => ({
    artists: document.querySelectorAll('section[aria-labelledby="city-artists"] li').length,
    tracks: document.querySelectorAll('section[aria-labelledby="city-music"] li').length,
    hero: document.querySelector("header img")?.getAttribute("src") ?? null
  }));
  check("Lagos page lists real artists and tracks", lagos.artists > 0 && lagos.tracks > 0, JSON.stringify(lagos));
  check("Lagos page shows its own city image", Boolean(lagos.hero) && /lagos\./.test(lagos.hero), JSON.stringify(lagos.hero));

  await page.goto(`${BASE}/naijastream/cities/kumasi`, { waitUntil: "load", timeout: 120000 });
  const empty = await page.evaluate(() => /No published Kumasi content yet/.test(document.body.innerText));
  check("city without creators shows an honest empty state", empty);

  // ---- Category identity -------------------------------------------------
  await page.goto(`${BASE}/naijastream`, { waitUntil: "load", timeout: 120000 });
  await page.waitForTimeout(3500);
  const categories = await page.$$eval("a[data-category]", (nodes) =>
    nodes.map((node) => ({ key: node.getAttribute("data-category"), href: node.getAttribute("href"), colour: getComputedStyle(node).borderColor }))
  );
  const unique = new Set(categories.map((c) => c.colour));
  check("five categories rendered", categories.length === 5, `found ${categories.length}`);
  check("each category has a distinct accent", unique.size === 5, JSON.stringify([...unique]));
  const ctasAlive = [];
  for (const category of categories) {
    const res = await ctx.request.get(`${BASE}${category.href}`);
    if (res.status() !== 200) ctasAlive.push(`${category.key}:${res.status()}`);
  }
  check("every category CTA reaches a working page", ctasAlive.length === 0, ctasAlive.join(", "));

  // Featured songs carry artwork and metadata.
  const featured = await page.$$eval("li", (nodes) =>
    nodes
      .filter((node) => node.querySelector('a[href^="/naijastream/tracks/"]'))
      .slice(0, 12)
      .map((node) => ({ href: node.querySelector('a[href^="/naijastream/tracks/"]').getAttribute("href"), label: node.innerText.replace(/\s+/g, " ").trim() }))
  );
  check("featured songs render as artwork rows", featured.length > 0, `rows ${featured.length}`);
  check("featured song rows show artist, genre and duration", featured.filter((row) => /\d+:\d{2}/.test(row.label) && row.label.split(" · ").length >= 2).length >= Math.min(4, featured.length), JSON.stringify(featured.slice(0, 2)));
  const images = await page.$$eval("li img", (nodes) => nodes.filter((img) => img.naturalWidth > 0 && /generated\/stream/.test(img.getAttribute("src") ?? "")).length);
  check("featured song artwork decodes", images > 0, `decoded ${images}`);

  // Podcast rail depth.
  const podcastCount = await page.$$eval('a[href^="/naijastream/podcasts/"]', (nodes) => nodes.length);
  check("podcast rail shows a deep catalogue", podcastCount >= 8, `cards ${podcastCount}`);
  await page.screenshot({ path: path.join(OUT, "home-desktop.png") });

  // Podcast page plays a real episode.
  await page.goto(`${BASE}/naijastream/podcasts/money-moves-africa`, { waitUntil: "load", timeout: 120000 });
  const playButton = page.getByRole("button", { name: /play/i }).first();
  if (await playButton.count()) {
    await playButton.click();
    await page.waitForTimeout(3500);
    const audio = await page.evaluate(() => {
      const element = document.querySelector("audio");
      return element ? { time: element.currentTime, paused: element.paused, duration: element.duration, error: element.error?.code ?? null } : null;
    });
    check("podcast episode produces real audio", Boolean(audio && audio.time > 0.5 && !audio.error), JSON.stringify(audio));
  } else {
    check("podcast episode has a play control", false, "no play button");
  }

  check("no uncaught page errors during discovery QA", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));
  await ctx.close();

  // ---- Responsive widths -------------------------------------------------
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const view = await context.newPage();
    await view.goto(`${BASE}/naijastream`, { waitUntil: "load", timeout: 120000 });
    await view.waitForTimeout(2500);
    const layout = await view.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      categoryTiles: document.querySelectorAll("a[data-category]").length,
      cityCards: document.querySelectorAll("a[data-city]").length,
      playerVisible: Boolean(document.querySelector('[aria-label="Player"], [data-stream-audio]'))
    }));
    check(`${width}px: no horizontal overflow`, layout.overflow <= 1, JSON.stringify(layout));
    // Below 1024px the phone composition renders; both trees must carry the city rail.
    check(`${width}px: categories and cities present`, layout.categoryTiles === 5 && layout.cityCards > 0, JSON.stringify(layout));
    await view.screenshot({ path: path.join(OUT, `home-${width}.png`) });
    await context.close();
  }

  await browser.close();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.error("FAILURES:", failures.slice(0, 15));
    process.exit(1);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
