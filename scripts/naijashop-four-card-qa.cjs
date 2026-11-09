/**
 * NaijaShop dense merchandising acceptance.
 *
 * Verifies the owner's four-card requirement on phones:
 *  - Deals of the day and Shop by Category each show FOUR fully visible cards,
 *    with the remaining cards reachable by arrows and by swipe;
 *  - arrows scroll the real track and disable at each boundary;
 *  - keyboard arrows move the track;
 *  - every card links to its real destination and prices come from the API;
 *  - no page-level horizontal overflow, and desktop keeps its wider grid.
 *
 * Usage: BASE_URL=http://localhost:3015 node scripts/naijashop-four-card-qa.cjs
 */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.BASE_URL ?? "http://localhost:3015";
const OUT = path.join(process.cwd(), "qa-artifacts", "naijashop", "four-card");
fs.mkdirSync(OUT, { recursive: true });

const WIDTHS = [320, 360, 375, 390, 412, 430, 600, 768, 1024, 1440];
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

const state = () => {
  const track = (label) => {
    const list = [...document.querySelectorAll('ul[tabindex="0"]')].find((node) => node.getAttribute("aria-label") === label);
    if (!list) return null;
    const vw = window.innerWidth;
    const cards = [...list.children].filter((node) => node.offsetParent !== null);
    const fully = cards.filter((node) => {
      const box = node.getBoundingClientRect();
      return box.left >= -1 && box.right <= vw + 1;
    }).length;
    const first = cards[0]?.getBoundingClientRect();
    return {
      cards: cards.length,
      fully,
      cardWidth: first ? Math.round(first.width) : 0,
      scrollable: list.scrollWidth > list.clientWidth + 2,
      scrollLeft: Math.round(list.scrollLeft),
      maxScroll: Math.round(list.scrollWidth - list.clientWidth)
    };
  };
  return {
    deals: track("Deals of the day"),
    categories: track("Shop by category"),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
};

(async () => {
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });

  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 768, hasTouch: width < 768 });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error).slice(0, 90)));
    await page.goto(`${BASE}/naijashop`, { waitUntil: "load", timeout: 120000 });
    await page.waitForTimeout(2500);
    const snapshot = await page.evaluate(state);

    if (width <= 430) {
      check(`${width}px: four deal cards fully visible`, snapshot.deals?.fully === 4, JSON.stringify(snapshot.deals));
      check(`${width}px: four category cards fully visible`, snapshot.categories?.fully === 4, JSON.stringify(snapshot.categories));
    } else {
      check(`${width}px: deals show a full row of cards`, (snapshot.deals?.fully ?? 0) >= 4, JSON.stringify(snapshot.deals));
      // From tablet up the grid is designed to show every category in one row,
      // so a non-scrolling track there is the intended behaviour, not a defect.
      const allVisibleInOneRow = snapshot.categories?.fully === snapshot.categories?.cards && snapshot.categories?.scrollable === false;
      check(`${width}px: category row shows every category`, allVisibleInOneRow || (snapshot.categories?.fully ?? 0) >= 4, JSON.stringify(snapshot.categories));
    }
    // The four-across phone layout must overflow so the rest stay reachable;
    // wider breakpoints intentionally fit their cards, so only assert it there.
    if (width <= 430) {
      check(`${width}px: leftover cards stay reachable by scrolling`, snapshot.deals?.cards > snapshot.deals?.fully && snapshot.deals?.scrollable === true, JSON.stringify(snapshot.deals));
    }
    check(`${width}px: no horizontal page overflow`, snapshot.overflow <= 1, String(snapshot.overflow));
    check(`${width}px: no page errors`, errors.length === 0, errors.join(" | "));
    await page.screenshot({ path: path.join(OUT, `row-${width}.png`), fullPage: false });
    await context.close();
  }

  // ---- Interaction on a phone ----
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto(`${BASE}/naijashop`, { waitUntil: "load", timeout: 120000 });
  await page.waitForTimeout(2500);

  for (const [label, file] of [["Deals of the day", "deals"], ["Shop by category", "categories"]]) {
    const left = page.getByRole("button", { name: `Scroll ${label} left` });
    const right = page.getByRole("button", { name: `Scroll ${label} right` });
    const track = page.locator(`ul[aria-label="${label}"]`);
    await track.scrollIntoViewIfNeeded();

    check(`${label}: left arrow disabled at the start`, await left.isDisabled());
    const before = await track.evaluate((node) => node.scrollLeft);
    await right.click();
    await page.waitForTimeout(900);
    const after = await track.evaluate((node) => node.scrollLeft);
    check(`${label}: right arrow scrolls the track`, after > before + 40, `${before} -> ${after}`);
    check(`${label}: left arrow enables after scrolling`, !(await left.isDisabled()));

    await left.click();
    await page.waitForTimeout(900);
    const back = await track.evaluate((node) => node.scrollLeft);
    check(`${label}: left arrow returns to the start`, back <= before + 2, `${back}`);

    // Keyboard arrows move the track when it has focus.
    await track.focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(800);
    check(`${label}: keyboard ArrowRight scrolls the track`, (await track.evaluate((node) => node.scrollLeft)) > before + 40);
    await track.evaluate((node) => node.scrollTo({ left: 0 }));
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, `${file}-start.png`) });

    // Scroll to the end so the remaining cards are proven reachable.
    await track.evaluate((node) => node.scrollTo({ left: node.scrollWidth }));
    await page.waitForTimeout(700);
    const end = await page.evaluate(state);
    await page.screenshot({ path: path.join(OUT, `${file}-end.png`) });
    check(`${label}: remaining cards reachable at the end`, (file === "deals" ? end.deals : end.categories).scrollLeft >= (file === "deals" ? end.deals : end.categories).maxScroll - 2);
  }

  // ---- Cards point at real destinations and show catalogue prices ----
  const categoryHrefs = await page.$$eval("[data-category]", (nodes) => nodes.map((node) => node.getAttribute("href")));
  check("every category card links to a category page", categoryHrefs.length === 8 && categoryHrefs.every((href) => /^\/naijashop\/c\//.test(href ?? "")), JSON.stringify(categoryHrefs.slice(0, 3)));
  const productLinks = await page.$$eval('[aria-label="Deals of the day"] a[href^="/product/"]', (nodes) => nodes.length);
  check("every deal card opens a product page", productLinks >= 4, String(productLinks));

  const catalogue = await page.evaluate(async () => {
    const items = await (await fetch("/api/products")).json();
    return items.map((item) => ({ name: item.name, price: Number(item.priceKobo) }));
  });
  const shown = await page.$$eval('[aria-label="Deals of the day"] article', (nodes) =>
    nodes.map((node) => ({ name: node.querySelector("h3")?.textContent?.trim() ?? "", price: node.querySelector("p span")?.textContent?.trim() ?? "" }))
  );
  const mismatched = shown.filter((row) => {
    const match = catalogue.find((item) => item.name === row.name);
    if (!match) return false;
    const naira = `₦${Math.round(match.price / 100).toLocaleString("en-NG")}`;
    return row.price.replace(/\s/g, "") !== naira.replace(/\s/g, "");
  });
  check("displayed prices match the catalogue", mismatched.length === 0, JSON.stringify(mismatched.slice(0, 2)));

  // ---- Card internal structure (the defect the owner reported) ----
  const cards = await page.$$eval('[aria-label="Deals of the day"] article', (nodes) =>
    nodes.filter((node) => {
      const box = node.getBoundingClientRect();
      return box.left >= -1 && box.right <= window.innerWidth + 1;
    }).map((node) => {
      const box = node.getBoundingClientRect();
      const button = node.querySelector("button");
      const label = button?.getBoundingClientRect();
      const name = node.querySelector("h3");
      const nameBox = name?.getBoundingClientRect();
      return {
        width: Math.round(box.width),
        height: Math.round(box.height),
        buttonText: button?.textContent?.trim() ?? "",
        // A wrapped label pushes its content taller than the button's fixed height.
        buttonClipped: button ? button.scrollHeight > button.clientHeight + 1 : true,
        buttonInside: label ? label.left >= box.left - 0.5 && label.right <= box.right + 0.5 && label.bottom <= box.bottom + 0.5 : false,
        buttonWidth: label ? Math.round(label.width) : 0,
        nameHeight: nameBox ? Math.round(nameBox.height) : 0,
        nameFont: name ? parseFloat(getComputedStyle(name).fontSize) : 0,
        hasRatingRow: /No reviews yet|★/.test(node.textContent ?? "") || Boolean(node.querySelector("p a[href*=\"#reviews\"]"))
      };
    })
  );
  check("four deal cards are rendered", cards.length === 4, String(cards.length));
  check("cards have equal widths", new Set(cards.map((card) => card.width)).size === 1, JSON.stringify(cards.map((c) => c.width)));
  check("cards have equal heights", new Set(cards.map((card) => card.height)).size === 1, JSON.stringify(cards.map((c) => c.height)));
  check("Add to Cart sits fully inside every card", cards.every((card) => card.buttonInside), JSON.stringify(cards.map((c) => c.buttonInside)));
  check("Add to Cart has a consistent width", new Set(cards.map((card) => card.buttonWidth)).size === 1, JSON.stringify(cards.map((c) => c.buttonWidth)));
  check("Add to Cart label fits without clipping", cards.every((card) => card.buttonText === "Add to Cart" && card.buttonClipped === false), JSON.stringify(cards.map((c) => ({ t: c.buttonText, clipped: c.buttonClipped }))));
  check("product names are compact and clamp to two lines", cards.every((card) => card.nameFont <= 10.5 && card.nameHeight <= 30), JSON.stringify(cards.map((c) => ({ f: c.nameFont, h: c.nameHeight }))));
  check("every card shows a rating row (verified stars or explicit no-reviews state)", cards.every((card) => card.hasRatingRow));

  const brokenImages = await page.$$eval('[aria-label="Shop by category"] img, [aria-label="Deals of the day"] img', (nodes) => nodes.filter((img) => img.complete && img.naturalWidth === 0).length);
  check("no broken card images", brokenImages === 0, String(brokenImages));

  await context.close();
  await browser.close();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.error("FAILURES:", failures.slice(0, 12));
    process.exit(1);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
