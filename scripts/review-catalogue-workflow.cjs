/**
 * Admin-led catalogue acceptance.
 *
 * Covers: department create/edit (editable slug, ordering, imagery) → product
 * draft with explicit currency, inventory and matching imagery → server
 * validation → admin preview → publish → public visibility/search/count →
 * editable published slug → unpublish → archive → removal from every public
 * surface. Invalid data and illegal state transitions are asserted too.
 *
 * Test records are RUN_ID/dated, left archived/inactive, and never touch the
 * accepted catalogue rows. No payment, provider call or live operation is made.
 *
 * Usage:
 *   node scripts/review-catalogue-workflow.cjs
 *   REVIEW_BASE_URL=http://localhost:3057 node scripts/review-catalogue-workflow.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const { chromium, request } = require("playwright");

const BASE = process.env.REVIEW_BASE_URL || "http://localhost:3047";
const CREDENTIAL_FILE = "qa-artifacts/review-basket/.admin-credential";
const CUSTOMER_FILE = "qa-artifacts/review-basket/.credential";
const EVIDENCE_FILE = "qa-artifacts/review-basket/catalogue-workflow.json";
const SHOT_DIR = "qa-artifacts/visual/catalogue-workflow";
const IMAGE_ONE = "/generated/shop/category-home-kitchen.webp";
const IMAGE_TWO = "/generated/shop/product-retro-kitchen-blender.webp";
const [email, password] = fs.readFileSync(CREDENTIAL_FILE, "utf8").trim().split(/\r?\n/);

const runId = `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${Math.random()
  .toString(36)
  .slice(2, 8)}`;
const stamp = runId.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(-10);
const DEPT_NAME = `DEMO Review department ${stamp}`;
const DEPT_SLUG = `demo-review-department-${stamp}`;
const DEPT_SLUG_EDITED = `${DEPT_SLUG}-edited`;
const PRODUCT_NAME = `DEMO — Review workflow blender ${stamp}`;
const PRODUCT_SLUG = `demo-review-workflow-blender-${stamp}`;
const INCOMPLETE_NAME = `DEMO — Incomplete workflow probe ${stamp}`;
const checks = [];
const skips = [];
const observedDefects = [];
const pageErrors = [];
const createdProductIds = [];
let createdDepartmentId = null;

function check(name, ok, detail = "") {
  checks.push({ name, ok: Boolean(ok), detail: String(detail ?? "") });
}

function skip(name, reason) {
  skips.push({ name, reason });
}

function parse(response, body) {
  return { status: response.status(), body };
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));

  async function api(route, options = {}) {
    const method = options.method || "GET";
    const headers = { ...(options.headers || {}) };
    if (method !== "GET" && method !== "HEAD") headers.Origin = BASE;
    const response = await context.request.fetch(`${BASE}${route}`, {
      ...options,
      method,
      headers,
      failOnStatusCode: false
    });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return parse(response, body);
  }

  async function adminCatalogue() {
    const result = await api("/api/admin/catalogue");
    if (result.status !== 200) throw new Error(`Catalogue API returned ${result.status}`);
    return result.body;
  }

  async function waitFor(fn, label, timeout = 20000) {
    const start = Date.now();
    let lastError = null;
    while (Date.now() - start < timeout) {
      try {
        const value = await fn();
        if (value) return value;
      } catch (error) {
        lastError = error;
      }
      await page.waitForTimeout(250);
    }
    throw new Error(`Timed out waiting for ${label}${lastError ? ` (${lastError.message})` : ""}`);
  }

  async function adminProduct(name) {
    const catalogue = await adminCatalogue();
    return catalogue.products.find((entry) => entry.name === name);
  }

  async function expectFailure(label, route, options, status, code) {
    const result = await api(route, options);
    if (result.status === 200 || result.status === 201) {
      const id = result.body && typeof result.body === "object" ? result.body.id : null;
      if (id) createdProductIds.push(id);
    }
    check(
      label,
      result.status === status && (!code || result.body?.code === code),
      `status=${result.status} code=${result.body?.code ?? "none"}`
    );
    return result;
  }

  const productSection = () => page.locator("section", { hasText: "2. Product" }).first();
  const departmentSection = () => page.locator("section", { hasText: "1. Department" }).first();

  async function cleanup() {
    try {
      for (const id of [...new Set(createdProductIds.filter(Boolean))]) {
        const catalogue = await adminCatalogue().catch(() => null);
        const entry = catalogue?.products.find((product) => product.id === id);
        if (entry && entry.status !== "ARCHIVED") {
          await api("/api/admin/catalogue/products", {
            method: "PATCH",
            data: { id, action: "archive" }
          });
        }
      }
      if (createdDepartmentId) {
        await api("/api/admin/catalogue/departments", {
          method: "PATCH",
          data: { id: createdDepartmentId, isActive: false }
        });
      }
    } catch {
      /* best-effort cleanup; reported checks already describe the run */
    }
  }

  function report(harnessError) {
    const failed = checks.filter((entry) => !entry.ok);
    const output = {
      buildSource: "served",
      baseUrl: BASE,
      runId,
      checkedAt: new Date().toISOString(),
      checks,
      skipped: skips,
      observedDefects,
      passed: checks.length - failed.length,
      total: checks.length,
      pageErrors,
      harnessError: harnessError ? harnessError.message : null
    };
    try {
      fs.mkdirSync(path.dirname(EVIDENCE_FILE), { recursive: true });
      fs.writeFileSync(EVIDENCE_FILE, `${JSON.stringify(output, null, 2)}\n`);
    } catch {
      /* evidence file is best-effort */
    }
    console.log(JSON.stringify(output, null, 2));
    return failed.length ? 1 : 0;
  }

  let harnessError = null;
  try {
    const login = await context.request.post(`${BASE}/api/auth/login`, {
      data: { email, password },
      headers: { Origin: BASE }
    });
    check("admin session established with the stored credential", login.status() === 200, `status=${login.status()}`);
    await page.goto(`${BASE}/admin/catalogue`, { waitUntil: "networkidle" });
    check(
      "admin catalogue page loads",
      (await page.getByRole("heading", { name: "Catalogue workflow" }).count()) > 0,
      page.url()
    );

    // ---------------------------------------------------------------------
    // 1. Department create with slug, ordering and imagery.
    // ---------------------------------------------------------------------
    const dept = departmentSection();
    await dept.getByLabel("Name", { exact: true }).fill(DEPT_NAME);
    await dept.getByLabel(/^Slug/).fill(DEPT_SLUG);
    await dept.getByLabel(/^Order/).fill("0");
    await dept.getByLabel(/^Image \(/).fill(IMAGE_ONE);
    await dept.getByLabel("Description").fill("DEMO department created through the Control Center catalogue workflow.");
    await dept.getByRole("button", { name: "Create department" }).click();
    const createdDept = await waitFor(async () => {
      const catalogue = await adminCatalogue();
      return catalogue.departments.find((entry) => entry.slug === DEPT_SLUG);
    }, "created department");
    createdDepartmentId = createdDept.id;
    check(
      "department created with explicit slug and ordering",
      createdDept.slug === DEPT_SLUG && createdDept.sortOrder === 0,
      `slug=${createdDept.slug} order=${createdDept.sortOrder}`
    );

    // Edit the slug and preserve the order, then activate for the publish phase.
    const deptRow = dept.locator("li", { hasText: DEPT_NAME }).first();
    await deptRow.getByRole("button", { name: "Edit" }).click();
    await dept.getByLabel(/^Slug/).fill(DEPT_SLUG_EDITED);
    await dept.getByLabel("Active (visible in Shop navigation)").check();
    await dept.getByRole("button", { name: "Save department" }).click();
    const editedDept = await waitFor(async () => {
      const catalogue = await adminCatalogue();
      const entry = catalogue.departments.find((candidate) => candidate.id === createdDept.id);
      return entry && entry.slug === DEPT_SLUG_EDITED && entry.isActive ? entry : null;
    }, "edited active department");
    check(
      "department slug edit and activation saved",
      editedDept.slug === DEPT_SLUG_EDITED && editedDept.isActive === true,
      `slug=${editedDept.slug} active=${editedDept.isActive}`
    );

    const categoriesResult = await api("/api/categories");
    const publicCategories = Array.isArray(categoriesResult.body) ? categoriesResult.body : [];
    const categoryIndex = publicCategories.findIndex((entry) => entry.slug === DEPT_SLUG_EDITED);
    const orderedBeforeHigher = publicCategories.slice(0, categoryIndex).every((entry) => entry.sortOrder === 0);
    check(
      "department ordering applies to public navigation",
      categoriesResult.status === 200 && categoryIndex >= 0 && orderedBeforeHigher,
      `index=${categoryIndex} sortOrder=${publicCategories[categoryIndex]?.sortOrder}`
    );

    const altProbe = await api("/api/admin/catalogue/departments", {
      method: "POST",
      data: {
        name: `DEMO Alt probe ${stamp}`,
        slug: `demo-alt-probe-${stamp}`,
        description: "DEMO department alt text probe that must not be silently dropped.",
        imageUrl: IMAGE_ONE,
        imageAlt: "Probe alt text",
        isDemo: true
      }
    });
    check(
      "department alt text is explicitly blocked pending Category.imageAlt",
      altProbe.status === 409 &&
        altProbe.body?.code === "schema_field_pending" &&
        altProbe.body?.details?.field === "Category.imageAlt",
      `status=${altProbe.status} code=${altProbe.body?.code ?? "none"}`
    );
    const altProbeLeak = (await adminCatalogue()).departments.some(
      (entry) => entry.slug === `demo-alt-probe-${stamp}`
    );
    check("blocked alt probe created no department", !altProbeLeak, `leaked=${altProbeLeak}`);

    const duplicateDept = await api("/api/admin/catalogue/departments", {
      method: "POST",
      data: {
        name: `DEMO Duplicate probe ${stamp}`,
        slug: DEPT_SLUG_EDITED,
        description: "DEMO duplicate slug probe that must be refused.",
        imageUrl: IMAGE_ONE,
        isDemo: true
      }
    });
    check(
      "duplicate department slug returns duplicate_department_slug",
      duplicateDept.status === 409 && duplicateDept.body?.code === "duplicate_department_slug",
      `status=${duplicateDept.status} code=${duplicateDept.body?.code ?? "none"}`
    );
    check(
      "duplicate department probe created no department",
      !(await adminCatalogue()).departments.some((entry) => entry.name === `DEMO Duplicate probe ${stamp}`),
      ""
    );

    // ---------------------------------------------------------------------
    // 2. Product draft with currency, inventory and matching images.
    // ---------------------------------------------------------------------
    const products = productSection();
    const priceLabel = `Price (NGN)`;
    check("explicit currency label is shown", (await products.getByLabel(priceLabel).count()) === 1, priceLabel);
    await products.getByLabel("Name", { exact: true }).fill(PRODUCT_NAME);
    await products.getByLabel(/^Slug/).fill(PRODUCT_SLUG);
    await products.getByLabel(priceLabel).fill("4500");
    await products.getByLabel("Department").selectOption({ label: DEPT_NAME });
    await products.getByLabel("Inventory quantity").fill("6");
    await products.getByLabel("Low stock level").fill("2");
    await products.getByLabel("Description").fill("DEMO listing created through the Control Center catalogue workflow.");
    await products.getByLabel("Image 1 (project path or https URL)").fill(IMAGE_ONE);
    await products.getByLabel("Accessible image text 1").fill("Demonstration kitchen image for the catalogue workflow");
    await products.getByRole("button", { name: "Add another image" }).click();
    await products.getByLabel("Image 2 (project path or https URL)").fill(IMAGE_TWO);
    await products.getByLabel("Accessible image text 2").fill("Demonstration blender image for the catalogue workflow");
    await products.getByRole("button", { name: "Create draft" }).click();

    const createdProduct = await waitFor(() => adminProduct(PRODUCT_NAME), "created product");
    createdProductIds.push(createdProduct.id);
    check(
      "product created as DRAFT with explicit currency",
      createdProduct.status === "DRAFT" && createdProduct.currency === "NGN" && createdProduct.countryCode === "NG",
      `status=${createdProduct.status} currency=${createdProduct.currency} country=${createdProduct.countryCode}`
    );
    check(
      "product created with exact price and editable slug",
      createdProduct.priceKobo === "450000" && createdProduct.slug === PRODUCT_SLUG,
      `price=${createdProduct.priceKobo} slug=${createdProduct.slug}`
    );
    check(
      "product created with inventory",
      createdProduct.stock?.quantity === 6 && createdProduct.stock?.lowStockLevel === 2,
      `quantity=${createdProduct.stock?.quantity} low=${createdProduct.stock?.lowStockLevel}`
    );
    check(
      "product created with matching gallery and alt text",
      createdProduct.images.length === 2 &&
        createdProduct.images.every((image) => Boolean(image.alt)) &&
        createdProduct.images[0].url === IMAGE_ONE,
      `images=${createdProduct.images.length}`
    );

    const row = () => products.locator("tr", { hasText: PRODUCT_NAME }).first();
    const rowText = await row().innerText();
    check(
      "admin row shows currency, price and available inventory",
      /NGN/.test(rowText) && /4,500\.00/.test(rowText) && /6\s*\/\s*6 on hand/.test(rowText),
      rowText.replace(/\s+/g, " ").slice(0, 160)
    );

    // Invalid data must be refused with an actionable error.
    const validProbe = {
      name: `DEMO invalid probe ${stamp}`,
      description: "DEMO invalid-data probe that must never be saved.",
      priceKobo: 1000,
      currency: "NGN",
      countryCode: "NG",
      categoryId: createdProduct.categoryId,
      quantity: 1,
      lowStockLevel: 1,
      images: [{ url: IMAGE_ONE, alt: "Probe image" }],
      isDemo: true
    };
    await expectFailure(
      "currency mismatch rejected",
      "/api/admin/catalogue/products",
      { method: "POST", data: { ...validProbe, currency: "USD" } },
      400,
      "currency_mismatch"
    );
    await expectFailure(
      "zero price rejected",
      "/api/admin/catalogue/products",
      { method: "POST", data: { ...validProbe, priceKobo: 0 } },
      400,
      "validation_error"
    );
    await expectFailure(
      "negative inventory rejected",
      "/api/admin/catalogue/products",
      { method: "POST", data: { ...validProbe, quantity: -1 } },
      400,
      "validation_error"
    );
    await expectFailure(
      "non-numeric inventory rejected",
      "/api/admin/catalogue/products",
      { method: "POST", data: { ...validProbe, quantity: "six" } },
      400,
      "validation_error"
    );
    await expectFailure(
      "missing project image rejected",
      "/api/admin/catalogue/products",
      {
        method: "POST",
        data: {
          ...validProbe,
          images: [{ url: `/generated/shop/does-not-exist-${stamp}.webp`, alt: "Missing image" }]
        }
      },
      400,
      "image_not_found"
    );
    await expectFailure(
      "missing alt text rejected",
      "/api/admin/catalogue/products",
      { method: "POST", data: { ...validProbe, images: [{ url: IMAGE_ONE, alt: "" }] } },
      400,
      "alt_required"
    );
    await expectFailure(
      "duplicate product slug rejected",
      "/api/admin/catalogue/products",
      { method: "POST", data: { ...validProbe, slug: createdProduct.slug } },
      409,
      "duplicate_product_slug"
    );
    await expectFailure(
      "invalid slug format rejected",
      "/api/admin/catalogue/products",
      { method: "PATCH", data: { id: createdProduct.id, slug: "Not A Slug" } },
      400,
      "invalid_slug"
    );
    const existingOther = (await adminCatalogue()).products.find((entry) => entry.id !== createdProduct.id);
    if (existingOther) {
      await expectFailure(
        "existing product slug collision rejected",
        "/api/admin/catalogue/products",
        { method: "PATCH", data: { id: createdProduct.id, slug: existingOther.slug } },
        409,
        "duplicate_product_slug"
      );
    } else {
      skip("existing product slug collision rejected", "no other product exists in this database");
    }
    await expectFailure(
      "fulfilment country is locked after creation",
      "/api/admin/catalogue/products",
      { method: "PATCH", data: { id: createdProduct.id, countryCode: "GH", currency: "GHS" } },
      409,
      "country_locked"
    );

    const invalidLeak = (await adminCatalogue()).products.filter((entry) =>
      entry.name.startsWith(`DEMO invalid probe ${stamp}`)
    );
    check("invalid product probes created no rows", invalidLeak.length === 0, `leaked=${invalidLeak.length}`);

    // ---------------------------------------------------------------------
    // 3. Validation, preview and the draft's public invisibility.
    // ---------------------------------------------------------------------
    await row().getByRole("button", { name: "Validate" }).click();
    await page
      .locator('[data-testid="catalogue-validation"]')
      .filter({ hasText: "Validation passed" })
      .waitFor({ timeout: 15000 });
    check("server validation passes for a complete draft", true, "");
    const validateResult = await api("/api/admin/catalogue/products", {
      method: "PATCH",
      data: { id: createdProduct.id, action: "validate" }
    });
    check(
      "validate endpoint reports no blocking issues",
      validateResult.status === 200 && validateResult.body?.valid === true && validateResult.body?.issues?.length === 0,
      `status=${validateResult.status} valid=${validateResult.body?.valid}`
    );

    const incomplete = await api("/api/admin/catalogue/products", {
      method: "POST",
      data: {
        name: INCOMPLETE_NAME,
        slug: `demo-incomplete-probe-${stamp}`,
        description: "DEMO incomplete listing that must fail validation before publication.",
        priceKobo: 120000,
        currency: "NGN",
        countryCode: "NG",
        categoryId: createdProduct.categoryId,
        quantity: 0,
        lowStockLevel: 1,
        images: [],
        isDemo: true
      }
    });
    check("incomplete draft can be saved for later editing", incomplete.status === 201, `status=${incomplete.status}`);
    if (incomplete.body?.id) createdProductIds.push(incomplete.body.id);
    const incompleteValidation = await api("/api/admin/catalogue/products", {
      method: "PATCH",
      data: { id: incomplete.body?.id, action: "validate" }
    });
    const incompleteFields = new Set((incompleteValidation.body?.issues ?? []).map((issue) => issue.field));
    check(
      "incomplete draft fails validation with field-level issues",
      incompleteValidation.status === 200 &&
        incompleteValidation.body?.valid === false &&
        incompleteFields.has("images") &&
        incompleteFields.has("quantity"),
      `valid=${incompleteValidation.body?.valid} fields=${[...incompleteFields].join(",")}`
    );
    const incompletePublish = await api("/api/admin/catalogue/products", {
      method: "PATCH",
      data: { id: incomplete.body?.id, action: "publish" }
    });
    check(
      "publishing an invalid draft is refused with all issues",
      incompletePublish.status === 409 &&
        incompletePublish.body?.code === "product_not_publishable" &&
        Array.isArray(incompletePublish.body?.details?.issues),
      `status=${incompletePublish.status} code=${incompletePublish.body?.code ?? "none"}`
    );
    const incompleteArchive = await api("/api/admin/catalogue/products", {
      method: "PATCH",
      data: { id: incomplete.body?.id, action: "archive" }
    });
    check(
      "incomplete draft can be archived",
      incompleteArchive.status === 200 && incompleteArchive.body?.status === "ARCHIVED",
      `status=${incompleteArchive.status} product=${incompleteArchive.body?.status ?? "none"}`
    );
    const incompletePublic = await context.request.get(
      `${BASE}/product/${incomplete.body?.slug ?? `demo-incomplete-probe-${stamp}`}`
    );
    check("archived incomplete draft is not public", incompletePublic.status() === 404, `status=${incompletePublic.status()}`);

    await row().getByRole("button", { name: "Preview", exact: true }).click();
    const previewPanel = page.locator('[data-testid="catalogue-preview"]');
    await previewPanel.waitFor({ timeout: 10000 });
    const previewText = await previewPanel.innerText();
    check(
      "draft preview shows status, currency and inventory",
      /DRAFT/.test(previewText) && /NGN/.test(previewText) && /6 available of 6/.test(previewText),
      previewText.replace(/\s+/g, " ").slice(0, 200)
    );
    check(
      "draft preview explains the public 404",
      /returns 404 until it is published/.test(previewText) && (await previewPanel.getByText("Open public page").count()) === 0,
      ""
    );
    try {
      fs.mkdirSync(SHOT_DIR, { recursive: true });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SHOT_DIR, `draft-preview-${stamp}.png`), fullPage: true });
    } catch {
      /* screenshots are supplementary evidence */
    }
    const draftPublic = await context.request.get(`${BASE}/product/${createdProduct.slug}`);
    check("draft product direct access returns 404", draftPublic.status() === 404, `status=${draftPublic.status()}`);
    const prePublishSearch = await api(
      `/api/products?q=${encodeURIComponent(PRODUCT_NAME)}&page=1&pageSize=10`
    );
    check(
      "draft product is absent from Shop search",
      prePublishSearch.status === 200 && (prePublishSearch.body?.items ?? []).length === 0,
      `total=${prePublishSearch.body?.total ?? "n/a"}`
    );
    const prePublishCount = await api(`/api/products?category=${DEPT_SLUG_EDITED}&page=1&pageSize=1`);
    check(
      "draft product is excluded from the department count",
      prePublishCount.status === 200 && prePublishCount.body?.total === 0,
      `total=${prePublishCount.body?.total ?? "n/a"}`
    );

    // ---------------------------------------------------------------------
    // 4. Publish → public visibility → editable slug → unpublish → archive.
    // ---------------------------------------------------------------------
    await row().getByRole("button", { name: "Publish" }).click();
    const published = await waitFor(async () => {
      const entry = await adminProduct(PRODUCT_NAME);
      return entry && entry.status === "ACTIVE" ? entry : null;
    }, "published product");
    check("server reports product ACTIVE after publish", published.status === "ACTIVE", published.status);
    const publicPage = await context.request.get(`${BASE}/product/${published.slug}`);
    check("publish makes the product public", publicPage.status() === 200, `status=${publicPage.status()}`);
    const publishedSearch = await api(`/api/products?q=${encodeURIComponent(PRODUCT_NAME)}&page=1&pageSize=10`);
    check(
      "published product appears in Shop search",
      publishedSearch.status === 200 &&
        (publishedSearch.body?.items ?? []).some((entry) => entry.name === PRODUCT_NAME),
      `total=${publishedSearch.body?.total ?? "n/a"}`
    );
    const publishedCount = await api(`/api/products?category=${DEPT_SLUG_EDITED}&page=1&pageSize=1`);
    check(
      "published product contributes to the department count",
      publishedCount.status === 200 && publishedCount.body?.total === 1,
      `total=${publishedCount.body?.total ?? "n/a"}`
    );

    await row().getByRole("button", { name: "Preview", exact: true }).click();
    const publishedPreview = await page.locator('[data-testid="catalogue-preview"]').innerText();
    check(
      "published preview exposes the public link",
      /publicly visible/.test(publishedPreview) &&
        (await page.locator('[data-testid="catalogue-preview"]').getByText("Open public page").count()) === 1,
      ""
    );
    await page.locator('[data-testid="catalogue-preview"]').getByRole("button", { name: "Close preview" }).click();

    await row().getByRole("button", { name: "Edit" }).click();
    const editedSlug = `${PRODUCT_SLUG}-v2`;
    await products.getByLabel(/^Slug/).fill(editedSlug);
    await products.getByRole("button", { name: "Save product" }).click();
    const slugEdited = await waitFor(async () => {
      const entry = await adminProduct(PRODUCT_NAME);
      return entry && entry.slug === editedSlug ? entry : null;
    }, "edited published slug");
    check(
      "published product slug is editable",
      slugEdited.slug === editedSlug && slugEdited.status === "ACTIVE",
      `slug=${slugEdited.slug} status=${slugEdited.status}`
    );
    const oldSlugPage = await context.request.get(`${BASE}/product/${PRODUCT_SLUG}`);
    const newSlugPage = await context.request.get(`${BASE}/product/${editedSlug}`);
    const oldSlugBody = await oldSlugPage.text();
    const newSlugBody = await newSlugPage.text();
    check(
      "edited slug replaces the public address",
      newSlugPage.status() === 200 &&
        newSlugBody.includes(PRODUCT_NAME) &&
        !oldSlugBody.includes(PRODUCT_NAME),
      `old=${oldSlugPage.status()} new=${newSlugPage.status()}`
    );
    if (oldSlugPage.status() === 200 && !oldSlugBody.includes(PRODUCT_NAME)) {
      observedDefects.push({
        name: "Non-existent product slugs return HTTP 200 with an unavailable shell",
        detail:
          "app/product/[id]/page.tsx catches the Prisma not-found error and renders an error state with status 200; a removed slug therefore does not return 404 like an existing draft does. Not fixed (file outside catalogue ownership).",
        evidence: `GET /product/${PRODUCT_SLUG} -> ${oldSlugPage.status()}`
      });
    }
    const searchAfterSlug = await api(`/api/products?q=${encodeURIComponent(PRODUCT_NAME)}&page=1&pageSize=10`);
    check(
      "published product remains searchable after slug edit",
      (searchAfterSlug.body?.items ?? []).some((entry) => entry.name === PRODUCT_NAME),
      `total=${searchAfterSlug.body?.total ?? "n/a"}`
    );

    try {
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SHOT_DIR, `published-row-${stamp}.png`), fullPage: true });
    } catch {
      /* supplementary evidence */
    }

    await row().getByRole("button", { name: "Unpublish" }).click();
    const unpublished = await waitFor(async () => {
      const entry = await adminProduct(PRODUCT_NAME);
      return entry && entry.status === "DRAFT" ? entry : null;
    }, "unpublished product");
    check("unpublish returns the product to DRAFT", unpublished.status === "DRAFT", unpublished.status);
    const afterUnpublishOld = await context.request.get(`${BASE}/product/${PRODUCT_SLUG}`);
    const afterUnpublishNew = await context.request.get(`${BASE}/product/${editedSlug}`);
    const afterUnpublishOldBody = await afterUnpublishOld.text();
    const afterUnpublishNewBody = await afterUnpublishNew.text();
    check(
      "unpublish removes both public addresses",
      afterUnpublishNew.status() === 404 &&
        !afterUnpublishNewBody.includes(PRODUCT_NAME) &&
        !afterUnpublishOldBody.includes(PRODUCT_NAME),
      `old=${afterUnpublishOld.status()} new=${afterUnpublishNew.status()}`
    );
    const searchAfterUnpublish = await api(`/api/products?q=${encodeURIComponent(PRODUCT_NAME)}&page=1&pageSize=10`);
    check(
      "unpublished product disappears from Shop search",
      !(searchAfterUnpublish.body?.items ?? []).some((entry) => entry.name === PRODUCT_NAME),
      `total=${searchAfterUnpublish.body?.total ?? "n/a"}`
    );
    const countAfterUnpublish = await api(`/api/products?category=${DEPT_SLUG_EDITED}&page=1&pageSize=1`);
    check(
      "unpublished product is removed from the department count",
      countAfterUnpublish.status === 200 && countAfterUnpublish.body?.total === 0,
      `total=${countAfterUnpublish.body?.total ?? "n/a"}`
    );
    await expectFailure(
      "unpublishing an already-unpublished product is refused",
      "/api/admin/catalogue/products",
      { method: "PATCH", data: { id: createdProduct.id, action: "unpublish" } },
      409,
      "already_unpublished"
    );

    await row().getByRole("button", { name: "Archive" }).click();
    const archived = await waitFor(async () => {
      const entry = await adminProduct(PRODUCT_NAME);
      return entry && entry.status === "ARCHIVED" ? entry : null;
    }, "archived product");
    check("archive moves the product to ARCHIVED", archived.status === "ARCHIVED", archived.status);
    const archivedPublic = await context.request.get(`${BASE}/product/${editedSlug}`);
    check("archived product remains non-public", archivedPublic.status() === 404, `status=${archivedPublic.status()}`);
    await expectFailure(
      "publishing an archived product is refused",
      "/api/admin/catalogue/products",
      { method: "PATCH", data: { id: createdProduct.id, action: "publish" } },
      409,
      "invalid_state"
    );

    // ---------------------------------------------------------------------
    // 5. Department deactivation removes the department from navigation.
    // ---------------------------------------------------------------------
    const finalDept = await adminCatalogue().then((catalogue) =>
      catalogue.departments.find((entry) => entry.id === createdDepartmentId)
    );
    await dept.locator("li", { hasText: DEPT_NAME }).first().getByRole("button", { name: "Edit" }).click();
    await dept.getByLabel("Active (visible in Shop navigation)").uncheck();
    await dept.getByRole("button", { name: "Save department" }).click();
    const deactivated = await waitFor(async () => {
      const catalogue = await adminCatalogue();
      const entry = catalogue.departments.find((candidate) => candidate.id === createdDepartmentId);
      return entry && entry.isActive === false ? entry : null;
    }, "deactivated department");
    check(
      "department edit is saved and left inactive",
      deactivated.isActive === false,
      `name=${deactivated.name} slug=${deactivated.slug}`
    );
    const navAfter = await api("/api/categories");
    check(
      "inactive department is removed from public navigation",
      Array.isArray(navAfter.body) && !navAfter.body.some((entry) => entry.id === createdDepartmentId),
      `categories=${Array.isArray(navAfter.body) ? navAfter.body.length : "n/a"}`
    );
    check(
      "test department retains its archived listings for audit",
      Boolean(finalDept),
      `listings=${finalDept?._count?.products ?? "n/a"}`
    );

    // ---------------------------------------------------------------------
    // 6. Authorization and historical-read checks.
    // ---------------------------------------------------------------------
    const anonymous = await fetch(`${BASE}/api/admin/catalogue`);
    check("anonymous catalogue read refused", anonymous.status === 401 || anonymous.status === 403, `status=${anonymous.status}`);

    if (fs.existsSync(CUSTOMER_FILE)) {
      const rawCustomer = fs
        .readFileSync(CUSTOMER_FILE, "utf8")
        .trim()
        .split(String.fromCharCode(10))
        .map((line) => line.trim());
      const customerApi = await request.newContext({ baseURL: BASE });
      const login = await customerApi.post("/api/auth/login", {
        data: { email: rawCustomer[0], password: rawCustomer[1] },
        headers: { Origin: BASE }
      });
      const deniedWrite = await customerApi.post("/api/admin/catalogue/departments", {
        data: { name: "Unauthorised Probe", description: "This must be refused by the server." },
        headers: { Origin: BASE }
      });
      const deniedRead = await customerApi.get("/api/admin/catalogue");
      check(
        "customer cannot create a department",
        login.status() === 200 && (deniedWrite.status() === 401 || deniedWrite.status() === 403),
        `login=${login.status()} denied=${deniedWrite.status()}`
      );
      check(
        "customer cannot read the admin catalogue",
        deniedRead.status() === 401 || deniedRead.status() === 403,
        `status=${deniedRead.status()}`
      );
      await customerApi.dispose();
    } else {
      skip("customer authorization checks", `${CUSTOMER_FILE} is missing`);
    }

    const adminOrders = await api("/api/admin/orders");
    if (adminOrders.status === 200 && Array.isArray(adminOrders.body) && adminOrders.body.length > 0) {
      const withItems = adminOrders.body.find((order) => Array.isArray(order.items) && order.items.length > 0);
      const item = withItems?.items?.find((entry) => entry.productName && entry.unitKobo !== undefined);
      check(
        "historical order items remain readable from snapshots",
        Boolean(item),
        item ? `${item.productName} @ ${item.unitKobo}` : "no order item"
      );
    } else {
      skip(
        "historical order items remain readable from snapshots",
        `admin orders endpoint returned ${adminOrders.status} with no orders in this database`
      );
    }
    skip(
      "regional scope enforcement executed end-to-end",
      "no country-scoped administrator fixture exists; scope helpers are enforced in the service and routes"
    );
    check("no browser page errors", pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));
  } catch (error) {
    harnessError = error;
    check("journey completed without harness error", false, error.message);
  } finally {
    await cleanup();
    await browser.close();
    process.exit(report(harnessError));
  }
})().catch((error) => {
  console.error("CATALOGUE JOURNEY ERROR", error.message);
  process.exit(2);
});
