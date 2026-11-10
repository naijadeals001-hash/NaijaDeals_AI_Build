/**
 * Aura AI acceptance suite — runs every Aura check and reports one summary.
 *
 * Usage: node scripts/aura-acceptance.cjs
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const SUITE = [
  { name: "Orchestration with the real model", cmd: ["npx", ["tsx", "--tsconfig", "tsconfig.json", "scripts/aura-orchestration-test.ts"]] },
  { name: "Visual QA (desktop/tablet/mobile)", cmd: ["node", ["scripts/aura-visual-qa.cjs"]] },
  { name: "Browser journey (stream, persist, ownership, stop)", cmd: ["node", ["scripts/aura-browser-journey.cjs"]] },
  { name: "Control Center panel", cmd: ["node", ["scripts/aura-admin-check.cjs"]] }
];

const results = [];
for (const entry of SUITE) {
  const [bin, args] = entry.cmd;
  console.log(`\n### ${entry.name}`);
  const started = Date.now();
  try {
    const out = execFileSync(bin, args, {
      env: { ...process.env, QA_BASE_URL: process.env.QA_BASE_URL ?? "http://localhost:3015" },
      encoding: "utf8",
      stdio: "pipe",
      shell: process.platform === "win32",
      timeout: 600000
    });
    const tail = out.trim().split("\n").slice(-2).join("\n");
    console.log(tail);
    results.push({ name: entry.name, ok: true, seconds: ((Date.now() - started) / 1000).toFixed(0), detail: out.trim().split("\n").pop() });
  } catch (error) {
    const out = `${error.stdout ?? ""}${error.stderr ?? ""}`.trim();
    console.log(out.split("\n").slice(-6).join("\n"));
    results.push({ name: entry.name, ok: false, seconds: ((Date.now() - started) / 1000).toFixed(0), detail: out.split("\n").pop() });
  }
}

const failed = results.filter((r) => !r.ok);
console.log("\n=== AURA ACCEPTANCE SUMMARY ===");
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(52)} ${String(r.seconds).padStart(4)}s  ${r.detail ?? ""}`);
console.log(`\n${results.length - failed.length}/${results.length} suites passed`);
fs.mkdirSync(path.join(process.cwd(), "qa-artifacts"), { recursive: true });
fs.writeFileSync(path.join(process.cwd(), "qa-artifacts", "aura-acceptance.json"), JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
