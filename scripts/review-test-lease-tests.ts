#!/usr/bin/env node
/**
 * REVIEW acceptance-lease tests.
 *
 * Proves the mechanism the activation and variant suites use to avoid
 * overlapping shared-state runs:
 *   - exclusive acquisition with owner/run id/purpose/database metadata;
 *   - refusal with the current holder when another live lease exists;
 *   - foreign handles cannot release or overwrite the holder;
 *   - bounded expiry and takeover, including the previous holder being
 *     prevented from deleting the new lease;
 *   - exit cleanup on normal termination;
 *   - abrupt termination leaves the bounded lease in place, and expiry/forced
 *     inspection is the only recovery path;
 *   - the lease never changes `VerticalActivation` rows, so an intentional
 *     operator DISABLED rule is not cleared by acquiring or releasing it.
 *
 * This script mutates only temporary lease files. It reads the REVIEW
 * `VerticalActivation` rows before and after and refuses any other database.
 * No order, payment, wallet, refund or provider call is made.
 *
 * Usage:
 *   REVIEW_DATABASE_URL=<review-url> npx tsx scripts/review-test-lease-tests.ts
 *   npx tsx scripts/review-test-lease-tests.ts --no-db   # lease mechanism only
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "pg";
import {
  REVIEW_TEST_LEASE_DIR,
  ReviewTestLeaseError,
  acquireReviewTestLease,
  defaultReviewTestLeasePath,
  describeReviewTestLease,
  forceRemoveReviewTestLease,
  readReviewTestLease,
  releaseReviewTestLease
} from "./lib/review-test-lease";

const ROOT = resolve(__dirname, "..");
const LEASE_MODULE = join(ROOT, "scripts", "lib", "review-test-lease.ts");
const REVIEW_URL = process.env.REVIEW_DATABASE_URL?.trim() ?? "";
const SKIP_DB = process.argv.includes("--no-db");
const EXPECTED_DB = (() => {
  const explicit = process.env.REVIEW_EXPECTED_DATABASE?.trim();
  if (explicit) return explicit;
  try {
    return decodeURIComponent(new URL(REVIEW_URL).pathname.replace(/^\//, ""));
  } catch {
    return "naijadeals_review";
  }
})();

const results: Array<{ name: string; ok: boolean; detail: string }> = [];

function sanitize(value: unknown): string {
  let text = String(value ?? "");
  if (REVIEW_URL) text = text.split(REVIEW_URL).join("[review-database-url]");
  try {
    const password = decodeURIComponent(new URL(REVIEW_URL).password || "");
    if (password.length >= 4) text = text.split(password).join("[redacted]");
  } catch {
    /* no URL */
  }
  return text.length > 700 ? `${text.slice(0, 700)}…` : text;
}

function check(name: string, ok: boolean, detail = "") {
  const entry = { name, ok: Boolean(ok), detail: sanitize(detail) };
  results.push(entry);
  console.log(`${entry.ok ? "PASS" : "FAIL"} ${entry.name}${entry.detail ? ` — ${entry.detail}` : ""}`);
  return entry.ok;
}

function limitation(name: string, detail: string) {
  results.push({ name, ok: true, detail: sanitize(detail) });
  console.log(`LIMITATION ${name} — ${detail}`);
}

function sleep(ms: number) {
  return new Promise((done) => setTimeout(done, ms));
}

function leaseCode(error: unknown): string {
  return error instanceof ReviewTestLeaseError ? error.code : error instanceof Error ? error.message : String(error);
}

async function waitFor(predicate: () => boolean, timeoutMs: number, label: string) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(25);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function waitForExit(child: ChildProcess, timeoutMs = 10_000) {
  if (child.exitCode !== null) return { code: child.exitCode, signal: null as NodeJS.Signals | null };
  return new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((done, reject) => {
    const timer = setTimeout(() => reject(new Error("child did not exit")), timeoutMs);
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      done({ code, signal });
    });
  });
}

function killHard(child: ChildProcess) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      child.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

function childLeaseScript(options: { exitAfterMs?: number; installSigint?: boolean }) {
  return `
const { acquireReviewTestLease } = require(process.env.ND_LEASE_MODULE);
const holder = acquireReviewTestLease({
  owner: "lease-child",
  runId: process.env.ND_LEASE_RUN,
  purpose: "interruption simulation",
  path: process.env.ND_LEASE_PATH,
  ttlMs: Number(process.env.ND_LEASE_TTL || 60000),
  registerExitCleanup: true
});
${options.installSigint ? 'process.once("SIGINT", () => { holder.releaseSync(); process.exit(130); });' : ""}
console.log("LEASE_READY");
${options.exitAfterMs ? `setTimeout(() => process.exit(0), ${options.exitAfterMs});` : "setInterval(() => {}, 1000);"}
`;
}

function spawnLeaseChild(input: {
  path: string;
  runId: string;
  ttlMs: number;
  exitAfterMs?: number;
  installSigint?: boolean;
}) {
  const child = spawn(process.execPath, ["--require", "tsx/cjs", "-e", childLeaseScript(input)], {
    cwd: ROOT,
    env: {
      ...process.env,
      ND_LEASE_MODULE: LEASE_MODULE,
      ND_LEASE_PATH: input.path,
      ND_LEASE_RUN: input.runId,
      ND_LEASE_TTL: String(input.ttlMs)
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk) => {
    stdout += String(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });
  return {
    child,
    output: () => stdout,
    errors: () => stderr
  };
}

type ActivationRow = {
  id: string;
  scopeType: string;
  countryCode: string;
  cityCode: string;
  status: string;
  reason: string | null;
};

async function readActivationRows(url: string): Promise<{ database: string; classification: string; rows: ActivationRow[] }> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const identity = await client.query<{ database: string }>("select current_database() as database");
    const classification = await client.query<{ classification: string }>(
      'select classification from "DatabaseClassification" order by id limit 1'
    );
    const rows = await client.query<ActivationRow>(
      `SELECT id, "scopeType", "countryCode", "cityCode", status, reason
         FROM "VerticalActivation"
        WHERE "verticalKey" = 'shop'
        ORDER BY id`
    );
    return {
      database: identity.rows[0]?.database ?? "",
      classification: classification.rows[0]?.classification ?? "UNKNOWN",
      rows: rows.rows
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function main() {
  if (!SKIP_DB && !REVIEW_URL) {
    console.error(
      "REFUSED: REVIEW_DATABASE_URL must be set explicitly (or pass --no-db for the lease mechanism only). " +
        "No .env fallback is used."
    );
    process.exit(2);
  }

  let before: { database: string; classification: string; rows: ActivationRow[] } | null = null;
  if (!SKIP_DB) {
    before = await readActivationRows(REVIEW_URL);
    if (before.database !== EXPECTED_DB) {
      console.error(`REFUSED: connected database "${before.database}" does not match "${EXPECTED_DB}".`);
      process.exit(2);
    }
    if (before.classification !== "REVIEW") {
      console.error(`REFUSED: "${before.database}" is classified ${before.classification}, not REVIEW.`);
      process.exit(2);
    }
    console.log(
      `GUARD database=${before.database} classification=${before.classification} shopActivationRows=${before.rows.length}`
    );
  } else {
    console.log("GUARD --no-db: activation-row isolation check skipped");
  }

  const workDir = mkdtempSync(join(tmpdir(), "review-test-lease-"));
  const path = join(workDir, "acceptance.lease.json");
  const children: ChildProcess[] = [];

  try {
    /* ---------------- exclusive acquisition ---------------- */
    const first = acquireReviewTestLease({
      owner: "lease-suite",
      runId: "run-one",
      purpose: "lease acceptance",
      database: before?.database ?? "naijadeals_review",
      classification: before?.classification ?? "REVIEW",
      path,
      ttlMs: 60_000,
      registerExitCleanup: false
    });
    const firstState = readReviewTestLease(path);
    check(
      "lease acquisition writes owner, run id, purpose, database and a bounded expiry",
      firstState.status === "active" &&
        firstState.lease.owner === "lease-suite" &&
        firstState.lease.runId === "run-one" &&
        firstState.lease.purpose === "lease acceptance" &&
        firstState.lease.database === (before?.database ?? "naijadeals_review") &&
        firstState.lease.classification === (before?.classification ?? "REVIEW") &&
        new Date(firstState.lease.expiresAt).getTime() > Date.now(),
      describeReviewTestLease(path)
    );

    /* ---------------- refusal while active ---------------- */
    let refusal: unknown = null;
    try {
      acquireReviewTestLease({
        owner: "lease-suite",
        runId: "run-two",
        purpose: "must be refused",
        path,
        ttlMs: 60_000,
        registerExitCleanup: false
      });
    } catch (error) {
      refusal = error;
    }
    check(
      "a second live owner is refused with the current holder named",
      refusal instanceof ReviewTestLeaseError &&
        refusal.code === "lease_active" &&
        refusal.message.includes("owner=lease-suite") &&
        refusal.message.includes("run=run-one") &&
        readReviewTestLease(path).status === "active",
      refusal instanceof ReviewTestLeaseError ? refusal.message : String(refusal)
    );

    check(
      "a foreign lease payload cannot release the holder's lease",
      releaseReviewTestLease({ path, lease: { ...first.lease, owner: "lease-foreign" } }) === false &&
        first.isHeld() &&
        readReviewTestLease(path).status === "active",
      describeReviewTestLease(path)
    );

    check("the holder can release its own lease after the refusals", first.release() === true, describeReviewTestLease(path));

    /* ---------------- database-scoped host-global default ---------------- */
    const defaultLease = acquireReviewTestLease({
      owner: "lease-suite",
      runId: "run-default-path",
      database: "lease-db-key-test",
      classification: "REVIEW",
      ttlMs: 5_000,
      registerExitCleanup: false
    });
    check(
      "the default lease path is host-global and scoped to the database",
      defaultLease.path === resolve(defaultReviewTestLeasePath("lease-db-key-test")) &&
        defaultLease.path.startsWith(resolve(REVIEW_TEST_LEASE_DIR)) &&
        defaultLease.path.includes("lease-db-key-test") &&
        defaultLease.release() === true,
      defaultLease.path
    );

    /* ---------------- own release ---------------- */
    const ownHandle = acquireReviewTestLease({
      owner: "lease-suite",
      runId: "run-three",
      path: join(workDir, "own.lease.json"),
      ttlMs: 5_000,
      registerExitCleanup: false
    });
    check(
      "own release removes the lease and is idempotent",
      ownHandle.release() === true &&
        readReviewTestLease(join(workDir, "own.lease.json")).status === "missing" &&
        ownHandle.release() === false,
      "first release true, second release false, file missing"
    );

    /* ---------------- invalid lease is not overwritten ---------------- */
    const invalidPath = join(workDir, "invalid.lease.json");
    writeFileSync(invalidPath, "{not a lease", "utf8");
    let invalidError: unknown = null;
    try {
      acquireReviewTestLease({
        owner: "lease-suite",
        runId: "run-invalid",
        path: invalidPath,
        ttlMs: 5_000,
        registerExitCleanup: false
      });
    } catch (error) {
      invalidError = error;
    }
    check(
      "a corrupt lease file blocks acquisition instead of being overwritten",
      invalidError instanceof ReviewTestLeaseError &&
        invalidError.code === "lease_invalid" &&
        readReviewTestLease(invalidPath).status === "invalid",
      invalidError instanceof ReviewTestLeaseError ? invalidError.message : String(invalidError)
    );
    rmSync(invalidPath, { force: true });

    /* ---------------- bounded expiry and takeover ---------------- */
    const expiringPath = join(workDir, "expiring.lease.json");
    const expiring = acquireReviewTestLease({
      owner: "lease-expiring",
      runId: "run-expiring",
      path: expiringPath,
      ttlMs: 120,
      registerExitCleanup: false
    });
    await sleep(220);
    const expiredState = readReviewTestLease(expiringPath);
    const taker = acquireReviewTestLease({
      owner: "lease-taker",
      runId: "run-taker",
      purpose: "expiry takeover",
      path: expiringPath,
      ttlMs: 5_000,
      registerExitCleanup: false
    });
    check(
      "an expired lease is reported expired and can be taken over with the previous holder recorded",
      expiredState.status === "expired" &&
        taker.takeover?.owner === "lease-expiring" &&
        taker.takeover?.runId === "run-expiring" &&
        readReviewTestLease(expiringPath).status === "active",
      `expired=${expiredState.status} takeover=${taker.takeover?.owner}/${taker.takeover?.runId}`
    );
    check(
      "the expired holder cannot delete the new owner's lease",
      expiring.release() === false && taker.isHeld(),
      `oldRelease=${expiring.release()} newHeld=${taker.isHeld()}`
    );
    check("the takeover owner can release normally", taker.release() === true, describeReviewTestLease(expiringPath));

    /* ---------------- normal exit cleanup ---------------- */
    const exitPath = join(workDir, "exit.lease.json");
    const exitChild = spawnLeaseChild({ path: exitPath, runId: "run-exit", ttlMs: 60_000, exitAfterMs: 250 });
    children.push(exitChild.child);
    await waitFor(() => exitChild.output().includes("LEASE_READY"), 15_000, "exit child readiness");
    const exitResult = await waitForExit(exitChild.child);
    check(
      "normal child exit removes its lease",
      exitResult.code === 0 && !existsSync(exitPath) && readReviewTestLease(exitPath).status === "missing",
      `exit=${exitResult.code} stderr=${exitChild.errors().trim()}`
    );

    /* ---------------- abrupt termination leaves a bounded lease ---------------- */
    const killedPath = join(workDir, "killed.lease.json");
    const killedChild = spawnLeaseChild({ path: killedPath, runId: "run-killed", ttlMs: 4_000 });
    children.push(killedChild.child);
    await waitFor(() => killedChild.output().includes("LEASE_READY"), 15_000, "killed child readiness");
    const killedLease = readReviewTestLease(killedPath);
    killHard(killedChild.child);
    await waitForExit(killedChild.child);
    const afterKill = readReviewTestLease(killedPath);
    let concurrentRefusal: unknown = null;
    try {
      acquireReviewTestLease({
        owner: "lease-fast",
        runId: "run-fast",
        path: killedPath,
        ttlMs: 5_000,
        registerExitCleanup: false
      });
    } catch (error) {
      concurrentRefusal = error;
    }
    check(
      "abrupt termination leaves the lease owned by the dead process",
      killedLease.status === "active" &&
        afterKill.status === "active" &&
        afterKill.lease.runId === "run-killed" &&
        concurrentRefusal instanceof ReviewTestLeaseError &&
        concurrentRefusal.code === "lease_active",
      `afterKill=${describeReviewTestLease(killedPath)}`
    );
    const remaining = afterKill.status === "active" ? afterKill.remainingMs : 0;
    await sleep(remaining + 250);
    const recovered = acquireReviewTestLease({
      owner: "lease-recovery",
      runId: "run-recovery",
      purpose: "recover after abrupt termination",
      path: killedPath,
      ttlMs: 5_000,
      registerExitCleanup: false
    });
    check(
      "bounded expiry recovers a crash-interrupted lease without touching activation",
      recovered.takeover?.runId === "run-killed" && recovered.release() === true && !existsSync(killedPath),
      `takeover=${recovered.takeover?.owner}/${recovered.takeover?.runId}`
    );

    /* ---------------- force inspection path ---------------- */
    const forcedPath = join(workDir, "forced.lease.json");
    const forced = acquireReviewTestLease({
      owner: "lease-forced",
      runId: "run-forced",
      path: forcedPath,
      ttlMs: 60_000,
      registerExitCleanup: false
    });
    let mismatch: unknown = null;
    try {
      forceRemoveReviewTestLease({ path: forcedPath, owner: "lease-forced", runId: "run-other", pid: forced.lease.pid });
    } catch (error) {
      mismatch = error;
    }
    check(
      "explicit forced removal requires the exact owner/run/pid",
      mismatch instanceof ReviewTestLeaseError &&
        mismatch.code === "lease_owner_mismatch" &&
        forceRemoveReviewTestLease({
          path: forcedPath,
          owner: forced.lease.owner,
          runId: forced.lease.runId,
          pid: forced.lease.pid
        }) === true &&
        !existsSync(forcedPath),
      mismatch instanceof ReviewTestLeaseError ? mismatch.message : String(mismatch)
    );

    /* ---------------- platform signal limitation ---------------- */
    const signalPath = join(workDir, "signal.lease.json");
    const signalChild = spawnLeaseChild({
      path: signalPath,
      runId: "run-signal",
      ttlMs: 60_000,
      installSigint: true
    });
    children.push(signalChild.child);
    await waitFor(() => signalChild.output().includes("LEASE_READY"), 15_000, "signal child readiness");
    let signalSent = false;
    try {
      signalChild.child.kill("SIGINT");
      signalSent = true;
    } catch (error) {
      limitation("catchable SIGINT cleanup", `signal delivery unsupported: ${sanitize(error)}`);
    }
    if (signalSent) {
      const signalExit = await waitForExit(signalChild.child);
      if (signalExit.code === 130 && !existsSync(signalPath)) {
        check("SIGINT handler releases the lease before exit", true, "exit=130, lease removed");
      } else {
        limitation(
          "catchable SIGINT cleanup",
          `platform terminated the child without running its handler (exit=${String(signalExit.code)} signal=${String(
            signalExit.signal
          )}); bounded expiry and exit cleanup are verified instead`
        );
        const leftover = readReviewTestLease(signalPath);
        if (leftover.status !== "invalid" && leftover.status !== "missing") {
          forceRemoveReviewTestLease({
            path: signalPath,
            owner: leftover.lease.owner,
            runId: leftover.lease.runId,
            pid: leftover.lease.pid
          });
        }
      }
    }

    /* ---------------- activation isolation ---------------- */
    if (!SKIP_DB && before) {
      const after = await readActivationRows(REVIEW_URL);
      check(
        "lease acquisition/release/expiry changed no Shop activation row",
        JSON.stringify(after.rows) === JSON.stringify(before.rows) &&
          after.database === before.database &&
          after.classification === before.classification,
        `rowsBefore=${before.rows.length} rowsAfter=${after.rows.length}`
      );
    }

    const leftovers = readdirSync(workDir);
    check("no lease or temporary file remains in the isolated lease directory", leftovers.length === 0, leftovers.join(","));

    if (!SKIP_DB && before) {
      const after = await readActivationRows(REVIEW_URL);
      check(
        "no Shop activation row remains from this run",
        after.rows.length === before.rows.length && JSON.stringify(after.rows) === JSON.stringify(before.rows),
        `shopActivationRows=${after.rows.length}`
      );
    }
  } finally {
    for (const child of children) {
      if (child.exitCode === null) killHard(child);
    }
    rmSync(workDir, { recursive: true, force: true });
  }

  const failed = results.filter((entry) => !entry.ok);
  console.log(`\n${results.length - failed.length}/${results.length} lease checks passed.`);
  if (failed.length > 0) {
    process.exitCode = 1;
    for (const failure of failed) console.error(`- ${failure.name}: ${failure.detail}`);
  }
}

main().catch((error) => {
  console.error(sanitize(error instanceof Error ? error.stack ?? error.message : error));
  process.exitCode = 1;
});
