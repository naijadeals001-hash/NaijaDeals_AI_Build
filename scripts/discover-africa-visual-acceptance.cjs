/**
 * Discover Africa visual/functional acceptance (permanent).
 *
 * Covers the public storefront rail, the country directory and country detail
 * pages. It is black-box and read-only: it never edits data or calls providers.
 *
 * Usage:
 *   BASE_URL=http://localhost:3047 node scripts/discover-africa-visual-acceptance.cjs
 *   BASE_URL=http://localhost:3047 node scripts/discover-africa-visual-acceptance.cjs --expect-overrides
 *
 * --expect-overrides additionally asserts that every changed theme in
 * docs/countries/imagery-remediation-audit.json is rendered by the running
 * build. Use it only after the coordinator has seeded the overrides.
 */
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.BASE_URL || "http://localhost:3047";
const EXPECT_OVERRIDES = process.argv.includes("--expect-overrides");
const OUT_DIR = path.join(process.cwd(), "qa-artifacts", "visual", "discover-africa-remediation");
const AUDIT = path.join(process.cwd(), "docs", "countries", "imagery-remediation-audit.json");
const VIEWPORTS = [
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1440", width: 1440, height: 900 }
];

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
function pending(name, detail) {
  results.push({ name, ok: null, detail });
  console.log(`PENDING ${name}${detail ? ` — ${detail}` : ""}`);
}
function ratio(rgb, bg) {
  const lum = (c) => {
    const [r, g, b] = c.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const a = lum(rgb);
  const b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
function parseColor(value) {
  const match = value.match(/rgba?\(([^)]+)\)/);
  if (!match) return null;
  const parts = match[1].split(",").map((v) => Number(v.trim()));
  return { rgb: parts.slice(0, 3), alpha: parts[3] ?? 1 };
}

async function settle(page, timeout = 15000) {
  await page.waitForFunction(
    () =>
      new Promise((resolve) => {
        const track = document.querySelector("[data-country-track]");
        if (!track) return resolve(true);
        let last = track.scrollLeft;
        let stable = 0;
        function tick() {
          const now = track.scrollLeft;
          if (Math.abs(now - last) < 1) stable += 1;
          else {
            stable = 0;
            last = now;
          }
          if (stable >= 3) resolve(true);
          else requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      }),
    null,
    { timeout }
  );
}

async function openRail(page) {
  await page.goto(`${BASE}/naijashop`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-country-discovery] [data-country-card]", { timeout: 45000 });
  await page.locator("[data-country-discovery]").scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
}

async function trackMetrics(page) {
  return page.evaluate(() => {
    const track = document.querySelector("[data-country-track]");
    const cards = [...document.querySelectorAll("[data-country-card]")];
    const last = cards[cards.length - 1];
    const tr = track.getBoundingClientRect();
    const lr = last.getBoundingClientRect();
    const next = document.querySelector("[data-carousel-next]");
    const prev = document.querySelector("[data-carousel-prev]");
    const more = document.querySelector("[data-country-discovery] .pointer-events-none");
    return {
      cardCount: cards.length,
      scrollLeft: track.scrollLeft,
      clientWidth: track.clientWidth,
      scrollWidth: track.scrollWidth,
      maxScroll: track.scrollWidth - track.clientWidth,
      track: { left: tr.left, right: tr.right, top: tr.top, bottom: tr.bottom },
      last: { left: lr.left, right: lr.right, top: lr.top, bottom: lr.bottom },
      nextDisabled: next?.getAttribute("aria-disabled"),
      prevDisabled: prev?.getAttribute("aria-disabled"),
      nextRect: next ? next.getBoundingClientRect().toJSON() : null,
      prevRect: prev ? prev.getBoundingClientRect().toJSON() : null,
      moreRect: more ? more.getBoundingClientRect().toJSON() : null,
      pageScrollWidth: document.documentElement.scrollWidth,
      pageClientWidth: document.documentElement.clientWidth
    };
  });
}

async function arrowToEnd(page) {
  let presses = 0;
  while (presses < 90) {
    const disabled = await page.locator("[data-carousel-next]").getAttribute("aria-disabled");
    if (disabled === "true") break;
    await page.locator("[data-carousel-next]").click();
    await settle(page);
    presses += 1;
  }
  return presses;
}

async function contrastOf(page, selector, backgroundSelector) {
  return page.evaluate(
    ({ selector, backgroundSelector }) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const style = getComputedStyle(el);
      let bgEl = backgroundSelector ? document.querySelector(backgroundSelector) : el;
      let bg = "rgba(0, 0, 0, 0)";
      while (bgEl) {
        bg = getComputedStyle(bgEl).backgroundColor;
        if (bg && !/rgba?\(0, 0, 0, 0\)/.test(bg)) break;
        bgEl = bgEl.parentElement;
      }
      const rect = el.getBoundingClientRect();
      return {
        text: el.textContent.trim().slice(0, 80),
        color: style.color,
        fontSize: parseFloat(style.fontSize),
        background: bg,
        visible: rect.width > 0 && rect.height > 0 && style.display !== "none"
      };
    },
    { selector, backgroundSelector }
  );
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();

  // ---- Storefront rail: arrow-only traversal at three widths ----
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    await openRail(page);
    await page.evaluate(() => document.querySelector("[data-country-track]").scrollTo({ left: 0, behavior: "auto" }));
    await settle(page);
    const start = await trackMetrics(page);
    check(`${viewport.name}: 54 country cards mounted`, start.cardCount === 54, String(start.cardCount));
    const snap = await page.evaluate(() => {
      const track = document.querySelector("[data-country-track]");
      const card = document.querySelector("[data-country-card]");
      return {
        type: getComputedStyle(track).scrollSnapType,
        align: getComputedStyle(card).scrollSnapAlign
      };
    });
    check(`${viewport.name}: horizontal scroll snapping retained`, /mandatory/.test(snap.type) && snap.align === "start", JSON.stringify(snap));
    const altCoverage = await page.evaluate(() => {
      const images = [...document.querySelectorAll("[data-country-card] figure img")];
      return { count: images.length, missing: images.filter((img) => !img.getAttribute("alt") || !/Illustrative image for the /.test(img.getAttribute("alt"))).length };
    });
    check(`${viewport.name}: 324 theme images have illustrative alt text`, altCoverage.count === 324 && altCoverage.missing === 0, `${altCoverage.count} images, ${altCoverage.missing} missing`);
    check(`${viewport.name}: start shows previous disabled, next enabled`, start.prevDisabled === "true" && start.nextDisabled !== "true", `${start.prevDisabled}/${start.nextDisabled}`);
    check(`${viewport.name}: no page horizontal overflow`, start.pageScrollWidth <= start.pageClientWidth + 1, `${start.pageScrollWidth}/${start.pageClientWidth}`);
    await page.screenshot({ path: path.join(OUT_DIR, `rail-start-${viewport.name}.png`) });

    if (viewport.name === "390") {
      const prev = page.locator("[data-carousel-prev]");
      const next = page.locator("[data-carousel-next]");
      const prevBox = await prev.boundingBox();
      const nextBox = await next.boundingBox();
      const inViewport = (box) => box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1;
      check("390: both carousel controls visible in viewport", inViewport(prevBox) && inViewport(nextBox), `${JSON.stringify(prevBox)} ${JSON.stringify(nextBox)}`);
      check("390: both carousel controls are at least 40x40", prevBox && nextBox && prevBox.width >= 40 && prevBox.height >= 40 && nextBox.width >= 40 && nextBox.height >= 40);
      const hit = await page.evaluate(() => {
        const result = {};
        for (const key of ["prev", "next"]) {
          const button = document.querySelector(`[data-carousel-${key}]`);
          const rect = button.getBoundingClientRect();
          const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          result[key] = { hit: Boolean(top && (top === button || button.contains(top))), tag: top?.tagName ?? null };
        }
        return result;
      });
      check("390: controls are not covered by the More gradient", hit.prev.hit && hit.next.hit, JSON.stringify(hit));
      await prev.focus();
      const prevFocused = await page.evaluate(() => document.activeElement?.hasAttribute("data-carousel-prev") ?? false);
      await next.focus();
      const nextFocused = await page.evaluate(() => document.activeElement?.hasAttribute("data-carousel-next") ?? false);
      check("390: both controls are keyboard focusable", prevFocused && nextFocused);
      check("390: More gradient does not overlap either control", !start.moreRect || (start.moreRect.right <= prevBox.x || start.moreRect.left >= nextBox.x + nextBox.width || start.moreRect.bottom <= prevBox.y || start.moreRect.top >= prevBox.y + prevBox.height));
      const trackBox = await page.locator("[data-country-track]").boundingBox();
      await page.mouse.move(trackBox.x + trackBox.width - 40, trackBox.y + 80);
      await page.mouse.wheel(420, 0);
      await settle(page);
      const swiped = await page.evaluate(() => document.querySelector("[data-country-track]").scrollLeft);
      check("390: horizontal swipe/trackpad gesture advances the rail", swiped > 0, String(swiped));
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "auto" }));
    }

    await page.evaluate(() => document.querySelector("[data-country-track]").scrollTo({ left: 0, behavior: "auto" }));
    await settle(page);
    const presses = await arrowToEnd(page);
    const end = await trackMetrics(page);
    check(`${viewport.name}: arrow-only reaches end in one-step increments`, presses > 0 && presses <= 54, `${presses} presses`);
    check(`${viewport.name}: track is at maximum scroll`, end.scrollLeft + end.clientWidth >= end.scrollWidth - 2, `${end.scrollLeft}+${end.clientWidth} vs ${end.scrollWidth}`);
    check(`${viewport.name}: final card fully inside track viewport`, end.last.left >= end.track.left - 1 && end.last.right <= end.track.right + 1, `card ${end.last.left.toFixed(1)}-${end.last.right.toFixed(1)} track ${end.track.left.toFixed(1)}-${end.track.right.toFixed(1)}`);
    check(`${viewport.name}: next is disabled at end, previous enabled`, end.nextDisabled === "true" && end.prevDisabled !== "true", `${end.nextDisabled}/${end.prevDisabled}`);
    check(`${viewport.name}: More gradient is gone at end`, end.moreRect === null);
    await page.screenshot({ path: path.join(OUT_DIR, `rail-end-${viewport.name}.png`) });

    await page.locator("[data-carousel-prev]").click();
    await settle(page);
    const back = await trackMetrics(page);
    check(`${viewport.name}: previous moves back and re-enables next`, back.scrollLeft < end.scrollLeft - 1 && back.nextDisabled !== "true", `scroll ${back.scrollLeft.toFixed(1)} < ${end.scrollLeft.toFixed(1)}`);

    await page.evaluate(() => document.querySelector("[data-country-track]").scrollTo({ left: 0, behavior: "auto" }));
    await settle(page);
    await page.locator("[data-country-track]").focus();
    const beforeKey = await trackMetrics(page);
    await page.keyboard.press("ArrowRight");
    await settle(page);
    const afterKey = await trackMetrics(page);
    check(`${viewport.name}: ArrowRight on the focused track advances`, afterKey.scrollLeft > beforeKey.scrollLeft + 1, `${beforeKey.scrollLeft} -> ${afterKey.scrollLeft}`);
    await page.keyboard.press("End");
    await settle(page);
    const afterEnd = await trackMetrics(page);
    check(`${viewport.name}: End key reveals the final card`, afterEnd.last.right <= afterEnd.track.right + 1 && afterEnd.scrollLeft + afterEnd.clientWidth >= afterEnd.scrollWidth - 2, `${afterEnd.last.right.toFixed(1)} <= ${afterEnd.track.right.toFixed(1)}`);
    await page.keyboard.press("Home");
    await settle(page);
    const afterHome = await trackMetrics(page);
    check(`${viewport.name}: Home key returns to start`, afterHome.scrollLeft <= 2, String(afterHome.scrollLeft));
    await context.close();
  }

  // ---- Reduced motion ----
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    await openRail(page);
    await page.evaluate(() => document.querySelector("[data-country-track]").scrollTo({ left: 0, behavior: "auto" }));
    await page.waitForTimeout(250);
    await page.locator("[data-carousel-next]").click();
    await page.waitForTimeout(250);
    const moved = await page.evaluate(() => document.querySelector("[data-country-track]").scrollLeft);
    check("390: reduced-motion next press moves without animation lag", moved > 0, String(moved));
    await context.close();
  }

  // ---- Directory + country detail contrast/typography ----
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${BASE}/naijashop/countries`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("main h1", { timeout: 45000 });
    await page.screenshot({ path: path.join(OUT_DIR, "directory-1440.png"), fullPage: true });
    const directoryOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("directory: no horizontal overflow", directoryOverflow <= 1, String(directoryOverflow));
    const directorySlug = await page.evaluate(() => {
      const link = document.querySelector('a[href^="/naijashop/countries/"]');
      return link ? link.getAttribute("href") : null;
    });
    check("directory: at least one country card links to a guide", Boolean(directorySlug), directorySlug ?? "none");

    const detail = await context.newPage();
    await detail.goto(`${BASE}${directorySlug}`, { waitUntil: "domcontentloaded" });
    await detail.waitForSelector("[data-country-hero]", { timeout: 45000 });
    await detail.locator("details summary").first().click();
    await detail.waitForTimeout(250);
    const accessed = await contrastOf(detail, "details li span:last-child", "details");
    const accessedContrast = accessed ? ratio(parseColor(accessed.color).rgb, parseColor(accessed.background).rgb) : 0;
    check("country: source Accessed text is at least 11px", accessed && accessed.fontSize >= 11, accessed ? `${accessed.fontSize}px` : "missing");
    check("country: source Accessed contrast >= 4.5:1", accessedContrast >= 4.5, `${accessedContrast.toFixed(2)}:1 ${accessed?.color} on ${accessed?.background}`);
    const association = await contrastOf(detail, 'section[aria-labelledby="known-for-heading"] li p', null);
    check("country: theme association caption is at least 11px", Boolean(association && association.fontSize >= 11), association ? `${association.fontSize}px` : "missing");

    const smallText = await page.evaluate(() => {
      const scopes = [document.querySelector("[data-country-discovery]"), document.querySelector("main")].filter(Boolean);
      const offenders = [];
      for (const scope of scopes) {
        for (const el of scope.querySelectorAll("p,span,figcaption,li,summary,a,button")) {
          if (el.closest("[aria-hidden='true']")) continue;
          const text = (el.childElementCount === 0 ? el.textContent : "").trim();
          if (!text) continue;
          const style = getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;
          const size = parseFloat(style.fontSize);
          if (size < 10) offenders.push({ text: text.slice(0, 60), size, tag: el.tagName });
        }
      }
      return offenders;
    });
    check("directory: no visible Discover Africa caption below 10px", smallText.length === 0, JSON.stringify(smallText.slice(0, 6)));
    for (const width of [390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForTimeout(200);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(`directory ${width}: no horizontal overflow`, overflow <= 1, String(overflow));
      await page.screenshot({ path: path.join(OUT_DIR, `directory-${width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const width of [390, 768]) {
      await detail.setViewportSize({ width, height: 844 });
      await detail.waitForTimeout(200);
      const overflow = await detail.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(`country ${width}: no horizontal overflow`, overflow <= 1, String(overflow));
      await detail.screenshot({ path: path.join(OUT_DIR, `country-${width}.png`) });
    }
    await detail.setViewportSize({ width: 390, height: 844 });
    await detail.waitForTimeout(150);
    const countrySmall = await detail.evaluate(() => {
      const scopes = [
        document.querySelector("[data-country-hero]"),
        document.querySelector('section[aria-labelledby="known-for-heading"]'),
        document.querySelector('section[aria-labelledby="country-inventory-heading"]')
      ].filter(Boolean);
      const offenders = [];
      for (const scope of scopes) {
        for (const el of scope.querySelectorAll("p,span,figcaption,li,summary,a,button")) {
          if (el.closest("[aria-hidden='true']")) continue;
          const text = (el.childElementCount === 0 ? el.textContent : "").trim();
          if (!text) continue;
          const style = getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;
          const size = parseFloat(style.fontSize);
          if (size < 10) offenders.push({ text: text.slice(0, 60), size, tag: el.tagName });
        }
      }
      return offenders;
    });
    check("country: no visible Discover Africa caption below 10px at 390", countrySmall.length === 0, JSON.stringify(countrySmall.slice(0, 8)));
    await context.close();
  }

  // ---- Optional: overrides actually rendered ----
  if (EXPECT_OVERRIDES && fs.existsSync(AUDIT)) {
    const audit = JSON.parse(fs.readFileSync(AUDIT, "utf8"));
    const rows = audit.rows ?? audit;
    const changed = rows.filter((row) => row.changed);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const byCountry = new Map();
    for (const row of changed) {
      if (!byCountry.has(row.countryCode)) byCountry.set(row.countryCode, []);
      byCountry.get(row.countryCode).push(row);
    }
    let verified = 0;
    for (const [code, expected] of byCountry) {
      const slug = expected[0].slug;
      if (!slug) continue;
      const response = await page.goto(`${BASE}/naijashop/countries/${slug}`, { waitUntil: "domcontentloaded" });
      const html = await page.content();
      if (!response || response.status() !== 200) {
        check(`overrides ${code}: country page renders`, false, String(response?.status()));
        continue;
      }
      for (const row of expected) {
        const hasAsset = html.includes(row.finalAsset);
        const altProbe = String(row.finalAlt ?? "").slice(0, 40).replace(/&/g, "&amp;");
        const hasAlt = !altProbe || html.includes(altProbe);
        const duplicatedAlt = /Illustrative image for the [^.<]+ theme\.\s*Illustrative image for the [^.<]+ theme\./.test(html);
        check(`overrides ${code}/${row.themeKey}: rendered asset + alt`, hasAsset && hasAlt, hasAsset ? "asset present" : "asset missing");
        check(`overrides ${code}/${row.themeKey}: alt label is not duplicated`, !duplicatedAlt);
        if (hasAsset) verified += 1;
      }
    }
    check("overrides: changed rows rendered", verified === changed.length, `${verified}/${changed.length}`);
    await context.close();
  } else {
    pending("overrides rendered in the running build", "audit JSON is the intended mapping; re-run with --expect-overrides after the coordinator seeds it");
  }

  await browser.close();
  const summary = {
    base: BASE,
    expectOverrides: EXPECT_OVERRIDES,
    passed: results.filter((row) => row.ok === true).length,
    failed: results.filter((row) => row.ok === false).length,
    pending: results.filter((row) => row.ok === null).length,
    results
  };
  fs.writeFileSync(path.join(OUT_DIR, "acceptance-result.json"), `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(path.join(OUT_DIR, "acceptance.log"), `${results.map((row) => `${row.ok === null ? "PENDING" : row.ok ? "PASS" : "FAIL"} ${row.name}${row.detail ? ` — ${row.detail}` : ""}`).join("\n")}\n`);
  console.log(JSON.stringify({ passed: summary.passed, failed: summary.failed, pending: summary.pending }));
  if (summary.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
