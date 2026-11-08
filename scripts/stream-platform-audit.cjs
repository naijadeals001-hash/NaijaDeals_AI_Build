/**
 * Full NaijaStream platform audit: every route as guest and as a signed-in
 * listener, every primary control exercised, console/network errors counted.
 * Usage: BASE_URL=http://localhost:3015 node scripts/stream-platform-audit.cjs
 */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.BASE_URL ?? "http://localhost:3015";
const OUT = path.join(process.cwd(), "qa-artifacts", "stream-audit");
fs.mkdirSync(OUT, { recursive: true });

const ROUTES = [
  "/naijastream", "/naijastream/discover", "/naijastream/explore", "/naijastream/music",
  "/naijastream/music?genre=Gospel", "/naijastream/podcasts", "/naijastream/podcasts/the-african-dream",
  "/naijastream/live", "/naijastream/live/afrovibes-live-lagos", "/naijastream/videos",
  "/naijastream/videos/live-in-lagos-clip", "/naijastream/artists", "/naijastream/artists/adaeze-moon",
  "/naijastream/charts", "/naijastream/playlists", "/naijastream/playlists/afrobeats-hits",
  "/naijastream/search?q=lagos", "/naijastream/library", "/naijastream/premium", "/naijastream/notifications",
  "/naijastream/aura", "/naijastream/studio", "/naijastream/studio/upload", "/naijastream/studio/royalties",
  "/naijastream/studio/settings", "/naijastream/account"
];

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

(async () => {
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--autoplay-policy=no-user-gesture-required"] });
  const results = { guest: [], listener: [] };

  async function sweep(context, label) {
    const page = await context.newPage();
    for (const route of ROUTES) {
      const errors = [];
      const expected = route === "/naijastream/studio/settings" && label === "listener" ? new Set(["404 /api/stream/profile"]) : new Set();
      const onErr = (e) => errors.push(String(e).slice(0, 100));
      const onConsole = (m) => {
        // "Failed to load resource" carries the status only; the network
        // listener below decides whether that status is an expected answer.
        if (m.type() === "error" && !/401|403|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 100));
      };
      const onResponse = (r) => {
        const url = r.url();
        const key = `${r.status()} /api/stream/profile`;
        if (r.status() >= 400 && !/401|403/.test(String(r.status())) && !(expected.has(key) && url.endsWith("/api/stream/profile"))) {
          errors.push(`HTTP ${r.status()} ${url.slice(0, 90)}`);
        }
      };
      page.on("pageerror", onErr);
      page.on("console", onConsole);
      page.on("response", onResponse);
      const res = await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 45000 }).catch(() => null);
      await page.waitForTimeout(700);
      const info = await page.evaluate(() => ({
        textLength: document.body.innerText.trim().length,
        notFound: /could not be found/i.test(document.body.innerText),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        stub: /not available yet|not configured/i.test(document.body.innerText)
      }));
      page.off("pageerror", onErr);
      page.off("console", onConsole);
      page.off("response", onResponse);
      results[label].push({ route, status: res?.status() ?? 0, ...info, errors: errors.length, sample: errors.slice(0, 2) });
      check(`${label} ${route}`, (res?.status() === 200 || res?.status() === 307) && !info.notFound && errors.length === 0 && info.overflow <= 1, JSON.stringify({ s: res?.status(), len: info.textLength, err: errors.length, nf: info.notFound, ov: info.overflow, stub: info.stub, sample: errors.slice(0,1) }));
    }
    await page.close();
  }

  const guest = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await sweep(guest, "guest");
  await guest.close();

  const listener = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const lp = await listener.newPage();
  await lp.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await lp.evaluate(async () => {
    await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ email: "customer@naijadeals.local", password: "CustomerPass123!" }) });
  });
  await lp.close();
  await sweep(listener, "listener");

  // Core interactions as a signed-in listener.
  const page = await listener.newPage();
  await page.goto(`${BASE}/naijastream`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const interactions = {};
  // Genre filter navigation
  await page.goto(`${BASE}/naijastream/music`, { waitUntil: "networkidle" });
  const gospel = page.locator('a[href*="genre=Gospel"]').first();
  if (await gospel.count()) await gospel.click();
  await page.waitForURL(/genre=Gospel/, { timeout: 15000 }).catch(() => undefined);
  interactions.genreFilter = page.url().includes("genre=Gospel");
  interactions.genreResults = await page.evaluate(() => document.querySelectorAll("table tbody tr").length > 0);

  // Play from a playlist and verify audio decodes
  await page.goto(`${BASE}/naijastream/playlists/afrobeats-hits`, { waitUntil: "networkidle" });
  await page.locator('table tbody tr button[aria-label^="Play "]').first().click();
  await page.waitForTimeout(3500);
  interactions.audio = await page.evaluate(() => {
    const a = document.querySelector("audio");
    return { t: Number((a?.currentTime || 0).toFixed(2)), dur: Math.round(a?.duration || 0), paused: a?.paused };
  });

  // Like from the player
  const likeBtn = page.getByRole("button", { name: /like track/i }).first();
  if (await likeBtn.count()) {
    await likeBtn.click();
    await page.waitForTimeout(900);
    interactions.like = await page.getByRole("button", { name: /unlike track/i }).count() > 0;
  }

  // Aura answers with grounded results
  await page.goto(`${BASE}/naijastream/aura`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Amapiano playlists" }).click();
  await page.waitForTimeout(1800);
  interactions.aura = await page.evaluate(() => /Amapiano/i.test(document.body.innerText) && /Grounded on catalogue records/i.test(document.body.innerText));

  // Search returns results
  await page.goto(`${BASE}/naijastream/search?q=grace`, { waitUntil: "networkidle" });
  interactions.search = await page.evaluate(() => /Amaka Grace/i.test(document.body.innerText));

  await page.screenshot({ path: path.join(OUT, "listener-home.png") });
  await page.close();
  await listener.close();
  await browser.close();

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ results, interactions }, null, 2));
  console.log("\nINTERACTIONS:", JSON.stringify(interactions, null, 1));
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.error("FAILURES:", failures.slice(0, 12));
    process.exit(1);
  }
})();
