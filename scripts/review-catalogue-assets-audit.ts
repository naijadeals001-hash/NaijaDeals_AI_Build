/**
 * REVIEW-only catalogue taxonomy and imagery audit.
 *
 * Read-only. Audits the active NaijaShop departments and products for:
 *   - placement in the approved department;
 *   - a unique product per department (no duplicated product/image);
 *   - an existing, decodable image with a browser naturalWidth greater than 0;
 *   - product-image alt text and an alt matching the depicted subject;
 *   - department images and their alt metadata.
 *
 * Usage:
 *   DATABASE_URL=<review url> npx tsx scripts/review-catalogue-assets-audit.ts \
 *     --expect-db=naijadeals_review
 *   DATABASE_URL=<review url> npx tsx scripts/review-catalogue-assets-audit.ts \
 *     --expect-db=naijadeals_review --base-url=http://localhost:3047
 *
 * `--base-url` additionally verifies the rendered product page and department
 * imagery in a real Chromium browser. Without it, only filesystem/DB checks run.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";
import { prisma } from "../lib/prisma";

const PUBLIC_ROOT = path.resolve(process.cwd(), "public");

type Expectation = {
  department: string;
  image: string;
  altTokens: string[];
  subject: string;
};

/**
 * Approved active catalogue placement. The department is the editorial home
 * approved in the REVIEW seed; plausible alternatives are reported separately
 * as advisories rather than silently changing taxonomy.
 */
const EXPECTATIONS: Record<string, Expectation> = {
  "demo-10-inch-android-tablet": {
    department: "phones-tablets",
    image: "/generated/shop/product-tablet-10-inch.webp",
    altTokens: ["tablet"],
    subject: "10-inch Android tablet"
  },
  "demo-android-smartphone-6-inch": {
    department: "phones-tablets",
    image: "/generated/shop/product-blackview-a60-android-smartphone.webp",
    altTokens: ["smartphone"],
    subject: "black Android smartphone"
  },
  "demo-portable-power-bank": {
    department: "phones-tablets",
    image: "/generated/shop/product-portable-power-bank.webp",
    altTokens: ["power bank"],
    subject: "portable power bank"
  },
  "demo-smartphone-on-desk": {
    department: "phones-tablets",
    image: "/generated/shop/product-smartphone-on-desk.webp",
    altTokens: ["smartphone"],
    subject: "smartphone on a desk"
  },
  "demo-14-inch-business-laptop": {
    department: "computers",
    image: "/generated/shop/product-14-inch-business-laptop.webp",
    altTokens: ["laptop"],
    subject: "14-inch business laptop"
  },
  "demo-15-6-inch-laptop": {
    department: "computers",
    image: "/generated/shop/product-15-6-inch-laptop.webp",
    altTokens: ["laptop"],
    subject: "15.6-inch laptop"
  },
  "demo-mechanical-keyboard": {
    department: "computers",
    image: "/generated/shop/product-mechanical-keyboard.webp",
    altTokens: ["keyboard"],
    subject: "mechanical keyboard"
  },
  "demo-wired-gaming-mouse": {
    department: "computers",
    image: "/generated/shop/product-wired-gaming-mouse.webp",
    altTokens: ["mouse"],
    subject: "wired gaming mouse"
  },
  "demo-5-5l-air-fryer": {
    department: "home-kitchen",
    image: "/generated/shop/product-air-fryer-5-5l.webp",
    altTokens: ["air fryer"],
    subject: "5.5 litre air fryer"
  },
  "demo-coffee-maker": {
    department: "home-kitchen",
    image: "/generated/shop/product-coffee-maker.webp",
    altTokens: ["coffee maker"],
    subject: "coffee maker"
  },
  "demo-stainless-steel-cookware-set": {
    department: "home-kitchen",
    image: "/generated/shop/product-stainless-steel-cookware-set.webp",
    altTokens: ["cookware"],
    subject: "stainless steel cookware set"
  },
  "demo-2-slice-toaster": {
    department: "electronics-appliances",
    image: "/generated/shop/product-2-slice-toaster.webp",
    altTokens: ["toaster"],
    subject: "two-slice toaster"
  },
  "demo-led-monitor": {
    department: "electronics-appliances",
    image: "/generated/shop/product-led-monitor.webp",
    altTokens: ["monitor"],
    subject: "LED monitor"
  },
  "demo-over-ear-headphones": {
    department: "electronics-appliances",
    image: "/generated/shop/product-over-ear-headphones.webp",
    altTokens: ["headphones"],
    subject: "over-ear headphones"
  },
  "demo-retro-kitchen-blender": {
    department: "electronics-appliances",
    image: "/generated/shop/product-retro-kitchen-blender.webp",
    altTokens: ["blender"],
    subject: "retro kitchen blender"
  },
  "demo-automatic-wristwatch": {
    department: "fashion-accessories",
    image: "/generated/shop/product-automatic-wristwatch.webp",
    altTokens: ["watch"],
    subject: "automatic wristwatch"
  },
  "demo-leather-handbag": {
    department: "fashion-accessories",
    image: "/generated/shop/product-prada-tooled-leather-handbag.webp",
    altTokens: ["handbag"],
    subject: "tooled leather handbag"
  },
  "demo-running-shoes": {
    department: "fashion-accessories",
    image: "/generated/shop/product-asics-gel-cumulus-22-running-shoes.webp",
    altTokens: ["shoes"],
    subject: "running shoes"
  },
  "demo-eau-de-parfum-50ml": {
    department: "beauty-personal-care",
    image: "/generated/shop/product-eau-de-parfum-50ml.webp",
    altTokens: ["parfum", "perfume"],
    subject: "perfume bottle"
  },
  "demo-moisturiser-100ml": {
    department: "beauty-personal-care",
    image: "/generated/shop/product-moisturiser-jar-100ml.webp",
    altTokens: ["moisturiser", "moisturizer"],
    subject: "moisturiser jar"
  },
  "demo-perfume-gift-set": {
    department: "beauty-personal-care",
    image: "/generated/shop/product-perfume-gift-set.webp",
    altTokens: ["perfume", "gift set"],
    subject: "perfume gift set"
  },
  "demo-shampoo-bars": {
    department: "beauty-personal-care",
    image: "/generated/shop/product-handmade-shampoo-bars.webp",
    altTokens: ["shampoo"],
    subject: "shampoo bars"
  },
  "demo-fresh-tomatoes": {
    department: "groceries-household",
    image: "/generated/shop/product-fresh-tomatoes-1kg.webp",
    altTokens: ["tomato"],
    subject: "fresh tomatoes"
  }
};

const EXPECTED_DEPARTMENTS: Record<string, { image: string; name: string }> = {
  "phones-tablets": {
    name: "Phones & Tablets",
    image: "/generated/shop/category-phones-tablets.webp"
  },
  computers: { name: "Computers", image: "/generated/shop/category-computers.webp" },
  "home-kitchen": { name: "Home & Kitchen", image: "/generated/shop/category-home-kitchen.webp" },
  "electronics-appliances": {
    name: "Electronics & Appliances",
    image: "/generated/shop/banner-electronics.webp"
  },
  "fashion-accessories": {
    name: "Fashion & Accessories",
    image: "/generated/shop/category-fashion.webp"
  },
  "beauty-personal-care": {
    name: "Beauty & Personal Care",
    image: "/generated/shop/category-beauty.webp"
  },
  "groceries-household": {
    name: "Groceries & Household Essentials",
    image: "/generated/shop/category-groceries.webp"
  }
};

/**
 * Products that defensibly fit an additional active or proposed department.
 * These are advising the owner, not failing the audit.
 */
const PLAUSIBLE_ALTERNATIVES: Record<string, string[]> = {
  "demo-led-monitor": ["computers"],
  "demo-mechanical-keyboard": ["gaming (proposed)"],
  "demo-wired-gaming-mouse": ["gaming (proposed)"],
  "demo-portable-power-bank": ["power-solar (proposed)"],
  "demo-2-slice-toaster": ["home-kitchen"],
  "demo-retro-kitchen-blender": ["home-kitchen"],
  "demo-over-ear-headphones": ["gaming (proposed)"]
};

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  priceKobo: bigint;
  status: string;
  isDemo: boolean;
  isSample: boolean;
  vendor: { slug: string; name: string; status: string };
  category: { id: string; name: string; slug: string };
  images: Array<{ id: string; url: string; alt: string | null; sortOrder: number }>;
  stock: { quantity: number; reserved: number } | null;
};

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  imageAlt: string | null;
  sortOrder: number;
};

type ImageFileInspection = {
  url: string;
  resolvedPath: string | null;
  exists: boolean;
  decodable: boolean;
  width: number;
  height: number;
  format: string | null;
  error: string | null;
};

async function assertReviewDatabase(expectedDatabase: string | null): Promise<{
  name: string;
  classifications: string[];
}> {
  const rows = await prisma.$queryRaw<Array<{ current_database: string }>>`select current_database()`;
  const name = rows[0]?.current_database ?? "unknown";
  const classifications = (
    await prisma.databaseClassification.findMany({ select: { classification: true } })
  ).map((row) => row.classification);

  if (expectedDatabase && name !== expectedDatabase) {
    throw new Error(
      `refusing: connected database is ${name}, expected ${expectedDatabase}; DATABASE_URL was not switched`
    );
  }
  if (!classifications.includes("REVIEW")) {
    throw new Error(`refusing: ${name} is not classified REVIEW`);
  }
  return { name, classifications };
}

async function inspectLocalImage(url: string): Promise<ImageFileInspection> {
  if (!url.startsWith("/")) {
    return {
      url,
      resolvedPath: null,
      exists: false,
      decodable: false,
      width: 0,
      height: 0,
      format: null,
      error: "not a local public path"
    };
  }

  const withoutQuery = url.split("?")[0];
  const resolvedPath = path.resolve(PUBLIC_ROOT, `.${withoutQuery}`);
  if (!resolvedPath.startsWith(PUBLIC_ROOT + path.sep)) {
    return {
      url,
      resolvedPath,
      exists: false,
      decodable: false,
      width: 0,
      height: 0,
      format: null,
      error: "path escapes public/"
    };
  }

  try {
    const stat = await fs.stat(resolvedPath);
    if (!stat.isFile()) throw new Error("not a file");
    const metadata = await sharp(resolvedPath).metadata();
    return {
      url,
      resolvedPath,
      exists: true,
      decodable: true,
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
      format: metadata.format ?? null,
      error: metadata.width && metadata.width > 0 ? null : "zero width"
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      url,
      resolvedPath,
      exists: await fs
        .stat(resolvedPath)
        .then((stat) => stat.isFile())
        .catch(() => false),
      decodable: false,
      width: 0,
      height: 0,
      format: null,
      error: message
    };
  }
}

function normalizedName(name: string): string {
  return name
    .replace(/^DEMO\s*[—–-]\s*/i, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function duplicateGroups<T>(items: T[], key: (item: T) => string): T[][] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const value = key(item);
    const group = map.get(value) ?? [];
    group.push(item);
    map.set(value, group);
  }
  return [...map.values()].filter((group) => group.length > 1);
}

async function decodeInBrowser(
  page: import("playwright").Page,
  baseUrl: string,
  url: string
): Promise<{ url: string; naturalWidth: number; naturalHeight: number; error: string | null }> {
  return page.evaluate(
    ([absoluteUrl]) =>
      new Promise<{ url: string; naturalWidth: number; naturalHeight: number; error: string | null }>(
        (resolve) => {
          const image = new Image();
          const timer = window.setTimeout(() => {
            resolve({ url: absoluteUrl, naturalWidth: 0, naturalHeight: 0, error: "timeout" });
          }, 10000);
          image.onload = () => {
            window.clearTimeout(timer);
            resolve({
              url: absoluteUrl,
              naturalWidth: image.naturalWidth,
              naturalHeight: image.naturalHeight,
              error: image.naturalWidth > 0 ? null : "zero naturalWidth"
            });
          };
          image.onerror = () => {
            window.clearTimeout(timer);
            resolve({ url: absoluteUrl, naturalWidth: 0, naturalHeight: 0, error: "load error" });
          };
          image.src = absoluteUrl;
        }
      ),
    [`${baseUrl}${url}`]
  );
}

type BrowserAudit = {
  executed: boolean;
  baseUrl: string | null;
  shopStatus: number | null;
  reviewIndicator: boolean;
  context: {
    serviceWorkers: "blocked";
    note: string;
  };
  directImageDecode: {
    checked: number;
    failures: Array<{ url: string; naturalWidth: number; error: string | null }>;
  };
  departmentImages: {
    expected: number;
    rendered: number;
    naturalWidthFailures: Array<{ url: string; naturalWidth: number }>;
    missingFromPage: string[];
    emptyAltCount: number;
    note: string;
  };
  productPages: {
    checked: number;
    httpFailures: Array<{ slug: string; status: number | null; error: string | null }>;
    attachFailures: Array<{ slug: string; image: string; error: string }>;
    naturalWidthFailures: Array<{ slug: string; image: string; naturalWidth: number }>;
    emptyAltFailures: Array<{ slug: string; image: string }>;
    altMismatches: Array<{ slug: string; alt: string; expectedTokens: string[] }>;
  };
  error: string | null;
};

async function runBrowserAudit(
  baseUrl: string,
  products: ProductRow[],
  categories: CategoryRow[]
): Promise<BrowserAudit> {
  const audit: BrowserAudit = {
    executed: false,
    baseUrl,
    shopStatus: null,
    reviewIndicator: false,
    context: {
      serviceWorkers: "blocked",
      note:
        "The production PWA service worker can trigger a controllerchange reload; blocking it keeps the read-only audit execution context stable."
    },
    directImageDecode: { checked: 0, failures: [] },
    departmentImages: {
      expected: categories.length,
      rendered: 0,
      naturalWidthFailures: [],
      missingFromPage: [],
      emptyAltCount: 0,
      note: "Department images are decorative inside links whose text names the department."
    },
    productPages: {
      checked: 0,
      httpFailures: [],
      attachFailures: [],
      naturalWidthFailures: [],
      emptyAltFailures: [],
      altMismatches: []
    },
    error: null
  };

  let browser: import("playwright").Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      serviceWorkers: "block"
    });
    const page = await context.newPage();

    const shopResponse = await page.goto(`${baseUrl}/naijashop`, {
      waitUntil: "load",
      timeout: 30000
    });
    audit.executed = true;
    audit.shopStatus = shopResponse?.status() ?? null;
    audit.reviewIndicator = /REVIEW CATALOGUE/i.test(await page.content());

    await page
      .evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) {
          window.scrollTo(0, y);
          await new Promise((resolve) => window.setTimeout(resolve, 60));
        }
        window.scrollTo(0, 0);
      })
      .catch(() => undefined);

    const expectedCategoryUrls = categories
      .map((category) => category.imageUrl)
      .filter((url): url is string => Boolean(url));
    await page
      .waitForFunction(
        (urls) =>
          urls.every((url) =>
            Array.from(document.images).some(
              (image) => new URL(image.src).pathname === url && image.naturalWidth > 0
            )
          ),
        expectedCategoryUrls,
        { timeout: 15000 }
      )
      .catch(() => undefined);
    await page.waitForTimeout(250);

    const renderedCategories = await page.evaluate((urls) => {
      const expected = new Set(urls);
      return Array.from(document.images)
        .filter((image) => expected.has(new URL(image.src).pathname))
        .map((image) => ({
          url: new URL(image.src).pathname,
          naturalWidth: image.naturalWidth,
          alt: image.getAttribute("alt") ?? ""
        }));
    }, expectedCategoryUrls);

    audit.departmentImages.rendered = new Set(renderedCategories.map((entry) => entry.url)).size;
    audit.departmentImages.emptyAltCount = renderedCategories.filter(
      (entry) => entry.alt.trim() === ""
    ).length;
    for (const url of expectedCategoryUrls) {
      const matches = renderedCategories.filter((entry) => entry.url === url);
      if (matches.length === 0) {
        audit.departmentImages.missingFromPage.push(url);
      } else if (matches.every((entry) => entry.naturalWidth === 0)) {
        audit.departmentImages.naturalWidthFailures.push({ url, naturalWidth: 0 });
      }
    }

    const imageUrls = [
      ...new Set([
        ...categories.map((category) => category.imageUrl).filter((url): url is string => Boolean(url)),
        ...products.flatMap((product) => product.images.map((image) => image.url))
      ])
    ];
    for (const url of imageUrls) {
      audit.directImageDecode.checked += 1;
      try {
        const decoded = await decodeInBrowser(page, baseUrl, url);
        if (decoded.error || decoded.naturalWidth === 0) {
          audit.directImageDecode.failures.push({
            url,
            naturalWidth: decoded.naturalWidth,
            error: decoded.error
          });
        }
      } catch (error) {
        audit.directImageDecode.failures.push({
          url,
          naturalWidth: 0,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    for (const product of products) {
      audit.productPages.checked += 1;
      const expectation = EXPECTATIONS[product.slug];
      const primary = product.images[0];
      if (!primary) continue;

      const response = await page
        .goto(`${baseUrl}/product/${encodeURIComponent(product.slug)}`, {
          waitUntil: "load",
          timeout: 30000
        })
        .catch((error: unknown) => {
          audit.productPages.httpFailures.push({
            slug: product.slug,
            status: null,
            error: error instanceof Error ? error.message : String(error)
          });
          return null;
        });
      if (!response) continue;
      if (!response.ok()) {
        audit.productPages.httpFailures.push({
          slug: product.slug,
          status: response.status(),
          error: null
        });
        continue;
      }

      const basename = primary.url.split("/").pop() ?? primary.url;
      const selector = `img[src$="${basename}"]`;
      const locator = page.locator(selector).first();
      try {
        await locator.waitFor({ state: "attached", timeout: 10000 });
        const rendered = await locator.evaluate((element) => {
          const image = element as HTMLImageElement;
          return { naturalWidth: image.naturalWidth, alt: image.getAttribute("alt") ?? "" };
        });
        if (rendered.naturalWidth === 0) {
          audit.productPages.naturalWidthFailures.push({
            slug: product.slug,
            image: primary.url,
            naturalWidth: rendered.naturalWidth
          });
        }
        if (rendered.alt.trim() === "") {
          audit.productPages.emptyAltFailures.push({ slug: product.slug, image: primary.url });
        }
        if (expectation) {
          const alt = rendered.alt.toLowerCase();
          if (!expectation.altTokens.some((token) => alt.includes(token))) {
            audit.productPages.altMismatches.push({
              slug: product.slug,
              alt: rendered.alt,
              expectedTokens: expectation.altTokens
            });
          }
        }
      } catch (error) {
        audit.productPages.attachFailures.push({
          slug: product.slug,
          image: primary.url,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  } catch (error) {
    audit.error = error instanceof Error ? error.message : String(error);
  } finally {
    await browser?.close().catch(() => undefined);
  }

  return audit;
}

async function main(): Promise<void> {
  const expectedArg = process.argv.find((arg) => arg.startsWith("--expect-db="));
  const expectedDatabase = expectedArg ? expectedArg.slice("--expect-db=".length).trim() : null;
  const baseUrlArg = process.argv.find((arg) => arg.startsWith("--base-url="));
  const baseUrl = baseUrlArg
    ? baseUrlArg.slice("--base-url=".length).replace(/\/+$/, "")
    : null;

  const identity = await assertReviewDatabase(expectedDatabase);

  const categories = (await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, slug: true, imageUrl: true, imageAlt: true, sortOrder: true }
  })) as CategoryRow[];

  const products = (await prisma.product.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      priceKobo: true,
      status: true,
      isDemo: true,
      isSample: true,
      vendor: { select: { slug: true, name: true, status: true } },
      category: { select: { id: true, name: true, slug: true } },
      images: {
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: { id: true, url: true, alt: true, sortOrder: true }
      },
      stock: { select: { quantity: true, reserved: true } }
    }
  })) as ProductRow[];

  const activeBySlug = new Map(products.map((product) => [product.slug, product]));

  const taxonomyMismatches: Array<{
    slug: string;
    name: string;
    currentDepartment: string;
    expectedDepartment: string;
  }> = [];
  const unknownActiveProducts: Array<{ slug: string; name: string; department: string }> = [];
  const missingExpectedProducts: string[] = [];
  const imagePathMismatches: Array<{
    slug: string;
    actual: string | null;
    expected: string;
  }> = [];
  const altMissing: Array<{ slug: string; image: string }> = [];
  const altSubjectMismatches: Array<{
    slug: string;
    alt: string;
    expectedTokens: string[];
  }> = [];
  const missingImages: Array<{ slug: string; image: string }> = [];

  for (const slug of Object.keys(EXPECTATIONS)) {
    if (!activeBySlug.has(slug)) missingExpectedProducts.push(slug);
  }

  for (const product of products) {
    const expectation = EXPECTATIONS[product.slug];
    if (!expectation) {
      unknownActiveProducts.push({
        slug: product.slug,
        name: product.name,
        department: product.category.slug
      });
      continue;
    }

    if (product.category.slug !== expectation.department) {
      taxonomyMismatches.push({
        slug: product.slug,
        name: product.name,
        currentDepartment: product.category.slug,
        expectedDepartment: expectation.department
      });
    }

    if (product.images.length === 0) {
      missingImages.push({ slug: product.slug, image: "(none)" });
      continue;
    }

    const primary = product.images[0];
    if (primary.url !== expectation.image) {
      imagePathMismatches.push({
        slug: product.slug,
        actual: primary.url,
        expected: expectation.image
      });
    }
    for (const image of product.images) {
      if (!image.alt || image.alt.trim() === "") {
        altMissing.push({ slug: product.slug, image: image.url });
      }
    }
    if (primary.alt && primary.alt.trim() !== "") {
      const alt = primary.alt.toLowerCase();
      if (!expectation.altTokens.some((token) => alt.includes(token))) {
        altSubjectMismatches.push({
          slug: product.slug,
          alt: primary.alt,
          expectedTokens: expectation.altTokens
        });
      }
    }
  }

  const duplicateProducts = duplicateGroups(products, (product) =>
    normalizedName(product.name)
  ).map((group) => group.map((product) => ({ slug: product.slug, department: product.category.slug })));

  const duplicateImages = duplicateGroups(
    products.flatMap((product) =>
      product.images.map((image) => ({
        url: image.url,
        slug: product.slug,
        department: product.category.slug
      }))
    ),
    (entry) => entry.url
  )
    .filter((group) => new Set(group.map((entry) => entry.department)).size > 1)
    .map((group) => ({
      url: group[0].url,
      products: group.map((entry) => ({ slug: entry.slug, department: entry.department }))
    }));

  const departmentMismatches: Array<{
    slug: string;
    name: string;
    issue: string;
    actual: string | null;
    expected: string;
  }> = [];
  for (const category of categories) {
    const expected = EXPECTED_DEPARTMENTS[category.slug];
    if (!expected) {
      departmentMismatches.push({
        slug: category.slug,
        name: category.name,
        issue: "unexpected active department",
        actual: category.slug,
        expected: Object.keys(EXPECTED_DEPARTMENTS).join(", ")
      });
      continue;
    }
    if (category.name !== expected.name) {
      departmentMismatches.push({
        slug: category.slug,
        name: category.name,
        issue: "department name differs from approved label",
        actual: category.name,
        expected: expected.name
      });
    }
    if (category.imageUrl !== expected.image) {
      departmentMismatches.push({
        slug: category.slug,
        name: category.name,
        issue: "department image differs from approved catalogue image",
        actual: category.imageUrl,
        expected: expected.image
      });
    }
  }
  const missingExpectedDepartments = Object.keys(EXPECTED_DEPARTMENTS).filter(
    (slug) => !categories.some((category) => category.slug === slug)
  );

  const imageUrls = [
    ...new Set([
      ...categories.map((category) => category.imageUrl).filter((url): url is string => Boolean(url)),
      ...products.flatMap((product) => product.images.map((image) => image.url))
    ])
  ];
  const imageInspections: ImageFileInspection[] = [];
  for (const url of imageUrls) {
    imageInspections.push(await inspectLocalImage(url));
  }

  const fileFailures = imageInspections.filter(
    (inspection) => !inspection.exists || !inspection.decodable || inspection.width === 0
  );

  const browserAudit: BrowserAudit | null = baseUrl
    ? await runBrowserAudit(baseUrl, products, categories)
    : null;

  const browserMismatchCount = browserAudit
    ? (browserAudit.error ? 1 : 0) +
      browserAudit.directImageDecode.failures.length +
      browserAudit.departmentImages.missingFromPage.length +
      browserAudit.departmentImages.naturalWidthFailures.length +
      browserAudit.productPages.httpFailures.length +
      browserAudit.productPages.attachFailures.length +
      browserAudit.productPages.naturalWidthFailures.length +
      browserAudit.productPages.emptyAltFailures.length +
      browserAudit.productPages.altMismatches.length
    : 0;

  const metadataMismatchCount =
    taxonomyMismatches.length +
    unknownActiveProducts.length +
    missingExpectedProducts.length +
    imagePathMismatches.length +
    altMissing.length +
    altSubjectMismatches.length +
    missingImages.length +
    duplicateProducts.length +
    duplicateImages.length +
    departmentMismatches.length +
    missingExpectedDepartments.length +
    fileFailures.length;

  const advisories = products
    .filter((product) => PLAUSIBLE_ALTERNATIVES[product.slug])
    .map((product) => ({
      slug: product.slug,
      currentDepartment: product.category.slug,
      plausibleDepartments: PLAUSIBLE_ALTERNATIVES[product.slug]
    }));

  const report = {
    audit: "review-catalogue-taxonomy-and-imagery",
    database: {
      name: identity.name,
      classifications: identity.classifications,
      expectedDatabase,
      expectedDatabaseMatched: expectedDatabase ? identity.name === expectedDatabase : null
    },
    counts: {
      activeDepartments: categories.length,
      activeProducts: products.length,
      productImages: products.reduce((total, product) => total + product.images.length, 0),
      expectedProducts: Object.keys(EXPECTATIONS).length,
      localImageFilesChecked: imageInspections.length
    },
    activeMetadata: {
      isDemoTrue: products.filter((product) => product.isDemo).length,
      isSampleTrue: products.filter((product) => product.isSample).length,
      verifiedVendors: products.filter((product) => product.vendor.status === "VERIFIED").length
    },
    taxonomy: {
      mismatches: taxonomyMismatches,
      unknownActiveProducts,
      missingExpectedProducts,
      missingExpectedDepartments,
      departmentMismatches,
      advisories,
      duplicateProducts,
      sharedImagesAcrossDepartments: duplicateImages
    },
    imagery: {
      missingImages,
      fileFailures,
      imagePathMismatches,
      altMissing,
      altSubjectMismatches,
      departmentImageAltNull: categories
        .filter((category) => !category.imageAlt || category.imageAlt.trim() === "")
        .map((category) => ({ slug: category.slug, name: category.name })),
      note:
        "Department images render with alt=\"\" inside links whose visible text names the department, so a null imageAlt is an advisory."
    },
    browser: browserAudit,
    verdict: {
      metadataMismatchCount,
      browserMismatchCount,
      mismatchCount: metadataMismatchCount + browserMismatchCount,
      status:
        metadataMismatchCount + browserMismatchCount === 0
          ? "PASS"
          : "REVIEW REQUIRED",
      browserExecuted: Boolean(baseUrl)
    }
  };

  console.log(JSON.stringify(report, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
