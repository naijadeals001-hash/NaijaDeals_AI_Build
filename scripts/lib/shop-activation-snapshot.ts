/**
 * Durable snapshot and recovery for Shop `VerticalActivation` rows.
 *
 * The activation acceptance suite mutates the real table through the real
 * service. An in-memory snapshot disappears when the process is interrupted,
 * which can leave a run-owned GLOBAL DISABLED rule behind and hide the Shop
 * storefront. This module writes the exact prior rows to a run-owned file
 * before the first mutation and restores from that file afterwards.
 *
 * Safety contract:
 *  - a snapshot file is run-owned: its filename and payload both carry the run
 *    id, and every test rule is expected to use a `[run:<runId>]` reason;
 *  - a restore only targets the `shop` vertical and only when the connected
 *    database name matches the database recorded in the snapshot;
 *  - a current row that is neither in the snapshot nor tagged with *this*
 *    run id blocks the restore. A legitimate administrator DISABLED rule is
 *    therefore never cleared silently; the caller must inspect the conflict
 *    and, if truly intended, pass `force: true` explicitly;
 *  - restoration is verified row-for-row, and only then may the snapshot file
 *    be deleted. On any failure the file is preserved, so recovery remains
 *    possible after the original process has exited.
 *
 * The module has no Prisma import at runtime; it only needs the small
 * `$queryRawUnsafe` / `$executeRawUnsafe` / `$transaction` surface that both
 * Prisma Client and a test double can provide.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join, resolve } from "node:path";

export const SHOP_VERTICAL_KEY = "shop" as const;
export const SHOP_ACTIVATION_SNAPSHOT_VERSION = 1 as const;
export const SHOP_ACTIVATION_SNAPSHOT_KIND = "naijadeals.shop-activation.snapshot" as const;
export const SHOP_ACTIVATION_SNAPSHOT_DIR = join("qa-artifacts", "activation-snapshots");
export const SHOP_ACTIVATION_SNAPSHOT_PREFIX = "shop-activation-";

export const SHOP_ACTIVATION_SCOPES = ["GLOBAL", "COUNTRY", "CITY"] as const;
export const SHOP_ACTIVATION_STATUSES = ["DISABLED", "PREVIEW", "LIVE"] as const;

export type ShopActivationScope = (typeof SHOP_ACTIVATION_SCOPES)[number];
export type ShopActivationStatus = (typeof SHOP_ACTIVATION_STATUSES)[number];

/** A row as read from the database (dates may be Date or an ISO string). */
export type ShopActivationRowInput = {
  id: string;
  verticalKey: string;
  scopeType: string;
  countryCode: string;
  cityCode: string;
  status: string;
  reason: string | null;
  updatedById: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

/** The normalised, serialisable row stored in a snapshot. */
export type ShopActivationRow = {
  id: string;
  verticalKey: typeof SHOP_VERTICAL_KEY;
  scopeType: ShopActivationScope;
  countryCode: string;
  cityCode: string;
  status: ShopActivationStatus;
  reason: string | null;
  updatedById: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ShopActivationSnapshot = {
  version: typeof SHOP_ACTIVATION_SNAPSHOT_VERSION;
  kind: typeof SHOP_ACTIVATION_SNAPSHOT_KIND;
  verticalKey: typeof SHOP_VERTICAL_KEY;
  runId: string;
  database: string;
  capturedAt: string;
  rows: ShopActivationRow[];
};

export type ShopActivationSnapshotFile = {
  path: string;
  snapshot: ShopActivationSnapshot | null;
  error: string | null;
};

export type ShopActivationDatabase = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  $transaction<T>(
    callback: (tx: ShopActivationDatabase) => Promise<T>,
    options?: { maxWait?: number; timeout?: number }
  ): Promise<T>;
};

export type ShopActivationDiff = {
  /** Snapshot rows that are missing from the database. */
  missing: ShopActivationRow[];
  /** Run-owned rows that would be removed because the snapshot did not contain them. */
  extra: ShopActivationRow[];
  /** Same scope, but the stored row no longer matches the snapshot. */
  changed: ShopActivationRow[];
  /** Extra/changed rows that are not tagged with this run id. */
  blocking: ShopActivationRow[];
  identical: boolean;
};

export type ShopActivationRestoreResult = {
  changed: boolean;
  restored: number;
  added: number;
  removed: number;
  changedRows: number;
  forced: ShopActivationRow[];
  verification: { ok: boolean; matched: number; expected: number };
  /** Audit rows written inside the same transaction as the restore. */
  audit: { action: string; auditId: string; systemEventId: string } | null;
};

/** Identity of a conflicting row observed by the caller's preflight plan. */
export type ShopActivationBlockingFingerprint = {
  id: string;
  status: string;
  reason: string | null;
  updatedAt: string;
};

export class ShopActivationSnapshotError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ShopActivationSnapshotError";
    this.code = code;
  }
}

const RUN_REASON_PATTERN = /^\[run:([A-Za-z0-9][A-Za-z0-9._-]{0,79})\]/;

function fail(code: string, message: string): never {
  throw new ShopActivationSnapshotError(code, message);
}

export function isValidRunId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value);
}

/** The run id embedded in a run-owned reason, or null for an operator reason. */
export function runIdFromReason(reason: string | null | undefined): string | null {
  const match = RUN_REASON_PATTERN.exec(String(reason ?? ""));
  return match?.[1] ?? null;
}

export function isRunOwnedReason(reason: string | null | undefined): boolean {
  return runIdFromReason(reason) !== null;
}

export function scopeKey(row: Pick<ShopActivationRow, "scopeType" | "countryCode" | "cityCode">): string {
  return `${row.scopeType}|${row.countryCode.trim().toUpperCase()}|${row.cityCode.trim().toLowerCase()}`;
}

function isoDate(value: Date | string, field: string, id: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    fail("invalid_snapshot", `Row ${id} has an invalid ${field} timestamp.`);
  }
  return date.toISOString();
}

function normaliseScopeType(value: string, id: string): ShopActivationScope {
  const scope = String(value ?? "").trim().toUpperCase();
  if (!(SHOP_ACTIVATION_SCOPES as readonly string[]).includes(scope)) {
    fail("invalid_snapshot", `Row ${id} has an unrecognised scope type ${value}.`);
  }
  return scope as ShopActivationScope;
}

function normaliseStatus(value: string, id: string): ShopActivationStatus {
  const status = String(value ?? "").trim().toUpperCase();
  if (!(SHOP_ACTIVATION_STATUSES as readonly string[]).includes(status)) {
    fail("invalid_snapshot", `Row ${id} has an unrecognised status ${value}.`);
  }
  return status as ShopActivationStatus;
}

/** Convert database rows into the exact, sorted snapshot representation. */
export function normaliseShopActivationRows(rows: ShopActivationRowInput[]): ShopActivationRow[] {
  const normalised = rows.map((row) => {
    if (!row.id) fail("invalid_snapshot", "An activation row has no id.");
    if (row.verticalKey !== SHOP_VERTICAL_KEY) {
      fail("invalid_snapshot", `Row ${row.id} belongs to ${row.verticalKey}, not shop.`);
    }
    const scopeType = normaliseScopeType(row.scopeType, row.id);
    const countryCode = String(row.countryCode ?? "").trim().toUpperCase();
    const cityCode = String(row.cityCode ?? "").trim().toLowerCase();
    if (scopeType === "GLOBAL" && (countryCode || cityCode)) {
      fail("invalid_snapshot", `GLOBAL row ${row.id} unexpectedly carries a location.`);
    }
    if (scopeType === "COUNTRY" && (!countryCode || cityCode)) {
      fail("invalid_snapshot", `COUNTRY row ${row.id} has an invalid location.`);
    }
    if (scopeType === "CITY" && (!countryCode || !cityCode)) {
      fail("invalid_snapshot", `CITY row ${row.id} has an invalid location.`);
    }
    return {
      id: row.id,
      verticalKey: SHOP_VERTICAL_KEY,
      scopeType,
      countryCode,
      cityCode,
      status: normaliseStatus(row.status, row.id),
      reason: row.reason ?? null,
      updatedById: row.updatedById ?? null,
      createdAt: isoDate(row.createdAt, "createdAt", row.id),
      updatedAt: isoDate(row.updatedAt, "updatedAt", row.id)
    } satisfies ShopActivationRow;
  });

  const seenScope = new Map<string, string>();
  for (const row of normalised) {
    const key = scopeKey(row);
    const previous = seenScope.get(key);
    if (previous) {
      fail("duplicate_scope", `Activation rows ${previous} and ${row.id} share scope ${key}.`);
    }
    seenScope.set(key, row.id);
  }

  return normalised.sort((a, b) => scopeKey(a).localeCompare(scopeKey(b)) || a.id.localeCompare(b.id));
}

function rowsIdentical(left: ShopActivationRow, right: ShopActivationRow): boolean {
  return (
    left.id === right.id &&
    left.verticalKey === right.verticalKey &&
    left.scopeType === right.scopeType &&
    left.countryCode === right.countryCode &&
    left.cityCode === right.cityCode &&
    left.status === right.status &&
    (left.reason ?? null) === (right.reason ?? null) &&
    (left.updatedById ?? null) === (right.updatedById ?? null) &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt
  );
}

function firstRowDifference(left: ShopActivationRow, right: ShopActivationRow): string {
  const fields: Array<keyof ShopActivationRow> = [
    "id",
    "verticalKey",
    "scopeType",
    "countryCode",
    "cityCode",
    "status",
    "reason",
    "updatedById",
    "createdAt",
    "updatedAt"
  ];
  for (const field of fields) {
    if (left[field] !== right[field]) {
      return `${String(field)} stored=${JSON.stringify(left[field])} expected=${JSON.stringify(right[field])}`;
    }
  }
  return "row differs";
}

export function shopActivationRowsMatch(
  actual: ShopActivationRowInput[],
  expected: ShopActivationRow[]
): { ok: boolean; matched: number; expected: number; mismatch: string | null } {
  const actualRows = normaliseShopActivationRows(actual);
  const expectedByScope = new Map(expected.map((row) => [scopeKey(row), row]));
  let matched = 0;
  for (const row of actualRows) {
    const wanted = expectedByScope.get(scopeKey(row));
    if (!wanted) return { ok: false, matched, expected: expected.length, mismatch: `unexpected row ${scopeKey(row)}` };
    if (!rowsIdentical(row, wanted)) {
      return {
        ok: false,
        matched,
        expected: expected.length,
        mismatch: `row ${scopeKey(row)} differs (${firstRowDifference(row, wanted)})`
      };
    }
    matched += 1;
  }
  if (matched !== expected.length) {
    const actualScopes = new Set(actualRows.map(scopeKey));
    const missing = expected.find((row) => !actualScopes.has(scopeKey(row)));
    return {
      ok: false,
      matched,
      expected: expected.length,
      mismatch: missing ? `missing row ${scopeKey(missing)}` : `expected ${expected.length} rows, found ${matched}`
    };
  }
  return { ok: true, matched, expected: expected.length, mismatch: null };
}

export function defaultShopActivationSnapshotDir(root = process.cwd()): string {
  return resolve(root, SHOP_ACTIVATION_SNAPSHOT_DIR);
}

export function shopActivationSnapshotPath(runId: string, root = process.cwd()): string {
  if (!isValidRunId(runId)) fail("invalid_run_id", `Refusing an unsafe run id: ${runId}`);
  return join(defaultShopActivationSnapshotDir(root), `${SHOP_ACTIVATION_SNAPSHOT_PREFIX}${runId}.json`);
}

export function buildShopActivationSnapshot(input: {
  runId: string;
  database: string;
  rows: ShopActivationRowInput[];
  capturedAt?: Date;
}): ShopActivationSnapshot {
  if (!isValidRunId(input.runId)) fail("invalid_run_id", `Refusing an unsafe run id: ${input.runId}`);
  if (!input.database) fail("invalid_snapshot", "The snapshot database name is required.");
  return {
    version: SHOP_ACTIVATION_SNAPSHOT_VERSION,
    kind: SHOP_ACTIVATION_SNAPSHOT_KIND,
    verticalKey: SHOP_VERTICAL_KEY,
    runId: input.runId,
    database: input.database,
    capturedAt: (input.capturedAt ?? new Date()).toISOString(),
    rows: normaliseShopActivationRows(input.rows)
  };
}

function validateSnapshot(value: unknown, source: string): ShopActivationSnapshot {
  if (!value || typeof value !== "object") fail("invalid_snapshot", `${source} is not a JSON object.`);
  const candidate = value as Partial<ShopActivationSnapshot> & Record<string, unknown>;
  if (candidate.kind !== SHOP_ACTIVATION_SNAPSHOT_KIND) fail("invalid_snapshot", `${source} has the wrong kind.`);
  if (candidate.version !== SHOP_ACTIVATION_SNAPSHOT_VERSION) {
    fail("invalid_snapshot", `${source} has unsupported version ${String(candidate.version)}.`);
  }
  if (candidate.verticalKey !== SHOP_VERTICAL_KEY) fail("invalid_snapshot", `${source} is not a Shop snapshot.`);
  const runId = String(candidate.runId ?? "");
  if (!isValidRunId(runId)) fail("invalid_snapshot", `${source} has an unsafe run id.`);
  const database = String(candidate.database ?? "").trim();
  if (!database) fail("invalid_snapshot", `${source} does not name its database.`);
  const captured = new Date(String(candidate.capturedAt ?? ""));
  if (Number.isNaN(captured.getTime())) fail("invalid_snapshot", `${source} has an invalid capturedAt.`);
  if (!Array.isArray(candidate.rows)) fail("invalid_snapshot", `${source} has no rows array.`);
  const rows = normaliseShopActivationRows(candidate.rows as ShopActivationRowInput[]);
  const fileName = source.replace(/\\/g, "/").split("/").pop() ?? "";
  const expectedName = `${SHOP_ACTIVATION_SNAPSHOT_PREFIX}${runId}.json`;
  if (fileName.endsWith(".json") && fileName !== expectedName) {
    fail("snapshot_name_mismatch", `${source} is named for a different run id (${runId}).`);
  }
  return {
    version: SHOP_ACTIVATION_SNAPSHOT_VERSION,
    kind: SHOP_ACTIVATION_SNAPSHOT_KIND,
    verticalKey: SHOP_VERTICAL_KEY,
    runId,
    database,
    capturedAt: captured.toISOString(),
    rows
  };
}

/**
 * Persist the exact prior rows. The write is atomic (temp file + rename) and
 * owner-only, and an existing file is never overwritten because that could
 * destroy the only recoverable copy of an earlier interrupted run.
 */
export function writeShopActivationSnapshot(
  snapshot: ShopActivationSnapshot,
  options: { path?: string; overwrite?: boolean } = {}
): string {
  const validated = validateSnapshot(snapshot, options.path ?? "(in-memory)");
  const path = options.path ?? shopActivationSnapshotPath(validated.runId);
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path) && !options.overwrite) {
    fail("snapshot_exists", `Refusing to overwrite ${path}; recover or remove it explicitly first.`);
  }
  const temporary = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(validated, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, path);
  return path;
}

export function readShopActivationSnapshot(path: string): ShopActivationSnapshot {
  const absolute = resolve(path);
  if (!existsSync(absolute)) fail("snapshot_missing", `No activation snapshot exists at ${absolute}.`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(absolute, "utf8"));
  } catch (error) {
    fail("invalid_snapshot", `Cannot read ${absolute}: ${(error as Error).message}`);
  }
  return validateSnapshot(parsed, absolute);
}

export function listShopActivationSnapshots(root = process.cwd()): ShopActivationSnapshotFile[] {
  const dir = defaultShopActivationSnapshotDir(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.startsWith(SHOP_ACTIVATION_SNAPSHOT_PREFIX) && name.endsWith(".json"))
    .map((name) => {
      const path = join(dir, name);
      try {
        return { path, snapshot: readShopActivationSnapshot(path), error: null };
      } catch (error) {
        return { path, snapshot: null, error: (error as Error).message };
      }
    })
    .sort((a, b) => {
      const left = a.snapshot?.capturedAt ?? "";
      const right = b.snapshot?.capturedAt ?? "";
      return right.localeCompare(left) || a.path.localeCompare(b.path);
    });
}

/** Delete a snapshot only after the caller has verified the restoration. */
export function deleteShopActivationSnapshot(path: string): boolean {
  const absolute = resolve(path);
  if (!existsSync(absolute)) return false;
  rmSync(absolute, { force: true });
  return true;
}

export async function readShopActivationRows(db: ShopActivationDatabase): Promise<ShopActivationRowInput[]> {
  return db.$queryRawUnsafe<ShopActivationRowInput[]>(
    `SELECT id, "verticalKey", "scopeType", "countryCode", "cityCode", status, reason,
            "updatedById", "createdAt", "updatedAt"
       FROM "VerticalActivation"
      WHERE "verticalKey" = $1
      ORDER BY "scopeType", "countryCode", "cityCode", id`,
    SHOP_VERTICAL_KEY
  );
}

export function diffShopActivationRows(
  current: ShopActivationRowInput[],
  snapshot: ShopActivationSnapshot
): ShopActivationDiff {
  const currentRows = normaliseShopActivationRows(current);
  const expectedByScope = new Map(snapshot.rows.map((row) => [scopeKey(row), row]));
  const currentByScope = new Map(currentRows.map((row) => [scopeKey(row), row]));

  const extra = currentRows.filter((row) => !expectedByScope.has(scopeKey(row)));
  const missing = snapshot.rows.filter((row) => !currentByScope.has(scopeKey(row)));
  const changed = currentRows.filter((row) => {
    const wanted = expectedByScope.get(scopeKey(row));
    return Boolean(wanted) && !rowsIdentical(row, wanted as ShopActivationRow);
  });
  const blocking = [...extra, ...changed].filter((row) => runIdFromReason(row.reason) !== snapshot.runId);

  return {
    missing,
    extra,
    changed,
    blocking,
    identical: missing.length === 0 && extra.length === 0 && changed.length === 0
  };
}

function describeRow(row: ShopActivationRow | ShopActivationRowInput): string {
  return `${row.scopeType}:${row.countryCode || "*"}:${row.cityCode || "*"} ${row.status} (${row.id}) reason=${JSON.stringify(
    row.reason ?? null
  )}`;
}

function describeRows(rows: ShopActivationRow[]): string {
  return rows.map(describeRow).join("; ");
}

/**
 * The Prisma schema maps `DateTime` to PostgreSQL `timestamp without time
 * zone`; Prisma writes and reads those values as UTC. Cast the ISO snapshot
 * string to `timestamp` (not `timestamptz`) so the exact UTC wall-clock value
 * is preserved instead of being converted through the database session's
 * timezone.
 */
const INSERT_ROW_SQL = `INSERT INTO "VerticalActivation"
  (id, "verticalKey", "scopeType", "countryCode", "cityCode", status, reason, "updatedById", "createdAt", "updatedAt")
  VALUES ($1, $2, $3, $4, $5, $6::"VerticalActivationStatus", $7, $8, $9::timestamp, $10::timestamp)`;

async function insertSnapshotRow(tx: ShopActivationDatabase, row: ShopActivationRow): Promise<void> {
  await tx.$executeRawUnsafe(
    INSERT_ROW_SQL,
    row.id,
    row.verticalKey,
    row.scopeType,
    row.countryCode,
    row.cityCode,
    row.status,
    row.reason,
    row.updatedById,
    row.createdAt,
    row.updatedAt
  );
}

/**
 * Serialize activation recovery against every other writer.
 *
 * `LOCK TABLE ... IN EXCLUSIVE MODE` conflicts with the ROW EXCLUSIVE lock a
 * normal INSERT/UPDATE/DELETE takes, so a concurrent operator write either
 * commits before the restore reads (and is seen by the conflict check) or waits
 * until the restore commits. A separate read-then-write transaction previously
 * left a window where an operator row inserted after the check was deleted by
 * the snapshot restore.
 *
 * The statement lock_timeout bounds a stuck queue; the interactive transaction
 * timeout is raised above it in `$transaction` options.
 */
async function lockShopActivationTable(tx: ShopActivationDatabase): Promise<void> {
  await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '5s'`);
  await tx.$executeRawUnsafe(`LOCK TABLE "VerticalActivation" IN EXCLUSIVE MODE`);
}

function auditId(prefix: string): string {
  return `${prefix}_${randomBytes(16).toString("hex")}`;
}

/**
 * Write the restore/discard decision into the same transaction as the row
 * change. `AuditLog` and `SystemEvent` are the existing Control Center audit
 * surfaces; no new table is required for this operational action. The actor is
 * deliberately null: recovery is an operator action run through the guarded CLI
 * and the reason/force decision is captured in metadata.
 */
async function recordActivationAudit(
  tx: ShopActivationDatabase,
  input: {
    action: "vertical.activation_restored" | "vertical.activation_discarded";
    entityId: string | null;
    metadata: Record<string, unknown>;
  }
): Promise<{ action: string; auditId: string; systemEventId: string }> {
  const audit = auditId("act");
  const event = auditId("evt");
  const metadata = JSON.stringify(input.metadata);
  await tx.$executeRawUnsafe(
    `INSERT INTO "AuditLog" (id, "actorId", action, entity, "entityId", metadata, "createdAt")
     VALUES ($1, NULL, $2, 'VerticalActivation', $3, $4::jsonb, NOW())`,
    audit,
    input.action,
    input.entityId,
    metadata
  );
  await tx.$executeRawUnsafe(
    `INSERT INTO "SystemEvent" (id, type, "actorId", entity, "entityId", payload, "createdAt")
     VALUES ($1, $2, NULL, 'VerticalActivation', $3, $4::jsonb, NOW())`,
    event,
    input.action,
    input.entityId,
    metadata
  );
  return { action: input.action, auditId: audit, systemEventId: event };
}

export function shopActivationBlockingFingerprint(row: ShopActivationRowInput): ShopActivationBlockingFingerprint {
  return {
    id: row.id,
    status: String(row.status ?? "").toUpperCase(),
    reason: row.reason ?? null,
    updatedAt: new Date(row.updatedAt).toISOString()
  };
}

/**
 * Restore the exact snapshot rows.
 *
 * `currentDatabase` must be the actual database name (`current_database()`),
 * not a guessed environment value. A mismatch, or a non-run-owned conflict,
 * refuses the restore.
 *
 * The conflict check and the delete/insert now run inside one transaction under
 * an exclusive table lock, and the row-for-row verification happens before the
 * commit. An operator write that committed before the lock is included in the
 * diff; a write that arrives during the restore waits for the commit. Pass
 * `force: true` only after inspecting the reported conflicts. When
 * `expectedBlocking` is supplied with force, every forced row must still match
 * the fingerprint the caller planned against — a row that appeared or changed
 * after the plan refuses the restore instead of being silently overwritten.
 */
export async function restoreShopActivationSnapshot(input: {
  db: ShopActivationDatabase;
  snapshot: ShopActivationSnapshot;
  currentDatabase: string;
  force?: boolean;
  /** Blocking rows the caller saw during its preflight plan. */
  expectedBlocking?: ShopActivationBlockingFingerprint[];
}): Promise<ShopActivationRestoreResult> {
  const snapshot = validateSnapshot(input.snapshot, input.snapshot?.runId ? `run ${input.snapshot.runId}` : "(snapshot)");
  if (!input.currentDatabase) fail("database_unknown", "The connected database name is required before restoring.");
  if (snapshot.database !== input.currentDatabase) {
    fail(
      "database_mismatch",
      `Snapshot was taken on "${snapshot.database}" but this connection is "${input.currentDatabase}"; refusing cross-database restore.`
    );
  }

  return input.db.$transaction(
    async (tx) => {
      // Re-read only after the exclusive lock: this read is the authoritative
      // conflict check, and no operator write can slip between it and the
      // delete/insert below.
      await lockShopActivationTable(tx);
      const before = await readShopActivationRows(tx);
      const diff = diffShopActivationRows(before, snapshot);

      if (diff.blocking.length > 0) {
        if (!input.force) {
          fail(
            "snapshot_conflict",
            `Refusing to overwrite ${diff.blocking.length} row(s) not owned by run ${snapshot.runId}: ${describeRows(
              diff.blocking
            )}. Inspect and pass force explicitly if removal is intended.`
          );
        }
        if (input.expectedBlocking) {
          const planned = new Map(input.expectedBlocking.map((row) => [row.id, row]));
          const unplanned = diff.blocking.filter((row) => {
            const wanted = planned.get(row.id);
            const actual = shopActivationBlockingFingerprint(row);
            return (
              !wanted ||
              wanted.status !== actual.status ||
              wanted.reason !== actual.reason ||
              wanted.updatedAt !== actual.updatedAt
            );
          });
          if (unplanned.length > 0) {
            fail(
              "snapshot_conflict_changed",
              `Concurrent operator change detected after the preflight plan: ${describeRows(
                unplanned
              )}. Nothing was modified. Re-run the plan and inspect the current rows before forcing.`
            );
          }
        }
      }

      if (diff.identical) {
        return {
          changed: false,
          restored: snapshot.rows.length,
          added: 0,
          removed: 0,
          changedRows: 0,
          forced: [],
          verification: { ok: true, matched: snapshot.rows.length, expected: snapshot.rows.length },
          audit: null
        };
      }

      const forced = [...diff.extra, ...diff.changed].filter(
        (row) => runIdFromReason(row.reason) !== snapshot.runId
      );
      await tx.$executeRawUnsafe(`DELETE FROM "VerticalActivation" WHERE "verticalKey" = $1`, SHOP_VERTICAL_KEY);
      for (const row of snapshot.rows) {
        await insertSnapshotRow(tx, row);
      }

      // A failure here rolls back the delete/insert entirely, so an
      // interrupted restore leaves the prior rows untouched instead of a
      // half-restored table.
      const after = await readShopActivationRows(tx);
      const verification = shopActivationRowsMatch(after, snapshot.rows);
      if (!verification.ok) {
        fail(
          "restore_verification_failed",
          `Restoration did not reproduce the snapshot: ${verification.mismatch ?? "unknown mismatch"}. The transaction was rolled back and the snapshot file must be kept.`
        );
      }

      const audit = await recordActivationAudit(tx, {
        action: "vertical.activation_restored",
        entityId: snapshot.rows[0]?.id ?? null,
        metadata: {
          runId: snapshot.runId,
          database: input.currentDatabase,
          verticalKey: SHOP_VERTICAL_KEY,
          capturedAt: snapshot.capturedAt,
          added: diff.missing.length,
          removed: diff.extra.length,
          overwritten: diff.changed.length,
          restoredRows: snapshot.rows.length,
          forced: forced.map((row) => ({
            id: row.id,
            scopeType: row.scopeType,
            countryCode: row.countryCode,
            cityCode: row.cityCode,
            status: row.status,
            reason: row.reason,
            updatedAt: row.updatedAt
          })),
          verification: { matched: verification.matched, expected: verification.expected }
        }
      });

      return {
        changed: true,
        restored: snapshot.rows.length,
        added: diff.missing.length,
        removed: diff.extra.length,
        changedRows: diff.changed.length,
        forced,
        verification: { ok: true, matched: verification.matched, expected: verification.expected },
        audit
      };
    },
    { maxWait: 10_000, timeout: 20_000 }
  );
}

export async function restoreShopActivationSnapshotFromFile(input: {
  db: ShopActivationDatabase;
  path: string;
  currentDatabase: string;
  force?: boolean;
  expectedBlocking?: ShopActivationBlockingFingerprint[];
}): Promise<{ snapshot: ShopActivationSnapshot; result: ShopActivationRestoreResult }> {
  const snapshot = readShopActivationSnapshot(input.path);
  const result = await restoreShopActivationSnapshot({
    db: input.db,
    snapshot,
    currentDatabase: input.currentDatabase,
    force: input.force,
    expectedBlocking: input.expectedBlocking
  });
  return { snapshot, result };
}

/** Read the connected database name without printing the connection string. */
export async function currentShopActivationDatabase(db: ShopActivationDatabase): Promise<string> {
  const rows = await db.$queryRawUnsafe<Array<{ database: string }>>("SELECT current_database() AS database");
  return rows[0]?.database ?? "";
}

/**
 * Remove rows whose reasons carry an explicit run tag. Never touches operator
 * rows: this is the fallback when an interrupted run left a rule but its
 * snapshot file was lost, and it is always limited to `[run:<id>]` rows.
 */
export async function discardRunOwnedShopActivation(input: {
  db: ShopActivationDatabase;
  runId?: string;
  allRuns?: boolean;
  /** Actual connected database name, recorded in the audit payload. */
  currentDatabase?: string;
}): Promise<{
  matched: ShopActivationRow[];
  deleted: number;
  audit: { action: string; auditId: string; systemEventId: string } | null;
}> {
  if (!input.runId && !input.allRuns) {
    fail("run_id_required", "Pass an explicit run id or allRuns=true; operator rows are never removed by this helper.");
  }
  if (input.runId && !isValidRunId(input.runId)) fail("invalid_run_id", `Refusing an unsafe run id: ${input.runId}`);

  return input.db.$transaction(
    async (tx) => {
      // The filter and the delete must observe the same rows. Without the lock
      // an operator changing a row's reason between them would let this helper
      // delete a row that is no longer run-owned.
      await lockShopActivationTable(tx);
      const rows = normaliseShopActivationRows(await readShopActivationRows(tx));
      const matched = rows.filter((row) => {
        const tag = runIdFromReason(row.reason);
        if (input.runId) return tag === input.runId;
        return tag !== null;
      });
      if (matched.length === 0) return { matched: [], deleted: 0, audit: null };
      const ids = matched.map((row) => row.id);
      await tx.$executeRawUnsafe(
        `DELETE FROM "VerticalActivation" WHERE "verticalKey" = $1 AND id = ANY($2::text[])`,
        SHOP_VERTICAL_KEY,
        ids
      );
      const remaining = normaliseShopActivationRows(await readShopActivationRows(tx)).filter((row) =>
        ids.includes(row.id)
      );
      if (remaining.length > 0) {
        fail(
          "discard_verification_failed",
          `Run-owned rows ${remaining.map((row) => row.id).join(", ")} remain after the discard. The transaction was rolled back.`
        );
      }
      const audit = await recordActivationAudit(tx, {
        action: "vertical.activation_discarded",
        entityId: ids[0] ?? null,
        metadata: {
          database: input.currentDatabase ?? null,
          verticalKey: SHOP_VERTICAL_KEY,
          runId: input.runId ?? null,
          allRuns: Boolean(input.allRuns),
          deleted: ids.length,
          rows: matched.map((row) => ({
            id: row.id,
            scopeType: row.scopeType,
            countryCode: row.countryCode,
            cityCode: row.cityCode,
            status: row.status,
            reason: row.reason,
            updatedAt: row.updatedAt
          }))
        }
      });
      return { matched, deleted: ids.length, audit };
    },
    { maxWait: 10_000, timeout: 20_000 }
  );
}

export function formatShopActivationSnapshotSummary(snapshot: ShopActivationSnapshot): string {
  return `run=${snapshot.runId} database=${snapshot.database} capturedAt=${snapshot.capturedAt} rows=${snapshot.rows.length}`;
}

export function formatShopActivationRow(row: ShopActivationRow | ShopActivationRowInput): string {
  return describeRow(row);
}
