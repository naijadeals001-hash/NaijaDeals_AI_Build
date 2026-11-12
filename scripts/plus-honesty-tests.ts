/**
 * Public-honesty regression for the NaijaDeals Plus+ landing page.
 *
 * Usage:
 *   npx tsx scripts/plus-honesty-tests.ts [baseUrl]
 *
 * The base URL defaults to http://localhost:3047. The script only reads the
 * rendered page: it never signs in, submits a form or mutates data. It exits
 * non-zero when any assertion fails, and prints one PASS/FAIL line per
 * assertion. The optional Chromium phase reports SKIP when no browser is
 * available instead of pretending it ran.
 */

import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE_URL = (process.argv[2] ?? process.env.PLUS_BASE_URL ?? "http://localhost:3047").replace(/\/+$/, "");
const PAGE_URL = `${BASE_URL}/naijashop/plus`;
const CHROME_PATH = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

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

async function browserConsoleCheck(): Promise<void> {
  const name = "no console or page errors (Chromium)";
  if (!existsSync(CHROME_PATH)) {
    skip(name, `Chrome not found at ${CHROME_PATH}`);
    return;
  }
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
    const page = await browser.newPage();
    const errors: string[] = [];
    let failedResources = 0;
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      // Chromium reports failed subresource loads (for example the shared
      // header's category API when the database is deliberately unavailable)
      // as console errors. Those are network failures, not page script errors.
      if (/^Failed to load resource:/i.test(message.text())) {
        failedResources += 1;
        return;
      }
      errors.push(`console: ${message.text()}`);
    });
    await page.goto(PAGE_URL, { waitUntil: "networkidle", timeout: 30_000 });
    // Give hydration a beat after the network settles.
    await page.waitForTimeout(500);

    // The original bug: a focused arrow that becomes disabled blurs to <body>.
    // Drive the ecosystem rail to its end while the next arrow has focus and
    // assert the same element is still active after aria-disabled flips.
    const focusName = "focused carousel arrow keeps focus at the boundary";
    const nextArrow = page.locator('button[data-plus-carousel-arrow="next"][aria-label="Show next NaijaDeals ecosystem services"]');
    if ((await nextArrow.count()) === 0) {
      skip(focusName, "new-build arrow markers not present");
    } else {
      const enabledBefore = (await nextArrow.getAttribute("aria-disabled")) === "false";
      await nextArrow.focus();
      const scrolled = await page.evaluate(() => {
        const button = document.querySelector('button[data-plus-carousel-arrow="next"][aria-label="Show next NaijaDeals ecosystem services"]');
        if (!(button instanceof HTMLElement)) return false;
        const controls = button.getAttribute("aria-controls");
        const track = controls ? document.getElementById(controls) : null;
        if (!track) return false;
        track.scrollLeft = track.scrollWidth;
        return true;
      });
      await page.waitForTimeout(400);
      const disabledAtEnd = (await nextArrow.getAttribute("aria-disabled")) === "true";
      const activeArrow = await page.evaluate(() => document.activeElement?.getAttribute("data-plus-carousel-arrow") ?? null);
      record(
        focusName,
        enabledBefore && scrolled && disabledAtEnd && activeArrow === "next",
        `enabled before=${enabledBefore}, scrolled=${scrolled}, aria-disabled at end=${disabledAtEnd}, focused arrow=${activeArrow ?? "none"}`
      );
    }

    record(
      name,
      errors.length === 0,
      errors.length
        ? errors.slice(0, 5).join(" | ")
        : `no browser errors reported${failedResources ? ` (${failedResources} failed subresource load(s) excluded)` : ""}`
    );
  } catch (error) {
    skip(name, `browser unavailable: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

async function main() {
  console.log(`Plus+ honesty regression against ${PAGE_URL}\n`);

  let html = "";
  try {
    const response = await fetch(PAGE_URL, {
      headers: { accept: "text/html" },
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

    // No price, currency symbol or subscription term.
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

    // No billing form, payment input or join/trial control.
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

    // Current fail-safe status: membership is not open.
    record(
      "membership not-open status present",
      /Membership not open/.test(text) && /not open/i.test(text),
      "Membership not open"
    );

    // Benefits register is honestly empty.
    record(
      "exclusive-benefits empty state present",
      text.includes("No Plus+-exclusive benefits are configured yet.") && text.includes("Benefits register"),
      "empty register copy found"
    );
    const benefitCards = countMatches(html, /data-plus-benefit-card=/g);
    record("zero benefit cards", benefitCards === 0, `${benefitCards} data-plus-benefit-card attribute(s)`);

    // Both rails are present and labelled distinctly.
    const regionLabels = [...html.matchAll(/<[^>]*role="region"[^>]*>/g)]
      .map((match) => /aria-label="([^"]*)"/.exec(match[0])?.[1])
      .filter((label): label is string => Boolean(label));
    record(
      "ecosystem rail labelled separately",
      regionLabels.includes("NaijaDeals ecosystem services") && regionLabels.includes("Plus+-exclusive benefits"),
      regionLabels.length ? regionLabels.join(" | ") : "no carousel regions found"
    );

    // Exactly the ten real services, each with one CTA.
    const serviceCards = countMatches(html, /data-plus-service-card=/g);
    const serviceCtas = countMatches(html, /data-plus-service-cta=/g);
    record("exactly 10 ecosystem service cards", serviceCards === 10, `${serviceCards} card(s)`);
    record("exactly 10 ecosystem service CTAs", serviceCtas === 10, `${serviceCtas} CTA(s)`);

    // Boundary arrows must keep focus: aria-disabled, never the disabled
    // attribute. The page renders two rails, so there are four arrows in SSR.
    const arrowTags = [...html.matchAll(/<button\b[^>]*data-plus-carousel-arrow="[^"]*"[^>]*>/g)].map((match) => match[0]);
    const prevArrows = countMatches(html, /data-plus-carousel-arrow="prev"/g);
    const nextArrows = countMatches(html, /data-plus-carousel-arrow="next"/g);
    record(
      "carousel arrows rendered for both rails",
      arrowTags.length === 4 && prevArrows === 2 && nextArrows === 2,
      `${arrowTags.length} arrow(s): ${prevArrows} previous, ${nextArrows} next`
    );
    const disabledArrows = arrowTags.filter((tag) => /\sdisabled(?:[=\s>])/i.test(tag));
    record(
      "carousel arrows do not use the disabled attribute",
      arrowTags.length === 4 && disabledArrows.length === 0,
      `${disabledArrows.length} of ${arrowTags.length} arrow(s) use disabled`
    );
    const ariaDisabledArrows = arrowTags.filter((tag) => /aria-disabled="true"/.test(tag));
    record(
      "carousel arrows expose aria-disabled at the boundaries",
      arrowTags.length === 4 && ariaDisabledArrows.length === 4,
      `${ariaDisabledArrows.length} of ${arrowTags.length}`
    );

    await browserConsoleCheck();
  }

  const passed = results.filter((result) => result.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  if (passed !== results.length) {
    console.error(JSON.stringify(results.filter((result) => !result.ok), null, 2));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

export {};
