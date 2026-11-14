/**
 * NaijaShop retail-first landing acceptance.
 *
 * Verifies the owner-reported regression is fixed against a real rendered
 * build: the compact hero and taxonomy shortcuts come first, at least four
 * populated product shelves appear before any wholesale panel, every card has
 * a matching loaded image, price, seller and DEMO label where applicable, and
 * no product repeats across shelves. It also checks the African discovery
 * feature, wholesale ordering, keyboard focus, touch target size and
 * horizontal overflow at 390 and 1440.
 *
 * Usage:
 *   BASE_URL=http://localhost:3061 node scripts/storefront-landing-audit.cjs
 *
 * Screenshots and the JSON result are written to
 * qa-artifacts/visual/storefront-landing/.
 */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");

const BASE = (process.env.BASE_URL || "http://localhost:3061").replace(/\/+$/, "");
const OUT = path.join(process.cwd(), "qa-artifacts", "visual", "storefront-landing");
fs.mkdirSync(OUT, { recursive: true });

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe"
].filter(Boolean);
const CHROME = CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate));

const EXPECTED_SHORTCUTS = ["Phones", "Computers", "Fashion", "Home", "Groceries", "Beauty", "Solar", "Gaming"];
const EXPECTED_SHELF_ORDER = [
  "explore",
  "phones-computing",
  "home-kitchen",
  "fashion-accessories",
  "groceries",
  "power-solar",
  "beauty-personal-care",
  "gaming"
];
const EXPECTED_AFRICAN_CATEGORIES = new Set([
  "african-print-fabrics",
  "handwoven-dyed-fabrics",
  "shea-natural-butters",
  "traditional-cleansers-black-soap"
]);
const BANNED_SHELF_HEADING = /best\s?sellers|trending|recommended|price\s?drops/i;
const ORIGIN_CLAIM = /made in|manufactured in|produced in|product of|imported from/i;

const checks = [];
function check(scope, name, ok, detail) {
  const entry = { scope, name, ok: Boolean(ok), detail: detail ?? null };
  checks.push(entry);
  if (entry.ok) console.log(`  PASS [${scope}] ${name}`);
  else console.error(`  FAIL [${scope}] ${name}${detail ? ` — ${detail}` : ""}`);
}
const failures = () => checks.filter((entry) => !entry.ok);

function id(value) {
  return value === undefined || value === null ? "" : String(value);
}

async function fetchJson(pathname, attempts = 45) {
  let lastError = "";
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(`${BASE}${pathname}`, { cache: "no-store" });
      if (response.ok) return await response.json();
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${pathname} unavailable: ${lastError}`);
}

function taxonomySlugs(nodes, rows = []) {
  for (const node of nodes ?? []) {
    rows.push(node.slug);
    taxonomySlugs(node.children ?? [], rows);
  }
  return rows;
}

function samePath(actual, expected) {
  try {
    return new URL(actual, BASE).pathname === new URL(expected, BASE).pathname;
  } catch {
    return false;
  }
}

function money(value) {
  return Number(value);
}

(async () => {
  const startedAt = new Date().toISOString();
  console.log(`NaijaShop retail-first landing audit against ${BASE}`);
  const [productList, taxonomy, storefront] = await Promise.all([
    fetchJson("/api/products"),
    fetchJson("/api/taxonomy"),
    fetchJson("/api/storefront")
  ]);
  const products = Array.isArray(productList) ? productList : [];
  const productBySlug = new Map(products.map((product) => [product.slug, product]));
  const allTaxonomySlugs = new Set(taxonomySlugs(taxonomy?.departments ?? []));
  const shelfLimit = Math.min(Math.max(Number(storefront?.shelfLimit) || 4, 1), 8);

  check("api", "catalogue returns the 57 active review listings", products.length === 57, `received ${products.length}`);
  check("api", "taxonomy exposes published departments", allTaxonomySlugs.size > 40, `${allTaxonomySlugs.size} slugs`);
  check("api", "storefront shelf limit is 1–8", Number.isFinite(shelfLimit) && shelfLimit >= 1 && shelfLimit <= 8, `shelfLimit=${storefront?.shelfLimit}`);

  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});

  try {
    for (const viewport of [
      { name: "mobile-390", width: 390, height: 844, mobile: true },
      { name: "desktop-1440", width: 1440, height: 900, mobile: false }
    ]) {
      const scope = `${viewport.width}x${viewport.height}`;
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: viewport.mobile,
        hasTouch: viewport.mobile,
        deviceScaleFactor: 1
      });
      const page = await context.newPage();
      const pageErrors = [];
      const consoleErrors = [];
      page.on("pageerror", (error) => pageErrors.push(String(error).slice(0, 240)));
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text().slice(0, 240));
      });

      // Snapshot the catalogue response the page itself used. Concurrent
      // review jobs can add or remove a row between the preflight fetch and
      // this navigation; every card assertion must compare against this view.
      const pageProductsResponse = page
        .waitForResponse(
          (candidate) => /\/api\/products$/.test(new URL(candidate.url()).pathname) && candidate.request().method() === "GET",
          { timeout: 180000 }
        )
        .catch(() => null);
      const response = await page.goto(`${BASE}/naijashop`, { waitUntil: "load", timeout: 180000 });
      check(scope, "landing responds 200", response?.status() === 200, `status ${response?.status()}`);
      const productsResponse = await pageProductsResponse;
      let viewportProducts = products;
      if (productsResponse) {
        try {
          const body = await productsResponse.json();
          const list = Array.isArray(body) ? body : Array.isArray(body?.items) ? body.items : null;
          if (list) viewportProducts = list;
        } catch {
          /* keep the preflight snapshot */
        }
      }
      const viewportProductBySlug = new Map(viewportProducts.map((product) => [product.slug, product]));
      const viewportPublishedSlugs = new Set(viewportProducts.map((product) => product.slug));
      check(scope, "page catalogue snapshot contains the review listings", viewportProducts.length >= 57, `${viewportProducts.length} rows`);

      await page.waitForSelector("[data-storefront-shelf]", { timeout: 180000 });
      await page.waitForSelector("[data-category-card]", { timeout: 60000 });
      await page.waitForSelector("[data-african-feature]", { timeout: 60000 });
      await page.waitForTimeout(1000);

      // Load lazy images by walking the page, then return to the top.
      await page.evaluate(async () => {
        const step = Math.max(480, Math.round(window.innerHeight * 0.8));
        for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
          window.scrollTo(0, y);
          await new Promise((resolve) => setTimeout(resolve, 90));
        }
        window.scrollTo(0, 0);
      });
      // Lazy images below the fold are still real card content. Force the
      // audit browser to fetch them, then wait for every image to settle.
      await page.evaluate(() => {
        for (const image of document.images) image.loading = "eager";
      });
      await page
        .waitForFunction(
          () => Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0),
          null,
          { timeout: 90000 }
        )
        .catch(() => undefined);
      await page.waitForTimeout(1200);

      const data = await page.evaluate(() => {
        const rectOf = (element) => {
          const box = element.getBoundingClientRect();
          return {
            top: Math.round(box.top + window.scrollY),
            bottom: Math.round(box.bottom + window.scrollY),
            left: Math.round(box.left + window.scrollX),
            right: Math.round(box.right + window.scrollX),
            width: Math.round(box.width),
            height: Math.round(box.height)
          };
        };
        const visible = (element) => {
          if (!element) return false;
          const style = getComputedStyle(element);
          const box = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
        };
        const imageInfo = (image) =>
          image
            ? {
                src: image.getAttribute("src"),
                alt: image.getAttribute("alt"),
                complete: image.complete,
                naturalWidth: image.naturalWidth,
                naturalHeight: image.naturalHeight,
                visible: visible(image),
                rect: rectOf(image)
              }
            : null;
        const cardInfo = (card) => {
          const text = card.innerText || "";
          const image = card.querySelector("img");
          const links = [...card.querySelectorAll("a")].map((link) => ({
            href: link.getAttribute("href"),
            label: (link.getAttribute("aria-label") || link.textContent || "").trim().slice(0, 120)
          }));
          const buttons = [...card.querySelectorAll("button")].map((button) => ({
            type: button.getAttribute("type"),
            text: (button.textContent || "").trim(),
            label: button.getAttribute("aria-label"),
            disabled: button.disabled
          }));
          return {
            slug: card.getAttribute("data-product"),
            rect: rectOf(card),
            title: (card.querySelector("h3")?.textContent || "").trim(),
            text,
            links,
            buttons,
            productHref: links.find((link) => (link.href || "").startsWith("/product/"))?.href ?? null,
            image: imageInfo(image),
            hasPrice: /₦\s?\d/.test(text),
            hasDemo: /demo\s*[—-]\s*illustrative listing/i.test(text),
            hasDemoSeller: /demonstration seller/i.test(text),
            hasSoldBy: text.includes("Sold by"),
            hasRating: Boolean(card.querySelector('a[href$="#reviews"]')),
            hasDiscount: /-\d+%/.test(text)
          };
        };
        const hero = document.querySelector("[data-storefront-hero]");
        const wholesale = document.querySelector("[data-storefront-wholesale]");
        const feature = document.querySelector("[data-african-feature]");
        const seller = document.querySelector("[data-seller-invite]");
        const main = document.querySelector("main");
        const allCards = [...document.querySelectorAll("[data-storefront-shelf] [data-product]")];
        return {
          viewport: { width: window.innerWidth, height: window.innerHeight },
          document: {
            clientWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
            scrollHeight: document.documentElement.scrollHeight
          },
          main: main ? { clientWidth: main.clientWidth, scrollWidth: main.scrollWidth, rect: rectOf(main) } : null,
          h1: [...document.querySelectorAll("h1")].map((heading) => (heading.textContent || "").trim()),
          bodyText: document.body.innerText,
          hero: hero ? { rect: rectOf(hero), image: imageInfo(hero.querySelector("img")) } : null,
          shortcuts: [...document.querySelectorAll("[data-category-card]")].map((card) => {
            const link = card.querySelector("a");
            return {
              slug: card.getAttribute("data-category-slug"),
              label: (card.textContent || "").trim(),
              href: link ? link.getAttribute("href") : null,
              tag: link ? link.tagName : null,
              tabIndex: link ? link.tabIndex : null,
              rect: rectOf(card),
              image: imageInfo(card.querySelector("img"))
            };
          }),
          shelves: [...document.querySelectorAll("[data-storefront-shelf]")].map((section, index) => ({
            id: section.getAttribute("data-storefront-shelf"),
            index,
            rect: rectOf(section),
            heading: (section.querySelector("h2")?.textContent || "").trim(),
            description: (section.querySelector("h2")?.parentElement?.querySelector("p:last-of-type")?.textContent || "").trim(),
            slugs: (section.getAttribute("data-shelf-slugs") || "").split(/\s+/).filter(Boolean),
            cards: [...section.querySelectorAll("[data-product]")].map(cardInfo)
          })),
          allCardCount: allCards.length,
          feature: feature
            ? {
                rect: rectOf(feature),
                text: feature.innerText || "",
                links: [...feature.querySelectorAll('a[href^="/naijashop/c/"]')].map((link) => link.getAttribute("href")),
                items: [...feature.querySelectorAll("[data-african-item]")].map((item) => {
                  const link = item.querySelector('a[href^="/product/"]');
                  const image = item.querySelector("img");
                  return {
                    slug: item.getAttribute("data-african-item"),
                    href: link?.getAttribute("href") ?? null,
                    text: item.innerText || "",
                    image: imageInfo(image)
                  };
                })
              }
            : null,
          wholesale: wholesale ? { rect: rectOf(wholesale), text: wholesale.innerText || "" } : null,
          seller: seller ? { rect: rectOf(seller), text: seller.innerText || "" } : null,
          footer: document.querySelector("footer") ? rectOf(document.querySelector("footer")) : null,
          departmentPlaceholder: Boolean(document.querySelector('[aria-labelledby="departments-heading"]')),
          mainHeadings: [...document.querySelectorAll("main h2")].map((heading) => (heading.textContent || "").trim())
        };
      });

      const allCards = data.shelves.flatMap((shelf) => shelf.cards.map((card) => ({ ...card, shelfId: shelf.id, shelfSlugs: shelf.slugs })));
      const allSlugs = allCards.map((card) => id(card.slug));
      const allNames = allCards.map((card) => card.title.trim().toLowerCase());

      check(scope, "one page h1", data.h1.length === 1, data.h1.join(" | "));
      check(scope, "shared header and footer render", Boolean(await page.locator("header").count()) && Boolean(data.footer), `footer=${Boolean(data.footer)}`);
      check(scope, "hero is compact and full width", Boolean(data.hero) && data.hero.rect.width >= viewport.width * 0.9 && data.hero.rect.height <= 420, JSON.stringify(data.hero?.rect));
      check(scope, "hero image loads", Boolean(data.hero?.image?.complete && data.hero?.image?.naturalWidth > 0 && data.hero?.image?.visible), JSON.stringify(data.hero?.image));
      check(
        scope,
        "hero is not side-by-side with wholesale",
        Boolean(data.hero) && Boolean(data.wholesale) && data.wholesale.rect.top > data.hero.rect.bottom + 200,
        `heroBottom=${data.hero?.rect.bottom} wholesaleTop=${data.wholesale?.rect.top}`
      );

      const shortcuts = data.shortcuts;
      check(scope, "category rail renders the full eligible set", shortcuts.length >= 30 && shortcuts.length <= 80, `${shortcuts.length} shortcuts`);
      check(
        scope,
        "every rail card links to its real taxonomy category",
        shortcuts.every((shortcut) => shortcut.href === `/naijashop/c/${shortcut.slug}` && allTaxonomySlugs.has(shortcut.slug)),
        shortcuts.map((shortcut) => `${shortcut.label}:${shortcut.href}`).join(", ")
      );
      check(
        scope,
        "rail cards are touch-sized and keyboard focusable",
        shortcuts.every((shortcut) => shortcut.tag === "A" && shortcut.tabIndex >= 0 && shortcut.rect.height >= 44 && shortcut.rect.height <= 200),
        JSON.stringify(shortcuts.map((shortcut) => ({ label: shortcut.label, height: shortcut.rect.height, tabIndex: shortcut.tabIndex })))
      );
      check(
        scope,
        "rail thumbnails load where art exists",
        shortcuts.filter((shortcut) => shortcut.image).every((shortcut) => shortcut.image?.complete && shortcut.image?.naturalWidth > 0) &&
          shortcuts.filter((shortcut) => shortcut.image).length >= 30,
        JSON.stringify(shortcuts.filter((shortcut) => shortcut.image && !(shortcut.image.complete && shortcut.image.naturalWidth > 0)).map((shortcut) => shortcut.label))
      );
      check(scope, "All departments directory link remains available", (await page.locator('a[href="/naijashop/categories"]').count()) >= 2, String(await page.locator('a[href="/naijashop/categories"]').count()));
      check(scope, "large department-card placeholder is gone", data.departmentPlaceholder === false, "found departments-heading");

      const shelves = data.shelves;
      const populated = shelves.filter((shelf) => shelf.cards.length > 0);
      check(scope, "at least four populated shelves render", populated.length >= 4, `${populated.length} populated of ${shelves.length}`);
      check(scope, "shelves render in retail priority order", JSON.stringify(shelves.map((shelf) => shelf.id)) === JSON.stringify(EXPECTED_SHELF_ORDER.filter((shelfId) => shelves.some((shelf) => shelf.id === shelfId))), shelves.map((shelf) => shelf.id).join(" | "));
      check(scope, "first shelf is Explore the marketplace", shelves[0]?.id === "explore" && /explore the marketplace/i.test(shelves[0]?.heading ?? ""), shelves[0]?.heading);
      check(
        scope,
        "at least four shelves with two or more cards appear before wholesale",
        populated.filter((shelf) => shelf.cards.length >= 2).length >= 4 && populated.every((shelf) => shelf.rect.top < (data.wholesale?.rect.top ?? Infinity)),
        populated.map((shelf) => `${shelf.id}:${shelf.cards.length}`).join(", ")
      );
      check(
        scope,
        "product discovery appears early",
        (shelves[0]?.rect.top ?? Infinity) <= (viewport.width <= 430 ? 960 : 800) &&
          (allCards[0]?.rect.top ?? Infinity) <= (viewport.width <= 430 ? 1100 : 950),
        `firstShelf=${shelves[0]?.rect.top} firstCard=${allCards[0]?.rect.top}`
      );

      const shelfMembershipOffenders = allCards.filter((card) => {
        if (card.shelfSlugs.includes("*")) return false;
        const product = viewportProductBySlug.get(card.slug);
        return !product || !card.shelfSlugs.includes(product.category?.slug ?? "");
      });
      check(
        scope,
        "each shelf only contains listings from its taxonomy subtree",
        shelfMembershipOffenders.length === 0,
        shelfMembershipOffenders.map((card) => `${card.shelfId}:${card.slug}`).join(", ")
      );
      check(
        scope,
        "no shelf exceeds the configured card limit",
        shelves.every((shelf) => shelf.cards.length <= shelfLimit),
        `limit=${shelfLimit} counts=${shelves.map((shelf) => shelf.cards.length).join(",")}`
      );
      check(scope, "no product repeats across shelves", new Set(allSlugs).size === allSlugs.length, `${allSlugs.length} cards / ${new Set(allSlugs).size} unique`);
      check(scope, "no listing title repeats across shelves", new Set(allNames).size === allNames.length, `${allNames.length} titles / ${new Set(allNames).size} unique`);

      const cardStructure = allCards.filter(
        (card) =>
          !card.title ||
          !card.productHref ||
          !card.hasPrice ||
          !card.hasSoldBy ||
          !card.image?.visible ||
          !card.image?.complete ||
          card.image?.naturalWidth <= 0
      );
      check(
        scope,
        "every card has title, product link, price, seller and a visible loaded image",
        cardStructure.length === 0,
        cardStructure.map((card) => `${card.shelfId}:${card.slug}`).join(", ")
      );

      const imageMismatch = allCards.filter((card) => {
        const product = viewportProductBySlug.get(card.slug);
        return !product?.images?.[0]?.url || !samePath(card.image?.src, product.images[0].url);
      });
      check(
        scope,
        "card image matches the catalogue listing image",
        imageMismatch.length === 0,
        imageMismatch.map((card) => `${card.slug}:${card.image?.src}`).join(", ")
      );

      const demoOffenders = allCards.filter((card) => {
        const product = viewportProductBySlug.get(card.slug);
        return Boolean(product?.isDemo) && !(card.hasDemo && card.hasDemoSeller);
      });
      check(
        scope,
        "DEMO products keep the demonstration badge and seller wording",
        demoOffenders.length === 0,
        demoOffenders.map((card) => card.slug).join(", ")
      );

      const ratingOrDiscountOffenders = allCards.filter((card) => {
        const product = viewportProductBySlug.get(card.slug);
        if (!product) return true;
        const ratingCount = Number(product.rating?.count ?? 0);
        const compare = Number(product.compareAtKobo ?? 0);
        const price = Number(product.priceKobo ?? 0);
        const hasCompare = Number.isFinite(compare) && Number.isFinite(price) && compare > price;
        return (ratingCount === 0 && card.hasRating) || (!hasCompare && card.hasDiscount);
      });
      check(
        scope,
        "no rating stars or discount percentages without catalogue data",
        ratingOrDiscountOffenders.length === 0,
        ratingOrDiscountOffenders.map((card) => card.slug).join(", ")
      );

      const actionOffenders = allCards.filter((card) => {
        const product = viewportProductBySlug.get(card.slug);
        if (!product) return true;
        const activeVariants = (product.variants ?? []).filter((variant) => variant.isActive).length;
        if (activeVariants > 0) return !card.links.some((link) => /see options/i.test(link.label));
        if (product.saleMode === "contact") return !card.links.some((link) => /contact the seller/i.test(link.label));
        const available = typeof product.available === "number" ? product.available : null;
        if (available !== null && available <= 0) return !(card.buttons.length === 1 && /out of stock/i.test(card.buttons[0].text) && card.buttons[0].disabled);
        return !(card.buttons.length === 1 && card.buttons[0].type === "button" && /add to cart/i.test(card.buttons[0].text) && !card.buttons[0].disabled);
      });
      check(
        scope,
        "add-to-cart appears only where the catalogue action is valid",
        actionOffenders.length === 0,
        actionOffenders.map((card) => `${card.slug}:${card.buttons.map((button) => button.text).join("/")}`).join(", ")
      );
      check(
        scope,
        "published listing rows are the only products on the landing",
        allSlugs.every((slug) => viewportPublishedSlugs.has(slug)),
        allSlugs.filter((slug) => !viewportPublishedSlugs.has(slug)).join(", ")
      );

      await page.locator("[data-category-card] a").first().focus();
      const shortcutFocus = await page.evaluate(() => document.activeElement?.closest("[data-category-card]")?.getAttribute("data-category-slug"));
      check(scope, "category shortcut receives keyboard focus", shortcutFocus === shortcuts[0]?.slug, String(shortcutFocus));
      await page.locator("[data-storefront-shelf] button").first().focus();
      const cardFocus = await page.evaluate(() => ({
        tag: document.activeElement?.tagName,
        text: (document.activeElement?.textContent || "").trim()
      }));
      check(scope, "add-to-cart control receives keyboard focus", cardFocus.tag === "BUTTON" && /add to cart/i.test(cardFocus.text), JSON.stringify(cardFocus));

      check(
        scope,
        "no horizontal page overflow",
        data.document.scrollWidth <= data.document.clientWidth + 1 && (!data.main || data.main.scrollWidth <= data.main.clientWidth + 1),
        `doc=${data.document.scrollWidth}/${data.document.clientWidth} main=${data.main?.scrollWidth}/${data.main?.clientWidth}`
      );
      const cardOverflow = allCards.filter((card) => card.rect.right > viewport.width + 1 || card.rect.left < -1);
      check(scope, "shelf cards stay inside the viewport", cardOverflow.length === 0, cardOverflow.map((card) => `${card.slug}:${card.rect.left}-${card.rect.right}`).join(", "));

      check(scope, "no bestseller/trending/recommended/price-drop shelf heading", data.mainHeadings.every((heading) => !BANNED_SHELF_HEADING.test(heading)), data.mainHeadings.join(" | "));
      check(
        scope,
        "review wording uses demonstration/illustrative, not live stock",
        /demonstration/i.test(data.bodyText) && /illustrative/i.test(data.bodyText) && !/live\s+stock/i.test(data.bodyText),
        "body wording"
      );

      const feature = data.feature;
      check(scope, "African discovery feature renders after the shelves", Boolean(feature) && feature.rect.top >= (shelves[shelves.length - 1]?.rect.bottom ?? 0), `featureTop=${feature?.rect.top} lastShelfBottom=${shelves[shelves.length - 1]?.rect.bottom}`);
      check(scope, "African discovery has at least three accurate featured items", (feature?.items?.length ?? 0) >= 3, `${feature?.items?.length ?? 0} items`);
      const featureOffenders = (feature?.items ?? []).filter((item) => {
        const product = viewportProductBySlug.get(item.slug);
        const visibleName = product?.name?.replace(/^DEMO\s*[—-]\s*/i, "") ?? "";
        return (
          !product ||
          !EXPECTED_AFRICAN_CATEGORIES.has(product.category?.slug ?? "") ||
          !(item.text.includes(product.name) || (visibleName && item.text.includes(visibleName))) ||
          !item.image?.complete ||
          item.image?.naturalWidth <= 0 ||
          !samePath(item.image?.src, product.images?.[0]?.url ?? "")
        );
      });
      check(
        scope,
        "African feature names and images match the catalogue listings",
        featureOffenders.length === 0,
        featureOffenders.map((item) => item.slug).join(", ")
      );
      check(scope, "African feature makes no invented origin or maker claim", Boolean(feature) && !ORIGIN_CLAIM.test(feature.text), "origin wording");
      check(
        scope,
        "African feature category links are published taxonomy pages",
        (feature?.links ?? []).length >= 3 && feature.links.every((href) => allTaxonomySlugs.has((href || "").replace("/naijashop/c/", ""))),
        (feature?.links ?? []).join(", ")
      );

      check(scope, "wholesale panel renders after the African feature", Boolean(data.wholesale) && Boolean(feature) && data.wholesale.rect.top > feature.rect.bottom, `featureBottom=${feature?.rect.bottom} wholesaleTop=${data.wholesale?.rect.top}`);
      check(scope, "all product shelves precede wholesale", populated.every((shelf) => shelf.rect.bottom < (data.wholesale?.rect.top ?? Infinity)), `lastShelf=${shelves[shelves.length - 1]?.rect.bottom} wholesale=${data.wholesale?.rect.top}`);
      check(scope, "wholesale states the combined checkout limit honestly", Boolean(data.wholesale) && /does not run a combined wholesale checkout/i.test(data.wholesale.text), "wholesale copy");
      check(scope, "seller invitation is subordinate after wholesale", Boolean(data.seller) && data.seller.rect.top >= (data.wholesale?.rect.bottom ?? 0), `sellerTop=${data.seller?.rect.top} wholesaleBottom=${data.wholesale?.rect.bottom}`);
      check(scope, "no uncaught page errors", pageErrors.length === 0, pageErrors.join(" | "));

      const screenshotPath = path.join(OUT, `storefront-landing-${viewport.width}.png`);
      const topPath = path.join(OUT, `storefront-landing-${viewport.width}-top.png`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);
      await page.screenshot({ path: topPath, animations: "disabled" });
      await page.screenshot({ path: screenshotPath, fullPage: true, animations: "disabled" });

      const summary = {
        viewport: data.viewport,
        document: data.document,
        hero: data.hero,
        shortcutCount: shortcuts.length,
        shelfOrder: shelves.map((shelf) => shelf.id),
        shelfCounts: shelves.map((shelf) => ({ id: shelf.id, heading: shelf.heading, cards: shelf.cards.length, top: shelf.rect.top })),
        uniqueCards: new Set(allSlugs).size,
        totalCards: allSlugs.length,
        firstShelfTop: shelves[0]?.rect.top ?? null,
        firstCardTop: allCards[0]?.rect.top ?? null,
        featureTop: feature?.rect.top ?? null,
        featureItems: feature?.items?.length ?? 0,
        wholesaleTop: data.wholesale?.rect.top ?? null,
        sellerTop: data.seller?.rect.top ?? null,
        screenshots: { top: path.relative(process.cwd(), topPath), fullPage: path.relative(process.cwd(), screenshotPath) },
        pageErrors,
        consoleErrors: consoleErrors.slice(0, 10)
      };

      fs.writeFileSync(path.join(OUT, `storefront-landing-${viewport.width}.json`), JSON.stringify({ checks: checks.filter((entry) => entry.scope === scope), data: summary }, null, 2));
      console.log(`  ${scope}: ${shelves.length} shelves, ${allSlugs.length} unique cards, first shelf ${summary.firstShelfTop}px, first card ${summary.firstCardTop}px, wholesale ${summary.wholesaleTop}px`);
      await context.close();
    }

    // Real destination and cart-authorisation journey (guest session).
    const journeyContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const journeyPage = await journeyContext.newPage();
    const journeyErrors = [];
    journeyPage.on("pageerror", (error) => journeyErrors.push(String(error).slice(0, 240)));
    await journeyPage.goto(`${BASE}/naijashop`, { waitUntil: "load", timeout: 180000 });
    await journeyPage.waitForSelector("[data-category-card]", { timeout: 120000 });

    const shortcutHref = await journeyPage.locator("[data-category-card] a").first().getAttribute("href");
    await Promise.all([
      journeyPage.waitForURL((url) => url.pathname === shortcutHref, { timeout: 120000 }),
      journeyPage.locator("[data-category-card] a").first().click()
    ]);
    const categoryStatus = await journeyPage.evaluate(() => ({
      path: location.pathname,
      heading: document.querySelector("h1")?.textContent?.trim() ?? "",
      hasGrid: Boolean(document.querySelector('[data-product], [aria-label*="product" i]'))
    }));
    check(
      "journey",
      "category shortcut opens the real taxonomy page",
      categoryStatus.path === shortcutHref && categoryStatus.heading.length > 0,
      JSON.stringify(categoryStatus)
    );

    await journeyPage.goBack({ waitUntil: "load", timeout: 120000 });
    await journeyPage.waitForSelector("[data-storefront-shelf] [data-product]", { timeout: 120000 });
    const firstProductSlug = await journeyPage
      .locator("[data-storefront-shelf] [data-product]")
      .first()
      .getAttribute("data-product");
    await Promise.all([
      journeyPage.waitForURL((url) => url.pathname === `/product/${firstProductSlug}`, { timeout: 120000 }),
      journeyPage.locator("[data-storefront-shelf] [data-product] a[aria-label^='View']").first().click()
    ]);
    const productHeading = await journeyPage.evaluate(() => document.querySelector("h1")?.textContent?.trim() ?? "");
    const productRecord = productBySlug.get(firstProductSlug);
    check(
      "journey",
      "product card opens the real product page",
      Boolean(productRecord) && productHeading.includes(productRecord.name),
      `${firstProductSlug} → ${productHeading}`
    );

    await journeyPage.goBack({ waitUntil: "load", timeout: 120000 });
    await journeyPage.waitForSelector("[data-storefront-shelf] button", { timeout: 120000 });
    let cartStatus = null;
    journeyPage.on("response", (response) => {
      if (response.url().endsWith("/api/cart/items") && response.request().method() === "POST") cartStatus = response.status();
    });
    await journeyPage.locator("[data-storefront-shelf] button").first().click();
    const notice = journeyPage
      .locator('main [role="status"], main [role="alert"]')
      .filter({ hasText: /cart|sign in/i })
      .first();
    await notice.waitFor({ timeout: 60000 });
    const noticeText = (await notice.textContent())?.trim() ?? "";
    check(
      "journey",
      "guest add-to-cart surfaces the real sign-in or success state",
      /sign in to add items/i.test(noticeText) || /added to your cart/i.test(noticeText),
      `${noticeText}${cartStatus ? ` (HTTP ${cartStatus})` : ""}`
    );
    check("journey", "no uncaught errors during destination/cart journey", journeyErrors.length === 0, journeyErrors.join(" | "));
    await journeyContext.close();
  } finally {
    await browser.close();
  }

  const failed = failures();
  const result = {
    base: BASE,
    startedAt,
    finishedAt: new Date().toISOString(),
    productCount: products.length,
    taxonomySlugCount: allTaxonomySlugs.size,
    shelfLimit,
    passed: checks.length - failed.length,
    failed: failed.length,
    checks,
    screenshots: fs.readdirSync(OUT).filter((file) => file.endsWith(".png")).sort()
  };
  fs.writeFileSync(path.join(OUT, "audit.json"), JSON.stringify(result, null, 2));
  console.log(`\n${result.passed} checks passed, ${failed.length} failed. Evidence: ${path.relative(process.cwd(), OUT)}`);
  if (failed.length > 0) {
    for (const entry of failed) console.error(`- [${entry.scope}] ${entry.name}${entry.detail ? ` — ${entry.detail}` : ""}`);
    process.exitCode = 1;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
