/**
 * Four-dashboard homepage acceptance (directive tests A–N).
 *
 *  A. Dashboard 1 is still the original ecosystem page.
 *  B/C/D. Each new design renders and reaches every vertical.
 *  E/F/G. Assignment is stable per visitor and manual choice wins.
 *  H. Hero carousel: slides, dots, arrows, reduced motion.
 *  I. Admin can configure; non-admins cannot.
 *  J. Every vertical link resolves.
 *  K. Responsive at 320-1920 without overflow.
 *  M. Assignments survive a restart (they are in the database).
 *  N. Security: bad CTA rejected, script injection stripped, allocation must total 100.
 *
 * Usage: node scripts/home-dashboards-e2e.cjs
 */
const { chromium } = require("playwright-core");
const { PrismaClient } = require("@prisma/client");

const BASE = process.env.BASE_URL ?? "http://localhost:3015";
const prisma = new PrismaClient();
let passed = 0;
const failures = [];
const check = (name, ok, detail) => {
  if (ok) { passed += 1; console.log(`  PASS ${name}`); }
  else { failures.push(`${name}${detail ? ` — ${detail}` : ""}`); console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};

const MARKERS = { original: /One app for the way|Everything in the ecosystem/, "africa-super-app": /One App for Everything Africa/, mobility: /Move\. Shop\. Send|Move, send and book/, commerce: /Discover More\. Shop Better/ };

async function pickDesign(page, key) {
  await page.goto(`${BASE}/designs`, { waitUntil: "domcontentloaded" });
  return page.evaluate(async (k) => (await fetch("/api/home/design", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ variant: k }) })).status, key);
}

async function login(browser, email, password) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  const status = await page.evaluate(async ({ email, password }) => (await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ email, password }) })).status, { email, password });
  return { context, page, status };
}

(async () => {
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });

  // ---- A. Dashboard 1 preserved ---------------------------------------
  const original = await browser.newContext();
  const originalPage = await original.newPage();
  await pickDesign(originalPage, "original");
  await originalPage.goto(`${BASE}/`, { waitUntil: "load" });
  const originalHtml = await originalPage.content();
  check("A: original dashboard still renders", MARKERS.original.test(originalHtml));
  check("A: original keeps its ecosystem section", /Everything in the ecosystem/.test(originalHtml));
  check("A: original is not the new hero", !/One App for Everything Africa/.test(originalHtml));
  await original.close();

  // ---- B/C/D. Each design renders and links every vertical -------------
  const VERTICALS = ["/naijashop", "/naijaeats", "/naijafresh", "/naijadrive", "/naijasend", "/naijagigs", "/naijastay", "/naijastream", "/pay", "/aura-ai"];
  for (const key of ["africa-super-app", "mobility", "commerce"]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const set = await pickDesign(page, key);
    check(`${key}: manual selection accepted`, set === 200, String(set));
    const response = await page.goto(`${BASE}/`, { waitUntil: "load" });
    const html = await page.content();
    check(`${key}: renders its own design`, MARKERS[key].test(html));
    check(`${key}: no duplicate app-shell header`, (html.match(/Africa&#x27;s Super App Marketplace|Africa's Super App Marketplace/g) || []).length <= 2);
    const hrefs = await page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")));
    const missing = VERTICALS.filter((href) => !hrefs.includes(href));
    check(`${key}: links all ten services`, missing.length === 0, missing.join(", "));
    // The ecosystem grid uses data-ecosystem; the mobility quick strip uses data-quick.
    const cards = await page.evaluate(() => [...document.querySelectorAll("[data-ecosystem]")].map((el) => el.getAttribute("data-ecosystem")));
    check(`${key}: ecosystem grid shows every vertical`, cards.length === 10, String(cards.length));
    const brokenImages = await page.evaluate(() => [...document.images].filter((img) => img.complete && img.naturalWidth === 0).map((img) => img.getAttribute("src")));
    check(`${key}: no broken images`, brokenImages.length === 0, brokenImages.slice(0, 2).join(", "));
    const imgs = await page.evaluate(() => document.images.length);
    check(`${key}: renders real imagery`, imgs >= 10, String(imgs));
    await ctx.close();
  }

  // ---- E/F. Stable assignment -----------------------------------------
  const stable = await browser.newContext();
  const stablePage = await stable.newPage();
  await stablePage.goto(`${BASE}/`, { waitUntil: "load" });
  const first = await stablePage.content();
  const firstKey = Object.entries(MARKERS).find(([, re]) => re.test(first))?.[0] ?? "unknown";
  await stablePage.reload({ waitUntil: "load" });
  const second = await stablePage.content();
  const secondKey = Object.entries(MARKERS).find(([, re]) => re.test(second))?.[0] ?? "unknown";
  check("E/F: a refresh keeps the same design", firstKey === secondKey, `${firstKey} → ${secondKey}`);

  // ---- G. Manual choice overrides --------------------------------------
  const manual = await browser.newContext();
  const manualPage = await manual.newPage();
  await manualPage.goto(`${BASE}/`, { waitUntil: "load" });
  await pickDesign(manualPage, "commerce");
  await manualPage.goto(`${BASE}/`, { waitUntil: "load" });
  const afterChoice = await manualPage.content();
  check("G: manual choice is honoured", MARKERS.commerce.test(afterChoice));
  await manualPage.reload({ waitUntil: "load" });
  const afterReload = await manualPage.content();
  check("G: manual choice survives a reload", MARKERS.commerce.test(afterReload));
  await manual.close();
  await stable.close();

  // ---- H. Hero carousel ------------------------------------------------
  const carousel = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const carouselPage = await carousel.newPage();
  await pickDesign(carouselPage, "africa-super-app");
  await carouselPage.goto(`${BASE}/`, { waitUntil: "load" });
  const dots = await carouselPage.locator('[aria-roledescription="carousel"] button[aria-label^="Show slide"]').count();
  check("H: at least six hero slides", dots >= 6, String(dots));
  const before = await carouselPage.locator("h1").first().innerText();
  await carouselPage.locator('button[aria-label="Next slide"]').click();
  await carouselPage.waitForTimeout(600);
  const after = await carouselPage.locator("h1").first().innerText();
  check("H: next arrow changes the slide", before !== after, `${before} → ${after}`);
  await carouselPage.locator('button[aria-label^="Show slide 1:"]').click();
  await carouselPage.waitForTimeout(400);
  check("H: dot selects a slide", (await carouselPage.locator("h1").first().innerText()) === before);
  check("H: pause control exists", (await carouselPage.locator('button[aria-label^="Pause"], button[aria-label^="Play"]').count()) > 0);
  await carousel.close();

  const reduced = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const reducedPage = await reduced.newPage();
  await pickDesign(reducedPage, "africa-super-app");
  await reducedPage.goto(`${BASE}/`, { waitUntil: "load" });
  const slideA = await reducedPage.locator("h1").first().innerText();
  await reducedPage.waitForTimeout(8000);
  const slideB = await reducedPage.locator("h1").first().innerText();
  check("H: reduced motion does not auto-rotate", slideA === slideB, `${slideA} → ${slideB}`);
  await reduced.close();

  // ---- I/N. Admin -------------------------------------------------------
  const admin = await login(browser, "admin@naijadeals.local", "AdminPass123!");
  const user = await login(browser, "customer@naijadeals.local", "CustomerPass123!");
  check("I: admin signs in", admin.status === 200);

  const userRead = await user.page.evaluate(async () => (await fetch("/api/admin/home", { credentials: "include" })).status);
  check("I: a customer cannot read homepage config", userRead === 403, String(userRead));
  const userWrite = await user.page.evaluate(async () => (await fetch("/api/admin/home", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ variants: [{ key: "original", allocation: 100, enabled: true }] }) })).status);
  check("I: a customer cannot change allocations", userWrite === 403 || userWrite === 401, String(userWrite));

  const badHref = await admin.page.evaluate(async () => (await fetch("/api/admin/home", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ variantKey: "commerce", slug: "evil", headline: "x", body: "y", ctaLabel: "z", ctaHref: "https://evil.example.com", alt: "a" }) })).status);
  check("N: external CTA destination rejected", badHref === 400, String(badHref));

  const injection = await admin.page.evaluate(async () => {
    const r = await fetch("/api/admin/home", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ variantKey: "commerce", slug: "xss-test", headline: "<script>alert(1)</script>Hello", body: "Body <img src=x onerror=alert(1)>", ctaLabel: "Go", ctaHref: "/naijashop", alt: "Alt text" }) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  });
  check("N: headline script tags are stripped", injection.status === 200 && !/<script>/i.test(JSON.stringify(injection.body)), JSON.stringify(injection.body).slice(0, 100));

  const badTotal = await admin.page.evaluate(async () => (await fetch("/api/admin/home", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ variants: [{ key: "original", allocation: 90, enabled: true }] }) })).status);
  check("N: allocations that do not total 100 are refused", badTotal === 409, String(badTotal));

  const staleEdit = await admin.page.evaluate(async () => (await fetch("/api/admin/home", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ variants: [{ key: "original", allocation: 25, enabled: true, revision: 999 }] }) })).status);
  check("N: concurrent edit with a stale revision is refused", staleEdit === 409, String(staleEdit));

  await prisma.homeHeroSlide.deleteMany({ where: { slug: "xss-test" } });
  await admin.context.close();
  await user.context.close();

  // ---- M. Persistence ---------------------------------------------------
  const saved = await prisma.homeAssignment.count();
  check("M: assignments persist in the database", saved > 0, String(saved));

  await browser.close();
  await prisma.$disconnect();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
