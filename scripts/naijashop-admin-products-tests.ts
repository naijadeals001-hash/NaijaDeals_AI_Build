/**
 * NaijaShop Control Center catalogue pagination acceptance tests.
 *
 * Scope:
 *   - server pagination/search/status/sort with truthful totals;
 *   - every authorised product reachable, including the oldest record;
 *   - the legacy unpaginated array contract remains intact;
 *   - country-scoped staff cannot read or moderate a foreign region;
 *   - unauthorised users are refused;
 *   - moderation still writes audit evidence;
 *   - origin-review pagination is exercised read-only (it is a separate
 *     endpoint and is not assumed to be fixed by the products change).
 *
 * Run only against an isolated TEST database and an app pointed at it:
 *   TEST_DATABASE_URL=postgresql://... TEST_BASE_URL=http://localhost:3106 \
 *     npx tsx scripts/naijashop-admin-products-tests.ts
 *
 * Fixtures are run-tagged and deleted in a finally block. The accepted
 * catalogue is not mutated: only rows created by this run are moderated.
 */
import "dotenv/config";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_REQUIRED_TABLES, requireTestDatabase } from "./lib/test-db-guard";

const BASE = (process.env.TEST_BASE_URL ?? "").replace(/\/$/, "");
const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME || "nd_session";
const SKIP_UI = process.env.SKIP_UI === "1";
if (!BASE) throw new Error("TEST_BASE_URL is required (for example http://localhost:3106).");

type Json = Record<string, any>;
type CheckResult = { name: string; status: "PASS" | "FAIL"; detail: string };
const results: CheckResult[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function check(name: string, fn: () => Promise<string>) {
  try {
    const detail = await fn();
    results.push({ name, status: "PASS", detail });
    console.log(`PASS  ${name} — ${detail}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, status: "FAIL", detail });
    console.error(`FAIL  ${name}\n      ${detail}`);
  }
}

class Client {
  private cookies = new Map<string, string>();

  constructor(token?: string) {
    if (token) this.cookies.set(SESSION_COOKIE, token);
  }

  async request(path: string, options: { method?: string; body?: unknown } = {}) {
    const headers: Record<string, string> = { Origin: BASE };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    const cookie = [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
    if (cookie) headers.Cookie = cookie;
    const response = await fetch(`${BASE}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      redirect: "manual"
    });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text.slice(0, 300) };
    }
    return {
      status: response.status,
      headers: response.headers,
      body: body as Json,
      arrayBody: Array.isArray(body) ? (body as Json[]) : null
    };
  }

  get(path: string) {
    return this.request(path);
  }

  post(path: string, body?: unknown) {
    return this.request(path, { method: "POST", body });
  }
}

function isStatus(response: { status: number; body: Json }, expected: number, label: string) {
  if (response.status !== expected) {
    throw new Error(`${label}: expected HTTP ${expected}, got ${response.status} ${JSON.stringify(response.body).slice(0, 400)}`);
  }
}

function sessionToken(): string {
  return randomBytes(32).toString("base64url");
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function main() {
  const target = await requireTestDatabase({
    requiredTables: [
      ...DEFAULT_REQUIRED_TABLES,
      "Product",
      "ProductImage",
      "ProductVariant",
      "InventoryStock",
      "Vendor",
      "Category",
      "User",
      "Role",
      "UserRole",
      "Session",
      "AuditLog"
    ]
  });

  // Import Prisma only after the guard has pointed DATABASE_URL at the verified target.
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const suffix = randomUUID().replace(/-/g, "").slice(0, 10).toLowerCase();
  const created = {
    userIds: [] as string[],
    sessionIds: [] as string[],
    roleIds: [] as string[],
    categoryIds: [] as string[],
    vendorIds: [] as string[],
    productIds: [] as string[],
    variantIds: [] as string[]
  };

  async function roleId(name: string) {
    const role = await prisma.role.findUnique({ where: { name } });
    if (role) return role.id;
    const createdRole = await prisma.role.create({ data: { name } });
    created.roleIds.push(createdRole.id);
    return createdRole.id;
  }

  async function createUser(input: { label: string; role: string; actorType: "ADMIN" | "CUSTOMER"; scopeCountryCode?: string | null }) {
    const user = await prisma.user.create({
      data: {
        email: `cc-products-${input.label}-${suffix}@example.test`,
        name: `Catalogue ${input.label} ${suffix}`,
        actorType: input.actorType,
        verifiedAt: new Date(),
        scopeCountryCode: input.scopeCountryCode ?? null
      }
    });
    created.userIds.push(user.id);
    await prisma.userRole.create({ data: { userId: user.id, roleId: await roleId(input.role) } });
    return user;
  }

  async function createSession(userId: string) {
    const token = sessionToken();
    const session = await prisma.session.create({
      data: {
        userId,
        tokenHash: tokenHash(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        userAgent: "naijashop-admin-products-tests"
      }
    });
    created.sessionIds.push(session.id);
    return token;
  }

  let exitCode = 1;
  try {
    console.log(`TEST database verified (${target.databaseName}); marker ${target.marker}`);
    console.log(`Fixture suffix ${suffix}`);

    const admin = await createUser({ label: "admin", role: "admin", actorType: "ADMIN" });
    const scopedModerator = await createUser({
      label: "gh-moderator",
      role: "moderator",
      actorType: "CUSTOMER",
      scopeCountryCode: "GH"
    });
    const superAdmin = await createUser({ label: "super", role: "super_admin", actorType: "ADMIN" });
    const customer = await createUser({ label: "customer", role: "customer", actorType: "CUSTOMER" });
    const anonymous = new Client();
    const adminToken = await createSession(admin.id);
    const scopedToken = await createSession(scopedModerator.id);
    const adminClient = new Client(adminToken);
    const scopedClient = new Client(scopedToken);
    const superClient = new Client(await createSession(superAdmin.id));
    const customerClient = new Client(await createSession(customer.id));

    const probe = await adminClient.get("/api/admin/overview");
    assert(
      probe.status === 200,
      `The running app did not accept a session created in the verified test database (HTTP ${probe.status}). Start it with the same TEST_DATABASE_URL.`
    );

    const category = await prisma.category.create({
      data: { name: `Catalogue Scope ${suffix}`, slug: `catalogue-scope-${suffix}`, description: "Isolated acceptance fixture" }
    });
    created.categoryIds.push(category.id);

    const ngVendor = await prisma.vendor.create({
      data: {
        ownerId: customer.id,
        name: `Catalogue NG Vendor ${suffix}`,
        slug: `catalogue-ng-vendor-${suffix}`,
        market: "Lagos Island, Lagos",
        pickupAddress: "1 Catalogue Way, Lagos",
        pickupPhone: "+2348000000010",
        countryCode: "NG",
        status: "VERIFIED",
        trustScore: 80
      }
    });
    created.vendorIds.push(ngVendor.id);

    const ghVendor = await prisma.vendor.create({
      data: {
        ownerId: customer.id,
        name: `Catalogue GH Vendor ${suffix}`,
        slug: `catalogue-gh-vendor-${suffix}`,
        market: "Accra",
        pickupAddress: "1 Catalogue Road, Accra",
        pickupPhone: "+233800000010",
        countryCode: "GH",
        status: "VERIFIED",
        trustScore: 75
      }
    });
    created.vendorIds.push(ghVendor.id);

    const oldestFixtureAt = new Date("2000-01-01T00:00:00.000Z");
    let sequence = 0;

    async function createFixtureProduct(input: {
      label: string;
      countryCode: "NG" | "GH";
      status?: "ACTIVE" | "SUSPENDED" | "DRAFT" | "ARCHIVED";
      createdAt?: Date;
      vendorId?: string;
      quantity?: number;
      variants?: Array<{ name: string; isActive: boolean; stock: number; priceKobo: bigint }>;
    }) {
      sequence += 1;
      const product = await prisma.product.create({
        data: {
          slug: `catalogue-${input.label}-${suffix}-${sequence}`,
          name: `Catalogue ${input.label} ${suffix} ${sequence}`,
          description: "Isolated product for Control Center catalogue acceptance tests.",
          vendorId: input.vendorId ?? (input.countryCode === "GH" ? ghVendor.id : ngVendor.id),
          categoryId: category.id,
          priceKobo: 250000n,
          countryCode: input.countryCode,
          status: input.status ?? "ACTIVE",
          isSample: false,
          createdAt: input.createdAt ?? new Date(Date.UTC(2021, 0, 1 + sequence)),
          stock: { create: { quantity: input.quantity ?? 10, reserved: 0, lowStockLevel: 3 } },
          variants: input.variants
            ? {
                create: input.variants.map((variant, index) => ({
                  name: variant.name,
                  sku: `SKU-${suffix}-${sequence}-${index}`,
                  priceKobo: variant.priceKobo,
                  stock: variant.stock,
                  reserved: 0,
                  isActive: variant.isActive
                }))
              }
            : undefined
        },
        include: { variants: true }
      });
      created.productIds.push(product.id);
      for (const variant of product.variants) created.variantIds.push(variant.id);
      return product;
    }

    // 38 active + 2 suspended + 1 draft NG fixtures, plus 4 GH fixtures.
    const oldest = await createFixtureProduct({ label: "oldest", countryCode: "NG", createdAt: oldestFixtureAt });
    for (let index = 0; index < 37; index += 1) {
      await createFixtureProduct({ label: `active-${index}`, countryCode: "NG" });
    }
    const suspendedA = await createFixtureProduct({ label: "suspended-a", countryCode: "NG", status: "SUSPENDED" });
    const suspendedB = await createFixtureProduct({ label: "suspended-b", countryCode: "NG", status: "SUSPENDED" });
    await createFixtureProduct({ label: "draft-a", countryCode: "NG", status: "DRAFT" });
    const ghFixtures = [] as Array<{ id: string; name: string }>;
    for (let index = 0; index < 4; index += 1) {
      const product = await createFixtureProduct({ label: `gh-${index}`, countryCode: "GH" });
      ghFixtures.push({ id: product.id, name: product.name });
    }

    const fixtureIds = [...created.productIds];
    const dbTotal = await prisma.product.count();
    const dbGhTotal = await prisma.product.count({ where: { countryCode: "GH" } });
    assert(dbTotal > 50, `The fixture set is too small to exercise paging (total ${dbTotal}).`);

    await check("Paginated envelope returns a truthful total and page size", async () => {
      const response = await adminClient.get("/api/admin/products?page=1&pageSize=10");
      isStatus(response, 200, "page 1");
      assert(Array.isArray(response.body.products), "products is not an array");
      assert(response.body.products.length === 10, `expected 10 rows, got ${response.body.products.length}`);
      assert(response.body.total === dbTotal, `total ${response.body.total} does not match database ${dbTotal}`);
      assert(response.body.page === 1 && response.body.pageSize === 10, "page envelope fields are wrong");
      assert(response.body.totalPages === Math.ceil(dbTotal / 10), `totalPages ${response.body.totalPages}`);
      assert(response.body.hasMore === true, "hasMore should be true for page 1");
      assert(response.headers.get("x-total-count") === String(dbTotal), "X-Total-Count header is wrong");
      return `total ${dbTotal}, 10 rows, totalPages ${response.body.totalPages}`;
    });

    await check("Every authorised product is reachable and the oldest record appears", async () => {
      const collected = new Set<string>();
      const pageSize = 10;
      const totalPages = Math.ceil(dbTotal / pageSize);
      for (let page = 1; page <= totalPages; page += 1) {
        const response = await adminClient.get(`/api/admin/products?page=${page}&pageSize=${pageSize}`);
        isStatus(response, 200, `page ${page}`);
        for (const row of response.body.products as Json[]) collected.add(String(row.id));
      }
      assert(collected.size === dbTotal, `walked ${collected.size} unique products, expected ${dbTotal}`);
      assert(collected.has(oldest.id), "the oldest fixture is unreachable through pagination");

      const lastPage = await adminClient.get(`/api/admin/products?page=${totalPages}&pageSize=${pageSize}`);
      assert(
        (lastPage.body.products as Json[]).some((row) => row.id === oldest.id),
        "the oldest fixture is missing from the final page"
      );

      const oldestFirst = await adminClient.get("/api/admin/products?page=1&pageSize=5&sort=oldest");
      isStatus(oldestFirst, 200, "oldest sort");
      assert(oldestFirst.body.products[0]?.id === oldest.id, "sort=oldest did not start with the oldest record");
      return `walked ${totalPages} pages / ${collected.size} unique rows; oldest reachable by last page and sort=oldest`;
    });

    await check("Search filters the whole catalogue and reports a filtered total", async () => {
      const response = await adminClient.get(
        `/api/admin/products?page=1&pageSize=100&q=${encodeURIComponent(suffix)}`
      );
      isStatus(response, 200, "search fixtures");
      assert(response.body.total === fixtureIds.length, `search total ${response.body.total}, expected ${fixtureIds.length}`);
      assert(
        (response.body.products as Json[]).every((row) => String(row.name).includes(suffix)),
        "search returned a row outside the fixture set"
      );
      const miss = await adminClient.get(`/api/admin/products?page=1&pageSize=10&q=no-such-product-${suffix}`);
      isStatus(miss, 200, "search miss");
      assert(miss.body.total === 0 && (miss.body.products as Json[]).length === 0, "search miss was not empty");
      return `search total ${response.body.total}; empty miss total 0`;
    });

    await check("Status filter is applied by the server with a matching total", async () => {
      const dbSuspended = await prisma.product.count({ where: { status: "SUSPENDED" } });
      const response = await adminClient.get("/api/admin/products?page=1&pageSize=100&status=SUSPENDED");
      isStatus(response, 200, "status filter");
      assert(response.body.total === dbSuspended, `total ${response.body.total}, expected ${dbSuspended}`);
      assert(
        (response.body.products as Json[]).every((row) => row.status === "SUSPENDED"),
        "status filter returned a non-suspended row"
      );
      assert(
        (response.body.products as Json[]).some((row) => row.id === suspendedA.id || row.id === suspendedB.id),
        "fixture suspended rows were not returned"
      );
      return `SUSPENDED total ${dbSuspended}; only suspended rows`;
    });

    await check("Legacy unpaginated contract still returns an array with paging headers", async () => {
      const response = await adminClient.get("/api/admin/products");
      isStatus(response, 200, "legacy array");
      assert(Array.isArray(response.arrayBody), "legacy response is not an array");
      assert(response.body.products === undefined, "legacy response unexpectedly uses the envelope");
      assert(response.arrayBody!.length === Math.min(dbTotal, 200), `legacy length ${response.arrayBody!.length}`);
      assert(response.headers.get("x-total-count") === String(dbTotal), "legacy X-Total-Count is wrong");
      return `array of ${response.arrayBody!.length} with X-Total-Count ${dbTotal}`;
    });

    await check("Country-scoped moderator sees only its region and cannot widen with country=", async () => {
      const response = await scopedClient.get("/api/admin/products?page=1&pageSize=100");
      isStatus(response, 200, "GH-scoped page");
      assert(response.body.total === dbGhTotal, `GH total ${response.body.total}, expected ${dbGhTotal}`);
      assert(
        (response.body.products as Json[]).every((row) => row.countryCode === "GH"),
        "GH-scoped response contained a foreign row"
      );
      assert(
        !(response.body.products as Json[]).some((row) => row.id === oldest.id),
        "GH-scoped response contained an NG fixture"
      );
      const widen = await scopedClient.get("/api/admin/products?page=1&pageSize=10&country=NG");
      isStatus(widen, 200, "GH-scoped NG filter");
      assert(widen.body.total === 0, `country=NG bypassed scope with total ${widen.body.total}`);
      return `GH total ${dbGhTotal}; country=NG returned 0 rows`;
    });

    await check("Unauthenticated and unauthorised callers are refused", async () => {
      const guest = await anonymous.get("/api/admin/products?page=1&pageSize=10");
      isStatus(guest, 401, "anonymous list");
      const forbidden = await customerClient.get("/api/admin/products?page=1&pageSize=10");
      isStatus(forbidden, 403, "customer list");
      assert(forbidden.body.code === "forbidden", `expected forbidden, got ${forbidden.body.code}`);
      return "HTTP 401 anonymous, HTTP 403 customer";
    });

    await check("Page and filter validation rejects malformed input", async () => {
      for (const query of ["page=0", "pageSize=0", "pageSize=101", "status=BOGUS", "sort=bogus", "country=NGX", "page=abc"]) {
        const response = await adminClient.get(`/api/admin/products?${query}`);
        isStatus(response, 400, query);
        assert(response.body.code === "validation_error", `${query} did not return validation_error`);
      }
      const beyond = await adminClient.get("/api/admin/products?page=9999&pageSize=10");
      isStatus(beyond, 200, "beyond last page");
      assert((beyond.body.products as Json[]).length === 0, "beyond-last-page returned rows");
      assert(beyond.body.total === dbTotal, "beyond-last-page total changed");
      return "6 invalid queries -> 400; page beyond range -> empty 200";
    });

    await check("Moderation works for a scoped moderator and writes audit evidence", async () => {
      const ghTarget = ghFixtures[0];
      const suspended = await scopedClient.post(`/api/admin/products/${ghTarget.id}/moderate`, {
        status: "SUSPENDED",
        note: `Catalogue acceptance ${suffix}`
      });
      isStatus(suspended, 200, "scoped suspend");
      const stored = await prisma.product.findUniqueOrThrow({ where: { id: ghTarget.id } });
      assert(stored.status === "SUSPENDED", `stored status ${stored.status}`);
      const audit = await prisma.auditLog.findFirst({
        where: { action: "product.moderated", entityId: ghTarget.id, actorId: scopedModerator.id },
        orderBy: { createdAt: "desc" }
      });
      assert(audit, "no product.moderated audit row for the scoped moderator");

      const reactivated = await scopedClient.post(`/api/admin/products/${ghTarget.id}/moderate`, { status: "ACTIVE" });
      isStatus(reactivated, 200, "scoped activate");
      const restored = await prisma.product.findUniqueOrThrow({ where: { id: ghTarget.id } });
      assert(restored.status === "ACTIVE", "fixture was not restored to ACTIVE");
      return `fixture ${ghTarget.id} SUSPENDED -> ACTIVE with attributable audit ${audit.id}`;
    });

    await check("A scoped moderator cannot moderate another region's product", async () => {
      const response = await scopedClient.post(`/api/admin/products/${oldest.id}/moderate`, { status: "SUSPENDED" });
      isStatus(response, 403, "cross-region moderate");
      assert(response.body.code === "region_forbidden", `expected region_forbidden, got ${response.body.code}`);
      const stored = await prisma.product.findUniqueOrThrow({ where: { id: oldest.id } });
      assert(stored.status === "ACTIVE", "cross-region moderation changed the NG fixture");
      return "HTTP 403 region_forbidden; NG fixture unchanged";
    });

    await check("Origin review pagination is independently implemented (read-only)", async () => {
      const first = await superClient.get("/api/admin/country-discovery/origin?page=1&pageSize=5");
      isStatus(first, 200, "origin page 1");
      assert(Array.isArray(first.body.rows), "origin page has no rows array");
      assert(first.body.page === 1 && first.body.pageSize === 5, "origin page envelope fields are wrong");
      assert(typeof first.body.total === "number", "origin page has no total");
      assert(first.body.totalPages === Math.max(1, Math.ceil(first.body.total / 5)), "origin totalPages is wrong");

      const second = await superClient.get("/api/admin/country-discovery/origin?page=2&pageSize=5");
      isStatus(second, 200, "origin page 2");
      const firstIds = new Set((first.body.rows as Json[]).map((row) => row.id));
      assert(
        (second.body.rows as Json[]).every((row) => !firstIds.has(row.id)),
        "origin page 2 repeated page 1 rows"
      );

      const search = await superClient.get(
        `/api/admin/country-discovery/origin?page=1&pageSize=5&search=${encodeURIComponent(suffix)}`
      );
      isStatus(search, 200, "origin search");
      assert(search.body.total === fixtureIds.length, `origin search total ${search.body.total}, expected ${fixtureIds.length}`);
      return `origin pagination already returns rows/total/page/pageSize/totalPages; search total ${search.body.total}`;
    });

    if (!SKIP_UI) {
      await check("Control Center products tab pages, searches and respects region scope at 390/768/1440", async () => {
        const { chromium } = await import("playwright");
        const outDir = path.resolve("qa-artifacts", "admin-products");
        await mkdir(outDir, { recursive: true });
        const browser = await chromium.launch({ headless: true });
        const viewports = [
          { width: 390, height: 844 },
          { width: 768, height: 1024 },
          { width: 1440, height: 900 }
        ];
        const notes: string[] = [];
        try {
          for (const viewport of viewports) {
            const context = await browser.newContext({ viewport });
            await context.addCookies([{ name: SESSION_COOKIE, value: adminToken, url: BASE }]);
            const page = await context.newPage();
            await page.goto(`${BASE}/admin?module=shop&tab=products`, { waitUntil: "networkidle", timeout: 60_000 });
            await page.getByText(`of ${dbTotal.toLocaleString()} products`).first().waitFor({ timeout: 30_000 });
            assert(
              (await page.locator("tbody tr").count()) === 20,
              `${viewport.width}: expected 20 server rows on page 1`
            );

            await page.getByPlaceholder("Search product, seller or category…").fill(suffix);
            await page.getByText(`of ${fixtureIds.length.toLocaleString()} products`).first().waitFor({ timeout: 20_000 });

            await page.getByLabel("Sort by").selectOption("oldest");
            await page.locator("tbody tr").first().getByText(oldest.name).waitFor({ timeout: 20_000 });

            await page.getByRole("button", { name: "Next product page" }).click();
            await page.getByText(`Page 2 of ${Math.ceil(fixtureIds.length / 20)}`).first().waitFor({ timeout: 20_000 });
            await page.getByRole("button", { name: "Previous product page" }).click();
            await page.getByText("Page 1 of").first().waitFor({ timeout: 20_000 });

            const overflow = await page.evaluate(
              () => document.documentElement.scrollWidth > window.innerWidth + 1
            );
            assert(!overflow, `${viewport.width}: horizontal overflow on the products tab`);
            await page.screenshot({ path: path.join(outDir, `products-${viewport.width}.png`), fullPage: true });
            await context.close();
            notes.push(`${viewport.width}px paged/searched`);

            const scopedContext = await browser.newContext({ viewport });
            await scopedContext.addCookies([{ name: SESSION_COOKIE, value: scopedToken, url: BASE }]);
            const scopedPage = await scopedContext.newPage();
            await scopedPage.goto(`${BASE}/admin?module=shop&tab=products`, { waitUntil: "networkidle", timeout: 60_000 });
            await scopedPage.getByText(`of ${dbGhTotal.toLocaleString()} products`).first().waitFor({ timeout: 30_000 });
            assert(
              (await scopedPage.getByText("Catalogue oldest", { exact: false }).count()) === 0,
              `${viewport.width}: GH-scoped UI rendered an NG fixture`
            );
            await scopedPage.screenshot({ path: path.join(outDir, `products-gh-scoped-${viewport.width}.png`), fullPage: true });
            await scopedContext.close();
            notes.push(`${viewport.width}px region-scoped`);
          }
        } finally {
          await browser.close();
        }
        return `UI verified: ${notes.join(", ")}; screenshots in qa-artifacts/admin-products`;
      });
    }

    exitCode = results.some((result) => result.status === "FAIL") ? 1 : 0;
  } finally {
    await prisma.auditLog
      .deleteMany({
        where: {
          OR: [{ actorId: { in: created.userIds } }, { entityId: { in: created.productIds } }]
        }
      })
      .catch(() => undefined);
    await prisma.systemEvent
      .deleteMany({
        where: {
          OR: [{ actorId: { in: created.userIds } }, { entityId: { in: created.productIds } }]
        }
      })
      .catch(() => undefined);
    await prisma.productImage.deleteMany({ where: { productId: { in: created.productIds } } }).catch(() => undefined);
    await prisma.inventoryStock.deleteMany({ where: { productId: { in: created.productIds } } }).catch(() => undefined);
    await prisma.productVariant.deleteMany({ where: { productId: { in: created.productIds } } }).catch(() => undefined);
    await prisma.product.deleteMany({ where: { id: { in: created.productIds } } }).catch(() => undefined);
    await prisma.vendor.deleteMany({ where: { id: { in: created.vendorIds } } }).catch(() => undefined);
    await prisma.category.deleteMany({ where: { id: { in: created.categoryIds } } }).catch(() => undefined);
    await prisma.session.deleteMany({ where: { id: { in: created.sessionIds } } }).catch(() => undefined);
    await prisma.userRole.deleteMany({ where: { userId: { in: created.userIds } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: created.userIds } } }).catch(() => undefined);
    for (const roleId of created.roleIds) {
      const references = await prisma.userRole.count({ where: { roleId } }).catch(() => 0);
      if (references === 0) await prisma.role.delete({ where: { id: roleId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }

  const passed = results.filter((result) => result.status === "PASS").length;
  const failed = results.filter((result) => result.status === "FAIL").length;
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = exitCode;
}

void main().catch((error) => {
  console.error(`TEST_RUN_FAILED ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
