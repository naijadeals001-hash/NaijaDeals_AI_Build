/**
 * Public-honesty regression for the NaijaDeals Plus+ landing page.
 *
 * Usage:
 *   npx tsx scripts/plus-honesty-tests.ts [baseUrl]
 *   npx tsx scripts/plus-honesty-tests.ts [baseUrl] --configured
 *
 * The base URL defaults to http://localhost:3047. The script only reads the
 * rendered page: it never signs in, submits a form or mutates data.
 *
 * The default run targets a database with no active Plus+ plan. It discovers the
 * published awareness content from the page's own data-* markers instead of
 * assuming a fixed card count, and it checks each rendered carousel against its
 * actual overflow rather than expecting a fixed number of arrows.
 *
 * Tests that require a configured plan (an available country and an open
 * membership) are opt-in with `--configured` or PLUS_EXPECT_CONFIGURED=1.
 */
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE_URL = (process.argv[2] ?? process.env.PLUS_BASE_URL ?? "http://localhost:3047").replace(/\/+$/, "");
const PAGE_URL = `${BASE_URL}/naijashop/plus`;
const CHROME_PATH = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EXPECT_CONFIGURED = process.argv.includes("--configured") || process.env.PLUS_EXPECT_CONFIGURED === "1";

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];

function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

function skip(name: string, detail: string) {
  console.log(`SKIP  ${name} — ${detail}`);
}

function countMatches(haystack: string, pattern: RegExp): number {
  return [...haystack.matchAll(pattern)].length;
}

/** Visible text only: drop RSC payloads, styles, tags and escaped entities. */
function visibleText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;|&#39;/gi, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/\s+/g, " ")
    .trim();
}

/** Text of every anchor and button, used to prove there is no join/trial CTA. */
function controlTexts(html: string): string[] {
  return [...html.matchAll(/<(a|button)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((match) => visibleText(match[2]));
}

async function main() {
  console.log(`Plus+ honesty regression against ${PAGE_URL}${EXPECT_CONFIGURED ? " (configured-plan mode)" : ""}\n`);

  let html = "";
  try {
    const response = await fetch(PAGE_URL, {
      headers: { accept: "text/html", "cache-control": "no-cache" },
      signal: AbortSignal.timeout(20_000)
    });
    record("page responds with HTTP 200", response.status === 200, `HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") ?? "";
    record("response is HTML", contentType.includes("text/html"), contentType || "missing content-type");
    html = await response.text();
  } catch (error) {
    record("page fetch", false, error instanceof Error ? error.message : String(error));
  }

  if (html) {
    const text = visibleText(html);
    const controls = controlTexts(html);

    if (!EXPECT_CONFIGURED) {
      record("no currency symbol", !/[₦$€£]/.test(text), "checked ₦, $, € and £ in visible text");
      record(
        "no currency price amount",
        !/\b(?:NGN|GHS|KES|ZAR|GBP|USD|EUR)\s*\d[\d,.]*/i.test(text),
        "no currency code followed by an amount"
      );
      record(
        "no subscription term price",
        !/\d[\d,.]*\s*(?:per|\/)\s*(?:month|mo|year|yr|annum)\b/i.test(text),
        "no amount per month/year"
      );
    } else {
      skip("no price/currency amount", "configured plans may publish a real price");
    }

    // No billing form, payment input or join/trial control in any mode.
    const billingForms = [...html.matchAll(/<form\b[^>]*>/gi)]
      .map((match) => match[0])
      .filter((tag) => /action="[^"]*(?:checkout|billing|subscribe|plus)/i.test(tag));
    record("no subscription or billing form", billingForms.length === 0, billingForms.length ? billingForms.join(" | ") : "none found");

    const paymentInputs = [...html.matchAll(/<input\b[^>]*>/gi)]
      .map((match) => match[0])
      .filter((tag) => /type="(?:email|password|tel)"|name="(?:card|email|phone|plan)/i.test(tag));
    record("no payment or signup input fields", paymentInputs.length === 0, paymentInputs.length ? paymentInputs.join(" | ") : "none found");

    const joinPattern = /\b(?:join|subscribe|start (?:a |your )?(?:free )?trial|free trial|buy plus|upgrade|pre-?register|waitlist)\b/i;
    const joinControl = controls.find((label) => joinPattern.test(label));
    record("no join, trial or subscribe control", !joinControl, joinControl ? `found control: ${joinControl}` : "none found");

    if (!EXPECT_CONFIGURED) {
      record(
        "membership not-open status present",
        /Membership not open/.test(text) && /not open/i.test(text),
        "Membership not open"
      );
      record(
        "exclusive-benefits empty state present",
        (text.includes("No Plus+ member benefits are configured yet.") ||
          text.includes("No Plus+-exclusive benefits are configured yet.")) &&
          text.includes("Benefits register"),
        "empty register copy found"
      );
      const benefitCards = countMatches(html, /data-plus-benefit-card=/g);
      record("zero benefit cards", benefitCards === 0, `${benefitCards} data-plus-benefit-card attribute(s)`);
    } else {
      skip("membership not-open status", "configured-plan mode; this run checks the open state instead");
      skip("exclusive-benefits empty state", "a configured plan may publish benefits");
    }

    // The old test expected four arrows from two fixed rails. The new contract
    // is data-driven: each rendered rail is checked below against its own
    // overflow, and empty sections render no carousel at all.
    const awarenessCards = countMatches(html, /data-plus-awareness-card=/g);
    const awarenessCtas = countMatches(html, /data-plus-awareness-cta=/g);
    const awarenessEmpty = countMatches(html, /data-plus-empty-state="awareness-empty"/g);
    record(
      "awareness section renders configured cards or an honest empty state",
      awarenessCards > 0 ? awarenessCtas === awarenessCards : awarenessEmpty === 1,
      awarenessCards > 0
        ? `${awarenessCards} published card(s), ${awarenessCtas} CTA(s) discovered from page markers`
        : `zero cards; honest awareness empty state count=${awarenessEmpty}`
    );
  }

  const name = "no console or page errors (Chromium)";
  if (!existsSync(CHROME_PATH)) {
    record(name, false, `Chrome not found at ${CHROME_PATH}`);
  } else {
    let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
    try {
      browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
        reducedMotion: "reduce"
      });
      const errors: string[] = [];
      let failedResources = 0;
      page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        if (/^Failed to load resource:/i.test(message.text())) {
          failedResources += 1;
          return;
        }
        errors.push(`console: ${message.text()}`);
      });

      await page.goto(PAGE_URL, { waitUntil: "networkidle", timeout: 30_000 });
      await page.waitForTimeout(700);

      record("Plus+ page marker present", (await page.locator("[data-plus-page]").count()) === 1, "data-plus-page");

      const bodyText = await page.locator("body").innerText();
      if (!EXPECT_CONFIGURED) {
        record("rendered membership not-open status", /membership not open/i.test(bodyText), "Membership not open");
        record(
          "rendered exclusive-benefits empty state",
          (await page.locator('[data-plus-empty-state="benefits-empty"]').count()) === 1 &&
            (await page.locator("[data-plus-benefit-card]").count()) === 0,
          "benefits-empty state with zero benefit cards"
        );

        const countryCards = page.locator("[data-plus-country]");
        const countryCount = await countryCards.count();
        let allNotAvailable = countryCount > 0;
        const failures: string[] = [];
        for (let index = 0; index < countryCount; index += 1) {
          const country = countryCards.nth(index);
          const code = (await country.getAttribute("data-plus-country")) ?? "?";
          const status = await country.getAttribute("data-plus-country-status");
          const copy = await country.innerText();
          if (status !== "not_available" || !/not yet available/i.test(copy)) {
            allNotAvailable = false;
            failures.push(`${code}: status=${status ?? "none"} copy=${copy.replace(/\s+/g, " ").slice(0, 60)}`);
          }
        }
        record(
          "every country is Not yet available without an active plan",
          allNotAvailable,
          failures.length ? failures.join(" | ") : `${countryCount} country card(s), all not_available`
        );
        skip(
          "configured-plan availability checks",
          "pass --configured or set PLUS_EXPECT_CONFIGURED=1 against a database with an active plan"
        );
      } else {
        const open = /membership open/i.test(bodyText);
        const available = await page.locator('[data-plus-country-status="available"]').count();
        record("configured-plan mode shows membership open", open, open ? "Membership open" : "not open");
        record("configured-plan mode has at least one available country", available > 0, `${available} available country card(s)`);
      }

      const cards = page.locator("[data-plus-awareness-card]");
      const cardCount = await cards.count();
      if (cardCount > 0) {
        const emptyCount = await page.locator('[data-plus-empty-state="awareness-empty"]').count();
        let populated = emptyCount === 0;
        const failures: string[] = [];
        for (let index = 0; index < cardCount; index += 1) {
          const card = cards.nth(index);
          const key = (await card.getAttribute("data-plus-awareness-card")) ?? `#${index}`;
          const images = await card.locator("img").count();
          const ctas = await card.locator("[data-plus-awareness-cta]").count();
          const alt = images > 0 ? await card.locator("img").first().getAttribute("alt") : null;
          if (images !== 1 || !alt?.trim() || ctas !== 1) {
            populated = false;
            failures.push(`${key}: images=${images} alt=${alt ? "present" : "missing"} ctas=${ctas}`);
          }
        }
        record(
          "awareness cards are configured content, not an empty placeholder",
          populated,
          failures.length ? failures.join(" | ") : `${cardCount} card(s) with image alt and CTA`
        );
      } else {
        record(
          "awareness empty state present when no cards are published",
          (await page.locator('[data-plus-empty-state="awareness-empty"]').count()) === 1,
          "awareness-empty state"
        );
      }

      // Each rail is checked against its own overflow. A rail that fits must
      // have zero arrows; an overflowing rail must have two focusable arrows.
      const regions = page.locator("[data-plus-carousel]");
      const regionCount = await regions.count();
      if (regionCount === 0) {
        record(
          "zero carousel arrows when no carousel overflows",
          (await page.locator("[data-plus-carousel-arrow]").count()) === 0,
          "no carousels rendered; zero arrows"
        );
      } else {
        const failures: string[] = [];
        for (let index = 0; index < regionCount; index += 1) {
          const region = regions.nth(index);
          const label = (await region.getAttribute("aria-label")) ?? `rail ${index + 1}`;
          const overflow = await region.evaluate((element) => {
            const track = element.querySelector("[data-plus-carousel-track]");
            if (!(track instanceof HTMLElement)) return null;
            return Math.max(0, track.scrollWidth - track.clientWidth);
          });
          if (overflow === null) {
            failures.push(`${label}: track missing`);
            continue;
          }
          const arrows = await region.locator("[data-plus-carousel-arrow]").count();
          if (overflow <= 2 && arrows !== 0) failures.push(`${label}: fits (${overflow}px) but has ${arrows} arrow(s)`);
          if (overflow > 2 && arrows !== 2) failures.push(`${label}: overflows (${overflow}px) but has ${arrows} arrow(s)`);
          if (arrows > 0) {
            const disabledAttributes = await region.locator("[data-plus-carousel-arrow][disabled]").count();
            if (disabledAttributes > 0) failures.push(`${label}: arrow uses the disabled attribute`);
          }
        }
        record(
          "arrow count matches each rail's actual overflow",
          failures.length === 0,
          failures.length ? failures.join(" | ") : `${regionCount} rail(s) matched overflow rules`
        );

        // Focus retention at a boundary, when an overflowing rail exists.
        let focusChecked = false;
        for (let index = 0; index < regionCount && !focusChecked; index += 1) {
          const region = regions.nth(index);
          const overflow = await region.evaluate((element) => {
            const track = element.querySelector("[data-plus-carousel-track]");
            if (!(track instanceof HTMLElement)) return 0;
            return Math.max(0, track.scrollWidth - track.clientWidth);
          });
          if (overflow <= 2) continue;
          const next = region.locator('[data-plus-carousel-arrow="next"]');
          if ((await next.count()) !== 1) continue;
          const enabledBefore = (await next.getAttribute("aria-disabled")) === "false";
          await next.focus();
          await region.evaluate((element) => {
            const track = element.querySelector("[data-plus-carousel-track]");
            if (track instanceof HTMLElement) track.scrollLeft = track.scrollWidth;
          });
          await page.waitForTimeout(400);
          const disabledAtEnd = (await next.getAttribute("aria-disabled")) === "true";
          const activeArrow = await page.evaluate(
            () => document.activeElement?.getAttribute("data-plus-carousel-arrow") ?? null
          );
          record(
            "focused carousel arrow keeps focus at the boundary",
            enabledBefore && disabledAtEnd && activeArrow === "next",
            `enabled before=${enabledBefore}, aria-disabled at end=${disabledAtEnd}, focused arrow=${activeArrow ?? "none"}`
          );
          focusChecked = true;
        }
        if (!focusChecked) skip("focused carousel arrow keeps focus at the boundary", "no overflowing rail with arrows");
      }

      record(
        name,
        errors.length === 0,
        errors.length
          ? errors.slice(0, 5).join(" | ")
          : `no browser errors reported${failedResources ? ` (${failedResources} failed subresource load(s) excluded)` : ""}`
      );
    } catch (error) {
      record(name, false, `browser unavailable: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await browser?.close().catch(() => undefined);
    }
  }

  const passed = results.filter((result) => result.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  if (passed !== results.length) {
    console.error(JSON.stringify(results.filter((result) => !result.ok), null, 2));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

export {};
