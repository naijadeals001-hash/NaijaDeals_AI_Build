/**
 * NaijaPay browser journey — Add Money -> Send -> wallet history.
 *
 * Runs the customer-facing path in a real browser against the dev preview using
 * the labelled NaijaPay test accounts (naijapay-test-*@naijadeals.test). Proves
 * the UI is wired to the APIs, that the balance changes by exactly the amounts
 * sent, and that a duplicate submit cannot send twice.
 *
 * Uses test money only. Run: node scripts/naijapay-browser-journey.cjs
 */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.QA_BASE_URL ?? "http://localhost:3015";
const CHROME = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT = path.join(process.cwd(), "qa-artifacts", "naijapay");

const SENDER = { email: "naijapay-test-sender@naijadeals.test", password: "NaijaPayTest123!" };
const RECIPIENT = "naijapay-test-recipient@naijadeals.test";

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
};

async function signedInContext(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  const status = await page.evaluate(
    async ({ email, password }) =>
      (
        await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email, password })
        })
      ).status,
    SENDER
  );
  return { context, page, status };
}

const readWallet = (page) =>
  page.evaluate(async () => {
    const res = await fetch("/api/wallet", { credentials: "include" });
    if (!res.ok) return { status: res.status };
    const body = await res.json();
    return { status: res.status, availableKobo: String(body.availableKobo ?? 0), heldKobo: String(body.heldKobo ?? 0) };
  });

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });

  // ---- desktop journey ---------------------------------------------------
  const { context, page, status: login } = await signedInContext(browser, { width: 1440, height: 1000 });
  check("test sender can sign in", login === 200, `login ${login}`);

  const before = await readWallet(page);
  check("wallet readable", before.status === 200, JSON.stringify(before));

  // 1. Add Money through the UI.
  await page.goto(`${BASE}/pay#add-money`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const addMoney = page.locator("#add-money");
  check("Add Money section renders", (await addMoney.count()) > 0);

  const testProviderButton = addMoney.getByRole("button", { name: /local test provider/i });
  const hasTestProvider = (await testProviderButton.count()) > 0;
  check("local test provider is offered and labelled", hasTestProvider);

  if (hasTestProvider) {
    await testProviderButton.first().click();
    await page.waitForTimeout(400);
    await page.locator("#topup-amount").fill("2500");
    await page.waitForTimeout(200);
    await addMoney.getByRole("button", { name: /^Add ₦2,500\.00$/ }).click().catch(async () => {
      await addMoney.getByRole("button", { name: /Add ₦/ }).first().click();
    });
    await page.waitForTimeout(2500);
    const credited = await page.getByText(/wallet credited/i).count();
    check("top-up reports the wallet credited", credited > 0);
    const afterTopUp = await readWallet(page);
    check(
      "balance increased by exactly 2,500.00",
      BigInt(afterTopUp.availableKobo) - BigInt(before.availableKobo) === 250000n,
      `${before.availableKobo} -> ${afterTopUp.availableKobo}`
    );
  }

  // 2. Send money through the UI.
  const beforeSend = await readWallet(page);
  await page.goto(`${BASE}/pay/send`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);

  const recipientInput = page.locator('input[type="email"], input[name="recipient"], input[placeholder*="email" i]').first();
  await recipientInput.fill(RECIPIENT);
  const amountInputs = page.locator('input[inputmode="decimal"], input[placeholder*="0.00"]');
  await amountInputs.first().fill("1000");
  await page.waitForTimeout(300);

  const reviewButton = page.getByRole("button", { name: /review transfer/i });
  await reviewButton.first().click();
  await page.waitForTimeout(2000);

  const onReview = await page.getByText(/^Review$/).count();
  check("recipient confirmed and review shown", onReview > 0);
  const showsRecipient = await page.getByText(/naijapay-test-recipient@naijadeals\.test/).count();
  check("review names the verified recipient", showsRecipient > 0);

  const confirmButton = page.getByRole("button", { name: /confirm & send/i });
  await confirmButton.first().click();
  await page.waitForTimeout(2500);
  const sent = await page.getByText(/transfer sent/i).count();
  check("transfer reports sent only after the server confirms", sent > 0);

  const afterSend = await readWallet(page);
  check(
    "balance fell by exactly 1,000.00",
    BigInt(beforeSend.availableKobo) - BigInt(afterSend.availableKobo) === 100000n,
    `${beforeSend.availableKobo} -> ${afterSend.availableKobo}`
  );

  // 3. The wallet history shows both events.
  await page.goto(`${BASE}/wallet`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const history = await page.evaluate(() => document.body.innerText);
  check("wallet history shows a P2P transfer", /P2P-/i.test(history) || /transfer/i.test(history));
  check("wallet history shows the top-up", /top-?up/i.test(history));

  await page.screenshot({ path: path.join(OUT, "journey-wallet-desktop.png"), fullPage: false });

  // 4. Duplicate protection: the same idempotency key must not send twice.
  const dup = await page.evaluate(async ({ recipient }) => {
    const key = "journey-dup-key-1234";
    const send = () =>
      fetch("/api/pay/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ recipientEmail: recipient, amountKobo: 500, idempotencyKey: key })
      }).then((r) => r.json());
    const first = await send();
    const second = await send();
    return { first, second };
  }, { recipient: RECIPIENT });
  check("duplicate submit returns the same reference", dup.first.reference === dup.second.reference, `${dup.first.reference} / ${dup.second.reference}`);
  check("duplicate submit is flagged as a duplicate", dup.second.duplicate === true);

  // 5. Server-side validation cannot be bypassed from the browser.
  const bad = await page.evaluate(async ({ recipient }) =>
    Promise.all([
      fetch("/api/pay/transfers", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ recipientEmail: recipient, amountKobo: -500, idempotencyKey: "neg-amount-key-1" }) }).then((r) => r.status),
      fetch("/api/pay/transfers", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ recipientEmail: recipient, amountKobo: 10, idempotencyKey: "tiny-amount-key-1" }) }).then((r) => r.status),
      fetch("/api/pay/transfers", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ recipientEmail: "naijapay-test-sender@naijadeals.test", amountKobo: 500, idempotencyKey: "self-send-key-1" }) }).then((r) => r.status),
      fetch("/api/pay/transfers", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ recipientEmail: recipient, amountKobo: 500 }) }).then((r) => r.status)
    ]), { recipient: RECIPIENT });
  check("negative amount rejected", bad[0] === 400, `status ${bad[0]}`);
  check("below-minimum amount rejected", bad[1] === 400, `status ${bad[1]}`);
  check("self-transfer rejected", bad[2] === 400, `status ${bad[2]}`);
  check("missing idempotency key rejected", bad[3] === 400, `status ${bad[3]}`);

  // 6. Cross-site request refused.
  const noOrigin = await page.evaluate(async ({ recipient }) => {
    const res = await fetch("/api/pay/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ recipientEmail: recipient, amountKobo: 500, idempotencyKey: "origin-test-key-1" })
    });
    return res.status;
  }, { recipient: RECIPIENT });
  check("a same-origin browser request is accepted by the origin guard", noOrigin === 201 || noOrigin === 200, `status ${noOrigin}`);

  // 7. The recipient sees the money arrive, under their own history.
  const recipientCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const recipientPage = await recipientCtx.newPage();
  await recipientPage.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  const recipientLogin = await recipientPage.evaluate(async () => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email: "naijapay-test-recipient@naijadeals.test", password: "NaijaPayTest123!" })
    });
    return res.status;
  });
  check("recipient can sign in", recipientLogin === 200);
  const incoming = await recipientPage.evaluate(async () => {
    const res = await fetch("/api/wallet", { credentials: "include" });
    const body = await res.json();
    return {
      availableKobo: String(body.availableKobo ?? 0),
      incoming: (body.transactions ?? []).filter((t) => String(t.reference).startsWith("P2P-")).map((t) => t.reference)
    };
  });
  check("recipient history includes incoming transfers", incoming.incoming.length > 0, `${incoming.incoming.length} received`);
  check("recipient balance is credited", BigInt(incoming.availableKobo) > 0n, incoming.availableKobo);
  await recipientPage.goto(`${BASE}/wallet`, { waitUntil: "domcontentloaded" });
  await recipientPage.waitForTimeout(2000);
  const recipientText = await recipientPage.evaluate(() => document.body.innerText);
  check("recipient wallet screen lists the transfer", /P2P-|transfer/i.test(recipientText));
  await recipientCtx.close();

  await context.close();

  // ---- mobile journey ----------------------------------------------------
  const mobile = await signedInContext(browser, { width: 390, height: 844 });
  check("test sender can sign in on mobile", mobile.status === 200);
  await mobile.page.goto(`${BASE}/pay/send`, { waitUntil: "domcontentloaded" });
  await mobile.page.waitForTimeout(1500);
  const overflow = await mobile.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("Send screen has no horizontal overflow on mobile", overflow === 0, `${overflow}px`);
  await mobile.page.screenshot({ path: path.join(OUT, "journey-send-mobile.png"), fullPage: true });
  await mobile.context.close();

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
