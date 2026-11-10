#!/usr/bin/env node
/**
 * Starts the isolated test application, refusing to run against development.
 *
 *   node scripts/start-test-server.mjs           # validate, then start
 *   node scripts/start-test-server.mjs --check   # validate only
 *
 * `next start` reads .env, and process-level variables win over it — but a
 * missing variable silently falls back to the development database. This guard
 * validates the exact values the child process will inherit, using parsed URLs
 * rather than suffix matching, and prints only host, database name, port and
 * queue prefix. No password, token or full connection string is ever printed.
 */

import { spawn } from "node:child_process";

const EXPECTED = {
  database: "naijadeals_test",
  forbiddenDatabase: "naijadeals_core",
  queuePrefix: "nd-test",
  developmentQueuePrefix: "nd",
  valkeyIndex: "/1",
  developmentValkeyIndex: "/0",
  port: 3016,
  developmentPort: 3015
};

function parseUrl(value) {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function validate(env) {
  const failures = [];
  const facts = {};

  const db = parseUrl(env.DATABASE_URL);
  if (!db) {
    failures.push("DATABASE_URL is missing or is not a valid URL");
  } else {
    const database = db.pathname.replace(/^\//, "");
    facts.database = database;
    facts.databaseHost = db.hostname;
    if (database === EXPECTED.forbiddenDatabase) failures.push("DATABASE_URL points at naijadeals_core");
    else if (database !== EXPECTED.database) failures.push(`DATABASE_URL database is "${database}", expected "${EXPECTED.database}"`);
  }

  if (env.QUEUE_PREFIX === EXPECTED.developmentQueuePrefix) failures.push("QUEUE_PREFIX is the development namespace \"nd\"");
  else if (env.QUEUE_PREFIX !== EXPECTED.queuePrefix) failures.push(`QUEUE_PREFIX is "${env.QUEUE_PREFIX ?? "unset"}", expected "${EXPECTED.queuePrefix}"`);
  facts.queuePrefix = env.QUEUE_PREFIX ?? null;

  const valkey = parseUrl(env.VALKEY_URL);
  if (!valkey) {
    failures.push("VALKEY_URL is missing or is not a valid URL");
  } else {
    const index = valkey.pathname || "/0";
    facts.valkeyIndex = index;
    if (index === EXPECTED.developmentValkeyIndex) failures.push("VALKEY_URL uses development database index 0");
    else if (index !== EXPECTED.valkeyIndex) failures.push(`VALKEY_URL index is "${index}", expected "${EXPECTED.valkeyIndex}"`);
  }

  const port = Number(env.PORT ?? 0);
  facts.port = port || null;
  if (!port) failures.push("PORT is not set");
  else if (port === EXPECTED.developmentPort) failures.push(`PORT ${port} is the development preview`);
  else if (port !== EXPECTED.port) failures.push(`PORT is ${port}, expected ${EXPECTED.port}`);

  for (const channel of ["IN_APP", "EMAIL", "SMS", "PUSH"]) {
    const chain = env[`NOTIFY_${channel}_CHAIN`];
    if (chain && chain !== "none" && !chain.split(",").every((name) => name.trim() === "none" || name.trim() === "")) {
      failures.push(`NOTIFY_${channel}_CHAIN is "${chain}"; external providers must be disabled for tests`);
    }
  }

  facts.distDir = env.NEXT_DIST_DIR ?? null;
  if (facts.distDir !== ".next-pay") failures.push('NEXT_DIST_DIR must be ".next-pay" to serve the existing build');

  return { ok: failures.length === 0, failures, facts };
}

const checkOnly = process.argv.includes("--check");
const result = validate(process.env);

console.log(JSON.stringify({ mode: checkOnly ? "check" : "start", ok: result.ok, facts: result.facts, failures: result.failures }, null, 2));

if (!result.ok) {
  console.error(`Refusing to start: ${result.failures.length} configuration problem(s).`);
  process.exit(1);
}

if (checkOnly) process.exit(0);

const child = spawn("npx", ["next", "start", "-p", String(EXPECTED.port)], {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
  windowsHide: true
});

child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
