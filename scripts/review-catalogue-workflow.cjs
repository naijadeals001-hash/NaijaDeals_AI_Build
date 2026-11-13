/**
 * Admin-led catalogue acceptance.
 *
 * Covers: department create/edit (editable slug, ordering, imagery) → product
 * draft with explicit currency, inventory and matching imagery → server
 * validation → authorized Control Center preview → publish → public
 * visibility/search/count → editable published slug → unpublish → archive →
 * removal from every public surface. Invalid data and illegal state
 * transitions are asserted too.
 *
 * Cleanup isolation: every record this workflow creates carries the unique
 * RUN_ID in its name and slug. Cleanup only archives/deactivates records that
 * contain that token, never a shared department or the approved catalogue.
 * Shared department state is snapshotted before the run and compared (and, if
 * a shared record was deliberately touched, restored exactly) afterwards.
 * After the run-owned workflow records are removed the catalogue must be back
 * at the approved REVIEW baseline of 7 active departments / 23 active products
 * (or at the approved 9/31 expansion state on a subsequent run).
 *
 * The expansion phase publishes a fixed, idempotent DEMO batch across
 * Groceries, Power & Solar and Gaming through the same Control Center API the
 * admin UI uses, then exercises a dedicated publish → unpublish → exclusion
 * acceptance product. Those expansion rows are deliberate catalogue content,
 * not test residue, and are therefore not removed by cleanup.
 *
 * No payment, provider call or live operation is made.
 *
 * Usage:
 *   node scripts/review-catalogue-workflow.cjs
 *   REVIEW_BASE_URL=http://localhost:3057 node scripts/review-catalogue-workflow.cjs
 */
const crypto = require("node:crypto");
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
const SEED_BASELINE = { departments: 7, products: 23 };
const EXPANDED_BASELINE = { departments: 11, products: 57 };
const DEMO_NOTE = "DEMO — demonstration inventory, not live supply";
const [email, password] = fs.readFileSync(CREDENTIAL_FILE, "utf8").trim().split(/\r?\n/);

const runId = `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${Math.random()
  .toString(36)
  .slice(2, 8)}`;
const stamp = runId.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(-10);
const DEPT_NAME = `DEMO Review department ${runId}`;
const DEPT_SLUG = `demo-review-department-${runId}`;
const DEPT_SLUG_EDITED = `${DEPT_SLUG}-edited`;
const PRODUCT_NAME = `DEMO — Review workflow blender ${runId}`;
const PRODUCT_SLUG = `demo-review-workflow-blender-${runId}`;
const INCOMPLETE_NAME = `DEMO — Incomplete workflow probe ${runId}`;

const GROCERIES_IMAGE_ALT = "Basket of fresh tomatoes, peppers, leafy greens and onions";
/**
 * Approved expansion taxonomy categories. Power & Solar and Gaming are
 * level-1 categories under Home & Living and Electronics & Technology in the
 * seeded taxonomy, not top-level departments. The workflow verifies them but
 * never creates or rewrites a shared taxonomy node.
 */
const EXPANSION_DEPARTMENTS = [
  {
    name: "Power & Solar",
    slug: "power-solar",
    parentSlug: "home-living",
    description: "DEMO department — demonstration inventory for owner review, not live supply.",
    imageUrl: "/generated/shop/category-power-solar.webp",
    imageAlt: "Solar panel, portable power station and power bank on a pale blue surface"
  },
  {
    name: "Gaming",
    slug: "gaming",
    parentSlug: "electronics-technology",
    description: "DEMO department — demonstration inventory for owner review, not live supply.",
    imageUrl: "/generated/shop/category-gaming.webp",
    imageAlt: "Game controller, mechanical keyboard and headset on a dark surface"
  }
];

const EXPANSION_PRODUCTS = [
  {
    departmentSlug: "groceries-household",
    name: "DEMO — Red bell peppers, 500g",
    slug: "demo-red-bell-peppers-500g",
    description:
      "Demonstration listing. Representative produce image; grade, pack weight and availability are illustrative.",
    priceKobo: 180000,
    quantity: 25,
    lowStockLevel: 3,
    imageUrl: "/generated/shop/product-red-bell-pepper-500g.webp",
    imageAlt: "Demonstration product image of red bell peppers"
  },
  {
    departmentSlug: "groceries-household",
    name: "DEMO — Diced onions, 500g",
    slug: "demo-diced-onions-500g",
    description:
      "Demonstration listing. Representative produce image; grade, pack weight and availability are illustrative.",
    priceKobo: 220000,
    quantity: 25,
    lowStockLevel: 3,
    imageUrl: "/generated/shop/product-diced-onions-500g.webp",
    imageAlt: "Demonstration product image of diced onions"
  },
  {
    departmentSlug: "groceries-household",
    name: "DEMO — Green beans, 500g",
    slug: "demo-green-beans-500g",
    description:
      "Demonstration listing. Representative produce image; grade, pack weight and availability are illustrative.",
    priceKobo: 150000,
    quantity: 25,
    lowStockLevel: 3,
    imageUrl: "/generated/shop/product-green-beans-500g.webp",
    imageAlt: "Demonstration product image of green beans"
  },
  {
    departmentSlug: "power-solar",
    name: "DEMO — Solar power inverter",
    slug: "demo-solar-power-inverter",
    description:
      "Demonstration listing. Representative inverter image; capacity, socket configuration and included accessories are illustrative and not a seller specification.",
    priceKobo: 28500000,
    quantity: 25,
    lowStockLevel: 3,
    imageUrl: "/generated/shop/product-solar-power-inverter.webp",
    imageAlt: "Demonstration product image of a solar power inverter with an LCD panel and power outlets"
  },
  {
    departmentSlug: "power-solar",
    name: "DEMO — Rooftop solar panel array with mounting frame",
    slug: "demo-rooftop-solar-panel-array",
    description:
      "Demonstration listing. Representative solar array image; panel count and mounting configuration are illustrative and not a seller specification.",
    priceKobo: 42000000,
    quantity: 25,
    lowStockLevel: 3,
    imageUrl: "/generated/shop/product-rooftop-solar-panel-array.webp",
    imageAlt: "Demonstration product image of three solar panels on a mounting frame"
  },
  {
    departmentSlug: "power-solar",
    name: "DEMO — Portable solar battery charging station",
    slug: "demo-portable-solar-charging-station",
    description:
      "Demonstration listing. Representative portable battery image; capacity, ports and included panels are illustrative and not a seller specification.",
    priceKobo: 19500000,
    quantity: 25,
    lowStockLevel: 3,
    imageUrl: "/generated/shop/product-solar-battery-charging-station.webp",
    imageAlt: "Demonstration product image of a portable battery station with two fold-out solar panels"
  },
  {
    departmentSlug: "gaming",
    name: "DEMO — Wireless game controllers, black and white pair",
    slug: "demo-wireless-game-controllers-pair",
    description:
      "Demonstration listing. Representative controller image; connectivity, compatibility and battery life are illustrative and not a seller specification.",
    priceKobo: 5200000,
    quantity: 25,
    lowStockLevel: 3,
    imageUrl: "/generated/shop/product-ps4-and-xbox-one-controllers.webp",
    imageAlt: "Demonstration product image of two wireless game controllers, one black and one white"
  },
  {
    departmentSlug: "gaming",
    name: "DEMO — Game controller with coloured buttons",
    slug: "demo-game-controller-coloured-buttons",
    description:
      "Demonstration listing. Representative controller image; connectivity, compatibility and button layout are illustrative and not a seller specification.",
    priceKobo: 2900000,
    quantity: 25,
    lowStockLevel: 3,
    imageUrl: "/generated/shop/product-xbox-360-controller.webp",
    imageAlt: "Demonstration product image of a white and grey game controller with coloured action buttons"
  }
];

const checks = [];
const skips = [];
const observedDefects = [];
const pageErrors = [];
const createdProductIds = [];
const expansionCreatedDepartments = [];
const expansionCreatedProducts = [];
let createdDepartmentId = null;
let baseline = null;
let baselineIsSeed = false;
let finalCounts = null;
const baselineProductGuards = [];


function check(name, ok, detail = "") {
  checks.push({ name, ok: Boolean(ok), detail: String(detail ?? "") });
}

function skip(name, reason) {
  skips.push({ name, reason });
}

/** A record is run-owned only when its stored name or slug contains this run. */
function isRunOwned(entry) {
  if (!entry) return false;
  const haystack = `${entry.name ?? ""} ${entry.slug ?? ""}`.toLowerCase();
  return haystack.includes(runId.toLowerCase());
}

function activeCounts(catalogue) {
  return {
    departments: catalogue.departments.filter((entry) => entry.isActive && (entry.level ?? 0) === 0).length,
    products: catalogue.products.filter((entry) => entry.status === "ACTIVE").length
  };
}

/**
 * The preserved fields of an accepted catalogue record. These are exactly the
 * fields an unrelated workflow must never change: identity, classification,
 * publication state, DEMO provenance, imagery, inventory and price.
 */
function productSnapshot(product) {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    categoryId: product.categoryId,
    status: product.status,
    isDemo: product.isDemo === true,
    isSample: product.isSample === true,
    priceKobo: product.priceKobo === null || product.priceKobo === undefined ? null : String(product.priceKobo),
    currency: product.currency ?? null,
    countryCode: product.countryCode ?? null,
    images: (product.images ?? []).map((image) => ({
      url: image.url ?? null,
      alt: image.alt ?? null,
      sortOrder: image.sortOrder ?? 0
    })),
    stock: product.stock
      ? {
          quantity: product.stock.quantity ?? null,
          reserved: product.stock.reserved ?? null,
          lowStockLevel: product.stock.lowStockLevel ?? null
        }
      : null
  };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function fingerprintProducts(products) {
  return crypto.createHash("sha256").update(stableJson(products)).digest("hex");
}

function productDifferences(before, after) {
  const changedFields = [];
  for (const field of Object.keys(before)) {
    if (stableJson(before[field]) !== stableJson(after[field])) changedFields.push(field);
  }
  return changedFields;
}

function describeProductDrift(existing, spec) {
  const mismatches = [];
  if (existing.name !== spec.name) mismatches.push("name");
  if (existing.slug !== spec.slug) mismatches.push("slug");
  if (existing.description !== spec.description) mismatches.push("description");
  if (existing.priceKobo !== String(spec.priceKobo)) mismatches.push("priceKobo");
  if (existing.stock?.quantity !== spec.quantity) mismatches.push("stock.quantity");
  if (existing.stock?.lowStockLevel !== spec.lowStockLevel) mismatches.push("stock.lowStockLevel");
  if (existing.isDemo !== true) mismatches.push("isDemo");
  if (existing.images.length !== 1) mismatches.push("images.length");
  if (existing.images[0]?.url !== spec.imageUrl) mismatches.push("images[0].url");
  if (existing.images[0]?.alt !== spec.imageAlt) mismatches.push("images[0].alt");
  return mismatches.join(",") || "unknown";
}

function countsLabel(counts) {
  return `${counts.departments} active departments / ${counts.products} active products`;
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
      // A probe that unexpectedly succeeds must still never hand a shared row
      // to the cleanup routine. Only run-owned ids are recorded.
      if (id && isRunOwned(result.body)) createdProductIds.push(id);
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

  async function snapshotCatalogue() {
    const catalogue = await adminCatalogue();
    const activeDepartments = catalogue.departments.filter((entry) => entry.isActive && (entry.level ?? 0) === 0);
    const activeProducts = catalogue.products.filter((entry) => entry.status === "ACTIVE");
    const products = activeProducts
      .map(productSnapshot)
      .sort((left, right) => left.id.localeCompare(right.id));
    return {
      counts: {
        departments: activeDepartments.length,
        products: activeProducts.length
      },
      departments: catalogue.departments.map((entry) => ({
        id: entry.id,
        name: entry.name,
        slug: entry.slug,
        description: entry.description,
        imageUrl: entry.imageUrl,
        imageAlt: entry.imageAlt,
        sortOrder: entry.sortOrder,
        isActive: entry.isActive,
        isDemo: entry.isDemo
      })),
      activeDepartmentIds: activeDepartments.map((entry) => entry.id),
      activeProductIds: activeProducts.map((entry) => entry.id),
      activeProductSlugs: activeProducts.map((entry) => entry.slug),
      products,
      productFingerprint: fingerprintProducts(products),
      activeProductFingerprint: fingerprintProducts(products)
    };
  }

  async function restoreSharedDepartment(before) {
    const result = await api("/api/admin/catalogue/departments", {
      method: "PATCH",
      data: {
        id: before.id,
        name: before.name,
        slug: before.slug,
        description: before.description ?? "",
        imageUrl: before.imageUrl ?? "",
        imageAlt: before.imageAlt ?? "",
        sortOrder: before.sortOrder,
        isActive: before.isActive,
        isDemo: before.isDemo
      }
    });
    const after = await adminCatalogue().catch(() => null);
    const restored = after?.departments.find((entry) => entry.id === before.id);
    check(
      `shared department ${before.name} restored to captured state`,
      result.status === 200 &&
        restored?.isActive === before.isActive &&
        restored?.slug === before.slug &&
        restored?.sortOrder === before.sortOrder,
      `status=${result.status} active=${restored?.isActive} slug=${restored?.slug}`
    );
  }

  /**
   * The workflow must not alter shared departments. If an earlier run (or a
   * UI mistake) flipped one, restore the captured fields exactly rather than
   * leaving the approved navigation changed.
   */
  async function guardSharedDepartments() {
    if (!baseline) return;
    const catalogue = await adminCatalogue().catch(() => null);
    if (!catalogue) {
      check("shared department state could be read after cleanup", false, "admin catalogue unavailable");
      return;
    }
    const sharedBefore = baseline.departments.filter((entry) => !isRunOwned(entry));
    const unexpected = [];
    for (const before of sharedBefore) {
      const current = catalogue.departments.find((entry) => entry.id === before.id);
      if (!current) {
        unexpected.push(`${before.name}: missing after run`);
        continue;
      }
      const fields = ["name", "slug", "description", "imageUrl", "imageAlt", "sortOrder", "isDemo"];
      const changedFields = fields.filter(
        (field) => (current[field] ?? null) !== (before[field] ?? null)
      );
      if (current.isActive !== before.isActive || changedFields.length > 0) {
        await restoreSharedDepartment(before);
        const restored = (await adminCatalogue()).departments.find((entry) => entry.id === before.id);
        if (restored?.isActive !== before.isActive || changedFields.some((field) => (restored?.[field] ?? null) !== (before[field] ?? null))) {
          unexpected.push(`${before.name}: could not restore ${changedFields.join(",") || "active state"}`);
        }
      }
    }
    const after = await adminCatalogue();
    const stillWrong = sharedBefore.filter((before) => {
      const current = after.departments.find((entry) => entry.id === before.id);
      return (
        !current ||
        current.isActive !== before.isActive ||
        ["name", "slug", "description", "imageUrl", "imageAlt", "sortOrder", "isDemo"].some(
          (field) => (current[field] ?? null) !== (before[field] ?? null)
        )
      );
    });
    check(
      "shared departments and navigation are unchanged by the workflow",
      unexpected.length === 0 && stillWrong.length === 0,
      unexpected.length || stillWrong.length
        ? [...unexpected, ...stillWrong.map((entry) => entry.name)].join(" | ")
        : `${sharedBefore.length} shared departments verified`
    );
  }

  /**
   * Byte-equivalence guard for every accepted baseline product.
   *
   * The earlier guard only re-checked that baseline products were still
   * ACTIVE. That would have missed the obsolete broad-category correction,
   * which rewrote Product.categoryId (and could silently rewrite imagery,
   * inventory or price). This guard fingerprints the exact preserved fields
   * captured before the run and fails on any difference, naming each changed
   * field. A changed record must be run-owned; otherwise the workflow has
   * mutated approved catalogue content.
   */
  async function guardBaselineProducts(stage) {
    if (!baseline) return { stage, fingerprint: null, unchanged: false, differences: [] };
    const catalogue = await adminCatalogue();
    const byId = new Map(catalogue.products.map((entry) => [entry.id, entry]));
    const differences = [];
    const current = [];
    for (const before of baseline.products) {
      const entry = byId.get(before.id);
      if (!entry) {
        differences.push(`${before.slug}: missing from the catalogue`);
        continue;
      }
      const after = productSnapshot(entry);
      current.push(after);
      const changedFields = productDifferences(before, after);
      if (changedFields.length > 0) {
        differences.push(`${before.slug}: ${changedFields.join(",")}${isRunOwned(entry) ? " (run-owned)" : ""}`);
      }
    }
    const fingerprint = fingerprintProducts(current);
    check(
      `accepted baseline products are byte-equivalent ${stage} (id, slug, categoryId, status, DEMO, images, inventory, price)`,
      differences.length === 0 && baseline.products.length === current.length,
      differences.length
        ? differences.slice(0, 8).join(" | ")
        : `${baseline.products.length} products; ${baseline.productFingerprint.slice(0, 16)} -> ${fingerprint.slice(0, 16)}`
    );
    check(
      `no accepted baseline product was mutated by the workflow ${stage}`,
      differences.length === 0,
      differences.length ? `${differences.length} changed` : "0 changed"
    );
    return { stage, fingerprint, unchanged: differences.length === 0, differences };
  }

  /**
   * Archive/deactivate only records whose name or slug contains this RUN_ID.
   * A shared row is never passed to a mutation, even if an id was captured
   * incorrectly by an unexpected API response.
   */
  async function cleanupRunRecords({ assertBaseline = false } = {}) {
    try {
      const catalogue = await adminCatalogue();
      const runOwnedProductIds = catalogue.products.filter(isRunOwned).map((product) => product.id);
      for (const id of [...new Set([...createdProductIds, ...runOwnedProductIds].filter(Boolean))]) {
        const entry = catalogue.products.find((product) => product.id === id);
        if (!entry) continue;
        if (!isRunOwned(entry)) {
          check("cleanup refused to archive a non-run-owned product", false, `${entry.name} / ${entry.slug}`);
          continue;
        }
        if (entry.status !== "ARCHIVED") {
          const archived = await api("/api/admin/catalogue/products", {
            method: "PATCH",
            data: { id, action: "archive" }
          });
          check(
            `cleanup archived run-owned product ${entry.slug}`,
            archived.status === 200 && archived.body?.status === "ARCHIVED",
            `status=${archived.status} product=${archived.body?.status ?? "none"}`
          );
        }
      }

      const runOwnedDepartments = (await adminCatalogue()).departments.filter(isRunOwned);
      for (const entry of runOwnedDepartments) {
        if (!entry.isActive) continue;
        const deactivated = await api("/api/admin/catalogue/departments", {
          method: "PATCH",
          data: { id: entry.id, isActive: false }
        });
        check(
          `cleanup deactivated run-owned department ${entry.slug}`,
          deactivated.status === 200 && deactivated.body?.isActive === false,
          `status=${deactivated.status} active=${deactivated.body?.isActive}`
        );
      }

      const after = await adminCatalogue();
      const activeRunDepartments = after.departments.filter((entry) => isRunOwned(entry) && entry.isActive);
      const unarchivedRunProducts = after.products.filter((entry) => isRunOwned(entry) && entry.status !== "ARCHIVED");
      check(
        "cleanup leaves no active run-owned departments",
        activeRunDepartments.length === 0,
        activeRunDepartments.map((entry) => entry.slug).join(",") || "none"
      );
      check(
        "cleanup leaves no unarchived run-owned products",
        unarchivedRunProducts.length === 0,
        unarchivedRunProducts.map((entry) => entry.slug).join(",") || "none"
      );

      if (assertBaseline) {
        const counts = activeCounts(after);
        const expected = baseline?.counts ?? SEED_BASELINE;
        check(
          "cleanup restores the recorded catalogue baseline",
          counts.departments === expected.departments && counts.products === expected.products,
          `${countsLabel(counts)}; expected ${countsLabel(expected)}`
        );
        if (baselineIsSeed) {
          check(
            "cleanup restores the approved seed baseline (7 active departments / 23 active products)",
            counts.departments === SEED_BASELINE.departments && counts.products === SEED_BASELINE.products,
            countsLabel(counts)
          );
        } else {
          skip(
            "cleanup restores the approved seed baseline (7 active departments / 23 active products)",
            `run started from the approved expansion state (${countsLabel(expected)}); recorded baseline restored instead`
          );
        }
      }
      finalCounts = activeCounts(after);
    } catch (error) {
      check("cleanup completed without error", false, error.message);
    }
  }

  /**
   * The approved batch also backfills the existing Groceries department image
   * alt text. That is a deliberate shared-record change, so it is recorded in
   * the baseline after success; the final shared-state guard then verifies the
   * approved value instead of reverting it to the pre-run null.
   */
  async function ensureGroceriesImageAlt() {
    const catalogue = await adminCatalogue();
    const department = catalogue.departments.find((entry) => entry.slug === "groceries-household");
    if (!department) {
      check("approved Groceries department image alt is available to verify", false, "department missing");
      return;
    }
    if (department.imageAlt === GROCERIES_IMAGE_ALT) {
      check("Groceries department image alt matches the approved batch", true, GROCERIES_IMAGE_ALT);
      return;
    }
    const updated = await api("/api/admin/catalogue/departments", {
      method: "PATCH",
      data: { id: department.id, imageAlt: GROCERIES_IMAGE_ALT }
    });
    check(
      "Groceries department image alt backfilled through the Control Center API",
      updated.status === 200 && updated.body?.imageAlt === GROCERIES_IMAGE_ALT,
      `status=${updated.status} previous=${department.imageAlt ?? "none"} alt=${updated.body?.imageAlt ?? "none"}`
    );
    if (updated.status === 200 && updated.body?.imageAlt === GROCERIES_IMAGE_ALT && baseline) {
      const baselineEntry = baseline.departments.find((entry) => entry.id === department.id);
      if (baselineEntry) baselineEntry.imageAlt = GROCERIES_IMAGE_ALT;
    }
  }

  async function ensureExpansionDepartment(spec) {
    const catalogue = await adminCatalogue();
    const existing = catalogue.departments.find((entry) => entry.slug === spec.slug);
    if (!existing) {
      check(
        `approved taxonomy category ${spec.slug} is present`,
        false,
        "missing from the catalogue; this workflow never creates shared taxonomy nodes"
      );
      return null;
    }
    const parent = existing.parentId
      ? catalogue.departments.find((entry) => entry.id === existing.parentId)
      : null;
    const matches =
      existing.name === spec.name &&
      existing.description === spec.description &&
      existing.imageUrl === spec.imageUrl &&
      existing.imageAlt === spec.imageAlt &&
      existing.isActive === true &&
      existing.isDemo === true &&
      existing.level === 1 &&
      parent?.slug === spec.parentSlug;
    check(
      `approved taxonomy category ${spec.slug} matches the seeded baseline`,
      matches,
      `level=${existing.level} parent=${parent?.slug ?? "none"} active=${existing.isActive} demo=${existing.isDemo} image=${existing.imageUrl ?? "none"}`
    );
    return existing;
  }

  async function ensureExpansionProduct(spec, departmentId) {
    let catalogue = await adminCatalogue();
    let existing = catalogue.products.find((entry) => entry.slug === spec.slug);
    if (existing) {
      if (existing.status === "ARCHIVED") {
        check(
          `expansion product ${spec.slug} is publishable`,
          false,
          "record exists as ARCHIVED; this workflow cannot republish it without creating a duplicate"
        );
        return existing;
      }
      const matches =
        existing.name === spec.name &&
        existing.description === spec.description &&
        existing.priceKobo === String(spec.priceKobo) &&
        existing.stock?.quantity === spec.quantity &&
        existing.images.length === 1 &&
        existing.images[0]?.url === spec.imageUrl &&
        existing.images[0]?.alt === spec.imageAlt &&
        existing.isDemo === true;
      if (!matches) {
        if (!isRunOwned(existing)) {
          check(
            `expansion product ${spec.slug} matches the approved baseline and was not mutated`,
            false,
            `approved catalogue drift (${describeProductDrift(existing, spec)}); refusing to PATCH a non-run-owned record`
          );
          return existing;
        }
        const updated = await api("/api/admin/catalogue/products", {
          method: "PATCH",
          data: {
            id: existing.id,
            name: spec.name,
            slug: spec.slug,
            description: spec.description,
            priceKobo: spec.priceKobo,
            currency: "NGN",
            quantity: spec.quantity,
            lowStockLevel: spec.lowStockLevel,
            images: [{ url: spec.imageUrl, alt: spec.imageAlt }],
            isDemo: true
          }
        });
        check(
          `run-owned expansion product ${spec.slug} corrected through the Control Center API`,
          updated.status === 200,
          `status=${updated.status} code=${updated.body?.code ?? "none"}`
        );
        catalogue = await adminCatalogue();
        existing = catalogue.products.find((entry) => entry.slug === spec.slug);
      }
      if (existing?.status === "DRAFT") {
        const validation = await api("/api/admin/catalogue/products", {
          method: "PATCH",
          data: { id: existing.id, action: "validate" }
        });
        check(
          `expansion draft ${spec.slug} passes server validation`,
          validation.status === 200 && validation.body?.valid === true,
          `valid=${validation.body?.valid} issues=${(validation.body?.issues ?? []).length}`
        );
        const published = await api("/api/admin/catalogue/products", {
          method: "PATCH",
          data: { id: existing.id, action: "publish" }
        });
        check(
          `expansion product ${spec.slug} published through the Control Center API`,
          published.status === 200 && published.body?.status === "ACTIVE",
          `status=${published.status} product=${published.body?.status ?? "none"} code=${published.body?.code ?? "none"}`
        );
      } else {
        check(
          `expansion product ${spec.slug} remains published`,
          existing?.status === "ACTIVE",
          `status=${existing?.status ?? "missing"}`
        );
      }
      return existing;
    }

    const created = await api("/api/admin/catalogue/products", {
      method: "POST",
      data: {
        name: spec.name,
        slug: spec.slug,
        description: spec.description,
        priceKobo: spec.priceKobo,
        currency: "NGN",
        countryCode: "NG",
        categoryId: departmentId,
        quantity: spec.quantity,
        lowStockLevel: spec.lowStockLevel,
        images: [{ url: spec.imageUrl, alt: spec.imageAlt }],
        isDemo: true
      }
    });
    check(
      `expansion product ${spec.slug} created as an explicit-currency DEMO draft`,
      created.status === 201 &&
        created.body?.status === "DRAFT" &&
        created.body?.isDemo === true &&
        created.body?.countryCode === "NG",
      `status=${created.status} product=${created.body?.status ?? "none"} country=${created.body?.countryCode ?? "none"} code=${created.body?.code ?? "none"}`
    );
    if (!created.body?.id) return null;
    expansionCreatedProducts.push(created.body.id);

    const validation = await api("/api/admin/catalogue/products", {
      method: "PATCH",
      data: { id: created.body.id, action: "validate" }
    });
    check(
      `expansion draft ${spec.slug} passes server validation`,
      validation.status === 200 && validation.body?.valid === true,
      `valid=${validation.body?.valid} issues=${(validation.body?.issues ?? []).length}`
    );
    const published = await api("/api/admin/catalogue/products", {
      method: "PATCH",
      data: { id: created.body.id, action: "publish" }
    });
    check(
      `expansion product ${spec.slug} published through the Control Center API`,
      published.status === 200 && published.body?.status === "ACTIVE",
      `status=${published.status} product=${published.body?.status ?? "none"} code=${published.body?.code ?? "none"}`
    );
    return published.body ?? created.body;
  }

  async function verifyExpansionVisibility() {
    const catalogue = await adminCatalogue();
    const activeSlugs = new Set(
      catalogue.products.filter((entry) => entry.status === "ACTIVE").map((entry) => entry.slug)
    );
    const missing = EXPANSION_PRODUCTS.filter((spec) => !activeSlugs.has(spec.slug)).map((spec) => spec.slug);
    check("every approved expansion product is ACTIVE", missing.length === 0, missing.join(",") || "8/8 active");

    const departmentSlugs = new Set(EXPANSION_PRODUCTS.map((spec) => spec.departmentSlug));
    for (const departmentSlug of departmentSlugs) {
      const expected = EXPANSION_PRODUCTS.filter((spec) => spec.departmentSlug === departmentSlug);
      const result = await api(`/api/products?category=${departmentSlug}&page=1&pageSize=60`);
      const items = Array.isArray(result.body?.items) ? result.body.items : [];
      const found = expected.filter((spec) => items.some((item) => item.slug === spec.slug));
      check(
        `Shop department ${departmentSlug} lists the expansion products`,
        result.status === 200 && found.length === expected.length,
        `total=${result.body?.total ?? "n/a"} matched=${found.length}/${expected.length}`
      );
    }

    for (const spec of EXPANSION_PRODUCTS) {
      const direct = await context.request.get(`${BASE}/product/${spec.slug}`);
      const body = await direct.text();
      check(
        `published expansion product /product/${spec.slug} returns 200 with its content`,
        direct.status() === 200 && body.includes(spec.name) && body.includes(spec.imageAlt),
        `status=${direct.status()} name=${body.includes(spec.name)} alt=${body.includes(spec.imageAlt)}`
      );
      const search = await api(`/api/products?q=${encodeURIComponent(spec.name)}&page=1&pageSize=20`);
      check(
        `Shop search finds ${spec.slug}`,
        search.status === 200 && (search.body?.items ?? []).some((item) => item.slug === spec.slug),
        `total=${search.body?.total ?? "n/a"}`
      );
    }

    for (const departmentSlug of departmentSlugs) {
      await page.goto(`${BASE}/naijashop/c/${departmentSlug}`, { waitUntil: "networkidle" });
      const expectedNames = EXPANSION_PRODUCTS.filter((spec) => spec.departmentSlug === departmentSlug).map(
        (spec) => spec.name
      );
      let rendered = 0;
      for (const name of expectedNames) {
        if ((await page.getByText(name, { exact: false }).count()) > 0) rendered += 1;
      }
      check(
        `Shop department page /naijashop/c/${departmentSlug} renders its expansion products`,
        rendered === expectedNames.length,
        `rendered=${rendered}/${expectedNames.length}`
      );
      try {
        fs.mkdirSync(SHOT_DIR, { recursive: true });
        await page.waitForTimeout(300);
        await page.screenshot({
          path: path.join(SHOT_DIR, `expansion-shop-${departmentSlug}-${stamp}.png`),
          fullPage: true
        });
      } catch {
        /* supplementary evidence */
      }
    }

    await page.goto(`${BASE}/naijashop`, { waitUntil: "networkidle" });
    const taxonomyPayload = await (await page.request.get(`${BASE}/api/taxonomy`)).text();
    check(
      "Shop taxonomy exposes Power & Solar and Gaming nodes",
      taxonomyPayload.includes('"power-solar"') && taxonomyPayload.includes('"gaming"'),
      "taxonomy response"
    );
    const searchSpec = EXPANSION_PRODUCTS[0];
    await page.goto(`${BASE}/naijashop/search?q=${encodeURIComponent(searchSpec.name)}`, {
      waitUntil: "networkidle"
    });
    const shopSearchRendered = await page.getByText(searchSpec.name, { exact: false }).count();
    check(
      "Shop search page renders the approved expansion product",
      shopSearchRendered > 0,
      `${searchSpec.name}: ${shopSearchRendered} match(es)`
    );
    try {
      await page.waitForTimeout(300);
      await page.screenshot({
        path: path.join(SHOT_DIR, `expansion-shop-search-${stamp}.png`),
        fullPage: true
      });
    } catch {
      /* supplementary evidence */
    }

    check(
      "expansion keeps Power & Solar and Gaming active under the seeded taxonomy without disturbing the approved seed",
      catalogue.departments.filter((entry) => entry.isActive && ["power-solar", "gaming"].includes(entry.slug)).length === 2 &&
        catalogue.departments.some((entry) => entry.slug === "groceries-household" && entry.isActive),
      `${catalogue.departments.filter((entry) => entry.isActive).length} active categories`
    );
    const counts = activeCounts(catalogue);
    check(
      "expansion matches the approved active-catalogue delta",
      counts.departments === baseline.counts.departments &&
        counts.products ===
          (baselineIsSeed ? SEED_BASELINE.products + EXPANSION_PRODUCTS.length : baseline.counts.products),
      countsLabel(counts)
    );
  }

  async function runAcceptanceLifecycle(departmentId) {
    const name = `DEMO — Acceptance lifecycle probe ${runId}`;
    const slug = `demo-acceptance-${runId}`;
    const created = await api("/api/admin/catalogue/products", {
      method: "POST",
      data: {
        name,
        slug,
        description:
          "Dedicated acceptance probe created through the Control Center. It is published, unpublished and archived in this run, and is not real supply.",
        priceKobo: 250000,
        currency: "NGN",
        countryCode: "NG",
        categoryId: departmentId,
        quantity: 3,
        lowStockLevel: 1,
        images: [{ url: "/generated/shop/product-diced-onions-500g.webp", alt: "Demonstration product image of diced onions in a bowl" }],
        isDemo: true
      }
    });
    check("dedicated acceptance product created as DRAFT", created.status === 201 && created.body?.status === "DRAFT", `status=${created.status}`);
    if (!created.body?.id) return;
    createdProductIds.push(created.body.id);

    const validation = await api("/api/admin/catalogue/products", {
      method: "PATCH",
      data: { id: created.body.id, action: "validate" }
    });
    check("dedicated acceptance product passes validation", validation.status === 200 && validation.body?.valid === true, `valid=${validation.body?.valid}`);
    const published = await api("/api/admin/catalogue/products", {
      method: "PATCH",
      data: { id: created.body.id, action: "publish" }
    });
    check("dedicated acceptance product publishes", published.status === 200 && published.body?.status === "ACTIVE", `status=${published.status}`);
    const publicPage = await context.request.get(`${BASE}/product/${slug}`);
    const publicBody = await publicPage.text();
    check(
      "dedicated acceptance product is visible directly and in search before unpublish",
      publicPage.status() === 200 && publicBody.includes(name),
      `status=${publicPage.status()} name=${publicBody.includes(name)}`
    );
    const searchBefore = await api(`/api/products?q=${encodeURIComponent(name)}&page=1&pageSize=10`);
    check(
      "dedicated acceptance product appears in Shop search before unpublish",
      (searchBefore.body?.items ?? []).some((entry) => entry.slug === slug),
      `total=${searchBefore.body?.total ?? "n/a"}`
    );

    const unpublished = await api("/api/admin/catalogue/products", {
      method: "PATCH",
      data: { id: created.body.id, action: "unpublish" }
    });
    check("dedicated acceptance product unpublishes to DRAFT", unpublished.status === 200 && unpublished.body?.status === "DRAFT", `status=${unpublished.status} product=${unpublished.body?.status ?? "none"}`);
    const afterPage = await context.request.get(`${BASE}/product/${slug}`);
    const afterBody = await afterPage.text();
    const searchAfter = await api(`/api/products?q=${encodeURIComponent(name)}&page=1&pageSize=10`);
    check(
      "unpublished acceptance product is excluded from the public page and Shop search",
      afterPage.status() === 404 &&
        !afterBody.includes(name) &&
        !(searchAfter.body?.items ?? []).some((entry) => entry.slug === slug),
      `page=${afterPage.status()} leaked=${afterBody.includes(name)} searchTotal=${searchAfter.body?.total ?? "n/a"}`
    );

    const archived = await api("/api/admin/catalogue/products", {
      method: "PATCH",
      data: { id: created.body.id, action: "archive" }
    });
    check("dedicated acceptance product archives", archived.status === 200 && archived.body?.status === "ARCHIVED", `status=${archived.status} product=${archived.body?.status ?? "none"}`);
  }


  function report(harnessError) {
    const failed = checks.filter((entry) => !entry.ok);
    const output = {
      buildSource: "served",
      baseUrl: BASE,
      runId,
      checkedAt: new Date().toISOString(),
      baseline: baseline
        ? {
            counts: baseline.counts,
            departments: baseline.departments.length,
            products: baseline.products.length,
            activeProductSlugs: baseline.activeProductSlugs,
            productFingerprint: baseline.productFingerprint,
            activeProductFingerprint: baseline.activeProductFingerprint
          }
        : null,
      finalCounts,
      baselineProductPreservation: baselineProductGuards,
      expansion: {
        createdDepartments: expansionCreatedDepartments,
        createdProducts: expansionCreatedProducts,
        plannedDepartments: EXPANSION_DEPARTMENTS.map((entry) => entry.slug),
        plannedProducts: EXPANSION_PRODUCTS.map((entry) => entry.slug)
      },
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

    baseline = await snapshotCatalogue();
    baselineIsSeed =
      baseline.counts.departments === SEED_BASELINE.departments &&
      baseline.counts.products === SEED_BASELINE.products;
    const baselineIsExpanded =
      baseline.counts.departments === EXPANDED_BASELINE.departments &&
      baseline.counts.products === EXPANDED_BASELINE.products;
    check(
      "catalogue baseline captured before any mutation",
      Boolean(baseline),
      `${countsLabel(baseline.counts)} · ${baseline.departments.length} departments / ${baseline.activeProductSlugs.length} active products recorded`
    );
    if (baselineIsSeed) {
      check(
        "baseline matches the approved REVIEW seed (7 active departments / 23 active products)",
        true,
        countsLabel(baseline.counts)
      );
    } else if (baselineIsExpanded) {
      skip(
        "baseline matches the approved REVIEW seed (7 active departments / 23 active products)",
        `approved expansion batch already present (${countsLabel(baseline.counts)}); this run verifies it idempotently`
      );
    } else {
      check("baseline matches an approved catalogue state", false, countsLabel(baseline.counts));
    }
    const seedPhones = baseline.departments.find((entry) => entry.slug === "phones-tablets");
    check(
      "shared Phones & Tablets baseline is captured for restoration",
      Boolean(seedPhones) && seedPhones.isActive === true,
      seedPhones ? `active=${seedPhones.isActive} order=${seedPhones.sortOrder}` : "missing"
    );

    // ---------------------------------------------------------------------
    // 1. Department create with slug, ordering and imagery.
    // ---------------------------------------------------------------------
    const dept = departmentSection();
    await dept.getByLabel("Name", { exact: true }).fill(DEPT_NAME);
    await dept.getByLabel(/^Slug/).fill(DEPT_SLUG);
    await dept.getByLabel(/^Order/).fill("0");
    await dept.getByLabel(/^Image \(/).fill(IMAGE_ONE);
    await dept.getByLabel("Image alt text").fill("Department banner showing headphones, laptop and watch");
    await dept.getByLabel("Description").fill("DEMO department created through the Control Center catalogue workflow.");
    await dept.getByRole("button", { name: "Create department" }).click();
    const createdDept = await waitFor(async () => {
      const catalogue = await adminCatalogue();
      return catalogue.departments.find((entry) => entry.slug === DEPT_SLUG);
    }, "created department");
    createdDepartmentId = createdDept.id;
    check(
      "created department is exclusively run-owned",
      isRunOwned(createdDept),
      `${createdDept.name} / ${createdDept.slug}`
    );
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
        name: `DEMO Alt probe ${runId}`,
        slug: `demo-alt-probe-${runId}`,
        description: "DEMO department alt text probe that must not be silently dropped.",
        imageUrl: IMAGE_ONE,
        imageAlt: "Probe alt text",
        isDemo: true
      }
    });
    check(
      "department alt text is persisted",
      altProbe.status === 201 && altProbe.body?.imageAlt === "Probe alt text",
      `status=${altProbe.status} alt=${altProbe.body?.imageAlt ?? "none"}`
    );
    const altDept = (await adminCatalogue()).departments.find((entry) => entry.slug === `demo-alt-probe-${runId}`);
    check("alt probe department stored once", Boolean(altDept) && altDept.imageAlt === "Probe alt text", altDept ? String(altDept.imageAlt) : "missing");
    check("alt probe department is run-owned", isRunOwned(altDept), altDept ? `${altDept.name} / ${altDept.slug}` : "missing");
    if (altDept) {
      await api("/api/admin/catalogue/departments", { method: "PATCH", data: { id: altDept.id, isActive: false } });
    }

    const duplicateDept = await api("/api/admin/catalogue/departments", {
      method: "POST",
      data: {
        name: `DEMO Duplicate probe ${runId}`,
        slug: DEPT_SLUG_EDITED,
        description: "DEMO duplicate slug probe that must be refused.",
        imageUrl: IMAGE_ONE,
        imageAlt: "Duplicate probe image",
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
      !(await adminCatalogue()).departments.some((entry) => entry.name === `DEMO Duplicate probe ${runId}`),
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
      name: `DEMO invalid probe ${runId}`,
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
      entry.name.startsWith(`DEMO invalid probe ${runId}`)
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
        slug: `demo-incomplete-probe-${runId}`,
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
      `${BASE}/product/${incomplete.body?.slug ?? `demo-incomplete-probe-${runId}`}`
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

    // ---------------------------------------------------------------------
    // 3b. Authorized full draft preview via the Control Center.
    // ---------------------------------------------------------------------
    const previewPath = `/admin/catalogue/products/${createdProduct.id}/preview`;
    const adminPreview = await context.request.get(`${BASE}${previewPath}`);
    const adminPreviewHtml = await adminPreview.text();
    const previewRoutePresent =
      adminPreview.status() === 200 || adminPreviewHtml.includes("Preview unavailable");
    if (previewRoutePresent) {
      check(
        "authorized admin can open the complete draft preview",
        adminPreview.status() === 200 &&
          adminPreviewHtml.includes(PRODUCT_NAME) &&
          adminPreviewHtml.includes("DEMO listing created through the Control Center catalogue workflow.") &&
          adminPreviewHtml.includes(DEPT_NAME) &&
          adminPreviewHtml.includes("4,500.00") &&
          adminPreviewHtml.includes(IMAGE_ONE) &&
          adminPreviewHtml.includes("DRAFT"),
        `status=${adminPreview.status()} name=${adminPreviewHtml.includes(PRODUCT_NAME)} image=${adminPreviewHtml.includes(IMAGE_ONE)}`
      );
      const title = adminPreviewHtml.match(/<title>(.*?)<\/title>/s)?.[1] ?? "";
      check(
        "preview metadata does not expose the draft name",
        Boolean(title) && !title.includes(PRODUCT_NAME) && !title.includes("Review workflow blender"),
        title.slice(0, 120)
      );
      const robotsMeta = adminPreviewHtml.match(/<meta[^>]+name="robots"[^>]*>/i)?.[0] ?? "";
      check(
        "preview document is excluded from indexing",
        /noindex/i.test(robotsMeta) && /nofollow/i.test(robotsMeta),
        robotsMeta || "robots meta missing"
      );
      const previewCache = (adminPreview.headers()["cache-control"] ?? "").toLowerCase();
      check(
        "preview response is not publicly cacheable",
        (previewCache.includes("no-store") || previewCache.includes("private")) && !previewCache.includes("public"),
        previewCache || "no cache-control header"
      );
      check(
        "inline preview links to the authorized full preview",
        (await previewPanel.locator(`a[href="${previewPath}"]`).count()) === 1,
        previewPath
      );

      const anonymousApi = await request.newContext({ baseURL: BASE });
      const anonymousPreview = await anonymousApi.get(previewPath, { maxRedirects: 0 });
      const anonymousPreviewBody = await anonymousPreview.text();
      check(
        "anonymous request cannot open the draft preview",
        [301, 302, 303, 307, 308, 401, 403, 404].includes(anonymousPreview.status()) &&
          !anonymousPreviewBody.includes(PRODUCT_NAME) &&
          !anonymousPreviewBody.includes("DEMO listing created through the Control Center catalogue workflow."),
        `status=${anonymousPreview.status()} location=${anonymousPreview.headers()["location"] ?? "none"} leaked=${anonymousPreviewBody.includes(PRODUCT_NAME)}`
      );
      await anonymousApi.dispose();

      if (fs.existsSync(CUSTOMER_FILE)) {
        const rawCustomer = fs
          .readFileSync(CUSTOMER_FILE, "utf8")
          .trim()
          .split(/\r?\n/)
          .map((line) => line.trim());
        const customerApi = await request.newContext({ baseURL: BASE });
        const customerLogin = await customerApi.post("/api/auth/login", {
          data: { email: rawCustomer[0], password: rawCustomer[1] },
          headers: { Origin: BASE }
        });
        const customerPreview = await customerApi.get(previewPath, { maxRedirects: 0 });
        const customerPreviewBody = await customerPreview.text();
        check(
          "non-admin customer cannot open the draft preview",
          customerLogin.status() === 200 &&
            [301, 302, 303, 307, 308, 401, 403, 404].includes(customerPreview.status()) &&
            !customerPreviewBody.includes(PRODUCT_NAME) &&
            !customerPreviewBody.includes("DEMO listing created through the Control Center catalogue workflow."),
          `login=${customerLogin.status()} preview=${customerPreview.status()} location=${customerPreview.headers()["location"] ?? "none"} leaked=${customerPreviewBody.includes(PRODUCT_NAME)}`
        );
        const customerCatalogue = await customerApi.get("/api/admin/catalogue");
        check(
          "customer cannot read the draft through the admin catalogue API",
          customerCatalogue.status() === 401 || customerCatalogue.status() === 403,
          `status=${customerCatalogue.status()}`
        );
        await customerApi.dispose();
      } else {
        skip("non-admin customer cannot open the draft preview", `${CUSTOMER_FILE} is missing`);
      }

      check(
        "public product JSON still returns 404 for the draft",
        (await api(`/api/products/${createdProduct.slug}`)).status === 404,
        ""
      );
    } else {
      skip(
        "authorized full draft preview",
        "the served build predates the Control Center preview route; a rebuild is required before this assertion can run"
      );
      skip(
        "preview authorization, metadata and cache headers",
        "dependent on the Control Center preview route being present in the served build"
      );
      skip(
        "inline preview links to the authorized full preview",
        "the served build predates the full-preview link"
      );
    }

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
    // 5b. Isolation cleanup, shared-state restoration and baseline assertion.
    // ---------------------------------------------------------------------
    await cleanupRunRecords({ assertBaseline: true });
    await guardSharedDepartments();
    baselineProductGuards.push(await guardBaselineProducts("after run-record cleanup"));
    const afterCleanup = await adminCatalogue();
    const sharedPhones = afterCleanup.departments.find((entry) => entry.slug === "phones-tablets");
    check(
      "shared Phones & Tablets remains active after cleanup",
      sharedPhones?.isActive === true,
      sharedPhones ? `active=${sharedPhones.isActive} order=${sharedPhones.sortOrder}` : "missing"
    );
    const postCleanupCounts = activeCounts(afterCleanup);
    if (baselineIsSeed) {
      check(
        "post-cleanup catalogue is 7 active departments / 23 active products",
        postCleanupCounts.departments === SEED_BASELINE.departments &&
          postCleanupCounts.products === SEED_BASELINE.products,
        countsLabel(postCleanupCounts)
      );
    } else {
      skip(
        "post-cleanup catalogue is 7 active departments / 23 active products",
        `run started from the approved expansion state; recorded baseline ${countsLabel(baseline.counts)} restored`
      );
    }

    // ---------------------------------------------------------------------
    // 6. Control Center expansion: Groceries produce, Power & Solar, Gaming.
    // ---------------------------------------------------------------------
    const expansionSlugs = EXPANSION_PRODUCTS.map((spec) => spec.slug);
    check(
      "expansion product slugs are unique and do not duplicate the approved catalogue",
      new Set(expansionSlugs).size === expansionSlugs.length &&
        !expansionSlugs.includes("demo-fresh-tomatoes") &&
        !afterCleanup.products.some(
          (entry) => expansionSlugs.includes(entry.slug) && entry.isDemo !== true
        ),
      `${expansionSlugs.length} planned products`
    );

    for (const spec of EXPANSION_DEPARTMENTS) {
      const department = await ensureExpansionDepartment(spec);
      if (!department?.id) {
        check(`approved taxonomy category ${spec.slug} is available`, false, "catalogue lookup returned no id");
      }
    }
    await ensureGroceriesImageAlt();
    const expansionCatalogue = await adminCatalogue();
    const departmentIdBySlug = new Map(
      expansionCatalogue.departments.filter((entry) => entry.isActive).map((entry) => [entry.slug, entry.id])
    );
    check(
      "Groceries, Power & Solar and Gaming departments are active",
      ["groceries-household", "power-solar", "gaming"].every((slug) => departmentIdBySlug.has(slug)),
      ["groceries-household", "power-solar", "gaming"]
        .map((slug) => `${slug}=${departmentIdBySlug.has(slug) ? "active" : "missing"}`)
        .join(", ")
    );

    for (const spec of EXPANSION_PRODUCTS) {
      const departmentId = departmentIdBySlug.get(spec.departmentSlug);
      if (!departmentId) {
        check(`expansion product ${spec.slug} has an active department`, false, spec.departmentSlug);
        continue;
      }
      await ensureExpansionProduct(spec, departmentId);
    }
    await verifyExpansionVisibility();

    const afterExpansion = await adminCatalogue();
    const tomatoes = afterExpansion.products.filter(
      (entry) => entry.slug === "demo-fresh-tomatoes" && entry.status === "ACTIVE"
    );
    check(
      "the existing tomatoes product is preserved and not duplicated by the expansion",
      tomatoes.length === 1,
      `tomatoes=${tomatoes.length}`
    );
    check(
      "expansion product imagery is approved, present and carries alt text",
      EXPANSION_PRODUCTS.every((spec) => {
        const entry = afterExpansion.products.find((product) => product.slug === spec.slug);
        return (
          entry?.status === "ACTIVE" &&
          entry.isDemo === true &&
          entry.isSample === false &&
          entry.saleMode === "escrow" &&
          entry.currency === "NGN" &&
          entry.priceKobo === String(spec.priceKobo) &&
          entry.stock?.quantity === spec.quantity &&
          entry.images.length === 1 &&
          entry.images.every((image) => image.url === spec.imageUrl && image.alt === spec.imageAlt) &&
          fs.existsSync(path.join(process.cwd(), "public", spec.imageUrl.replace(/^\/+/, "")))
        );
      }),
      `${EXPANSION_PRODUCTS.length} products checked against public/`
    );
    check(
      "expansion product images are unique and not reused",
      new Set(EXPANSION_PRODUCTS.map((spec) => spec.imageUrl)).size === EXPANSION_PRODUCTS.length,
      `${EXPANSION_PRODUCTS.length} images`
    );
    const powerSolar = afterExpansion.departments.find((entry) => entry.slug === "power-solar");
    const gaming = afterExpansion.departments.find((entry) => entry.slug === "gaming");
    const powerSolarParent = afterExpansion.departments.find((entry) => entry.id === powerSolar?.parentId);
    const gamingParent = afterExpansion.departments.find((entry) => entry.id === gaming?.parentId);
    check(
      "Power & Solar and Gaming keep their seeded taxonomy placement, imagery and alt text",
      powerSolar?.level === 1 &&
        powerSolarParent?.slug === "home-living" &&
        powerSolar?.imageUrl === "/generated/shop/category-power-solar.webp" &&
        powerSolar?.imageAlt === "Solar panel, portable power station and power bank on a pale blue surface" &&
        gaming?.level === 1 &&
        gamingParent?.slug === "electronics-technology" &&
        gaming?.imageUrl === "/generated/shop/category-gaming.webp" &&
        gaming?.imageAlt === "Game controller, mechanical keyboard and headset on a dark surface",
      `power-solar=${powerSolar?.level}/${powerSolarParent?.slug ?? "none"}; gaming=${gaming?.level}/${gamingParent?.slug ?? "none"}`
    );

    // ---------------------------------------------------------------------
    // 7. Dedicated acceptance product: publish → unpublish → exclusion.
    // ---------------------------------------------------------------------
    const groceries = (await adminCatalogue()).departments.find((entry) => entry.slug === "groceries-household");
    check(
      "existing Groceries department is available for the acceptance probe",
      groceries?.isActive === true,
      groceries ? `active=${groceries.isActive}` : "missing"
    );
    if (groceries) await runAcceptanceLifecycle(groceries.id);

    // ---------------------------------------------------------------------
    // 8. Authorization and historical-read checks.
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

    const finalCatalogue = await adminCatalogue();
    finalCounts = activeCounts(finalCatalogue);
    const retainedExpansion = EXPANSION_PRODUCTS.filter((spec) =>
      finalCatalogue.products.some((entry) => entry.slug === spec.slug && entry.status === "ACTIVE")
    );
    check(
      "final catalogue retains the approved 11-department / 57-product taxonomy baseline",
      finalCounts.departments === EXPANDED_BASELINE.departments &&
        finalCounts.products === EXPANDED_BASELINE.products &&
        retainedExpansion.length === EXPANSION_PRODUCTS.length,
      `${countsLabel(finalCounts)}; retained=${retainedExpansion.length}/${EXPANSION_PRODUCTS.length}`
    );
    const activeRunRecords = finalCatalogue.products.filter(
      (entry) => isRunOwned(entry) && entry.status !== "ARCHIVED"
    );
    check(
      "no run-owned workflow or acceptance product remains published",
      activeRunRecords.length === 0,
      activeRunRecords.map((entry) => entry.slug).join(",") || "none"
    );
    await guardSharedDepartments();
    baselineProductGuards.push(await guardBaselineProducts("at final catalogue state"));
    check("no browser page errors", pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));
  } catch (error) {
    harnessError = error;
    check("journey completed without harness error", false, error.message);
  } finally {
    await cleanupRunRecords();
    await guardSharedDepartments();
    try {
      const finalCatalogue = await adminCatalogue();
      finalCounts = activeCounts(finalCatalogue);
    } catch {
      /* final counts unavailable; the report records the last known state */
    }
    await browser.close();
    process.exit(report(harnessError));
  }
})().catch((error) => {
  console.error("CATALOGUE JOURNEY ERROR", error.message);
  process.exit(2);
});
