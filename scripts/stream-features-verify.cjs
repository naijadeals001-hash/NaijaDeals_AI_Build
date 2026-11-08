// Verifies notifications, profile persistence, Explore Africa and the right panel.
const { chromium } = require("playwright-core");
const path = require("node:path");
const fs = require("node:fs");

const BASE = process.env.BASE_URL ?? "http://localhost:3015";
const OUT = path.join(process.cwd(), "qa-artifacts", "stream-features");
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

(async () => {
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Sign in as the demo artist who follows nobody yet.
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  const loginStatus = await page.evaluate(async () => (await fetch("/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
    body: JSON.stringify({ email: "demo.stream.adaeze@naijastream.demo", password: "NaijaStreamDemo2026!" })
  })).status);
  check("demo artist signs in", loginStatus === 200, String(loginStatus));

  // Follow another artist via API (this is the action the UI button triggers).
  const artistId = await page.evaluate(async () => {
    const res = await fetch("/api/stream/artists?q=Kunle");
    const body = await res.json();
    return body.artists?.[0]?.id ?? null;
  });
  const follow = await page.evaluate(async (id) => {
    const res = await fetch("/api/stream/follows", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ artistId: id }) });
    return { status: res.status, body: await res.json() };
  }, artistId);
  check("follow artist works", follow.status === 200, JSON.stringify(follow.body));

  // Profile settings load + save persists.
  await page.goto(`${BASE}/naijastream/studio/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const hasEditor = await page.locator("form input").count();
  check("profile editor renders", hasEditor > 0, `inputs ${hasEditor}`);
  const bio = `Bio updated ${Date.now().toString(36)}`;
  await page.getByRole("textbox").nth(1).fill(bio);
  await page.getByRole("button", { name: /save profile/i }).click();
  await page.waitForTimeout(1800);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const persistedBio = await page.getByRole("textbox").nth(1).inputValue();
  check("profile change persists after reload", persistedBio === bio, persistedBio);
  await page.screenshot({ path: path.join(OUT, "settings.png") });

  // Right panel is present with real data.
  await page.goto(`${BASE}/naijastream`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const panel = await page.evaluate(() => {
    const text = document.body.innerText.toLowerCase();
    // Right-hand panel = the aside that contains the recommendations heading.
    const rail = Array.from(document.querySelectorAll("aside")).find((a) => /recommended for you/i.test(a.innerText));
    return {
      recommended: /recommended for you/i.test(text),
      onRepeat: /on repeat/i.test(text),
      artistRows: rail ? rail.querySelectorAll("a[href^='/naijastream/artists/']").length : 0
    };
  });
  check("right panel renders recommendations", panel.recommended && panel.artistRows > 0, JSON.stringify(panel));
  check("right panel renders queue section", panel.onRepeat);
  await page.screenshot({ path: path.join(OUT, "home-rightpanel.png") });

  // Queue populates after playing.
  await page.getByRole("button", { name: /play now/i }).click();
  await page.waitForTimeout(2500);
  const queueRows = await page.evaluate(() => {
    const rail = Array.from(document.querySelectorAll("aside")).find((a) => /on repeat/i.test(a.innerText));
    return rail ? rail.querySelectorAll("button").length : 0;
  });
  check("queue shows tracks when playing", queueRows > 0, `buttons ${queueRows}`);

  // Notifications page loads real (empty or populated) state without error.
  await page.goto(`${BASE}/naijastream/notifications`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const notes = await page.evaluate(() => ({
    heading: document.querySelector("h1")?.textContent,
    signedIn: !/Sign in for notifications/i.test(document.body.innerText),
    unread: /unread/i.test(document.body.innerText)
  }));
  check("notifications render for signed-in user", notes.signedIn && notes.heading === "Notifications", JSON.stringify(notes));
  await page.screenshot({ path: path.join(OUT, "notifications.png") });

  // Explore Africa.
  await page.goto(`${BASE}/naijastream/explore`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const explore = await page.evaluate(() => ({
    countries: /by country/i.test(document.body.innerText),
    genres: /by genre/i.test(document.body.innerText),
    rows: document.querySelectorAll("aside, ul li").length
  }));
  check("explore Africa shows countries and genres", explore.countries && explore.genres, JSON.stringify(explore));
  await page.screenshot({ path: path.join(OUT, "explore.png"), fullPage: true });

  await browser.close();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.error("FAILURES:", failures);
    process.exit(1);
  }
})();
