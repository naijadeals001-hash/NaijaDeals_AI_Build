const { chromium } = require("playwright-core");
(async () => {
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const results = {};

  async function login(page, creds) {
    await page.goto("http://localhost:3015/login", { waitUntil: "domcontentloaded" });
    await page.evaluate(async (body) => {
      await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
    }, creds);
  }

  let page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await login(page, { email: "customer@naijadeals.local", password: "CustomerPass123!" });
  await page.goto("http://localhost:3015/pay/send", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  results.sendForm = await page.evaluate(() => ({
    heading: document.querySelector("h1")?.textContent,
    balanceShown: [...document.querySelectorAll("p")].some((p) => /^₦[\d,.]+$/.test(p.textContent.trim())),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }));
  await page.getByPlaceholder("name@example.com").fill("send-b@test.local");
  await page.getByPlaceholder("2500.00").fill("100");
  await page.getByRole("button", { name: /Review transfer/ }).click();
  await page.waitForTimeout(500);
  results.sendReview = await page.evaluate(() => ({
    reviewHeading: [...document.querySelectorAll("h2")].some((h) => h.textContent === "Review"),
    amount: [...document.querySelectorAll("dd")].some((d) => d.textContent.includes("₦1.00")),
    fee: [...document.querySelectorAll("dd")].some((d) => d.textContent.includes("₦0"))
  }));
  await page.getByRole("button", { name: /Confirm & send/ }).click();
  await page.waitForTimeout(2000);
  results.sendResult = await page.evaluate(() => ({
    notSent: [...document.querySelectorAll("h2")].some((h) => h.textContent === "Not sent"),
    honestMessage: document.body.textContent.includes("not active yet") || document.body.textContent.includes("Transfers are not active"),
    noFakeSuccess: ![...document.querySelectorAll("h2")].some((h) => h.textContent === "Transfer sent")
  }));
  await page.screenshot({ path: "qa-artifacts/pay/send-mobile.png", fullPage: true });
  await page.close();

  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await login(page, { email: "customer@naijadeals.local", password: "CustomerPass123!" });
  await page.goto("http://localhost:3015/pay/receive", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1200);
  results.receive = await page.evaluate(() => ({
    heading: document.querySelector("h1")?.textContent,
    handle: [...document.querySelectorAll("p")].some((p) => p.textContent.includes("customer@naijadeals.local")),
    copyBtn: [...document.querySelectorAll("button")].some((b) => b.textContent.includes("Copy handle")),
    comingSection: [...document.querySelectorAll("h2")].some((h) => h.textContent.includes("Coming with the transfers rollout"))
  }));
  await page.screenshot({ path: "qa-artifacts/pay/receive-mobile.png", fullPage: true });
  await page.close();

  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await login(page, { email: "customer@naijadeals.local", password: "CustomerPass123!" });
  await page.goto("http://localhost:3015/pay/scan", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  const manualVisible = await page.getByPlaceholder("e.g. ND-MERCHANT-0000").count();
  if (manualVisible > 0) {
    await page.getByPlaceholder("e.g. ND-MERCHANT-0000").fill("ND-TEST-0001");
    await page.getByRole("button", { name: "Look up merchant" }).click();
    await page.waitForTimeout(600);
  }
  results.scan = await page.evaluate(() => ({
    heading: document.querySelector("h1")?.textContent,
    manualEntry: Boolean(document.querySelector('input[placeholder="e.g. ND-MERCHANT-0000"]')),
    reviewHonest: document.body.textContent.includes("Merchant QR issuance is not live"),
    confirmDisabled: [...document.querySelectorAll("button")].some((b) => b.disabled && b.textContent.includes("Confirm"))
  }));
  await page.screenshot({ path: "qa-artifacts/pay/scan-mobile.png", fullPage: true });
  await page.close();

  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await login(page, { email: "customer@naijadeals.local", password: "CustomerPass123!" });
  await page.goto("http://localhost:3015/pay/security", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  results.security = await page.evaluate(() => ({
    heading: document.querySelector("h1")?.textContent,
    currentBadge: [...document.querySelectorAll("span")].some((s) => s.textContent.includes("This device")),
    pinPending: document.body.textContent.includes("Transaction PIN — pending decision"),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }));
  await page.screenshot({ path: "qa-artifacts/pay/security-mobile.png", fullPage: true });
  await page.close();

  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await login(page, { email: "customer@naijadeals.local", password: "CustomerPass123!" });
  await page.goto("http://localhost:3015/wallet", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  const rangeSelect = await page.locator("select#tx-range").count();
  if (rangeSelect) await page.locator("select#tx-range").selectOption("7d");
  await page.waitForTimeout(400);
  const txButton = page.locator("ul.divide-y button").first();
  if ((await txButton.count()) > 0) {
    await txButton.click();
    await page.waitForTimeout(500);
  }
  results.wallet = await page.evaluate(() => ({
    rangeFilter: Boolean(document.querySelector("select#tx-range")),
    receiptOpen: document.body.textContent.includes("Receipt"),
    ledgerLine: document.body.textContent.includes("Balanced entry on the NaijaDeals ledger")
  }));
  await page.screenshot({ path: "qa-artifacts/pay/wallet-receipt.png", fullPage: true });
  await page.close();

  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})();
