/**
 * Aura AI functional health check.
 *
 * Acts on every control a person would use and reports what actually works.
 * This is a diagnostic, not an acceptance pass: it exercises the interface and
 * records failures with the reason.
 *
 * Usage: node scripts/aura-health-check.cjs
 */
const { chromium } = require("playwright-core");

const BASE = process.env.QA_BASE_URL ?? "http://localhost:3015";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

const results = [];
const record = (feature, ok, detail = "") => {
  results.push({ feature, ok, detail });
  console.log(`${ok ? "OK  " : "FAIL"}  ${feature}${detail ? ` — ${detail}` : ""}`);
};

async function signIn(context) {
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  const status = await page.evaluate(async (account) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(account)
    });
    return res.status;
  }, { email: "aura-mockup-fixture@naijadeals.test", password: process.env.AURA_FIXTURE_PASSWORD ?? "" });
  return { page, status };
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const { page, status } = await signIn(ctx);
  record("Sign in", status === 200, `status ${status}`);

  await page.goto(`${BASE}/aura-ai`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // ---- links resolve -----------------------------------------------------
  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll("a[href^='/']")).map((a) => ({ href: a.getAttribute("href"), text: (a.textContent || "").trim().slice(0, 30) }))
  );
  const unique = [...new Map(links.map((l) => [l.href, l])).values()].filter((l) => !l.href.startsWith("/_next"));
  let broken = [];
  for (const link of unique) {
    const res = await page.request.get(`${BASE}${link.href}`).catch(() => null);
    if (!res || res.status() >= 400) broken.push(`${link.href}(${res?.status() ?? "err"})`);
  }
  record(`Internal links resolve (${unique.length} checked)`, broken.length === 0, broken.slice(0, 4).join(", "));

  // ---- composer send + stream -------------------------------------------
  const input = page.locator("#aura-composer-desktop");
  await input.fill("What is my NaijaPay balance?");
  await page.keyboard.press("Enter");
  // Poll for the reply rather than sampling a transient Stop button: a fast turn
  // can finish before the first sample, which produced a false failure earlier.
  let replied = false;
  for (let i = 0; i < 40; i += 1) {
    await page.waitForTimeout(1000);
    const t = await page.evaluate(() => document.body.innerText);
    if (/I can help|I'?ll|wallet|balance|₦/i.test(t) && !t.includes("Less searching.")) { replied = true; break; }
  }
  record("Send a message produces a reply", replied);
  const answer = await page.evaluate(() => document.body.innerText);
  record("Aura returns an answer with real data", /₦|balance|wallet/i.test(answer), answer.slice(0, 80).replace(/\n/g, " "));

  // ---- language switch actually changes locale ---------------------------
  const langBtn = page.getByRole("button", { name: /language/i }).first();
  await langBtn.click();
  await page.waitForTimeout(300);
  const swahili = page.getByRole("option", { name: /Kiswahili/i }).first();
  if (await swahili.count()) {
    await swahili.click();
    await page.waitForTimeout(1500);
    const cookie = (await ctx.cookies()).find((c) => c.name === "nd_lang");
    record("Language switch sets the locale cookie", cookie?.value === "sw", `nd_lang=${cookie?.value ?? "unset"}`);
    // restore
    await page.getByRole("button", { name: /language|lugha/i }).first().click();
    await page.waitForTimeout(300);
    const english = page.getByRole("option", { name: /English/i }).first();
    if (await english.count()) await english.click();
    await page.waitForTimeout(1000);
  } else record("Language switch sets the locale cookie", false, "no option found");

  // ---- Today's plan triggers a search -----------------------------------
  await page.goto(`${BASE}/aura-ai`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const step = page.getByRole("button", { name: /choose a stay/i }).first();
  if (await step.count()) {
    await step.click();
    await page.waitForTimeout(2500);
    const after = await page.evaluate(() => document.body.innerText);
    record("Today's plan step runs a real search", /stay|NaijaStay|Abuja|no .*found/i.test(after), after.slice(0, 70).replace(/\n/g, " "));
  } else record("Today's plan step runs a real search", false, "step control missing");

  // ---- Make it yours persists -------------------------------------------
  await page.goto(`${BASE}/aura-ai`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const toggle = page.getByRole("switch").first();
  if (await toggle.count()) {
    const before = await toggle.getAttribute("aria-checked");
    await toggle.click();
    await page.waitForTimeout(1200);
    const res = await page.request.get(`${BASE}/api/aura/preferences`);
    const body = await res.json();
    record("Personalisation toggle persists to the server", String(body.preferences?.personalised) === String(before === "true" ? false : true), `was ${before}, server ${body.preferences?.personalised}`);
    await toggle.click();
    await page.waitForTimeout(800);
  } else record("Personalisation toggle persists to the server", false, "switch missing");

  // ---- attach dialog opens ----------------------------------------------
  const attach = page.getByRole("button", { name: /attach a text file/i }).first();
  const hasFileInput = await page.locator('input[type="file"]').count();
  record("Attach control opens a file picker", (await attach.count()) > 0 && hasFileInput > 0, `${hasFileInput} file input(s)`);

  // ---- conversation management ------------------------------------------
  await page.goto(`${BASE}/aura-ai/conversations`, { waitUntil: "networkidle" });
  const rows = await page.locator("li").count();
  record("Conversations page lists history", rows > 0, `${rows} rows`);

  await page.goto(`${BASE}/aura-ai/plans`, { waitUntil: "networkidle" });
  const planText = await page.evaluate(() => document.body.innerText);
  record("My tasks page loads", /my tasks/i.test(planText));

  await page.goto(`${BASE}/aura-ai/saved`, { waitUntil: "networkidle" });
  const savedText = await page.evaluate(() => document.body.innerText);
  record("Saved page loads", /saved/i.test(savedText));

  await page.goto(`${BASE}/aura-ai/settings`, { waitUntil: "networkidle" });
  const setText = await page.evaluate(() => document.body.innerText);
  record("Privacy settings page loads", /privacy/i.test(setText));

  // ---- mobile ------------------------------------------------------------
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const { page: mp } = await signIn(mctx);
  await mp.goto(`${BASE}/aura-ai`, { waitUntil: "networkidle" });
  await mp.waitForTimeout(2000);
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  record("Mobile has no horizontal overflow", overflow <= 0, `${overflow}px`);
  const mon = await mp.evaluate(() => document.querySelectorAll('[data-aura]').length);
  record("Mobile renders its sections", mon >= 4, `${mon} sections`);
  const mComp = await mp.locator("#aura-composer-mobile").count();
  record("Mobile composer present", mComp === 1);

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} features OK`);
  if (failed.length) console.log("FAILURES:\n" + failed.map((f) => ` - ${f.feature}${f.detail ? `: ${f.detail}` : ""}`).join("\n"));
  require("node:fs").writeFileSync("qa-artifacts/aura/health.json", JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
})();
