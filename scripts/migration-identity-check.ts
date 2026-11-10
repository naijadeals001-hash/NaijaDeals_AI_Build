import "dotenv/config";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../lib/prisma";

/**
 * Migration identity and status preflight. Compares the local migration folders
 * with the APPLIED rows in _prisma_migrations on the connected database. It only
 * reads: it never migrates, repairs or writes.
 *
 *   npx tsx scripts/migration-identity-check.ts
 *
 * Exits 0 when every local migration is applied, every applied migration has a
 * local folder, the newest applied row is the lexicographically last local
 * migration, and every applied row has a checksum and at least one applied step.
 */

const REQUIRED_DB = "naijadeals_affiliate_test";
const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");

type AppliedRow = {
  migration_name: string;
  checksum: string | null;
  finished_at: Date;
  applied_steps_count: number;
};

const APPLIED_SQL = `
  select migration_name, checksum, finished_at, applied_steps_count
  from _prisma_migrations
  where finished_at is not null and rolled_back_at is null
  order by finished_at asc, migration_name asc
`;

function readApplied(db: PrismaClient): Promise<AppliedRow[]> {
  return db.$queryRawUnsafe<AppliedRow[]>(APPLIED_SQL);
}

function localMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function latestApplied(rows: AppliedRow[]): AppliedRow | null {
  return rows.reduce<AppliedRow | null>((latest, row) => {
    if (!latest) return row;
    const diff = new Date(row.finished_at).getTime() - new Date(latest.finished_at).getTime();
    if (diff !== 0) return diff > 0 ? row : latest;
    return row.migration_name > latest.migration_name ? row : latest;
  }, null);
}

async function main(): Promise<void> {
  // Fail closed against the ACTUAL connected database, as the financial suites do.
  const database = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  const actual = database[0]?.db ?? "";
  if (actual !== REQUIRED_DB) {
    console.error(`Refusing to run: connected to "${actual}", expected "${REQUIRED_DB}".`);
    await prisma.$disconnect();
    process.exit(2);
  }

  const local = localMigrations();
  const applied = await readApplied(prisma);
  const appliedNames = new Set(applied.map((row) => row.migration_name));
  const localNames = new Set(local);
  const latest = latestApplied(applied);
  const lastLocal = local.length > 0 ? local[local.length - 1] : null;
  const problems: string[] = [];

  for (const name of local) {
    if (!appliedNames.has(name)) problems.push(`local migration not applied: ${name}`);
  }
  for (const row of applied) {
    if (!localNames.has(row.migration_name)) problems.push(`applied migration has no local folder: ${row.migration_name}`);
    if (!row.checksum) problems.push(`applied migration has a null checksum: ${row.migration_name}`);
    if (Number(row.applied_steps_count) <= 0) problems.push(`applied migration has zero applied steps: ${row.migration_name}`);
  }
  if (local.length === 0) problems.push(`no local migrations found in ${MIGRATIONS_DIR}`);
  if (latest === null) {
    problems.push("no applied migrations found");
  } else if (lastLocal !== null && latest.migration_name !== lastLocal) {
    problems.push(
      `latest applied migration "${latest.migration_name}" is not the lexicographically last local migration "${lastLocal}"`
    );
  }

  const result = {
    database: actual,
    localCount: local.length,
    appliedCount: applied.length,
    latest: latest?.migration_name ?? null,
    status: problems.length === 0 ? "PASS" : "FAIL",
    problems
  };

  console.log(JSON.stringify(result));
  await prisma.$disconnect();
  process.exit(result.status === "PASS" ? 0 : 1);
}

main().catch(async (error) => {
  console.error("crashed:", error instanceof Error ? error.message : String(error));
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
