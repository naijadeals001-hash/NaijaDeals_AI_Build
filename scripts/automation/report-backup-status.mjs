#!/usr/bin/env node
/**
 * Reports one backup job outcome to the NaijaDeals automation API.
 *
 * Usage:
 *   node report-backup-status.mjs --run-id <id> --status success|failure \
 *     --target staging-db|n8n|files [--message <text>]
 *
 * Environment:
 *   AUTOMATION_BASE_URL       default http://127.0.0.1:3200
 *   AUTOMATION_CONSUMER_TOKEN required; never printed or logged
 *
 * Exit codes: 0 reported (including an idempotent replay), 1 HTTP/network
 * failure, 2 invalid arguments or missing configuration.
 */

const USAGE =
  "usage: report-backup-status.mjs --run-id <id> --status success|failure --target staging-db|n8n|files [--message <text>]";
const MAX_MESSAGE = 500;

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`unexpected argument: ${token}`);
    const equals = token.indexOf("=");
    if (equals > 0) {
      values.set(token.slice(2, equals), token.slice(equals + 1));
      continue;
    }
    const name = token.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for --${name}`);
    values.set(name, value);
    index += 1;
  }
  return values;
}

function fail(message, code = 2) {
  console.error(message);
  process.exit(code);
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  fail(`${error.message}\n${USAGE}`);
}

const runId = args.get("run-id")?.trim() ?? "";
const status = args.get("status")?.trim() ?? "";
const target = args.get("target")?.trim() ?? "";
const message = args.get("message")?.trim() ?? "";

if (!runId || runId.length > 80) fail(`--run-id is required (1..80 characters)\n${USAGE}`);
if (!["success", "failure"].includes(status)) fail(`--status must be success or failure\n${USAGE}`);
if (!["staging-db", "n8n", "files"].includes(target)) fail(`--target must be staging-db, n8n or files\n${USAGE}`);
if (message.length > MAX_MESSAGE) fail(`--message must be ${MAX_MESSAGE} characters or fewer\n${USAGE}`);

const token = process.env.AUTOMATION_CONSUMER_TOKEN ?? "";
if (!token) fail("AUTOMATION_CONSUMER_TOKEN is not configured", 2);

const baseUrl = (process.env.AUTOMATION_BASE_URL ?? "http://127.0.0.1:3200").replace(/\/+$/, "");
const endpoint = `${baseUrl}/api/automation/backup-status`;

try {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      runId,
      status,
      target,
      finishedAt: new Date().toISOString(),
      ...(message ? { message } : {})
    }),
    signal: AbortSignal.timeout(15_000)
  });

  const text = (await response.text().catch(() => "")).slice(0, 300);
  if (!response.ok) {
    console.error(`backup status report failed: HTTP ${response.status}${text ? ` ${text}` : ""}`);
    process.exit(1);
  }
  console.log(`backup status reported: runId=${runId} status=${status} target=${target}`);
} catch (error) {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : "unknown error";
  console.error(`backup status report failed: ${detail}`);
  process.exit(1);
}
