/**
 * Aura AI acceptance suite — runs each check suite and reports one summary.
 *
 * Usage:
 *   node scripts/aura-acceptance.cjs                    # every suite
 *   AURA_SUITE_ONLY=Control node scripts/aura-acceptance.cjs   # one suite
 *
 * Every run gets its own artifact directory under qa-artifacts/aura/runs/<stamp>/
 * containing:
 *   meta.json          commit, working-tree state, target URL, build id, timings, exit codes
 *   <suite>.log        full sanitized stdout and stderr for that child
 *   summary.txt        the printed summary
 *
 * Sanitization: bearer tokens, API keys, cookies and URL-embedded credentials are
 * redacted before anything is written. Conversation content is not logged by the
 * child suites themselves; if that changes, redaction must be revisited.
 *
 * A run never reuses an earlier log as evidence: the directory name carries the
 * timestamp and meta.json records what was actually executed.
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const SUITE = [
  { name: "Orchestration with the real model", key: "orchestration", cmd: ["npx", ["tsx", "--tsconfig", "tsconfig.json", "scripts/aura-orchestration-test.ts"]] },
  { name: "Visual QA (desktop/tablet/mobile)", key: "visual-qa", cmd: ["node", ["scripts/aura-visual-qa.cjs"]] },
  { name: "Browser journey (stream, persist, ownership, stop)", key: "browser-journey", cmd: ["node", ["scripts/aura-browser-journey.cjs"]] },
  { name: "Control Center panel", key: "control-center", cmd: ["node", ["scripts/aura-admin-check.cjs"]] }
];

const ONLY = process.env.AURA_SUITE_ONLY ?? "";
const TARGET = process.env.QA_BASE_URL ?? "http://localhost:3015";
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const runDir = path.join(process.cwd(), "qa-artifacts", "aura", "runs", stamp);
fs.mkdirSync(runDir, { recursive: true });

function sanitize(text) {
  return String(text)
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[redacted]")
    .replace(/\b(sk|pk|rk|api)[-_][A-Za-z0-9_-]{8,}/gi, "[redacted-key]")
    .replace(/([?&](?:token|key|password|secret)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/\/\/[^/\s:@]+:[^/\s@]+@/g, "//[redacted]@")
    .replace(/(cookie|set-cookie)\s*:\s*[^\n]+/gi, "$1: [redacted]");
}

function gitLine(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: "pipe" }).trim();
  } catch {
    return "unavailable";
  }
}

const selected = SUITE.filter((entry) => !ONLY || entry.name.includes(ONLY) || entry.key.includes(ONLY));
if (selected.length === 0) {
  console.error(`AURA_SUITE_ONLY="${ONLY}" matched no suite.`);
  process.exit(2);
}

const results = [];
for (const entry of selected) {
  console.log(`\n### ${entry.name}`);
  const started = Date.now();
  const startedAt = new Date().toISOString();
  let ok = false;
  let output = "";
  let exitCode = 0;

  try {
    const out = execFileSync(entry.cmd[0], entry.cmd[1], {
      env: { ...process.env, QA_BASE_URL: TARGET },
      encoding: "utf8",
      stdio: "pipe",
      shell: process.platform === "win32",
      timeout: 600000
    });
    output = out;
    ok = true;
  } catch (error) {
    output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    exitCode = typeof error.status === "number" ? error.status : 1;
    ok = false;
  }

  const sanitized = sanitize(output);
  const logPath = path.join(runDir, `${entry.key}.log`);
  fs.writeFileSync(logPath, sanitized, "utf8");

  const lines = sanitized.trim().split("\n").filter(Boolean);
  const summaryLines = lines.slice(-6);
  console.log(summaryLines.join("\n"));
  if (!ok) console.log(`    full output: ${path.relative(process.cwd(), logPath)}`);

  results.push({
    name: entry.name,
    key: entry.key,
    ok,
    exitCode,
    startedAt,
    seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
    detail: lines[lines.length - 1] ?? "",
    log: path.relative(process.cwd(), logPath)
  });
}

const failed = results.filter((row) => !row.ok);
const summary = [];
summary.push("=== AURA ACCEPTANCE SUMMARY ===");
for (const row of results) {
  summary.push(`${row.ok ? "PASS" : "FAIL"}  ${row.name.padEnd(52)} ${String(row.seconds).padStart(6)}s  exit=${row.exitCode}  ${row.detail}`);
}
summary.push("");
summary.push(`${results.length - failed.length}/${results.length} suites passed`);
summary.push(`artifacts: ${path.relative(process.cwd(), runDir)}`);

console.log(`\n${summary.slice(1).join("\n")}`);
fs.writeFileSync(path.join(runDir, "summary.txt"), `${summary.join("\n")}\n`, "utf8");

const meta = {
  generatedAt: new Date().toISOString(),
  target: TARGET,
  suiteFilter: ONLY || null,
  source: {
    commit: gitLine(["rev-parse", "HEAD"]),
    branch: gitLine(["rev-parse", "--abbrev-ref", "HEAD"]),
    trackedChanges: gitLine(["status", "--porcelain", "--untracked-files=no"]).split("\n").filter(Boolean).length
  },
  buildId: (() => {
    try {
      return fs.readFileSync(path.join(process.cwd(), ".next-pay", "BUILD_ID"), "utf8").trim();
    } catch {
      return null;
    }
  })(),
  environment: {
    node: process.version,
    platform: process.platform,
    stubs: {
      AURA_TEST_PROVIDER: process.env.AURA_TEST_PROVIDER ?? null,
      AURA_VISUAL_FORCE_FAIL: process.env.AURA_VISUAL_FORCE_FAIL ?? null,
      AURA_VISUAL_THROW: process.env.AURA_VISUAL_THROW ?? null,
      AURA_ADMIN_FORCE_FAIL: process.env.AURA_ADMIN_FORCE_FAIL ?? null
    }
  },
  results
};
fs.writeFileSync(path.join(runDir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`, "utf8");

process.exit(failed.length === 0 ? 0 : 1);
