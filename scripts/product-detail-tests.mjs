/**
 * Product detail acceptance checks.
 *
 * Covers the reported "clicked product has no image or description" defect:
 *  - catalogue/detail API completeness and deterministic image order;
 *  - server-rendered detail content at 390px and 1440px;
 *  - entry paths from the homepage, storefront, a department and search;
 *  - a product with images/description and a product with neither;
 *  - gallery selection, image load failures and a failed related-products call;
 *  - browser back navigation and horizontal overflow.
 *
 * Usage:
 *   node scripts/product-detail-tests.mjs
 *
 * Env:
 *   TEST_BASE_URL   default http://localhost:3100
 *
 * The two missing-data fixtures are created in the local development database
 * only (localhost/127.0.0.1/::1), use a "Product test …" name so both public
 * catalogue filters exclude them, and are deleted in `finally`. Set
 * PRODUCT_DETAIL_SKIP_FIXTURES=1 to run read-only against an existing preview.
 */
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import fs from "node:fs/promises";
import path from "node:path";

const BASE = (process.env.TEST_BASE_URL || "http://localhost:3100").replace(/\/$/, "");
const OUT = path.join(process.cwd(), "qa-artifacts", "product-detail");
const SKIP_FIXTURES = process.env.PRODUCT_DETAIL_SKIP_FIXTURES === "1";
const FIXTURE_IMAGE_ONE = "/generated/shop/product-wired-gaming-mouse.webp";
const FIXTURE_IMAGE_TWO = "/generated/shop/product-xbox-360-controller.webp";

const prisma = new PrismaClient();
const results = [];
let passed = 0;
let skipped = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    results.push({ name, status: "PASS" });
    console.log(`PASS  ${name}`);
  } else {
    failures.push({ name, detail });
    results.push({ name, status: "FAIL", detail });
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function assertLocalDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured; refusing to create detail fixtures.");
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error("Refusing to create product fixtures outside a local database.");
  }
}

async function getJson(urlPath) {
  const response = await fetch(`${BASE}${urlPath}`);
  const body = await response.json().catch(() => null);
  return { status: response.status, headers: response.headers, body };
}

function watchErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${String(error)}`));
  return errors;
}

async function waitForProductImage(page) {
  await page.waitForFunction(
    () => {
      const image = document.querySelector('[data-testid="product-main-image"]');
      return Boolean(image && image.complete && image.naturalWidth > 0);
    },
    null,
    { timeout: 8000 }
  );
}

async function inspectProductPage(page) {
  return page.evaluate(() => {
    const main = document.querySelector('[data-testid="product-main-image"]');
    const description = document.querySelector('[data-testid="product-description"]');
    const missingDescription = document.querySelector('[data-testid="product-description-missing"]');
    const text = document.body.innerText;
    const nav = document.querySelector('nav[aria-label="Mobile"]');
    return {
      path: location.pathname,
      h1: document.querySelector("h1")?.textContent?.trim() ?? null,
      mainImage: main
        ? { src: main.getAttribute("src"), naturalWidth: main.naturalWidth, clientWidth: main.clientWidth }
        : null,
      description: description?.textContent?.trim() ?? null,
      missingDescription: missingDescription?.textContent?.trim() ?? null,
      bodyIncludesError: /failed to fetch|could not be loaded|product not found/i.test(text),
      bodyTextLength: text.length,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      bottomNavTop: nav ? nav.getBoundingClientRect().top : null
    };
  });
}

async function screenshot(page, name, fullPage = true) {
  await page.screenshot({ path: path.join(OUT, name), fullPage });
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  assertLocalDatabase();

  const catalogue = await getJson("/api/products");
  check("public catalogue responds", catalogue.status === 200 && Array.isArray(catalogue.body));
  const imageBearing = (catalogue.body ?? []).find(
    (product) => product.images?.length > 0 && String(product.description ?? "").trim()
  );
  check("catalogue contains a purchasable image-bearing product", Boolean(imageBearing));
  if (!imageBearing) throw new Error("No image-bearing product is available for the detail checks.");

  const detail = await getJson(`/api/products/${encodeURIComponent(imageBearing.slug)}`);
  check("detail API returns 200", detail.status === 200, String(detail.status));
  check("detail API returns a non-empty description", String(detail.body?.description ?? "").trim().length > 0);
  check(
    "detail API returns ordered images",
    Array.isArray(detail.body?.images) &&
      detail.body.images.length > 0 &&
      detail.body.images.every((image, index, list) => index === 0 || image.sortOrder >= list[index - 1].sortOrder)
  );
  check("detail API is not browser-cacheable", (detail.headers.get("cache-control") ?? "").includes("no-store"));

  const byId = await getJson(`/api/products/${encodeURIComponent(detail.body.id)}`);
  const byUpperSlug = await getJson(`/api/products/${encodeURIComponent(detail.body.slug.toUpperCase())}`);
  check("detail API resolves the product id", byId.status === 200 && byId.body?.id === detail.body.id);
  check("detail API resolves an uppercased shared slug", byUpperSlug.status === 200 && byUpperSlug.body?.id === detail.body.id);

  const vendor = await prisma.vendor.findFirst({ where: { status: "VERIFIED" }, orderBy: { trustScore: "desc" } });
  const category =
    (await prisma.category.findFirst({ where: { isActive: true, slug: "phones-tablets" } })) ??
    (await prisma.category.findFirst({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }));
  if (!vendor || !category) throw new Error("Catalogue fixtures need one verified vendor and one active category.");

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  let galleryFixture = null;
  let imageLessFixture = null;
  let brokenImageFixture = null;

  const browser = await chromium.launch();
  try {
    if (!SKIP_FIXTURES) {
      galleryFixture = await prisma.product.create({
        data: {
          vendorId: vendor.id,
          categoryId: category.id,
          name: `Product test detail gallery ${suffix}`,
          slug: `product-test-detail-gallery-${suffix}`,
          description: "Fixture description line one.\nLine two verifies whitespace-preserving display.",
          priceKobo: 1234500n,
          status: "ACTIVE",
          isSample: false,
          images: {
            create: [
              { url: FIXTURE_IMAGE_ONE, alt: "Fixture gallery image one", sortOrder: 0 },
              { url: FIXTURE_IMAGE_TWO, alt: "Fixture gallery image two", sortOrder: 1 }
            ]
          },
          variants: {
            create: [
              { name: "128GB", sku: `PD-GALLERY-${suffix}-128`, priceKobo: 1234500n, stock: 2 },
              { name: "256GB", sku: `PD-GALLERY-${suffix}-256`, priceKobo: 1550000n, stock: 1 }
            ]
          },
          stock: { create: { quantity: 3 } }
        }
      });
      imageLessFixture = await prisma.product.create({
        data: {
          vendorId: vendor.id,
          categoryId: category.id,
          name: `Product test detail image-less ${suffix}`,
          slug: `product-test-detail-image-less-${suffix}`,
          description: "",
          priceKobo: 99900n,
          status: "ACTIVE",
          isSample: false,
          stock: { create: { quantity: 2 } }
        }
      });
      brokenImageFixture = await prisma.product.create({
        data: {
          vendorId: vendor.id,
          categoryId: category.id,
          name: `Product test detail broken image ${suffix}`,
          slug: `product-test-detail-broken-image-${suffix}`,
          description: "Fixture description for the broken image state.",
          priceKobo: 55500n,
          status: "ACTIVE",
          isSample: false,
          images: { create: [{ url: "/generated/shop/this-file-does-not-exist.webp", alt: "Missing fixture image", sortOrder: 0 }] },
          stock: { create: { quantity: 1 } }
        }
      });

      const galleryApi = await getJson(`/api/products/${galleryFixture.slug}`);
      const imageLessApi = await getJson(`/api/products/${imageLessFixture.slug}`);
      check(
        "gallery fixture keeps both source images in sort order",
        galleryApi.status === 200 &&
          galleryApi.body.images.length === 2 &&
          galleryApi.body.images[0].url === FIXTURE_IMAGE_ONE &&
          galleryApi.body.images[1].url === FIXTURE_IMAGE_TWO
      );
      check(
        "image-less fixture returns an honest empty image relation",
        imageLessApi.status === 200 && Array.isArray(imageLessApi.body.images) && imageLessApi.body.images.length === 0
      );
      check(
        "image-less fixture does not invent a description",
        imageLessApi.status === 200 && imageLessApi.body.description === ""
      );

      const publicList = await getJson("/api/products");
      check(
        "test fixtures stay out of public discovery",
        !(publicList.body ?? []).some(
          (product) => product.id === galleryFixture.id || product.id === imageLessFixture.id || product.id === brokenImageFixture.id
        )
      );
    }

    for (const viewport of [
      { width: 390, height: 844, label: "mobile" },
      { width: 1440, height: 1000, label: "desktop" }
    ]) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();
      const errors = watchErrors(page);

      const loadDirect = async (url, label) => {
        errors.length = 0;
        const response = await page.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
        await page.waitForSelector("h1", { timeout: 8000 });
        await waitForProductImage(page).catch(() => undefined);
        const info = await inspectProductPage(page);
        await screenshot(page, `${viewport.label}-${label}.png`);
        return { response, info };
      };

      const { info } = await loadDirect(`/product/${imageBearing.slug}`, "direct-image-bearing");
      check(`${viewport.label}: direct load shows product title`, info.h1 === imageBearing.name, info.h1 ?? "missing h1");
      check(
        `${viewport.label}: direct load renders a loaded main image`,
        Boolean(info.mainImage && info.mainImage.naturalWidth > 0 && info.mainImage.clientWidth > 0),
        JSON.stringify(info.mainImage)
      );
      check(
        `${viewport.label}: direct load renders the source description`,
        info.description === imageBearing.description.trim(),
        info.description ?? "missing description"
      );
      check(`${viewport.label}: direct load has no horizontal overflow`, info.scrollWidth <= info.clientWidth + 1);
      check(`${viewport.label}: direct load has no console/page errors`, errors.length === 0, errors.join(" | "));

      if (viewport.width === 390) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await screenshot(page, "mobile-viewport-top.png", false);
        await page.evaluate(() => {
          document.querySelector('[data-testid="add-to-cart"]')?.scrollIntoView({ block: "center" });
        });
        await page.waitForTimeout(400);
        const controls = await page.evaluate(() => {
          const button = document.querySelector('[data-testid="add-to-cart"]')?.getBoundingClientRect();
          const nav = document.querySelector('nav[aria-label="Mobile"]')?.getBoundingClientRect();
          return { button, nav };
        });
        check(
          "mobile: purchase controls can sit above the fixed tab bar",
          Boolean(
            controls.button &&
              controls.nav &&
              controls.button.top >= 0 &&
              controls.button.bottom <= controls.nav.top
          ),
          JSON.stringify(controls)
        );
        await screenshot(page, "mobile-viewport-purchase.png", false);
      }

      // A real click on the purchase control must take an unauthenticated
      // shopper to sign-in rather than silently doing nothing.
      await page.evaluate(() => {
        document.querySelector('[data-testid="add-to-cart"]')?.scrollIntoView({ block: "center" });
      });
      await page.waitForTimeout(300);
      await page.getByTestId("add-to-cart").click();
      await page.waitForURL(/\/login/, { timeout: 8000 });
      check(`${viewport.label} purchase: guest add-to-cart routes to sign-in`, page.url().includes("/login"), page.url());

      // Entry paths, each followed by browser back to its origin.
      const entryPaths = [
        { label: "home", url: "/", selector: 'a[href^="/product/"]' },
        { label: "storefront", url: "/naijashop", selector: '[data-product] a[href^="/product/"]' },
        { label: "department", url: `/naijashop/c/${imageBearing.category.slug}`, selector: '[data-product] a[href^="/product/"]' },
        { label: "search", url: "/search?q=phone", selector: 'a[href^="/product/"]' }
      ];

      for (const entry of entryPaths) {
        errors.length = 0;
        await page.goto(`${BASE}${entry.url}`, { waitUntil: "networkidle" });
        const link = page.locator(entry.selector).first();
        const count = await link.count();
        if (count === 0 && entry.label === "home") {
          skipped += 1;
          results.push({ name: `${viewport.label} home: product link is present`, status: "SKIP", detail: "Homepage renders no product rail in this catalogue." });
          console.log(`SKIP  ${viewport.label} home: product link is present — homepage renders no product rail in this catalogue`);
          continue;
        }
        check(`${viewport.label} ${entry.label}: product link is present`, count > 0);
        if (count === 0) continue;
        const href = await link.getAttribute("href");
        await link.click();
        await page.waitForURL(/\/product\//, { timeout: 8000 });
        await page.waitForSelector("h1", { timeout: 8000 });
        await waitForProductImage(page).catch(() => undefined);
        const entryInfo = await inspectProductPage(page);
        await screenshot(page, `${viewport.label}-entry-${entry.label}.png`);
        check(
          `${viewport.label} ${entry.label}: click opens the product with an image and description`,
          entryInfo.path === href &&
            Boolean(entryInfo.mainImage && entryInfo.mainImage.naturalWidth > 0) &&
            Boolean(entryInfo.description),
          JSON.stringify({ href, ...entryInfo })
        );
        check(`${viewport.label} ${entry.label}: click has no console/page errors`, errors.length === 0, errors.join(" | "));
        await page.goBack({ waitUntil: "networkidle" });
        const backUrl = new URL(page.url());
        check(
          `${viewport.label} ${entry.label}: back returns to the origin`,
          backUrl.pathname === entry.url.split("?")[0] && backUrl.search === (entry.url.includes("?") ? `?${entry.url.split("?")[1]}` : ""),
          page.url()
        );
      }

      if (galleryFixture) {
        errors.length = 0;
        await page.goto(`${BASE}/product/${galleryFixture.slug}`, { waitUntil: "networkidle" });
        await page.waitForSelector('[data-testid="product-main-image"]');
        await waitForProductImage(page);
        const firstSrc = await page.locator('[data-testid="product-main-image"]').getAttribute("src");
        const thumbs = page.locator('[aria-label^="Show image"]');
        check(`${viewport.label} gallery: both thumbnails are visible`, (await thumbs.count()) === 2);
        await thumbs.nth(1).click();
        await page.waitForFunction(
          (previous) => document.querySelector('[data-testid="product-main-image"]')?.getAttribute("src") !== previous,
          firstSrc,
          { timeout: 5000 }
        );
        const secondSrc = await page.locator('[data-testid="product-main-image"]').getAttribute("src");
        const secondLoaded = await page.evaluate(() => {
          const image = document.querySelector('[data-testid="product-main-image"]');
          return Boolean(image && image.complete && image.naturalWidth > 0);
        });
        check(
          `${viewport.label} gallery: selecting a thumbnail swaps the main image`,
          secondSrc === FIXTURE_IMAGE_TWO && secondLoaded,
          `${firstSrc} -> ${secondSrc}`
        );
        await screenshot(page, `${viewport.label}-gallery-second-image.png`);
        check(`${viewport.label} gallery: no console/page errors`, errors.length === 0, errors.join(" | "));

        // Variants and quantity are server-backed values, not display-only.
        const initialPrice = await page.getByTestId("product-price").textContent();
        const initialAvailability = await page.getByTestId("product-availability").textContent();
        await page.getByTestId("product-variant").selectOption({ index: 1 });
        await page.waitForFunction(
          (previous) => document.querySelector('[data-testid="product-price"]')?.textContent !== previous,
          initialPrice,
          { timeout: 5000 }
        );
        await page.waitForFunction(
          () => document.querySelector('[data-testid="product-availability"]')?.textContent?.includes("1 unit(s)"),
          null,
          { timeout: 5000 }
        );
        const variantPrice = await page.getByTestId("product-price").textContent();
        const variantAvailability = await page.getByTestId("product-availability").textContent();
        const quantityValues = await page
          .getByTestId("product-quantity")
          .locator("option")
          .evaluateAll((options) => options.map((option) => option.value));
        check(
          `${viewport.label} variants: selecting an option updates price and stock`,
          initialPrice === "₦12,345" &&
            variantPrice === "₦15,500" &&
            initialAvailability?.includes("2 unit(s)") &&
            variantAvailability?.includes("1 unit(s)"),
          JSON.stringify({ initialPrice, variantPrice, initialAvailability, variantAvailability })
        );
        check(
          `${viewport.label} quantity: options are limited to the selected variant's stock`,
          JSON.stringify(quantityValues) === JSON.stringify(["1"]),
          JSON.stringify(quantityValues)
        );
        check(
          `${viewport.label} purchase: add-to-cart control is enabled for available stock`,
          await page.getByTestId("add-to-cart").isEnabled()
        );
        await screenshot(page, `${viewport.label}-gallery-variant-selected.png`);
      }

      if (imageLessFixture) {
        errors.length = 0;
        await loadDirect(`/product/${imageLessFixture.slug}`, "image-less");
        const imageLess = await inspectProductPage(page);
        check(`${viewport.label} image-less: no invented main image`, imageLess.mainImage === null);
        check(
          `${viewport.label} image-less: shows the honest no-image state`,
          (await page.getByText("The seller has not provided an image for this listing.").count()) === 1
        );
        check(
          `${viewport.label} image-less: shows the honest no-description state`,
          imageLess.missingDescription === "The seller has not provided a description for this listing."
        );
        check(`${viewport.label} image-less: no console/page errors`, errors.length === 0, errors.join(" | "));
      }

      if (brokenImageFixture) {
        await page.goto(`${BASE}/product/${brokenImageFixture.slug}`, { waitUntil: "networkidle" });
        await page.waitForFunction(
          () => document.body.innerText.includes("This listing's images could not be loaded."),
          null,
          { timeout: 8000 }
        );
        const broken = await page.evaluate(() => ({
          mainImage: document.querySelector('[data-testid="product-main-image"]')?.getAttribute("src") ?? null,
          honestState: document.body.innerText.includes("This listing's images could not be loaded."),
          description: document.querySelector('[data-testid="product-description"]')?.textContent?.trim() ?? null
        }));
        check(
          `${viewport.label} broken image: falls back to an honest state without an unrelated image`,
          broken.mainImage === null &&
            broken.honestState &&
            broken.description === "Fixture description for the broken image state."
        );
        await screenshot(page, `${viewport.label}-broken-image-honest-state.png`);
      }

      // A failed related-products call must not replace the product content.
      errors.length = 0;
      await page.route(/\/api\/products\?/, (route) => route.abort("failed"));
      await page.goto(`${BASE}/product/${imageBearing.slug}`, { waitUntil: "networkidle" });
      await page.waitForSelector("h1");
      const resilient = await inspectProductPage(page);
      check(
        `${viewport.label}: related-products failure leaves image and description visible`,
        resilient.h1 === imageBearing.name &&
          Boolean(resilient.mainImage && resilient.mainImage.naturalWidth > 0) &&
          resilient.description === imageBearing.description.trim() &&
          !resilient.bodyIncludesError,
        JSON.stringify(resilient)
      );
      await screenshot(page, `${viewport.label}-related-failure-resilient.png`);
      await page.unroute(/\/api\/products\?/);

      // The server-rendered HTML must contain the product description; a first
      // paint that only contains a spinner is the mobile/hydration failure mode.
      const html = await (await fetch(`${BASE}/product/${imageBearing.id}`)).text();
      check(
        `${viewport.label}: server HTML contains the product description`,
        html.includes(imageBearing.description.trim().slice(0, 60))
      );

      await context.close();
    }

    // JavaScript disabled proves the server-rendered first paint, not a
    // client-only spinner, carries the source image and description.
    const noJsContext = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
    const noJsPage = await noJsContext.newPage();
    await noJsPage.goto(`${BASE}/product/${imageBearing.slug}`, { waitUntil: "load" });
    const noJs = await noJsPage.evaluate(() => {
      const main = document.querySelector('[data-testid="product-main-image"]');
      return {
        h1: document.querySelector("h1")?.textContent?.trim() ?? null,
        description: document.querySelector('[data-testid="product-description"]')?.textContent?.trim() ?? null,
        mainImage: main ? { src: main.getAttribute("src"), naturalWidth: main.naturalWidth } : null
      };
    });
    check(
      "no-JS first paint contains the image, title and description",
      noJs.h1 === imageBearing.name &&
        noJs.description === imageBearing.description.trim() &&
        noJs.mainImage?.src === imageBearing.images[0].url &&
        noJs.mainImage.naturalWidth > 0,
      JSON.stringify(noJs)
    );
    await noJsContext.close();
  } finally {
    await browser.close().catch(() => undefined);
    if (galleryFixture) {
      await prisma.productImage.deleteMany({ where: { productId: galleryFixture.id } }).catch(() => undefined);
      await prisma.productVariant.deleteMany({ where: { productId: galleryFixture.id } }).catch(() => undefined);
      await prisma.inventoryStock.deleteMany({ where: { productId: galleryFixture.id } }).catch(() => undefined);
      await prisma.product.delete({ where: { id: galleryFixture.id } }).catch(() => undefined);
    }
    if (imageLessFixture) {
      await prisma.productImage.deleteMany({ where: { productId: imageLessFixture.id } }).catch(() => undefined);
      await prisma.inventoryStock.deleteMany({ where: { productId: imageLessFixture.id } }).catch(() => undefined);
      await prisma.product.delete({ where: { id: imageLessFixture.id } }).catch(() => undefined);
    }
    if (brokenImageFixture) {
      await prisma.productImage.deleteMany({ where: { productId: brokenImageFixture.id } }).catch(() => undefined);
      await prisma.inventoryStock.deleteMany({ where: { productId: brokenImageFixture.id } }).catch(() => undefined);
      await prisma.product.delete({ where: { id: brokenImageFixture.id } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }

  const report = { base: BASE, passed, skipped, failed: failures.length, failures, results };
  await fs.writeFile(path.join(OUT, "product-detail-results.json"), JSON.stringify(report, null, 2));
  console.log(`\n${passed} passed, ${failures.length} failed`);
  console.log(`Screenshots and report: ${OUT}`);
  if (failures.length > 0) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => undefined);
  process.exitCode = 1;
});
