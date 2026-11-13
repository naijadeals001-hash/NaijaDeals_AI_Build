/**
 * Taxonomy batch 2 — representative DEMO products and the validated
 * seller + Control Center publishing workflow.
 *
 * Data only by default (the image generator imports this file). Pass
 * `--publish` to create DRAFT listings as the review seller, set the exact
 * image alt text and DEMO flag as an administrator, run catalogue validation
 * and publish through the existing admin action.
 *
 * Idempotent by exact product name: re-running does not create duplicates.
 * Credentials are read from the review fixtures and are never printed.
 */
const fs = require("node:fs");

const PRODUCTS = [
  {
    key: "first-aid-supplies",
    assetId: "first-aid-kit",
    leafKey: "first-aid-supplies",
    prompt:
      "a compact open first-aid kit with a red fabric case, rolled bandages, plasters, gauze pads, scissors and a cold pack neatly arranged on a warm neutral studio surface",
    name: "DEMO — Compact first-aid kit, 42 pieces",
    priceKobo: 850000,
    stock: 12,
    weightGrams: 400,
    alt: "Open red first-aid kit with rolled bandages, plasters, gauze pads and scissors",
    description:
      "Demonstration listing. Compact first-aid kit with bandages, plasters, gauze pads, scissors and a cold pack. Contents, pack count, price and stock are illustrative; no medical claims or certification are made.",
    attributes: { item_type: "First-aid kit", pack_count: 42, sterility: "Not stated" }
  },
  {
    key: "bottles-teats-sterilisers",
    assetId: "glass-baby-bottles",
    leafKey: "bottles-teats-sterilisers",
    prompt:
      "two clear glass baby feeding bottles with silicone teats and soft sage-green caps standing on a warm neutral studio surface, one bottle partially filled with water",
    name: "DEMO — Glass baby bottles, 2 × 240ml",
    priceKobo: 780000,
    stock: 15,
    weightGrams: 600,
    alt: "Two clear glass baby bottles with silicone teats and sage-green caps",
    description:
      "Demonstration listing. Two 240ml glass baby bottles with silicone teats and caps. Capacity, materials and pack contents are illustrative; no safety certification is claimed.",
    attributes: { product_type: "Bottle", material: "Glass", capacity_ml: 240 }
  },
  {
    key: "football-basketball-equipment",
    assetId: "match-football",
    leafKey: "football-basketball-equipment",
    prompt:
      "a classic white and black size-5 football with subtle green accent panels resting on a warm neutral studio surface",
    name: "DEMO — Size 5 match football",
    priceKobo: 950000,
    stock: 20,
    weightGrams: 450,
    alt: "White and black size 5 football with subtle green accent panels",
    description:
      "Demonstration listing. Size 5 football for training and match play. Construction, panel layout and colours are illustrative; no official match certification is claimed.",
    attributes: { equipment_type: "Football", size: "Size 5", surface: "All-weather" }
  },
  {
    key: "car-care-cleaning",
    assetId: "car-care-kit",
    leafKey: "car-care-cleaning",
    prompt:
      "a car care kit with a pump bottle of blue car shampoo, a grey wash mitt, a stack of folded microfibre cloths and a small detailing brush on a warm neutral studio surface, blank unbranded labels",
    name: "DEMO — Car wash and microfibre care kit",
    priceKobo: 1200000,
    stock: 14,
    weightGrams: 1500,
    alt: "Car shampoo bottle, grey wash mitt and folded microfibre cloths",
    description:
      "Demonstration listing. Car shampoo, wash mitt, microfibre cloths and a detailing brush. Bottle size, cloth count and formulation are illustrative; no brand or manufacturer specification is claimed.",
    attributes: { product_type: "Washing accessory", surface: "All surfaces" }
  },
  {
    key: "drills-drivers",
    assetId: "cordless-drill",
    leafKey: "drills-drivers",
    prompt:
      "a compact 18V cordless drill with a fitted battery, charger and an open fold-out drill bit set on a warm neutral workshop surface, no branding",
    name: "DEMO — Cordless drill and bit set, 18V",
    priceKobo: 4800000,
    stock: 8,
    weightGrams: 2200,
    alt: "Compact 18V cordless drill with battery, charger and drill bit set",
    description:
      "Demonstration listing. Compact 18V cordless drill with battery, charger and drill bit set. Voltage, battery capacity, torque and warranty are illustrative; not a manufacturer specification.",
    attributes: { tool_type: "Drill", power_source: "Battery", battery_included: "Yes", voltage: "18V" }
  },
  {
    key: "notebooks-paper",
    assetId: "exercise-books",
    leafKey: "notebooks-paper",
    prompt:
      "a neat stack of ten slim A5 exercise books with plain green, yellow and blue covers and ruled pages just visible at the edges, on a warm neutral studio surface, no text",
    name: "DEMO — A5 exercise books, pack of 10",
    priceKobo: 480000,
    stock: 30,
    weightGrams: 1200,
    alt: "Stack of ten A5 exercise books with green, yellow and blue covers",
    description:
      "Demonstration listing. Ten A5 ruled exercise books with plain coloured covers. Page count, paper weight and cover colours are illustrative.",
    attributes: { product_type: "Exercise book", ruling: "Ruled", sheets: 40, paper_size: "A5" }
  },
  {
    key: "cassava-products",
    assetId: "garri",
    leafKey: "cassava-products",
    prompt:
      "a heap of fine creamy-white fermented cassava garri in a carved wooden bowl with two fresh cassava roots beside it on a warm neutral studio surface",
    name: "DEMO — Garri (cassava flakes), 1kg",
    priceKobo: 220000,
    stock: 25,
    weightGrams: 1100,
    alt: "Bowl of creamy white garri with fresh cassava roots",
    description:
      "Demonstration listing. Fermented cassava garri for eba and snacks. Grain texture, fermentation and pack weight are illustrative; not a food-safety certification.",
    attributes: { product_form: "Garri / gari", net_weight_kg: 1, fermentation: "Fermented" }
  },
  {
    key: "bags-accessories",
    assetId: "raffia-tote",
    leafKey: "bags-accessories",
    prompt:
      "a handwoven natural raffia tote bag with dark brown leather handles and a woven green geometric band, standing on a warm neutral studio surface",
    name: "DEMO — Handwoven raffia tote bag",
    priceKobo: 1500000,
    stock: 10,
    weightGrams: 500,
    alt: "Handwoven natural raffia tote bag with dark brown leather handles",
    description:
      "Demonstration listing. Handwoven natural raffia tote with dark brown handles. Weave, dimensions and leather trim are illustrative; each handmade piece may vary.",
    attributes: { item_type: "Handbag", material: "Raffia" }
  }
];

const IMAGE_PATH = (assetId) => `/generated/taxonomy/${assetId}.webp`;

function readCredential(file) {
  return fs
    .readFileSync(file, "utf8")
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim());
}

async function publish() {
  const { chromium } = require("playwright");
  const base = process.env.REVIEW_BASE_URL || "http://localhost:3047";
  // 3047 is a long-running `next start` whose public-file index predates this
  // batch, so newly written WebP files 404 there until its next start. An
  // already-running isolated `next start` on 3057 serves the same build and
  // database with a current public index; use it for page/image verification.
  const verifyBase = process.env.REVIEW_VERIFY_URL || base;
  const [sellerEmail, sellerPassword] = readCredential("qa-artifacts/review-basket/.seller-credential");
  const [adminEmail, adminPassword] = readCredential("qa-artifacts/review-basket/.admin-credential");

  const browser = await chromium.launch();
  const sellerContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const seller = sellerContext.request;
  const admin = adminContext.request;
  const checks = [];
  const check = (name, ok, detail = "") => {
    checks.push({ name, ok, detail });
    if (!ok) console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
    else console.log(`PASS ${name}`);
  };

  try {
    const sellerLogin = await seller.post(`${base}/api/auth/login`, {
      data: { email: sellerEmail, password: sellerPassword },
      headers: { Origin: base }
    });
    const adminLogin = await admin.post(`${base}/api/auth/login`, {
      data: { email: adminEmail, password: adminPassword },
      headers: { Origin: base }
    });
    if (sellerLogin.status() !== 200 || adminLogin.status() !== 200) {
      throw new Error(`login failed seller=${sellerLogin.status()} admin=${adminLogin.status()}`);
    }

    const categories = (await (await seller.get(`${base}/api/seller/categories`)).json()).categories;
    const categoryByKey = new Map(categories.map((category) => [category.key, category]));
    let catalogue = await (await admin.get(`${base}/api/admin/catalogue`)).json();
    const productByName = () => new Map(catalogue.products.map((product) => [product.name, product]));
    const verifyPage = await adminContext.newPage();

    async function renderedText(pathname, expectedText) {
      await verifyPage.goto(`${verifyBase}${pathname}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await verifyPage
        .waitForFunction((text) => document.body.innerText.includes(text), expectedText, { timeout: 15000 })
        .catch(() => {});
      return verifyPage.locator("body").innerText();
    }

    for (const item of PRODUCTS) {
      const category = categoryByKey.get(item.leafKey);
      check(`${item.assetId} leaf exists`, Boolean(category), item.leafKey);
      if (!category) continue;
      check(`${item.assetId} leaf publishable`, category.canPublish === true, category.restrictionNote || "canPublish=false");
      const required = category.attributes.filter((attribute) => attribute.required).map((attribute) => attribute.key);
      const missing = required.filter((key) => item.attributes[key] === undefined);
      check(`${item.assetId} required attributes supplied`, missing.length === 0, missing.join(","));

      const imageUrl = IMAGE_PATH(item.assetId);
      const imageResponse = await admin.get(`${verifyBase}${imageUrl}`);
      check(`${item.assetId} image served`, imageResponse.status() === 200, `${verifyBase}${imageUrl} ${imageResponse.status()}`);

      let product = productByName().get(item.name);
      if (!product) {
        const created = await seller.post(`${base}/api/seller/products`, {
          data: {
            name: item.name,
            description: item.description,
            categoryId: category.id,
            priceKobo: item.priceKobo,
            quantity: item.stock,
            weightGrams: item.weightGrams,
            imageUrl,
            attributes: item.attributes,
            status: "DRAFT"
          },
          headers: { Origin: base }
        });
        const body = await created.text();
        check(`${item.assetId} seller draft created`, created.status() === 201, `status=${created.status()} ${body.slice(0, 180)}`);
        if (created.status() !== 201) continue;
        product = JSON.parse(body);
        catalogue = await (await admin.get(`${base}/api/admin/catalogue`)).json();
      } else {
        check(`${item.assetId} existing listing reused`, true, product.status);
      }

      const altPatch = await admin.patch(`${base}/api/admin/catalogue/products`, {
        data: { id: product.id, images: [{ url: imageUrl, alt: item.alt }] },
        headers: { Origin: base }
      });
      check(`${item.assetId} descriptive image alt saved`, altPatch.status() === 200, `status=${altPatch.status()}`);

      const demoPatch = await admin.patch(`${base}/api/admin/catalogue/products`, {
        data: { id: product.id, isDemo: true },
        headers: { Origin: base }
      });
      check(`${item.assetId} marked DEMO`, demoPatch.status() === 200, `status=${demoPatch.status()}`);

      const validation = await admin.patch(`${base}/api/admin/catalogue/products`, {
        data: { id: product.id, action: "validate" },
        headers: { Origin: base }
      });
      const validationBody = await validation.json().catch(() => null);
      check(
        `${item.assetId} catalogue validation`,
        validation.status() === 200 && validationBody?.valid === true,
        JSON.stringify(validationBody?.issues ?? []).slice(0, 300)
      );

      const publish = await admin.patch(`${base}/api/admin/catalogue/products`, {
        data: { id: product.id, action: "publish" },
        headers: { Origin: base }
      });
      const publishBody = await publish.text();
      const alreadyPublished = publish.status() === 409 && publishBody.includes("already_published");
      check(
        `${item.assetId} published`,
        publish.status() === 200 || alreadyPublished,
        `status=${publish.status()}${alreadyPublished ? " (idempotent)" : ` ${publishBody.slice(0, 180)}`}`
      );
    }

    catalogue = await (await admin.get(`${base}/api/admin/catalogue`)).json();
    const finalByName = productByName();

    for (const item of PRODUCTS) {
      const product = finalByName.get(item.name);
      check(`${item.assetId} ACTIVE and DEMO`, Boolean(product) && product.status === "ACTIVE" && product.isDemo === true, product ? `${product.status}/${product.isDemo}` : "missing");
      if (!product) continue;
      check(`${item.assetId} exact leaf`, product.categoryId === categoryByKey.get(item.leafKey)?.id, `${product.categoryId}`);
      check(`${item.assetId} image and alt`, product.images?.[0]?.url === IMAGE_PATH(item.assetId) && product.images?.[0]?.alt === item.alt, JSON.stringify(product.images?.[0] ?? null));
      check(`${item.assetId} stock`, product.stock?.quantity === item.stock, `${product.stock?.quantity}`);

      const direct = await admin.get(`${verifyBase}/product/${product.slug}`);
      const directBody = await direct.text();
      check(`${item.assetId} direct page 200`, direct.status() === 200, `status=${direct.status()}`);
      check(`${item.assetId} direct page DEMO label`, /DEMO|Demonstration/i.test(directBody), "no DEMO text in HTML");
      check(`${item.assetId} direct page image alt`, directBody.includes(item.alt), "alt missing from HTML");

      const leafApi = await admin.get(`${verifyBase}/api/products?category=${encodeURIComponent(item.leafKey)}&pageSize=20`);
      const leafApiBody = await leafApi.json().catch(() => null);
      check(
        `${item.assetId} leaf catalogue API`,
        leafApi.status() === 200 && Array.isArray(leafApiBody?.items) && leafApiBody.items.some((entry) => entry.id === product.id),
        `leaf=${item.leafKey} status=${leafApi.status()}`
      );
      try {
        const leafText = await renderedText(`/naijashop/c/${item.leafKey}`, item.name);
        check(`${item.assetId} leaf page lists product`, leafText.includes(item.name), `leaf=${item.leafKey}`);
      } catch (error) {
        check(`${item.assetId} leaf page lists product`, false, `leaf=${item.leafKey} ${error.message}`);
      }

      const query = item.key === "cassava-products" ? "garri" : item.name.replace(/^DEMO — /, "").split(",")[0].split(" ").slice(0, 2).join(" ");
      const search = await admin.get(`${verifyBase}/api/products?q=${encodeURIComponent(query)}&pageSize=60`);
      const searchBody = await search.json().catch(() => null);
      const hit = Array.isArray(searchBody?.items)
        ? searchBody.items.some((entry) => entry.id === product.id)
        : Array.isArray(searchBody)
          ? searchBody.some((entry) => entry.id === product.id)
          : false;
      check(`${item.assetId} search API hit`, search.status() === 200 && hit, `q=${query} status=${search.status()}`);

      try {
        const searchText = await renderedText(`/search?q=${encodeURIComponent(query)}`, item.name);
        check(`${item.assetId} search page lists product`, searchText.includes(item.name), `q=${query}`);
      } catch (error) {
        check(`${item.assetId} search page lists product`, false, `q=${query} ${error.message}`);
      }
    }
  } finally {
    await browser.close();
  }

  const failed = checks.filter((entry) => !entry.ok);
  console.log(JSON.stringify({ products: PRODUCTS.map((item) => ({ key: item.key, name: item.name, image: IMAGE_PATH(item.assetId) })), passed: checks.length - failed.length, total: checks.length, failed }, null, 2));
  process.exit(failed.length ? 1 : 0);
}

if (require.main === module) {
  if (!process.argv.includes("--publish")) {
    console.log(JSON.stringify({ products: PRODUCTS.map(({ prompt, ...rest }) => rest) }, null, 2));
  } else {
    publish().catch((error) => {
      console.error("BATCH2 PUBLISH ERROR", error.message);
      process.exit(2);
    });
  }
}

module.exports = { PRODUCTS, IMAGE_PATH };
