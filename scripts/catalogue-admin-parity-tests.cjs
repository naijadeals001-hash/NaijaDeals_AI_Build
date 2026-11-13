/**
 * Catalogue admin ↔ seller product parity acceptance.
 *
 * Covers the Control Center product editor and the seller product form for:
 *   - gallery persistence (1..6 images, URL, alt, order, primary cover)
 *   - category attributes loaded from CategoryAttribute and validated server-side
 *   - explicit country/currency and integer minor-unit price
 *   - stock, DEMO classification and status workflow (draft → preview → publish
 *     → unpublish/404 → archive)
 *   - seller-record-derived dispatch information and audit before/after rows
 *   - seller gallery/attributes parity, DRAFT creation and ownership isolation
 *   - customer and Ghana-scoped staff rejection
 *
 * Safety:
 *   - REVIEW_DATABASE_URL must be supplied explicitly. DATABASE_URL/.env are
 *     never used as a fallback. DatabaseClassification must contain REVIEW.
 *   - Every fixture name/slug carries RUN_ID. Products are archived, never
 *     deleted. Only the run-owned second-seller user/vendor used to prove
 *     ownership isolation is removed (it owns no products or financial rows).
 *
 * Usage:
 *   REVIEW_DATABASE_URL=postgresql://... \
 *   PARITY_BASE_URL=http://localhost:3057 \
 *     node scripts/catalogue-admin-parity-tests.cjs
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, request } = require("playwright");
const { Client } = require("pg");

const BASE = (process.env.PARITY_BASE_URL || process.env.REVIEW_BASE_URL || "http://localhost:3047").replace(/\/$/, "");
const DB_URL = (process.env.REVIEW_DATABASE_URL || "").trim();
const CREDENTIAL_DIR = "qa-artifacts/review-basket";
const ADMIN_CREDENTIAL = `${CREDENTIAL_DIR}/.admin-credential`;
const CUSTOMER_CREDENTIAL = `${CREDENTIAL_DIR}/.credential`;
const GH_ADMIN_CREDENTIAL = `${CREDENTIAL_DIR}/.gh-admin-credential`;
const SELLER_CREDENTIAL = `${CREDENTIAL_DIR}/.seller-credential`;
const EVIDENCE_FILE = "qa-artifacts/catalogue-admin-parity/parity.json";
const IMAGE_ONE = "/generated/shop/category-home-kitchen.webp";
const IMAGE_TWO = "/generated/shop/product-retro-kitchen-blender.webp";
const IMAGE_THREE = "/generated/shop/category-power-solar.webp";
const REMOTE_IMAGES = Array.from({ length: 7 }, (_, index) => `https://example.com/parity-${index + 1}.jpg`);

const runId = `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${crypto
  .randomBytes(3)
  .toString("hex")}`;
const stamp = runId.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(-10);
const PRODUCT_NAME = `DEMO — Catalogue parity fixture ${runId}`;
const PRODUCT_SLUG = `demo-catalogue-parity-${runId}`;
const PRODUCT_DESCRIPTION = `Demonstration listing created by the catalogue parity suite (${runId}). Images, specifications and availability are illustrative.`;
const SELLER_PRODUCT_NAME = `DEMO — Seller parity fixture ${runId}`;
const SECOND_SELLER_EMAIL = `review-parity-seller-${stamp}@review.invalid`;
const SECOND_VENDOR_SLUG = `review-parity-vendor-${stamp}`;

const checks = [];
const skips = [];
const pageErrors = [];
let db = null;
let secondSellerUserId = null;
let secondVendorId = null;
let adminProductId = null;
let sellerProductId = null;
let sellerEmail = null;

function check(label, ok, detail = "") {
  const pass = Boolean(ok);
  checks.push({ label, ok: pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  return pass;
}

function skip(label, detail = "") {
  skips.push({ label, detail });
  console.log(`SKIP ${label}${detail ? ` — ${detail}` : ""}`);
}

function assertSetup(condition, message) {
  if (!condition) throw new Error(message);
}

function readCredential(file) {
  assertSetup(fs.existsSync(file), `Missing credential file: ${file}`);
  const lines = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
  assertSetup(lines.length >= 2 && lines[0] && lines[1], `Credential file ${file} is incomplete.`);
  return { email: lines[0].trim().toLowerCase(), password: lines[1].trim() };
}

async function query(sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows;
}

function parseResponse(response, text) {
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { status: response.status(), body, text, url: response.url() };
}

async function api(context, route, options = {}) {
  const headers = { ...(options.headers || {}) };
  if ((options.method || "GET") !== "GET") headers.Origin = BASE;
  const response = await context.request.fetch(`${BASE}${route}`, {
    method: options.method || "GET",
    headers,
    ...(options.data !== undefined ? { data: options.data } : {}),
    ...(options.maxRedirects !== undefined ? { maxRedirects: options.maxRedirects } : {}),
    failOnStatusCode: false
  });
  return parseResponse(response, await response.text());
}

async function login(context, credential, label) {
  const result = await context.request.post(`${BASE}/api/auth/login`, {
    data: credential,
    headers: { Origin: BASE },
    failOnStatusCode: false
  });
  const text = await result.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  check(`${label} session established`, result.status() === 200, `status=${result.status()}`);
  return body?.user ?? null;
}

function sameAttributes(actual, expected) {
  if (!actual || typeof actual !== "object") return false;
  const keys = Object.keys(expected).sort();
  if (Object.keys(actual).sort().join("|") !== keys.join("|")) return false;
  return keys.every((key) => {
    const left = actual[key];
    const right = expected[key];
    if (typeof right === "number") return Number(left) === right;
    if (typeof right === "boolean") return left === right || String(left) === String(right);
    return String(left) === String(right);
  });
}

function attributeValueFor(attribute, index) {
  switch (attribute.type) {
    case "NUMBER":
      return 12 + index;
    case "BOOLEAN":
      return index % 2 === 0;
    case "SELECT": {
      const options = Array.isArray(attribute.options) ? attribute.options : [];
      return options[0];
    }
    case "TEXT":
    default:
      return `${attribute.label} value ${runId}`;
  }
}

function editedValueFor(attribute, value) {
  switch (attribute.type) {
    case "NUMBER":
      return Number(value) + 1;
    case "BOOLEAN":
      return !value;
    case "SELECT": {
      const options = Array.isArray(attribute.options) ? attribute.options : [];
      if (options.length === 0) return value;
      const current = options.indexOf(String(value));
      return options[(current + 1) % options.length];
    }
    case "TEXT":
    default:
      return `${value} edited`;
  }
}

function buildAttributePayload(definitions) {
  return Object.fromEntries(definitions.map((definition, index) => [definition.key, attributeValueFor(definition, index)]));
}

function buildEditedAttributes(definitions, values) {
  return Object.fromEntries(
    definitions.map((definition) => [definition.key, editedValueFor(definition, values[definition.key])])
  );
}

function galleryRows(entry) {
  return (entry.images || []).map((image, index) => ({
    url: image.url,
    alt: image.alt,
    sortOrder: image.sortOrder,
    primary: typeof image.primary === "boolean" ? image.primary : index === 0
  }));
}

async function main() {
  assertSetup(BASE.startsWith("http://") || BASE.startsWith("https://"), "PARITY_BASE_URL must be an HTTP(S) URL.");
  assertSetup(Boolean(DB_URL), "REVIEW_DATABASE_URL is required; DATABASE_URL and .env are never used as a fallback.");
  assertSetup(fs.existsSync(IMAGE_ONE.replace(/^\//, "public/")), `Missing test asset public${IMAGE_ONE}`);
  assertSetup(fs.existsSync(IMAGE_TWO.replace(/^\//, "public/")), `Missing test asset public${IMAGE_TWO}`);
  assertSetup(fs.existsSync(IMAGE_THREE.replace(/^\//, "public/")), `Missing test asset public${IMAGE_THREE}`);

  db = new Client({ connectionString: DB_URL });
  await db.connect();
  const classification = await query('SELECT classification FROM "DatabaseClassification" WHERE id = $1', ["default"]);
  check(
    "database is explicitly classified REVIEW",
    classification.length === 1 && classification[0].classification === "REVIEW",
    `classification=${classification[0]?.classification ?? "missing"}`
  );
  assertSetup(classification.length === 1 && classification[0].classification === "REVIEW", "Refusing to run outside REVIEW.");

  const activeBefore = Number(
    (await query(`SELECT count(*)::int AS count FROM "Product" WHERE status = 'ACTIVE'`)).at(0).count
  );

  // A real category with required attribute definitions, publishable in NG.
  const candidates = await query(
    `SELECT c.id, c.name, c.level
       FROM "Category" c
      WHERE c."isActive" = true
        AND c."isSelectable" = true
        AND c."deprecatedAt" IS NULL
        AND c.level BETWEEN 1 AND 2
        AND EXISTS (
          SELECT 1 FROM "CategoryAttribute" ca WHERE ca."categoryId" = c.id AND ca.required = true
        )
        AND NOT EXISTS (
          SELECT 1 FROM "CategoryCountryRule" r
           WHERE r."categoryId" = c.id AND r."countryCode" = 'NG' AND r."canPublish" = false
        )
      ORDER BY c.level DESC, c.name ASC
      LIMIT 12`
  );
  let category = null;
  let definitions = [];
  for (const candidate of candidates) {
    const attributes = await query(
      `SELECT key, label, type, required, options
         FROM "CategoryAttribute"
        WHERE "categoryId" = $1
        ORDER BY key ASC`,
      [candidate.id]
    );
    const viable =
      attributes.some((attribute) => attribute.required) &&
      attributes.every(
        (attribute) => attribute.type !== "SELECT" || (Array.isArray(attribute.options) && attribute.options.length > 0)
      );
    if (viable) {
      category = candidate;
      definitions = attributes;
      break;
    }
  }
  assertSetup(category, "No publishable REVIEW category with required, valid attribute definitions was found.");
  check(
    "category fixture has required attribute definitions",
    definitions.some((entry) => entry.required),
    `${category.name} (${definitions.length})`
  );

  const attributes = buildAttributePayload(definitions);
  const requiredDefinition = definitions.find((entry) => entry.required);
  const selectDefinition = definitions.find((entry) => entry.type === "SELECT" && entry.required);
  const numberDefinition = definitions.find((entry) => entry.type === "NUMBER" && entry.required);

  const images = [
    { url: IMAGE_ONE, alt: `Primary review image ${runId}`, order: 2, primary: false },
    { url: IMAGE_TWO, alt: `Secondary review image ${runId}`, order: 1, primary: true }
  ];

  function productBody(overrides = {}) {
    return {
      name: PRODUCT_NAME,
      slug: PRODUCT_SLUG,
      description: PRODUCT_DESCRIPTION,
      priceKobo: 345600,
      currency: "NGN",
      countryCode: "NG",
      categoryId: category.id,
      attributes,
      quantity: 12,
      lowStockLevel: 2,
      images,
      isDemo: true,
      ...overrides
    };
  }

  const browser = await chromium.launch();
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const adminPage = await adminContext.newPage();
  adminPage.on("pageerror", (error) => pageErrors.push(`admin:${error.message}`));
  const adminUser = await login(adminContext, readCredential(ADMIN_CREDENTIAL), "admin");
  assertSetup(adminUser?.id, "Admin login did not return a user id.");

  const catalogueInitial = await api(adminContext, "/api/admin/catalogue");
  check("Control Center catalogue loads for authorized admin", catalogueInitial.status === 200, `status=${catalogueInitial.status}`);
  const catalogueCategory = catalogueInitial.body?.departments?.find((entry) => entry.id === category.id);
  check(
    "admin catalogue exposes category attribute definitions",
    Array.isArray(catalogueCategory?.attributes) && catalogueCategory.attributes.some((entry) => entry.required),
    `${catalogueCategory?.attributes?.length ?? 0} definitions`
  );

  // Validation gates before any fixture exists.
  const missingRequired = { ...attributes };
  delete missingRequired[requiredDefinition.key];
  const missingResult = await api(adminContext, "/api/admin/catalogue/products", {
    method: "POST",
    data: productBody({ attributes: missingRequired })
  });
  check(
    "missing required category attribute is rejected",
    missingResult.status === 400 && missingResult.body?.code === "attribute_required",
    `status=${missingResult.status} code=${missingResult.body?.code}`
  );

  if (selectDefinition) {
    const invalidSelect = { ...attributes, [selectDefinition.key]: "NOT_A_CONFIGURED_OPTION" };
    const result = await api(adminContext, "/api/admin/catalogue/products", {
      method: "POST",
      data: productBody({ attributes: invalidSelect })
    });
    check(
      "SELECT attribute outside configured options is rejected",
      result.status === 400 && result.body?.code === "attribute_option_invalid",
      `status=${result.status} code=${result.body?.code}`
    );
  } else {
    skip("SELECT attribute option validation", "chosen category has no required SELECT attribute");
  }

  if (numberDefinition) {
    const invalidNumber = { ...attributes, [numberDefinition.key]: "not-a-number" };
    const result = await api(adminContext, "/api/admin/catalogue/products", {
      method: "POST",
      data: productBody({ attributes: invalidNumber })
    });
    check(
      "NUMBER attribute with non-numeric value is rejected",
      result.status === 400 && result.body?.code === "attribute_invalid",
      `status=${result.status} code=${result.body?.code}`
    );
  } else {
    skip("NUMBER attribute type validation", "chosen category has no required NUMBER attribute");
  }

  const unknownResult = await api(adminContext, "/api/admin/catalogue/products", {
    method: "POST",
    data: productBody({ attributes: { ...attributes, not_a_category_attribute: "unsupported" } })
  });
  check(
    "unknown category attribute key is rejected",
    unknownResult.status === 400 && unknownResult.body?.code === "unknown_attribute",
    `status=${unknownResult.status} code=${unknownResult.body?.code}`
  );

  const tooManyResult = await api(adminContext, "/api/admin/catalogue/products", {
    method: "POST",
    data: productBody({
      images: REMOTE_IMAGES.map((url, index) => ({ url, alt: `Image ${index + 1}`, order: index }))
    })
  });
  check(
    "more than six gallery images are rejected",
    tooManyResult.status === 400 && tooManyResult.body?.code === "too_many_images",
    `status=${tooManyResult.status} code=${tooManyResult.body?.code}`
  );

  const duplicateResult = await api(adminContext, "/api/admin/catalogue/products", {
    method: "POST",
    data: productBody({ images: [images[0], { ...images[0], alt: "Duplicate URL" }] })
  });
  check(
    "duplicate gallery URL is rejected",
    duplicateResult.status === 400 && duplicateResult.body?.code === "duplicate_image",
    `status=${duplicateResult.status} code=${duplicateResult.body?.code}`
  );

  const missingAltResult = await api(adminContext, "/api/admin/catalogue/products", {
    method: "POST",
    data: productBody({ images: [{ url: IMAGE_THREE, alt: "" }] })
  });
  check(
    "gallery image without alt text is rejected",
    missingAltResult.status === 400 && missingAltResult.body?.code === "alt_required",
    `status=${missingAltResult.status} code=${missingAltResult.body?.code}`
  );

  const missingAssetResult = await api(adminContext, "/api/admin/catalogue/products", {
    method: "POST",
    data: productBody({ images: [{ url: `/generated/shop/missing-${stamp}.webp`, alt: "Missing asset" }] })
  });
  check(
    "missing project image asset is rejected",
    missingAssetResult.status === 400 && missingAssetResult.body?.code === "image_not_found",
    `status=${missingAssetResult.status} code=${missingAssetResult.body?.code}`
  );

  const multiplePrimaryResult = await api(adminContext, "/api/admin/catalogue/products", {
    method: "POST",
    data: productBody({
      images: [
        { url: IMAGE_ONE, alt: "First primary", primary: true },
        { url: IMAGE_TWO, alt: "Second primary", primary: true }
      ]
    })
  });
  check(
    "multiple primary images are rejected",
    multiplePrimaryResult.status === 400 && multiplePrimaryResult.body?.code === "multiple_primary_images",
    `status=${multiplePrimaryResult.status} code=${multiplePrimaryResult.body?.code}`
  );

  const currencyResult = await api(adminContext, "/api/admin/catalogue/products", {
    method: "POST",
    data: productBody({ currency: "USD" })
  });
  check(
    "currency mismatch is rejected",
    currencyResult.status === 400 && currencyResult.body?.code === "currency_mismatch",
    `status=${currencyResult.status} code=${currencyResult.body?.code}`
  );

  const nonSelectable = await query(
    `SELECT id, name FROM "Category" WHERE "isActive" = true AND "isSelectable" = false ORDER BY level ASC LIMIT 1`
  );
  if (nonSelectable.length) {
    const result = await api(adminContext, "/api/admin/catalogue/products", {
      method: "POST",
      data: productBody({ categoryId: nonSelectable[0].id, attributes: {} })
    });
    check(
      "non-selectable category is rejected",
      result.status === 400 && /category_(not_selectable|unavailable|too_deep)/.test(result.body?.code ?? ""),
      `${nonSelectable[0].name} status=${result.status} code=${result.body?.code}`
    );
  } else {
    skip("non-selectable category rejection", "no non-selectable category exists");
  }

  const restricted = await query(
    `SELECT c.id, c.name FROM "Category" c
       JOIN "CategoryCountryRule" r ON r."categoryId" = c.id
      WHERE r."countryCode" = 'NG' AND r."canPublish" = false
        AND c."isActive" = true AND c."isSelectable" = true
      LIMIT 1`
  );
  if (restricted.length) {
    const result = await api(adminContext, "/api/admin/catalogue/products", {
      method: "POST",
      data: productBody({ categoryId: restricted[0].id, attributes: {} })
    });
    check(
      "NG-restricted category cannot receive a catalogue product",
      result.status === 403 && result.body?.code === "category_restricted",
      `${restricted[0].name} status=${result.status} code=${result.body?.code}`
    );
  } else {
    skip("NG-restricted category rejection", "no NG-restricted category is configured");
  }

  // Authorized creation with out-of-order images and a non-first primary.
  const created = await api(adminContext, "/api/admin/catalogue/products", { method: "POST", data: productBody() });
  check("authorized admin creates a draft", created.status === 201 && created.body?.status === "DRAFT", `status=${created.status}`);
  assertSetup(created.body?.id, `Product creation failed: ${created.text.slice(0, 300)}`);
  adminProductId = created.body.id;
  check("draft price is stored as integer minor units", String(created.body.priceKobo) === "345600", String(created.body.priceKobo));
  check("draft is explicitly DEMO", created.body.isDemo === true, String(created.body.isDemo));
  const createdImages = galleryRows(created.body);
  check(
    "created gallery stores primary first and normalised order",
    createdImages.length === 2 &&
      createdImages[0].url === IMAGE_TWO &&
      createdImages[0].sortOrder === 0 &&
      createdImages[0].primary === true &&
      createdImages[1].url === IMAGE_ONE &&
      createdImages[1].sortOrder === 1 &&
      createdImages[1].primary === false,
    JSON.stringify(createdImages)
  );
  check("created category attributes persist", sameAttributes(created.body.attributes, attributes), JSON.stringify(created.body.attributes));

  const catalogueAfterCreate = await api(adminContext, "/api/admin/catalogue");
  const listed = catalogueAfterCreate.body?.products?.find((entry) => entry.id === adminProductId);
  check(
    "admin catalogue returns gallery order/primary and attributes",
    Boolean(listed) && galleryRows(listed)[0]?.url === IMAGE_TWO && sameAttributes(listed.attributes, attributes),
    listed ? `images=${listed.images.length} attributes=${Object.keys(listed.attributes ?? {}).length}` : "not listed"
  );
  check(
    "admin catalogue exposes seller-record dispatch fields",
    Boolean(listed?.vendor?.pickupAddress && listed?.vendor?.pickupPhone && typeof listed?.vendor?.commissionBps === "number"),
    listed?.vendor?.name ?? "no vendor"
  );

  // UI edit → save, including gallery reorder and attribute changes.
  await adminPage.goto(`${BASE}/admin/catalogue`, { waitUntil: "networkidle" });
  check(
    "Control Center catalogue page loads",
    (await adminPage.getByRole("heading", { name: "Catalogue workflow" }).count()) > 0,
    adminPage.url()
  );
  const productSection = adminPage.locator('section[aria-labelledby="product-heading"]').first();
  const row = productSection.locator("tr", { hasText: PRODUCT_NAME }).first();
  await row.getByRole("button", { name: "Edit" }).click();
  await productSection.getByRole("button", { name: "Save product" }).waitFor({ timeout: 10000 });
  check(
    "editor renders category attribute controls",
    (await productSection.locator('[data-testid="catalogue-attributes"]').count()) > 0,
    `${definitions.length} definitions`
  );

  const editedName = `${PRODUCT_NAME} edited`;
  const editedDescription = `${PRODUCT_DESCRIPTION} Edited in the Control Center.`;
  const editedAttributes = buildEditedAttributes(definitions, attributes);
  await productSection.getByLabel("Name", { exact: true }).fill(editedName);
  await productSection.getByLabel(/Price \(NGN\)/).fill("3499.99");
  await productSection.locator("textarea").first().fill(editedDescription);
  await productSection.getByLabel(/Accessible image text 1/).fill(`Edited primary cover alt ${runId}`);
  await productSection.getByLabel(/Accessible image text 2/).fill(`Edited secondary image alt ${runId}`);
  await productSection.getByLabel("Make image 2 primary").click();

  const attributeFieldset = productSection.locator('[data-testid="catalogue-attributes"]');
  for (const definition of definitions) {
    const field = attributeFieldset.locator("label").filter({ hasText: definition.label }).first();
    const control = field.locator("input, select").first();
    const next = editedAttributes[definition.key];
    if (definition.type === "SELECT" || definition.type === "BOOLEAN") {
      await control.selectOption(String(next));
    } else {
      await control.fill(String(next));
    }
  }
  await productSection.getByRole("button", { name: "Save product" }).click();
  await adminPage
    .locator('[role="status"]')
    .filter({ hasText: "Product saved" })
    .first()
    .waitFor({ timeout: 15000 });
  check("authorized UI edit saves successfully", true, "status message observed");

  const afterEdit = await api(adminContext, "/api/admin/catalogue");
  const edited = afterEdit.body?.products?.find((entry) => entry.id === adminProductId);
  check(
    "UI edit persists title and exact price",
    edited?.name === editedName && String(edited?.priceKobo) === "349999",
    `${edited?.name} / ${edited?.priceKobo}`
  );
  const editedImages = galleryRows(edited ?? {});
  check(
    "UI gallery reorder persists primary/order/alt",
    editedImages.length === 2 &&
      editedImages[0].url === IMAGE_ONE &&
      editedImages[0].alt === `Edited secondary image alt ${runId}` &&
      editedImages[0].primary === true &&
      editedImages[1].url === IMAGE_TWO &&
      editedImages[1].primary === false,
    JSON.stringify(editedImages)
  );
  check("UI attribute edits persist", sameAttributes(edited?.attributes, editedAttributes), JSON.stringify(edited?.attributes));

  // Draft preview is authorized-only; the public surface is still absent.
  const preview = await api(adminContext, `/admin/catalogue/products/${adminProductId}/preview`);
  const requiredValue = editedAttributes[requiredDefinition.key];
  const requiredDisplay =
    typeof requiredValue === "boolean" ? (requiredValue ? "Yes" : "No") : String(requiredValue);
  check("authorized draft preview renders", preview.status === 200, `status=${preview.status}`);
  check(
    "draft preview shows edited title, attributes and primary gallery",
    preview.status === 200 &&
      preview.text.includes(editedName) &&
      preview.text.includes(requiredDefinition.label) &&
      preview.text.includes(requiredDisplay) &&
      preview.text.includes(`Edited secondary image alt ${runId}`),
    `len=${preview.text.length}`
  );
  const draftPublic = await api(adminContext, `/api/products/${adminProductId}`);
  check("draft is absent from the public product API", draftPublic.status === 404, `status=${draftPublic.status}`);
  const draftPage = await api(adminContext, `/product/${PRODUCT_SLUG}`);
  check("draft public page returns 404", draftPage.status === 404, `status=${draftPage.status}`);

  const customerContext = await browser.newContext();
  const customerPage = await customerContext.newPage();
  customerPage.on("pageerror", (error) => pageErrors.push(`customer:${error.message}`));
  await login(customerContext, readCredential(CUSTOMER_CREDENTIAL), "customer");
  const customerList = await api(customerContext, "/api/admin/catalogue");
  check("customer cannot read the admin catalogue", customerList.status === 403, `status=${customerList.status}`);
  const customerPatch = await api(customerContext, "/api/admin/catalogue/products", {
    method: "PATCH",
    data: { id: adminProductId, name: "Customer takeover" }
  });
  check("customer cannot edit a catalogue product", customerPatch.status === 403, `status=${customerPatch.status}`);
  const customerPreview = await api(customerContext, `/admin/catalogue/products/${adminProductId}/preview`, {
    maxRedirects: 0
  });
  check(
    "customer cannot preview a draft",
    customerPreview.status !== 200 && !customerPreview.text.includes(editedName),
    `status=${customerPreview.status} location=${customerPreview.url}`
  );
  const customerSellerCreate = await api(customerContext, "/api/seller/products", {
    method: "POST",
    data: {
      name: SELLER_PRODUCT_NAME,
      description: PRODUCT_DESCRIPTION,
      categoryId: category.id,
      priceKobo: "100000",
      quantity: 1,
      attributes,
      images: [{ url: IMAGE_ONE, alt: "Customer attempt" }]
    }
  });
  check("customer cannot create a seller product", customerSellerCreate.status === 403, `status=${customerSellerCreate.status}`);

  const ghContext = await browser.newContext();
  const ghPage = await ghContext.newPage();
  ghPage.on("pageerror", (error) => pageErrors.push(`gh:${error.message}`));
  await login(ghContext, readCredential(GH_ADMIN_CREDENTIAL), "GH-scoped admin");
  const ghPatch = await api(ghContext, "/api/admin/catalogue/products", {
    method: "PATCH",
    data: { id: adminProductId, name: "GH scope takeover" }
  });
  check(
    "GH-scoped admin cannot edit an NG product",
    ghPatch.status === 403 && ghPatch.body?.code === "region_forbidden",
    `status=${ghPatch.status} code=${ghPatch.body?.code}`
  );
  const ghPublish = await api(ghContext, "/api/admin/catalogue/products", {
    method: "PATCH",
    data: { id: adminProductId, action: "publish" }
  });
  check("GH-scoped admin cannot publish an NG product", ghPublish.status === 403, `status=${ghPublish.status}`);
  const ghCreate = await api(ghContext, "/api/admin/catalogue/products", {
    method: "POST",
    data: productBody({ slug: `${PRODUCT_SLUG}-gh`, countryCode: "NG" })
  });
  check(
    "GH-scoped admin cannot create an NG product",
    ghCreate.status === 403 && ghCreate.body?.code === "region_forbidden",
    `status=${ghCreate.status} code=${ghCreate.body?.code}`
  );
  const ghPreview = await api(ghContext, `/admin/catalogue/products/${adminProductId}/preview`, { maxRedirects: 0 });
  check("GH-scoped admin cannot preview an NG draft", ghPreview.status !== 200, `status=${ghPreview.status}`);

  // The validation endpoint must pass and the UI must expose publish.
  const validation = await api(adminContext, "/api/admin/catalogue/products", {
    method: "PATCH",
    data: { id: adminProductId, action: "validate" }
  });
  check(
    "server validation passes for the edited listing",
    validation.status === 200 && validation.body?.valid === true,
    JSON.stringify(validation.body?.issues ?? [])
  );
  const publishRow = productSection.locator("tr", { hasText: editedName }).first();
  check(
    "published action is available in the editor",
    (await publishRow.getByRole("button", { name: "Publish" }).count()) === 1,
    "Publish button"
  );

  // Publish through the real Control Center action, then verify public rendering.
  const publish = await api(adminContext, "/api/admin/catalogue/products", {
    method: "PATCH",
    data: { id: adminProductId, action: "publish" }
  });
  check("authorized publish succeeds", publish.status === 200 && publish.body?.status === "ACTIVE", `status=${publish.status}`);
  const publicPage = await api(adminContext, `/product/${PRODUCT_SLUG}`);
  check(
    "published product renders on the public product page",
    publicPage.status === 200 && publicPage.text.includes(editedName) && publicPage.text.includes("3,499.99"),
    `status=${publicPage.status} len=${publicPage.text.length}`
  );
  const publicApi = await api(adminContext, `/api/products/${adminProductId}`);
  const publicImages = galleryRows(publicApi.body ?? {});
  check(
    "published public API returns gallery order and attributes",
    publicApi.status === 200 &&
      publicApi.body?.name === editedName &&
      publicImages[0]?.url === IMAGE_ONE &&
      publicImages[0]?.alt === `Edited secondary image alt ${runId}` &&
      sameAttributes(publicApi.body?.attributes, editedAttributes),
    `status=${publicApi.status} images=${publicImages.length}`
  );

  // Unpublish removes public access; archive is the run-owned cleanup state.
  const unpublish = await api(adminContext, "/api/admin/catalogue/products", {
    method: "PATCH",
    data: { id: adminProductId, action: "unpublish" }
  });
  check(
    "authorized unpublish returns the listing to DRAFT",
    unpublish.status === 200 && unpublish.body?.status === "DRAFT",
    `status=${unpublish.status}`
  );
  const unpublishedPublic = await api(adminContext, `/api/products/${adminProductId}`);
  check("unpublished product is no longer public", unpublishedPublic.status === 404, `status=${unpublishedPublic.status}`);
  const unpublishedPage = await api(adminContext, `/product/${PRODUCT_SLUG}`);
  check("unpublished product page returns 404", unpublishedPage.status === 404, `status=${unpublishedPage.status}`);
  const unpublishedPreview = await api(adminContext, `/admin/catalogue/products/${adminProductId}/preview`);
  check("authorized draft preview still works after unpublish", unpublishedPreview.status === 200, `status=${unpublishedPreview.status}`);

  const archive = await api(adminContext, "/api/admin/catalogue/products", {
    method: "PATCH",
    data: { id: adminProductId, action: "archive" }
  });
  check("authorized archive succeeds", archive.status === 200 && archive.body?.status === "ARCHIVED", `status=${archive.status}`);
  const archivedPublic = await api(adminContext, `/api/products/${adminProductId}`);
  check("archived product is not public", archivedPublic.status === 404, `status=${archivedPublic.status}`);

  // Audit before/after and actor attribution.
  const audits = await query(
    `SELECT action, "actorId", metadata, "createdAt"
       FROM "AuditLog"
      WHERE entity = 'Product' AND "entityId" = $1
      ORDER BY "createdAt" ASC`,
    [adminProductId]
  );
  const actions = audits.map((entry) => entry.action);
  check(
    "audit trail records create, update, publish, unpublish and archive",
    [
      "catalogue.product.created",
      "catalogue.product.updated",
      "catalogue.product.published",
      "catalogue.product.unpublished",
      "catalogue.product.archived"
    ].every((action) => actions.includes(action)),
    actions.join(",")
  );
  check(
    "every catalogue audit row is attributed to the acting admin",
    audits.length > 0 && audits.every((entry) => entry.actorId === adminUser.id),
    `rows=${audits.length}`
  );
  const updateAudit = audits.find((entry) => entry.action === "catalogue.product.updated");
  const before = updateAudit?.metadata?.before;
  const after = updateAudit?.metadata?.after;
  check(
    "update audit stores before/after title, price, category, attributes and gallery",
    Boolean(
      before &&
        after &&
        before.name === PRODUCT_NAME &&
        after.name === editedName &&
        before.priceKobo === "345600" &&
        after.priceKobo === "349999" &&
        before.category?.id === category.id &&
        sameAttributes(before.attributes, attributes) &&
        sameAttributes(after.attributes, editedAttributes) &&
        Array.isArray(before.images) &&
        Array.isArray(after.images) &&
        after.images[0]?.url === IMAGE_ONE &&
        after.images[0]?.primary === true
    ),
    updateAudit ? "before/after present" : "no update audit row"
  );

  // Seller parity: gallery/attributes accepted, DRAFT created, policy ignored.
  const sellerContext = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const sellerPage = await sellerContext.newPage();
  sellerPage.on("pageerror", (error) => pageErrors.push(`seller:${error.message}`));
  const sellerCredential = readCredential(SELLER_CREDENTIAL);
  sellerEmail = sellerCredential.email;
  await login(sellerContext, sellerCredential, "seller");
  const sellerCategories = await api(sellerContext, "/api/seller/categories");
  const sellerCategory = sellerCategories.body?.categories?.find(
    (entry) => entry.canPublish && entry.attributes?.some((attribute) => attribute.required)
  );
  assertSetup(sellerCategory, "Seller category API returned no publishable category with required attributes.");
  const sellerAttributes = buildAttributePayload(sellerCategory.attributes);
  const sellerImages = [
    { url: IMAGE_ONE, alt: `Seller primary image ${runId}`, order: 2, primary: false },
    { url: IMAGE_THREE, alt: `Seller secondary image ${runId}`, order: 1, primary: true }
  ];
  const sellerCreate = await api(sellerContext, "/api/seller/products", {
    method: "POST",
    data: {
      name: SELLER_PRODUCT_NAME,
      description: PRODUCT_DESCRIPTION,
      categoryId: sellerCategory.id,
      priceKobo: "250000",
      quantity: 4,
      attributes: sellerAttributes,
      images: sellerImages,
      // Deliberately unsupported seller-controlled fields; the service must ignore them.
      isDemo: true,
      commissionBps: 9999,
      verified: true
    }
  });
  check(
    "seller creates a DRAFT listing with gallery and attributes",
    sellerCreate.status === 201 &&
      sellerCreate.body?.status === "DRAFT" &&
      galleryRows(sellerCreate.body)[0]?.url === IMAGE_THREE &&
      sameAttributes(sellerCreate.body?.attributes, sellerAttributes),
    `status=${sellerCreate.status} code=${sellerCreate.body?.code ?? ""}`
  );
  assertSetup(sellerCreate.body?.id, `Seller creation failed: ${sellerCreate.text.slice(0, 300)}`);
  sellerProductId = sellerCreate.body.id;
  check("seller cannot set DEMO classification or platform policy", sellerCreate.body.isDemo === false, `isDemo=${sellerCreate.body.isDemo}`);
  const sellerVendorBefore = await query('SELECT "commissionBps", status FROM "Vendor" WHERE id = $1', [
    sellerCreate.body.vendorId
  ]);
  check(
    "seller-record commission and verification are unchanged",
    sellerVendorBefore.length === 1 && sellerVendorBefore[0].commissionBps === 1000 && sellerVendorBefore[0].status === "VERIFIED",
    JSON.stringify(sellerVendorBefore[0] ?? {})
  );

  const sellerMissing = { ...sellerAttributes };
  delete sellerMissing[sellerCategory.attributes.find((attribute) => attribute.required).key];
  const sellerMissingResult = await api(sellerContext, "/api/seller/products", {
    method: "POST",
    data: {
      name: `${SELLER_PRODUCT_NAME} invalid`,
      description: PRODUCT_DESCRIPTION,
      categoryId: sellerCategory.id,
      priceKobo: "250000",
      quantity: 1,
      attributes: sellerMissing,
      images: [{ url: IMAGE_ONE, alt: "Seller missing attribute" }]
    }
  });
  check(
    "seller missing required attribute is rejected server-side",
    sellerMissingResult.status === 400 && sellerMissingResult.body?.code === "attribute_required",
    `status=${sellerMissingResult.status} code=${sellerMissingResult.body?.code}`
  );

  await sellerPage.goto(`${BASE}/seller`, { waitUntil: "networkidle" });
  check("seller dashboard loads", (await sellerPage.locator("text=Seller hub").count()) > 0, sellerPage.url());
  await sellerPage.getByRole("button", { name: /Add product/ }).click();
  check(
    "seller product form exposes gallery, attributes and read-only dispatch",
    (await sellerPage.getByText("Gallery (up to 6 images)").count()) > 0 &&
      (await sellerPage.getByText("Dispatch details from your seller record").count()) > 0 &&
      (await sellerPage.getByText(/cannot be set from this product form/).count()) > 0,
    "gallery + dispatch copy"
  );

  // Seller edit path: load the fixture into the same form and persist gallery/attributes.
  const sellerRow = sellerPage.locator("tr", { hasText: SELLER_PRODUCT_NAME }).first();
  await sellerRow.getByRole("button", { name: "Edit listing" }).click();
  await sellerPage.getByText("Edit draft listing").waitFor({ timeout: 10000 });
  // The category picker re-resolves the stored category before attributes render.
  await sellerPage.getByText(/Category attributes \(/).first().waitFor({ timeout: 15000 });
  const firstRequiredAttribute = sellerCategory.attributes.find((attribute) => attribute.required);
  const firstRequiredControl = sellerPage
    .locator("#seller-product-form")
    .getByLabel(firstRequiredAttribute.label, { exact: false });
  const firstRequiredValue = await firstRequiredControl.inputValue().catch(() => "");
  check(
    "seller edit form hydrates the gallery and category attributes",
    (await sellerPage.getByLabel(/Image 1 alt text/).inputValue()) === `Seller secondary image ${runId}` &&
      (await sellerPage.getByLabel(/Image 2 alt text/).inputValue()) === `Seller primary image ${runId}` &&
      Boolean(firstRequiredValue) &&
      (await sellerPage.getByText(/Category attributes \(/).count()) > 0,
    `${firstRequiredAttribute.label}=${firstRequiredValue || "empty"}`
  );
  const editedSellerName = `${SELLER_PRODUCT_NAME} edited`;
  await sellerPage.locator("#seller-product-form").getByLabel("Name").fill(editedSellerName);
  await sellerPage.getByLabel(/Image 1 alt text/).fill(`Seller edited primary alt ${runId}`);
  await sellerPage.getByRole("button", { name: "Save draft changes" }).click();
  const sellerNotice = sellerPage.locator('[role="status"]').filter({ hasText: "Listing updated" }).first();
  const sellerSaved = await sellerNotice.waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
  if (!sellerSaved) {
    const alerts = await sellerPage.locator('[role="alert"]').allTextContents();
    throw new Error(`Seller UI save produced no success notice. Alerts: ${alerts.join(" | ") || "none"}`);
  }
  const sellerOverviewAfterEdit = await api(sellerContext, "/api/seller/overview");
  const sellerEdited = sellerOverviewAfterEdit.body?.products?.find((entry) => entry.id === sellerProductId);
  check(
    "seller UI edit persists title and gallery alt without publishing",
    sellerEdited?.name === editedSellerName &&
      sellerEdited?.status === "DRAFT" &&
      galleryRows(sellerEdited)[0]?.url === IMAGE_THREE &&
      galleryRows(sellerEdited)[0]?.alt === `Seller edited primary alt ${runId}`,
    `${sellerEdited?.name} / ${sellerEdited?.status}`
  );

  // A second, run-owned verified seller proves ownership isolation.
  const sellerPassword = sellerCredential.password;
  const sellerPasswordHash = (
    await query('SELECT "passwordHash" FROM "User" WHERE email = $1', [sellerEmail])
  )[0]?.passwordHash;
  assertSetup(sellerPasswordHash, "Could not read the seller password hash for the isolation fixture.");
  secondSellerUserId = `parity-user-${stamp}`;
  secondVendorId = `parity-vendor-${stamp}`;
  await query(
    `INSERT INTO "User" (id, email, "passwordHash", name, "actorType", "countryCode", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, 'VENDOR', 'NG', now(), now())`,
    [secondSellerUserId, SECOND_SELLER_EMAIL, sellerPasswordHash, `REVIEW Parity Seller ${runId}`]
  );
  await query(
    `INSERT INTO "Vendor" (id, "ownerId", name, slug, market, "pickupAddress", "pickupPhone", "countryCode", status, "trustScore", "commissionBps", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, 'Abuja', 'Demonstration only — no physical pickup', '+2340000000001', 'NG', 'VERIFIED', 50, 1000, now(), now())`,
    [secondVendorId, secondSellerUserId, `REVIEW Parity Vendor ${runId}`, SECOND_VENDOR_SLUG]
  );
  const secondSellerContext = await browser.newContext();
  await login(secondSellerContext, { email: SECOND_SELLER_EMAIL, password: sellerPassword }, "run-owned second seller");
  const ownershipPatch = await api(secondSellerContext, `/api/seller/products/${sellerProductId}`, {
    method: "PATCH",
    data: { name: "Ownership takeover" }
  });
  check(
    "another seller cannot edit a product owned by the fixture seller",
    ownershipPatch.status === 403 && ownershipPatch.body?.code === "forbidden",
    `status=${ownershipPatch.status} code=${ownershipPatch.body?.code}`
  );
  await secondSellerContext.close();

  // Cleanup/archive run-owned catalogue rows.
  const sellerArchive = await api(sellerContext, `/api/seller/products/${sellerProductId}`, {
    method: "PATCH",
    data: { status: "ARCHIVED" }
  });
  check(
    "run-owned seller fixture archived",
    sellerArchive.status === 200 && sellerArchive.body?.status === "ARCHIVED",
    `status=${sellerArchive.status}`
  );
  const sellerAfter = await query('SELECT status FROM "Product" WHERE id = $1', [sellerProductId]);
  check("seller fixture is archived in the database", sellerAfter[0]?.status === "ARCHIVED", sellerAfter[0]?.status ?? "missing");
  const adminAfter = await query('SELECT status FROM "Product" WHERE id = $1', [adminProductId]);
  check("admin fixture is archived in the database", adminAfter[0]?.status === "ARCHIVED", adminAfter[0]?.status ?? "missing");

  const activeAfter = Number(
    (await query(`SELECT count(*)::int AS count FROM "Product" WHERE status = 'ACTIVE'`)).at(0).count
  );
  check("active catalogue count is unchanged after cleanup", activeAfter === activeBefore, `${activeBefore} -> ${activeAfter}`);

  const runOwnedActive = await query(
    `SELECT id FROM "Product" WHERE status = 'ACTIVE' AND (name LIKE $1 OR name LIKE $2)`,
    [`%${runId}%`, `%${stamp}%`]
  );
  check("no run-owned product remains ACTIVE", runOwnedActive.length === 0, `${runOwnedActive.length} active`);

  await adminPage.close();
  await customerPage.close();
  await ghPage.close();
  await sellerPage.close();
  await adminContext.close();
  await customerContext.close();
  await ghContext.close();
  await sellerContext.close();
  await browser.close();

  return {
    base: BASE,
    runId,
    category: { id: category.id, name: category.name, definitions: definitions.length },
    adminProduct: { id: adminProductId, name: editedName, slug: PRODUCT_SLUG, archived: true },
    sellerProduct: { id: sellerProductId, archived: true },
    activeProductsBefore: activeBefore,
    activeProductsAfter: activeAfter,
    checks,
    skips,
    pageErrors,
    passed: checks.filter((entry) => entry.ok).length,
    total: checks.length
  };
}

(async () => {
  let output = null;
  let error = null;
  try {
    output = await main();
  } catch (failure) {
    error = failure;
    console.error(`HARNESS ERROR: ${failure instanceof Error ? failure.message : String(failure)}`);
    // Best-effort cleanup of fixtures that were created before the failure.
    try {
      if (adminProductId) {
        const cleanupContext = await request.newContext();
        await cleanupContext.post(`${BASE}/api/auth/login`, {
          data: readCredential(ADMIN_CREDENTIAL),
          headers: { Origin: BASE }
        });
        await cleanupContext.patch(`${BASE}/api/admin/catalogue/products`, {
          data: { id: adminProductId, action: "archive" },
          headers: { Origin: BASE }
        });
        await cleanupContext.dispose();
      }
    } catch {
      /* best-effort only */
    }
    try {
      if (sellerProductId) {
        const cleanupSeller = await request.newContext();
        await cleanupSeller.post(`${BASE}/api/auth/login`, {
          data: readCredential(SELLER_CREDENTIAL),
          headers: { Origin: BASE }
        });
        await cleanupSeller.patch(`${BASE}/api/seller/products/${sellerProductId}`, {
          data: { status: "ARCHIVED" },
          headers: { Origin: BASE }
        });
        await cleanupSeller.dispose();
      }
    } catch {
      /* best-effort only */
    }
  } finally {
    try {
      if (secondVendorId) await query('DELETE FROM "Vendor" WHERE id = $1 AND slug = $2', [secondVendorId, SECOND_VENDOR_SLUG]);
      if (secondSellerUserId) {
        await query('DELETE FROM "User" WHERE id = $1 AND email = $2', [secondSellerUserId, SECOND_SELLER_EMAIL]);
      }
    } catch (cleanupError) {
      console.error(
        `Ownership fixture cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`
      );
    }
    if (db) await db.end().catch(() => undefined);
  }

  const failed = checks.filter((entry) => !entry.ok);
  const evidence = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    runId,
    harnessError: error ? (error instanceof Error ? error.message : String(error)) : null,
    passed: output?.passed ?? checks.filter((entry) => entry.ok).length,
    total: checks.length,
    failed: failed.map((entry) => entry.label),
    skips,
    pageErrors,
    checks,
    cleanup: {
      adminProductArchived: Boolean(adminProductId),
      sellerProductArchived: Boolean(sellerProductId),
      secondSellerUserDeleted: Boolean(secondSellerUserId),
      secondVendorDeleted: Boolean(secondVendorId)
    }
  };
  try {
    fs.mkdirSync(path.dirname(EVIDENCE_FILE), { recursive: true });
    fs.writeFileSync(EVIDENCE_FILE, `${JSON.stringify(evidence, null, 2)}\n`);
  } catch {
    /* evidence file is best-effort */
  }
  console.log(
    JSON.stringify(
      {
        passed: evidence.passed,
        total: evidence.total,
        failed: evidence.failed,
        skips: evidence.skips,
        pageErrors: evidence.pageErrors,
        harnessError: evidence.harnessError,
        evidence: EVIDENCE_FILE
      },
      null,
      2
    )
  );
  process.exitCode = error || failed.length ? 1 : 0;
})();
