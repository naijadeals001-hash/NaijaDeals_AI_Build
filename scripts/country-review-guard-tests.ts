/**
 * Refusal and positive-path tests for the Discover Africa REVIEW database guard.
 *
 * Read-only: the guard only connects, reads `current_database()`,
 * `information_schema` and `DatabaseClassification`. No row is written.
 *
 * Run:
 *   REVIEW_DATABASE_URL=<explicit review connection> npx tsx scripts/country-review-guard-tests.ts
 *
 * The connection string is never printed. The mismatch case is exercised by a
 * deliberate expectation override against the live REVIEW database instead of
 * opening a second database; the non-REVIEW case is exercised through the
 * exported classification check.
 */
import {
  CountryReviewDbGuardError,
  assertCountryReviewClassification,
  sanitizeCountryReviewError,
  verifyCountryReviewDatabase
} from "./lib/country-review-db";

type CheckResult = { name: string; status: "PASS" | "FAIL"; detail: string };
const results: CheckResult[] = [];

function sanitized(error: unknown): string {
  return sanitizeCountryReviewError(error);
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

function expectRefusal(fn: () => Promise<unknown> | unknown, expectedCode: string): Promise<string> {
  return (async () => {
    try {
      await fn();
    } catch (error) {
      if (!(error instanceof CountryReviewDbGuardError)) throw error;
      if (error.code !== expectedCode) {
        throw new Error(`expected refusal ${expectedCode}, received ${error.code}: ${sanitized(error)}`);
      }
      const text = sanitized(error);
      if (/postgres(?:ql)?:\/\//i.test(text)) throw new Error("refusal message exposed a connection URL");
      return `refused ${error.code}`;
    }
    throw new Error(`expected refusal ${expectedCode}, but the guard accepted the target`);
  })();
}

async function main() {
  const reviewUrl = (process.env.REVIEW_DATABASE_URL ?? "").trim();
  if (!reviewUrl) {
    console.error(
      "COUNTRY_REVIEW_GUARD_TESTS_FAILED missing_review_database_url: set REVIEW_DATABASE_URL explicitly (the value is never printed)."
    );
    process.exit(2);
  }

  await check("absent REVIEW_DATABASE_URL refuses even when DATABASE_URL is set", async () => {
    const savedReview = process.env.REVIEW_DATABASE_URL;
    const savedDatabase = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgresql://fallback-user:fallback-secret@127.0.0.1:1/fallback_db";
    delete process.env.REVIEW_DATABASE_URL;
    try {
      return await expectRefusal(() => verifyCountryReviewDatabase(), "missing_review_database_url");
    } finally {
      process.env.REVIEW_DATABASE_URL = savedReview;
      if (savedDatabase === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = savedDatabase;
    }
  });

  await check("invalid REVIEW_DATABASE_URL is refused without printing it", async () => {
    const savedReview = process.env.REVIEW_DATABASE_URL;
    process.env.REVIEW_DATABASE_URL = "not a database url";
    try {
      return await expectRefusal(() => verifyCountryReviewDatabase(), "invalid_review_database_url");
    } finally {
      process.env.REVIEW_DATABASE_URL = savedReview;
    }
  });

  await check("non-postgres protocol is refused", async () => {
    const savedReview = process.env.REVIEW_DATABASE_URL;
    process.env.REVIEW_DATABASE_URL = "mysql://user:secret@127.0.0.1:3306/naijadeals_review";
    try {
      return await expectRefusal(() => verifyCountryReviewDatabase(), "invalid_review_database_url");
    } finally {
      process.env.REVIEW_DATABASE_URL = savedReview;
    }
  });

  await check("denied production database name is refused before connecting", async () => {
    const savedReview = process.env.REVIEW_DATABASE_URL;
    process.env.REVIEW_DATABASE_URL = "postgresql://user:secret@127.0.0.1:1/naijadeals_core";
    try {
      return await expectRefusal(() => verifyCountryReviewDatabase(), "database_denied");
    } finally {
      process.env.REVIEW_DATABASE_URL = savedReview;
    }
  });

  await check("live current_database() mismatch is refused", async () => {
    return await expectRefusal(
      () => verifyCountryReviewDatabase({ url: reviewUrl, expectedDatabaseOverride: "definitely_not_the_review_database" }),
      "database_identity_mismatch"
    );
  });

  await check("non-REVIEW classification is refused", async () => {
    try {
      assertCountryReviewClassification([{ id: "default", classification: "TEST" }, { id: "second", classification: "DRAFT" }]);
    } catch (error) {
      if (!(error instanceof CountryReviewDbGuardError) || error.code !== "classification_not_review") throw error;
      return `refused classification_not_review (${sanitized(error)})`;
    }
    throw new Error("expected classification_not_review, but the classification check accepted non-REVIEW rows");
  });

  await check("missing classification rows are refused", async () => {
    try {
      assertCountryReviewClassification([]);
    } catch (error) {
      if (!(error instanceof CountryReviewDbGuardError) || error.code !== "classification_not_review") throw error;
      return "refused classification_not_review on empty table";
    }
    throw new Error("expected classification_not_review, but an empty classification table was accepted");
  });

  await check("explicit REVIEW target passes identity, schema and classification checks", async () => {
    const target = await verifyCountryReviewDatabase();
    return `database=${target.databaseName} marker=${target.marker} tables=${target.requiredTables.length}`;
  });

  const failed = results.filter((row) => row.status === "FAIL").length;
  console.log(JSON.stringify({ passed: results.length - failed, failed }, null, 2));
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`COUNTRY_REVIEW_GUARD_TESTS_FAILED ${sanitized(error)}`);
  process.exitCode = 1;
});
