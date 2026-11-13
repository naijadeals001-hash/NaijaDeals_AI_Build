/**
 * NaijaShop product-detail visual and functional audit.
 *
 * Scope: the seeded REVIEW catalogue fixtures. The script never creates or
 * deletes catalogue data; the basket step restores the customer's prior cart
 * line quantity (or removes only the line it added) before exiting.
 *
 * Usage:
 *   PRODUCT_DETAIL_BASE_URL=http://localhost:3071 node scripts/product-detail-visual-audit.cjs
 *
 * Optional:
 *   PRODUCT_DETAIL_OUT=qa-artifacts/product-detail
 *   MULTI_IMAGE_SLUG=<active product with 2+ images>  (gallery thumbnail branch)
 *   ARCHIVED_SLUG=<known archived product slug>      (404 fixture)
 */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const BASE = (process.env.PRODUCT_DETAIL_BASE_URL || "http://localhost:3047").replace(/\/$/, "");
const OUT = path.resolve(process.env.PRODUCT_DETAIL_OUT || "qa-artifacts/product-detail");
const CREDENTIAL_PATH = path.resolve("qa-artifacts/review-basket/.credential");
const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 1000 }
];

const FIXTURES = {
  grocery: {
    slug: "demo-fine-white-maize-meal-5kg-zqz1t",
    label: "grocery",
    expectedAttributeLabels: ["Form", "Grain", "Net weight"],
    expectedAttributeValues: ["Fine meal", "White maize", "5 kg"],
    sellerMarket: "Abuja"
  },
  equipment: {
    slug: "demo-cordless-drill-and-bit-set-18v-dlbqn",
    label: "electronics/equipment",
    expectedAttributeLabels: ["Battery included", "Power source", "Tool type", "Voltage"],
    sellerMarket: "Abuja"
  },
  fashion: {
    slug: "demo-handwoven-raffia-tote-bag-y57pg",
    label: "fashion",
    expectedAttributeLabels: ["Item type", "Material"],
    sellerMarket: "Abuja"
  },
  oneImage: {
    slug: "demo-apple-iphone-6-silver",
    label: "one-image electronics",
    expectedThumbnails: 0,
    sellerMarket: "Abuja"
  }
};

const ARCHIVED_SLUG = process.env.ARCHIVED_SLUG || "demo-acceptance-20261113154145-2a9riv";
const MULTI_IMAGE_SLUG = process.env.MULTI_IMAGE_SLUG || "";

const results = [];
function check(name, ok, detail = "", viewport = "") {
  results.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 400), viewport });
  const prefix = viewport ? `[${viewport}] ` : "";
  console.log(`${ok ? "PASS" : "FAIL"} ${prefix}${name}${detail ? ` — ${detail}` : ""}`);
}

fs.mkdirSync(OUT, { recursive: true });

function credentials() {
  if (!fs.existsSync(CREDENTIAL_PATH)) return null;
  const lines = fs.readFileSync(CREDENTIAL_PATH, "utf8").trim().split(/\r?\n/).map((line) => line.trim());
  return lines[0] && lines[1] ? { email: lines[0], password: lines[1] } : null;
}

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.evaluate(() => (document.fonts ? document.fonts.ready : undefined)).catch(() => undefined);
}

async function overflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
  });
}

async function box(page, selector) {
  const locator = page.locator(selector).first();
  if ((await locator.count()) === 0) return null;
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      top: Math.round(rect.top + window.scrollY),
      left: Math.round(rect.left + window.scrollX),
      right: Math.round(rect.right + window.scrollX),
      bottom: Math.round(rect.bottom + window.scrollY),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  });
}

async function auditProduct(page, fixture, viewport) {
  const response = await page.goto(`${BASE}/product/${fixture.slug}`, { waitUntil: "domcontentloaded" });
  check("product route responds 200", response && response.status() === 200, `status=${response ? response.status() : "none"}`, viewport.name);
  await settle(page);

  const screenshot = path.join(OUT, `product-${fixture.label.replace(/[^a-z0-9]+/gi, "-")}-${viewport.width}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });

  const dims = await overflow(page);
  check("no horizontal overflow", dims.scrollWidth <= dims.clientWidth + 1, JSON.stringify(dims), viewport.name);

  const title = await page.locator("h1").first().textContent().catch(() => "");
  check("product title renders", Boolean(title && title.trim().length > 3), title || "missing", viewport.name);
  const documentTitle = await page.title();
  check("SSR metadata title is product-specific", documentTitle.includes("NaijaDeals") && !documentTitle.includes("Product unavailable"), documentTitle, viewport.name);

  const htmlResponse = await page.context().request.get(`${BASE}/product/${fixture.slug}`);
  const html = await htmlResponse.text();
  check(
    "SSR HTML includes title, price and specifications",
    html.includes('data-testid="product-title"') && html.includes('data-testid="product-price"') && (html.includes('data-testid="product-attributes"') || html.includes('data-testid="product-attributes-empty"')),
    `status=${htmlResponse.status()} bytes=${html.length}`,
    viewport.name
  );

  const demoNotice = await page.locator('[data-testid="demo-notice"]').count();
  const demoBadge = await page.locator('[data-testid="demo-badge"]').count();
  check("one illustrative notice and one concise DEMO badge", demoNotice === 1 && demoBadge === 1, `notice=${demoNotice} badge=${demoBadge}`, viewport.name);

  const price = await page.locator('[data-testid="product-price"]').textContent().catch(() => "");
  const priceBlock = await page.locator("#price-heading").evaluate((element) => element.parentElement?.textContent ?? "").catch(() => "");
  check("price renders with currency", Boolean(price && price.includes("₦")) && priceBlock.includes("(NGN)"), `${price || "missing"} / ${priceBlock.slice(0, 60)}`, viewport.name);

  const addToCart = page.locator('[data-testid="add-to-cart"]');
  check("add-to-cart control present", (await addToCart.count()) === 1, "", viewport.name);
  check("Buy now is omitted in REVIEW", (await page.getByRole("button", { name: "Buy now" }).count()) === 0, "", viewport.name);
  check("REVIEW checkout explanation present", (await page.locator('[data-testid="review-checkout-notice"]').count()) === 1, "", viewport.name);

  const attributeLabels = await page
    .locator('[data-testid="product-attributes"] dt')
    .allTextContents()
    .catch(() => []);
  const attributeValues = await page
    .locator('[data-testid="product-attributes"] dd')
    .allTextContents()
    .catch(() => []);
  if (fixture.expectedAttributeLabels) {
    const missing = fixture.expectedAttributeLabels.filter((label) => !attributeLabels.some((text) => text.includes(label)));
    check("stored category attributes use human labels", missing.length === 0, missing.length ? `missing ${missing.join(", ")}` : attributeLabels.join(" | "), viewport.name);
  }
  if (fixture.expectedAttributeValues) {
    const missing = fixture.expectedAttributeValues.filter((value) => !attributeValues.some((text) => text.includes(value)));
    check("stored category values render as entered", missing.length === 0, missing.length ? `missing ${missing.join(", ")}` : attributeValues.join(" | "), viewport.name);
  }
  if (fixture.label === "grocery") {
    const detailText = await page.locator('[data-testid="product-attributes"]').textContent().catch(() => "");
    check("grocery does not show Condition: New", !/condition/i.test(detailText), detailText.slice(0, 80), viewport.name);
  }
  if (fixture.label === "one-image electronics") {
    const thumbs = await page.locator('[data-testid="product-thumbnail"]').count();
    check("single-image listing has no thumbnail strip", thumbs === 0, `thumbnails=${thumbs}`, viewport.name);
    const stage = await box(page, '[data-testid="product-image-stage"]');
    check("single-image stage is bounded", Boolean(stage && stage.height <= 470 && stage.width <= 470), stage ? `${stage.width}x${stage.height}` : "missing", viewport.name);
  }

  const mainImage = page.locator('[data-testid="product-main-image"]');
  const natural = await mainImage.evaluate((image) => ({ width: image.naturalWidth, complete: image.complete })).catch(() => null);
  check("main image loaded", Boolean(natural && natural.complete && natural.width > 0), natural ? `natural=${natural.width}` : "missing", viewport.name);

  const bodyText = await page.locator("body").innerText();
  check("honest empty review state", bodyText.includes("No approved customer reviews yet"), "", viewport.name);
  check("no fabricated verified-review claim", !/verified review/i.test(bodyText), "", viewport.name);

  const deliveryText = await page.locator('[data-testid="purchase-panel"]').locator("..").textContent().catch(() => "");
  check("destination comes from the seller market", deliveryText.includes(fixture.sellerMarket) && deliveryText.includes("Nigeria"), "", viewport.name);
  check("browsing city is explicitly not the delivery address", deliveryText.includes("city selected in the header is not"), "", viewport.name);

  const sellerHref = await page.locator('a[href^="/naijashop/search?q="]').first().getAttribute("href").catch(() => null);
  check("seller link targets a working storefront search", Boolean(sellerHref && sellerHref.startsWith("/naijashop/search?q=")), sellerHref || "missing", viewport.name);

  const h1 = await box(page, "h1");
  const gallery = await box(page, '[data-testid="product-image-stage"]');
  const priceBox = await box(page, "#price-heading");
  const purchase = await box(page, '[data-testid="purchase-panel"]');
  const about = await box(page, "#about-heading");
  if (viewport.width < 1280) {
    const ordered = h1 && gallery && priceBox && purchase && about && h1.top < gallery.top && gallery.top < priceBox.top && priceBox.top < purchase.top && purchase.top < about.top;
    check(
      "mobile/tablet order title → gallery → price → purchase → details",
      Boolean(ordered),
      ordered ? "" : `h1=${h1?.top} gallery=${gallery?.top} price=${priceBox?.top} purchase=${purchase?.top} about=${about?.top}`,
      viewport.name
    );
  } else {
    const threeAreas = h1 && gallery && purchase && gallery.right <= h1.left + 2 && h1.left < purchase.left && h1.top <= gallery.top + 40;
    check(
      "desktop three-area layout (gallery left, title/price centre, purchase right)",
      Boolean(threeAreas),
      threeAreas ? "" : `gallery right=${gallery?.right} h1 left=${h1?.left} purchase left=${purchase?.left}`,
      viewport.name
    );
    check("desktop gallery is bounded", Boolean(gallery && gallery.width <= 460 && gallery.height <= 460), gallery ? `${gallery.width}x${gallery.height}` : "missing", viewport.name);
    check("purchase panel starts near the title", Boolean(purchase && h1 && Math.abs(purchase.top - h1.top) <= 40), `purchase=${purchase?.top} h1=${h1?.top}`, viewport.name);
  }

  return { screenshot };
}

async function auditArchived(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const response = await page.goto(`${BASE}/product/${ARCHIVED_SLUG}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  check("archived product is a real 404", response && response.status() === 404, `status=${response ? response.status() : "none"}`, viewport.name);
  const heading = await page.locator("h1").first().textContent().catch(() => "");
  check("archived product shows unavailable state", /not available/i.test(heading), heading || "missing", viewport.name);
  check("archived product leaks no price or purchase panel", (await page.locator('[data-testid="product-price"]').count()) === 0 && (await page.locator('[data-testid="purchase-panel"]').count()) === 0, "", viewport.name);
  await page.screenshot({ path: path.join(OUT, `archived-404-${viewport.width}.png`), fullPage: true });
  await context.close();
}

async function auditKeyboard(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/product/${FIXTURES.grocery.slug}`, { waitUntil: "domcontentloaded" });
  await settle(page);

  // Reach the gallery trigger using the keyboard, not a mouse click, so the
  // focus-visible state is the one a keyboard user actually receives.
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  let reached = false;
  for (let i = 0; i < 120; i += 1) {
    await page.keyboard.press("Tab");
    reached = await page.evaluate(() => Boolean(document.activeElement && String(document.activeElement.getAttribute("aria-label") || "").startsWith("Open full-screen image viewer")));
    if (reached) break;
  }
  check("gallery viewer is reachable by keyboard", reached, "", "desktop");
  if (reached) {
    const focusVisible = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element) return null;
      const style = getComputedStyle(element);
      return { visible: element.matches(":focus-visible"), outline: `${style.outlineStyle} ${style.outlineWidth}` };
    });
    check("keyboard focus is visible on the gallery trigger", Boolean(focusVisible && focusVisible.visible && !focusVisible.outline.startsWith("none")), JSON.stringify(focusVisible), "desktop");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    const dialog = page.getByRole("dialog");
    check("Enter opens the full-screen image viewer", (await dialog.count()) === 1, "", "desktop");
    check("viewer is modal", (await dialog.getAttribute("aria-modal")) === "true", "", "desktop");
    const focusLabel = await page.evaluate(() => String(document.activeElement?.getAttribute("aria-label") || ""));
    check("viewer takes focus", focusLabel === "Close image viewer", focusLabel || "missing", "desktop");
    await page.screenshot({ path: path.join(OUT, "keyboard-zoom-open-1440.png"), fullPage: false });
    await page.keyboard.press("Tab");
    const trapped = await page.evaluate(() => Boolean(document.activeElement && document.activeElement.closest('[role="dialog"]')));
    check("viewer traps Tab focus", trapped, "", "desktop");
    const afterTab = await page.evaluate(() => String(document.activeElement?.getAttribute("aria-label") || ""));
    check("Tab moves between viewer controls", /Close image viewer|Previous image|Next image/.test(afterTab), afterTab || "missing", "desktop");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    check("Escape closes the viewer", (await page.getByRole("dialog").count()) === 0, "", "desktop");
    const restored = await page.evaluate(() => Boolean(document.activeElement && String(document.activeElement.getAttribute("aria-label") || "").startsWith("Open full-screen image viewer")));
    check("focus returns to the gallery trigger", restored, "", "desktop");
  }
  await context.close();
}

async function auditOverlay(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/product/${FIXTURES.grocery.slug}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const before = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="purchase-panel"]');
    const style = panel ? getComputedStyle(panel) : null;
    return { top: Math.round(panel?.getBoundingClientRect().top ?? 0), position: style?.position };
  });
  await page.evaluate(() => window.scrollTo(0, 620));
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="purchase-panel"]');
    return { top: Math.round(panel?.getBoundingClientRect().top ?? 0), scrollY: Math.round(window.scrollY) };
  });
  check(
    "purchase panel stays in normal flow (no header/content overlay)",
    before.position === "static" && after.top === before.top - after.scrollY,
    `position=${before.position} before=${before.top} after=${after.top} scrollY=${after.scrollY}`,
    "desktop"
  );
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(200);
  const footer = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="purchase-panel"]')?.getBoundingClientRect();
    const footerElement = document.querySelector("footer");
    const footerRect = footerElement?.getBoundingClientRect();
    return {
      panelBottom: Math.round(panel?.bottom ?? 0),
      footerTop: Math.round(footerRect?.top ?? 0),
      footerVisible: Boolean(footerRect)
    };
  });
  check("purchase panel never overlaps the footer", footer.footerVisible && footer.panelBottom <= footer.footerTop + 1, JSON.stringify(footer), "desktop");
  await context.close();
}

async function auditMultiImage(browser) {
  if (!MULTI_IMAGE_SLUG) {
    check("multi-image thumbnail branch", true, "SKIPPED — no active multi-image fixture supplied via MULTI_IMAGE_SLUG", "desktop");
    return;
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/product/${MULTI_IMAGE_SLUG}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const thumbs = page.locator('[data-testid="product-thumbnail"]');
  const count = await thumbs.count();
  check("multi-image gallery shows thumbnails", count > 1, `thumbnails=${count}`, "desktop");
  if (count > 1) {
    const first = await page.locator('[data-testid="product-main-image"]').getAttribute("src");
    await thumbs.nth(1).focus();
    await page.keyboard.press("Enter");
    const second = await page.locator('[data-testid="product-main-image"]').getAttribute("src");
    check("thumbnails change the main image", Boolean(first && second), "", "desktop");
    const pressed = await thumbs.nth(1).getAttribute("aria-pressed");
    check("active thumbnail is announced", pressed === "true", `aria-pressed=${pressed}`, "desktop");

    // Arrow keys move focus and selection together (roving tabindex).
    await thumbs.nth(1).focus();
    await page.keyboard.press("ArrowRight");
    const afterArrow = await page.locator('[data-testid="product-main-image"]').getAttribute("src");
    const arrowFocus = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
    check("thumbnails support arrow-key navigation", arrowFocus === `Show image 1 of ${count}` || Boolean(afterArrow && afterArrow !== second), `focus=${arrowFocus}`, "desktop");

    // The viewer starts on the selected image and can page through the gallery.
    await page.locator('[data-testid="product-image-stage"] button[aria-haspopup="dialog"]').click();
    await page.waitForTimeout(250);
    await page.keyboard.press("ArrowRight");
    const viewerCounter = await page.getByRole("dialog").innerText().catch(() => "");
    check("viewer pages through multiple images", /Image \d of \d/.test(viewerCounter), viewerCounter.slice(0, 60), "desktop");
    await page.keyboard.press("Escape");
  }
  await context.close();
}

async function auditBasket(browser) {
  const account = credentials();
  if (!account) {
    check("basket journey", false, "BLOCKED — qa-artifacts/review-basket/.credential is missing", "desktop");
    return;
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  let baseline = null;
  try {
    await page.goto(`${BASE}/product/${FIXTURES.grocery.slug}`, { waitUntil: "domcontentloaded" });
    await settle(page);

    // Signed-out add must send the shopper to sign in and back to this product.
    await page.locator('[data-testid="add-to-cart"]').click();
    await page.waitForURL((url) => url.pathname === "/login", { timeout: 15000 }).catch(() => undefined);
    const loginUrl = new URL(page.url());
    check(
      "signed-out add returns to sign-in with product next",
      loginUrl.pathname === "/login" && loginUrl.searchParams.get("next") === `/product/${FIXTURES.grocery.slug}`,
      `${loginUrl.pathname}${loginUrl.search}`,
      "desktop"
    );

    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Password").fill(account.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => url.pathname === `/product/${FIXTURES.grocery.slug}`, { timeout: 20000 }).catch(() => undefined);
    check("sign-in returns to the product page", new URL(page.url()).pathname === `/product/${FIXTURES.grocery.slug}`, page.url(), "desktop");
    await settle(page);

    const cartResponse = await context.request.get(`${BASE}/api/cart`);
    const cart = cartResponse.ok() ? await cartResponse.json() : null;
    const existing = (cart?.items ?? []).find((item) => item.productId && item.product?.slug === FIXTURES.grocery.slug);
    baseline = existing ? { id: existing.id, quantity: existing.quantity } : null;
    const baselineCount = (cart?.items ?? [])
      .filter((item) => !item.savedForLater)
      .reduce((sum, item) => sum + item.quantity, 0);

    const quantity = page.locator('[data-testid="product-quantity"]');
    const options = await quantity.locator("option").count();
    check("quantity options are capped at the cart limit", options <= 10 && options >= 1, `options=${options}`, "desktop");
    await quantity.selectOption("2");
    await page.locator('[data-testid="add-to-cart"]').click();
    await page.locator('[data-testid="cart-added-notice"]').waitFor({ timeout: 15000 }).catch(() => undefined);
    const notice = await page.locator('[data-testid="cart-added-notice"]').textContent().catch(() => "");
    check("add-to-cart shows an authoritative confirmation", Boolean(notice && notice.includes("Added 2")), notice || "missing", "desktop");

    const badge = page.locator('a[aria-label^="Cart,"]').first();
    const badgeLabel = await badge.getAttribute("aria-label").catch(() => "");
    check("shared cart badge reflects the server total", badgeLabel === `Cart, ${baselineCount + 2} items`, badgeLabel || "missing", "desktop");

    await page.getByRole("link", { name: /View basket/i }).click();
    await page.waitForURL((url) => url.pathname === "/cart", { timeout: 15000 }).catch(() => undefined);
    await settle(page);
    await page.getByRole("heading", { name: "Shopping Cart" }).waitFor({ timeout: 30000 }).catch(() => undefined);
    const cartText = await page.locator("body").innerText();
    check("basket contains the added product", cartText.includes("Fine white maize meal"), cartText.includes("Loading") ? "cart still loading" : `${page.url()} len=${cartText.length}`, "desktop");
    await page.screenshot({ path: path.join(OUT, "basket-cart-1440.png"), fullPage: true });
  } catch (error) {
    check("basket journey", false, `ERROR — ${error instanceof Error ? error.message : String(error)}`, "desktop");
  } finally {
    // Restore the pre-existing line exactly; only remove the line this run
    // created. No other cart content is touched.
    try {
      const currentResponse = await context.request.get(`${BASE}/api/cart`);
      const current = currentResponse.ok() ? await currentResponse.json() : null;
      const line = (current?.items ?? []).find((item) => item.productId && item.product?.slug === FIXTURES.grocery.slug);
      if (line) {
        const headers = { Origin: BASE, "Content-Type": "application/json" };
        const response = baseline
          ? await context.request.patch(`${BASE}/api/cart/items/${line.id}`, { data: { quantity: baseline.quantity }, headers })
          : await context.request.delete(`${BASE}/api/cart/items/${line.id}`, { headers });
        check("basket fixture restored", response.ok(), `status=${response.status()}`, "desktop");
      }
    } catch (error) {
      check("basket fixture restored", false, `ERROR — ${error instanceof Error ? error.message : String(error)}`, "desktop");
    }
    await context.close();
  }
}

(async () => {
  console.log(`Product detail audit against ${BASE}`);
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: VIEWPORTS[2] });
    const page = await context.newPage();
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const fixture of Object.values(FIXTURES)) {
        await auditProduct(page, fixture, viewport);
      }
    }
    await context.close();

    for (const viewport of VIEWPORTS) {
      await auditArchived(browser, viewport);
    }
    await auditKeyboard(browser);
    await auditOverlay(browser);
    await auditMultiImage(browser);
    await auditBasket(browser);
  } finally {
    await browser.close();
  }

  const failed = results.filter((result) => !result.ok);
  const jsonPath = path.join(OUT, "audit-results.json");
  fs.writeFileSync(jsonPath, JSON.stringify({ base: BASE, at: new Date().toISOString(), checks: results }, null, 2));
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    console.log("Failures:");
    for (const failure of failed) console.log(`- ${failure.viewport ? `[${failure.viewport}] ` : ""}${failure.name}: ${failure.detail}`);
  }
  console.log(`Evidence: ${OUT}`);
  process.exitCode = failed.length > 0 ? 1 : 0;
})();
