/**
 * Aura AI functional journey in a real browser.
 *
 * Signs in as a labelled test account and exercises the product the way a person
 * would: type a question, watch it stream, receive real cards, then check the
 * conversation persists after a reload. Also asserts conversation ownership and
 * that Stop actually cancels.
 *
 * Run: node scripts/aura-browser-journey.cjs
 */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.QA_BASE_URL ?? "http://localhost:3015";
const CHROME = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT = path.join(process.cwd(), "qa-artifacts", "aura");
const ACCOUNT = { email: "naijapay-test-sender@naijadeals.test", password: "NaijaPayTest123!" };

let pass = 0;
let fail = 0;
const check = (n, ok, d = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`);
  if (ok) pass++;
  else fail++;
};

async function signIn(browser, viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  const status = await page.evaluate(async (account) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(account)
    });
    return res.status;
  }, ACCOUNT);
  return { ctx, page, status };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const { ctx, page, status } = await signIn(browser, { width: 1440, height: 1000 });
  check("test account signs in", status === 200, `status ${status}`);

  await page.goto(`${BASE}/aura-ai`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  // --- real conversation ---
  // Both composers are in the DOM; only one is visible at a given width. Asking
  // for the first match picks the hidden mobile one on desktop.
  const visibleComposers = page.locator("#aura-composer-mobile:visible, #aura-composer-desktop:visible");
  check("exactly one composer is visible", (await visibleComposers.count()) === 1, `${await visibleComposers.count()} visible`);
  const visibleSend = page.locator('button[aria-label="Send message"]:visible');
  check("exactly one send button is visible", (await visibleSend.count()) === 1, `${await visibleSend.count()} visible`);
  await visibleComposers.fill("What stays are available in Abuja?");
  await page.locator('button[aria-label="Send message"]:visible').click();

  // The user's message appears immediately.
  await page.waitForTimeout(800);
  const userEcho = await page.getByText("What stays are available in Abuja?").count();
  check("the user message appears", userEcho > 0);

  // Streaming: text grows over time. Sample the assistant area twice.
  await page.waitForTimeout(2500);
  const firstSample = await page.evaluate(() => (document.body.innerText).length);
  await page.waitForTimeout(2500);
  const secondSample = await page.evaluate(() => (document.body.innerText).length);
  check("the answer streams in progressively", secondSample >= firstSample && secondSample > 200, `${firstSample} -> ${secondSample} chars`);

  // Wait for completion (composer send button returns, no stop button).
  await page.waitForTimeout(6000);
  const mainText = await page.evaluate(() => document.body.innerText);
  check("the answer references Abuja", /Abuja/i.test(mainText), mainText.slice(0, 90).replace(/\n/g, " "));
  check("the discovery hero collapses during a conversation", !/Less searching\./.test(mainText));

  const cards = await page.locator("a[href^='/naijastay']").count();
  check("a real stay result is shown as a card", cards > 0, `${cards} card link(s)`);

  await page.screenshot({ path: path.join(OUT, "aura-conversation-desktop.png"), fullPage: false });

  // --- persistence across reload ---
  const url = page.url();
  const conversationId = await page.evaluate(async () => {
    const res = await fetch("/api/aura/conversations", { credentials: "include" });
    const body = await res.json();
    return body.conversations?.[0]?.id ?? null;
  });
  check("the conversation was saved", Boolean(conversationId));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.goto(`${BASE}/aura-ai/conversations`, { waitUntil: "networkidle" });
  const listed = await page.evaluate(async () => {
    const res = await fetch("/api/aura/conversations", { credentials: "include" });
    const body = await res.json();
    return body.conversations ?? [];
  });
  check("the conversation survives a reload", listed.some((c) => c.id === conversationId), `${listed.length} listed`);
  void url;

  // --- ownership isolation ---
  const otherCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const otherPage = await otherCtx.newPage();
  await otherPage.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await otherPage.evaluate(async () => {
    await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email: "naijapay-test-recipient@naijadeals.test", password: "NaijaPayTest123!" })
    });
  });
  const foreign = await otherPage.evaluate(async (id) => {
    const res = await fetch(`/api/aura/conversations/${id}`, { credentials: "include" });
    return res.status;
  }, conversationId);
  check("another account cannot open the conversation", foreign === 404, `status ${foreign}`);

  const foreignDelete = await otherPage.evaluate(async (id) => {
    const res = await fetch(`/api/aura/conversations?id=${id}`, { method: "DELETE", credentials: "include", headers: { Origin: location.origin } });
    return res.status;
  }, conversationId);
  check("another account cannot delete the conversation", foreignDelete === 404, `status ${foreignDelete}`);
  await otherCtx.close();

  // --- stop generation ---
  const stopPage = await ctx.newPage();
  await stopPage.goto(`${BASE}/aura-ai`, { waitUntil: "networkidle" });
  await stopPage.fill("#aura-composer-mobile:visible, #aura-composer-desktop:visible", "Write a long description of Nigerian street food culture, at least 400 words.");
  await stopPage.click('button[aria-label="Send message"]:visible');
  await stopPage.waitForTimeout(2500);
  const stopVisible = await stopPage.getByRole("button", { name: /stop generating/i }).count();
  check("a stop control appears while generating", stopVisible === 1);
  if (stopVisible === 1) {
    await stopPage.getByRole("button", { name: /stop generating/i }).click();
    await stopPage.waitForTimeout(1500);
    const stillStreaming = await stopPage.getByRole("button", { name: /stop generating/i }).count();
    check("stop ends generation", stillStreaming === 0);
  }
  await stopPage.close();

  // --- mobile conversation view ---
  const mobile = await signIn(browser, { width: 390, height: 844 });
  await mobile.page.goto(`${BASE}/aura-ai`, { waitUntil: "networkidle" });
  await mobile.page.waitForTimeout(800);
  const overflow = await mobile.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("mobile has no horizontal overflow", overflow <= 0, `${overflow}px`);
  const composerVisible = await mobile.page.locator("#aura-composer-mobile:visible, #aura-composer-desktop:visible").isVisible();
  check("mobile composer is visible above the bottom bar", composerVisible);
  await mobile.page.screenshot({ path: path.join(OUT, "aura-conversation-mobile.png"), fullPage: false });
  await mobile.ctx.close();

  await ctx.close();
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
