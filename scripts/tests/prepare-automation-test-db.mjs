#!/usr/bin/env node
/**
 * Builds a disposable TEST-classified database for the automation suites.
 *
 * The staging database receives real scheduled backup events and is also read
 * by the n8n consumer, so some suites cannot be repeated against it once a
 * legitimate event exists. This script clones the staging schema and applied
 * migration history (no business rows) into `naijadeals_automation_test`, marks
 * it TEST and seeds the canonical roles.
 *
 * Requirements:
 *   AUTOMATION_TEST_SOURCE_URL  connection string for the schema source
 *                              (staging; never printed)
 *   AUTOMATION_TEST_TARGET_DB   optional, must start with
 *                              `naijadeals_automation_test`
 *
 * Command:
 *   AUTOMATION_TEST_SOURCE_URL='postgresql://…' \
 *     node scripts/tests/prepare-automation-test-db.mjs
 *
 * Safe by construction: it refuses any target name that does not match the
 * dedicated prefix and never touches the source database.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const source = process.env.AUTOMATION_TEST_SOURCE_URL;
const targetName = process.env.AUTOMATION_TEST_TARGET_DB ?? "naijadeals_automation_test";
if (!source) {
  console.error("AUTOMATION_TEST_SOURCE_URL is required");
  process.exit(2);
}
if (!/^naijadeals_automation_test[A-Za-z0-9_]*$/.test(targetName)) {
  console.error("Refusing: AUTOMATION_TEST_TARGET_DB must start with naijadeals_automation_test");
  process.exit(2);
}

function pgBin(name) {
  if (process.env.PG_BIN) return join(process.env.PG_BIN, name);
  for (const dir of ["C:/Program Files/PostgreSQL/18/bin", "C:/Program Files/PostgreSQL/17/bin"]) {
    if (existsSync(join(dir, `${name}.exe`))) return join(dir, `${name}.exe`);
  }
  return name;
}

function run(command, args, label) {
  const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) {
    // Never echo the connection string; psql/pg_dump errors carry the statement,
    // not the URL.
    console.error(`${label} failed (${result.status ?? "spawn"}): ${(result.stderr ?? "").slice(0, 400)}`);
    process.exit(1);
  }
  return result.stdout;
}

const sourceUrl = new URL(source);
// Creating a database needs a role with CREATEDB; the staging application role
// deliberately does not have it. The backup/restore admin URL does.
const adminSource = process.env.AUTOMATION_TEST_ADMIN_URL ?? process.env.BACKUP_RESTORE_DATABASE_URL ?? source;
const adminUrl = new URL(adminSource);
adminUrl.pathname = "/postgres";
const targetUrl = new URL(adminSource);
targetUrl.pathname = `/${targetName}`;

run(pgBin("psql"), [adminUrl.toString(), "-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS "${targetName}" WITH (FORCE)`], "drop");
run(pgBin("psql"), [adminUrl.toString(), "-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE "${targetName}"`], "create");

const dir = mkdtempSync(join(tmpdir(), "nd-testdb-"));
const dump = join(dir, "schema.sql");
const history = join(dir, "migration-history.sql");
try {
  run(pgBin("pg_dump"), [sourceUrl.toString(), "--schema-only", "--no-owner", "--no-privileges", `--file=${dump}`], "pg_dump");
  run(pgBin("psql"), [targetUrl.toString(), "-v", "ON_ERROR_STOP=1", `--file=${dump}`], "restore");
  // Copy the applied-migration history, not just the resulting schema. A future
  // suite that checks `_prisma_migrations` must see the same 86 rows as staging.
  run(pgBin("pg_dump"), [sourceUrl.toString(), "--data-only", "--table=_prisma_migrations", `--file=${history}`], "pg_dump history");
  run(pgBin("psql"), [targetUrl.toString(), "-v", "ON_ERROR_STOP=1", `--file=${history}`], "restore history");

  const setup = `
    insert into "DatabaseClassification" (id, classification, "updatedAt")
    values ('default', 'TEST', now())
    on conflict (id) do update set classification = 'TEST', "updatedAt" = now();
    insert into "Role" (id, name, description) values
      (gen_random_uuid()::text, 'super_admin', 'Platform super-administrator'),
      (gen_random_uuid()::text, 'admin', 'Control Center administrator'),
      (gen_random_uuid()::text, 'ops', 'Operations: orders, deliveries and rides'),
      (gen_random_uuid()::text, 'finance', 'Finance: payouts, payments and reconciliation'),
      (gen_random_uuid()::text, 'support', 'Support: read-only customer and order context'),
      (gen_random_uuid()::text, 'moderator', 'Moderation: catalogue and seller applications'),
      (gen_random_uuid()::text, 'customer', 'Buyer account'),
      (gen_random_uuid()::text, 'vendor', 'Seller operator'),
      (gen_random_uuid()::text, 'courier', 'Courier operator'),
      (gen_random_uuid()::text, 'driver', 'NaijaDrive driver')
    on conflict (name) do nothing;
  `;
  run(pgBin("psql"), [targetUrl.toString(), "-v", "ON_ERROR_STOP=1", "-c", setup], "seed");
  const counts = run(
    pgBin("psql"),
    [targetUrl.toString(), "-t", "-A", "-F", ":", "-c", `select (select count(*) from "_prisma_migrations" where finished_at is not null), (select count(*) from "Role"), (select classification from "DatabaseClassification" where id='default')`],
    "verify"
  ).trim();
  console.log(JSON.stringify({ ok: true, target: targetName, migrations_roles_classification: counts }));
} finally {
  rmSync(dir, { recursive: true, force: true });
}
