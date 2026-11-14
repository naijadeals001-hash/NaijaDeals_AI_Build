/**
 * Exclusive lease for acceptance suites that mutate shared REVIEW state.
 *
 * The Shop activation suite replaces `VerticalActivation` rows, and the variant
 * concurrency/management suites create and delete catalogue rows and assert
 * exact before/after counts. Two of those suites running at once can make one
 * suite observe another suite's fixtures, and an interrupted activation run can
 * be mistaken for an operator pause. This module serialises them without
 * touching `VerticalActivation` itself.
 *
 * Safety contract:
 *  - one lease file, created exclusively; a second live owner is refused with
 *    the holder's owner, run id and expiry (never a connection string);
 *  - a lease is bounded: after `expiresAt` a new owner may take over, and the
 *    previous holder is recorded in the takeover result;
 *  - an owner may only release its own lease; an expired lease taken over by a
 *    different process is never deleted by the old handle;
 *  - corrupted/unknown lease files block acquisition instead of being
 *    overwritten, so an inspection is always possible;
 *  - the module is filesystem-only. It never reads or writes
 *    `VerticalActivation` or any financial row. Restoring Shop activation stays
 *    with `shop-activation-snapshot.ts` / `recover-shop-activation.ts`, which
 *    continue to refuse an operator DISABLED rule;
 *  - `registerExitCleanup` removes the lease on a normal exit and on
 *    `process.exit()`. SIGKILL/taskkill cannot run cleanup; bounded expiry is
 *    the recovery path for that case.
 *
 * The file lives under the ignored `qa-artifacts/` tree by default. Callers
 * must pass the same `path` to release/renew/read operations.
 */
import {
  constants as fsConstants,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { randomBytes } from "node:crypto";
import { hostname as osHostname, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const REVIEW_TEST_LEASE_VERSION = 1 as const;
export const REVIEW_TEST_LEASE_KIND = "naijadeals.review-test.lease" as const;
/**
 * A host-global directory, not a repository path: two checkouts/worktrees on
 * the same host can target the same REVIEW database, and a repo-local lease
 * would let both run at once. The directory is keyed per database below.
 */
export const REVIEW_TEST_LEASE_DIR = join(tmpdir(), "naijadeals-acceptance-lease");
export const REVIEW_TEST_LEASE_FILE = "acceptance.lease.json";
export const DEFAULT_REVIEW_TEST_LEASE_TTL_MS = 60 * 60 * 1000;
export const MAX_REVIEW_TEST_LEASE_TTL_MS = 24 * 60 * 60 * 1000;
/** Explicit short TTLs are useful for expiry tests; environment overrides must not be tiny. */
export const MIN_REVIEW_TEST_LEASE_TTL_MS = 50;
const MIN_ENV_REVIEW_TEST_LEASE_TTL_MS = 60_000;

const OWNER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

export type ReviewTestLeasePayload = {
  version: typeof REVIEW_TEST_LEASE_VERSION;
  kind: typeof REVIEW_TEST_LEASE_KIND;
  owner: string;
  runId: string;
  pid: number;
  hostname: string;
  purpose: string;
  database: string | null;
  classification: string | null;
  acquiredAt: string;
  expiresAt: string;
};

export type ReviewTestLeaseState =
  | { status: "missing"; path: string }
  | { status: "active"; path: string; lease: ReviewTestLeasePayload; remainingMs: number }
  | { status: "expired"; path: string; lease: ReviewTestLeasePayload; expiredMs: number }
  | { status: "invalid"; path: string; error: string };

export type ReviewTestLeaseHandle = {
  path: string;
  lease: ReviewTestLeasePayload;
  /** The expired lease displaced by this acquisition, if any. */
  takeover: ReviewTestLeasePayload | null;
  /** True while this exact owner/run/pid/hostname still owns the file. */
  isHeld(): boolean;
  /** Delete only this owner's lease. False when the file is missing or foreign. */
  release(): boolean;
  /** Synchronous alias for signal/exit paths. */
  releaseSync(): boolean;
};

export class ReviewTestLeaseError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ReviewTestLeaseError";
    this.code = code;
  }
}

function fail(code: string, message: string): never {
  throw new ReviewTestLeaseError(code, message);
}

export function defaultReviewTestLeasePath(database?: string | null): string {
  const key = String(database ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return resolve(join(REVIEW_TEST_LEASE_DIR, `${key || "all"}.${REVIEW_TEST_LEASE_FILE}`));
}

export function isValidReviewTestLeaseOwner(value: string): boolean {
  return OWNER_PATTERN.test(value);
}

function normaliseTtl(value: number | undefined): number {
  if (value === undefined) {
    const fromEnv = Number(process.env.REVIEW_TEST_LEASE_TTL_MS ?? "");
    if (Number.isFinite(fromEnv) && fromEnv >= MIN_ENV_REVIEW_TEST_LEASE_TTL_MS) {
      return Math.min(Math.trunc(fromEnv), MAX_REVIEW_TEST_LEASE_TTL_MS);
    }
    return DEFAULT_REVIEW_TEST_LEASE_TTL_MS;
  }
  if (!Number.isFinite(value) || value < MIN_REVIEW_TEST_LEASE_TTL_MS) {
    fail("invalid_lease_ttl", `A lease TTL must be at least ${MIN_REVIEW_TEST_LEASE_TTL_MS} ms.`);
  }
  if (value > MAX_REVIEW_TEST_LEASE_TTL_MS) {
    fail("invalid_lease_ttl", `A lease TTL may not exceed ${MAX_REVIEW_TEST_LEASE_TTL_MS} ms.`);
  }
  return Math.trunc(value);
}

function parsePayload(value: unknown, path: string): ReviewTestLeasePayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("lease_invalid", `${path} does not contain a lease object.`);
  }
  const row = value as Record<string, unknown>;
  if (row.kind !== REVIEW_TEST_LEASE_KIND) fail("lease_invalid", `${path} has the wrong lease kind.`);
  if (row.version !== REVIEW_TEST_LEASE_VERSION) {
    fail("lease_invalid", `${path} has unsupported lease version ${String(row.version)}.`);
  }
  const owner = String(row.owner ?? "").trim();
  const runId = String(row.runId ?? "").trim();
  if (!isValidReviewTestLeaseOwner(owner) || !isValidReviewTestLeaseOwner(runId)) {
    fail("lease_invalid", `${path} has an unsafe owner or run id.`);
  }
  const pid = Number(row.pid);
  if (!Number.isSafeInteger(pid) || pid <= 0) fail("lease_invalid", `${path} has an invalid pid.`);
  const acquired = new Date(String(row.acquiredAt ?? ""));
  const expires = new Date(String(row.expiresAt ?? ""));
  if (Number.isNaN(acquired.getTime()) || Number.isNaN(expires.getTime())) {
    fail("lease_invalid", `${path} has an invalid timestamp.`);
  }
  if (expires.getTime() <= acquired.getTime()) {
    fail("lease_invalid", `${path} expires before it was acquired.`);
  }
  return {
    version: REVIEW_TEST_LEASE_VERSION,
    kind: REVIEW_TEST_LEASE_KIND,
    owner,
    runId,
    pid,
    hostname: String(row.hostname ?? "").trim() || "(unknown-host)",
    purpose: String(row.purpose ?? "").trim().slice(0, 300) || "(no purpose recorded)",
    database: row.database === null || row.database === undefined ? null : String(row.database).trim() || null,
    classification:
      row.classification === null || row.classification === undefined
        ? null
        : String(row.classification).trim().toUpperCase() || null,
    acquiredAt: acquired.toISOString(),
    expiresAt: expires.toISOString()
  };
}

export function readReviewTestLease(
  path: string = defaultReviewTestLeasePath(),
  options: { at?: Date } = {}
): ReviewTestLeaseState {
  const absolute = resolve(path);
  if (!existsSync(absolute)) return { status: "missing", path: absolute };
  let payload: ReviewTestLeasePayload;
  try {
    payload = parsePayload(JSON.parse(readFileSync(absolute, "utf8")), absolute);
  } catch (error) {
    const message = error instanceof ReviewTestLeaseError ? error.message : `Cannot read ${absolute}.`;
    return { status: "invalid", path: absolute, error: message };
  }
  const now = (options.at ?? new Date()).getTime();
  const expires = new Date(payload.expiresAt).getTime();
  if (expires <= now) {
    return { status: "expired", path: absolute, lease: payload, expiredMs: now - expires };
  }
  return { status: "active", path: absolute, lease: payload, remainingMs: expires - now };
}

export function formatReviewTestLeaseSummary(lease: ReviewTestLeasePayload): string {
  const location = lease.database ? `${lease.database}/${lease.classification ?? "UNKNOWN"}` : "(no database)";
  return `owner=${lease.owner} run=${lease.runId} pid=${lease.pid} host=${lease.hostname} db=${location} expiresAt=${lease.expiresAt}`;
}

function activeErrorMessage(lease: ReviewTestLeasePayload): string {
  return (
    `Another acceptance run holds the review test lease: ${formatReviewTestLeaseSummary(lease)}. ` +
    `purpose=${JSON.stringify(lease.purpose)}. Refusing to run concurrently; wait for it to finish or for the bounded lease to expire.`
  );
}

function writeExclusive(path: string, payload: ReviewTestLeasePayload): void {
  const temporary = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  writeFileSync(temporary, body, { encoding: "utf8", mode: 0o600 });
  try {
    // COPYFILE_EXCL creates the destination only when it does not exist, so two
    // racing owners cannot both acquire. Readers only ever see the complete
    // temporary payload copied into place.
    copyFileSync(temporary, path, fsConstants.COPYFILE_EXCL);
  } finally {
    try {
      unlinkSync(temporary);
    } catch {
      /* best effort */
    }
  }
}

function isSameOwner(
  lease: ReviewTestLeasePayload,
  expected: { owner: string; runId: string; pid: number; hostname: string }
): boolean {
  return (
    lease.owner === expected.owner &&
    lease.runId === expected.runId &&
    lease.pid === expected.pid &&
    lease.hostname === expected.hostname
  );
}

/** Release only the exact owner recorded in the file. Never deletes a foreign lease. */
export function releaseReviewTestLease(input: {
  path: string;
  lease: ReviewTestLeasePayload;
}): boolean {
  const state = readReviewTestLease(input.path);
  if (state.status === "missing") return false;
  if (state.status === "invalid") return false;
  if (
    !isSameOwner(state.lease, {
      owner: input.lease.owner,
      runId: input.lease.runId,
      pid: input.lease.pid,
      hostname: input.lease.hostname
    })
  ) {
    return false;
  }
  try {
    rmSync(state.path, { force: false });
    return true;
  } catch {
    return false;
  }
}

const exitReleases = new Map<string, () => void>();
let exitHookInstalled = false;

function runExitReleases() {
  for (const release of exitReleases.values()) {
    try {
      release();
    } catch {
      /* process is exiting; never throw */
    }
  }
  exitReleases.clear();
}

function registerExitRelease(key: string, release: () => void) {
  exitReleases.set(key, release);
  if (!exitHookInstalled) {
    process.on("exit", runExitReleases);
    exitHookInstalled = true;
  }
}

function unregisterExitRelease(key: string) {
  exitReleases.delete(key);
  if (exitReleases.size === 0 && exitHookInstalled) {
    process.off("exit", runExitReleases);
    exitHookInstalled = false;
  }
}

/**
 * Acquire the exclusive acceptance lease.
 *
 * Refuses with `lease_active` while another owner holds a live lease and with
 * `lease_invalid` when the file cannot be trusted. An expired lease is moved
 * aside atomically and reported in `takeover`; if another process wins the
 * race, acquisition retries and eventually refuses instead of overwriting it.
 */
export function acquireReviewTestLease(input: {
  owner: string;
  runId: string;
  purpose?: string;
  database?: string | null;
  classification?: string | null;
  path?: string;
  ttlMs?: number;
  at?: Date;
  registerExitCleanup?: boolean;
}): ReviewTestLeaseHandle {
  const owner = String(input.owner ?? "").trim();
  const runId = String(input.runId ?? "").trim();
  if (!isValidReviewTestLeaseOwner(owner)) fail("invalid_lease_owner", "The lease owner is empty or contains unsafe characters.");
  if (!isValidReviewTestLeaseOwner(runId)) fail("invalid_lease_run_id", "The lease run id is empty or contains unsafe characters.");
  const path = resolve(input.path ?? defaultReviewTestLeasePath(input.database));
  const ttlMs = normaliseTtl(input.ttlMs);
  const acquiredAt = input.at ?? new Date();
  const payload: ReviewTestLeasePayload = {
    version: REVIEW_TEST_LEASE_VERSION,
    kind: REVIEW_TEST_LEASE_KIND,
    owner,
    runId,
    pid: process.pid,
    hostname: osHostname(),
    purpose: String(input.purpose ?? owner).trim().slice(0, 300) || owner,
    database: input.database?.trim() || null,
    classification: input.classification?.trim().toUpperCase() || null,
    acquiredAt: acquiredAt.toISOString(),
    expiresAt: new Date(acquiredAt.getTime() + ttlMs).toISOString()
  };

  mkdirSync(dirname(path), { recursive: true });

  let takeover: ReviewTestLeasePayload | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const state = readReviewTestLease(path, { at: acquiredAt });
    if (state.status === "active") {
      fail("lease_active", activeErrorMessage(state.lease));
    }
    if (state.status === "invalid") {
      fail(
        "lease_invalid",
        `The review test lease at ${path} cannot be trusted (${state.error}). Inspect or remove it explicitly; acquisition will not overwrite it.`
      );
    }
    if (state.status === "expired") {
      const quarantine = `${path}.expired.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
      try {
        renameSync(path, quarantine);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        fail("lease_io", `Could not move the expired lease aside: ${(error as Error).message}`);
      }
      takeover = state.lease;
      try {
        writeExclusive(path, payload);
        try {
          unlinkSync(quarantine);
        } catch {
          /* best effort */
        }
      } catch (error) {
        // Another owner may have won between our rename and create. Restore the
        // expired file only if the path is still free; otherwise the new owner
        // is authoritative.
        try {
          if (!existsSync(path)) renameSync(quarantine, path);
          else unlinkSync(quarantine);
        } catch {
          /* best effort */
        }
        if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
        fail("lease_io", `Could not create the review test lease: ${(error as Error).message}`);
      }
      return handleFor({ path, payload, takeover, registerExitCleanup: input.registerExitCleanup !== false });
    }

    try {
      writeExclusive(path, payload);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
      fail("lease_io", `Could not create the review test lease: ${(error as Error).message}`);
    }
    return handleFor({ path, payload, takeover, registerExitCleanup: input.registerExitCleanup !== false });
  }

  const finalState = readReviewTestLease(path);
  if (finalState.status === "active") fail("lease_active", activeErrorMessage(finalState.lease));
  fail("lease_contended", `Could not acquire the review test lease at ${path}; another owner kept winning the race.`);
}

function handleFor(input: {
  path: string;
  payload: ReviewTestLeasePayload;
  takeover: ReviewTestLeasePayload | null;
  registerExitCleanup: boolean;
}): ReviewTestLeaseHandle {
  const key = `${input.path}|${input.payload.owner}|${input.payload.runId}|${input.payload.pid}`;
  const release = () => {
    const released = releaseReviewTestLease({ path: input.path, lease: input.payload });
    unregisterExitRelease(key);
    return released;
  };
  if (input.registerExitCleanup) registerExitRelease(key, release);

  return {
    path: input.path,
    lease: input.payload,
    takeover: input.takeover,
    isHeld() {
      const state = readReviewTestLease(input.path);
      return (
        state.status === "active" &&
        isSameOwner(state.lease, {
          owner: input.payload.owner,
          runId: input.payload.runId,
          pid: input.payload.pid,
          hostname: input.payload.hostname
        })
      );
    },
    release,
    releaseSync: release
  };
}

/**
 * Remove an interrupted run's lease explicitly after inspecting it. The caller
 * must name the exact owner/run/pid reported by `describeReviewTestLease`; this
 * is the manual alternative to waiting for bounded expiry. It never removes an
 * operator activation rule and never touches `VerticalActivation`.
 */
export function forceRemoveReviewTestLease(input: {
  path?: string;
  owner: string;
  runId: string;
  pid: number;
}): boolean {
  const path = resolve(input.path ?? defaultReviewTestLeasePath());
  const state = readReviewTestLease(path);
  if (state.status === "missing") return false;
  if (state.status === "invalid") {
    fail("lease_invalid", `Refusing to remove ${path}: ${state.error}`);
  }
  const matches =
    state.lease.owner === input.owner && state.lease.runId === input.runId && state.lease.pid === input.pid;
  if (!matches) {
    fail(
      "lease_owner_mismatch",
      `Refusing to remove ${path}: it belongs to ${formatReviewTestLeaseSummary(state.lease)}, not owner=${input.owner} run=${input.runId} pid=${input.pid}.`
    );
  }
  try {
    rmSync(path, { force: false });
    return true;
  } catch {
    return false;
  }
}

/** Read-only helper used by suites to report the current holder without throwing. */
export function describeReviewTestLease(path: string = defaultReviewTestLeasePath()): string {
  const state = readReviewTestLease(path);
  if (state.status === "missing") return `missing (${state.path})`;
  if (state.status === "invalid") return `invalid (${state.path}): ${state.error}`;
  if (state.status === "expired") {
    return `expired ${Math.max(0, Math.round(state.expiredMs / 1000))}s ago: ${formatReviewTestLeaseSummary(state.lease)}`;
  }
  return `active (${Math.max(0, Math.round(state.remainingMs / 1000))}s left): ${formatReviewTestLeaseSummary(state.lease)}`;
}
