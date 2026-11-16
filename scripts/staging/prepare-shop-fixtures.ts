/**
 * Staging Shop catalogue fixtures (idempotent).
 *
 * Prepares the minimum demonstration catalogue the staging acceptance journey
 * needs, using the existing Control Center catalogue services rather than
 * direct table writes:
 *
 *   - a passwordless staging fixture actor holding only the dedicated,
 *     non-staff `staging_catalogue_fixture` role (service-layer audit identity;
 *     cannot sign in and has no Control Center access);
 *   - the demonstration seller required by catalogue-admin.service.ts
 *     (`demo-catalogue-review`), clearly labelled, VERIFIED, NG, Wuse/Abuja;
 *   - three labelled STAGING DEMO departments;
 *   - three labelled STAGING DEMO products created through
 *     createDepartment -> createProduct -> publishProduct:
 *       1. a simple in-stock product,
 *       2. a variant product with one in-stock and one out-of-stock option,
 *       3. a simple out-of-stock product (published, then inventory set to 0).
 *
 * Every write is demo-classified (`isDemo: true`), every name/description says
 * STAGING DEMO, and only already-approved project images are referenced. No
 * image generation, provider call, order, wallet, ledger entry or payment is
 * created by this script.
 *
 * Safety:
 *   - loads C:/NaijaDeals-Staging/env/staging.env before importing Prisma;
 *   - requires current_database() === naijadeals_staging and the canonical
 *     DatabaseClassification row to be TEST (via the shared test-db guard);
 *   - never prints the connection string, credentials or env values;
 *   - idempotent by deterministic email/slug; re-running converges labels,
 *     publication state and (with --restock) inventory, without duplicating.
 *
 * Usage (from the repository root):
 *   npx tsx scripts/staging/prepare-shop-fixtures.ts
 *   npx tsx scripts/staging/prepare-shop-fixtures.ts --restock
 *   npx tsx scripts/staging/prepare-shop-fixtures.ts --cleanup
 *
 * The coordinator owns execution. Do not run this against a database that is
 * not the verified staging TEST database.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@prisma/client";
import type { SessionUser } from "../../lib/auth/session";
import { sanitizeDatabaseError, verifyTestDatabase } from "../lib/test-db-guard";

const ENV_FILE = "C:/NaijaDeals-Staging/env/staging.env";
const EXPECTED_DATABASE = "naijadeals_staging";
const DEMO_VENDOR_SLUG = "demo-catalogue-review";
const FIXTURE_EMAIL = "staging.shop.fixture@staging.invalid";
const FIXTURE_NAME = "STAGING FIXTURE — Shop catalogue operator (non-login)";
const FIXTURE_ROLE = "staging_catalogue_fixture";
const PRODUCT_NAME_PREFIX = "STAGING DEMO —";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../..");
process.chdir(REPO_ROOT);

const REQUIRED_TABLES = [
  "Order",
  "Payment",
  "Refund",
  "Wallet",
  "WalletTransaction",
  "LedgerEntry",
  "EscrowHold",
  "User",
  "Role",
  "UserRole",
  "Vendor",
  "Category",
  "CategoryAttribute",
  "Product",
  "ProductImage",
  "ProductVariant",
  "InventoryStock",
  "Cart",
  "CartItem",
  "AuditLog",
  "SystemEvent",
  "SearchSyncEvent"
];

type DepartmentSpec = {
  name: string;
  slug: string;
  description: string;
  imageUrl: string;
  imageAlt: string;
};

type VariantSpec = {
  name: string;
  sku: string;
  /** Positive whole minor units as digits; catalogue-admin.service.money() accepts digit strings, not BigInt. */
  priceKobo: string;
  stock: number;
  attributes: Record<string, string>;
};

type ProductSpec =
  | {
      kind: "simple-in-stock";
      name: string;
      slug: string;
      description: string;
      priceKobo: string;
      quantity: number;
      imageUrl: string;
      imageAlt: string;
      departmentSlug: string;
    }
  | {
      kind: "variant";
      name: string;
      slug: string;
      description: string;
      priceKobo: string;
      variants: VariantSpec[];
      imageUrl: string;
      imageAlt: string;
      departmentSlug: string;
    }
  | {
      kind: "simple-out-of-stock";
      name: string;
      slug: string;
      description: string;
      priceKobo: string;
      /** Created with this quantity so publication passes, then set to zero. */
      seedQuantity: number;
      imageUrl: string;
      imageAlt: string;
      departmentSlug: string;
    };

const DEPARTMENTS: DepartmentSpec[] = [
  {
    name: "STAGING DEMO — Phones & Tablets",
    slug: "staging-demo-phones-tablets",
    description:
      "STAGING DEMO department only. Synthetic staging acceptance catalogue; not a real department, offer or supply.",
    imageUrl: "/generated/shop/category-phones-tablets.webp",
    imageAlt: "Illustrative phones and tablets department artwork for staging demonstration"
  },
  {
    name: "STAGING DEMO — Fashion",
    slug: "staging-demo-fashion",
    description:
      "STAGING DEMO department only. Synthetic staging acceptance catalogue; not a real department, offer or supply.",
    imageUrl: "/generated/shop/category-fashion.webp",
    imageAlt: "Illustrative fashion department artwork for staging demonstration"
  },
  {
    name: "STAGING DEMO — Home & Kitchen",
    slug: "staging-demo-home-kitchen",
    description:
      "STAGING DEMO department only. Synthetic staging acceptance catalogue; not a real department, offer or supply.",
    imageUrl: "/generated/shop/category-home-kitchen.webp",
    imageAlt: "Illustrative home and kitchen department artwork for staging demonstration"
  }
];

const PRODUCTS: ProductSpec[] = [
  {
    kind: "simple-in-stock",
    name: `${PRODUCT_NAME_PREFIX} Smartphone catalogue item (illustrative)`,
    slug: "staging-demo-simple-instock-phone",
    description:
      "STAGING DEMO ONLY. Synthetic staging catalogue fixture. This is not a real product, seller offer, price or stock level. " +
      "The approved illustration is reused for demonstration. A test order created from this listing exists only on the " +
      "TEST-classified staging database and must never be treated as real supply.",
    priceKobo: "1850000",
    quantity: 25,
    imageUrl: "/products/tecno-spark-20.svg",
    imageAlt: "Illustrative smartphone drawing used for a staging demonstration catalogue item",
    departmentSlug: "staging-demo-phones-tablets"
  },
  {
    kind: "variant",
    name: `${PRODUCT_NAME_PREFIX} Sneakers with two options (illustrative)`,
    slug: "staging-demo-variant-sneakers",
    description:
      "STAGING DEMO ONLY. Synthetic staging catalogue fixture with two options: one option has test stock and one is deliberately " +
      "out of stock so the availability state can be exercised. This is not a real product, seller offer, price or stock level.",
    priceKobo: "990000",
    variants: [
      {
        name: "STAGING DEMO Blue — size 42",
        sku: "STG-DEMO-SNK-BLUE-42",
        priceKobo: "990000",
        stock: 6,
        attributes: { colour: "Blue", size: "42" }
      },
      {
        name: "STAGING DEMO Red — size 44",
        sku: "STG-DEMO-SNK-RED-44",
        priceKobo: "1090000",
        stock: 0,
        attributes: { colour: "Red", size: "44" }
      }
    ],
    imageUrl: "/products/ankara-sneakers.svg",
    imageAlt: "Illustrative sneakers drawing used for a staging demonstration catalogue item",
    departmentSlug: "staging-demo-fashion"
  },
  {
    kind: "simple-out-of-stock",
    name: `${PRODUCT_NAME_PREFIX} Blender, out of stock (illustrative)`,
    slug: "staging-demo-out-of-stock-blender",
    description:
      "STAGING DEMO ONLY. Synthetic staging catalogue fixture deliberately left with zero available units so the out-of-stock " +
      "state can be exercised. This is not a real product, seller offer, price or stock level.",
    priceKobo: "750000",
    seedQuantity: 2,
    imageUrl: "/products/binatone-blender-15l.svg",
    imageAlt: "Illustrative blender drawing used for a staging demonstration catalogue item",
    departmentSlug: "staging-demo-home-kitchen"
  }
];

type RunMode = "prepare" | "restock" | "cleanup";

function readRunMode(): RunMode {
  const flags = new Set(process.argv.slice(2));
  const unknown = [...flags].filter((flag) => flag !== "--cleanup" && flag !== "--restock");
  if (unknown.length > 0) throw new Error(`unknown argument(s): ${unknown.join(", ")}`);
  if (flags.has("--cleanup") && flags.has("--restock")) {
    throw new Error("choose either --cleanup or --restock, not both");
  }
  if (flags.has("--cleanup")) return "cleanup";
  if (flags.has("--restock")) return "restock";
  return "prepare";
}

type CatalogueServices = typeof import("../../lib/services/core/catalogue-admin.service");

function readStagingDatabaseUrl(): string {
  if (!existsSync(ENV_FILE)) throw new Error(`staging environment file is missing: ${ENV_FILE}`);
  const text = readFileSync(ENV_FILE, "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index <= 0) continue;
    if (line.slice(0, index).trim() === "DATABASE_URL") {
      let value = line.slice(index + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!value) throw new Error("staging DATABASE_URL is configured but empty");
      return value;
    }
  }
  throw new Error("staging DATABASE_URL is not configured");
}

function assertAssetExists(url: string) {
  if (!url.startsWith("/")) return;
  const file = path.resolve(REPO_ROOT, "public", url.replace(/^\/+/, ""));
  if (!existsSync(file)) throw new Error(`approved asset is missing from the repository: ${url}`);
}

function assertAllAssetsExist() {
  for (const department of DEPARTMENTS) assertAssetExists(department.imageUrl);
  for (const product of PRODUCTS) assertAssetExists(product.imageUrl);
}

function roleNamesOf(user: { roles: Array<{ role: { name: string } }> }): string[] {
  return user.roles.map((entry) => entry.role.name);
}

const FORBIDDEN_FIXTURE_ROLES = new Set([
  "vendor",
  "driver",
  "admin",
  "super_admin",
  "ops",
  "finance",
  "support",
  "staging_test_manager",
  "moderator",
  "courier"
]);

async function openDatabase(): Promise<{ prisma: PrismaClient; databaseName: string; marker: string }> {
  const url = readStagingDatabaseUrl();
  const target = await verifyTestDatabase({ url, requiredTables: REQUIRED_TABLES });
  if (target.databaseName !== EXPECTED_DATABASE) {
    throw new Error(
      `refusing: connected database is ${target.databaseName}; this workflow requires ${EXPECTED_DATABASE}`
    );
  }
  // Only the verified URL is copied into this process. Other staging env
  // values (provider keys, mail settings, tokens) are never loaded or printed.
  process.env.DATABASE_URL = target.url;
  const { prisma } = await import("../../lib/prisma");
  const classifications = await prisma.databaseClassification.findMany({
    select: { id: true, classification: true }
  });
  if (
    classifications.length !== 1 ||
    classifications[0]?.id !== "default" ||
    classifications[0]?.classification !== "TEST"
  ) {
    await prisma.$disconnect().catch(() => undefined);
    throw new Error(
      `refusing: ${target.databaseName} must have exactly one canonical DatabaseClassification row id="default" with classification TEST`
    );
  }
  return { prisma, databaseName: target.databaseName, marker: target.marker };
}

async function ensureFixtureActor(prisma: PrismaClient): Promise<{ actor: SessionUser; created: boolean }> {
  // A dedicated non-staff role is granted only to this passwordless audit
  // actor. It is absent from STAFF_ROLES and the app permission map, so even a
  // future login path for this address would not open a Control Center surface.
  let role = await prisma.role.findUnique({ where: { name: FIXTURE_ROLE }, select: { id: true } });
  if (!role) {
    role = await prisma.role.create({
      data: { name: FIXTURE_ROLE, description: "Staging catalogue fixture only; not a staff or human role" },
      select: { id: true }
    });
  }

  const existing = await prisma.user.findUnique({
    where: { email: FIXTURE_EMAIL },
    include: { roles: { include: { role: true } }, vendors: true }
  });
  if (existing?.passwordHash) {
    throw new Error(
      "the deterministic staging fixture email already belongs to a login account; refusing to repurpose it"
    );
  }

  let created = false;
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          name: FIXTURE_NAME,
          actorType: "CUSTOMER",
          countryCode: "NG",
          scopeCountryCode: "NG",
          scopeCityCode: null
        }
      })
    : await prisma.user.create({
        data: {
          email: FIXTURE_EMAIL,
          name: FIXTURE_NAME,
          passwordHash: null,
          actorType: "CUSTOMER",
          countryCode: "NG",
          scopeCountryCode: "NG",
          scopeCityCode: null
        }
      });
  created = !existing;

  // Never retain a broader role from an earlier fixture run.
  await prisma.userRole.deleteMany({ where: { userId: user.id } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });

  const fresh = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    include: { roles: { include: { role: true } }, vendors: true }
  });
  const roles = roleNamesOf(fresh);
  const forbidden = roles.filter((name) => FORBIDDEN_FIXTURE_ROLES.has(name));
  if (roles.length !== 1 || roles[0] !== FIXTURE_ROLE || forbidden.length > 0) {
    throw new Error(
      `the staging fixture actor must hold exactly ${FIXTURE_ROLE}; observed ${roles.length} role(s) and refused role(s): ${
        forbidden.join(", ") || "none"
      }`
    );
  }

  if (created) {
    await prisma.auditLog.create({
      data: {
        action: "staging.fixture.actor_created",
        entity: "User",
        entityId: fresh.id,
        metadata: {
          purpose: "Staging Shop catalogue demonstration audit identity",
          nonLogin: true,
          roles: [FIXTURE_ROLE],
          note: "Passwordless staging-only account. Never a real person or seller."
        }
      }
    });
  }

  const actor = fresh as unknown as SessionUser;
  return { actor, created };
}

async function ensureDemoVendor(
  prisma: PrismaClient,
  actor: SessionUser
): Promise<{ id: string; slug: string; ownerId: string; created: boolean; ownerLabel: string }> {
  const desired = {
    name: "STAGING DEMO — Catalogue Seller (not a real seller)",
    market: "Wuse, Abuja",
    description:
      "Staging-only demonstration seller for Shop acceptance. Not a real seller, business or supply source. " +
      "No payouts are enabled for this demonstration vendor.",
    pickupAddress: "Staging demonstration pickup only, Wuse, Abuja",
    pickupPhone: "+2340000000000",
    countryCode: "NG",
    status: "VERIFIED" as const
  };

  const existing = await prisma.vendor.findUnique({
    where: { slug: DEMO_VENDOR_SLUG },
    include: {
      owner: { include: { roles: { include: { role: true } } } }
    }
  });

  if (!existing) {
    const vendor = await prisma.vendor.create({
      data: {
        ownerId: actor.id,
        slug: DEMO_VENDOR_SLUG,
        ...desired
      }
    });
    await prisma.auditLog.create({
      data: {
        action: "staging.fixture.demo_vendor_created",
        entity: "Vendor",
        entityId: vendor.id,
        metadata: {
          slug: DEMO_VENDOR_SLUG,
          countryCode: "NG",
          market: desired.market,
          status: "VERIFIED",
          isDemo: true,
          note: "Staging demonstration seller only; not real supply and not the tester seller persona."
        }
      }
    });
    return { id: vendor.id, slug: vendor.slug, ownerId: vendor.ownerId, created: true, ownerLabel: "fixture-actor" };
  }

  const ownerRoles = roleNamesOf(existing.owner);
  const ownerIsNonLoginDemo =
    existing.owner.passwordHash === null &&
    (existing.owner.email.endsWith(".invalid") || existing.owner.name.toLowerCase().includes("demo"));
  if (existing.ownerId !== actor.id && !ownerIsNonLoginDemo) {
    throw new Error(
      "the demonstration vendor slug already belongs to a different, non-demo account; refusing to take ownership of it"
    );
  }
  const forbidden = ownerRoles.filter((name) => FORBIDDEN_FIXTURE_ROLES.has(name));
  if (forbidden.length > 0) {
    throw new Error(
      `the demonstration vendor owner holds seller/operational role(s) (${forbidden.join(", ")}); ` +
        "refusing to blur the seller-persona ownership boundary"
    );
  }

  const vendor = await prisma.vendor.update({
    where: { id: existing.id },
    data: desired
  });
  return {
    id: vendor.id,
    slug: vendor.slug,
    ownerId: vendor.ownerId,
    created: false,
    ownerLabel: existing.ownerId === actor.id ? "fixture-actor" : "pre-existing-non-login-demo-owner"
  };
}

async function ensureDepartment(
  prisma: PrismaClient,
  services: CatalogueServices,
  actor: SessionUser,
  spec: DepartmentSpec,
  counters: { created: number; existing: number; reactivated: number }
): Promise<{ id: string; slug: string }> {
  const existing = await prisma.category.findUnique({ where: { slug: spec.slug } });
  if (!existing) {
    const created = await services.createDepartment({
      actor,
      name: spec.name,
      slug: spec.slug,
      description: spec.description,
      imageUrl: spec.imageUrl,
      imageAlt: spec.imageAlt,
      isDemo: true
    });
    counters.created += 1;
    return { id: created.id, slug: created.slug };
  }

  if (existing.name !== spec.name) {
    throw new Error(
      `department slug ${spec.slug} already exists with a different name; refusing to rename an unrelated department`
    );
  }
  if (!existing.isDemo) {
    throw new Error(`department ${spec.slug} exists but is not a demonstration department; refusing to reuse it`);
  }
  if (!existing.isActive) {
    await services.updateDepartment({ actor, id: existing.id, isActive: true });
    counters.reactivated += 1;
  }
  counters.existing += 1;
  return { id: existing.id, slug: existing.slug };
}

type ProductRecord = {
  id: string;
  vendorId: string;
  categoryId: string;
  name: string;
  description: string;
  priceKobo: bigint;
  status: string;
  isDemo: boolean;
  images: Array<{ url: string; alt: string | null; sortOrder: number }>;
  stock: { quantity: number; reserved: number; lowStockLevel: number } | null;
  variants: Array<{
    sku: string;
    name: string;
    priceKobo: bigint;
    stock: number;
    reserved: number;
    isActive: boolean;
  }>;
};

function expectedImages(spec: ProductSpec) {
  return [{ url: spec.imageUrl, alt: spec.imageAlt, primary: true }];
}

function imageSetMatches(images: ProductRecord["images"], spec: ProductSpec): boolean {
  return images.length === 1 && images[0]?.url === spec.imageUrl && images[0]?.alt === spec.imageAlt;
}

function variantSetMatches(record: ProductRecord, spec: Extract<ProductSpec, { kind: "variant" }>): boolean {
  const active = record.variants.filter((variant) => variant.isActive);
  if (active.length !== spec.variants.length) return false;
  const bySku = new Map(active.map((variant) => [variant.sku, variant]));
  return spec.variants.every((variant) => {
    const found = bySku.get(variant.sku);
    return Boolean(
      found &&
        found.name === variant.name &&
        found.priceKobo === BigInt(variant.priceKobo)
    );
  });
}

async function ensureProduct(
  prisma: PrismaClient,
  services: CatalogueServices,
  actor: SessionUser,
  vendorId: string,
  spec: ProductSpec,
  departmentId: string,
  mode: "prepare" | "restock",
  counters: {
    created: number;
    existing: number;
    publishedNow: number;
    converged: number;
    restocked: number;
    restockSkipped: number;
  }
): Promise<{ id: string; created: boolean }> {
  const existing: ProductRecord | null = await prisma.product.findUnique({
    where: { slug: spec.slug },
    include: {
      images: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      stock: true,
      variants: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] }
    }
  });

  if (!existing) {
    const input =
      spec.kind === "variant"
        ? {
            actor,
            name: spec.name,
            slug: spec.slug,
            description: spec.description,
            priceKobo: spec.priceKobo,
            countryCode: "NG",
            categoryId: departmentId,
            isDemo: true,
            quantity: 0,
            images: expectedImages(spec),
            variants: spec.variants.map((variant) => ({ ...variant }))
          }
        : {
            actor,
            name: spec.name,
            slug: spec.slug,
            description: spec.description,
            priceKobo: spec.priceKobo,
            countryCode: "NG",
            categoryId: departmentId,
            isDemo: true,
            quantity: spec.kind === "simple-in-stock" ? spec.quantity : spec.seedQuantity,
            images: expectedImages(spec)
          };
    const created = await services.createProduct(input);
    await services.publishProduct({ actor, id: created.id });
    counters.created += 1;
    counters.publishedNow += 1;

    if (spec.kind === "simple-out-of-stock") {
      await services.updateProduct({ actor, id: created.id, quantity: 0 });
    }
    return { id: created.id, created: true };
  }

  if (existing.vendorId !== vendorId) {
    throw new Error(`product ${spec.slug} belongs to a different seller; refusing to relabel another seller's listing`);
  }
  if (!existing.isDemo) {
    throw new Error(`product ${spec.slug} exists but is not demonstration inventory; refusing to reuse it`);
  }
  if (existing.categoryId !== departmentId) {
    throw new Error(`product ${spec.slug} is in a different department; refusing to move an existing listing`);
  }
  if (!existing.name.startsWith(PRODUCT_NAME_PREFIX)) {
    throw new Error(`product ${spec.slug} is missing the STAGING DEMO name prefix; refusing to treat it as a fixture`);
  }
  if (spec.kind !== "variant" && !existing.stock) {
    throw new Error(`simple fixture ${spec.slug} has no inventory row; remove or repair the drifted fixture before re-provisioning`);
  }

  // Converge presentation drift without touching inventory. These are
  // staging-only demonstration rows, so re-asserting the label and approved
  // image is safe; stock is handled separately below.
  const needsFieldConvergence =
    existing.name !== spec.name ||
    existing.description !== spec.description ||
    existing.priceKobo !== BigInt(spec.priceKobo);
  const needsImageConvergence = !imageSetMatches(existing.images, spec);
  if (needsFieldConvergence || needsImageConvergence) {
    await services.updateProduct({
      actor,
      id: existing.id,
      ...(needsFieldConvergence ? { name: spec.name, description: spec.description, priceKobo: spec.priceKobo } : {}),
      ...(needsImageConvergence ? { images: expectedImages(spec) } : {})
    });
    counters.converged += 1;
  }

  if (spec.kind === "variant" && !variantSetMatches(existing, spec)) {
    const reserved = existing.variants.reduce((total, variant) => total + variant.reserved, 0);
    if (reserved > 0) {
      throw new Error(
        `variant fixture ${spec.slug} has reserved units and does not match the expected options; release open orders before re-provisioning`
      );
    }
    await services.updateProduct({
      actor,
      id: existing.id,
      variants: spec.variants.map((variant) => ({ ...variant }))
    });
    counters.converged += 1;
  }

  if (existing.status === "DRAFT") {
    await services.publishProduct({ actor, id: existing.id });
    counters.publishedNow += 1;
  } else if (existing.status !== "ACTIVE") {
    throw new Error(
      `product ${spec.slug} is ${existing.status}; archives/suspensions are not republished by this workflow`
    );
  }

  if (spec.kind === "simple-out-of-stock") {
    if (existing.stock && existing.stock.quantity !== 0) {
      if (existing.stock.reserved > 0) {
        throw new Error(`out-of-stock fixture ${spec.slug} unexpectedly has reserved units; refusing to rewrite inventory`);
      }
      await services.updateProduct({ actor, id: existing.id, quantity: 0 });
      counters.converged += 1;
    }
  } else if (mode === "restock") {
    if (spec.kind === "simple-in-stock") {
      if (existing.stock && existing.stock.reserved === 0 && existing.stock.quantity !== spec.quantity) {
        await services.updateProduct({ actor, id: existing.id, quantity: spec.quantity });
        counters.restocked += 1;
      } else if (existing.stock && existing.stock.reserved > 0) {
        counters.restockSkipped += 1;
      }
    } else {
      const reserved = existing.variants.reduce((total, variant) => total + variant.reserved, 0);
      const stockMatches = spec.variants.every((variant) => {
        const found = existing.variants.find((row) => row.sku === variant.sku);
        return found?.stock === variant.stock;
      });
      if (reserved === 0 && !stockMatches) {
        await services.updateProduct({
          actor,
          id: existing.id,
          variants: spec.variants.map((variant) => ({ ...variant }))
        });
        counters.restocked += 1;
      } else if (reserved > 0) {
        counters.restockSkipped += 1;
      }
    }
  }

  counters.existing += 1;
  return { id: existing.id, created: false };
}

async function runPrepare(
  prisma: PrismaClient,
  actor: SessionUser,
  services: CatalogueServices,
  mode: "prepare" | "restock"
) {
  const vendor = await ensureDemoVendor(prisma, actor);
  if (vendor.slug !== DEMO_VENDOR_SLUG) {
    throw new Error("demonstration vendor slug did not converge");
  }

  const sellerPersonaVendor = await prisma.vendor.findFirst({
    where: { slug: "staging-test-seller-tester02" },
    select: { id: true, slug: true, ownerId: true }
  });
  if (sellerPersonaVendor?.id === vendor.id) {
    throw new Error("the demonstration vendor is the tester02 seller persona vendor; seller ownership boundaries are broken");
  }
  const demoVendorOwner = await prisma.user.findUniqueOrThrow({
    where: { id: vendor.ownerId },
    select: { id: true, passwordHash: true, roles: { select: { role: { select: { name: true } } } } }
  });
  const demoOwnerRoles = demoVendorOwner.roles.map((entry) => entry.role.name);
  if (demoOwnerRoles.some((name) => FORBIDDEN_FIXTURE_ROLES.has(name))) {
    throw new Error("the demonstration vendor owner holds seller/driver/admin roles; the ownership boundary is not safe");
  }

  const departmentCounters = { created: 0, existing: 0, reactivated: 0 };
  const departmentIds = new Map<string, string>();
  for (const spec of DEPARTMENTS) {
    const department = await ensureDepartment(prisma, services, actor, spec, departmentCounters);
    departmentIds.set(spec.slug, department.id);
  }

  const productCounters = {
    created: 0,
    existing: 0,
    publishedNow: 0,
    converged: 0,
    restocked: 0,
    restockSkipped: 0
  };
  const productIds: Record<string, string> = {};
  for (const spec of PRODUCTS) {
    const departmentId = departmentIds.get(spec.departmentSlug);
    if (!departmentId) throw new Error(`department ${spec.departmentSlug} was not prepared`);
    const product = await ensureProduct(
      prisma,
      services,
      actor,
      vendor.id,
      spec,
      departmentId,
      mode,
      productCounters
    );
    productIds[spec.slug] = product.id;
  }

  const [demoDepartmentCount, demoProductCount, activeDemoProductCount] = await Promise.all([
    prisma.category.count({ where: { slug: { in: DEPARTMENTS.map((entry) => entry.slug) }, isDemo: true } }),
    prisma.product.count({
      where: { vendorId: vendor.id, isDemo: true, slug: { in: PRODUCTS.map((entry) => entry.slug) } }
    }),
    prisma.product.count({
      where: {
        vendorId: vendor.id,
        isDemo: true,
        status: "ACTIVE",
        slug: { in: PRODUCTS.map((entry) => entry.slug) }
      }
    })
  ]);

  const outOfStock = await prisma.product.findUnique({
    where: { slug: "staging-demo-out-of-stock-blender" },
    select: { stock: { select: { quantity: true, reserved: true } } }
  });

  return {
    mode,
    sellerBoundary: {
      demoVendorSlug: vendor.slug,
      demoVendorOwner: vendor.ownerLabel,
      demoOwnerHasSellerRole: demoOwnerRoles.includes("vendor"),
      testerPersonaVendorSlugPresent: Boolean(sellerPersonaVendor),
      demoVendorIsPersonaVendor: sellerPersonaVendor ? sellerPersonaVendor.id === vendor.id : false
    },
    departments: departmentCounters,
    products: productCounters,
    totals: {
      demoDepartments: demoDepartmentCount,
      demoProducts: demoProductCount,
      activeDemoProducts: activeDemoProductCount,
      outOfStockFixtureQuantity: outOfStock?.stock?.quantity ?? null,
      outOfStockFixtureReserved: outOfStock?.stock?.reserved ?? null
    },
    ids: productIds,
    notes: [
      "All catalogue rows are isDemo: true and every name/description says STAGING DEMO.",
      "Only already-approved project images are referenced; no image generation or paid provider call occurred.",
      "No order, wallet, ledger entry or payment was created by this script.",
      "The tester02 seller persona cannot manage these listings; the seller API scopes updates by vendor ownership."
    ]
  };
}

async function runCleanup(prisma: PrismaClient, actor: SessionUser, services: CatalogueServices) {
  const vendor = await prisma.vendor.findUnique({ where: { slug: DEMO_VENDOR_SLUG }, select: { id: true, slug: true } });
  const archived: string[] = [];
  const alreadyArchived: string[] = [];
  const skippedProducts: string[] = [];
  const deactivated: string[] = [];

  if (vendor) {
    for (const spec of PRODUCTS) {
      const product = await prisma.product.findUnique({
        where: { slug: spec.slug },
        select: { id: true, status: true, vendorId: true, isDemo: true }
      });
      if (!product || product.vendorId !== vendor.id || !product.isDemo) continue;
      if (product.status === "ARCHIVED") {
        alreadyArchived.push(spec.slug);
        continue;
      }
      if (product.status !== "DRAFT" && product.status !== "ACTIVE") {
        skippedProducts.push(`${spec.slug}:${product.status}`);
        continue;
      }
      try {
        await services.archiveProduct({ actor, id: product.id });
        archived.push(spec.slug);
      } catch (error) {
        const code = (error as { code?: unknown } | null)?.code;
        if (code === "already_archived") alreadyArchived.push(spec.slug);
        else throw error;
      }
    }
  }

  for (const spec of DEPARTMENTS) {
    const department = await prisma.category.findUnique({
      where: { slug: spec.slug },
      select: { id: true, slug: true, isDemo: true, isActive: true }
    });
    if (!department || !department.isDemo || !department.isActive) continue;
    await services.updateDepartment({ actor, id: department.id, isActive: false });
    deactivated.push(department.slug);
  }

  return {
    mode: "cleanup",
    retained: [
      "The demonstration seller row is retained (no delete workflow exists); it has no products after archiving.",
      "The passwordless staging_catalogue_fixture actor is retained for audit references.",
      "Order, payment, refund and ledger rows are never deleted by this or any catalogue cleanup."
    ],
    archivedProducts: archived,
    alreadyArchivedProducts: alreadyArchived,
    skippedProducts,
    deactivatedDepartments: deactivated,
    note: "Cleanup archives products and deactivates departments through the catalogue services; it deletes nothing."
  };
}

async function main() {
  assertAllAssetsExist();
  const mode = readRunMode();
  const { prisma, databaseName, marker } = await openDatabase();
  try {
    const services = await import("../../lib/services/core/catalogue-admin.service");
    const { actor, created } = await ensureFixtureActor(prisma);
    const result =
      mode === "cleanup"
        ? await runCleanup(prisma, actor, services)
        : await runPrepare(prisma, actor, services, mode === "restock" ? "restock" : "prepare");

    console.log(
      JSON.stringify(
        {
          ok: true,
          database: databaseName,
          classification: "TEST",
          marker,
          fixtureActor: created ? "created" : "existing",
          ...result
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`STAGING_SHOP_FIXTURES_FAILED: ${sanitizeDatabaseError(error)}`);
  process.exitCode = 1;
});
