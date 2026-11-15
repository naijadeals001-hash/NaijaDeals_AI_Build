#!/usr/bin/env node
/**
 * Recover Shop service-activation rows from an explicit run-owned snapshot.
 *
 * Run by the activation acceptance suite before it mutates
 * `VerticalActivation`; this command is the operator path after an interrupted
 * run (Ctrl+C, killed terminal, crash) leaves a GLOBAL DISABLED/PREVIEW rule.
 *
 * Safety:
 *  - requires REVIEW_DATABASE_URL explicitly and --expect-db, verifies the
 *    actual `current_database()` plus a TEST/REVIEW classification marker;
 *  - never guesses a snapshot: pass --snapshot, --run or --latest;
 *  - dry-run by default. Mutations require --apply;
 *  - a current row that is neither in the snapshot nor tagged
 *    `[run:<snapshot run id>]` blocks the restore unless --force is explicit;
 *  - the snapshot is deleted only after a verified row-for-row restoration;
 *  - --discard-run-owned only removes rows whose reason starts `[run:<id>]`,
 *    never an administrator rule.
 *
 * Usage:
 *   REVIEW_DATABASE_URL=... npx tsx scripts/recover-shop-activation.ts \
 *     --expect-db=naijadeals_review --list
 *
 *   ... --latest --apply
 *   ... --run=abc123 --apply
 *   ... --snapshot=qa-artifacts/activation-snapshots/shop-activation-abc123.json --apply
 *   ... --discard-run-owned=abc123 --apply
 *   ... --discard-all-run-owned --confirm-all-run-owned --apply
 */
import "dotenv/config";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import {
  SHOP_ACTIVATION_SNAPSHOT_DIR,
  ShopActivationSnapshotError,
  currentShopActivationDatabase,
  deleteShopActivationSnapshot,
  diffShopActivationRows,
  discardRunOwnedShopActivation,
  formatShopActivationRow,
  formatShopActivationSnapshotSummary,
  listShopActivationSnapshots,
  normaliseShopActivationRows,
  readShopActivationRows,
  readShopActivationSnapshot,
  restoreShopActivationSnapshot,
  shopActivationBlockingFingerprint,
  shopActivationSnapshotPath,
  type ShopActivationDatabase,
  type ShopActivationSnapshot
} from "./lib/shop-activation-snapshot";

const DENIED_DATABASES = new Set([
  "naijadeals_core",
  "naijadeals_prod",
  "naijadeals_production",
  "naijadeals_live",
  "naijadeals_shared",
  "postgres",
  "template0",
  "template1"
]);

function fail(message: string, exitCode = 2): never {
  console.error(`FAIL: ${message}`);
  process.exit(exitCode);
}

function sanitize(message: string): string {
  return String(message)
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "postgresql://[redacted]")
    .slice(0, 800);
}

function argvValue(argv: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = argv.find((value) => value.startsWith(prefix));
  return arg?.slice(prefix.length).trim() || undefined;
}

function parseDatabaseUrl(argv: string[]): { url: string; expected: string } {
  const expected = argvValue(argv, "expect-db");
  if (!expected) fail("--expect-db=<database-name> is required so the target cannot be guessed.");
  if (!/^[A-Za-z0-9_]+$/.test(expected)) fail("--expect-db must contain only letters, digits and underscores.");
  const url = process.env.REVIEW_DATABASE_URL?.trim();
  if (!url) fail("REVIEW_DATABASE_URL is required; DATABASE_URL is never used as a fallback.");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    fail("REVIEW_DATABASE_URL is not a valid URL.");
  }
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) fail("REVIEW_DATABASE_URL must be a postgresql:// connection.");
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (database !== expected) fail(`REVIEW_DATABASE_URL points at "${database || "(none)"}" but --expect-db=${expected}.`);
  if (DENIED_DATABASES.has(database)) fail(`Refusing denied database "${database}".`);
  return { url, expected };
}

async function verifyDatabase(url: string, expected: string): Promise<string> {
  const client = new Client({ connectionString: url, application_name: "naijadeals-shop-activation-recovery" });
  try {
    await client.connect();
  } catch (error) {
    fail(`Could not connect to the REVIEW database (${sanitize((error as Error).message)}).`);
  }
  try {
    const identity = await client.query<{ database: string }>("select current_database() as database");
    const actual = identity.rows[0]?.database ?? "";
    if (actual !== expected) fail(`Connected database "${actual}" does not match --expect-db=${expected}.`);
    const marker = await client.query<{ classification: string }>(
      'select classification from "DatabaseClassification" order by id limit 1'
    );
    const classification = marker.rows[0]?.classification ?? "UNKNOWN";
    if (classification !== "REVIEW" && classification !== "TEST") {
      fail(`Refusing database "${actual}": classification is ${classification}, not REVIEW or TEST.`);
    }
    console.log(`Database: ${actual} (${classification})`);
    return actual;
  } finally {
    await client.end().catch(() => undefined);
  }
}

function printUsage() {
  console.log(`Usage (read-only unless --apply is present):
  --list                                   List run-owned snapshot files (no mutation)
  --latest                                 Select the newest snapshot
  --run=<runId>                            Select qa-artifacts/activation-snapshots/shop-activation-<runId>.json
  --snapshot=<path>                        Select an explicit snapshot file
  --apply                                  Perform the selected restore/discard
  --force                                  Allow a restore that removes/overwrites non-run rows (inspect first)
  --keep-snapshot                          Keep the snapshot after verified restoration
  --discard-run-owned=<runId>              Delete only rows whose reason is [run:<runId>]
  --discard-all-run-owned                  Delete every row with a [run:...] reason
  --confirm-all-run-owned                  Required with --discard-all-run-owned
  --expect-db=<name>                       Required; must match REVIEW_DATABASE_URL and current_database()`);
}

async function effectiveShopStatus(): Promise<string> {
  try {
    const activation = await import("../lib/services/core/vertical-activation.service");
    const effective = await activation.effectiveVerticalActivation("shop", { fresh: true });
    return `${effective.status}/${effective.scope} (source ${effective.source})`;
  } catch (error) {
    return `unavailable (${sanitize((error as Error).message)})`;
  }
}

async function printState(db: ShopActivationDatabase) {
  const rows = normaliseShopActivationRows(await readShopActivationRows(db));
  console.log(`Shop activation rows: ${rows.length}`);
  for (const row of rows) console.log(`  - ${formatShopActivationRow(row)}`);
  console.log(`Effective Shop activation: ${await effectiveShopStatus()}`);
  return rows;
}

function resolveSnapshotSelection(argv: string[]): string | null {
  const explicit = argvValue(argv, "snapshot");
  if (explicit) {
    const path = resolve(explicit);
    if (!existsSync(path)) fail(`Snapshot file does not exist: ${path}`);
    return path;
  }
  const runId = argvValue(argv, "run");
  if (runId) {
    const path = shopActivationSnapshotPath(runId);
    if (!existsSync(path)) fail(`No snapshot for run ${runId} at ${path}`);
    return path;
  }
  if (argv.includes("--latest")) {
    const snapshots = listShopActivationSnapshots();
    if (snapshots.length === 0) fail(`No snapshots under ${SHOP_ACTIVATION_SNAPSHOT_DIR}; refusing to modify anything.`);
    const newest = snapshots[0];
    if (!newest.snapshot) fail(`The newest snapshot is unreadable: ${newest.error}`);
    return newest.path;
  }
  return null;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    printUsage();
    if (argv.length === 0) fail("No action selected; no database was modified.");
    return;
  }

  const { url, expected } = parseDatabaseUrl(argv);
  const database = await verifyDatabase(url, expected);
  process.env.DATABASE_URL = url;
  const { prisma } = await import("../lib/prisma");
  const db = prisma as unknown as ShopActivationDatabase;

  try {
    const actual = await currentShopActivationDatabase(db);
    if (actual !== database) fail(`Prisma connected to "${actual}", not "${database}".`);

    const listOnly = argv.includes("--list");
    const discardRun = argvValue(argv, "discard-run-owned");
    const discardAll = argv.includes("--discard-all-run-owned");
    const apply = argv.includes("--apply");
    const force = argv.includes("--force");
    const keep = argv.includes("--keep-snapshot");

    console.log("Run-owned snapshots:");
    const snapshots = listShopActivationSnapshots();
    if (snapshots.length === 0) console.log("  (none)");
    for (const entry of snapshots) {
      if (entry.snapshot) console.log(`  - ${entry.snapshot.runId} ${entry.path} — ${formatShopActivationSnapshotSummary(entry.snapshot)}`);
      else console.log(`  - ${entry.path} — INVALID: ${entry.error}`);
    }

    if (listOnly) {
      await printState(db);
      return;
    }

    if (discardRun || discardAll) {
      if (discardAll && !argv.includes("--confirm-all-run-owned")) {
        fail("--discard-all-run-owned requires --confirm-all-run-owned (it can remove several interrupted runs' rows).");
      }
      const rows = normaliseShopActivationRows(await readShopActivationRows(db));
      const candidates = rows.filter((row) => {
        const match = /^\[run:([A-Za-z0-9][A-Za-z0-9._-]{0,79})\]/.exec(row.reason ?? "");
        if (discardRun) return match?.[1] === discardRun;
        return Boolean(match);
      });
      console.log(`Run-owned rows matched for deletion: ${candidates.length}`);
      for (const row of candidates) console.log(`  - ${formatShopActivationRow(row)}`);
      if (candidates.length === 0) {
        console.log("Nothing to discard.");
        return;
      }
      if (!apply) fail("Dry run: pass --apply to delete only the listed [run:...] rows.");
      const result = await discardRunOwnedShopActivation({
        db,
        runId: discardRun,
        allRuns: discardAll,
        currentDatabase: database
      });
      console.log(`Deleted ${result.deleted} run-owned row(s); operator rows were not touched.`);
      console.log(`Effective Shop activation: ${await effectiveShopStatus()}`);
      return;
    }

    const selectedPath = resolveSnapshotSelection(argv);
    if (!selectedPath) {
      await printState(db);
      fail(
        "No snapshot selected; refusing to modify activation. Pass --snapshot=<path>, --run=<runId> or --latest " +
          "(plus --apply), or use --discard-run-owned=<runId> when the leftover row carries an identifiable run tag."
      );
    }

    let snapshot: ShopActivationSnapshot;
    try {
      snapshot = readShopActivationSnapshot(selectedPath);
    } catch (error) {
      fail(error instanceof ShopActivationSnapshotError ? error.message : sanitize(String(error)));
    }
    if (snapshot.database !== database) {
      fail(`Snapshot database "${snapshot.database}" does not match the verified database "${database}".`);
    }
    console.log(`Selected snapshot: ${formatShopActivationSnapshotSummary(snapshot)}`);
    console.log(`Snapshot rows: ${snapshot.rows.length}`);
    for (const row of snapshot.rows) console.log(`  - ${formatShopActivationRow(row)}`);

    const currentRows = await readShopActivationRows(db);
    const diff = diffShopActivationRows(currentRows, snapshot);
    console.log(
      `Planned restore: add ${diff.missing.length}, remove ${diff.extra.length}, overwrite ${diff.changed.length}; ` +
        `identical=${diff.identical}`
    );
    if (diff.blocking.length > 0) {
      console.log("Non-run-owned rows that would be removed/overwritten:");
      for (const row of diff.blocking) console.log(`  - ${formatShopActivationRow(row)}`);
      if (!force) {
        fail(
          "Restore blocked: these rows are not owned by the snapshot run. An administrator rule is never cleared silently. " +
            "Inspect them and pass --force only if their removal is intended."
        );
      }
      console.log("--force supplied: the rows above will be removed/overwritten.");
    }

    if (!apply) fail("Dry run only: pass --apply to restore the selected snapshot.");

    const result = await restoreShopActivationSnapshot({
      db,
      snapshot,
      currentDatabase: database,
      force,
      // Only the rows this run actually saw may be forced. A row that appeared
      // or changed after this plan refuses the restore instead of being
      // silently overwritten by a concurrent operator's work.
      expectedBlocking: force ? diff.blocking.map(shopActivationBlockingFingerprint) : undefined
    });
    console.log(
      `Restored ${result.restored} row(s): added ${result.added}, removed ${result.removed}, overwritten ${result.changedRows}; ` +
        `verified ${result.verification.matched}/${result.verification.expected}.`
    );
    if (result.forced.length > 0) console.log(`Forced over ${result.forced.length} row(s): ${result.forced.map(formatShopActivationRow).join("; ")}`);
    console.log(`Effective Shop activation: ${await effectiveShopStatus()}`);

    if (!keep) {
      deleteShopActivationSnapshot(selectedPath);
      console.log(`Snapshot removed after verified restore: ${selectedPath}`);
    } else {
      console.log(`Snapshot retained (--keep-snapshot): ${selectedPath}`);
    }

    await printState(db);
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(sanitize(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
