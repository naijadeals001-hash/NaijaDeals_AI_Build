#!/usr/bin/env node
/**
 * Test launcher for the worker. Refuses to spawn without an explicit isolated
 * connection and test mode, then passes both to the child so it can verify its
 * own database. Production startup does not use this script and is unchanged.
 */
import { spawn } from "node:child_process";

const ALLOWED = ["naijadeals_affiliate_test"];
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Refusing to launch: DATABASE_URL is not set.");
  process.exit(2);
}

let database = "";
try {
  database = (new URL(url).pathname || "").replace(/^\//, "");
} catch {
  console.error("Refusing to launch: DATABASE_URL is not a valid URL.");
  process.exit(2);
}

if (!ALLOWED.includes(database)) {
  console.error(`Refusing to launch: DATABASE_URL targets "${database}", allowed: ${ALLOWED.join(", ")}.`);
  process.exit(2);
}

const child = spawn("npx", ["tsx", "scripts/infra-worker.ts"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, DATABASE_URL: url, AFFILIATE_TEST_MODE: "1" }
});
child.on("exit", (code, signal) => process.exit(signal ? 1 : code ?? 0));
