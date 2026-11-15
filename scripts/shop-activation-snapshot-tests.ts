#!/usr/bin/env node
/**
 * Shop activation snapshot recovery — concurrency, conflict and rollback tests.
 *
 * Proves the recovery contract used by the activation acceptance suite and the
 * operator CLI:
 *   - the conflict check and the delete/insert share one transaction under an
 *     EXCLUSIVE table lock, so a concurrent operator INSERT is serialized and a
 *     row that appeared after the preflight plan refuses the restore;
 *   - restore/discard decisions are audited in AuditLog + SystemEvent inside the
 *     same transaction as the row change;
 *   - a failure during the restore rolls the whole transaction back;
 *   - discard removes only `[run:<id>]` rows;
 *   - the baseline snapshot is restored exactly and no snapshot file or
 *     run-owned activation row is left behind.
 *
 * Database selection: REVIEW_DATABASE_URL or TEST_DATABASE_URL must be set
 * explicitly; there is no DATABASE_URL/.env fallback. The database must be
 * classified TEST or REVIEW and must not be a denied shared/production name.
 * The exclusive acceptance lease (filesystem, keyed by database) is held for
 * the whole run. Only `VerticalActivation` rows plus the audit rows for this run
 * are touched; no financial row is read or written.
 *
 * Usage:
 *   REVIEW_DATABASE_URL=... npx tsx scripts/shop-activation-snapshot-tests.ts
 *   TEST_DATABASE_URL=...   npx tsx scripts/shop-activation-snapshot-tests.ts
 */
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { Client } from "pg";
import {
  ShopActivationSnapshotError,
  buildShopActivationSnapshot,
  deleteShopActivationSnapshot,
  diffShopActivationRows,
  discardRunOwnedShopActivation,
  listShopActivationSnapshots,
  normaliseShopActivationRows,
  readShopActivationRows,
  restoreShopActivationSnapshot,
  shopActivationBlockingFingerprint,
  shopActivationSnapshotPath,
  shopActivationRowsMatch,
  writeShopActivationSnapshot,
  type ShopActivationDatabase,
  type ShopActivationRowInput,
  type ShopActivationSnapshot
} from "./lib/shop-activation-snapshot";
import {
  ReviewTestLeaseError,
  acquireReviewTestLease,
  describeReviewTestLease,
  type ReviewTestLeaseHandle
} from "./lib/review-test-lease";

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

const results: Array<{ name: string; status: "PASS" | "FAIL"; detail: string }> = [];
const runId = `SA-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
const cityPrefix = `snap-${runId.toLowerCase()}`;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function check(name: string, fn: () => Promise<string>) {
  try {
    const detail = await fn();
    results.push({ name, status: "PASS", detail });
    console.log(`PASS ${name} — ${detail}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, status: "FAIL", detail });
    console.error(`FAIL ${name}\n     ${detail}`);
  }
}

function sanitize(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "postgresql://[redacted]").slice(0, 900);
}

function explicitDatabaseUrl(): string {
  const url = process.env.REVIEW_DATABASE_URL?.trim() || process.env.TEST_DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "REFUSED: set REVIEW_DATABASE_URL or TEST_DATABASE_URL explicitly. There is no DATABASE_URL/.env fallback."
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("REFUSED: the selected database URL is invalid (value hidden).");
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error("REFUSED: the selected database URL must be postgresql:// (value hidden).");
  }
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (REFUSED_DATABASES.has(name)) throw new Error(`REFUSED: database "${name}" is denied for this suite.`);
  return url;
}

async function verifyDatabase(url: string): Promise<{ database: string; classification: string }> {
  const client = new Client({ connectionString: url, application_name: "naijadeals-shop-activation-snapshot-tests" });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(`Could not connect to the selected database (${(error as { code?: string }).code ?? "error"}).`);
  }
  try {
    const identity = await client.query<{ database: string }>("select current_database() as database");
    const database = identity.rows[0]?.database ?? "";
    if (!database) throw new Error("The connected database identity is unknown.");
    const marker = await client.query<{ classification: string }>(
      'select classification from "DatabaseClassification" order by id limit 1'
    );
    const classification = marker.rows[0]?.classification ?? "UNKNOWN";
    if (classification !== "TEST" && classification !== "REVIEW") {
      throw new Error(`Refusing database "${database}": classification is ${classification}, not TEST or REVIEW.`);
    }
    return { database, classification };
  } finally {
    await client.end().catch(() => undefined);
  }
}

function row(label: string, status: "DISABLED" | "PREVIEW" | "LIVE", reason: string): ShopActivationRowInput {
  const now = new Date();
  return {
    id: `st-${runId.toLowerCase()}-${label}-${randomBytes(4).toString("hex")}`,
    verticalKey: "shop",
    scopeType: "CITY",
    countryCode: "GH",
    cityCode: `${cityPrefix}-${label}`,
    status,
    reason,
    updatedById: null,
    createdAt: now,
    updatedAt: now
  };
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run with NODE_ENV=production.");
  const url = explicitDatabaseUrl();
  const identity = await verifyDatabase(url);
  console.log(`Database: ${identity.database} (${identity.classification}); no financial rows are touched.`);

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const db = prisma as unknown as ShopActivationDatabase;
  const clientA = new PrismaClient({ datasources: { db: { url } } });
  const clientB = new PrismaClient({ datasources: { db: { url } } });
  const snapshotPath = shopActivationSnapshotPath(runId);
  // Assignments happen inside async `check` callbacks; TS cannot narrow a
  // plain `let` across those, so keep the run state in an object.
  const state: {
    lease: ReviewTestLeaseHandle | null;
    baseline: ShopActivationSnapshot | null;
  } = { lease: null, baseline: null };
  const createdIds = new Set<string>();
  let triggerInstalled = false;

  const insertRow = async (target: ShopActivationDatabase, value: ShopActivationRowInput) => {
    await target.$executeRawUnsafe(
      `INSERT INTO "VerticalActivation"
         (id, "verticalKey", "scopeType", "countryCode", "cityCode", status, reason, "updatedById", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6::"VerticalActivationStatus", $7, $8, $9::timestamp, $10::timestamp)`,
      value.id,
      value.verticalKey,
      value.scopeType,
      value.countryCode,
      value.cityCode,
      value.status,
      value.reason,
      value.updatedById,
      new Date(value.createdAt).toISOString(),
      new Date(value.updatedAt).toISOString()
    );
    createdIds.add(value.id);
  };

  const deleteRows = async (ids: string[]) => {
    if (ids.length === 0) return;
    await prisma.$executeRawUnsafe(
      `DELETE FROM "VerticalActivation" WHERE "verticalKey" = 'shop' AND id = ANY($1::text[])`,
      ids
    );
  };

  const currentShopRows = () => readShopActivationRows(db);

  try {
    await check("database guard and exclusive acceptance lease", async () => {
      state.lease = acquireReviewTestLease({
        owner: "shop-activation-snapshot-tests",
        runId: `snapshot-${runId}`,
        purpose: `Activation snapshot TOCTOU/rollback acceptance on ${identity.database} (${identity.classification})`,
        database: identity.database,
        classification: identity.classification
      });
      return describeReviewTestLease(state.lease!.path);
    });

    await check("baseline snapshot is written before any mutation", async () => {
      const baseline = await currentShopRows();
      const runRows = baseline.filter((entry) => String(entry.reason ?? "").startsWith("[run:"));
      assert(runRows.length === 0, `a previous run left ${runRows.length} run-owned row(s); recover them first`);
      state.baseline = buildShopActivationSnapshot({ runId, database: identity.database, rows: baseline });
      writeShopActivationSnapshot(state.baseline!, { path: snapshotPath });
      assert(existsSync(snapshotPath), "snapshot file was not written");
      return `${baseline.length} prior row(s) captured at ${snapshotPath}`;
    });

    const r1 = row("r1", "DISABLED", `[run:${runId}] restore subject`);
    let snapshotWithR1: ShopActivationSnapshot | null = null;

    await check("restore reproduces exact rows and writes audit evidence", async () => {
      await insertRow(db, r1);
      snapshotWithR1 = buildShopActivationSnapshot({
        runId,
        database: identity.database,
        rows: await currentShopRows()
      });

      const changedReason = `[run:${runId}] changed before restore`;
      await prisma.$executeRawUnsafe(
        `UPDATE "VerticalActivation" SET status = 'LIVE', reason = $2, "updatedAt" = NOW()
         WHERE id = $1`,
        r1.id,
        changedReason
      );
      const r2 = row("r2", "LIVE", `[run:${runId}] extra run row`);
      await insertRow(db, r2);

      const result = await restoreShopActivationSnapshot({
        db,
        snapshot: snapshotWithR1,
        currentDatabase: identity.database
      });
      const after = await currentShopRows();
      const verification = shopActivationRowsMatch(after, snapshotWithR1.rows);
      assert(verification.ok, verification.mismatch ?? "rows do not match the snapshot");
      assert(result.added === 0 && result.removed === 1 && result.changedRows === 1, JSON.stringify(result));
      assert(result.audit !== null, "restore audit was not written");
      const audit = await prisma.auditLog.findUnique({ where: { id: result.audit!.auditId } });
      const event = await prisma.systemEvent.findUnique({ where: { id: result.audit!.systemEventId } });
      assert(audit?.action === "vertical.activation_restored", `audit action ${audit?.action}`);
      assert(event?.type === "vertical.activation_restored", `event type ${event?.type}`);
      const metadata = (audit?.metadata ?? {}) as Record<string, unknown>;
      assert(metadata.runId === runId, "audit does not carry the run id");
      return `restored ${result.restored}; removed ${result.removed}; overwrote ${result.changedRows}; audit ${result.audit!.auditId}`;
    });

    await check("an operator row that appeared after the snapshot blocks the restore and is preserved", async () => {
      assert(snapshotWithR1, "snapshot missing");
      const operatorRow = row("operator", "DISABLED", "Operator rule created during snapshot acceptance");
      await insertRow(db, operatorRow);
      let code = "";
      try {
        await restoreShopActivationSnapshot({ db, snapshot: snapshotWithR1!, currentDatabase: identity.database });
      } catch (error) {
        code = error instanceof ShopActivationSnapshotError ? error.code : "unexpected";
      }
      assert(code === "snapshot_conflict", `expected snapshot_conflict, got ${code}`);
      const stored = await prisma.verticalActivation.findUnique({ where: { id: operatorRow.id } });
      assert(stored?.status === "DISABLED", "the operator row was modified or removed");
      return "restore refused; operator row unchanged";
    });

    await check("a stale force plan refuses a changed operator row; an exact plan forces with audit", async () => {
      assert(snapshotWithR1, "snapshot missing");
      const current = await currentShopRows();
      const plan = diffShopActivationRows(current, snapshotWithR1!);
      assert(plan.blocking.length === 1, `expected one blocker, got ${plan.blocking.length}`);

      const stale = plan.blocking.map((entry) => ({
        ...shopActivationBlockingFingerprint(entry),
        reason: "stale reason from another plan"
      }));
      let code = "";
      try {
        await restoreShopActivationSnapshot({
          db,
          snapshot: snapshotWithR1!,
          currentDatabase: identity.database,
          force: true,
          expectedBlocking: stale
        });
      } catch (error) {
        code = error instanceof ShopActivationSnapshotError ? error.code : "unexpected";
      }
      assert(code === "snapshot_conflict_changed", `expected snapshot_conflict_changed, got ${code}`);
      const preserved = await prisma.verticalActivation.findUnique({ where: { id: plan.blocking[0].id } });
      assert(Boolean(preserved), "the operator row was removed by a stale force plan");

      const result = await restoreShopActivationSnapshot({
        db,
        snapshot: snapshotWithR1!,
        currentDatabase: identity.database,
        force: true,
        expectedBlocking: plan.blocking.map(shopActivationBlockingFingerprint)
      });
      const after = await currentShopRows();
      assert(shopActivationRowsMatch(after, snapshotWithR1!.rows).ok, "forced restore did not match the snapshot");
      assert(result.forced.length === 1, `forced ${result.forced.length} row(s)`);
      const forcedAudit = result.audit ? await prisma.auditLog.findUnique({ where: { id: result.audit.auditId } }) : null;
      const metadata = (forcedAudit?.metadata ?? {}) as { forced?: Array<{ id?: string }> };
      assert(metadata.forced?.some((entry) => entry.id === plan.blocking[0].id), "forced row is missing from the audit");
      return "stale plan refused; exact plan forced one audited row";
    });

    await check("a concurrent operator insert waits for the exclusive table lock", async () => {
      const locked = row("lock-a", "PREVIEW", `[run:${runId}] lock holder`);
      const waiter = row("lock-b", "DISABLED", "Operator write during restore");
      createdIds.add(waiter.id);
      let waiterSettled = false;
      const transaction = (clientA as unknown as ShopActivationDatabase).$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '5s'`);
        await tx.$executeRawUnsafe(`LOCK TABLE "VerticalActivation" IN EXCLUSIVE MODE`);
        await insertRow(tx, locked);
        await new Promise((resolve) => setTimeout(resolve, 700));
      }, { maxWait: 5_000, timeout: 15_000 });
      await new Promise((resolve) => setTimeout(resolve, 150));
      const waiting = (clientB as unknown as ShopActivationDatabase)
        .$executeRawUnsafe(
          `INSERT INTO "VerticalActivation"
             (id, "verticalKey", "scopeType", "countryCode", "cityCode", status, reason, "updatedById", "createdAt", "updatedAt")
           VALUES ($1, 'shop', 'CITY', 'GH', $2, 'DISABLED'::"VerticalActivationStatus", $3, NULL, NOW(), NOW())`,
          waiter.id,
          waiter.cityCode,
          waiter.reason
        )
        .then(() => {
          waiterSettled = true;
        });
      await new Promise((resolve) => setTimeout(resolve, 250));
      assert(!waiterSettled, "the operator insert did not wait for the exclusive lock");
      await transaction;
      await waiting;
      const [held, inserted] = await Promise.all([
        prisma.verticalActivation.findUnique({ where: { id: locked.id } }),
        prisma.verticalActivation.findUnique({ where: { id: waiter.id } })
      ]);
      assert(held && inserted, "serialized rows are missing after the lock was released");
      await deleteRows([locked.id, waiter.id]);
      return "operator insert blocked until the restore-style lock committed";
    });

    await check("a failure during restore rolls back the delete and insert", async () => {
      assert(snapshotWithR1, "snapshot missing");
      const before = normaliseShopActivationRows(await currentShopRows());
      const failingRow = row("fail", "LIVE", `[run:${runId}] trigger-fail`);
      const snapshotWithFailure = buildShopActivationSnapshot({
        runId,
        database: identity.database,
        rows: [...(await currentShopRows()), failingRow]
      });
      const functionName = `snapshot_fail_${runId.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
      const triggerName = `${functionName}_trg`;
      await prisma.$executeRawUnsafe(
        `CREATE FUNCTION "${functionName}"() RETURNS trigger AS $$
         BEGIN
           IF NEW.reason LIKE '%trigger-fail%' THEN
             RAISE EXCEPTION 'snapshot test forced insert failure';
           END IF;
           RETURN NEW;
         END;
         $$ LANGUAGE plpgsql`
      );
      await prisma.$executeRawUnsafe(
        `CREATE TRIGGER "${triggerName}" BEFORE INSERT ON "VerticalActivation"
         FOR EACH ROW EXECUTE FUNCTION "${functionName}"()`
      );
      triggerInstalled = true;
      let failed = false;
      try {
        await restoreShopActivationSnapshot({ db, snapshot: snapshotWithFailure, currentDatabase: identity.database });
      } catch {
        failed = true;
      }
      assert(failed, "the forced failure did not abort the restore");
      const after = normaliseShopActivationRows(await currentShopRows());
      assert(JSON.stringify(after) === JSON.stringify(before), "the failed restore left the table changed");
      await prisma.$executeRawUnsafe(`DROP TRIGGER "${triggerName}" ON "VerticalActivation"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION "${functionName}"() `);
      triggerInstalled = false;
      return "insert failure rolled the whole restore transaction back";
    });

    await check("discard removes only run-owned rows and audits the decision", async () => {
      const runRow = row("discard-run", "LIVE", `[run:${runId}] discard me`);
      const operatorRow = row("discard-operator", "DISABLED", "Operator row that must survive discard");
      await insertRow(db, runRow);
      await insertRow(db, operatorRow);
      const result = await discardRunOwnedShopActivation({
        db,
        runId,
        currentDatabase: identity.database
      });
      const [gone, kept] = await Promise.all([
        prisma.verticalActivation.findUnique({ where: { id: runRow.id } }),
        prisma.verticalActivation.findUnique({ where: { id: operatorRow.id } })
      ]);
      assert(gone === null, "the run-owned row was not deleted");
      assert(kept !== null, "the operator row was deleted");
      assert(result.deleted >= 1 && result.audit !== null, "discard result/audit is missing");
      const audit = await prisma.auditLog.findUnique({ where: { id: result.audit!.auditId } });
      assert(audit?.action === "vertical.activation_discarded", `audit action ${audit?.action}`);
      await deleteRows([operatorRow.id]);
      return `deleted ${result.deleted} run-owned row(s); operator row preserved; audit ${result.audit!.auditId}`;
    });
  } finally {
    // Remove only this run's rows and audit records, then restore the exact
    // baseline. Any unexpected operator row refuses the restore and retains the
    // baseline snapshot for explicit recovery.
    try {
      if (triggerInstalled) {
        await prisma.$executeRawUnsafe(
          `DROP TRIGGER IF EXISTS "snapshot_fail_${runId.toLowerCase().replace(/[^a-z0-9]/g, "_")}_trg" ON "VerticalActivation"`
        ).catch(() => undefined);
        await prisma.$executeRawUnsafe(
          `DROP FUNCTION IF EXISTS "snapshot_fail_${runId.toLowerCase().replace(/[^a-z0-9]/g, "_")}"()`
        ).catch(() => undefined);
      }
      const runRows = normaliseShopActivationRows(await currentShopRows()).filter(
        (entry) => entry.reason?.startsWith(`[run:${runId}]`) || createdIds.has(entry.id)
      );
      await deleteRows([...new Set([...createdIds, ...runRows.map((entry) => entry.id)])]);
      await deleteRows([...createdIds]);
      if (state.baseline) {
        try {
          const result = await restoreShopActivationSnapshot({
            db,
            snapshot: state.baseline!,
            currentDatabase: identity.database
          });
          const after = await currentShopRows();
          const verification = shopActivationRowsMatch(after, state.baseline!.rows);
          if (!verification.ok) {
            console.error(`WARNING: baseline restore verification failed: ${verification.mismatch}`);
          } else if (result.audit) {
            deleteShopActivationSnapshot(snapshotPath);
            console.log(`Baseline restored (${result.restored} row(s)); snapshot removed: ${snapshotPath}`);
          } else if (existsSync(snapshotPath)) {
            deleteShopActivationSnapshot(snapshotPath);
            console.log(`Baseline already exact; snapshot removed: ${snapshotPath}`);
          }
        } catch (error) {
          console.error(
            `WARNING: baseline activation rows were NOT restored: ${sanitize(error)}. The snapshot is retained at ${snapshotPath}.`
          );
        }
      }
      await prisma.$executeRawUnsafe(
        `DELETE FROM "AuditLog" WHERE entity = 'VerticalActivation' AND metadata->>'runId' = $1`,
        runId
      ).catch(() => undefined);
      await prisma.$executeRawUnsafe(
        `DELETE FROM "SystemEvent" WHERE entity = 'VerticalActivation' AND payload->>'runId' = $1`,
        runId
      ).catch(() => undefined);
      const leftoverRows = normaliseShopActivationRows(await currentShopRows()).filter(
        (entry) => entry.reason?.startsWith(`[run:${runId}]`) || createdIds.has(entry.id)
      );
      const leftoverSnapshots = listShopActivationSnapshots().filter((entry) => entry.path === snapshotPath);
      if (leftoverRows.length > 0) console.error(`WARNING: ${leftoverRows.length} run-owned activation row(s) remain.`);
      if (leftoverSnapshots.length > 0) console.error(`WARNING: snapshot file remains: ${snapshotPath}`);
    } finally {
      if (state.lease) {
        const released = state.lease.releaseSync();
        if (!released) console.error(`WARNING: review test lease was not released: ${describeReviewTestLease(state.lease.path)}`);
        else console.log(`Review test lease released: ${state.lease.path}`);
      }
      await Promise.all(
        [prisma, clientA, clientB].map((client) => client.$disconnect().catch(() => undefined))
      );
    }
  }

  const failed = results.filter((entry) => entry.status === "FAIL");
  console.log(`\n${results.length - failed.length}/${results.length} snapshot checks passed.`);
  if (failed.length > 0) {
    process.exitCode = 1;
    for (const failure of failed) console.error(`- ${failure.name}: ${failure.detail}`);
  }
}

main().catch((error) => {
  if (error instanceof ReviewTestLeaseError) {
    console.error(`REFUSED ${sanitize(error)}`);
    process.exitCode = 2;
    return;
  }
  console.error(sanitize(error));
  process.exitCode = 1;
});
