/**
 * Service activation acceptance — Shop vertical.
 *
 * Covers:
 *   - the precedence matrix (most restrictive applicable rule wins; a local
 *     LIVE cannot loosen a stricter GLOBAL/PREVIEW/COUNTRY parent);
 *   - DB writes through the service with before/after audit;
 *   - super-admin-only `verticals:write` (regular admin receives 403);
 *   - NOT_WIRED verticals refuse new rules (configuration-only);
 *   - direct catalogue/detail/page refusal while Shop is DISABLED;
 *   - PREVIEW authorization from the shared server helper for pages, APIs and
 *     navigation, including public/API/page cache headers;
 *   - cart-add refusal while DISABLED/PREVIEW while cart viewing and existing
 *     items stay usable;
 *   - a run-owned unpaid order created through the real checkout API while
 *     LIVE, read/cancelled while Shop is DISABLED, then removed;
 *   - Control Center page rendering, audit visibility and NOT_WIRED controls.
 *
 * Safety:
 *   - refuses production names and requires a TEST or REVIEW database marker;
 *   - no payment, wallet, ledger or escrow row is created;
 *   - the run-owned order is created by `checkout()` and removed in cleanup;
 *   - fixtures are run-tagged and Shop activation rows are restored exactly;
 *   - the dev server uses an isolated `.next-*` build directory and free port.
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
import {
  buildShopActivationSnapshot,
  deleteShopActivationSnapshot,
  formatShopActivationSnapshotSummary,
  formatShopActivationRow,
  isRunOwnedReason,
  listShopActivationSnapshots,
  readShopActivationRows,
  readShopActivationSnapshot,
  restoreShopActivationSnapshot,
  shopActivationSnapshotPath,
  writeShopActivationSnapshot,
  type ShopActivationDatabase,
  type ShopActivationRestoreResult
} from "./lib/shop-activation-snapshot";
import {
  ReviewTestLeaseError,
  acquireReviewTestLease,
  describeReviewTestLease,
  formatReviewTestLeaseSummary,
  type ReviewTestLeaseHandle
} from "./lib/review-test-lease";

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

/**
 * The spawned dev server, tracked separately so an abnormal exit can stop it
 * even when the signal arrives before `ensureServer()` has returned.
 */
let activeServerChild: ChildProcess | null = null;

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
  activeServerChild = child;
  try {
    await waitForServer(base, child, logPath);
  } catch (error) {
    stopServer({ base, process: child, logPath });
    throw error;
  }
  return { base, process: child, logPath };
}

function stopServer(server: RunningServer | null) {
  const child = server?.process ?? activeServerChild;
  if (!child?.pid) return;
  activeServerChild = null;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      try {
        child.kill("SIGTERM");
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
): Promise<{ status: number; body: Json | null; headers: Headers; text: string }> {
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
  return {
    status: response.status,
    body: parsed as Json | null,
    headers: response.headers,
    text
  };
}

/** HTML GET without the JSON-oriented parsing. */
async function web(base: string, path: string, cookie = "") {
  const response = await fetch(`${base}${path}`, {
    headers: cookie ? { Cookie: cookie } : undefined,
    redirect: "manual"
  });
  const text = await response.text();
  return { status: response.status, headers: response.headers, text };
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

  // Serialise acceptance runs before reading the snapshot. The lease is
  // filesystem-only and never touches activation rows; snapshot restoration
  // remains the authority for any rule that this run writes.
  const acceptanceLease: ReviewTestLeaseHandle = acquireReviewTestLease({
    owner: "vertical-activation-tests",
    runId: `activation-${runId}`,
    purpose: `Shop activation acceptance on ${dbName} (${marker})`,
    database: dbName,
    classification: marker
  });
  console.log(`Review test lease: ${describeReviewTestLease(acceptanceLease.path)}`);
  if (acceptanceLease.takeover) {
    console.warn(
      `Review test lease takeover from an expired holder: ${formatReviewTestLeaseSummary(acceptanceLease.takeover)}`
    );
  }

  // Durable recovery: write the exact prior Shop activation rows before any
  // mutation. The in-memory copy alone is lost on SIGINT/SIGKILL, which is how
  // an interrupted run can leave a run-owned GLOBAL DISABLED rule behind.
  const activationDb = prisma as unknown as ShopActivationDatabase;
  const activationSnapshotPath = shopActivationSnapshotPath(runId);
  const priorShopRows = await readShopActivationRows(activationDb);
  const leftoverRunRows = priorShopRows.filter((row) => isRunOwnedReason(row.reason));
  assert(
    leftoverRunRows.length === 0,
    "Refusing to start: a previous activation run left run-owned row(s) behind. " +
      "Capturing them as prior state would restore the pause at the end of this run. Recover first:\n" +
      leftoverRunRows.map((row) => `  - ${formatShopActivationRow(row)}`).join("\n") +
      "\n  npx tsx scripts/recover-shop-activation.ts --expect-db=<db> --latest --apply " +
      "(or --discard-run-owned=<runId> --apply when no snapshot exists)."
  );
  const activationSnapshot = buildShopActivationSnapshot({ runId, database: dbName, rows: priorShopRows });
  writeShopActivationSnapshot(activationSnapshot, { path: activationSnapshotPath });
  console.log(
    `Activation snapshot: ${formatShopActivationSnapshotSummary(activationSnapshot)} -> ${activationSnapshotPath}`
  );
  const otherSnapshots = listShopActivationSnapshots().filter((entry) => entry.path !== activationSnapshotPath);
  if (otherSnapshots.length > 0) {
    console.warn(
      `WARNING: ${otherSnapshots.length} other activation snapshot(s) exist under qa-artifacts/activation-snapshots. ` +
        "If an earlier run was interrupted, restore it with scripts/recover-shop-activation.ts before assuming LIVE."
    );
  }

  // ---- Pure resolver matrix (no database dependency) ---------------------
  const registry = { verticalKey: "shop", registryStatus: "live" as const };
  const rule = (
    id: string,
    scopeType: "GLOBAL" | "COUNTRY" | "CITY",
    status: "DISABLED" | "PREVIEW" | "LIVE",
    countryCode = "",
    cityCode = ""
  ) => ({ id, scopeType, countryCode, cityCode, status, reason: `${id} reason` });

  await check("1. Registry status is the default when no activation rows exist", async () => {
    const effective = activation.evaluateVerticalActivation({ ...registry, rows: [] });
    assert(effective.status === "LIVE", `got ${effective.status}`);
    assert(effective.scope === "REGISTRY" && effective.source === "registry", `got ${effective.scope}/${effective.source}`);
    assert(effective.rules.length === 0, "rules should be empty");
    return "Shop defaults to LIVE from the live registry status";
  });

  await check("2. GLOBAL LIVE + country DISABLED -> country restriction wins", async () => {
    const effective = activation.evaluateVerticalActivation({
      ...registry,
      rows: [rule("g", "GLOBAL", "LIVE"), rule("c", "COUNTRY", "DISABLED", "NG")],
      countryCode: "NG"
    });
    assert(effective.status === "DISABLED", `got ${effective.status}`);
    assert(effective.scope === "COUNTRY", `got ${effective.scope}`);
    assert(effective.rowId === "c", `rowId ${effective.rowId}`);
    assert(!effective.localOverrideIgnored, "country restriction must not be labelled ignored");
    return "DISABLED via COUNTRY even though the GLOBAL rule is LIVE";
  });

  await check("3. GLOBAL DISABLED + country/city LIVE -> GLOBAL blocks everything", async () => {
    const effective = activation.evaluateVerticalActivation({
      ...registry,
      rows: [
        rule("g", "GLOBAL", "DISABLED"),
        rule("c", "COUNTRY", "LIVE", "NG"),
        rule("t", "CITY", "LIVE", "NG", "lagos")
      ],
      countryCode: "NG",
      cityCode: "lagos"
    });
    assert(effective.status === "DISABLED", `got ${effective.status}`);
    assert(effective.scope === "GLOBAL", `got ${effective.scope}`);
    assert(effective.globalOverrideActive, "globalOverrideActive was false");
    assert(effective.localOverrideIgnored, "localOverrideIgnored was false");
    assert(effective.rules.filter((entry) => entry.ignored).length === 2, "both local rules should be ignored");
    return "DISABLED via GLOBAL; country and city LIVE reported ignored";
  });

  await check("4. Country DISABLED + city LIVE -> city cannot bypass the country", async () => {
    const effective = activation.evaluateVerticalActivation({
      ...registry,
      rows: [rule("c", "COUNTRY", "DISABLED", "NG"), rule("t", "CITY", "LIVE", "NG", "lagos")],
      countryCode: "NG",
      cityCode: "lagos"
    });
    assert(effective.status === "DISABLED", `got ${effective.status}`);
    assert(effective.scope === "COUNTRY", `got ${effective.scope}`);
    assert(effective.rules.find((entry) => entry.id === "t")?.ignored, "city LIVE should be ignored");
    return "Lagos stays DISABLED via the country rule; the city LIVE row is ignored";
  });

  await check("5. GLOBAL PREVIEW + country LIVE -> public stays in preview", async () => {
    const effective = activation.evaluateVerticalActivation({
      ...registry,
      rows: [rule("g", "GLOBAL", "PREVIEW"), rule("c", "COUNTRY", "LIVE", "NG")],
      countryCode: "NG"
    });
    assert(effective.status === "PREVIEW", `got ${effective.status}`);
    assert(effective.scope === "GLOBAL", `got ${effective.scope}`);
    assert(effective.rules.find((entry) => entry.id === "c")?.ignored, "country LIVE should be ignored");
    return "NG remains PREVIEW; country LIVE cannot upgrade a GLOBAL PREVIEW";
  });

  await check("6. GLOBAL PREVIEW + country DISABLED -> country restriction wins", async () => {
    const effective = activation.evaluateVerticalActivation({
      ...registry,
      rows: [rule("g", "GLOBAL", "PREVIEW"), rule("c", "COUNTRY", "DISABLED", "NG")],
      countryCode: "NG"
    });
    assert(effective.status === "DISABLED", `got ${effective.status}`);
    assert(effective.scope === "COUNTRY", `got ${effective.scope}`);
    assert(!effective.globalOverrideActive, "GLOBAL PREVIEW is not the deciding rule");
    return "DISABLED via COUNTRY under a GLOBAL PREVIEW parent";
  });

  await check("7. GLOBAL DISABLED + city LIVE (no country row) -> GLOBAL blocks", async () => {
    const effective = activation.evaluateVerticalActivation({
      ...registry,
      rows: [rule("g", "GLOBAL", "DISABLED"), rule("t", "CITY", "LIVE", "NG", "lagos")],
      countryCode: "NG",
      cityCode: "lagos"
    });
    assert(effective.status === "DISABLED", `got ${effective.status}`);
    assert(effective.scope === "GLOBAL", `got ${effective.scope}`);
    assert(effective.rules.find((entry) => entry.id === "t")?.ignored, "city LIVE should be ignored");
    return "DISABLED via GLOBAL; the city LIVE row cannot reopen Lagos";
  });

  await check("8. GLOBAL LIVE + city DISABLED -> local pause applies in that city", async () => {
    const rows = [rule("g", "GLOBAL", "LIVE"), rule("t", "CITY", "DISABLED", "NG", "lagos")];
    const lagos = activation.evaluateVerticalActivation({ ...registry, rows, countryCode: "NG", cityCode: "lagos" });
    const abuja = activation.evaluateVerticalActivation({ ...registry, rows, countryCode: "NG", cityCode: "abuja" });
    assert(lagos.status === "DISABLED" && lagos.scope === "CITY", `Lagos ${lagos.status}/${lagos.scope}`);
    assert(abuja.status === "LIVE" && abuja.scope === "GLOBAL", `Abuja ${abuja.status}/${abuja.scope}`);
    return "Lagos DISABLED by CITY; Abuja stays LIVE via GLOBAL";
  });

  await check("9. Registry preview is preserved when no rule applies", async () => {
    const effective = activation.evaluateVerticalActivation({
      verticalKey: "shop",
      registryStatus: "preview",
      rows: [],
      countryCode: "NG"
    });
    assert(effective.status === "PREVIEW" && effective.source === "registry", `got ${effective.status}/${effective.source}`);
    return "Registry preview -> PREVIEW";
  });

  await check("10. Access semantics: DISABLED never, PREVIEW only for preview users, LIVE public", async () => {
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

  const createdProductIds: string[] = [];
  let fixtureOrderId = "";
  let fixtureOrderNumber = "";
  let fixtureProductId = "";
  let fixtureInitialReserved = 0;
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

  // ---- Durable snapshot restoration -------------------------------------
  // `performSnapshotRestore` is used by check 30 (and therefore throws on a
  // conflict). `restoreBestEffort` is the last-resort path for `finally` and
  // signals: it reports and retains the snapshot instead of hiding a conflict.
  async function performSnapshotRestore(reason: string): Promise<ShopActivationRestoreResult> {
    const snapshot = readShopActivationSnapshot(activationSnapshotPath);
    const result = await restoreShopActivationSnapshot({
      db: activationDb,
      snapshot,
      currentDatabase: dbName
    });
    activation.clearVerticalActivationCache();
    assert(result.verification.ok, "snapshot verification failed");
    console.log(
      `Activation snapshot restore (${reason}): ${result.restored} prior row(s), added ${result.added}, ` +
        `removed ${result.removed}, changed ${result.changedRows}.`
    );
    return result;
  }

  let bestEffortRestore: Promise<boolean> | null = null;
  function restoreBestEffort(reason: string): Promise<boolean> {
    if (!bestEffortRestore) {
      bestEffortRestore = (async () => {
        try {
          await performSnapshotRestore(reason);
          deleteShopActivationSnapshot(activationSnapshotPath);
          console.log(`Activation snapshot verified and removed: ${activationSnapshotPath}`);
          return true;
        } catch (error) {
          console.error(
            `WARNING: Shop activation was NOT restored from ${activationSnapshotPath}: ${
              error instanceof Error ? error.message : String(error)
            }\n` +
              "         The snapshot file is retained; run scripts/recover-shop-activation.ts after inspecting the conflict."
          );
          return false;
        }
      })();
    }
    return bestEffortRestore;
  }

  let signalHandled = false;
  function handleAbnormalExit(signal: string) {
    if (signalHandled) return;
    signalHandled = true;
    console.error(`\n${signal}: restoring Shop activation before exit.`);
    stopServer(server);
    void restoreBestEffort(`abnormal exit ${signal}`)
      .then(async (restored) => {
        const released = acceptanceLease.releaseSync();
        console.error(
          `Review test lease ${released ? "released" : "was not released; bounded expiry applies"}: ${acceptanceLease.path}`
        );
        if (!restored) {
          console.error("Shop activation restoration was not verified; the snapshot file is retained for recovery.");
        }
        await prisma.$disconnect().catch(() => undefined);
        process.exit(130);
      })
      .catch(() => process.exit(1));
  }
  const onSigint = () => handleAbnormalExit("SIGINT");
  const onSigterm = () => handleAbnormalExit("SIGTERM");
  const onSigbreak = () => handleAbnormalExit("SIGBREAK");
  const onUncaught = (error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    handleAbnormalExit("uncaughtException");
  };
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);
  if (process.platform === "win32") process.once("SIGBREAK", onSigbreak);
  process.once("uncaughtException", onUncaught);

  try {
    // Seed one row through the real service so the DB path is exercised, then
    // remove it before the precedence checks that need a clean slate.
    await resetShopRows();

    await check("11. Service update persists a GLOBAL rule and writes before/after audit", async () => {
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

    await check("12. Database GLOBAL DISABLED overrides a stored country LIVE row", async () => {
      await setRule({ scopeType: "COUNTRY", status: "LIVE", countryCode: "NG", label: "NG live under global" });
      const ng = await effective({ countryCode: "NG" });
      assert(ng.status === "DISABLED" && ng.scope === "GLOBAL", `got ${ng.status}/${ng.scope}`);
      assert(ng.localOverrideIgnored, "country row not reported ignored");
      const rows = await prisma.verticalActivation.count({ where: { verticalKey: "shop" } });
      assert(rows === 2, `expected 2 rows, got ${rows}`);
      return "GLOBAL DISABLED wins; the NG LIVE row is stored but ignored";
    });

    await check("13. Clearing GLOBAL falls through to the country rule", async () => {
      const cleared = await activation.clearVerticalActivation({
        actor: superActor,
        verticalKey: "shop",
        scopeType: "GLOBAL",
        reason: reasonFor("clear global for country test")
      });
      assert(cleared.effective.status === "LIVE", `control ${cleared.effective.status}`);
      const ng = await effective({ countryCode: "NG" });
      assert(ng.status === "LIVE" && ng.scope === "COUNTRY", `got ${ng.status}/${ng.scope}`);
      return "NG inherits LIVE from its COUNTRY row after the audited clear";
    });

    await check("14. Country-scope isolation writes and reads independently", async () => {
      await setRule({ scopeType: "COUNTRY", status: "DISABLED", countryCode: "NG", label: "NG pause" });
      await setRule({ scopeType: "COUNTRY", status: "LIVE", countryCode: "GH", label: "GH open" });
      const ng = await effective({ countryCode: "NG" });
      const gh = await effective({ countryCode: "GH" });
      const ke = await effective({ countryCode: "KE" });
      assert(ng.status === "DISABLED" && ng.scope === "COUNTRY", `NG ${ng.status}/${ng.scope}`);
      assert(gh.status === "LIVE" && gh.scope === "COUNTRY", `GH ${gh.status}/${gh.scope}`);
      assert(ke.status === "LIVE" && ke.scope === "REGISTRY", `KE ${ke.status}/${ke.scope}`);
      return "NG DISABLED, GH LIVE, KE inherits registry LIVE";
    });

    await check("15. City LIVE cannot bypass a DISABLED country", async () => {
      await setRule({ scopeType: "CITY", status: "LIVE", countryCode: "NG", cityCode: "lagos", label: "Lagos live attempt" });
      const lagos = await effective({ countryCode: "NG", cityCode: "lagos" });
      const cityRule = lagos.rules.find((entry) => entry.scopeType === "CITY");
      assert(lagos.status === "DISABLED" && lagos.scope === "COUNTRY", `got ${lagos.status}/${lagos.scope}`);
      assert(cityRule?.ignored === true, "city LIVE row not marked ignored");
      return "Lagos DISABLED via the NG country rule; city LIVE is ignored";
    });

    await check("16. A change without a reason is rejected and writes nothing", async () => {
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

    await check("17. A NOT_WIRED vertical refuses a new activation rule", async () => {
      let error: unknown = null;
      try {
        await activation.updateVerticalActivation({
          actor: superActor,
          verticalKey: "eats",
          scopeType: "GLOBAL",
          status: "DISABLED",
          reason: reasonFor("eats must stay configuration-only")
        });
      } catch (caught) {
        error = caught;
      }
      assert(error instanceof ApiError, "a rule was accepted for a NOT_WIRED vertical");
      assert(error.code === "vertical_not_enforced" && error.status === 409, `got ${error.code}/${error.status}`);
      const rows = await prisma.verticalActivation.count({ where: { verticalKey: "eats" } });
      assert(rows === 0, `NOT_WIRED row written (${rows})`);
      return "409 vertical_not_enforced; no row written";
    });

    server = await ensureServer();
    const base = server.base;
    const superSession = await login(base, superUser.email, password);
    const adminSession = await login(base, adminUser.email, password);
    const customerSession = await login(base, customer.email, password);

    async function controlSnapshot() {
      const response = await http(base, "GET", "/api/admin/verticals", superSession.header);
      assert(response.status === 200, `GET /api/admin/verticals -> ${response.status}`);
      const shop = (response.body?.verticals ?? []).find((entry: Json) => entry.key === "shop");
      assert(shop, "Shop control missing from snapshot");
      return { snapshot: response.body as Json, shop: shop as Json };
    }

    async function apiPatch(body: Json) {
      const response = await http(base, "PATCH", "/api/admin/verticals/shop", superSession.header, body);
      assert(response.status === 200, `PATCH ${JSON.stringify(body)} -> ${response.status} ${JSON.stringify(response.body)}`);
      return response;
    }

    async function apiClear(body: Json) {
      const response = await http(base, "DELETE", "/api/admin/verticals/shop", superSession.header, body);
      assert(response.status === 200, `DELETE ${JSON.stringify(body)} -> ${response.status} ${JSON.stringify(response.body)}`);
      return response;
    }

    async function availability(query = "", cookie = "") {
      const response = await http(base, "GET", `/api/products/availability${query}`, cookie);
      assert(response.status === 200, `availability -> ${response.status}`);
      return response.body as Json;
    }

    async function addCart(cookie: string, quantity = 1) {
      return http(base, "POST", "/api/cart/items", cookie, { productId: fixtureProductId, quantity });
    }

    await check("18. A regular administrator cannot change activation (403)", async () => {
      await resetShopRows();
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

    await check("19. LIVE checkout creates the run-owned unpaid order and a second active cart", async () => {
      const product = await prisma.product.findFirst({
        where: {
          status: "ACTIVE",
          isSample: false,
          saleMode: "escrow",
          variants: { none: {} },
          vendor: { status: "VERIFIED" },
          stock: { quantity: { gte: 3 } }
        },
        select: {
          id: true,
          name: true,
          countryCode: true,
          priceKobo: true,
          stock: { select: { reserved: true } }
        }
      });
      assert(product, "no suitable REVIEW product fixture found");
      fixtureProductId = product.id;
      fixtureInitialReserved = product.stock?.reserved ?? 0;

      const cart = await addCart(customerSession.header, 1);
      assert(cart.status === 201, `cart add -> ${cart.status} ${JSON.stringify(cart.body)}`);

      const placed = await http(base, "POST", "/api/checkout", customerSession.header, {
        address: {
          contactName: "Activation acceptance",
          contactPhone: "08030000000",
          countryCode: "NG",
          state: "Lagos",
          city: "Lagos",
          line1: `Activation fixture ${runId}`
        }
      });
      assert(placed.status === 201, `checkout -> ${placed.status} ${JSON.stringify(placed.body)}`);
      const order = (placed.body?.orders ?? [])[0];
      assert(order?.orderId, "checkout did not return an order");
      fixtureOrderId = order.orderId;
      fixtureOrderNumber = order.orderNumber;

      const readable = await getOrder(fixtureOrderId);
      assert(readable.customerId === customer.id, "fixture order belongs to another customer");
      assert(readable.paymentStatus === "pending", `unexpected payment status ${readable.paymentStatus}`);
      assert(readable.payments.length === 0, "unpaid fixture unexpectedly has a payment row");

      // A second ACTIVE cart gives the disabled-state read/update checks a real
      // cart to view. It is not checked out and holds no reservation.
      const second = await addCart(customerSession.header, 1);
      assert(second.status === 201, `second cart add -> ${second.status} ${JSON.stringify(second.body)}`);
      return `order ${fixtureOrderNumber} created by checkout (payment pending, no payment rows)`;
    });

    await check("20. Super administrator can set and audit a GLOBAL DISABLED rule over the API", async () => {
      const response = await apiPatch({ scopeType: "GLOBAL", status: "DISABLED", reason: reasonFor("API global pause") });
      assert(response.body?.effective?.status === "DISABLED", `effective ${response.body?.effective?.status}`);
      const { snapshot, shop } = await controlSnapshot();
      assert(shop.effective.status === "DISABLED", `GET effective ${shop.effective.status}`);
      assert(shop.effective.scope === "GLOBAL", `GET scope ${shop.effective.scope}`);
      const audit = (snapshot.audit ?? []).find(
        (entry: Json) => String(entry.metadata?.verticalKey ?? "") === "shop" && String(entry.metadata?.after?.status) === "DISABLED"
      );
      assert(audit, "audit entry missing");
      assert(String(audit.metadata?.after?.reason ?? "").includes(runId), "audit reason missing");
      return "PATCH 200; GET reports DISABLED/GLOBAL and the before/after audit";
    });

    await check("21. Catalogue, detail API and product page refuse while DISABLED without leaking", async () => {
      const list = await http(base, "GET", "/api/products?pageSize=2");
      assert(list.status === 404, `list got ${list.status} ${JSON.stringify(list.body)}`);
      assert(list.body?.code === "vertical_unavailable", `list code ${list.body?.code}`);
      assert((list.headers.get("cache-control") ?? "").includes("no-store"), "list cache header missing no-store");

      const detail = await http(base, "GET", `/api/products/${encodeURIComponent(fixtureProductId)}`);
      assert(detail.status === 404, `detail got ${detail.status}`);
      assert(detail.body?.code === "vertical_unavailable", `detail code ${detail.body?.code}`);
      assert((detail.headers.get("cache-control") ?? "").includes("no-store"), "detail cache header missing no-store");
      assert(!JSON.stringify(detail.body ?? {}).includes(fixtureOrderNumber), "detail leaked order data");

      const productRow = await prisma.product.findUniqueOrThrow({ where: { id: fixtureProductId }, select: { name: true } });
      const page = await web(base, `/product/${encodeURIComponent(fixtureProductId)}`);
      assert(page.status === 404, `page got ${page.status}`);
      assert(!page.text.includes(productRow.name), "page leaked the product name");
      const cache = page.headers.get("cache-control") ?? "";
      assert(/no-store|private/.test(cache), `page cache-control ${cache}`);
      return "list/detail 404 vertical_unavailable; page 404 without product content and a private/no-store header";
    });

    await check("22. Existing order, order history and support stay available while DISABLED", async () => {
      const list = await http(base, "GET", "/api/orders", customerSession.header);
      assert(list.status === 200, `orders list ${list.status}`);
      assert(JSON.stringify(list.body ?? {}).includes(fixtureOrderId), "fixture order missing from history");

      const detail = await http(base, "GET", `/api/orders/${fixtureOrderId}`, customerSession.header);
      assert(detail.status === 200, `order detail ${detail.status}`);
      assert(detail.body?.id === fixtureOrderId, "wrong order returned");
      assert(detail.body?.status === "payment_pending", `status ${detail.body?.status}`);

      const historyPage = await web(base, "/orders", customerSession.header);
      assert(historyPage.status === 200, `orders page ${historyPage.status}`);

      const orderPage = await web(base, `/orders/${fixtureOrderId}`, customerSession.header);
      assert(orderPage.status === 200, `order page ${orderPage.status}`);
      assert(orderPage.text.includes("Order details"), "order page title missing");

      const help = await web(base, "/naijashop/help");
      assert(help.status === 200, "support page unavailable");
      assert(help.text.includes("Help &amp; customer service") || help.text.includes("Help & customer service"), "support content missing");

      const cancelled = await http(base, "POST", `/api/orders/${fixtureOrderId}/cancel`, customerSession.header, {
        reason: `[run:${runId}] cancel while Shop is disabled`
      });
      assert(cancelled.status === 200, `cancel ${cancelled.status} ${JSON.stringify(cancelled.body)}`);
      assert(cancelled.body?.cancelled === true, "cancel response missing cancelled=true");
      const afterCancel = await http(base, "GET", `/api/orders/${fixtureOrderId}`, customerSession.header);
      assert(afterCancel.body?.status === "cancelled", `post-cancel status ${afterCancel.body?.status}`);
      return "order history, detail, order page, support and unpaid cancellation all work while DISABLED";
    });

    await check("23. Cart viewing/update stays available but new additions are refused while DISABLED", async () => {
      const cart = await http(base, "GET", "/api/cart", customerSession.header);
      assert(cart.status === 200, `cart GET ${cart.status}`);
      const items = (cart.body?.items ?? []) as Json[];
      assert(items.length === 1, `expected 1 active cart item, got ${items.length}`);
      const itemId = String(items[0].id);

      const changed = await http(base, "PATCH", `/api/cart/items/${itemId}`, customerSession.header, { quantity: 2 });
      assert(changed.status === 200, `cart PATCH ${changed.status} ${JSON.stringify(changed.body)}`);
      assert(changed.body?.items?.[0]?.quantity === 2, "quantity update not applied");

      const blocked = await addCart(customerSession.header, 1);
      assert(blocked.status === 409, `cart add while disabled -> ${blocked.status} ${JSON.stringify(blocked.body)}`);
      assert(blocked.body?.code === "vertical_unavailable", `cart add code ${blocked.body?.code}`);

      const after = await http(base, "GET", "/api/cart", customerSession.header);
      const afterItems = (after.body?.items ?? []) as Json[];
      assert(afterItems.length === 1 && afterItems[0].quantity === 2, "blocked add changed the cart");
      return "existing item readable/updatable; new addition 409; cart contents unchanged";
    });

    await check("24. PREVIEW closes public APIs/page and opens them for a Control Center user", async () => {
      await apiPatch({ scopeType: "GLOBAL", status: "PREVIEW", reason: reasonFor("global preview") });

      const publicList = await http(base, "GET", "/api/products?pageSize=2");
      assert(publicList.status === 404 && publicList.body?.code === "vertical_unavailable", `public list ${publicList.status}`);
      const publicDetail = await http(base, "GET", `/api/products/${fixtureProductId}`);
      assert(publicDetail.status === 404 && publicDetail.body?.code === "vertical_unavailable", `public detail ${publicDetail.status}`);

      const adminList = await http(base, "GET", "/api/products?pageSize=2", superSession.header);
      assert(adminList.status === 200, `admin list ${adminList.status}`);
      assert((adminList.headers.get("cache-control") ?? "").includes("no-store"), "admin list cache header missing no-store");
      const adminDetail = await http(base, "GET", `/api/products/${fixtureProductId}`, superSession.header);
      assert(adminDetail.status === 200, `admin detail ${adminDetail.status}`);
      assert((adminDetail.headers.get("cache-control") ?? "").includes("no-store"), "admin detail cache header missing no-store");

      const productRow = await prisma.product.findUniqueOrThrow({ where: { id: fixtureProductId }, select: { name: true } });

      const publicPage = await web(base, `/product/${fixtureProductId}`);
      assert(publicPage.status === 404, `public page ${publicPage.status}`);
      assert(!publicPage.text.includes(productRow.name), "public page leaked the product name");
      const publicCache = publicPage.headers.get("cache-control") ?? "";
      assert(/no-store|private/.test(publicCache), `public page cache-control ${publicCache}`);

      const adminPage = await web(base, `/product/${fixtureProductId}`, superSession.header);
      assert(adminPage.status === 200, `admin page ${adminPage.status}`);
      assert(adminPage.text.includes(productRow.name), "admin page did not render the product");
      const adminCache = adminPage.headers.get("cache-control") ?? "";
      assert(/no-store|private/.test(adminCache), `admin page cache-control ${adminCache}`);

      const publicProbe = await availability("?country=NG");
      assert(publicProbe.status === "PREVIEW" && publicProbe.available === false, `public probe ${JSON.stringify(publicProbe)}`);
      const adminProbe = await availability("?country=NG", superSession.header);
      assert(adminProbe.status === "PREVIEW" && adminProbe.available === true && adminProbe.preview === true, `admin probe ${JSON.stringify(adminProbe)}`);
      return "public 404/no content; authorized Control Center 200 with no-store/private; availability differs by session";
    });

    await check("25. PREVIEW cart-add: public refused, authorized preview user allowed", async () => {
      const blocked = await addCart(customerSession.header, 1);
      assert(blocked.status === 409, `public preview cart add -> ${blocked.status} ${JSON.stringify(blocked.body)}`);
      assert(blocked.body?.code === "vertical_unavailable", `code ${blocked.body?.code}`);

      const allowed = await addCart(superSession.header, 1);
      assert(allowed.status === 201, `preview cart add -> ${allowed.status} ${JSON.stringify(allowed.body)}`);
      assert((allowed.body?.items ?? []).length === 1, "preview cart add did not persist");
      return "public 409 vertical_unavailable; authorized preview user 201";
    });

    await check("26. Navigation reflects PREVIEW: public sees paused, authorized sees preview", async () => {
      const { chromium } = await import("playwright");
      const browser = await chromium.launch({ headless: true });
      try {
        // Service workers are unrelated to activation; a first-load controller
        // change can reload "/" and interrupt the next navigation.
        const publicContext = await browser.newContext({ serviceWorkers: "block" });
        const publicPage = await publicContext.newPage();
        await publicPage.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
        await publicPage.waitForSelector('[data-shop-availability="PREVIEW"]', { timeout: 60_000 });
        assert((await publicPage.locator('[data-service="shop"]').count()) === 0, "public Shop card still visible in PREVIEW");
        assert((await publicPage.getByText("Shop is paused", { exact: false }).count()) > 0, "public pause notice missing");
        await publicPage.goto(`${base}/naijashop`, { waitUntil: "domcontentloaded", timeout: 90_000 });
        await publicPage.getByText("Shop is paused in this market.", { exact: false }).first().waitFor({ timeout: 60_000 });
        assert((await publicPage.locator('nav[aria-label="Marketplace sections"]').count()) === 0, "public Shop section nav still visible");
        assert((await publicPage.locator('a[href="/orders"]').count()) > 0, "public Orders link disappeared");

        const context = await browser.newContext({ serviceWorkers: "block" });
        const [name, value] = superSession.session.split("=");
        if (name && value) await context.addCookies([{ name, value, domain: "localhost", path: "/" }]);
        const adminPage = await context.newPage();
        await adminPage.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
        await adminPage.getByText("Preview Shop", { exact: false }).first().waitFor({ timeout: 60_000 });
        assert((await adminPage.locator('[data-service="shop"]').count()) === 1, "admin Shop card missing in PREVIEW");
        await adminPage.getByText("Shop preview", { exact: false }).first().waitFor({ timeout: 60_000 });
        await adminPage.goto(`${base}/naijashop`, { waitUntil: "domcontentloaded", timeout: 90_000 });
        await adminPage.getByText("Preview mode: Shop is visible", { exact: false }).first().waitFor({ timeout: 60_000 });
        return "public: card removed + paused notice; admin: preview card + preview banner";
      } finally {
        await browser.close();
      }
    });

    await check("27. Country LIVE cannot loosen GLOBAL PREVIEW; city DISABLED restricts Lagos", async () => {
      await apiPatch({ scopeType: "COUNTRY", countryCode: "NG", status: "LIVE", reason: reasonFor("NG live under preview") });
      let { shop } = await controlSnapshot();
      const ng = (shop.countries as Json[]).find((entry) => entry.countryCode === "NG");
      assert(ng?.effective?.status === "PREVIEW", `NG ${ng?.effective?.status}`);
      const ignoredCountry = (ng?.effective?.rules as Json[] | undefined)?.find((entry) => entry.scopeType === "COUNTRY");
      assert(ignoredCountry?.ignored === true, "NG LIVE row not marked ignored");

      await apiPatch({ scopeType: "CITY", countryCode: "NG", cityCode: "lagos", status: "DISABLED", reason: reasonFor("Lagos pause") });
      ({ shop } = await controlSnapshot());
      const lagos = (shop.cities as Json[]).find((entry) => entry.countryCode === "NG" && entry.cityCode === "lagos");
      const abuja = (shop.cities as Json[]).find((entry) => entry.countryCode === "NG" && entry.cityCode === "abuja");
      assert(lagos?.effective?.status === "DISABLED" && lagos?.effective?.scope === "CITY", `Lagos ${lagos?.effective?.status}/${lagos?.effective?.scope}`);
      assert(abuja?.effective?.status === "PREVIEW" && abuja?.effective?.scope === "GLOBAL", `Abuja ${abuja?.effective?.status}/${abuja?.effective?.scope}`);

      const lagosProbe = await availability("?country=NG&city=Lagos", superSession.header);
      assert(lagosProbe.status === "DISABLED" && lagosProbe.available === false, `Lagos probe ${JSON.stringify(lagosProbe)}`);
      const abujaProbe = await availability("?country=NG&city=Abuja", superSession.header);
      assert(abujaProbe.status === "PREVIEW" && abujaProbe.available === true, `Abuja probe ${JSON.stringify(abujaProbe)}`);
      return "NG stays PREVIEW despite country LIVE; Lagos DISABLED; Abuja PREVIEW";
    });

    await check("28. Clearing GLOBAL opens the local rules; country DISABLED still caps city LIVE", async () => {
      await apiClear({ scopeType: "GLOBAL", reason: reasonFor("clear global for local matrix") });
      let { shop } = await controlSnapshot();
      assert(shop.effective.status === "LIVE" && shop.effective.scope === "REGISTRY", `control ${shop.effective.status}/${shop.effective.scope}`);

      const abujaLive = await availability("?country=NG&city=Abuja");
      assert(abujaLive.status === "LIVE" && abujaLive.available === true, `Abuja ${JSON.stringify(abujaLive)}`);
      const lagosDisabled = await availability("?country=NG&city=Lagos");
      assert(lagosDisabled.status === "DISABLED" && lagosDisabled.available === false, `Lagos ${JSON.stringify(lagosDisabled)}`);

      await apiPatch({ scopeType: "COUNTRY", countryCode: "NG", status: "DISABLED", reason: reasonFor("NG pause under local matrix") });
      await apiPatch({ scopeType: "CITY", countryCode: "NG", cityCode: "lagos", status: "LIVE", reason: reasonFor("Lagos live attempt under country pause") });
      ({ shop } = await controlSnapshot());
      const lagos = (shop.cities as Json[]).find((entry) => entry.countryCode === "NG" && entry.cityCode === "lagos");
      assert(lagos?.effective?.status === "DISABLED" && lagos?.effective?.scope === "COUNTRY", `Lagos ${lagos?.effective?.status}/${lagos?.effective?.scope}`);
      return "global off -> Abuja LIVE/Lagos DISABLED; country DISABLED + city LIVE remains DISABLED";
    });

    await check("29. Control Center renders enforced and configuration-only states", async () => {
      const { chromium } = await import("playwright");
      const browser = await chromium.launch({ headless: true });
      try {
        const context = await browser.newContext();
        const [name, value] = superSession.session.split("=");
        if (name && value) await context.addCookies([{ name, value, domain: "localhost", path: "/" }]);
        const page = await context.newPage();
        const response = await page.goto(`${base}/admin/verticals`, { waitUntil: "domcontentloaded", timeout: 90_000 });
        assert(response?.status() === 200, `page status ${response?.status()}`);
        await page.getByRole("heading", { name: "Service activation", level: 1 }).waitFor({ timeout: 60_000 });
        await page.getByText("Set an activation rule").waitFor({ timeout: 60_000 });
        await page.getByText("Enforced").first().waitFor({ timeout: 30_000 });

        await page.getByRole("button", { name: /Food/ }).first().click();
        await page.getByRole("heading", { name: /Configuration only/ }).waitFor({ timeout: 30_000 });
        assert((await page.getByText("Set an activation rule").count()) === 0, "NOT_WIRED service still renders the rule form");
        assert(
          (await page.getByText("does not consult service activation", { exact: false }).count()) > 0,
          "configuration-only explanation missing"
        );

        await page.getByRole("button", { name: /Shop/ }).first().click();
        await page.getByText("Set an activation rule").waitFor({ timeout: 30_000 });

        // At this point NG is DISABLED and Lagos is LIVE. Selecting the country
        // scope must name the responsible COUNTRY rule and mark the ignored
        // local LIVE attempt.
        await page.getByRole("radio", { name: /One country/ }).check();
        await page.getByText("Applicable rules (most restrictive decides)").waitFor({ timeout: 30_000 });
        await page.getByText("Decides", { exact: true }).first().waitFor({ timeout: 30_000 });
        await page.getByText("Nigeria", { exact: true }).first().waitFor({ timeout: 30_000 });
        return "shop form available; Food configuration-only; country rule shown as the responsible Decides rule";
      } finally {
        await browser.close();
      }
    });

    await check("30. Restoring the exact previous activation snapshot", async () => {
      // The helper restores from the run-owned file written before the first
      // mutation. It removes all Shop rows (the prior snapshot is authoritative
      // for this run) and re-inserts the exact ids, statuses, reasons and
      // timestamps. Rows not owned by this run would block instead of being
      // silently cleared.
      const restored = await performSnapshotRestore("check 30");
      const expected = await effective({ countryCode: "NG" });
      const deadline = Date.now() + 15_000;
      let live = await availability("?country=NG");
      while (live.status !== expected.status && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        live = await availability("?country=NG");
      }
      assert(live.status === expected.status, `after restore expected ${expected.status}, got ${JSON.stringify(live)}`);
      assert(
        live.available === activation.activationAllowsAccess(expected.status, {}),
        `restored availability ${live.available} does not match ${expected.status}`
      );
      return `restored ${restored.restored} prior row(s) from the run snapshot; effective ${expected.status}`;
    });
  } finally {
    // ---- Restore exact previous activation state --------------------------
    // The snapshot file is the authority. It is removed only after the helper
    // verified every row (id, scope, status, reason and timestamps) against
    // the snapshot; a conflict retains the file for explicit recovery.
    await restoreBestEffort("finally");

    // Run-owned order fixture. Cancellation normally released the reservation;
    // if a test failed before cancelling, release exactly this order's units
    // before deleting the row. No payment/wallet/escrow row was ever created.
    if (fixtureOrderId) {
      const order = await prisma.order
        .findUnique({
          where: { id: fixtureOrderId },
          include: {
            items: true,
            payments: true,
            escrowHolds: true,
            deliveries: true,
            disputes: true,
            refunds: true,
            returnRequests: true,
            reviews: true,
            walletTxs: true
          }
        })
        .catch(() => null);
      if (order) {
        const financialRows =
          order.payments.length + order.escrowHolds.length + order.deliveries.length + order.disputes.length +
          order.refunds.length + order.returnRequests.length + order.reviews.length + order.walletTxs.length;
        if (financialRows > 0) {
          console.error(`WARNING: fixture order ${fixtureOrderId} unexpectedly has financial rows; leaving it for review.`);
        } else {
          if (order.status !== "cancelled") {
            for (const item of order.items) {
              if (item.variantId) {
                await prisma.$executeRaw`
                  UPDATE "ProductVariant" SET reserved = GREATEST(reserved - ${item.quantity}, 0)
                  WHERE id = ${item.variantId}
                `.catch(() => undefined);
              } else {
                await prisma.$executeRaw`
                  UPDATE "InventoryStock" SET reserved = GREATEST(reserved - ${item.quantity}, 0)
                  WHERE "productId" = ${item.productId}
                `.catch(() => undefined);
              }
            }
          }
          await prisma.orderStatusEvent.deleteMany({ where: { orderId: fixtureOrderId } }).catch(() => undefined);
          await prisma.orderItem.deleteMany({ where: { orderId: fixtureOrderId } }).catch(() => undefined);
          await prisma.orderAttribution.deleteMany({ where: { orderId: fixtureOrderId } }).catch(() => undefined);
          await prisma.auditLog.deleteMany({ where: { entity: "Order", entityId: fixtureOrderId } }).catch(() => undefined);
          await prisma.systemEvent.deleteMany({ where: { entity: "Order", entityId: fixtureOrderId } }).catch(() => undefined);
          await prisma.order.deleteMany({ where: { id: fixtureOrderId } }).catch(() => undefined);
        }
      }
    }

    // All run-owned carts (the checked-out cart and the second active cart).
    const runCarts = await prisma.cart
      .findMany({ where: { userId: { in: [customer.id, superUser.id, adminUser.id] } }, select: { id: true } })
      .catch(() => []);
    for (const cart of runCarts) {
      await prisma.cartItem.deleteMany({ where: { cartId: cart.id } }).catch(() => undefined);
      await prisma.cart.deleteMany({ where: { id: cart.id } }).catch(() => undefined);
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

    // Verify the fixture did not leave stock or order residue behind.
    if (fixtureProductId) {
      const stock = await prisma.inventoryStock
        .findUnique({ where: { productId: fixtureProductId }, select: { reserved: true } })
        .catch(() => null);
      if (stock && stock.reserved !== fixtureInitialReserved) {
        console.error(
          `WARNING: reserved stock for ${fixtureProductId} is ${stock.reserved}, expected ${fixtureInitialReserved}.`
        );
      }
    }
    const runOrderCount = await prisma.order
      .count({ where: { customerId: customer.id } })
      .catch(() => 0);
    const runEatsRows = await prisma.verticalActivation
      .count({ where: { verticalKey: "eats" } })
      .catch(() => 0);
    if (runOrderCount > 0) console.error(`WARNING: ${runOrderCount} run-owned order(s) remain.`);
    if (runEatsRows > 0) console.error(`WARNING: ${runEatsRows} NOT_WIRED activation row(s) remain.`);

    const leaseReleased = acceptanceLease.releaseSync();
    if (!leaseReleased) {
      console.error(
        `WARNING: the review test lease was not released: ${describeReviewTestLease(acceptanceLease.path)}`
      );
    } else {
      console.log(`Review test lease released: ${acceptanceLease.path}`);
    }

    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
    if (process.platform === "win32") process.off("SIGBREAK", onSigbreak);
    process.off("uncaughtException", onUncaught);
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
  if (error instanceof ReviewTestLeaseError) {
    console.error(`REFUSED ${error.message}`);
    process.exitCode = 2;
    return;
  }
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
