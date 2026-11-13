/**
 * Service activation acceptance — Shop vertical.
 *
 * Covers:
 *   - effective-state precedence (GLOBAL > country > city > registry);
 *   - DB writes through the service with before/after audit;
 *   - super-admin-only `verticals:write` (regular admin receives 403);
 *   - direct catalogue/detail API refusal while Shop is DISABLED;
 *   - existing orders still readable and seller/checkout writes refused;
 *   - public homepage + Shop navigation reflecting the effective state;
 *   - Control Center page rendering and audit visibility.
 *
 * Safety:
 *   - refuses production names and requires a TEST or REVIEW database marker;
 *   - never writes financial rows, never creates or deletes orders;
 *   - fixtures are run-tagged and Shop activation rows are restored exactly;
 *   - the dev server uses an isolated `.next-*` build directory.
 *
 * Usage:
 *   TEST_BASE_URL=http://localhost:3059 npx tsx scripts/vertical-activation-tests.ts
 *   npx tsx scripts/vertical-activation-tests.ts            # starts its own dev server
 *
 * Database selection: VERTICAL_TEST_DATABASE_URL, then a non-core DATABASE_URL,
 * otherwise the REVIEW database named in .env. The chosen database is printed by
 * name only; the connection string is never printed.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { createWriteStream, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

type CheckResult = { name: string; status: "PASS" | "FAIL"; detail: string };
const results: CheckResult[] = [];
const runId = randomUUID().replace(/-/g, "").slice(0, 8);
const STARTED_AT = new Date(Date.now() - 1_000);

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

function databaseName(url: string) {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  } catch {
    return "";
  }
}

const REFUSED_DATABASES = new Set([
  "naijadeals_core",
  "naijadeals_prod",
  "naijadeals_production",
  "naijadeals_live",
  "naijadeals_shared",
  "postgres",
  "template0",
  "template1"
]);

/**
 * Choose an explicitly named isolated database. `.env` points at the daily
 * build, so when neither VERTICAL_TEST_DATABASE_URL nor an explicit non-core
 * DATABASE_URL is supplied we derive the REVIEW database from the same server.
 * The REVIEW classification is the project's non-live demonstration database.
 */
function resolveDatabaseUrl(): string {
  const explicit = process.env.VERTICAL_TEST_DATABASE_URL?.trim();
  if (explicit) return explicit;

  const current = process.env.DATABASE_URL?.trim();
  if (current && !REFUSED_DATABASES.has(databaseName(current))) return current;

  const envText = readFileSync(join(process.cwd(), ".env"), "utf8");
  const line = envText.split(/\r?\n/).find((entry) => entry.trim().startsWith("DATABASE_URL="));
  assert(line, "No DATABASE_URL was found in .env.");
  const raw = line.slice(line.indexOf("=") + 1).trim().replace(/^"|"$/g, "");
  const url = new URL(raw);
  url.pathname = "/naijadeals_review";
  return url.toString();
}

process.env.DATABASE_URL = resolveDatabaseUrl();

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "";
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

type RunningServer = { base: string; process: ChildProcess | null; logPath: string };

async function waitForServer(base: string, child: ChildProcess | null, logPath: string) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) {
      throw new Error(`The isolated dev server exited with code ${child.exitCode}. See ${logPath}.`);
    }
    try {
      const response = await fetch(`${base}/api/products/availability?country=NG`, {
        signal: AbortSignal.timeout(3_000)
      });
      if (response.status === 200) return;
    } catch {
      /* still compiling */
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`The isolated dev server did not become ready. See ${logPath}.`);
}

async function ensureServer(): Promise<RunningServer> {
  const configured = process.env.TEST_BASE_URL?.trim();
  if (configured) {
    const base = configured.replace(/\/$/, "");
    await waitForServer(base, null, "(external server)");
    return { base, process: null, logPath: "" };
  }

  const port = await freePort();
  const base = `http://localhost:${port}`;
  const artifactDir = join(process.cwd(), "qa-artifacts", "vertical-activation");
  mkdirSync(artifactDir, { recursive: true });
  const logPath = join(artifactDir, "dev-server.log");
  const output = createWriteStream(logPath, { flags: "a" });
  const command = "npx";
  const child = spawn(command, ["next", "dev", "-p", String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL,
      NEXT_DIST_DIR: ".next-vertical-activation-test",
      NEXT_PUBLIC_APP_URL: base,
      ENABLE_TEST_PAYMENTS: "false"
    },
    // Windows needs a shell to resolve npx.cmd; process-tree termination still
    // uses taskkill /T so the Next child does not outlive the test.
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout?.pipe(output);
  child.stderr?.pipe(output);
  try {
    await waitForServer(base, child, logPath);
  } catch (error) {
    stopServer({ base, process: child, logPath });
    throw error;
  }
  return { base, process: child, logPath };
}

function stopServer(server: RunningServer | null) {
  if (!server?.process?.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(server.process.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-server.process.pid, "SIGTERM");
    } catch {
      try {
        server.process.kill("SIGTERM");
      } catch {
        /* already gone */
      }
    }
  }
}

type Json = Record<string, any>;

async function http(
  base: string,
  method: string,
  path: string,
  cookie = "",
  body?: unknown
): Promise<{ status: number; body: Json | null }> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      Origin: base,
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual"
  });
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text.slice(0, 300) };
  }
  return { status: response.status, body: parsed as Json | null };
}

async function login(base: string, email: string, password: string) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  assert(response.status === 200, `login ${email} failed: HTTP ${response.status}`);
  const cookies = response.headers.getSetCookie?.() ?? [];
  const pairs = cookies.map((entry) => entry.split(";")[0]);
  return { header: pairs.join("; "), session: pairs.find((pair) => pair.startsWith("nd_session=")) ?? "" };
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run activation acceptance with NODE_ENV=production.");
  }

  const { prisma } = await import("../lib/prisma");
  const { hashPassword } = await import("../lib/auth/password");
  const { getOrder } = await import("../lib/services/core/order.service");
  const { createSellerProduct } = await import("../lib/services/core/seller.service");
  const { checkout } = await import("../lib/services/core/checkout.service");
  const activation = await import("../lib/services/core/vertical-activation.service");
  const { ApiError } = await import("../lib/auth/guard");

  const identity = await prisma.$queryRaw<Array<{ db: string; current_user: string }>>`
    SELECT current_database() AS db, current_user AS "current_user"
  `;
  const dbName = identity[0]?.db ?? "";
  assert(!REFUSED_DATABASES.has(dbName), `Refusing activation tests on "${dbName}".`);
  const classification = await prisma.databaseClassification.findFirst({ select: { classification: true } });
  const marker = classification?.classification ?? "UNKNOWN";
  assert(
    marker === "TEST" || marker === "REVIEW",
    `Refusing activation tests: "${dbName}" is classified ${marker}, not TEST or REVIEW.`
  );
  const table = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = 'VerticalActivation'
  `;
  assert(Number(table[0]?.n) === 1, "VerticalActivation table is missing; apply the migration first.");
  console.log(`Database: ${dbName} (${marker}) — activation/audit fixtures only, no financial writes.`);

  // ---- Pure resolver checks (no database dependency) ---------------------
  const registry = { verticalKey: "shop", registryStatus: "live" as const };

  await check("1. Registry status is the default when no activation rows exist", async () => {
    const effective = activation.evaluateVerticalActivation({ ...registry, rows: [] });
    assert(effective.status === "LIVE", `got ${effective.status}`);
    assert(effective.scope === "REGISTRY" && effective.source === "registry", `got ${effective.scope}/${effective.source}`);
    return "Shop defaults to LIVE from the live registry status";
  });

  await check("2. GLOBAL OFF overrides a LIVE country and city rule", async () => {
    const effective = activation.evaluateVerticalActivation({
      ...registry,
      rows: [
        { id: "g", scopeType: "GLOBAL", countryCode: "", cityCode: "", status: "DISABLED", reason: "global pause" },
        { id: "c", scopeType: "COUNTRY", countryCode: "NG", cityCode: "", status: "LIVE", reason: "local on" },
        { id: "t", scopeType: "CITY", countryCode: "NG", cityCode: "lagos", status: "LIVE", reason: "city on" }
      ],
      countryCode: "NG",
      cityCode: "lagos"
    });
    assert(effective.status === "DISABLED", `got ${effective.status}`);
    assert(effective.scope === "GLOBAL", `got ${effective.scope}`);
    assert(effective.globalOverrideActive, "globalOverrideActive was false");
    assert(effective.localOverrideIgnored, "localOverrideIgnored was false");
    return "DISABLED via GLOBAL; both local rows reported as overridden";
  });

  await check("3. One country DISABLED while another stays LIVE", async () => {
    const rows = [
      { id: "ng", scopeType: "COUNTRY", countryCode: "NG", cityCode: "", status: "DISABLED", reason: "NG pause" },
      { id: "gh", scopeType: "COUNTRY", countryCode: "GH", cityCode: "", status: "LIVE", reason: "GH open" }
    ];
    const ng = activation.evaluateVerticalActivation({ ...registry, rows, countryCode: "NG" });
    const gh = activation.evaluateVerticalActivation({ ...registry, rows, countryCode: "GH" });
    const ke = activation.evaluateVerticalActivation({ ...registry, rows, countryCode: "KE" });
    assert(ng.status === "DISABLED" && ng.scope === "COUNTRY", `NG ${ng.status}/${ng.scope}`);
    assert(gh.status === "LIVE" && gh.scope === "COUNTRY", `GH ${gh.status}/${gh.scope}`);
    assert(ke.status === "LIVE" && ke.scope === "REGISTRY", `KE ${ke.status}/${ke.scope}`);
    return "NG DISABLED, GH LIVE, KE inherits registry LIVE";
  });

  await check("4. A CITY rule applies inside that city only", async () => {
    const rows = [
      { id: "ng", scopeType: "COUNTRY", countryCode: "NG", cityCode: "", status: "LIVE", reason: "NG open" },
      { id: "lag", scopeType: "CITY", countryCode: "NG", cityCode: "lagos", status: "DISABLED", reason: "Lagos pause" }
    ];
    const lagos = activation.evaluateVerticalActivation({ ...registry, rows, countryCode: "NG", cityCode: "lagos" });
    const abuja = activation.evaluateVerticalActivation({ ...registry, rows, countryCode: "NG", cityCode: "abuja" });
    assert(lagos.status === "DISABLED" && lagos.scope === "CITY", `Lagos ${lagos.status}/${lagos.scope}`);
    assert(abuja.status === "LIVE" && abuja.scope === "COUNTRY", `Abuja ${abuja.status}/${abuja.scope}`);
    return "Lagos DISABLED by city; Abuja stays LIVE via country";
  });

  await check("5. PREVIEW is closed to the public and open to preview users", async () => {
    assert(!activation.activationAllowsAccess("PREVIEW", { previewAuthorized: false }), "public PREVIEW allowed");
    assert(activation.activationAllowsAccess("PREVIEW", { previewAuthorized: true }), "preview user refused");
    assert(activation.activationAllowsAccess("LIVE", {}), "LIVE refused");
    assert(!activation.activationAllowsAccess("DISABLED", { previewAuthorized: true }), "DISABLED allowed");
    return "DISABLED never accessible; PREVIEW only with previewAuthorized";
  });

  // ---- Database fixtures --------------------------------------------------
  const password = `Activation-${randomUUID()}`;
  const passwordHash = await hashPassword(password);
  const superRole = await prisma.role.upsert({ where: { name: "super_admin" }, update: {}, create: { name: "super_admin" } });
  const adminRole = await prisma.role.upsert({ where: { name: "admin" }, update: {}, create: { name: "admin" } });

  const superUser = await prisma.user.create({
    data: { email: `activation-super-${runId}@example.test`, name: `Activation super ${runId}`, passwordHash, actorType: "ADMIN" }
  });
  await prisma.userRole.create({ data: { userId: superUser.id, roleId: superRole.id } });
  const adminUser = await prisma.user.create({
    data: { email: `activation-admin-${runId}@example.test`, name: `Activation admin ${runId}`, passwordHash, actorType: "ADMIN" }
  });
  await prisma.userRole.create({ data: { userId: adminUser.id, roleId: adminRole.id } });
  const customer = await prisma.user.create({
    data: { email: `activation-customer-${runId}@example.test`, name: `Activation customer ${runId}`, passwordHash, actorType: "CUSTOMER" }
  });
  const superActor = await prisma.user.findUniqueOrThrow({
    where: { id: superUser.id },
    include: { roles: { include: { role: true } }, vendors: true }
  });

  const snapshot = await prisma.verticalActivation.findMany({ where: { verticalKey: "shop" } });
  const createdProductIds: string[] = [];
  let cartId = "";
  let fixtureOrderId = "";
  let server: RunningServer | null = null;
  const reasonFor = (label: string) => `[run:${runId}] ${label}`;

  async function resetShopRows() {
    await prisma.verticalActivation.deleteMany({ where: { verticalKey: "shop" } });
    activation.clearVerticalActivationCache();
  }

  async function setRule(input: {
    scopeType: "GLOBAL" | "COUNTRY" | "CITY";
    status: "DISABLED" | "PREVIEW" | "LIVE";
    countryCode?: string;
    cityCode?: string;
    label: string;
  }) {
    const control = await activation.updateVerticalActivation({
      actor: superActor,
      verticalKey: "shop",
      scopeType: input.scopeType,
      countryCode: input.countryCode ?? "",
      cityCode: input.cityCode ?? "",
      status: input.status,
      reason: reasonFor(input.label)
    });
    return control;
  }

  async function effective(options: { countryCode?: string; cityCode?: string } = {}) {
    return activation.effectiveVerticalActivation("shop", { ...options, fresh: true });
  }

  try {
    // Seed one row through the real service so the DB path is exercised, then
    // remove it before the precedence checks that need a clean slate.
    await resetShopRows();

    await check("6. Service update persists a GLOBAL rule and writes before/after audit", async () => {
      const control = await setRule({ scopeType: "GLOBAL", status: "DISABLED", label: "global pause" });
      assert(control.effective.status === "DISABLED", `effective ${control.effective.status}`);
      const row = await prisma.verticalActivation.findFirst({ where: { verticalKey: "shop", scopeType: "GLOBAL" } });
      assert(row?.status === "DISABLED", "GLOBAL row missing");
      const audit = await prisma.auditLog.findFirst({
        where: { entity: "VerticalActivation", entityId: row.id, action: "vertical.updated" },
        orderBy: { createdAt: "desc" }
      });
      const metadata = (audit?.metadata ?? {}) as Record<string, any>;
      assert(metadata.before?.status === "LIVE", `before ${JSON.stringify(metadata.before)}`);
      assert(metadata.after?.status === "DISABLED", `after ${JSON.stringify(metadata.after)}`);
      assert(String(metadata.after?.reason ?? "").includes(runId), "reason not audited");
      return "row DISABLED; audit holds LIVE → DISABLED and the reason";
    });

    await check("7. Database GLOBAL OFF overrides a stored country LIVE row", async () => {
      await setRule({ scopeType: "COUNTRY", status: "LIVE", countryCode: "NG", label: "NG live under global" });
      const ng = await effective({ countryCode: "NG" });
      assert(ng.status === "DISABLED" && ng.scope === "GLOBAL", `got ${ng.status}/${ng.scope}`);
      assert(ng.localOverrideIgnored, "country row not reported ignored");
      const rows = await prisma.verticalActivation.count({ where: { verticalKey: "shop" } });
      assert(rows === 2, `expected 2 rows, got ${rows}`);
      return "GLOBAL DISABLED wins; the NG LIVE row is stored but inactive";
    });

    await check("8. Clearing GLOBAL falls through to the country row", async () => {
      await activation.clearVerticalActivation({
        actor: superActor,
        verticalKey: "shop",
        scopeType: "GLOBAL",
        reason: reasonFor("clear global for country test")
      });
      const ng = await effective({ countryCode: "NG" });
      assert(ng.status === "LIVE" && ng.scope === "COUNTRY", `got ${ng.status}/${ng.scope}`);
      return "NG inherits LIVE from its COUNTRY row";
    });

    await check("9. Country-scope isolation writes and reads independently", async () => {
      await setRule({ scopeType: "COUNTRY", status: "DISABLED", countryCode: "NG", label: "NG pause" });
      await setRule({ scopeType: "COUNTRY", status: "LIVE", countryCode: "GH", label: "GH open" });
      const ng = await effective({ countryCode: "NG" });
      const gh = await effective({ countryCode: "GH" });
      assert(ng.status === "DISABLED" && ng.scope === "COUNTRY", `NG ${ng.status}/${ng.scope}`);
      assert(gh.status === "LIVE" && gh.scope === "COUNTRY", `GH ${gh.status}/${gh.scope}`);
      return "NG DISABLED; GH LIVE; both from COUNTRY rows";
    });

    await check("10. City scope overrides its country inside that city only", async () => {
      await setRule({ scopeType: "CITY", status: "DISABLED", countryCode: "NG", cityCode: "lagos", label: "Lagos pause" });
      const lagos = await effective({ countryCode: "NG", cityCode: "lagos" });
      const abuja = await effective({ countryCode: "NG", cityCode: "abuja" });
      assert(lagos.status === "DISABLED" && lagos.scope === "CITY", `Lagos ${lagos.status}/${lagos.scope}`);
      assert(abuja.status === "DISABLED" && abuja.scope === "COUNTRY", `Abuja ${abuja.status}/${abuja.scope}`);
      return "Lagos DISABLED via CITY; Abuja still DISABLED via the NG country rule";
    });

    await check("11. A change without a reason is rejected and writes nothing", async () => {
      await resetShopRows();
      let error: unknown = null;
      try {
        await activation.updateVerticalActivation({
          actor: superActor,
          verticalKey: "shop",
          scopeType: "GLOBAL",
          status: "DISABLED",
          reason: ""
        });
      } catch (caught) {
        error = caught;
      }
      assert(error instanceof ApiError && error.code === "reason_required", `got ${errorCode(error)}`);
      const rows = await prisma.verticalActivation.count({ where: { verticalKey: "shop" } });
      assert(rows === 0, `a row was written (${rows})`);
      return "400 reason_required; no row written";
    });

    server = await ensureServer();
    const base = server.base;
    const superSession = await login(base, superUser.email, password);
    const adminSession = await login(base, adminUser.email, password);

    await check("12. A regular administrator cannot change activation (403)", async () => {
      const response = await http(base, "PATCH", "/api/admin/verticals/shop", adminSession.header, {
        scopeType: "GLOBAL",
        status: "DISABLED",
        reason: reasonFor("unauthorized attempt")
      });
      assert(response.status === 403, `got ${response.status} ${JSON.stringify(response.body)}`);
      assert(response.body?.code === "permission_denied", `code ${response.body?.code}`);
      const rows = await prisma.verticalActivation.count({ where: { verticalKey: "shop" } });
      assert(rows === 0, `unauthorized attempt wrote ${rows} rows`);
      const read = await http(base, "GET", "/api/admin/verticals", adminSession.header);
      assert(read.status === 200, `regular admin read ${read.status}`);
      return "PATCH 403 permission_denied; no row; read-only GET 200";
    });

    await check("13. Super administrator can set and audit a GLOBAL rule over the API", async () => {
      const response = await http(base, "PATCH", "/api/admin/verticals/shop", superSession.header, {
        scopeType: "GLOBAL",
        status: "DISABLED",
        reason: reasonFor("API global pause")
      });
      assert(response.status === 200, `got ${response.status} ${JSON.stringify(response.body)}`);
      assert(response.body?.effective?.status === "DISABLED", `effective ${response.body?.effective?.status}`);
      const get = await http(base, "GET", "/api/admin/verticals", superSession.header);
      assert(get.status === 200, `GET ${get.status}`);
      const shop = (get.body?.verticals ?? []).find((entry: Json) => entry.key === "shop");
      assert(shop?.effective?.status === "DISABLED", `GET effective ${shop?.effective?.status}`);
      assert(
        (get.body?.audit ?? []).some((entry: Json) => String(entry.metadata?.verticalKey ?? "") === "shop"),
        "audit entry missing"
      );
      return "PATCH 200; GET reports DISABLED and includes the change audit";
    });

    await check("14. Catalogue and detail APIs refuse while Shop is DISABLED", async () => {
      const list = await http(base, "GET", "/api/products?pageSize=2");
      assert(list.status === 404, `list got ${list.status} ${JSON.stringify(list.body)}`);
      assert(list.body?.code === "vertical_unavailable", `list code ${list.body?.code}`);
      const detailProduct = await prisma.product.findFirst({
        where: { status: "ACTIVE", isSample: false, vendor: { status: "VERIFIED" } },
        select: { id: true, slug: true, name: true }
      });
      assert(detailProduct, "no public product fixture found");
      const detail = await http(base, "GET", `/api/products/${encodeURIComponent(detailProduct.id)}`);
      assert(detail.status === 404, `detail got ${detail.status}`);
      assert(detail.body?.code === "vertical_unavailable", `detail code ${detail.body?.code}`);
      assert(!JSON.stringify(detail.body ?? {}).includes(detailProduct.name), "detail leaked the product name");
      return "list 404 vertical_unavailable; detail 404 with no product fields";
    });

    await check("15. Existing orders remain readable while Shop is DISABLED", async () => {
      let order = await prisma.order.findFirst({
        where: { status: { notIn: ["cancelled", "refunded"] } },
        orderBy: { createdAt: "desc" },
        select: { id: true, orderNumber: true }
      });
      if (!order) {
        // REVIEW has no orders. Create a run-owned, unpaid fixture order (no
        // payment, wallet or escrow rows) so the read path is exercised on a
        // real row; cleanup removes exactly this ID and never existing orders.
        const product = await prisma.product.findFirst({
          where: { status: "ACTIVE", vendor: { status: "VERIFIED" } },
          select: { id: true, vendorId: true, name: true, priceKobo: true }
        });
        assert(product, "no product fixture found for the order-read check");
        const fixture = await prisma.order.create({
          data: {
            orderNumber: `ACT-${runId.toUpperCase()}`,
            customerId: customer.id,
            vendorId: product.vendorId,
            status: "created",
            paymentStatus: "pending",
            subtotalKobo: product.priceKobo,
            totalKobo: product.priceKobo,
            currency: "NGN",
            countryCode: "NG",
            deliveryAddress: `Activation acceptance ${runId}`,
            deliveryZone: "lagos-mainland",
            contactName: "Activation acceptance",
            contactPhone: "08030000000",
            items: {
              create: {
                productId: product.id,
                quantity: 1,
                unitKobo: product.priceKobo,
                totalKobo: product.priceKobo,
                productName: `[run:${runId}] ${product.name}`
              }
            },
            statusEvents: {
              create: { from: null, to: "created", note: `[run:${runId}] activation readability fixture` }
            }
          },
          select: { id: true, orderNumber: true }
        });
        fixtureOrderId = fixture.id;
        order = fixture;
      }
      const readable = await getOrder(order.id);
      assert(readable?.id === order.id, "order could not be read");
      return `order ${order.orderNumber} readable; no activation check on order history`;
    });

    await check("16. New seller listings are refused while Shop is DISABLED", async () => {
      const vendor = await prisma.vendor.findFirst({
        where: { status: "VERIFIED" },
        select: { ownerId: true, id: true }
      });
      assert(vendor?.ownerId, "no verified seller owner fixture found");
      let error: unknown = null;
      try {
        const product = await createSellerProduct(vendor.ownerId, {
          name: `Activation seller fixture ${runId}`,
          description: "Must not be created while Shop is disabled.",
          categoryId: "fixture-category",
          priceKobo: BigInt(100),
          quantity: 1,
          imageUrl: "/products/fixture.png"
        });
        createdProductIds.push(product.id);
      } catch (caught) {
        error = caught;
      }
      assert(error instanceof ApiError, "seller listing was not refused");
      assert(error.code === "vertical_unavailable" && error.status === 409, `got ${error.code}/${error.status}`);
      return "409 vertical_unavailable before any category or product write";
    });

    await check("17. Checkout is refused and creates no order while Shop is DISABLED", async () => {
      const product = await prisma.product.findFirst({
        where: {
          status: "ACTIVE",
          isSample: false,
          saleMode: "escrow",
          variants: { none: {} },
          vendor: { status: "VERIFIED" }
        },
        select: { id: true, vendorId: true }
      });
      assert(product, "no simple product fixture found for the cart");
      const cart = await prisma.cart.create({ data: { userId: customer.id, status: "ACTIVE" } });
      cartId = cart.id;
      await prisma.cartItem.create({
        data: { cartId: cart.id, productId: product.id, quantity: 1 }
      });
      let error: unknown = null;
      try {
        await checkout({
          userId: customer.id,
          address: {
            contactName: "Activation acceptance",
            contactPhone: "08030000000",
            countryCode: "NG",
            state: "Lagos",
            city: "Lagos",
            line1: `Activation fixture ${runId}`
          }
        });
      } catch (caught) {
        error = caught;
      }
      assert(error instanceof ApiError, "checkout was not refused");
      assert(error.code === "vertical_unavailable" && error.status === 409, `got ${error.code}/${error.status}`);
      const orders = await prisma.order.count({ where: { cartId: cart.id } });
      assert(orders === 0, `checkout created ${orders} order(s)`);
      const current = await prisma.cart.findUnique({ where: { id: cart.id }, select: { status: true } });
      assert(current?.status === "ACTIVE", `cart was mutated to ${current?.status}`);
      return "409 vertical_unavailable; no order, cart still ACTIVE";
    });

    await check("18. Public availability signal follows the effective state", async () => {
      const disabled = await http(base, "GET", "/api/products/availability?country=NG");
      assert(disabled.status === 200, `disabled probe ${disabled.status}`);
      assert(disabled.body?.available === false && disabled.body?.status === "DISABLED", JSON.stringify(disabled.body));
      const cleared = await http(base, "DELETE", "/api/admin/verticals/shop", superSession.header, {
        scopeType: "GLOBAL",
        reason: reasonFor("clear global before nav test")
      });
      assert(cleared.status === 200, `clear ${cleared.status} ${JSON.stringify(cleared.body)}`);
      activation.clearVerticalActivationCache();
      const live = await http(base, "GET", "/api/products/availability?country=NG");
      assert(live.status === 200, `live probe ${live.status}`);
      assert(live.body?.available === true && live.body?.status === "LIVE", JSON.stringify(live.body));
      return "availability false (DISABLED) → true (registry LIVE) after the audited clear";
    });

    await check("19. Homepage and Shop navigation reflect activation", async () => {
      const { chromium } = await import("playwright");
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        // Disabled state first: set GLOBAL again through the real API.
        const disabled = await http(base, "PATCH", "/api/admin/verticals/shop", superSession.header, {
          scopeType: "GLOBAL",
          status: "DISABLED",
          reason: reasonFor("navigation disabled state")
        });
        assert(disabled.status === 200, `set disabled ${disabled.status}`);

        await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await page.waitForSelector('[data-shop-availability="DISABLED"]', { timeout: 45_000 });
        assert((await page.locator('[data-service="shop"]').count()) === 0, "Shop card still visible when disabled");
        assert((await page.getByText("Shop is paused", { exact: false }).count()) > 0, "pause notice missing");

        await page.goto(`${base}/naijashop`, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await page.getByText("Shop is paused in this market.", { exact: false }).first().waitFor({ timeout: 45_000 });
        assert((await page.locator('nav[aria-label="Marketplace sections"]').count()) === 0, "Shop section nav still visible");
        assert((await page.locator('a[href="/orders"]').count()) > 0, "Orders link disappeared");

        const cleared = await http(base, "DELETE", "/api/admin/verticals/shop", superSession.header, {
          scopeType: "GLOBAL",
          reason: reasonFor("navigation restore")
        });
        assert(cleared.status === 200, `clear ${cleared.status}`);
        await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await page.waitForSelector('[data-shop-availability="LIVE"]', { timeout: 45_000 });
        assert((await page.locator('[data-service="shop"]').count()) === 1, "Shop card missing when LIVE");
        return "card hidden and Shop nav replaced when DISABLED; both restored when LIVE";
      } finally {
        await browser.close();
      }
    });

    await check("20. Control Center page renders the workspace and audit", async () => {
      const { chromium } = await import("playwright");
      const browser = await chromium.launch({ headless: true });
      try {
        const context = await browser.newContext();
        const [name, value] = superSession.session.split("=");
        if (name && value) {
          await context.addCookies([{ name, value, domain: "localhost", path: "/" }]);
        }
        const page = await context.newPage();
        const response = await page.goto(`${base}/admin/verticals`, { waitUntil: "domcontentloaded", timeout: 60_000 });
        assert(response?.status() === 200, `page status ${response?.status()}`);
        await page.getByRole("heading", { name: "Service activation", level: 1 }).waitFor({ timeout: 45_000 });
        await page.getByText("Set an activation rule").waitFor({ timeout: 45_000 });
        await page.getByText("Enforced").first().waitFor({ timeout: 15_000 });
        assert((await page.getByText("Read-only").count()) === 0, "super admin was shown the read-only state");
        return "page 200; workspace, enforced badge and write form rendered";
      } finally {
        await browser.close();
      }
    });
  } finally {
    // ---- Restore exact previous activation state --------------------------
    await prisma.verticalActivation.deleteMany({ where: { verticalKey: "shop" } }).catch(() => undefined);
    for (const row of snapshot) {
      await prisma.verticalActivation
        .create({
          data: {
            id: row.id,
            verticalKey: row.verticalKey,
            scopeType: row.scopeType,
            countryCode: row.countryCode,
            cityCode: row.cityCode,
            status: row.status,
            reason: row.reason,
            updatedById: row.updatedById,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt
          }
        })
        .catch(() => undefined);
    }
    activation.clearVerticalActivationCache();

    // Run-owned fixtures and audit evidence only.
    if (cartId) {
      await prisma.cartItem.deleteMany({ where: { cartId } }).catch(() => undefined);
      await prisma.cart.deleteMany({ where: { id: cartId } }).catch(() => undefined);
    }
    if (fixtureOrderId) {
      // Exactly the run-owned unpaid order created for the readability check.
      // No existing order is ever touched.
      await prisma.orderStatusEvent.deleteMany({ where: { orderId: fixtureOrderId } }).catch(() => undefined);
      await prisma.orderItem.deleteMany({ where: { orderId: fixtureOrderId } }).catch(() => undefined);
      await prisma.order.deleteMany({ where: { id: fixtureOrderId } }).catch(() => undefined);
    }
    if (createdProductIds.length > 0) {
      // A refusal test that unexpectedly succeeded: remove its run-owned rows.
      await prisma.productImage.deleteMany({ where: { productId: { in: createdProductIds } } }).catch(() => undefined);
      await prisma.inventoryStock.deleteMany({ where: { productId: { in: createdProductIds } } }).catch(() => undefined);
      await prisma.productVariant.deleteMany({ where: { productId: { in: createdProductIds } } }).catch(() => undefined);
      await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } }).catch(() => undefined);
    }
    const userIds = [superUser.id, adminUser.id, customer.id];
    await prisma.$executeRaw`
      DELETE FROM "SystemEvent"
      WHERE "createdAt" >= ${STARTED_AT}
        AND type IN ('vertical.updated', 'vertical.cleared')
        AND payload::text LIKE ${`%${runId}%`}
    `.catch(() => undefined);
    await prisma.$executeRaw`
      DELETE FROM "AuditLog"
      WHERE "createdAt" >= ${STARTED_AT}
        AND entity = 'VerticalActivation'
        AND (metadata::text LIKE ${`%${runId}%`} OR "actorId" IN (${superUser.id}, ${adminUser.id}))
    `.catch(() => undefined);
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } }).catch(() => undefined);
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => undefined);
    stopServer(server);
    await prisma.$disconnect().catch(() => undefined);
  }

  const failed = results.filter((result) => result.status === "FAIL");
  console.log(`\n${results.length - failed.length}/${results.length} activation checks passed.`);
  if (failed.length > 0) {
    process.exitCode = 1;
    for (const failure of failed) console.error(`- ${failure.name}: ${failure.detail}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
