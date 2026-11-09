/**
 * NaijaPay acceptance suite.
 *
 * Runs every NaijaPay verification script in order and reports one summary. Each
 * script is independent and self-cleaning; financial ones use isolated schemas.
 *
 * Usage: node scripts/naijapay-acceptance.cjs
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const SUITE = [
  { name: "Reconciliation report (read-only)", cmd: ["node", ["scripts/naijapay-reconcile.cjs"]] },
  { name: "Correction preview (read-only)", cmd: ["node", ["scripts/naijapay-correction-preview.cjs"]] },
  { name: "Correction verified on isolated copy", cmd: ["node", ["scripts/naijapay-correction-isolated-verify.cjs"]] },
  { name: "Escrow release conserves value", cmd: ["npx", ["tsx", "--tsconfig", "tsconfig.json", "scripts/naijapay-release-conservation-test.ts"]] },
  { name: "P2P transfer financial safety", cmd: ["npx", ["tsx", "--tsconfig", "tsconfig.json", "scripts/pay-transfer-tests.ts"]] },
  { name: "Full journey: top-up, transfer, escrow", cmd: ["npx", ["tsx", "--tsconfig", "tsconfig.json", "scripts/naijapay-journey-test.ts"]] },
  { name: "Milestone escrow permissions", cmd: ["npx", ["tsx", "--tsconfig", "tsconfig.json", "scripts/naijapay-milestone-test.ts"]] },
  { name: "Offline outbox rules", cmd: ["npx", ["tsx", "--tsconfig", "tsconfig.json", "scripts/naijapay-outbox-test.ts"]] },
  { name: "Browser journey (real UI, test money)", cmd: ["node", ["scripts/naijapay-browser-journey.cjs"]] },
  { name: "Authenticated wallet screen", cmd: ["node", ["scripts/naijapay-wallet-e2e.cjs"]] },
  { name: "Add Money panel in browser", cmd: ["node", ["scripts/naijapay-outbox-ui-check.cjs"]] },
  { name: "Control Center access control", cmd: ["node", ["scripts/naijapay-admin-access.cjs"]] },
  { name: "Link and control audit", cmd: ["node", ["scripts/naijapay-link-audit.cjs"]] },
  { name: "Landing visual QA", cmd: ["node", ["scripts/pay-visual-qa.mjs"]] }
];

const results = [];
for (const entry of SUITE) {
  const [bin, args] = entry.cmd;
  process.stdout.write(`\n### ${entry.name}\n`);
  const started = Date.now();
  try {
    const out = execFileSync(bin, args, {
      env: { ...process.env, QA_BASE_URL: process.env.QA_BASE_URL ?? "http://localhost:3015" },
      encoding: "utf8",
      stdio: "pipe",
      shell: process.platform === "win32",
      timeout: 600000
    });
    const tail = out.trim().split("\n").slice(-3).join("\n").trim();
    console.log(tail);
    results.push({ name: entry.name, ok: true, seconds: ((Date.now() - started) / 1000).toFixed(0), detail: tail.split("\n").pop() });
  } catch (error) {
    const out = `${error.stdout ?? ""}${error.stderr ?? ""}`.trim();
    const tail = out.split("\n").slice(-6).join("\n").trim();
    console.log(tail || String(error.message));
    results.push({ name: entry.name, ok: false, seconds: ((Date.now() - started) / 1000).toFixed(0), detail: tail.split("\n").pop() });
  }
}

const failed = results.filter((r) => !r.ok);
console.log("\n=== ACCEPTANCE SUMMARY ===");
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(42)} ${String(r.seconds).padStart(4)}s  ${r.detail ?? ""}`);
console.log(`\n${results.length - failed.length}/${results.length} suites passed`);

const report = { generatedAt: new Date().toISOString(), base: process.env.QA_BASE_URL ?? "http://localhost:3015", results };
fs.mkdirSync(path.join(process.cwd(), "qa-artifacts"), { recursive: true });
fs.writeFileSync(path.join(process.cwd(), "qa-artifacts", "naijapay-acceptance.json"), JSON.stringify(report, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
