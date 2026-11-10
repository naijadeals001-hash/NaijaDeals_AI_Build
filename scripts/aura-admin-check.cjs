const { chromium } = require("playwright-core");

/**
 * Control Center Aura panel acceptance.
 *
 * Every condition records a pass or a failure, the total is derived from the
 * checks that actually ran, and any failure sets a non-zero exit code. Before
 * this, each check printed PASS/FAIL and the script always exited 0, so a
 * failing panel still reported green upstream.
 *
 * Failure injection: AURA_ADMIN_FORCE_FAIL=<label> fails that one check on
 * purpose, so the failure path can be proven. It is read only from the
 * environment and never set by the application.
 */

const CHROME = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.AURA_BASE_URL ?? "http://localhost:3015";
const FORCE_FAIL = process.env.AURA_ADMIN_FORCE_FAIL ?? "";

const results = [];
function check(label, ok) {
  const forced = FORCE_FAIL && label.includes(FORCE_FAIL);
  const passed = forced ? false : Boolean(ok);
  results.push({ label, passed, forced });
  console.log(`${passed ? "PASS" : "FAIL"}  ${label}${forced ? "  (forced)" : ""}`);
  return passed;
}

async function main() {
  let browser;
  try {
    browser = await chromium.launch({ executablePath: CHROME });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await ctx.newPage();

    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    const loginStatus = await page.evaluate(async () => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: "admin@naijadeals.local", password: "AdminPass123!" })
      });
      return response.status;
    });
    check("admin login succeeded", loginStatus === 200);

    await page.goto(`${BASE}/admin?module=aura&tab=aura`, { waitUntil: "networkidle" });
    await page.waitForTimeout(3500);
    const text = await page.evaluate(() => document.body.innerText);

    for (const marker of ["Aura AI", "PROVIDER", "USAGE, LAST 7 DAYS", "TOOL REGISTRY"]) {
      check(`panel shows "${marker}"`, text.includes(marker));
    }
    check("stale 'no model provider' copy removed", !/no model provider/i.test(text));
    check("provider reported", /deepseek/i.test(text));
    check("usage statistics present", /toolCalls|Tool calls/i.test(text));
    check("no conversation content leaked", !/What stays are available/.test(text));

    await page.screenshot({ path: "qa-artifacts/aura/aura-admin.png", fullPage: false });
  } catch (error) {
    // A navigation or runtime error is a failure, not a silent pass.
    check(`suite ran without error (${error instanceof Error ? error.message.slice(0, 80) : "unknown"})`, false);
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }

  const passed = results.filter((row) => row.passed).length;
  console.log(`\n${passed}/${results.length} checks passed${FORCE_FAIL ? " (failure injection active)" : ""}`);
  process.exitCode = passed === results.length && results.length > 0 ? 0 : 1;
}

void main();
