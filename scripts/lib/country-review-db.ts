import { Client } from "pg";

/**
 * Fail-closed guard for the Discover Africa scripts that mutate country
 * editorial, origin or role data.
 *
 * The REVIEW database is shared operational state: 54 published country
 * profiles, their themes/sources and the product catalogue. A seed or fixture
 * run pointed at the wrong database could rewrite accepted content, so this
 * guard deliberately refuses anything it cannot positively identify.
 *
 * Rules:
 *  - `REVIEW_DATABASE_URL` must be set explicitly. `DATABASE_URL`, `.env` and
 *    the process environment are never used as a fallback.
 *  - The connection target must be a single PostgreSQL database.
 *  - The deny list (production/shared database names) is refused even if the
 *    name happens to look like a review database.
 *  - The live `current_database()` must equal the database named in the URL.
 *  - `DatabaseClassification` must contain an explicit REVIEW row. A database
 *    whose name merely contains "review" is not enough.
 *  - The tables these scripts mutate must already exist.
 *
 * On success `requireCountryReviewDatabase()` points `DATABASE_URL` at the
 * verified target so the Prisma client imported afterwards uses the same
 * database. Errors never include the connection string.
 */

export const REVIEW_DATABASE_ENV = "REVIEW_DATABASE_URL" as const;

export class CountryReviewDbGuardError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CountryReviewDbGuardError";
    this.code = code;
  }
}

export type VerifiedCountryReviewDatabase = {
  databaseName: string;
  /** Connection string. Never log this value. */
  url: string;
  marker: "DatabaseClassification:REVIEW";
  requiredTables: string[];
};

export type CountryReviewDbGuardOptions = {
  /** Explicit URL for lower-level checks. Omit to read REVIEW_DATABASE_URL. */
  url?: string;
  /** Additional database names to reject, case-insensitive. */
  denyList?: string[];
  /**
   * Optional expected database name (for example `--expect-db`). When set, the
   * URL target and the live `current_database()` must match it as well.
   */
  expectedDatabase?: string;
  /** Tables that must exist before a script may mutate country data. */
  requiredTables?: string[];
  connectionTimeoutMs?: number;
  /**
   * Test-only: intentionally compare `current_database()` against a different
   * name so the mismatch refusal can be exercised without touching a second
   * database. Mutating scripts never pass this.
   */
  expectedDatabaseOverride?: string;
};

export const DEFAULT_COUNTRY_REVIEW_DENY_LIST = [
  "naijadeals_core",
  "naijadeals_prod",
  "naijadeals_production",
  "naijadeals_live",
  "naijadeals_shared",
  "postgres",
  "template0",
  "template1"
] as const;

export const DEFAULT_COUNTRY_REVIEW_TABLES = [
  "CountryProfile",
  "CountryTheme",
  "CountryThemeSource",
  "DatabaseClassification",
  "AuditLog",
  "SystemEvent",
  "Product",
  "Vendor",
  "Category",
  "Role",
  "User",
  "UserRole"
] as const;

/** Remove anything that could be a connection string or password from an error. */
export function sanitizeCountryReviewError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "postgresql://[redacted]")
    .replace(/\b(password|passwd|pwd)\s*=\s*[^;\s"'`]+/gi, "$1=[redacted]")
    .slice(0, 700);
}

function readExplicitReviewUrl(env: NodeJS.ProcessEnv): string {
  const value = env[REVIEW_DATABASE_ENV]?.trim();
  if (value) return value;
  throw new CountryReviewDbGuardError(
    "missing_review_database_url",
    `Refusing to run: ${REVIEW_DATABASE_ENV} must be set explicitly. DATABASE_URL is never used as a fallback.`
  );
}

export function parseCountryReviewTarget(url: string): { databaseName: string; protocol: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new CountryReviewDbGuardError(
      "invalid_review_database_url",
      `${REVIEW_DATABASE_ENV} is not a valid URL (value hidden).`
    );
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new CountryReviewDbGuardError(
      "invalid_review_database_url",
      `${REVIEW_DATABASE_ENV} must use the postgresql: protocol (value hidden).`
    );
  }
  let databaseName: string;
  try {
    databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  } catch {
    throw new CountryReviewDbGuardError(
      "invalid_review_database_url",
      `${REVIEW_DATABASE_ENV} has an invalid database path (value hidden).`
    );
  }
  if (!databaseName || databaseName.includes("/")) {
    throw new CountryReviewDbGuardError(
      "invalid_review_database_url",
      `${REVIEW_DATABASE_ENV} must name exactly one database.`
    );
  }
  return { databaseName, protocol: parsed.protocol };
}

function denyListFor(options: CountryReviewDbGuardOptions): string[] {
  const fromEnv = (process.env.REVIEW_DB_GUARD_DENYLIST ?? "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  return [...DEFAULT_COUNTRY_REVIEW_DENY_LIST, ...(options.denyList ?? []), ...fromEnv].map((name) =>
    name.toLowerCase()
  );
}

export function assertCountryReviewNotDenied(databaseName: string, denyList: string[]): void {
  if (denyList.includes(databaseName.toLowerCase())) {
    throw new CountryReviewDbGuardError(
      "database_denied",
      `Refusing to run against denied database "${databaseName}". ${REVIEW_DATABASE_ENV} must name the isolated REVIEW database.`
    );
  }
}

/**
 * The live identity check. Exported so the refusal path can be exercised with a
 * deliberate expectation override without opening a second database.
 */
export function assertCountryReviewIdentity(actual: string | undefined, expected: string): void {
  if (!actual) {
    throw new CountryReviewDbGuardError(
      "database_identity_unknown",
      "Refusing to run: the server did not report current_database(). The URL was not printed."
    );
  }
  if (actual !== expected) {
    throw new CountryReviewDbGuardError(
      "database_identity_mismatch",
      `Connected database "${actual}" does not match the ${REVIEW_DATABASE_ENV} target "${expected}".`
    );
  }
}

export type ClassificationRow = { id?: string; classification: string };

/**
 * Exported so the non-REVIEW refusal can be unit-tested without pointing the
 * guard at a non-review database.
 */
export function assertCountryReviewClassification(rows: ClassificationRow[]): "DatabaseClassification:REVIEW" {
  if (rows.some((row) => row.classification === "REVIEW")) return "DatabaseClassification:REVIEW";
  const seen = rows.map((row) => row.classification).filter(Boolean).join(",") || "none";
  throw new CountryReviewDbGuardError(
    "classification_not_review",
    `Refusing to run: the connected database is not classified REVIEW (found: ${seen}).`
  );
}

export async function verifyCountryReviewDatabase(
  options: CountryReviewDbGuardOptions = {}
): Promise<VerifiedCountryReviewDatabase> {
  const url = options.url ?? readExplicitReviewUrl(process.env);
  const { databaseName } = parseCountryReviewTarget(url);
  const denyList = denyListFor(options);
  assertCountryReviewNotDenied(databaseName, denyList);

  const expectedDatabase = (options.expectedDatabaseOverride ?? options.expectedDatabase ?? databaseName).trim();
  if (options.expectedDatabase && options.expectedDatabaseOverride === undefined) {
    if (expectedDatabase !== databaseName) {
      throw new CountryReviewDbGuardError(
        "expected_database_mismatch",
        `${REVIEW_DATABASE_ENV} names "${databaseName}", expected "${expectedDatabase}".`
      );
    }
    if (denyList.includes(expectedDatabase.toLowerCase())) {
      throw new CountryReviewDbGuardError("database_denied", `Refusing to run against denied database "${expectedDatabase}".`);
    }
  }

  const requiredTables = [...(options.requiredTables ?? DEFAULT_COUNTRY_REVIEW_TABLES)];
  const client = new Client({
    connectionString: url,
    application_name: "naijadeals-country-review-guard",
    connectionTimeoutMillis: options.connectionTimeoutMs ?? 10_000,
    statement_timeout: 15_000
  });

  try {
    await client.connect();
  } catch (error) {
    const code = (error as { code?: string }).code ?? "connection_error";
    throw new CountryReviewDbGuardError(
      "database_connect_failed",
      `Could not connect to the REVIEW database (${code}). The URL was not printed.`
    );
  }

  try {
    const identity = await client.query<{ database: string }>("select current_database() as database");
    const actual = identity.rows[0]?.database;
    assertCountryReviewIdentity(actual, expectedDatabase);
    assertCountryReviewNotDenied(actual, denyList);

    const present = await client.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1::text[])",
      [requiredTables]
    );
    const presentNames = new Set(present.rows.map((row) => row.table_name));
    const missing = requiredTables.filter((name) => !presentNames.has(name));
    if (missing.length > 0) {
      throw new CountryReviewDbGuardError(
        "schema_missing",
        `Refusing to run: required country tables are missing (${missing.join(", ")}).`
      );
    }

    const classification = await client.query<ClassificationRow>(
      'select id, classification from "DatabaseClassification" order by id'
    );
    const marker = assertCountryReviewClassification(classification.rows);

    return { databaseName: actual ?? databaseName, url, marker, requiredTables };
  } catch (error) {
    if (error instanceof CountryReviewDbGuardError) throw error;
    throw new CountryReviewDbGuardError(
      "guard_query_failed",
      `REVIEW database verification failed (${(error as { code?: string }).code ?? "query_error"}). The URL was not printed.`
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}

/**
 * Verify the explicit REVIEW target and point this process at it.
 *
 * Call before importing `lib/prisma` or constructing a PrismaClient so no query
 * can reach an unverified database.
 */
export async function requireCountryReviewDatabase(
  options: CountryReviewDbGuardOptions = {}
): Promise<VerifiedCountryReviewDatabase> {
  const target = await verifyCountryReviewDatabase(options);
  process.env.DATABASE_URL = target.url;
  process.env[REVIEW_DATABASE_ENV] = target.url;
  process.env.NAIJADEALS_REVIEW_DATABASE = target.databaseName;
  process.env.NAIJADEALS_REVIEW_DB_MARKER = target.marker;
  return target;
}

/** CLI helper: prints a sanitized success/failure and exits. */
export async function guardCountryReviewDbOrExit(options: CountryReviewDbGuardOptions = {}): Promise<never> {
  try {
    const target = await requireCountryReviewDatabase(options);
    console.log(
      JSON.stringify({
        ok: true,
        database: target.databaseName,
        marker: target.marker,
        requiredTables: target.requiredTables
      })
    );
    process.exit(0);
  } catch (error) {
    const code = error instanceof CountryReviewDbGuardError ? error.code : "guard_failed";
    console.error(`COUNTRY_REVIEW_DB_GUARD_FAILED ${code}: ${sanitizeCountryReviewError(error)}`);
    process.exit(2);
  }
}
