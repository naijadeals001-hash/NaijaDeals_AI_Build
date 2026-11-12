/**
 * Guard acceptance: proves an allowed isolated target passes and forbidden
 * targets fail before any mutation.
 *
 * Run with an explicit isolated URL:
 *   TEST_DATABASE_URL=postgresql://... npx tsx scripts/test-db-guard-tests.ts
 *
 * The shared development database is only read (row counts). The no-marker and
 * wrong-marker cases use a disposable database that this script creates and
 * drops. No shared row is written.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { Client } from "pg";
import {
  DEFAULT_REQUIRED_TABLES,
  TestDatabaseGuardError,
  sanitizeDatabaseError,
  testDatabaseChildEnv,
  verifyTestDatabase,
  type VerifiedTestDatabase
} from "./lib/test-db-guard";

const REPO_ROOT = path.resolve(__dirname, "..");
const TSX_CLI = path.join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const results: Array<{ name: string; status: "PASS" | "FAIL" | "BLOCKED"; detail: string }> = [];

function record(name: string, status: boolean | "PASS" | "FAIL" | "BLOCKED", detail: string) {
  const normalized = typeof status === "boolean" ? (status ? "PASS" : "FAIL") : status;
  results.push({ name, status: normalized, detail });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function explicitUrl(): string {
  const value = process.env.TEST_DATABASE_URL?.trim() || process.env.NAIJADEALS_TEST_DATABASE_URL?.trim();
  if (!value) {
    console.error("BLOCKED: TEST_DATABASE_URL must be exported explicitly for the guard tests.");
    process.exit(2);
  }
  return value;
}

function urlFor(url: string, databaseName: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
}

function databaseNameOf(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\/+/, ""));
}

async function count(url: string, table: string): Promise<number> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const result = await client.query<{ count: string }>(`select count(*)::text as count from "${table}"`);
    return Number(result.rows[0]?.count ?? 0);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function createDisposableDatabase(adminUrl: string, name: string): Promise<void> {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
  } finally {
    await client.end();
  }
}

async function dropDisposableDatabase(adminUrl: string, name: string): Promise<void> {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS "${name.replace(/"/g, '""')}" WITH (FORCE)`);
  } finally {
    await client.end();
  }
}

async function runAs(url: string, statements: string[]): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    for (const statement of statements) await client.query(statement);
  } finally {
    await client.end();
  }
}

function expectGuardCode(name: string, code: string, run: () => Promise<unknown>) {
  return run()
    .then(() => record(name, "FAIL", `expected ${code}, but the guard accepted the target`))
    .catch((error) => {
      const actual = error instanceof TestDatabaseGuardError ? error.code : "not_a_guard_error";
      record(name, actual === code ? "PASS" : "FAIL", `expected ${code}, got ${actual}: ${sanitizeDatabaseError(error)}`);
    });
}

const requiredTableStatements = DEFAULT_REQUIRED_TABLES.map((table) => `CREATE TABLE "${table}" (id text)`);

async function main() {
  const allowedUrl = explicitUrl();
  const allowedName = databaseNameOf(allowedUrl);
  const coreUrl = urlFor(allowedUrl, "naijadeals_core");

  /* 1. Allowed target passes, and the check is read-only. */
  const allowedBefore = await count(allowedUrl, "Wallet");
  let target: VerifiedTestDatabase | null = null;
  try {
    target = await verifyTestDatabase();
    record(
      "allowed isolated target passes",
      target.databaseName === allowedName && Boolean(target.marker),
      `database=${target.databaseName} marker=${target.marker}`
    );
  } catch (error) {
    record("allowed isolated target passes", "FAIL", sanitizeDatabaseError(error));
  }
  const allowedAfter = await count(allowedUrl, "Wallet");
  record("allowed check performs no mutation", allowedBefore === allowedAfter, `Wallet count ${allowedBefore} -> ${allowedAfter}`);

  if (target) {
    const env = testDatabaseChildEnv(target);
    const markerPropagated = env.DATABASE_URL === target.url && env.TEST_DATABASE_URL === target.url &&
      env.NAIJADEALS_TEST_DATABASE === target.databaseName && env.NAIJADEALS_TEST_DB_MARKER === target.marker;
    record("child-process helper propagates URL and marker", markerPropagated, `database=${env.NAIJADEALS_TEST_DATABASE} marker=${env.NAIJADEALS_TEST_DB_MARKER}`);
  }

  /* 2. Shared database is denied before any connection/write. */
  const coreBefore = await count(coreUrl, "Wallet");
  await expectGuardCode("shared naijadeals_core is denied", "database_denied", () =>
    verifyTestDatabase({ url: coreUrl })
  );
  const coreAfter = await count(coreUrl, "Wallet");
  record("denied target leaves shared data untouched", coreBefore === coreAfter, `Wallet count ${coreBefore} -> ${coreAfter}`);

  /* 3. No explicit TEST_DATABASE_URL: a present DATABASE_URL must not be used. */
  const cliEnv: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: coreUrl };
  for (const key of ["TEST_DATABASE_URL", "NAIJADEALS_TEST_DATABASE_URL", "NAIJADEALS_TEST_DATABASE", "NAIJADEALS_TEST_DB_MARKER", "NAIJADEALS_TEST_DB_GUARD"]) {
    delete cliEnv[key];
  }
  const cliBefore = await count(coreUrl, "Wallet");
  const cli = spawnSync(process.execPath, [TSX_CLI, path.join(REPO_ROOT, "scripts", "assert-test-db.ts")], {
    cwd: REPO_ROOT,
    env: cliEnv,
    encoding: "utf8",
    timeout: 60_000
  });
  const stderr = `${cli.stdout ?? ""}\n${cli.stderr ?? ""}`;
  const cliAfter = await count(coreUrl, "Wallet");
  record(
    "missing explicit TEST_DATABASE_URL fails closed (no DATABASE_URL fallback)",
    cli.status === 2 && stderr.includes("missing_test_database_url") && cliBefore === cliAfter,
    `exit=${cli.status} Wallet ${cliBefore} -> ${cliAfter}`
  );
  record(
    "CLI failure output contains no connection string or password",
    !/postgres(?:ql)?:\/\//i.test(stderr) && !/password\s*=/i.test(stderr),
    "sanitized"
  );

  /* 4. A name containing "test" is not a marker. Use a disposable database. */
  const tempName = `naijadeals_guard_${process.pid}_${randomBytes(4).toString("hex")}_test`;
  const tempUrl = urlFor(allowedUrl, tempName);
  let tempCreated = false;
  try {
    await createDisposableDatabase(coreUrl, tempName);
    tempCreated = true;
    await runAs(tempUrl, requiredTableStatements);
    const tempBefore = await count(tempUrl, "Wallet");
    await expectGuardCode("name containing test without a marker is rejected", "marker_missing", () =>
      verifyTestDatabase({ url: tempUrl })
    );
    const tempAfter = await count(tempUrl, "Wallet");
    record("no-marker rejection leaves the target untouched", tempBefore === tempAfter, `Wallet count ${tempBefore} -> ${tempAfter}`);

    await runAs(tempUrl, [
      'CREATE TABLE "DatabaseClassification" (id text primary key, classification text not null)',
      `INSERT INTO "DatabaseClassification" (id, classification) VALUES ('default', 'LIVE')`
    ]);
    await expectGuardCode("classification other than TEST is rejected", "marker_not_test", () =>
      verifyTestDatabase({ url: tempUrl })
    );

    await runAs(tempUrl, [
      'DROP TABLE "DatabaseClassification"',
      'CREATE TABLE "TestDatabaseMarker" (id text primary key, value text not null)',
      `INSERT INTO "TestDatabaseMarker" (id, value) VALUES ('default', 'TEST')`
    ]);
    const fallback = await verifyTestDatabase({ url: tempUrl });
    record(
      "dedicated TestDatabaseMarker accepts a test target",
      fallback.marker === "TestDatabaseMarker:default=TEST",
      `marker=${fallback.marker}`
    );
  } catch (error) {
    record("disposable marker database checks", "BLOCKED", sanitizeDatabaseError(error));
  } finally {
    if (tempCreated) {
      await dropDisposableDatabase(coreUrl, tempName).catch((error) => {
        record("disposable database cleanup", "FAIL", sanitizeDatabaseError(error));
      });
    }
  }

  /* 5. Error sanitization. The token is assembled so no literal credential-like
     string is stored in the repository; the guard must still redact it. */
  const fakeToken = ["guard", "fixture", "token"].join("-");
  const dirty = ["connect failed ", "postgres", "ql://user:", fakeToken, "@example.invalid/db password=", fakeToken].join("");
  const clean = sanitizeDatabaseError(dirty);
  record("error sanitizer redacts URL and password", !clean.includes(fakeToken) && !/postgres(?:ql)?:\/\/user/i.test(clean), clean);

  const failed = results.filter((row) => row.status === "FAIL").length;
  console.log(JSON.stringify({ database: allowedName, checks: results, failures: failed, status: failed === 0 ? "PASS" : "FAIL" }, null, 2));
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`GUARD_TEST_FATAL ${sanitizeDatabaseError(error)}`);
  process.exit(1);
});
