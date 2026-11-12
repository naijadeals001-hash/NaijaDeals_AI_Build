#!/usr/bin/env node
"use strict";

/**
 * Shop header + All drawer catalogue regression tests.
 *
 * Proves the Marketplace header survives both the live catalogue and a large
 * synthetic catalogue (68 deterministic departments injected at the network
 * edge, no database writes):
 *
 *  1. /naijashop/plus at 1440 keeps a bounded sticky header, the page content
 *     below stays clickable and the document never scrolls sideways.
 *  2. The department rail stays one horizontally scrollable row and the All
 *     drawer still lists every department.
 *  3. 390 and 768 keep a static header, an opening All drawer and focus return.
 *  4. The rail is a named, keyboard-reachable region and every department in it
 *     is a link. Landmark names stay unique.
 *
 * The test never injects CSS. "No page-wide clipping" is checked against the
 * computed styles of html, body and the rail's ancestors, so a fake bounded
 * header produced by hiding overflow would fail.
 *
 * Usage:
 *   node scripts/shop-header-catalogue-tests.cjs
 *   BASE_URL=http://localhost:3047 HEADED=1 node scripts/shop-header-catalogue-tests.cjs
 *
 * Environment:
 *   BASE_URL         Preview origin (default http://localhost:3047).
 *   HEADED=1         Show the browser.
 *   BROWSER_PATH     Explicit Chromium/Chrome executable.
 *   SKIP_ARTIFACTS=1 Do not write screenshots to qa-artifacts/.
 *   ARTIFACT_DIR     Screenshot directory override.
 */

const { chromium } = require("playwright");
const path = require("node:path");
const fs = require("node:fs");

const BASE_URL = (process.env.BASE_URL || "http://localhost:3047").replace(/\/+$/, "");
const HEADED = process.env.HEADED === "1";
const BROWSER_PATH = process.env.BROWSER_PATH || "";
const SKIP_ARTIFACTS = process.env.SKIP_ARTIFACTS === "1";
const ARTIFACT_DIR = process.env.ARTIFACT_DIR || path.join(process.cwd(), "qa-artifacts", "shop-header-catalogue");

const SYNTHETIC_COUNT = 68;
const HEADER_MAX_HEIGHT = 200;
const RAIL_MAX_HEIGHT = 64;

const SYNTHETIC_CATEGORIES = Array.from({ length: SYNTHETIC_COUNT }, (_, index) => {
  const number = String(index + 1).padStart(2, "0");
  return {
    id: `synthetic-dept-${number}`,
    name: `Synthetic Department ${number} Long Form`,
    slug: `synthetic-department-${number}`,
    description: null,
    imageUrl: null,
    sortOrder: index,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z"
  };
});

const results = [];

function check(id, title, passed, detail) {
  const status = passed ? "PASS" : "FAIL";
  results.push({ id, title, passed, detail });
  console.log(`[${status}] ${id} ${title} — ${detail}`);
}

function note(message) {
  console.log(`       ${message}`);
}

function describeError(error) {
  return String(error && error.message ? error.message : error)
    .split("\n")[0]
    .slice(0, 400);
}

async function launchBrowser() {
  const options = { headless: !HEADED };
  if (BROWSER_PATH) return chromium.launch({ ...options, executablePath: BROWSER_PATH });
  try {
    return await chromium.launch(options);
  } catch (error) {
    note(`Bundled Chromium failed to launch (${describeError(error)}); trying Google Chrome.`);
    return chromium.launch({ ...options, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  }
}

async function newPage(browser, width, height, { syntheticCatalogue = false } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: "reduce",
    deviceScaleFactor: 1
  });

  await context.addInitScript(() => {
    window.__shopHeaderTest = {
      header: () => document.querySelector("[data-shop-header]"),
      rail: () =>
        document.querySelector("[data-shop-department-rail]") ||
        Array.from(document.querySelectorAll("[data-shop-header] nav div")).find(
          (element) =>
            typeof element.className === "string" && element.className.includes("overflow-x-auto")
        ) ||
        null
    };
  });

  const page = await context.newPage();

  if (syntheticCatalogue) {
    await page.route(/\/api\/categories(?:[?#]|$)/, async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(SYNTHETIC_CATEGORIES)
      });
    });
  }

  return { context, page };
}

async function loadPlus(page, expectedMinimumDepartments) {
  await page.goto(`${BASE_URL}/naijashop/plus`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => undefined);
  await page.waitForSelector("[data-shop-header]", { timeout: 30000 });
  await page.waitForFunction(
    (minimum) => {
      const rail = window.__shopHeaderTest && window.__shopHeaderTest.rail();
      return Boolean(rail && rail.querySelectorAll('a[href^="/naijashop/c/"]').length >= minimum);
    },
    expectedMinimumDepartments,
    { timeout: 45000 }
  );
  await page.waitForTimeout(500);
}

async function readCategoriesResponse(page, action) {
  // The preview soft-navigates during hydration, which invalidates response
  // bodies that are read later. Start reading as soon as the response arrives.
  const pending = page
    .waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/categories" &&
        response.request().method() === "GET",
      { timeout: 45000 }
    )
    .then(async (response) => {
      if (!response.ok()) return { status: response.status(), items: null, error: null };
      try {
        const items = await response.json();
        return { status: response.status(), items: Array.isArray(items) ? items : null, error: null };
      } catch (error) {
        return { status: response.status(), items: null, error: describeError(error) };
      }
    })
    .catch(() => null);
  await action();
  return pending;
}

async function headerMetrics(page) {
  return page.evaluate(() => {
    const header = document.querySelector("[data-shop-header]");
    if (!header) return null;
    const rect = header.getBoundingClientRect();
    const style = getComputedStyle(header);
    const rail =
      document.querySelector("[data-shop-department-rail]") ||
      Array.from(document.querySelectorAll("[data-shop-header] nav div")).find(
        (element) =>
          typeof element.className === "string" && element.className.includes("overflow-x-auto")
      ) ||
      null;

    let railInfo = null;
    if (rail) {
      const railRect = rail.getBoundingClientRect();
      const railStyle = getComputedStyle(rail);
      const ancestors = [];
      let node = rail.parentElement;
      while (node && node !== document.body) {
        const nodeStyle = getComputedStyle(node);
        ancestors.push({
          tag: node.tagName,
          overflowX: nodeStyle.overflowX,
          overflow: nodeStyle.overflow
        });
        if (node === header) break;
        node = node.parentElement;
      }
      railInfo = {
        height: railRect.height,
        top: railRect.top,
        scrollWidth: rail.scrollWidth,
        clientWidth: rail.clientWidth,
        linkCount: rail.querySelectorAll('a[href^="/naijashop/c/"]').length,
        display: railStyle.display,
        overflowX: railStyle.overflowX,
        tabIndex: rail.getAttribute("tabindex"),
        role: rail.getAttribute("role"),
        ariaLabel: rail.getAttribute("aria-label"),
        ariaLabelledBy: rail.getAttribute("aria-labelledby"),
        inlineStyle: rail.getAttribute("style") || "",
        ancestors,
        headerCount: document.querySelectorAll("[data-shop-header]").length,
        linkTops: Array.from(rail.querySelectorAll('a[href^="/naijashop/c/"]'))
          .map((link) => Math.round(link.getBoundingClientRect().top))
          .filter((value, index, list) => list.indexOf(value) === index)
          .sort((a, b) => a - b)
      };
    }

    return {
      height: rect.height,
      top: rect.top,
      bottom: rect.bottom,
      position: style.position,
      headerOverflow: style.overflow,
      headerOverflowX: style.overflowX,
      headerInlineStyle: header.getAttribute("style") || "",
      scrollY: Math.round(window.scrollY),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      rail: railInfo
    };
  });
}

function railIsHorizontalRow(rail) {
  return (
    Boolean(rail) &&
    rail.display === "flex" &&
    rail.overflowX === "auto" &&
    rail.height <= RAIL_MAX_HEIGHT &&
    rail.linkTops.length === 1
  );
}

function ancestorsDoNotClip(rail) {
  if (!rail) return { passed: false, detail: "rail missing" };
  const clipped = rail.ancestors.filter((ancestor) =>
    ["hidden", "clip", "scroll", "auto"].includes(ancestor.overflowX)
  );
  return {
    passed: clipped.length === 0,
    detail:
      clipped.length === 0
        ? `ancestors=${rail.ancestors.map((a) => `${a.tag}:${a.overflowX}`).join(" > ")}`
        : `clipping ancestors: ${clipped.map((a) => `${a.tag}:${a.overflowX}`).join(", ")}`
  };
}

async function clickAwarenessNextArrow(page) {
  const arrowSelector =
    'section[aria-labelledby="plus-awareness-heading"] [data-plus-carousel-arrow="next"]';
  const trackSelector =
    'section[aria-labelledby="plus-awareness-heading"] [data-plus-carousel-track]';
  const arrow = page.locator(arrowSelector);
  const count = await arrow.count();
  if (count === 0) {
    return {
      passed: false,
      detail:
        "awareness carousel next arrow is not rendered (no published awareness card overflows the rail)"
    };
  }

  await page.evaluate((selector) => {
    const element = document.querySelector(selector);
    if (element) element.scrollIntoView({ block: "center", inline: "center" });
  }, arrowSelector);
  await page.waitForTimeout(250);

  const before = await page.evaluate(
    (selector) => document.querySelector(selector)?.scrollLeft ?? -1,
    trackSelector
  );

  try {
    await arrow.click({ timeout: 10000 });
  } catch (error) {
    return {
      passed: false,
      detail: `next arrow click was blocked: ${describeError(error)} (scrollLeft before=${before})`
    };
  }

  const moved = await page
    .waitForFunction(
      ([selector, start]) => {
        const track = document.querySelector(selector);
        return Boolean(track) && Math.abs(track.scrollLeft - start) > 2;
      },
      [trackSelector, before],
      { timeout: 6000 }
    )
    .then(() => true)
    .catch(() => false);

  const after = await page.evaluate(
    (selector) => document.querySelector(selector)?.scrollLeft ?? -1,
    trackSelector
  );

  return {
    passed: moved,
    detail: moved
      ? `awareness next arrow clicked, track scrollLeft ${before} → ${after}`
      : `next arrow click did not move the track (scrollLeft ${before} → ${after})`
  };
}

async function openAllDrawer(page) {
  const trigger = page.locator('button[aria-label="Open all departments"]');
  await trigger.scrollIntoViewIfNeeded().catch(() => undefined);
  await trigger.click({ timeout: 10000 });
  await page.waitForSelector("#shop-all-panel", { state: "visible", timeout: 10000 });
  await page.waitForTimeout(700);
  return trigger;
}

async function drawerSnapshot(page) {
  return page.evaluate(() => {
    const panel = document.getElementById("shop-all-panel");
    if (!panel) return null;
    const links = Array.from(panel.querySelectorAll('a[href^="/naijashop/c/"]'));
    const panelRect = panel.getBoundingClientRect();
    return {
      title: document.getElementById("shop-all-title")?.textContent?.trim() ?? null,
      linkCount: links.length,
      hrefs: links.map((link) => link.getAttribute("href")),
      names: links.map((link) => (link.textContent || "").replace(/\s+/g, " ").trim()),
      rect: { top: panelRect.top, bottom: panelRect.bottom, height: panelRect.height },
      viewportHeight: window.innerHeight,
      activeElement:
        document.activeElement?.getAttribute("aria-label") ||
        document.activeElement?.id ||
        document.activeElement?.tagName ||
        null
    };
  });
}

async function everyDepartmentReachable(page) {
  return page.evaluate(async () => {
    const panel = document.getElementById("shop-all-panel");
    if (!panel) return { total: 0, unreachable: ["drawer missing"] };
    const links = Array.from(panel.querySelectorAll('a[href^="/naijashop/c/"]'));
    const panelRect = panel.getBoundingClientRect();
    const unreachable = [];
    for (const link of links) {
      link.scrollIntoView({ block: "nearest", inline: "nearest" });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const rect = link.getBoundingClientRect();
      const visible =
        rect.width > 0 &&
        rect.height > 0 &&
        rect.top >= panelRect.top - 1 &&
        rect.bottom <= panelRect.bottom + 1;
      const x = Math.min(Math.max(rect.left + rect.width / 2, 0), window.innerWidth - 1);
      const y = Math.min(Math.max(rect.top + rect.height / 2, 0), window.innerHeight - 1);
      const hit = document.elementFromPoint(x, y);
      if (!visible || !hit || !link.contains(hit)) {
        unreachable.push(link.getAttribute("href"));
      }
    }
    return {
      total: links.length,
      unreachable: unreachable.slice(0, 8),
      unreachableCount: unreachable.length
    };
  });
}

async function collectLandmarks(page) {
  return page.evaluate(() => {
    const sectioningSelector = "main, article, aside, nav, section";

    function accessibleName(element) {
      const labelledBy = element.getAttribute("aria-labelledby");
      if (labelledBy) {
        return labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent?.trim() || "")
          .join(" ")
          .trim();
      }
      return (element.getAttribute("aria-label") || "").trim();
    }

    function roleOf(element) {
      const explicit = element.getAttribute("role");
      const tag = element.tagName.toLowerCase();
      if (explicit === "search" || tag === "search") return "search";
      if (["navigation", "banner", "main", "contentinfo", "region", "complementary"].includes(explicit)) {
        return explicit;
      }
      if (tag === "nav") return "navigation";
      if (tag === "main") return "main";
      if (tag === "aside") return "complementary";
      if (tag === "header") return element.closest(sectioningSelector) ? null : "banner";
      if (tag === "footer") return element.closest(sectioningSelector) ? null : "contentinfo";
      if (tag === "section" && (element.getAttribute("aria-label") || element.getAttribute("aria-labelledby"))) {
        return "region";
      }
      return null;
    }

    const landmarks = [];
    for (const element of document.querySelectorAll("header, footer, nav, main, aside, section, [role]")) {
      const role = roleOf(element);
      if (!role) continue;
      landmarks.push({
        role,
        name: accessibleName(element),
        tag: element.tagName.toLowerCase()
      });
    }
    return landmarks;
  });
}

function duplicateLandmarkNames(landmarks) {
  const seen = new Map();
  const duplicates = [];
  for (const landmark of landmarks) {
    if (!landmark.name) continue;
    const key = `${landmark.role}::${landmark.name}`;
    if (seen.has(key)) duplicates.push(key);
    seen.set(key, true);
  }
  return duplicates;
}

async function saveScreenshot(page, name) {
  if (SKIP_ARTIFACTS) return;
  try {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, `${name}.png`), fullPage: false });
    note(`screenshot: ${path.join(ARTIFACT_DIR, `${name}.png`)}`);
  } catch (error) {
    note(`screenshot skipped: ${describeError(error)}`);
  }
}

function assertBoundedStickyHeader(id, metrics, label) {
  const bounded =
    metrics.position === "sticky" &&
    metrics.height <= HEADER_MAX_HEIGHT &&
    metrics.top >= -1 &&
    metrics.top <= 1;
  check(
    id,
    `sticky header is bounded (${label})`,
    bounded,
    `position=${metrics.position} height=${metrics.height.toFixed(1)}px (limit ${HEADER_MAX_HEIGHT}px) top=${metrics.top.toFixed(1)}px scrollY=${metrics.scrollY}`
  );
}

function assertNoDocumentOverflow(id, metrics, label) {
  check(
    id,
    `no document-level horizontal overflow (${label})`,
    metrics.documentOverflow <= 1,
    `documentElement.scrollWidth - clientWidth = ${metrics.documentOverflow}px at ${metrics.viewportWidth}px viewport`
  );
}

async function scenarioNormalCatalogue(browser) {
  console.log(`\n=== 1. Normal catalogue at 1440 ===`);
  const { context, page } = await newPage(browser, 1440, 900);
  try {
    const captured = await readCategoriesResponse(page, () =>
      loadPlus(page, 1)
    );
    const departments = captured?.items ?? [];
    check(
      "N0",
      "normal catalogue loaded from the real API",
      departments.length > 0,
      `GET /api/categories status=${captured?.status ?? "none"} departments=${departments.length}${captured?.error ? ` captureError="${captured.error}"` : ""}`
    );

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
    const atTop = await headerMetrics(page);
    assertBoundedStickyHeader("N1", atTop, "at scroll top");

    await page.evaluate(() => window.scrollTo(0, 1200));
    await page.waitForTimeout(250);
    const scrolled = await headerMetrics(page);
    assertBoundedStickyHeader("N1b", scrolled, "after scrolling 1200px");

    const click = await clickAwarenessNextArrow(page);
    check("N2", "page content below the sticky header is pointer-clickable", click.passed, click.detail);

    await page.evaluate(() => {
      const element = document.querySelector('[data-plus-carousel-arrow="next"]');
      if (element) element.scrollIntoView({ block: "center", inline: "center" });
    });
    await page.waitForTimeout(200);
    const afterClickOverflow = await headerMetrics(page);
    assertNoDocumentOverflow("N3", afterClickOverflow, "normal catalogue");

    const rail = afterClickOverflow.rail;
    check(
      "N4",
      "department rail is one horizontally scrollable row",
      railIsHorizontalRow(rail) &&
        rail.linkCount === departments.length &&
        rail.scrollWidth > rail.clientWidth,
      rail
        ? `display=${rail.display} overflowX=${rail.overflowX} height=${rail.height.toFixed(1)}px links=${rail.linkCount}/${departments.length} scrollWidth=${rail.scrollWidth} clientWidth=${rail.clientWidth}`
        : "rail missing"
    );

    await saveScreenshot(page, "1440-normal");
  } finally {
    await context.close();
  }
}

async function scenarioSyntheticCatalogue(browser) {
  console.log(`\n=== 2. Synthetic 68-department catalogue at 1440 ===`
  );
  const { context, page } = await newPage(browser, 1440, 900, { syntheticCatalogue: true });
  try {
    const captured = await readCategoriesResponse(page, () =>
      loadPlus(page, SYNTHETIC_COUNT)
    );
    const departments = captured?.items ?? [];
    check(
      "S0",
      "synthetic catalogue intercepted deterministically",
      departments.length === SYNTHETIC_COUNT &&
        departments.every((department, index) => department.name === SYNTHETIC_CATEGORIES[index].name),
      `status=${captured?.status ?? "none"} departments=${departments.length} names=${SYNTHETIC_CATEGORIES[0].name} … ${SYNTHETIC_CATEGORIES[SYNTHETIC_COUNT - 1].name}`
    );

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
    const atTop = await headerMetrics(page);
    assertBoundedStickyHeader("S1", atTop, "68 synthetic departments");

    const rail = atTop.rail;
    check(
      "S2",
      "68 departments render in one nowrap rail row",
      railIsHorizontalRow(rail) && rail.linkCount === SYNTHETIC_COUNT,
      rail
        ? `display=${rail.display} height=${rail.height.toFixed(1)}px row tops=${rail.linkTops.join(",")} links=${rail.linkCount}/${SYNTHETIC_COUNT} rail scrollWidth=${rail.scrollWidth} clientWidth=${rail.clientWidth}`
        : "rail missing"
    );

    const click = await clickAwarenessNextArrow(page);
    check("S3", "page content stays pointer-clickable with 68 departments", click.passed, click.detail);

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(250);
    const scrolled = await headerMetrics(page);
    assertBoundedStickyHeader("S4", scrolled, "after scrolling to page bottom");

    const clipping = await page.evaluate(() => {
      const header = document.querySelector("[data-shop-header]");
      const htmlStyle = getComputedStyle(document.documentElement);
      const bodyStyle = getComputedStyle(document.body);
      const rail =
        document.querySelector("[data-shop-department-rail]") ||
        Array.from(document.querySelectorAll("[data-shop-header] nav div")).find(
          (element) =>
            typeof element.className === "string" && element.className.includes("overflow-x-auto")
        ) ||
        null;
      return {
        htmlOverflowX: htmlStyle.overflowX,
        bodyOverflowX: bodyStyle.overflowX,
        htmlInline: document.documentElement.getAttribute("style") || "",
        bodyInline: document.body.getAttribute("style") || "",
        headerOverflow: header ? getComputedStyle(header).overflow : null,
        headerOverflowX: header ? getComputedStyle(header).overflowX : null,
        headerInline: header?.getAttribute("style") || "",
        railInline: rail?.getAttribute("style") || "",
        diagnosticStyles: document.querySelectorAll("style[data-shop-header-test], style[data-diagnostic]").length,
        overrideNodes: document.querySelectorAll("[data-shop-header-test-override]").length,
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    const ancestors = ancestorsDoNotClip(scrolled.rail);
    const noPageWideClipping =
      clipping.documentOverflow <= 1 &&
      !["hidden", "clip"].includes(clipping.htmlOverflowX) &&
      !["hidden", "clip"].includes(clipping.bodyOverflowX) &&
      !["hidden", "clip"].includes(clipping.headerOverflowX) &&
      !["hidden", "clip"].includes(clipping.headerOverflow) &&
      clipping.htmlInline === "" &&
      clipping.bodyInline === "" &&
      clipping.headerInline === "" &&
      clipping.railInline === "" &&
      clipping.diagnosticStyles === 0 &&
      clipping.overrideNodes === 0 &&
      ancestors.passed;
    check(
      "S5",
      "no page-wide overflow clipping or diagnostic CSS overrides",
      noPageWideClipping,
      `docOverflow=${clipping.documentOverflow}px html.overflowX=${clipping.htmlOverflowX} body.overflowX=${clipping.bodyOverflowX} header.overflowX=${clipping.headerOverflowX} railAncestors[${ancestors.detail}] injectedStyles=${clipping.diagnosticStyles} overrideNodes=${clipping.overrideNodes}`
    );

    await openAllDrawer(page);
    const drawer = await drawerSnapshot(page);
    const expectedHrefs = SYNTHETIC_CATEGORIES.map((department) => `/naijashop/c/${department.slug}`).sort();
    const actualHrefs = (drawer?.hrefs ?? []).slice().sort();
    const allListed =
      Boolean(drawer) &&
      drawer.linkCount === SYNTHETIC_COUNT &&
      JSON.stringify(actualHrefs) === JSON.stringify(expectedHrefs);
    check(
      "S6",
      "All drawer lists all 68 synthetic departments",
      allListed,
      drawer
        ? `drawer linkCount=${drawer.linkCount}/${SYNTHETIC_COUNT} uniqueHrefs=${new Set(actualHrefs).size} title="${drawer.title}"`
        : "drawer did not open"
    );

    const reachable = await everyDepartmentReachable(page);
    check(
      "S7",
      "every synthetic department is reachable in the open drawer",
      reachable.total === SYNTHETIC_COUNT && reachable.unreachableCount === 0,
      `checked=${reachable.total}/${SYNTHETIC_COUNT} unreachable=${reachable.unreachableCount} ${reachable.unreachable.join(",") || "none"}`
    );

    const allViewButton = page.locator("#shop-all-panel button", {
      hasText: new RegExp(`^All ${SYNTHETIC_COUNT}$`)
    });
    const allViewCount = await allViewButton.count();
    if (allViewCount > 0) {
      await allViewButton.first().click();
      await page.waitForTimeout(400);
    }
    const departmentsView = await drawerSnapshot(page);
    check(
      "S8",
      "departments view also lists all 68 synthetic departments",
      allViewCount > 0 &&
        Boolean(departmentsView) &&
        departmentsView.linkCount === SYNTHETIC_COUNT &&
        new Set(departmentsView.hrefs).size === SYNTHETIC_COUNT,
      allViewCount > 0
        ? `title="${departmentsView?.title}" linkCount=${departmentsView?.linkCount}/${SYNTHETIC_COUNT}`
        : `"All ${SYNTHETIC_COUNT}" control was not rendered`
    );

    await saveScreenshot(page, "1440-synthetic-drawer");
  } finally {
    await context.close();
  }
}

async function scenarioAccessibility(browser) {
  console.log(`\n=== 4. Rail accessibility at 1440 with 68 synthetic departments ===`);
  const { context, page } = await newPage(browser, 1440, 900, { syntheticCatalogue: true });
  try {
    await loadPlus(page, SYNTHETIC_COUNT);

    const rail = await page.evaluate(() => {
      const element =
        document.querySelector("[data-shop-department-rail]") ||
        Array.from(document.querySelectorAll("[data-shop-header] nav div")).find(
          (candidate) =>
            typeof candidate.className === "string" && candidate.className.includes("overflow-x-auto")
        ) ||
        null;
      if (!element) return null;
      const links = Array.from(element.querySelectorAll('a[href^="/naijashop/c/"]'));
      return {
        tag: element.tagName,
        tabIndex: element.getAttribute("tabindex"),
        role: element.getAttribute("role"),
        ariaLabel: element.getAttribute("aria-label"),
        linkCount: links.length,
        allLinks: links.every(
          (link) =>
            link.tagName === "A" &&
            /^\/naijashop\/c\/synthetic-department-\d{2}$/.test(link.getAttribute("href") || "") &&
            (link.textContent || "").trim().length > 0
        ),
        uniqueHrefs: new Set(links.map((link) => link.getAttribute("href"))).size
      };
    });

    check(
      "A1",
      "scrollable rail is keyboard reachable",
      Boolean(rail) && rail.tabIndex === "0",
      rail ? `rail tabIndex=${rail.tabIndex} role=${rail.role} linkCount=${rail.linkCount}` : "rail missing"
    );

    await page.locator('button[aria-label="More marketplace options"]').focus();
    await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => {
      const active = document.activeElement;
      const railElement =
        document.querySelector("[data-shop-department-rail]") ||
        Array.from(document.querySelectorAll("[data-shop-header] nav div")).find(
          (candidate) =>
            typeof candidate.className === "string" && candidate.className.includes("overflow-x-auto")
        ) ||
        null;
      return {
        isRail: Boolean(railElement && active === railElement),
        tag: active?.tagName ?? null,
        kind:
          active?.getAttribute("aria-label") ||
          active?.getAttribute("role") ||
          active?.textContent?.trim().slice(0, 40) ||
          null
      };
    });
    check(
      "A2",
      "Tab from More reaches the rail container",
      focus.isRail,
      `focused=${focus.tag} "${focus.kind}" isRail=${focus.isRail}`
    );

    const before = await page.evaluate(() => {
      const element =
        document.querySelector("[data-shop-department-rail]") ||
        Array.from(document.querySelectorAll("[data-shop-header] nav div")).find(
          (candidate) =>
            typeof candidate.className === "string" && candidate.className.includes("overflow-x-auto")
        ) ||
        null;
      return element ? element.scrollLeft : -1;
    });
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => {
      const element =
        document.querySelector("[data-shop-department-rail]") ||
        Array.from(document.querySelectorAll("[data-shop-header] nav div")).find(
          (candidate) =>
            typeof candidate.className === "string" && candidate.className.includes("overflow-x-auto")
        ) ||
        null;
      return element ? element.scrollLeft : -1;
    });
    check(
      "A3",
      "focused rail scrolls horizontally with the keyboard",
      before >= 0 && after > before,
      `ArrowRight moved rail scrollLeft ${before} → ${after}`
    );

    check(
      "A4",
      "every department in the rail is a link with a unique destination",
      Boolean(rail) && rail.linkCount === SYNTHETIC_COUNT && rail.allLinks && rail.uniqueHrefs === SYNTHETIC_COUNT,
      rail
        ? `links=${rail.linkCount}/${SYNTHETIC_COUNT} uniqueHrefs=${rail.uniqueHrefs} allAreAnchors=${rail.allLinks}`
        : "rail missing"
    );

    const landmarks = await collectLandmarks(page);
    const duplicates = duplicateLandmarkNames(landmarks);
    const railLandmark = rail
      ? landmarks.find((landmark) => landmark.role === (rail.role || "region") && landmark.name === rail.ariaLabel)
      : null;
    check(
      "A5",
      "rail has an accessible name",
      Boolean(rail && (rail.ariaLabel || "").trim().length > 0),
      rail ? `role=${rail.role} name="${rail.ariaLabel || ""}" landmarkFound=${Boolean(railLandmark)}` : "rail missing"
    );
    check(
      "A6",
      "no duplicate landmark names (drawer closed)",
      duplicates.length === 0,
      `landmarks=${landmarks.map((item) => `${item.role}:${item.name || "(unnamed)"}`).join(" | ")}`
    );

    await openAllDrawer(page);
    const openLandmarks = await collectLandmarks(page);
    const openDuplicates = duplicateLandmarkNames(openLandmarks);
    check(
      "A7",
      "no duplicate landmark names (All drawer open)",
      openDuplicates.length === 0,
      `landmarks=${openLandmarks.map((item) => `${item.role}:${item.name || "(unnamed)"}`).join(" | ")}`
    );

    const banners = openLandmarks.filter((landmark) => landmark.role === "banner");
    check(
      "A8",
      "All drawer does not add a second banner landmark",
      banners.length === 1,
      `banner landmarks while drawer is open=${banners.length} (${banners.map((item) => item.name || "(unnamed)").join(", ")})`
    );

    await page.keyboard.press("Escape");
    await page.waitForSelector("#shop-all-panel", { state: "detached", timeout: 5000 }).catch(() => undefined);
  } finally {
    await context.close();
  }
}

async function scenarioSmallViewports(browser) {
  console.log(`\n=== 3. No regression at 390 and 768 ===`);
  for (const viewport of [
    { width: 390, height: 844, id: "M", label: "390" },
    { width: 768, height: 1024, id: "T", label: "768" }
  ]) {
    const { context, page } = await newPage(browser, viewport.width, viewport.height);
    try {
      const captured = await readCategoriesResponse(page, () => loadPlus(page, 1));
      const departments = captured?.items ?? [];
      const expectedHrefs = departments.map((department) => `/naijashop/c/${department.slug}`).sort();

      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(150);
      const atTop = await headerMetrics(page);
      check(
        `${viewport.id}1`,
        `header is static and does not cover the viewport at ${viewport.label}`,
        atTop.position !== "sticky" &&
          atTop.position !== "fixed" &&
          atTop.height < atTop.viewportHeight * 0.5 &&
          atTop.bottom < atTop.viewportHeight,
        `position=${atTop.position} height=${atTop.height.toFixed(1)}px viewportHeight=${atTop.viewportHeight}px (${((atTop.height / atTop.viewportHeight) * 100).toFixed(1)}%) railDisplay=${atTop.rail?.display ?? "none"}`
      );

      await page.evaluate(() => window.scrollTo(0, 400));
      await page.waitForTimeout(200);
      const scrolled = await headerMetrics(page);
      check(
        `${viewport.id}2`,
        `header scrolls away with the page at ${viewport.label}`,
        scrolled.position !== "sticky" && scrolled.position !== "fixed" && scrolled.bottom < 0,
        `position=${scrolled.position} headerBottom=${scrolled.bottom.toFixed(1)}px scrollY=${scrolled.scrollY}`
      );
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(150);

      const trigger = await openAllDrawer(page);
      const drawer = await drawerSnapshot(page);
      const actualHrefs = (drawer?.hrefs ?? []).slice().sort();
      check(
        `${viewport.id}3`,
        `All drawer opens and lists departments at ${viewport.label}`,
        Boolean(drawer) &&
          drawer.rect.top >= -1 &&
          drawer.rect.bottom <= drawer.viewportHeight + 1 &&
          drawer.linkCount === departments.length &&
          JSON.stringify(actualHrefs) === JSON.stringify(expectedHrefs),
        drawer
          ? `panel top=${drawer.rect.top.toFixed(1)}px bottom=${drawer.rect.bottom.toFixed(1)}px viewport=${drawer.viewportHeight}px departments=${drawer.linkCount}/${departments.length} title="${drawer.title}"`
          : "drawer did not open"
      );

      const reachable = await everyDepartmentReachable(page);
      check(
        `${viewport.id}4`,
        `every drawer department is reachable at ${viewport.label}`,
        reachable.total === departments.length && reachable.unreachableCount === 0,
        `checked=${reachable.total}/${departments.length} unreachable=${reachable.unreachableCount}`
      );

      await page.keyboard.press("Escape");
      await page.waitForSelector("#shop-all-panel", { state: "detached", timeout: 5000 }).catch(() => undefined);
      await page.waitForTimeout(200);
      const focusReturned = await page.evaluate(
        () => document.activeElement?.getAttribute("aria-label") === "Open all departments"
      );
      const bodyRestored = await page.evaluate(() => document.body.getAttribute("style") || "");
      check(
        `${viewport.id}5`,
        `focus returns to the All trigger on close at ${viewport.label}`,
        focusReturned,
        `activeElement="${await page.evaluate(
          () => document.activeElement?.getAttribute("aria-label") || document.activeElement?.tagName
        )}" bodyStyle="${bodyRestored}"`
      );

      const final = await headerMetrics(page);
      assertNoDocumentOverflow(`${viewport.id}6`, final, `${viewport.label} after drawer close`);

      await saveScreenshot(page, `${viewport.width}-normal`);
    } finally {
      await context.close();
    }
  }
}

async function main() {
  console.log(`Shop header catalogue tests — ${BASE_URL}`);
  console.log(`Playwright ${require("playwright/package.json").version}; synthetic departments=${SYNTHETIC_COUNT}`);

  const browser = await launchBrowser();
  try {
    await scenarioNormalCatalogue(browser);
    await scenarioSyntheticCatalogue(browser);
    await scenarioAccessibility(browser);
    await scenarioSmallViewports(browser);
  } finally {
    await browser.close();
  }

  const failed = results.filter((result) => !result.passed);
  console.log(`\n=== Summary ===`);
  console.log(`${results.length - failed.length} passed, ${failed.length} failed, ${results.length} total`);
  if (failed.length > 0) {
    for (const result of failed) console.log(`FAIL ${result.id} ${result.title} — ${result.detail}`);
    process.exitCode = 1;
  } else {
    console.log("All shop header catalogue assertions passed.");
  }
}

main().catch((error) => {
  console.error("Shop header catalogue tests crashed:", error);
  process.exitCode = 1;
});
