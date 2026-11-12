#!/usr/bin/env node
/**
 * Public Plus+ carousel and responsive accessibility acceptance.
 *
 * Run against a server pointed at the same verified TEST database:
 *   TEST_DATABASE_URL=postgresql://... PLUS_BASE_URL=http://localhost:3048 \
 *     node scripts/plus-carousel-a11y.cjs
 *
 * The script verifies the database marker before writing run-tagged fixture
 * cards. It checks:
 *   - a non-overflowing rail renders zero arrows;
 *   - an overflowing rail renders two arrows, with aria-disabled at the
 *     boundary and focus retained;
 *   - keyboard Home/End/Arrow scroll the focused track;
 *   - the document does not overflow horizontally at 320/390/768/1440;
 *   - every in-page CTA and hash target is reachable.
 *
 * Fixtures are deleted in a finally block. Playwright is optional; a missing
 * browser is reported as a skip, never as a pass.
 */
"use strict";

const { Client } = require("pg");

const BASE = (process.env.PLUS_BASE_URL || "").replace(/\/+$/, "");
const DB_URL = process.env.TEST_DATABASE_URL || process.env.NAIJADEALS_TEST_DATABASE_URL || "";
const CHROME_PATH = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const RUN = `plus-carousel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const REDIRECTS = new Set([307, 308]);

if (!BASE) {
  console.error("PLUS_BASE_URL is required (for example http://localhost:3048).");
  process.exit(2);
}
if (!DB_URL) {
  console.error("TEST_DATABASE_URL is required; DATABASE_URL is never used as a fallback.");
  process.exit(2);
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}
function skip(name, detail) {
  console.log(`SKIP  ${name} — ${detail}`);
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
async function check(name, fn) {
  try {
    const detail = await fn();
    record(name, true, detail);
  } catch (error) {
    record(name, false, error instanceof Error ? error.message : String(error));
  }
}

async function connectVerified() {
  const client = new Client({ connectionString: DB_URL, application_name: "plus-carousel-a11y" });
  await client.connect();
  const identity = await client.query("select current_database() as database");
  const database = identity.rows[0].database;
  if (/^(naijadeals_core|postgres|template0|template1)$/i.test(database)) {
    throw new Error(`refusing to run against ${database}`);
  }
  const marker = await client.query('select classification from "DatabaseClassification" where id = $1', ["default"]);
  if (marker.rows[0]?.classification !== "TEST") {
    throw new Error("target database is not classified TEST");
  }
  return { client, database };
}

async function insertCards(client, count, start = 0) {
  for (let offset = 0; offset < count; offset += 1) {
    const index = start + offset;
    await client.query(
      `insert into "PlusContentCard"
        (id, key, title, description, "imageUrl", "imageAlt", href, "sortOrder", status, language, countries, "createdAt", "updatedAt")
       values ($1,$2,$3,$4,$5,$6,$7,$8,'PUBLISHED','en',ARRAY[]::text[],NOW(),NOW())
       on conflict (key) do nothing`,
      [
        `${RUN}-card-${index}`,
        `${RUN}-card-${index}`,
        `Awareness card ${index + 1}`,
        "A run-tagged fixture card used to verify carousel overflow and keyboard behaviour.",
        "/generated/shop/hero-desktop.webp",
        "Shopper carrying paper bags at an outdoor market",
        "/naijashop",
        index * 10
      ]
    );
  }
}

async function deleteCards(client) {
  await client.query('delete from "PlusContentCard" where key like $1', [`${RUN}%`]).catch(() => undefined);
}

async function scrollState(page) {
  return page.evaluate(() => {
    const track = document.querySelector("[data-plus-carousel-track]");
    if (!(track instanceof HTMLElement)) return null;
    return {
      left: Math.abs(track.scrollLeft),
      max: Math.max(0, track.scrollWidth - track.clientWidth),
      activeIsTrack: document.activeElement === track
    };
  });
}

async function main() {
  const { client, database } = await connectVerified();
  let browser = null;
  try {
    console.log(`Plus+ carousel acceptance against ${BASE} (database=${database}, run=${RUN})\n`);
    await deleteCards(client);

    let chromium;
    try {
      ({ chromium } = require("playwright"));
    } catch {
      ({ chromium } = require("playwright-core"));
    }
    const launchOptions = { headless: true };
    try {
      if (require("fs").existsSync(CHROME_PATH)) launchOptions.executablePath = CHROME_PATH;
    } catch {
      /* use Playwright's bundled browser */
    }
    browser = await chromium.launch(launchOptions);
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    await page.goto(`${BASE}/naijashop/plus`, { waitUntil: "networkidle", timeout: 30_000 });

    await insertCards(client, 1);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(800);

    await check("non-overflowing rail renders zero arrows", async () => {
      const cards = await page.locator("[data-plus-awareness-card]").count();
      const arrows = await page.locator("[data-plus-carousel-arrow]").count();
      assert(cards === 1, `expected one awareness card, found ${cards}`);
      assert(arrows === 0, `expected zero arrows, found ${arrows}`);
      return `cards=1 arrows=0`;
    });

    await insertCards(client, 5, 1);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector("[data-plus-carousel-controls]", { timeout: 10_000 });
    await page.waitForTimeout(400);

    await check("overflowing rail renders two arrows with boundary aria-disabled", async () => {
      const cards = await page.locator("[data-plus-awareness-card]").count();
      const arrows = await page.locator("[data-plus-carousel-arrow]").count();
      const prev = await page.locator('[data-plus-carousel-arrow="prev"]').getAttribute("aria-disabled");
      const next = await page.locator('[data-plus-carousel-arrow="next"]').getAttribute("aria-disabled");
      assert(cards === 6, `expected six awareness cards, found ${cards}`);
      assert(arrows === 2, `expected two arrows, found ${arrows}`);
      assert(prev === "true", `previous arrow aria-disabled=${prev}`);
      assert(next === "false", `next arrow aria-disabled=${next}`);
      return `cards=6 arrows=2 prev=${prev} next=${next}`;
    });

    await check("keyboard Home/End/Arrow move the focused track", async () => {
      const track = page.locator("[data-plus-carousel-track]");
      await track.focus();
      await page.keyboard.press("End");
      await page.waitForTimeout(500);
      const atEnd = await scrollState(page);
      assert(atEnd && atEnd.max > 0, "rail does not overflow");
      assert(atEnd.left > atEnd.max * 0.8, `End moved to ${atEnd.left} of ${atEnd.max}`);
      assert(atEnd.activeIsTrack, "focus left the track after End");

      await page.keyboard.press("Home");
      await page.waitForTimeout(500);
      const atStart = await scrollState(page);
      assert(atStart && atStart.left <= 2, `Home moved to ${atStart.left}`);
      assert(atStart.activeIsTrack, "focus left the track after Home");

      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(500);
      const afterRight = await scrollState(page);
      assert(afterRight && afterRight.left > 2, "ArrowRight did not scroll the track");
      assert(afterRight.activeIsTrack, "focus left the track after ArrowRight");
      return `max=${atEnd.max} end=${atEnd.left} start=${atStart.left} afterRight=${afterRight.left}`;
    });

    await check("focused arrow keeps focus when the boundary disables it", async () => {
      const next = page.locator('[data-plus-carousel-arrow="next"]');
      await next.focus();
      await page.evaluate(() => {
        const track = document.querySelector("[data-plus-carousel-track]");
        if (track instanceof HTMLElement) track.scrollLeft = track.scrollWidth;
      });
      await page.waitForTimeout(500);
      const disabled = await next.getAttribute("aria-disabled");
      const active = await page.evaluate(() => document.activeElement?.getAttribute("data-plus-carousel-arrow") ?? null);
      assert(disabled === "true", `next arrow aria-disabled=${disabled}`);
      assert(active === "next", `focused arrow=${active}`);
      return `aria-disabled=true focused=next`;
    });

    for (const width of [320, 390, 768, 1440]) {
      await check(`no document horizontal overflow at ${width}px`, async () => {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(500);
        const overflow = await page.evaluate(() => {
          const root = document.documentElement;
          const body = document.body;
          return {
            root: root.scrollWidth - root.clientWidth,
            body: body ? body.scrollWidth - body.clientWidth : 0
          };
        });
        assert(overflow.root <= 1 && overflow.body <= 1, `root overflow=${overflow.root} body overflow=${overflow.body}`);
        return `root=${overflow.root} body=${overflow.body}`;
      });
    }

    await check("every in-page CTA resolves to 200/307 or a real hash target", async () => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      const hrefs = await page.$$eval("a[href]", (anchors) =>
        [...new Set(anchors.map((anchor) => anchor.getAttribute("href") || ""))]
      );
      const failures = [];
      const checked = [];
      for (const href of hrefs) {
        if (!href) continue;
        if (href.startsWith("#")) {
          const exists = await page.evaluate((id) => Boolean(document.getElementById(id.slice(1))), href);
          if (!exists) failures.push(`${href} target missing`);
          checked.push(href);
          continue;
        }
        if (href.startsWith("/")) {
          const url = new URL(href.split("#")[0] || "/", BASE).toString();
          const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
          if (response.status !== 200 && !REDIRECTS.has(response.status)) {
            failures.push(`${href} -> ${response.status}`);
          }
          checked.push(`${href} ${response.status}`);
          // Return the browser to the fixture page if a redirect navigation replaced it.
          if (!page.url().includes("/naijashop/plus")) {
            await page.goto(`${BASE}/naijashop/plus`, { waitUntil: "networkidle", timeout: 30_000 });
            await page.waitForSelector("[data-plus-carousel-controls]", { timeout: 10_000 });
          }
          continue;
        }
        if (/^https:\/\//i.test(href)) {
          // The page has no external CTA by default; if one is published, verify
          // it rather than silently ignoring it.
          try {
            const response = await fetch(href, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
            if (response.status !== 200 && !REDIRECTS.has(response.status)) failures.push(`${href} -> ${response.status}`);
            checked.push(`${href} ${response.status}`);
          } catch {
            failures.push(`${href} unreachable`);
          }
        }
      }
      assert(failures.length === 0, failures.join(" | "));
      return `${checked.length} CTA(s): ${checked.slice(0, 8).join(", ")}${checked.length > 8 ? ", …" : ""}`;
    });

    return { database };
  } finally {
    await deleteCards(client).catch(() => undefined);
    await client.end().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}

main()
  .then((result) => {
    const passed = results.filter((row) => row.ok).length;
    console.log(`\n${passed}/${results.length} checks passed`);
    console.log(`database=${result?.database ?? "?"} run=${RUN}`);
    if (passed !== results.length) process.exitCode = 1;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
