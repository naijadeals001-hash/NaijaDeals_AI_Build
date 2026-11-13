/**
 * REVIEW-only NaijaShop catalogue batch A.
 *
 * Publishes six demonstration products into existing, active departments using
 * approved Shop assets that were previously unused:
 *   Phones & Tablets          — Apple iPhone 5s, Apple iPhone 6 (silver)
 *   Computers                 — EIZO FORIS FG2421 monitor
 *   Electronics & Appliances  — digital SLR camera, square-face smartwatch
 *   Fashion & Accessories     — red patent leather baby shoes
 *
 * Every row is created through the existing Control Center catalogue API
 * (`POST /api/admin/catalogue/products`, then `validate` and `publish`), never
 * with SQL. All rows are DEMO (`isDemo=true`), NGN, country NG, stock 25 and
 * carry illustrative descriptions that explicitly do not claim current stock,
 * real condition or seller specifications.
 *
 * Idempotent: an existing DEMO row with the same slug, department and image is
 * not duplicated. An ACTIVE row is verified and reported as skipped; a DRAFT
 * row left by an interrupted earlier run is validated and published. A row in
 * any other state, or a slug/image collision with a different record, aborts
 * that item instead of overwriting it.
 *
 * Verification (per product):
 *   - admin catalogue row: ACTIVE, isDemo, target department, NGN/NG, stock 25,
 *     one image with the expected URL and alt text;
 *   - asset HTTP 200 + image/webp and a decodable local WebP;
 *   - `/product/<slug>` HTTP 200 containing the image and alt text;
 *   - `/api/products?q=…&category=…` returns the row with image alt/stock;
 *   - Chromium: product page image naturalWidth > 0 with the exact alt text;
 *   - Chromium: department page and Shop search render the card and image.
 *
 * Credentials are read from qa-artifacts/review-basket/.admin-credential and
 * are never printed. No payment, provider call, generation or image spend is
 * made. This script does not deploy or push.
 *
 * Usage:
 *   node scripts/review-catalogue-batch-a.cjs
 *   REVIEW_BASE_URL=http://localhost:3047 node scripts/review-catalogue-batch-a.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const sharp = require("sharp");

const BASE = process.env.REVIEW_BASE_URL || "http://localhost:3047";
const CREDENTIAL_FILE = "qa-artifacts/review-basket/.admin-credential";
const PUBLIC_ROOT = path.resolve(process.cwd(), "public");
const QUANTITY = 25;
const LOW_STOCK = 3;
const CURRENCY = "NGN";
const COUNTRY = "NG";
const DEMO_NOTE = "DEMO — demonstration inventory, not live supply";

const BATCH = [
  {
    key: "iphone-5s",
    departmentSlug: "phones-tablets",
    name: "DEMO — Apple iPhone 5s, gold",
    slug: "demo-apple-iphone-5s",
    description:
      "Demonstration listing. Older-model Apple iPhone 5s shown in a gold finish with the screen off. Illustrative historical specification: 4-inch display and circular Home button. This is not current stock; condition, storage capacity, battery health and network compatibility are not represented.",
    priceKobo: 5500000,
    searchTerm: "iPhone 5s",
    image: {
      url: "/generated/shop/product-apple-iphone-5s.webp",
      alt: "Gold Apple iPhone 5s smartphone with a 4-inch screen and circular Home button"
    }
  },
  {
    key: "iphone-6-silver",
    departmentSlug: "phones-tablets",
    name: "DEMO — Apple iPhone 6, silver",
    slug: "demo-apple-iphone-6-silver",
    description:
      "Demonstration listing. Older-model Apple iPhone 6 shown in a silver finish with a blue gradient wallpaper. Illustrative historical specification: 4.7-inch display and rounded aluminium body. This is not current stock; condition, storage capacity, battery health and network compatibility are not represented.",
    priceKobo: 7200000,
    searchTerm: "iPhone 6",
    image: {
      url: "/generated/shop/product-apple-iphone-6-silver.webp",
      alt: "Silver Apple iPhone 6 smartphone with a black bezel showing a blue gradient wallpaper"
    }
  },
  {
    key: "eizo-monitor",
    departmentSlug: "computers",
    name: "DEMO — EIZO FORIS FG2421 gaming monitor, 24-inch",
    slug: "demo-eizo-foris-fg2421-monitor",
    description:
      "Demonstration listing. Representative EIZO FORIS FG2421 gaming monitor with a thin matte-black bezel and height-adjustable stand. Illustrative specification: 24-inch display. Panel technology, refresh rate, port configuration, included cables and condition are not represented by this DEMO listing.",
    priceKobo: 38500000,
    searchTerm: "EIZO",
    image: {
      url: "/generated/shop/product-eizo-foris-fg2421-monitor.webp",
      alt: "Black EIZO FORIS FG2421 monitor with a thin bezel, purple gradient on screen and height-adjustable stand"
    }
  },
  {
    key: "dslr-camera",
    departmentSlug: "electronics-appliances",
    name: "DEMO — Digital SLR camera with zoom lens",
    slug: "demo-digital-slr-camera-with-zoom-lens",
    description:
      "Demonstration listing. Representative unbranded black APS-C digital SLR camera with a fixed zoom lens in a three-quarter view. Illustrative specification: optical viewfinder housing, top mode dial and hot shoe. Brand, lens mount, sensor resolution and included accessories are not represented by this DEMO listing.",
    priceKobo: 65000000,
    searchTerm: "SLR camera",
    image: {
      url: "/generated/shop/product-digital-camera-dslr.webp",
      alt: "Black digital SLR camera with a zoom lens, optical viewfinder and top mode dial"
    }
  },
  {
    key: "smartwatch",
    departmentSlug: "electronics-appliances",
    name: "DEMO — Smartwatch with black silicone strap",
    slug: "demo-smartwatch-black-silicone-strap",
    description:
      "Demonstration listing. Representative unbranded smartwatch with a square display, dark casing and black silicone strap. Illustrative specification: touch display and side crown. Brand, connectivity, battery life and fitness features are not represented by this DEMO listing.",
    priceKobo: 8500000,
    searchTerm: "smartwatch",
    image: {
      url: "/generated/shop/product-smartwatch.webp",
      alt: "Black unbranded smartwatch with a square display and black silicone strap"
    }
  },
  {
    key: "baby-shoes",
    departmentSlug: "fashion-accessories",
    name: "DEMO — Red patent leather baby shoes",
    slug: "demo-red-patent-leather-baby-shoes",
    description:
      "Demonstration listing. A pair of red patent-finish baby shoes with hook-and-loop straps, rounded toes and pale contrasting soles. Illustrative specification: soft-soled infant shoe. Brand, exact materials, sizes and fit are not represented by this DEMO listing.",
    priceKobo: 1850000,
    searchTerm: "patent leather baby shoes",
    image: {
      url: "/generated/shop/product-red-patent-leather-baby-shoes.webp",
      alt: "Pair of red patent leather baby shoes with hook-and-loop straps and pale soles"
    }
  }
];

const checks = [];
const observations = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok: Boolean(ok), detail });
  return Boolean(ok);
}
function observe(message) {
  observations.push(message);
}

function readCredential() {
  const raw = fs.readFileSync(CREDENTIAL_FILE, "utf8").trim();
  const [email, password] = raw.split(/\r?\n/);
  if (!email || !password) throw new Error("Stored admin credential is incomplete.");
  return { email, password };
}

function parseSessionCookie(response) {
  const raw =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()[0]
      : response.headers.get("set-cookie");
  if (!raw) throw new Error("Login response did not set a session cookie.");
  const [pair] = raw.split(";");
  const separator = pair.indexOf("=");
  if (separator <= 0) throw new Error("Login session cookie is malformed.");
  return { name: pair.slice(0, separator), value: pair.slice(separator + 1) };
}

async function readJson(response) {
  const text = await response.text();
  try {
    return { body: JSON.parse(text), text };
  } catch {
    return { body: null, text };
  }
}

function localAssetPath(imageUrl) {
  return path.resolve(PUBLIC_ROOT, imageUrl.replace(/^\/+/, ""));
}

/**
 * Next's client router can abort a document navigation while hydrating (seen
 * once as ERR_ABORTED on a department page). Retry the document request a
 * bounded number of times instead of failing the whole batch on a transient
 * navigation race; the DOM assertions below still have to pass.
 */
async function navigate(page, url, attempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      return { response, error: null, attempt };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await page.waitForTimeout(500 * attempt);
    }
  }
  return { response: null, error: lastError, attempt: attempts };
}

async function inspectAsset(spec) {
  const file = localAssetPath(spec.image.url);
  const exists = fs.existsSync(file);
  check(`asset exists on disk: ${spec.image.url}`, exists, file);
  if (!exists) return null;
  try {
    const metadata = await sharp(file).metadata();
    const ok = metadata.format === "webp" && metadata.width > 0 && metadata.height > 0;
    check(
      `asset decodes as WebP: ${spec.image.url}`,
      ok,
      `${metadata.format ?? "unknown"} ${metadata.width ?? 0}x${metadata.height ?? 0}`
    );
    return metadata;
  } catch (error) {
    check(`asset decodes as WebP: ${spec.image.url}`, false, error.message);
    return null;
  }
}

async function main() {
  const { email, password } = readCredential();

  const home = await fetch(BASE, { redirect: "manual" });
  check("canonical REVIEW preview responds", home.status === 200, `status=${home.status} base=${BASE}`);
  if (home.status !== 200) throw new Error("Preview is not serving HTTP 200.");

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email, password })
  });
  check("admin session established from stored credential", login.status === 200, `status=${login.status}`);
  if (login.status !== 200) throw new Error("Admin login failed; credentials or preview are not usable.");
  const cookie = parseSessionCookie(login);
  const cookieHeader = `${cookie.name}=${cookie.value}`;

  async function api(pathname, { method = "GET", data } = {}) {
    const response = await fetch(`${BASE}${pathname}`, {
      method,
      headers: {
        Cookie: cookieHeader,
        ...(data === undefined ? {} : { "Content-Type": "application/json", Origin: BASE })
      },
      body: data === undefined ? undefined : JSON.stringify(data),
      redirect: "manual"
    });
    const { body, text } = await readJson(response);
    return { status: response.status, body, text, headers: response.headers };
  }

  async function adminCatalogue() {
    const result = await api("/api/admin/catalogue");
    if (result.status !== 200 || !result.body) {
      throw new Error(`Admin catalogue unavailable (status=${result.status}).`);
    }
    return result.body;
  }

  async function publicApi(pathname) {
    const response = await fetch(`${BASE}${pathname}`);
    const { body, text } = await readJson(response);
    return { status: response.status, body, text, headers: response.headers };
  }

  function counts(catalogue) {
    return {
      departments: catalogue.departments.filter((entry) => entry.isActive).length,
      products: catalogue.products.filter((entry) => entry.status === "ACTIVE").length
    };
  }

  const beforeCatalogue = await adminCatalogue();
  const before = counts(beforeCatalogue);
  check(
    "catalogue snapshot captured before any mutation",
    before.departments > 0 && before.products > 0,
    `${before.departments} active departments / ${before.products} active products`
  );

  const departmentsBySlug = new Map(beforeCatalogue.departments.map((entry) => [entry.slug, entry]));
  for (const slug of [...new Set(BATCH.map((spec) => spec.departmentSlug))]) {
    const department = departmentsBySlug.get(slug);
    check(
      `target department exists and is active: ${slug}`,
      Boolean(department && department.isActive),
      department ? `id=${department.id} active=${department.isActive}` : "missing"
    );
  }

  // Batch assets must not already belong to another record.
  const imageUsage = new Map();
  for (const product of beforeCatalogue.products) {
    for (const image of product.images ?? []) {
      if (!imageUsage.has(image.url)) imageUsage.set(image.url, []);
      imageUsage.get(image.url).push(product.slug);
    }
  }
  for (const spec of BATCH) {
    const users = (imageUsage.get(spec.image.url) ?? []).filter((slug) => slug !== spec.slug);
    check(
      `asset is unused before the run: ${spec.image.url}`,
      users.length === 0,
      users.length ? `used by ${users.join(", ")}` : "unused"
    );
  }

  const results = [];
  const createdIds = [];

  for (const spec of BATCH) {
    const itemChecksStart = checks.length;
    const department = departmentsBySlug.get(spec.departmentSlug);
    const result = {
      key: spec.key,
      name: spec.name,
      slug: spec.slug,
      department: department ? { id: department.id, name: department.name, slug: department.slug } : null,
      image: spec.image,
      priceKobo: spec.priceKobo,
      quantity: QUANTITY,
      id: null,
      action: "pending",
      checks: []
    };
    results.push(result);

    await inspectAsset(spec);
    if (!department) {
      check(`department available for ${spec.slug}`, false, "department missing");
      result.action = "failed";
      result.checks = checks.slice(itemChecksStart);
      continue;
    }

    const catalogueNow = await adminCatalogue();
    const existing = catalogueNow.products.find((product) => product.slug === spec.slug);

    if (existing) {
      result.id = existing.id;
      const sameImage = (existing.images ?? []).some((image) => image.url === spec.image.url);
      const sameDepartment = existing.category?.id === department.id;
      const compatible = existing.isDemo === true && sameImage && sameDepartment;
      check(
        `existing row ${spec.slug} is a compatible DEMO record`,
        compatible,
        `status=${existing.status} demo=${existing.isDemo} image=${sameImage} department=${sameDepartment}`
      );
      if (!compatible) {
        result.action = "failed";
        result.checks = checks.slice(itemChecksStart);
        continue;
      }
      if (existing.status === "ACTIVE") {
        result.action = "skipped-existing-active";
        check(`existing row ${spec.slug} is already published`, true, `id=${existing.id}`);
      } else if (existing.status === "DRAFT") {
        const validation = await api("/api/admin/catalogue/products", {
          method: "PATCH",
          data: { id: existing.id, action: "validate" }
        });
        check(
          `resumed draft ${spec.slug} passes validation`,
          validation.status === 200 && validation.body?.valid === true,
          `status=${validation.status} valid=${validation.body?.valid} issues=${(validation.body?.issues ?? []).length}`
        );
        const published = await api("/api/admin/catalogue/products", {
          method: "PATCH",
          data: { id: existing.id, action: "publish" }
        });
        check(
          `resumed draft ${spec.slug} published`,
          published.status === 200 && published.body?.status === "ACTIVE",
          `status=${published.status} product=${published.body?.status ?? "none"}`
        );
        result.action = published.status === 200 ? "resumed-draft-published" : "failed";
      } else {
        check(`existing row ${spec.slug} is in a publishable state`, false, `status=${existing.status}`);
        result.action = "failed";
      }
      result.checks = checks.slice(itemChecksStart);
      if (result.action === "failed") continue;
      continue;
    }

    const created = await api("/api/admin/catalogue/products", {
      method: "POST",
      data: {
        name: spec.name,
        slug: spec.slug,
        description: spec.description,
        priceKobo: spec.priceKobo,
        currency: CURRENCY,
        countryCode: COUNTRY,
        categoryId: department.id,
        quantity: QUANTITY,
        lowStockLevel: LOW_STOCK,
        images: [{ url: spec.image.url, alt: spec.image.alt }],
        isDemo: true
      }
    });
    const createdOk =
      created.status === 201 &&
      created.body?.status === "DRAFT" &&
      created.body?.isDemo === true &&
      created.body?.countryCode === COUNTRY;
    check(
      `created ${spec.slug} as an explicit-currency DEMO draft`,
      createdOk,
      `status=${created.status} product=${created.body?.status ?? "none"} country=${created.body?.countryCode ?? "none"} code=${created.body?.code ?? "none"}`
    );
    if (!created.body?.id) {
      result.action = "failed";
      result.checks = checks.slice(itemChecksStart);
      continue;
    }
    result.id = created.body.id;
    createdIds.push(created.body.id);

    const validation = await api("/api/admin/catalogue/products", {
      method: "PATCH",
      data: { id: created.body.id, action: "validate" }
    });
    check(
      `draft ${spec.slug} passes server validation`,
      validation.status === 200 && validation.body?.valid === true,
      `status=${validation.status} valid=${validation.body?.valid} issues=${(validation.body?.issues ?? []).join("; ") || "none"}`
    );
    if (validation.status !== 200 || validation.body?.valid !== true) {
      result.action = "failed-draft-left";
      result.checks = checks.slice(itemChecksStart);
      continue;
    }

    const published = await api("/api/admin/catalogue/products", {
      method: "PATCH",
      data: { id: created.body.id, action: "publish" }
    });
    check(
      `published ${spec.slug} through the Control Center API`,
      published.status === 200 && published.body?.status === "ACTIVE",
      `status=${published.status} product=${published.body?.status ?? "none"} code=${published.body?.code ?? "none"}`
    );
    result.action = published.status === 200 ? "created-published" : "failed-draft-left";
    result.checks = checks.slice(itemChecksStart);
  }

  // Full verification after every mutation, including skipped rows.
  const afterCatalogue = await adminCatalogue();
  const after = counts(afterCatalogue);

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name: cookie.name, value: cookie.value, url: BASE }]);
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  for (const spec of BATCH) {
    const result = results.find((entry) => entry.key === spec.key);
    const start = checks.length;
    const row = afterCatalogue.products.find((product) => product.slug === spec.slug);
    const department = departmentsBySlug.get(spec.departmentSlug);

    check(`admin row exists after the run: ${spec.slug}`, Boolean(row), row ? `id=${row.id}` : "missing");
    if (!row) {
      result.checks = result.checks.concat(checks.slice(start));
      continue;
    }
    result.id = row.id;
    check(
      `admin row ${spec.slug} is ACTIVE`,
      row.status === "ACTIVE",
      `status=${row.status}`
    );
    check(
      `admin row ${spec.slug} is DEMO`,
      row.isDemo === true && row.moderationNote === DEMO_NOTE,
      `isDemo=${row.isDemo} moderationNote=${row.moderationNote ?? "none"}`
    );
    check(
      `admin row ${spec.slug} is in ${spec.departmentSlug}`,
      row.category?.slug === spec.departmentSlug,
      `category=${row.category?.slug ?? "none"}`
    );
    check(
      `admin row ${spec.slug} keeps NGN/NG pricing`,
      row.currency === CURRENCY && row.countryCode === COUNTRY && row.priceKobo === String(spec.priceKobo),
      `currency=${row.currency} country=${row.countryCode} priceKobo=${row.priceKobo}`
    );
    check(
      `admin row ${spec.slug} has stock ${QUANTITY}`,
      row.stock?.quantity === QUANTITY && row.stock?.reserved === 0,
      `quantity=${row.stock?.quantity} reserved=${row.stock?.reserved}`
    );
    check(
      `admin row ${spec.slug} has exactly one image with expected alt`,
      row.images?.length === 1 &&
        row.images[0].url === spec.image.url &&
        row.images[0].alt === spec.image.alt,
      (row.images ?? []).map((image) => `${image.url} | ${image.alt}`).join(" ; ") || "none"
    );

    // Asset HTTP response.
    const assetResponse = await fetch(`${BASE}${spec.image.url}`);
    check(
      `asset serves image/webp: ${spec.image.url}`,
      assetResponse.status === 200 && (assetResponse.headers.get("content-type") || "").includes("image/webp"),
      `status=${assetResponse.status} type=${assetResponse.headers.get("content-type") ?? "none"}`
    );

    // Direct product page HTML.
    const productResponse = await fetch(`${BASE}/product/${spec.slug}`);
    const productHtml = await productResponse.text();
    check(
      `direct product page responds 200: ${spec.slug}`,
      productResponse.status === 200,
      `status=${productResponse.status}`
    );
    check(
      `product page HTML contains the image and alt text: ${spec.slug}`,
      productHtml.includes(spec.image.url) && productHtml.includes(spec.image.alt),
      `image=${productHtml.includes(spec.image.url)} alt=${productHtml.includes(spec.image.alt)}`
    );

    // Public search API.
    const search = await publicApi(
      `/api/products?q=${encodeURIComponent(spec.searchTerm)}&category=${spec.departmentSlug}&page=1&pageSize=60`
    );
    const searchItem = (search.body?.items ?? []).find((product) => product.slug === spec.slug);
    check(
      `Shop search API returns ${spec.slug}`,
      search.status === 200 && Boolean(searchItem),
      `status=${search.status} total=${search.body?.total ?? "none"}`
    );
    check(
      `Shop search API carries the correct image, alt and stock: ${spec.slug}`,
      Boolean(searchItem) &&
        searchItem.images?.[0]?.url === spec.image.url &&
        searchItem.images?.[0]?.alt === spec.image.alt &&
        searchItem.isDemo === true &&
        searchItem.stock?.quantity === QUANTITY,
      searchItem
        ? `image=${searchItem.images?.[0]?.url ?? "none"} alt=${searchItem.images?.[0]?.alt ?? "none"} qty=${searchItem.stock?.quantity ?? "none"}`
        : "item missing"
    );

    // Public department API.
    const category = await publicApi(
      `/api/products?category=${spec.departmentSlug}&page=1&pageSize=60`
    );
    const categoryItem = (category.body?.items ?? []).find((product) => product.slug === spec.slug);
    check(
      `department catalogue API lists ${spec.slug}`,
      category.status === 200 && Boolean(categoryItem),
      `status=${category.status} total=${category.body?.total ?? "none"}`
    );

    // Product page in Chromium: image natural width and alt.
    const productNavigation = await navigate(page, `${BASE}/product/${spec.slug}`);
    check(
      `Chromium product page status 200: ${spec.slug}`,
      productNavigation.response?.status() === 200,
      `status=${productNavigation.response?.status() ?? "none"} attempt=${productNavigation.attempt}${productNavigation.error ? ` error=${productNavigation.error.message.split("\n")[0]}` : ""}`
    );
    let productImageOk = false;
    let productAlt = null;
    if (!productNavigation.error) {
      try {
        await page.waitForFunction(
          (url) => {
            const image = Array.from(document.images).find(
              (candidate) => candidate.getAttribute("src") === url
            );
            return Boolean(image && image.complete && image.naturalWidth > 0);
          },
          spec.image.url,
          { timeout: 15000 }
        );
        productImageOk = true;
      } catch {
        productImageOk = false;
      }
      const productImage = page.locator(`img[src="${spec.image.url}"]`).first();
      productAlt = (await productImage.count()) ? await productImage.getAttribute("alt") : null;
    }
    check(
      `Chromium renders the product image and exact alt: ${spec.slug}`,
      productImageOk && productAlt === spec.image.alt,
      `naturalWidth>0=${productImageOk} alt=${productAlt ?? "none"}`
    );

    // Department page in Chromium: the card and its image render.
    const categoryNavigation = await navigate(page, `${BASE}/naijashop/c/${spec.departmentSlug}`);
    check(
      `Chromium department page status 200: ${spec.departmentSlug}`,
      categoryNavigation.response?.status() === 200,
      `status=${categoryNavigation.response?.status() ?? "none"} attempt=${categoryNavigation.attempt}${categoryNavigation.error ? ` error=${categoryNavigation.error.message.split("\n")[0]}` : ""}`
    );
    let categoryCardOk = false;
    let categoryCardAlt = null;
    if (!categoryNavigation.error) {
      try {
        await page.waitForSelector(`article[data-product="${spec.slug}"]`, {
          state: "attached",
          timeout: 20000
        });
        await page.waitForFunction(
          (slug) => {
            const article = document.querySelector(`article[data-product="${slug}"]`);
            const image = article ? article.querySelector("img") : null;
            return Boolean(image && image.complete && image.naturalWidth > 0);
          },
          spec.slug,
          { timeout: 15000 }
        );
        categoryCardOk = true;
      } catch {
        categoryCardOk = false;
      }
      const categoryCard = page.locator(`article[data-product="${spec.slug}"]`).first();
      categoryCardAlt = (await categoryCard.count())
        ? await categoryCard.locator("img").first().getAttribute("alt")
        : null;
    }
    check(
      `Chromium department page renders the card and image: ${spec.slug}`,
      categoryCardOk && categoryCardAlt === spec.name,
      `imgLoaded=${categoryCardOk} alt=${categoryCardAlt ?? "none"}`
    );

    // Shop search page in Chromium.
    const searchNavigation = await navigate(
      page,
      `${BASE}/naijashop/search?q=${encodeURIComponent(spec.searchTerm)}`
    );
    check(
      `Chromium search page status 200: ${spec.slug}`,
      searchNavigation.response?.status() === 200,
      `status=${searchNavigation.response?.status() ?? "none"} attempt=${searchNavigation.attempt}${searchNavigation.error ? ` error=${searchNavigation.error.message.split("\n")[0]}` : ""}`
    );
    let searchCardOk = false;
    if (!searchNavigation.error) {
      try {
        await page.waitForSelector(`article[data-product="${spec.slug}"]`, {
          state: "attached",
          timeout: 20000
        });
        await page.waitForFunction(
          (slug) => {
            const article = document.querySelector(`article[data-product="${slug}"]`);
            const image = article ? article.querySelector("img") : null;
            return Boolean(image && image.complete && image.naturalWidth > 0);
          },
          spec.slug,
          { timeout: 15000 }
        );
        searchCardOk = true;
      } catch {
        searchCardOk = false;
      }
    }
    check(
      `Chromium search page renders the card and image: ${spec.slug}`,
      searchCardOk,
      `imgLoaded=${searchCardOk}`
    );

    result.checks = result.checks.concat(checks.slice(start));
  }

  await browser.close();

  // Image must not be duplicated onto another record.
  const finalCatalogue = await adminCatalogue();
  for (const spec of BATCH) {
    const owners = finalCatalogue.products
      .filter((product) => (product.images ?? []).some((image) => image.url === spec.image.url))
      .map((product) => product.slug);
    check(
      `asset belongs only to ${spec.slug}`,
      owners.length === 1 && owners[0] === spec.slug,
      owners.join(",") || "none"
    );
  }

  const final = counts(finalCatalogue);
  const expectedIncrease = BATCH.filter((spec) => {
    const result = results.find((entry) => entry.key === spec.key);
    return result?.action === "created-published" || result?.action === "resumed-draft-published";
  }).length;
  check(
    "active product count increased by the number of newly published rows",
    final.products === before.products + expectedIncrease,
    `${before.products} -> ${final.products} (expected +${expectedIncrease})`
  );
  check(
    "active department count is unchanged",
    final.departments === before.departments,
    `${before.departments} -> ${final.departments}`
  );
  check(
    "all six batch rows are ACTIVE",
    BATCH.every((spec) => {
      const row = finalCatalogue.products.find((product) => product.slug === spec.slug);
      return row?.status === "ACTIVE";
    }),
    BATCH.map((spec) => {
      const row = finalCatalogue.products.find((product) => product.slug === spec.slug);
      return `${spec.slug}=${row?.status ?? "missing"}`;
    }).join(" ")
  );

  const failed = checks.filter((entry) => !entry.ok);
  const output = {
    scope: "REVIEW catalogue batch A — six DEMO products in existing departments",
    baseUrl: BASE,
    baseBuildHint: process.env.REVIEW_BUILD_ID || "0DLHlGYoId2XSLKSwcsLZ",
    checkedAt: new Date().toISOString(),
    before,
    after: final,
    createdCount: expectedIncrease,
    createdIds,
    products: results.map((result) => ({
      id: result.id,
      name: result.name,
      slug: result.slug,
      department: result.department,
      priceKobo: result.priceKobo,
      quantity: result.quantity,
      image: result.image,
      action: result.action,
      failedChecks: result.checks.filter((entry) => !entry.ok).map((entry) => entry.name)
    })),
    observations,
    pageErrors,
    checks,
    passed: checks.length - failed.length,
    total: checks.length,
    ok: failed.length === 0
  };

  const evidencePath = path.resolve("qa-artifacts/review-basket/catalogue-batch-a.json");
  try {
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
    fs.writeFileSync(evidencePath, `${JSON.stringify(output, null, 2)}\n`);
    output.evidencePath = path.relative(process.cwd(), evidencePath);
  } catch {
    /* evidence file is best-effort */
  }

  console.log(JSON.stringify(output, null, 2));
  return failed.length ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    const failure = {
      scope: "REVIEW catalogue batch A — six DEMO products in existing departments",
      baseUrl: BASE,
      checkedAt: new Date().toISOString(),
      ok: false,
      error: error.message,
      checks,
      passed: checks.filter((entry) => entry.ok).length,
      total: checks.length
    };
    try {
      const evidencePath = path.resolve("qa-artifacts/review-basket/catalogue-batch-a.json");
      fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
      fs.writeFileSync(evidencePath, `${JSON.stringify(failure, null, 2)}\n`);
    } catch {
      /* evidence file is best-effort */
    }
    console.error(JSON.stringify(failure, null, 2));
    process.exit(2);
  });
