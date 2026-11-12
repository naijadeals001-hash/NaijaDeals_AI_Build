import { Client } from "pg";

/**
 * Fail-closed guard for scripts and workers that mutate financial data.
 *
 * Rules:
 *  - The target must be named explicitly by TEST_DATABASE_URL (or
 *    NAIJADEALS_TEST_DATABASE_URL). DATABASE_URL from `.env` is never a fallback.
 *  - The connection's actual `current_database()` must match the URL.
 *  - The database name must not appear in the deny list (shared/production names).
 *  - The expected schema must exist.
 *  - An explicit database marker must say TEST. A database whose name merely
 *    contains "test" is not enough.
 *
 * Failures never print the connection string. Call `requireTestDatabase()` at
 * the start of a script's async entrypoint, before its first query. On success
 * it points DATABASE_URL at the verified target so Prisma and spawned workers
 * stay isolated; `testDatabaseChildEnv()` propagates the same URL and marker to
 * child processes.
 */

export class TestDatabaseGuardError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "TestDatabaseGuardError";
    this.code = code;
  }
}

export type VerifiedTestDatabase = {
  databaseName: string;
  /** Connection string. Never log this value. */
  url: string;
  marker: string;
  requiredTables: string[];
};

export type TestDatabaseGuardOptions = {
  /** Explicit URL for lower-level checks. Omit to read the required env var. */
  url?: string;
  /** Additional database names to reject, case-insensitive. */
  denyList?: string[];
  /** Tables that must exist before a script may mutate financial data. */
  requiredTables?: string[];
  connectionTimeoutMs?: number;
};

const ENV_NAMES = ["TEST_DATABASE_URL", "NAIJADEALS_TEST_DATABASE_URL"] as const;

export const DEFAULT_DENY_LIST = [
  "naijadeals_core",
  "naijadeals_prod",
  "naijadeals_production",
  "naijadeals_live",
  "naijadeals_shared",
  "postgres",
  "template0",
  "template1"
] as const;

export const DEFAULT_REQUIRED_TABLES = [
  "Order",
  "Payment",
  "Refund",
  "Wallet",
  "WalletTransaction",
  "LedgerEntry",
  "EscrowHold"
] as const;

/** Remove anything that could be a connection string or password from an error. */
export function sanitizeDatabaseError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "postgresql://[redacted]")
    .replace(/\b(password|passwd|pwd)\s*=\s*[^;\s"'`]+/gi, "$1=[redacted]")
    .slice(0, 600);
}

function readExplicitTestUrl(env: NodeJS.ProcessEnv): string {
  for (const name of ENV_NAMES) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  throw new TestDatabaseGuardError(
    "missing_test_database_url",
    `Refusing to run: ${ENV_NAMES.join(" or ")} must be set explicitly. DATABASE_URL is never used as a fallback.`
  );
}

function parseTarget(url: string): { databaseName: string; protocol: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new TestDatabaseGuardError("invalid_test_database_url", "TEST_DATABASE_URL is not a valid URL (value hidden).");
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new TestDatabaseGuardError("invalid_test_database_url", "TEST_DATABASE_URL must use the postgresql: protocol.");
  }
  let databaseName: string;
  try {
    databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  } catch {
    throw new TestDatabaseGuardError("invalid_test_database_url", "TEST_DATABASE_URL has an invalid database path (value hidden).");
  }
  if (!databaseName || databaseName.includes("/")) {
    throw new TestDatabaseGuardError("invalid_test_database_url", "TEST_DATABASE_URL must name exactly one database.");
  }
  return { databaseName, protocol: parsed.protocol };
}

function denyListFor(options: TestDatabaseGuardOptions): string[] {
  const fromEnv = (process.env.TEST_DB_GUARD_DENYLIST ?? "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  return [...DEFAULT_DENY_LIST, ...(options.denyList ?? []), ...fromEnv].map((name) => name.toLowerCase());
}

function assertNotDenied(databaseName: string, denyList: string[]): void {
  if (denyList.includes(databaseName.toLowerCase())) {
    throw new TestDatabaseGuardError(
      "database_denied",
      `Refusing to run against denied database "${databaseName}". Set TEST_DATABASE_URL to a disposable isolated database.`
    );
  }
}

async function checkMarker(client: Client): Promise<string> {
  const tables = await client.query<{ classification_table: string | null; marker_table: string | null }>(
    `select to_regclass('public."DatabaseClassification"')::text as classification_table,
            to_regclass('public."TestDatabaseMarker"')::text as marker_table`
  );
  const { classification_table: classificationTable, marker_table: markerTable } = tables.rows[0];

  if (classificationTable) {
    const rows = await client.query<{ id: string; classification: string }>(
      'select id, classification from "DatabaseClassification" order by id'
    );
    const canonical = rows.rows.find((row) => row.id === "default" && row.classification === "TEST");
    if (canonical) return "DatabaseClassification:default=TEST";
    const testRow = rows.rows.find((row) => row.classification === "TEST");
    if (testRow) {
      throw new TestDatabaseGuardError(
        "marker_not_canonical",
        'Refusing to run: DatabaseClassification has a TEST row but no canonical id="default" TEST row.'
      );
    }
    throw new TestDatabaseGuardError(
      "marker_not_test",
      'Refusing to run: DatabaseClassification exists but does not classify the database as TEST.'
    );
  }

  if (markerTable) {
    const rows = await client.query<{ id: string; value: string }>(
      'select id, value from "TestDatabaseMarker" order by id'
    );
    if (rows.rows.some((row) => row.id === "default" && row.value === "TEST")) {
      return "TestDatabaseMarker:default=TEST";
    }
    throw new TestDatabaseGuardError(
      "marker_not_test",
      'Refusing to run: TestDatabaseMarker exists but has no id="default"/value="TEST" row.'
    );
  }

  throw new TestDatabaseGuardError(
    "marker_missing",
    "Refusing to run: the target has no TEST marker (DatabaseClassification or TestDatabaseMarker)."
  );
}

/**
 * Verify a database without changing process.env. Used by the guard tests and
 * by requireTestDatabase(). The URL must be passed explicitly or supplied by
 * TEST_DATABASE_URL / NAIJADEALS_TEST_DATABASE_URL.
 */
export async function verifyTestDatabase(options: TestDatabaseGuardOptions = {}): Promise<VerifiedTestDatabase> {
  const url = options.url ?? readExplicitTestUrl(process.env);
  const { databaseName } = parseTarget(url);
  const denyList = denyListFor(options);
  assertNotDenied(databaseName, denyList);

  const requiredTables = [...(options.requiredTables ?? DEFAULT_REQUIRED_TABLES)];
  const client = new Client({
    connectionString: url,
    application_name: "naijadeals-test-db-guard",
    connectionTimeoutMillis: options.connectionTimeoutMs ?? 10_000,
    statement_timeout: 15_000
  });

  try {
    await client.connect();
  } catch (error) {
    const code = (error as { code?: string }).code ?? "connection_error";
    throw new TestDatabaseGuardError(
      "database_connect_failed",
      `Could not connect to the test database (${code}). The URL was not printed.`
    );
  }

  try {
    const identity = await client.query<{ database: string }>("select current_database() as database");
    const actual = identity.rows[0]?.database;
    if (actual !== databaseName) {
      throw new TestDatabaseGuardError(
        "database_identity_mismatch",
        `Connected database "${actual ?? "unknown"}" does not match TEST_DATABASE_URL target "${databaseName}".`
      );
    }
    assertNotDenied(actual, denyList);

    const present = await client.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1::text[])",
      [requiredTables]
    );
    const presentNames = new Set(present.rows.map((row) => row.table_name));
    const missing = requiredTables.filter((name) => !presentNames.has(name));
    if (missing.length > 0) {
      throw new TestDatabaseGuardError(
        "schema_missing",
        `Refusing to run: required financial tables are missing (${missing.join(", ")}).`
      );
    }

    const marker = await checkMarker(client);
    return { databaseName: actual, url, marker, requiredTables };
  } catch (error) {
    if (error instanceof TestDatabaseGuardError) throw error;
    throw new TestDatabaseGuardError(
      "guard_query_failed",
      `Test database verification failed (${(error as { code?: string }).code ?? "query_error"}). The URL was not printed.`
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}

/**
 * Verify the explicit test target and point this process at it.
 *
 * Call this at the start of the async entrypoint, before any query or mutation.
 * It sets DATABASE_URL to the verified URL so Prisma (whose datasource is
 * env("DATABASE_URL")) and child processes use the same isolated database.
 */
export async function requireTestDatabase(options: TestDatabaseGuardOptions = {}): Promise<VerifiedTestDatabase> {
  const target = await verifyTestDatabase(options);
  process.env.DATABASE_URL = target.url;
  process.env.TEST_DATABASE_URL = target.url;
  process.env.NAIJADEALS_TEST_DATABASE = target.databaseName;
  process.env.NAIJADEALS_TEST_DB_MARKER = target.marker;
  process.env.NAIJADEALS_TEST_DB_GUARD = "1";
  return target;
}

/**
 * Environment for a child worker. Propagates the verified URL and the marker
 * so the worker cannot silently reconnect to a shared database.
 */
export function testDatabaseChildEnv(
  target: string | VerifiedTestDatabase,
  base: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const url = typeof target === "string" ? target : target.url;
  const databaseName = typeof target === "string" ? parseTarget(target).databaseName : target.databaseName;
  const marker = typeof target === "string" ? base.NAIJADEALS_TEST_DB_MARKER : target.marker;
  if (!marker) {
    throw new TestDatabaseGuardError(
      "marker_missing",
      "Refusing to spawn a worker without a verified test-database marker."
    );
  }
  return {
    ...base,
    DATABASE_URL: url,
    TEST_DATABASE_URL: url,
    NAIJADEALS_TEST_DATABASE: databaseName,
    NAIJADEALS_TEST_DB_MARKER: marker,
    NAIJADEALS_TEST_DB_GUARD: "1"
  };
}

/** CLI-friendly wrapper: sanitized error to stderr and exit code 2. */
export async function guardTestDatabaseOrExit(options: TestDatabaseGuardOptions = {}): Promise<never> {
  try {
    const target = await requireTestDatabase(options);
    console.log(
      JSON.stringify({
        ok: true,
        database: target.databaseName,
        marker: target.marker,
        requiredTables: target.requiredTables
      })
    );
  } catch (error) {
    const code = error instanceof TestDatabaseGuardError ? error.code : "guard_failed";
    console.error(`TEST_DB_GUARD_FAILED ${code}: ${sanitizeDatabaseError(error)}`);
    process.exit(2);
  }
  process.exit(0);
}
