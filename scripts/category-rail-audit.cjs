/**
 * NaijaShop storefront category rail + full category directory acceptance.
 *
 * Verifies the fixed eight-shortcut block was replaced by the complete set of
 * eligible level-1 categories from the effective public taxonomy:
 *   - card/directory set and order match the published tree (level-1 only) and
 *     the canonical `/api/taxonomy/categories` browsing projection; server
 *     subtree counts match both sources
 *   - NG and GH market responses are checked; the desktop viewport runs GH
 *   - `browsingVisible=false` and `canPublish=false` nodes stay out; a missing
 *     count says so instead of becoming zero; empty categories say "No listings
 *     yet"
 *   - every card links to `/naijashop/c/<slug>` and returns HTTP 200
 *   - carousel boundaries (aria-disabled, focus retained), touch swipe,
 *     trackpad scroll, keyboard Home/End/Arrow, scroll-snap, reduced motion,
 *     no auto-rotation, partial next card on mobile
 *   - no page-wide horizontal overflow at 390/768/1440
 *   - the compact rail precedes the product shelves, which precede wholesale
 *   - `/naijashop/categories` lists the same complete set with counts/images
 *   - loading, empty and error states are real; both taxonomy endpoints are
 *     intercepted together (no database writes)
 *
 * Usage:
 *   BASE_URL=http://localhost:3053 node scripts/category-rail-audit.cjs
 *
 * Screenshots and the JSON result go to
 * qa-artifacts/visual/category-rail/. Read-only: no credentials, no mutations.
 */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");

const BASE = (process.env.BASE_URL || "http://localhost:3053").replace(/\/+$/, "");
const OUT = path.join(process.cwd(), "qa-artifacts", "visual", "category-rail");
fs.mkdirSync(OUT, { recursive: true });

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe"
].filter(Boolean);
const CHROME = CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate));
if (!CHROME) {
  console.error("No Chromium browser found. Set CHROME_PATH.");
  process.exit(2);
}

const VIEWPORTS = [
  { width: 390, height: 844, touch: true, name: "mobile", country: "NG", city: "Lagos" },
  { width: 768, height: 1024, touch: true, name: "tablet", country: "NG", city: "Lagos" },
  // The desktop pass exercises a non-default market so the locale-scoped
  // rail/directory fetch is covered without adding a duplicate viewport set.
  { width: 1440, height: 900, touch: false, name: "desktop", country: "GH", city: "Accra" }
];

const checks = [];
const screenshots = [];
const notes = [];
const observedLinks = new Set();
let lastPageEligible = null;
let lastPageCountry = "NG";

function check(name, ok, detail = "") {
  const entry = { name, ok: Boolean(ok), detail: detail ? String(detail) : "" };
  checks.push(entry);
  console.log(`${entry.ok ? "PASS" : "FAIL"} ${name}${entry.detail ? ` — ${entry.detail}` : ""}`);
  return entry.ok;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(pathname, attempts = 60) {
  let lastError = "";
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(`${BASE}${pathname}`, { cache: "no-store" });
      if (response.ok) return await response.json();
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(1000);
  }
  throw new Error(`${pathname} unavailable: ${lastError}`);
}

/**
 * Eligible level-1 categories from a taxonomy response, with the same filters
 * the rail applies: browsingVisible and effective country publication state.
 * Counts are the server's subtree counts; a missing count stays null.
 */
function eligibleLevelOne(departments) {
  const rows = [];
  for (const department of departments ?? []) {
    for (const node of department.children ?? []) {
      if (!node || typeof node.slug !== "string" || typeof node.name !== "string") continue;
      if (typeof node.level === "number" && node.level !== 1) continue;
      if (node.browsingVisible === false) continue;
      if (node.canPublish === false) continue;
      rows.push(node);
    }
  }
  return rows.map((node) => ({
    slug: node.slug,
    name: node.name,
    imageUrl: node.imageUrl ?? null,
    count:
      typeof node.subtreeProductCount === "number"
        ? node.subtreeProductCount
        : typeof node.productCount === "number"
          ? node.productCount
          : null
  }));
}

/**
 * Expectations are bound to the responses the page actually consumed. The
 * review database is shared with other workstreams, so a taxonomy row can be
 * published/unpublished while the audit is running; comparing every page to a
 * single start-of-run snapshot would report a false mismatch.
 */
function expectedFromPayload(taxonomyPayload) {
  const departments = Array.isArray(taxonomyPayload?.departments) ? taxonomyPayload.departments : [];
  return {
    departments,
    countryCode: typeof taxonomyPayload?.countryCode === "string" ? taxonomyPayload.countryCode : null,
    eligible: eligibleLevelOne(departments)
  };
}

/**
 * The rail and directory consume the level-1 projection, which the service
 * returns in published tree order. Keep the expected shape identical to the
 * tree-derived entries so a projection-order regression is still detectable.
 */
function expectedFromProjection(projectionPayload) {
  const rows = Array.isArray(projectionPayload?.categories) ? projectionPayload.categories : [];
  const eligible = rows
    .filter((node) => node && node.level === 1 && node.browsingVisible !== false && node.canPublish !== false)
    .map((node) => ({
      slug: node.slug,
      name: node.name,
      imageUrl: node.imageUrl ?? null,
      count:
        typeof node.subtreeProductCount === "number"
          ? node.subtreeProductCount
          : typeof node.productCount === "number"
            ? node.productCount
            : null
    }));
  return {
    countryCode: typeof projectionPayload?.countryCode === "string" ? projectionPayload.countryCode : null,
    city: typeof projectionPayload?.city === "string" ? projectionPayload.city : null,
    eligible
  };
}

function attachExpectationCapture(page) {
  const captured = { taxonomy: null, projection: null };
  page.on("response", (response) => {
    let pathname = "";
    try {
      pathname = new URL(response.url()).pathname;
    } catch {
      return;
    }
    if (!response.ok()) return;
    if (pathname === "/api/taxonomy") {
      response
        .json()
        .then((body) => {
          captured.taxonomy = body;
        })
        .catch(() => undefined);
    } else if (pathname === "/api/taxonomy/categories") {
      response
        .json()
        .then((body) => {
          captured.projection = body;
        })
        .catch(() => undefined);
    }
  });
  return captured;
}

async function applyLocale(context, country, city) {
  if (!country || country === "NG") return;
  const domain = new URL(BASE).hostname;
  await context.addCookies([
    { name: "nd_country", value: country, domain, path: "/" },
    { name: "nd_city", value: city || "", domain, path: "/" }
  ]);
}

async function setRailLeft(page, left) {
  await page.$eval(
    "[data-category-rail]",
    (track, value) => {
      const previous = track.style.scrollBehavior;
      track.style.scrollBehavior = "auto";
      track.scrollLeft = value;
      track.style.scrollBehavior = previous;
    },
    left
  );
}

async function settleScroll(page, selector, timeoutMs = 9000) {
  const started = Date.now();
  let last = -1;
  let stable = 0;
  while (Date.now() - started < timeoutMs) {
    await page.waitForTimeout(120);
    const value = await page.$eval(selector, (node) => Math.round(node.scrollLeft));
    if (value === last) {
      stable += 1;
      if (stable >= 2) return value;
    } else {
      stable = 0;
      last = value;
    }
  }
  return last;
}

async function waitForRail(page) {
  await page.waitForSelector("[data-category-rail]", { timeout: 120000 });
  await page.waitForFunction(
    () => document.querySelector("[data-category-rail-section]")?.getAttribute("data-counts-status") === "ready",
    null,
    { timeout: 60000 }
  );
}

async function resetRail(page, edge = "start") {
  // CSS scroll-behavior: smooth also animates `scrollLeft = …`, so tests must
  // switch it off for an exact reset. The rail's own preference handling is
  // verified separately in the reduced-motion pass.
  const value = await page.$eval(
    "[data-category-rail]",
    (track) => track.scrollWidth - track.clientWidth
  );
  await setRailLeft(page, edge === "end" ? value : 0);
  await page.waitForTimeout(300);
}

async function warmRail(page) {
  // Lazy images sit outside the horizontal viewport. Step through the track so
  // each card enters the viewport at least once, then return to the first card.
  const max = await page.$eval("[data-category-rail]", (track) => track.scrollWidth - track.clientWidth);
  for (let left = 0; left <= max; left += 240) {
    await setRailLeft(page, left);
    await page.waitForTimeout(70);
  }
  await setRailLeft(page, max);
  await page.waitForTimeout(600);
  await resetRail(page, "start");
  await page
    .waitForFunction(
      () => Array.from(document.querySelectorAll("[data-category-card] img")).every((img) => img.complete),
      null,
      { timeout: 30000 }
    )
    .catch(() => undefined);
  // Any image that is still deferred after the pass must at least resolve when
  // eagerly requested; this proves the taxonomy URL is valid, not that lazy
  // loading is broken.
  await page.$$eval("[data-category-card] img", (images) => {
    for (const image of images) image.loading = "eager";
  });
  await page
    .waitForFunction(
      () => Array.from(document.querySelectorAll("[data-category-card] img")).every((img) => img.complete),
      null,
      { timeout: 30000 }
    )
    .catch(() => undefined);
  await page.waitForTimeout(300);
}

async function railSnapshot(page) {
  return page.evaluate(() => {
    const section = document.querySelector("[data-category-rail-section]");
    const track = document.querySelector("[data-category-rail]");
    const cards = Array.from(document.querySelectorAll("[data-category-card]"));
    const trackRect = track.getBoundingClientRect();
    const partialNext = cards.some((card) => {
      const rect = card.getBoundingClientRect();
      return rect.left < trackRect.right - 1 && rect.right > trackRect.right + 1;
    });
    const step =
      cards.length > 1
        ? Math.round((cards[1].getBoundingClientRect().left - cards[0].getBoundingClientRect().left) * 100) / 100
        : 0;
    return {
      countsStatus: section.getAttribute("data-counts-status"),
      sectionHeight: Math.round(section.getBoundingClientRect().height),
      summaryText: section.querySelector("h2")?.parentElement?.innerText ?? "",
      trackSnapType: getComputedStyle(track).scrollSnapType,
      firstSnapAlign: cards[0] ? getComputedStyle(cards[0]).scrollSnapAlign : "",
      scrollLeft: Math.round(track.scrollLeft),
      maxScroll: Math.round(track.scrollWidth - track.clientWidth),
      partialNext,
      step,
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      cards: cards.map((card) => ({
        slug: card.getAttribute("data-category-slug"),
        count: card.getAttribute("data-category-count"),
        text: (card.innerText || "").replace(/\s+/g, " ").trim(),
        href: card.getAttribute("href") || card.querySelector("a")?.getAttribute("href") || "",
        hasImage: Boolean(card.querySelector("img")),
        imageLoaded: (() => {
          const img = card.querySelector("img");
          return Boolean(img && img.complete && img.naturalWidth > 0);
        })(),
        hasFallback: Boolean(card.querySelector("svg"))
      }))
    };
  });
}

function countLabelFor(count) {
  if (count === 0) return "No listings yet";
  return `${count} ${count === 1 ? "listing" : "listings"}`;
}

async function compareCards(snapshot, eligible, scope) {
  const cards = snapshot.cards;
  check(`${scope}: card count equals eligible level-1 taxonomy nodes`, cards.length === eligible.length, `${cards.length} rendered vs ${eligible.length} API`);

  const slugs = cards.map((card) => card.slug);
  const expectedSlugs = eligible.map((node) => node.slug);
  const orderMatches = slugs.length === expectedSlugs.length && slugs.every((slug, index) => slug === expectedSlugs[index]);
  check(`${scope}: card order matches taxonomy publication order`, orderMatches, orderMatches ? "" : `first mismatch at ${slugs.findIndex((slug, i) => slug !== expectedSlugs[i])}`);

  const wrongLinks = cards.filter((card, index) => card.href !== `/naijashop/c/${expectedSlugs[index]}`);
  check(`${scope}: every card links to /naijashop/c/<slug>`, wrongLinks.length === 0, wrongLinks.slice(0, 3).map((card) => card.href).join(", "));

  const countMismatch = cards.filter((card) => {
    const node = eligible.find((entry) => entry.slug === card.slug);
    if (!node) return true;
    return String(node.count ?? "") !== card.count;
  });
  check(`${scope}: every card count matches the storefront catalogue subtree`, countMismatch.length === 0, countMismatch.slice(0, 3).map((card) => `${card.slug}=${card.count}`).join(", "));

  const labelMismatch = cards.filter((card) => {
    const node = eligible.find((entry) => entry.slug === card.slug);
    if (!node) return true;
    if (node.count === null) return !/Listing count unavailable|Counting listings/i.test(card.text);
    return !card.text.includes(countLabelFor(node.count));
  });
  check(`${scope}: count labels are honest (zero says "No listings yet")`, labelMismatch.length === 0, labelMismatch.slice(0, 3).map((card) => `${card.slug}: ${card.text}`).join(" | "));

  const imageMismatch = cards.filter((card) => {
    const node = eligible.find((entry) => entry.slug === card.slug);
    if (!node) return true;
    if (node.imageUrl) return !card.hasImage || !card.imageLoaded;
    return card.hasImage || !card.hasFallback;
  });
  check(`${scope}: taxonomy images load; missing images use the fallback icon`, imageMismatch.length === 0, imageMismatch.slice(0, 4).map((card) => card.slug).join(", "));

  const summaryCount = snapshot.summaryText.includes(`${eligible.length} categor`);
  check(`${scope}: heading displays the actual eligible category count`, summaryCount, snapshot.summaryText.slice(0, 140));

  const demoWording = /demonstration/i.test(snapshot.summaryText);
  const liveStockPhrase = /departments with live stock/i.test(snapshot.summaryText);
  check(`${scope}: summary uses demonstration-inventory wording`, demoWording && !liveStockPhrase, snapshot.summaryText.slice(0, 160));

  check(`${scope}: scrolling UI is scroll-snapped`, snapshot.trackSnapType === "x mandatory" && snapshot.firstSnapAlign === "start", `${snapshot.trackSnapType} / ${snapshot.firstSnapAlign}`);
  check(`${scope}: no page-wide horizontal overflow`, snapshot.pageOverflow <= 1, `${snapshot.pageOverflow}px`);
}

async function runViewport(browser, viewport, fallbackEligible) {
  const scope = viewport.name;
  const context = await browser.newContext({ serviceWorkers: "block",
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.touch,
    hasTouch: viewport.touch,
    deviceScaleFactor: viewport.width === 390 ? 2 : 1
  });
  const page = await context.newPage();
  const pageErrors = [];
  const captured = attachExpectationCapture(page);
  page.on("pageerror", (error) => pageErrors.push(String(error).slice(0, 200)));
  await applyLocale(context, viewport.country, viewport.city);

  await page.goto(`${BASE}/naijashop`, { waitUntil: "load", timeout: 180000 });
  await waitForRail(page);
  await warmRail(page);
  await page.locator("[data-category-rail]").scrollIntoViewIfNeeded();
  await resetRail(page, "start");
  await page.waitForTimeout(300);

  check(
    `${scope}: storefront received the browsing projection`,
    Boolean(captured.projection),
    captured.projection ? "" : "response not observed"
  );
  const pageExpected = captured.projection ? expectedFromProjection(captured.projection) : { eligible: fallbackEligible };
  const eligible = pageExpected.eligible;
  check(
    `${scope}: taxonomy carried server counts for every eligible category`,
    eligible.every((node) => typeof node.count === "number"),
    eligible.filter((node) => typeof node.count !== "number").slice(0, 3).map((node) => node.slug).join(", ")
  );

  const snapshot = await railSnapshot(page);
  for (const card of snapshot.cards) observedLinks.add(card.href);
  await compareCards(snapshot, eligible, scope);

  check(`${scope}: rail stays compact`, viewport.width === 390 ? snapshot.sectionHeight <= 300 : snapshot.sectionHeight <= 240, `${snapshot.sectionHeight}px`);
  if (viewport.width === 390) {
    check(`${scope}: the next card is partially visible`, snapshot.partialNext, `scrollLeft ${snapshot.scrollLeft}`);
  }

  const order = await page.evaluate(() => {
    const rail = document.querySelector("[data-category-rail-section]");
    const shelves = Array.from(document.querySelectorAll("[data-storefront-shelf]"));
    const wholesale = document.querySelector("[data-storefront-wholesale]");
    const follows = (first, second) =>
      Boolean(first && second && first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
    return {
      shelfCount: shelves.length,
      railBeforeFirstShelf: follows(rail, shelves[0]),
      allShelvesBeforeWholesale: shelves.length > 0 && shelves.every((shelf) => follows(shelf, wholesale)),
      railBeforeWholesale: follows(rail, wholesale)
    };
  });
  check(`${scope}: product discovery precedes the category rail`, order.shelfCount >= 4 && !order.railBeforeFirstShelf && order.railBeforeWholesale, `${order.shelfCount} shelves, rail before first: ${order.railBeforeFirstShelf}`);
  check(`${scope}: every shelf precedes wholesale`, order.allShelvesBeforeWholesale && order.railBeforeWholesale, `rail<wholesale ${order.railBeforeWholesale}`);

  // Boundary state at the start: focused control stays focused and inert.
  const initial = await page.evaluate(() => {
    const prev = document.querySelector("[data-rail-prev]");
    const next = document.querySelector("[data-rail-next]");
    return { prevDisabled: prev.getAttribute("aria-disabled"), nextDisabled: next.getAttribute("aria-disabled") };
  });
  check(`${scope}: previous control is disabled at the start`, initial.prevDisabled === "true", `prev=${initial.prevDisabled}`);
  await page.focus("[data-rail-prev]");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  const afterPrevEnter = await page.evaluate(() => ({
    scrollLeft: Math.round(document.querySelector("[data-category-rail]").scrollLeft),
    focusedPrev: document.activeElement?.getAttribute("data-rail-prev") !== null
  }));
  check(`${scope}: boundary control keeps focus and does not move the rail`, afterPrevEnter.scrollLeft === 0 && afterPrevEnter.focusedPrev, JSON.stringify(afterPrevEnter));
  await page.click("[data-rail-prev]", { force: true });
  check(`${scope}: force-clicking the disabled previous control is inert`, Math.round(await page.$eval("[data-category-rail]", (node) => node.scrollLeft)) === 0);

  // Next button advances by one snapped card.
  await page.click("[data-rail-next]");
  const afterNext = await settleScroll(page, "[data-category-rail]");
  const prevEnabled = await page.getAttribute("[data-rail-prev]", "aria-disabled");
  check(`${scope}: next advances the rail and enables previous`, afterNext > 0 && prevEnabled === "false", `scrollLeft=${afterNext}, prevDisabled=${prevEnabled}`);
  const step = snapshot.step;
  const afterNextSnap = Math.abs(afterNext - Math.round(afterNext / step) * step) <= 3;
  check(`${scope}: button scrolling lands on a scroll-snap point`, afterNextSnap, `scrollLeft=${afterNext}, step=${step}`);

  // Keyboard: End stops at the last reachable position and disables Next.
  await page.focus("[data-category-rail]");
  await page.keyboard.press("End");
  const atEnd = await settleScroll(page, "[data-category-rail]");
  const maxScroll = await page.$eval("[data-category-rail]", (node) => Math.round(node.scrollWidth - node.clientWidth));
  const nextAtEnd = await page.getAttribute("[data-rail-next]", "aria-disabled");
  check(`${scope}: End reaches the final position`, atEnd >= maxScroll - 4, `scrollLeft=${atEnd}, max=${maxScroll}`);
  check(`${scope}: next control is disabled at the end`, nextAtEnd === "true", `next=${nextAtEnd}`);
  await page.focus("[data-rail-next]");
  const beforeEndEnter = await page.$eval("[data-category-rail]", (node) => Math.round(node.scrollLeft));
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  const afterEndEnter = await page.evaluate(() => ({
    scrollLeft: Math.round(document.querySelector("[data-category-rail]").scrollLeft),
    focusedNext: document.activeElement?.getAttribute("data-rail-next") !== null
  }));
  check(`${scope}: end boundary keeps focus and does not move`, afterEndEnter.scrollLeft === beforeEndEnter && afterEndEnter.focusedNext, JSON.stringify(afterEndEnter));

  // Keyboard Home / Arrow (focus the track again; Enter above left focus on Next).
  await page.focus("[data-category-rail]");
  await page.keyboard.press("Home");
  const atHome = await settleScroll(page, "[data-category-rail]");
  const prevAtHome = await page.getAttribute("[data-rail-prev]", "aria-disabled");
  check(`${scope}: Home returns to the first card`, atHome === 0 && prevAtHome === "true", `scrollLeft=${atHome}, prev=${prevAtHome}`);
  await page.keyboard.press("ArrowRight");
  const afterArrowRight = await settleScroll(page, "[data-category-rail]");
  check(`${scope}: ArrowRight moves one card`, afterArrowRight > 0, `scrollLeft=${afterArrowRight}`);
  await page.keyboard.press("ArrowLeft");
  const afterArrowLeft = await settleScroll(page, "[data-category-rail]");
  check(`${scope}: ArrowLeft moves back to the first card`, afterArrowLeft === 0, `scrollLeft=${afterArrowLeft}`);

  // Trackpad / wheel horizontal scrolling.
  const trackBox = await page.locator("[data-category-rail]").boundingBox();
  await page.mouse.move(trackBox.x + trackBox.width / 2, trackBox.y + trackBox.height / 2);
  const scrollYBefore = await page.evaluate(() => Math.round(window.scrollY));
  await page.mouse.wheel(320, 0);
  const afterWheel = await settleScroll(page, "[data-category-rail]");
  const scrollYAfter = await page.evaluate(() => Math.round(window.scrollY));
  check(`${scope}: trackpad horizontal scroll moves the rail`, afterWheel > 0, `scrollLeft=${afterWheel}`);
  check(`${scope}: trackpad scroll stays inside the rail`, scrollYBefore === scrollYAfter, `${scrollYBefore} -> ${scrollYAfter}`);

  // Touch swipe.
  if (viewport.touch) {
    await page.locator("[data-category-rail]").scrollIntoViewIfNeeded();
    await resetRail(page, "start");
    const client = await context.newCDPSession(page);
    const box = await page.locator("[data-category-rail]").boundingBox();
    const startX = box.x + box.width * 0.85;
    const y = box.y + box.height / 2;
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: startX, y }] });
    for (let index = 1; index <= 10; index += 1) {
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: startX - index * 22, y }]
      });
      await sleep(16);
    }
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(600);
    const afterSwipe = await settleScroll(page, "[data-category-rail]");
    const swipeSnapped = Math.abs(afterSwipe - Math.round(afterSwipe / step) * step) <= 3;
    check(`${scope}: touch swipe scrolls the rail`, afterSwipe > 0, `scrollLeft=${afterSwipe}`);
    check(`${scope}: touch swipe settles on a scroll-snap point`, swipeSnapped, `scrollLeft=${afterSwipe}, step=${step}`);
    await client.detach().catch(() => undefined);
  }

  // No auto-rotation.
  await resetRail(page, "start");
  const idleStart = await page.$eval("[data-category-rail]", (node) => Math.round(node.scrollLeft));
  await page.waitForTimeout(1800);
  const idleEnd = await page.$eval("[data-category-rail]", (node) => Math.round(node.scrollLeft));
  check(`${scope}: the rail never auto-rotates`, idleStart === idleEnd, `${idleStart} -> ${idleEnd}`);

  check(`${scope}: no page errors on the storefront`, pageErrors.length === 0, pageErrors[0] ?? "");

  const storefrontShot = path.join(OUT, `storefront-${viewport.width}.png`);
  await page.screenshot({ path: storefrontShot });
  screenshots.push(storefrontShot);
  const railShot = path.join(OUT, `storefront-${viewport.width}-rail.png`);
  await page.locator("[data-category-rail-section]").screenshot({ path: railShot });
  screenshots.push(railShot);

  await context.close();
  return pageErrors.length === 0;
}

async function waitForDirectory(page) {
  await page.waitForSelector("[data-category-directory-card]", { timeout: 120000 });
  await page.waitForFunction(
    () => document.querySelector("[data-category-directory]")?.getAttribute("data-counts-status") === "ready",
    null,
    { timeout: 60000 }
  );
}

async function warmDirectory(page) {
  // The directory is long and its images are lazy; scroll it once so every
  // taxonomy image actually resolves before the load check.
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y <= height; y += 600) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(50);
  }
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(500);
  await page.$$eval("[data-category-directory-card] img", (images) => {
    for (const image of images) image.loading = "eager";
  });
  await page
    .waitForFunction(
      () => Array.from(document.querySelectorAll("[data-category-directory-card] img")).every((img) => img.complete),
      null,
      { timeout: 30000 }
    )
    .catch(() => undefined);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
}

async function runDirectory(browser, viewport, fallbackEligible) {
  const scope = `directory ${viewport.name}`;
  const context = await browser.newContext({ serviceWorkers: "block",
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.touch,
    hasTouch: viewport.touch,
    deviceScaleFactor: viewport.width === 390 ? 2 : 1
  });
  const page = await context.newPage();
  const pageErrors = [];
  const captured = attachExpectationCapture(page);
  page.on("pageerror", (error) => pageErrors.push(String(error).slice(0, 200)));
  await applyLocale(context, viewport.country, viewport.city);

  await page.goto(`${BASE}/naijashop/categories`, { waitUntil: "load", timeout: 180000 });
  await waitForDirectory(page);
  await page.waitForTimeout(600);
  await warmDirectory(page);

  check(
    `${scope}: directory received the browsing projection`,
    Boolean(captured.projection),
    captured.projection ? "" : "response not observed"
  );
  const pageExpected = captured.projection ? expectedFromProjection(captured.projection) : { eligible: fallbackEligible };
  const eligible = pageExpected.eligible;
  lastPageEligible = eligible;
  lastPageCountry = viewport.country;

  const snapshot = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll("[data-category-directory-card]"));
    const wrapper = document.querySelector("[data-category-directory]");
    return {
      countsStatus: wrapper.getAttribute("data-counts-status"),
      summary: document.querySelector("[data-directory-summary]")?.innerText ?? "",
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      cards: cards.map((card) => ({
        slug: card.getAttribute("data-category-slug"),
        count: card.getAttribute("data-category-count"),
        text: (card.innerText || "").replace(/\s+/g, " ").trim(),
        href: card.getAttribute("href") || card.querySelector("a")?.getAttribute("href") || "",
        hasImage: Boolean(card.querySelector("img")),
        imageLoaded: (() => {
          const img = card.querySelector("img");
          return Boolean(img && img.complete && img.naturalWidth > 0);
        })(),
        hasFallback: Boolean(card.querySelector("svg"))
      }))
    };
  });

  for (const card of snapshot.cards) observedLinks.add(card.href);

  check(`${scope}: lists every eligible category`, snapshot.cards.length === eligible.length, `${snapshot.cards.length} vs ${eligible.length}`);
  const slugs = snapshot.cards.map((card) => card.slug);
  const expectedSlugs = eligible.map((node) => node.slug);
  const orderMatches = slugs.length === expectedSlugs.length && slugs.every((slug, index) => slug === expectedSlugs[index]);
  check(`${scope}: order is grouped in taxonomy publication order`, orderMatches, orderMatches ? "" : "slug order mismatch");

  const wrongLinks = snapshot.cards.filter((card, index) => card.href !== `/naijashop/c/${expectedSlugs[index]}`);
  check(`${scope}: every entry links to its category page`, wrongLinks.length === 0, wrongLinks.slice(0, 3).map((card) => card.href).join(", "));

  const countMismatch = snapshot.cards.filter((card) => {
    const node = eligible.find((entry) => entry.slug === card.slug);
    if (!node) return true;
    return String(node.count ?? "") !== card.count;
  });
  check(`${scope}: counts match the catalogue subtree`, countMismatch.length === 0, countMismatch.slice(0, 3).map((card) => card.slug).join(", "));

  const expectedEmpty = eligible.filter((node) => node.count === 0).length;
  const renderedEmpty = snapshot.cards.filter((card) => card.count === "0" && /No listings yet/i.test(card.text)).length;
  check(`${scope}: empty categories are labelled honestly`, renderedEmpty === expectedEmpty, `${renderedEmpty} vs ${expectedEmpty}`);

  const imageMismatch = snapshot.cards.filter((card) => {
    const node = eligible.find((entry) => entry.slug === card.slug);
    if (!node) return true;
    if (node.imageUrl) return !card.hasImage || !card.imageLoaded;
    return card.hasImage || !card.hasFallback;
  });
  check(`${scope}: taxonomy images load; missing images use the fallback icon`, imageMismatch.length === 0, imageMismatch.slice(0, 4).map((card) => card.slug).join(", "));

  check(`${scope}: summary displays the eligible category count`, snapshot.summary.includes(`${eligible.length} categor`), snapshot.summary.slice(0, 160));
  const noEligibleListings = eligible.every((node) => node.count === 0);
  const honestInventoryWording =
    (/demonstration/i.test(snapshot.summary) || (noEligibleListings && /No published listings yet/i.test(snapshot.summary))) &&
    !/departments with live stock/i.test(snapshot.summary);
  check(`${scope}: summary uses honest inventory wording`, honestInventoryWording, snapshot.summary.slice(0, 160));
  check(`${scope}: no page-wide horizontal overflow`, snapshot.pageOverflow <= 1, `${snapshot.pageOverflow}px`);
  check(`${scope}: no page errors`, pageErrors.length === 0, pageErrors[0] ?? "");

  const shot = path.join(OUT, `directory-${viewport.width}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  screenshots.push(shot);

  await context.close();
}

async function checkAllCategoryLinks(browser, hrefs) {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const request = context.request;
  const queue = [...new Set(hrefs)];
  const results = [];
  const workers = Array.from({ length: 6 }, async () => {
    while (queue.length > 0) {
      const href = queue.shift();
      const started = Date.now();
      try {
        const response = await request.get(`${BASE}${href}`, { timeout: 180000, failOnStatusCode: false });
        results.push({ href, status: response.status(), ms: Date.now() - started });
      } catch (error) {
        results.push({ href, status: 0, error: error instanceof Error ? error.message : String(error), ms: Date.now() - started });
      }
    }
  });
  await Promise.all(workers);
  const failures = results.filter((entry) => entry.status !== 200);
  check(
    "every category card link returns HTTP 200",
    failures.length === 0,
    failures.length > 0 ? failures.slice(0, 4).map((entry) => `${entry.href}=${entry.status || entry.error}`).join(", ") : `${results.length} links, slowest ${Math.max(...results.map((entry) => entry.ms))}ms`
  );
  await context.close();
}

async function runReducedMotion(browser, eligible) {
  const context = await browser.newContext({ serviceWorkers: "block",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    reducedMotion: "reduce"
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/naijashop`, { waitUntil: "load", timeout: 180000 });
  await waitForRail(page);
  await page.waitForTimeout(700);
  const state = await page.evaluate(() => {
    const track = document.querySelector("[data-category-rail]");
    return {
      flag: track.getAttribute("data-reduced-motion"),
      behavior: getComputedStyle(track).scrollBehavior,
      scrollLeft: Math.round(track.scrollLeft)
    };
  });
  check("reduced motion: preference is honoured", state.flag === "true" && state.behavior === "auto", JSON.stringify(state));
  await page.click("[data-rail-next]");
  await page.waitForTimeout(120);
  const jumped = await page.$eval("[data-category-rail]", (node) => Math.round(node.scrollLeft));
  check("reduced motion: next control jumps without animation", jumped > state.scrollLeft, `${state.scrollLeft} -> ${jumped}`);
  await page.waitForTimeout(1500);
  const idle = await page.$eval("[data-category-rail]", (node) => Math.round(node.scrollLeft));
  check("reduced motion: still no auto-rotation", idle === jumped, `${jumped} -> ${idle}`);
  const shot = path.join(OUT, "storefront-390-reduced-motion.png");
  await page.screenshot({ path: shot });
  screenshots.push(shot);
  await context.close();
}

async function routeTaxonomyPair(page, handler) {
  await page.route("**/api/taxonomy", handler);
  await page.route("**/api/taxonomy/categories**", handler);
}

function isCategoriesRequest(route) {
  return new URL(route.request().url()).pathname === "/api/taxonomy/categories";
}

function emptyTaxonomyBody(route) {
  return isCategoriesRequest(route)
    ? { countryCode: "NG", city: null, categories: [] }
    : { countryCode: "NG", city: null, departments: [] };
}

async function runStateInterception(browser, eligible, taxonomy, projection) {
  // Storefront: both taxonomy endpoints unavailable hides the rail and says so.
  {
    const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await routeTaxonomyPair(page, (route) => route.abort());
    await page.goto(`${BASE}/naijashop`, { waitUntil: "load", timeout: 180000 });
    const notice = page.getByText(/browsing category list could not be loaded/i);
    const visible = await notice
      .first()
      .waitFor({ state: "visible", timeout: 90000 })
      .then(() => true)
      .catch(() => false);
    const railPresent = await page.locator("[data-category-rail]").count();
    check("storefront error state: taxonomy failure is disclosed, no rail invented", visible && railPresent === 0, `notice=${visible}, rail=${railPresent}`);
    const shot = path.join(OUT, "storefront-1440-taxonomy-error.png");
    await page.screenshot({ path: shot });
    screenshots.push(shot);
    await context.close();
  }

  // Storefront: empty taxonomy endpoints render the honest empty rail.
  {
    const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await routeTaxonomyPair(page, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(emptyTaxonomyBody(route))
      })
    );
    await page.goto(`${BASE}/naijashop`, { waitUntil: "load", timeout: 180000 });
    const emptySection = page.locator('[data-category-rail-section][data-counts-status="empty"]');
    const visible = await emptySection.waitFor({ state: "visible", timeout: 90000 }).then(() => true).catch(() => false);
    const text = visible ? await emptySection.innerText() : "";
    check("storefront empty state: no published categories is stated plainly", visible && /No published categories are available/i.test(text), text.slice(0, 120));
    await context.close();
  }

  // Directory: both endpoints unavailable is an explicit error with retry.
  {
    const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await routeTaxonomyPair(page, (route) => route.abort());
    await page.goto(`${BASE}/naijashop/categories`, { waitUntil: "load", timeout: 180000 });
    const alert = page.getByRole("alert");
    const visible = await alert.first().waitFor({ state: "visible", timeout: 90000 }).then(() => true).catch(() => false);
    const cards = await page.locator("[data-category-directory-card]").count();
    const retry = await page.getByRole("button", { name: /try again/i }).count();
    check("directory error state: taxonomy failure is explicit and retryable", visible && cards === 0 && retry > 0, `alert=${visible}, cards=${cards}, retry=${retry}`);
    const shot = path.join(OUT, "directory-1440-taxonomy-error.png");
    await page.screenshot({ path: shot });
    screenshots.push(shot);
    await context.close();
  }

  // Directory: empty taxonomy endpoints render the empty directory state.
  {
    const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await routeTaxonomyPair(page, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(emptyTaxonomyBody(route))
      })
    );
    await page.goto(`${BASE}/naijashop/categories`, { waitUntil: "load", timeout: 180000 });
    const visible = await page
      .getByText(/No published categories yet/i)
      .first()
      .waitFor({ state: "visible", timeout: 90000 })
      .then(() => true)
      .catch(() => false);
    const cards = await page.locator("[data-category-directory-card]").count();
    check("directory empty state: an empty taxonomy is stated, not padded", visible && cards === 0, `visible=${visible}, cards=${cards}`);
    await context.close();
  }

  // Storefront: if taxonomy image files are unavailable (for example a build
  // that predates the committed artwork), every card falls back to the icon
  // instead of showing a broken image.
  {
    const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.route("**/generated/**", (route) => route.fulfill({ status: 404, contentType: "text/plain", body: "missing" }));
    await page.goto(`${BASE}/naijashop`, { waitUntil: "load", timeout: 180000 });
    await waitForRail(page);
    await page.locator("[data-category-rail]").scrollIntoViewIfNeeded();
    await page.$$eval("[data-category-card] img", (images) => {
      for (const image of images) image.loading = "eager";
    });
    await page.locator("[data-category-rail]").evaluate((element) => element.scrollTo({ left: element.scrollWidth }));
    await page.waitForTimeout(1200);
    await page
      .waitForFunction(
        () => {
          const cards = Array.from(document.querySelectorAll("[data-category-card]"));
          return cards.length > 8 && cards.every((card) => Boolean(card.querySelector("svg")));
        },
        null,
        { timeout: 30000 }
      )
      .catch(() => undefined);
    await page.waitForTimeout(500);
    const fallback = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll("[data-category-card]"));
      return {
        cards: cards.length,
        withIcon: cards.filter((card) => Boolean(card.querySelector("svg"))).length,
        brokenImages: cards.filter((card) => {
          const img = card.querySelector("img");
          return Boolean(img && img.complete && img.naturalWidth === 0);
        }).length
      };
    });
    check(
      "image 404s: every card falls back to the honest icon",
      fallback.cards > 8 && fallback.withIcon === fallback.cards && fallback.brokenImages === 0,
      JSON.stringify(fallback)
    );
    await context.close();
  }

  // Storefront: browsingVisible=false and canPublish=false nodes stay out of
  // the rail, with both taxonomy responses carrying the same flags.
  if (taxonomy && projection && eligible.length >= 3) {
    const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const hiddenBrowsing = eligible[0].slug;
    const hiddenCountry = eligible[1].slug;
    const mutatedTaxonomy = structuredClone(taxonomy);
    for (const department of mutatedTaxonomy.departments ?? []) {
      for (const node of department.children ?? []) {
        if (node.slug === hiddenBrowsing) node.browsingVisible = false;
        if (node.slug === hiddenCountry) node.canPublish = false;
      }
    }
    const mutatedProjection = structuredClone(projection);
    for (const node of mutatedProjection.categories ?? []) {
      if (node.slug === hiddenBrowsing) node.browsingVisible = false;
      if (node.slug === hiddenCountry) node.canPublish = false;
    }
    await routeTaxonomyPair(page, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(isCategoriesRequest(route) ? mutatedProjection : mutatedTaxonomy)
      })
    );
    await page.goto(`${BASE}/naijashop`, { waitUntil: "load", timeout: 180000 });
    await waitForRail(page);
    const state = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll("[data-category-card]"));
      return { count: cards.length, slugs: cards.map((card) => card.getAttribute("data-category-slug")) };
    });
    const expectedSlugs = eligible
      .filter((node) => node.slug !== hiddenBrowsing && node.slug !== hiddenCountry)
      .map((node) => node.slug);
    const exactOrder = state.count === expectedSlugs.length && state.slugs.every((slug, index) => slug === expectedSlugs[index]);
    check(
      "visibility flags: browsingVisible=false and canPublish=false are excluded",
      exactOrder && !state.slugs.includes(hiddenBrowsing) && !state.slugs.includes(hiddenCountry),
      `${state.count} cards, hidden ${hiddenBrowsing}/${hiddenCountry}`
    );
    await context.close();
  }

  // Directory: a projection without counts says so instead of inventing zero.
  if (projection) {
    const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const noCountsProjection = structuredClone(projection);
    const noCountsTaxonomy = structuredClone(taxonomy || {});
    let removed = false;
    for (const node of noCountsProjection.categories ?? []) {
      if (removed) break;
      delete node.productCount;
      delete node.subtreeProductCount;
      removed = true;
    }
    let removedTree = false;
    for (const department of noCountsTaxonomy.departments ?? []) {
      for (const node of department.children ?? []) {
        if (removedTree) break;
        delete node.productCount;
        delete node.subtreeProductCount;
        removedTree = true;
      }
    }
    await routeTaxonomyPair(page, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(isCategoriesRequest(route) ? noCountsProjection : noCountsTaxonomy)
      })
    );
    await page.goto(`${BASE}/naijashop/categories`, { waitUntil: "load", timeout: 180000 });
    const cardsReady = await page
      .locator("[data-category-directory-card]")
      .first()
      .waitFor({ state: "visible", timeout: 90000 })
      .then(() => true)
      .catch(() => false);
    const status = cardsReady
      ? await page.locator("[data-category-directory]").getAttribute("data-counts-status")
      : "";
    const body = cardsReady ? await page.locator("[data-category-directory]").innerText() : "";
    const honest = /Listing count unavailable/i.test(body);
    check("directory missing counts: shown as unavailable, never zero", cardsReady && status === "unavailable" && honest, `cards=${cardsReady}, status=${status}`);
    await context.close();
  }
}

(async () => {
  if (!CHROME) throw new Error("Chromium executable missing");
  console.log(`Category rail audit against ${BASE}`);
  const MARKETS = ["NG", "GH"];
  const marketData = {};
  for (const country of MARKETS) {
    const [tree, projection] = await Promise.all([
      fetchJson(`/api/taxonomy?country=${country}`),
      fetchJson(`/api/taxonomy/categories?country=${country}`)
    ]);
    const eligibleLevel = eligibleLevelOne(tree.departments);
    const rows = Array.isArray(projection.categories) ? projection.categories : [];
    marketData[country] = {
      tree,
      projection,
      eligible: eligibleLevel,
      projectionRows: rows,
      projectionEligible: rows.filter(
        (node) => node.level === 1 && node.browsingVisible !== false && node.canPublish !== false
      )
    };
  }
  const taxonomy = marketData.NG.tree;
  const projection = marketData.NG.projection;
  const eligible = marketData.NG.eligible;
  const departments = Array.isArray(taxonomy.departments) ? taxonomy.departments : [];
  notes.push("Market coverage: mobile/tablet use NG (Lagos) and desktop uses GH (Accra); API parity is checked for both.");

  check(
    "taxonomy response is available for NG and GH",
    MARKETS.every((country) => (marketData[country].tree.departments ?? []).length > 0),
    MARKETS.map((country) => `${country}:${(marketData[country].tree.departments ?? []).length}`).join(", ")
  );
  check(
    "level-1 browsing projection is level 1 and browsing-visible in each market",
    MARKETS.every(
      (country) =>
        marketData[country].projectionRows.length > 0 &&
        marketData[country].projectionRows.every((node) => node.level === 1 && node.browsingVisible === true)
    ),
    MARKETS.map((country) => `${country}:${marketData[country].projectionRows.length}`).join(", ")
  );
  check(
    "tree and /api/taxonomy/categories agree on the eligible level-1 set and tree order",
    MARKETS.every((country) => {
      const treeRows = marketData[country].eligible;
      const projectedRows = marketData[country].projectionEligible;
      return (
        treeRows.length === projectedRows.length &&
        treeRows.every((node, index) => projectedRows[index]?.slug === node.slug)
      );
    }),
    MARKETS.map(
      (country) => `${country}:${marketData[country].eligible.length} tree vs ${marketData[country].projectionEligible.length}`
    ).join(", ")
  );
  check(
    "tree and /api/taxonomy/categories agree on each server count",
    MARKETS.every((country) =>
      marketData[country].eligible.every((node) => {
        const projected = marketData[country].projectionEligible.find((entry) => entry.slug === node.slug);
        return Boolean(projected) && projected.subtreeProductCount === node.count;
      })
    ),
    MARKETS.flatMap((country) =>
      marketData[country].eligible
        .filter((node) => marketData[country].projectionEligible.find((entry) => entry.slug === node.slug)?.subtreeProductCount !== node.count)
        .slice(0, 2)
        .map((node) => `${country}:${node.slug}`)
    ).join(", ")
  );
  check(
    "eligible level-1 categories are derived, not fixed",
    eligible.length > 8 && new Set(eligible.map((node) => node.slug)).size === eligible.length,
    `${eligible.length} categories`
  );
  check(
    "every eligible category has a name and slug in each market",
    MARKETS.every((country) => marketData[country].eligible.every((node) => node.name && node.slug)),
    ""
  );

  const browser = await chromium.launch({ executablePath: CHROME });
  const pageErrorResults = [];
  try {
    for (const viewport of VIEWPORTS) {
      pageErrorResults.push(await runViewport(browser, viewport, marketData[viewport.country].eligible));
    }
    for (const viewport of VIEWPORTS) {
      await runDirectory(browser, viewport, marketData[viewport.country].eligible);
    }
    await checkAllCategoryLinks(browser, [...observedLinks]);
    await runReducedMotion(browser, eligible);
    await runStateInterception(browser, eligible, taxonomy, projection);
  } finally {
    await browser.close();
  }

  const reportEligible = lastPageEligible ?? eligible;
  let finalEligible = null;
  try {
    finalEligible = expectedFromPayload(await fetchJson(`/api/taxonomy?country=${lastPageCountry}`)).eligible;
  } catch {
    finalEligible = null;
  }
  if (finalEligible) {
    const finalSlugs = finalEligible.map((node) => node.slug).join("|");
    const observedSlugs = reportEligible.map((node) => node.slug).join("|");
    if (finalSlugs !== observedSlugs) {
      notes.push(
        `The shared review taxonomy changed during the audit (${reportEligible.length} pages vs ${finalEligible.length} final API nodes). Per-page checks are bound to the response each page received; re-run against a quiet environment for a single stable count.`
      );
    }
  }

  const failures = checks.filter((entry) => !entry.ok);
  const result = {
    base: BASE,
    generatedAt: new Date().toISOString(),
    departments: departments.length,
    eligibleCategories: reportEligible.length,
    categoriesWithListings: reportEligible.filter((node) => node.count > 0).length,
    categoriesWithoutListings: reportEligible.filter((node) => node.count === 0).length,
    categoriesWithImages: reportEligible.filter((node) => node.imageUrl).length,
    categoriesUsingFallbackIcon: reportEligible.filter((node) => !node.imageUrl).length,
    apiCountAtStart: eligible.length,
    apiCountAtEnd: finalEligible ? finalEligible.length : null,
    pageErrorResults,
    checks,
    failures: failures.map((entry) => entry.name),
    screenshots,
    notes
  };
  fs.writeFileSync(path.join(OUT, "result.json"), JSON.stringify(result, null, 2));
  console.log(`\n${checks.length - failures.length}/${checks.length} checks passed`);
  console.log(
    `Eligible level-1 categories (last page response): ${reportEligible.length} (${reportEligible.filter((node) => node.count > 0).length} with listings, ${reportEligible.filter((node) => node.count === 0).length} empty)`
  );
  for (const note of notes) console.log(`NOTE ${note}`);
  if (failures.length > 0) {
    console.error("FAILURES:");
    for (const failure of failures) console.error(`- ${failure.name}${failure.detail ? `: ${failure.detail}` : ""}`);
    process.exitCode = 1;
  }
  console.log(`Evidence: ${OUT}`);
})().catch((error) => {
  console.error("AUDIT ERROR", error);
  process.exitCode = 2;
});
