/**
 * Taxonomy batch 3 — representative DEMO products and the validated
 * seller + Control Center publishing workflow.
 *
 * Data only by default (the image generator imports this file). Pass
 * `--preflight` to verify the leaves, required attributes and served image
 * paths without writing anything. Pass `--publish` to create DRAFT listings as
 * the review seller, set the exact image alt text and DEMO flag as an
 * administrator, run catalogue validation and publish through the existing
 * admin action.
 *
 * Public assets in public/generated/taxonomy/ are committed by the coordinator
 * and the canonical preview is rebuilt/restarted before publication. The
 * preflight therefore refuses to continue when the image is not yet served.
 *
 * Idempotent by exact product name: re-running does not create duplicates.
 * Credentials are read from the review fixtures and are never printed.
 */
const fs = require("node:fs");

const PRODUCTS = [
  {
    key: "rice-grains",
    assetId: "long-grain-rice",
    leafKey: "rice-grains",
    prompt:
      "a split jute sack filled with long-grain white rice, its top folded open with rice spilling gently onto a warm neutral studio surface, beside a small carved wooden bowl heaped with the same rice and a few loose grains",
    name: "DEMO — Long-grain white rice, 5kg",
    priceKobo: 950000,
    stock: 24,
    weightGrams: 5100,
    alt: "Open jute sack of long-grain white rice beside a carved wooden bowl of rice",
    description:
      "Demonstration listing. Long-grain white rice offered as a 5kg pack. Grain length, variety, milling and packaging shown are illustrative; no food-safety, origin or grade certification is claimed.",
    attributes: { grain_type: "Rice", net_weight_kg: 5 }
  },
  {
    key: "palm-cooking-oils",
    assetId: "red-palm-oil",
    leafKey: "palm-cooking-oils",
    prompt:
      "a clear glass bottle filled with deep red-orange palm oil and sealed with a plain cork stopper, standing beside a small cluster of fresh red palm fruits and a few cracked palm kernels on a warm neutral studio surface, no label",
    name: "DEMO — Red palm oil, 1 litre",
    priceKobo: 480000,
    stock: 18,
    weightGrams: 1100,
    alt: "Clear glass bottle of red palm oil with fresh palm fruits and kernels",
    description:
      "Demonstration listing. Unrefined red palm oil in a 1-litre glass bottle. Extraction method, colour depth, source and packaging are illustrative; no food-safety certification is claimed.",
    attributes: { oil_type: "Palm", volume_litres: 1, extraction: "Unrefined" }
  },
  {
    key: "cleaning-supplies",
    assetId: "household-cleaning-set",
    leafKey: "cleaning-supplies",
    prompt:
      "a household cleaning set arranged on a warm neutral studio surface: a pale sage-green plastic bucket, an opaque white spray bottle with a blank unlabelled front, a folded stack of muted blue and grey microfibre cloths and two natural cellulose sponges",
    name: "DEMO — Household cleaning set",
    priceKobo: 850000,
    stock: 16,
    weightGrams: 1800,
    alt: "Cleaning bucket, blank spray bottle, folded microfibre cloths and sponges",
    description:
      "Demonstration listing. Cleaning set with a bucket, spray bottle, microfibre cloths and sponges. Bottle size, formulations and exact pack contents are illustrative; no brand, chemical specification or certification is claimed.",
    attributes: { product_type: "Other" }
  },
  {
    key: "writing-drawing-instruments",
    assetId: "stationery-writing-set",
    leafKey: "writing-drawing-instruments",
    prompt:
      "a writing and drawing set on a warm neutral studio surface: two plain black ballpoint pens, three unpainted wooden pencils with plain pink erasers, a pale wooden ruler with no printed markings and a white rectangular eraser",
    name: "DEMO — Pen, pencil and ruler set",
    priceKobo: 320000,
    stock: 40,
    weightGrams: 250,
    alt: "Ballpoint pens, wooden pencils, plain wooden ruler and white eraser",
    description:
      "Demonstration listing. Writing set with ballpoint pens, wooden pencils, a ruler and an eraser. Ink colour, wood type and exact pack contents are illustrative; no brand or manufacturer specification is claimed.",
    attributes: { instrument_type: "Other", pack_count: 7 }
  },
  {
    key: "baby-toddler-toys",
    assetId: "wooden-stacking-toy",
    leafKey: "baby-toddler-toys",
    prompt:
      "a wooden stacking-ring toy with a natural wood base and four rounded rings in muted sage green, mustard yellow and terracotta, standing beside a soft fabric ball with stitched cream and sage panels on a warm neutral studio surface",
    name: "DEMO — Wooden stacking toy with soft ball",
    priceKobo: 750000,
    stock: 14,
    weightGrams: 700,
    alt: "Wooden stacking-ring toy with muted green, yellow and terracotta rings beside a soft fabric ball",
    description:
      "Demonstration listing. Wooden stacking-ring toy and soft fabric ball for toddlers. Paint finish, wood species, dimensions and age suitability are illustrative; no safety certification is claimed.",
    attributes: { toy_type: "Stacking toy", recommended_age_months: 12, safety_marking: "Not stated" }
  },
  {
    key: "yoga-fitness-accessories",
    assetId: "yoga-mat-set",
    leafKey: "yoga-fitness-accessories",
    prompt:
      "a yoga and fitness set on a warm neutral studio surface: a rolled yoga mat in muted sage green standing upright with a plain fabric carry strap, a rectangular cork yoga block and a coiled grey fabric resistance band",
    name: "DEMO — Yoga mat, cork block and resistance band set",
    priceKobo: 1450000,
    stock: 12,
    weightGrams: 1600,
    alt: "Rolled sage-green yoga mat with carry strap, cork block and grey resistance band",
    description:
      "Demonstration listing. Yoga mat with carry strap, cork block and fabric resistance band. Mat thickness, material and dimensions are illustrative; no brand or certification is claimed.",
    attributes: { accessory_type: "Yoga mat" }
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

async function reviewSession(preflightOnly) {
  const { chromium } = require("playwright");
  const base = process.env.REVIEW_BASE_URL || "http://localhost:3047";
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
    const verifyPage = preflightOnly ? null : await adminContext.newPage();

    if (!preflightOnly) {
      const unserved = [];
      for (const item of PRODUCTS) {
        const response = await admin.get(`${verifyBase}${IMAGE_PATH(item.assetId)}`);
        if (response.status() !== 200) unserved.push(`${item.assetId}=${response.status()}`);
      }
      if (unserved.length > 0) {
        throw new Error(
          `publication blocked: the canonical preview is not serving the batch-3 assets (${unserved.join(", ")}); commit the six WebP files and rebuild/restart the canonical preview first`
        );
      }
    }

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
      const invalid = category.attributes
        .filter((attribute) => attribute.type === "SELECT" && item.attributes[attribute.key] !== undefined)
        .filter((attribute) => !(attribute.options || []).includes(item.attributes[attribute.key]));
      check(`${item.assetId} select attributes in options`, invalid.length === 0, invalid.map((attribute) => attribute.key).join(","));

      const imageUrl = IMAGE_PATH(item.assetId);
      const imageResponse = await admin.get(`${verifyBase}${imageUrl}`);
      check(`${item.assetId} image served`, imageResponse.status() === 200, `${verifyBase}${imageUrl} ${imageResponse.status()}`);

      if (preflightOnly) continue;

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

    if (preflightOnly) {
      const failed = checks.filter((entry) => !entry.ok);
      console.log(JSON.stringify({ mode: "preflight", passed: checks.length - failed.length, total: checks.length, failed }, null, 2));
      process.exitCode = failed.length ? 1 : 0;
      return;
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

      const query = item.name.replace(/^DEMO — /, "").split(",")[0].split(" ").slice(0, 2).join(" ");
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
  process.exitCode = failed.length ? 1 : 0;
}

if (require.main === module) {
  if (process.argv.includes("--preflight")) {
    reviewSession(true).catch((error) => {
      console.error("BATCH3 PREFLIGHT ERROR", error.message);
      process.exit(2);
    });
  } else if (!process.argv.includes("--publish")) {
    console.log(JSON.stringify({ products: PRODUCTS.map(({ prompt, ...rest }) => rest) }, null, 2));
  } else {
    reviewSession(false).catch((error) => {
      console.error("BATCH3 PUBLISH ERROR", error.message);
      process.exit(2);
    });
  }
}

module.exports = { PRODUCTS, IMAGE_PATH };
