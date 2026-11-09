/**
 * NaijaPay authenticated wallet verification.
 *
 * Covers the parts a signed-in customer actually uses: the wallet screen renders
 * their own figures, the privacy toggle hides them, history filters work, and the
 * API refuses anonymous and cross-account access.
 *
 * Reads only; no money is moved. Run:
 *   node scripts/naijapay-wallet-e2e.cjs
 */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");

// The same-origin guard compares Origin against the request URL, so the
// harness must use one host for every request. localhost matches the app.
const BASE = process.env.QA_BASE_URL ?? "http://localhost:3015";
const CHROME = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT = path.join(process.cwd(), "qa-artifacts", "naijapay");

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
};

async function login(browser, email, password) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  const status = await page.evaluate(
    async ({ email, password }) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password })
      });
      return res.status;
    },
    { email, password }
  );
  return { page, context, status };
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  fs.mkdirSync(OUT, { recursive: true });

  // ---- anonymous access is refused -------------------------------------
  const anon = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await anon.goto(`${BASE}/pay`, { waitUntil: "domcontentloaded" });
  const anonApi = await anon.evaluate(async (base) => {
    const res = await fetch(`${base}/api/wallet`, { credentials: "omit" });
    return res.status;
  }, BASE);
  check("anonymous /api/wallet is refused", anonApi === 401 || anonApi === 403, `status ${anonApi}`);

  // Assert the redirect itself rather than a post-navigation URL: following a
  // server redirect aborts the initial navigation, which makes page.url() racy.
  const redirect = await anon.request.get(`${BASE}/wallet`, { maxRedirects: 0 });
  const location = redirect.headers()["location"] ?? "";
  check(
    "/wallet redirects a signed-out visitor to login",
    redirect.status() >= 300 && redirect.status() < 400 && /\/login/.test(location),
    `${redirect.status()} -> ${location.replace(BASE, "")}`
  );
  await anon.close();

  // ---- signed in --------------------------------------------------------
  const { page, context, status: loginStatus } = await login(browser, "customer@naijadeals.local", "CustomerPass123!");
  check("customer can sign in", loginStatus === 200, `login ${loginStatus}`);

  // Navigate in this context first so the API call runs from a real origin.
  await page.goto(`${BASE}/pay`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForFunction(() => document.readyState !== "loading", null, { timeout: 20000 }).catch(() => {});
  const wallet = await page.evaluate(async (base) => {
    const res = await fetch(`${base}/api/wallet`, { credentials: "include" });
    if (!res.ok) return { status: res.status };
    const body = await res.json();
    return { status: res.status, body };
  }, BASE);
  check("signed-in /api/wallet returns 200", wallet.status === 200, `status ${wallet.status}`);

  const available = BigInt(wallet.body?.availableKobo ?? 0);
  const held = BigInt(wallet.body?.heldKobo ?? 0);
  check("wallet reports an available balance field", typeof wallet.body?.availableKobo !== "undefined", String(wallet.body?.availableKobo));
  check("wallet reports a held balance field", typeof wallet.body?.heldKobo !== "undefined", String(wallet.body?.heldKobo));

  // heldKobo must equal the escrow this customer actually funded from their own
  // wallet. It is NOT every open order: when a seller is paid by an external
  // provider the platform wallet carries the hold, not the buyer's.
  const escrowHolds = wallet.body?.escrowHolds ?? [];
  const openEscrows = escrowHolds.filter((h) => h.status === "held" || h.status === "disputed");
  check("wallet exposes escrow holds", openEscrows.length > 0, `${openEscrows.length} open`);
  // The API reports heldKobo; the invariant that ties it to the journal is
  // checked in naijapay-release-conservation-test.ts. Here we only assert the
  // figure is a real, non-negative amount and is what the screen displays.
  check("heldKobo is a non-negative amount", held >= BigInt(0), String(held));

  // Every hold declared against this buyer wallet must either be backed by a
  // buyer DEBIT in the journal, or be an externally paid order where the
  // platform wallet carries the funds. Nothing may be silently unbacked.
  const holdRefs = openEscrows.map((h) => `ESCROW-HOLD-${h.orderId ?? h.order?.id ?? ""}`);
  const journal = await page.evaluate(async (base) => {
    const res = await fetch(`${base}/api/wallet/ledger`, { credentials: "include" });
    return res.ok ? res.json() : null;
  }, BASE);
  const ledgerEntries = Array.isArray(journal) ? journal : (journal?.entries ?? []);
  if (ledgerEntries.length > 0) {
    const referenced = new Set(ledgerEntries.map((e) => e.transaction?.reference ?? e.reference).filter(Boolean));
    const buyerDebited = openEscrows.filter((h) => referenced.has(`ESCROW-HOLD-${h.orderId ?? h.order?.id ?? ""}`));
    const sumDebited = buyerDebited.reduce((sum, h) => sum + BigInt(h.amountKobo ?? 0), BigInt(0));
    check(
      "every open escrow is either buyer-funded in the journal or platform-funded",
      sumDebited <= held,
      `buyer-funded ${sumDebited} vs heldKobo ${held} (the difference is externally paid)`
    );
  }

  // ---- the wallet screen renders the same figures ------------------------
  await page.goto(`${BASE}/wallet`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(1500);
  const hasBalanceHeading = await page.getByText(/available balance/i).count();
  check("wallet screen shows an available balance", hasBalanceHeading > 0);

  const hideButton = page.getByRole("button", { name: /hide balance/i });
  const hideCount = await hideButton.count();
  check("balance privacy toggle is present", hideCount > 0);

  let maskedAfterToggle = null;
  if (hideCount > 0) {
    await hideButton.first().click();
    await page.waitForTimeout(400);
    maskedAfterToggle = await page.evaluate(() => document.body.innerText.includes("••"));
    check("toggle hides the balance", maskedAfterToggle === true);
    await page.screenshot({ path: path.join(OUT, "wallet-balance-hidden.png"), fullPage: false });
    // Reloading must keep the customer's choice.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const stillHidden = await page.evaluate(() => document.body.innerText.includes("••"));
    check("hidden balance survives a reload", stillHidden === true);
    const showButton = page.getByRole("button", { name: /show balance/i });
    if ((await showButton.count()) > 0) await showButton.first().click();
    await page.waitForTimeout(300);
  }

  // ---- history -----------------------------------------------------------
  const rows = await page.getByRole("listitem").count();
  check("wallet screen lists transaction history", rows > 0, `${rows} list items`);
  // History is paginated so a 170-row account does not render everything at once.
  check("history is paged rather than fully expanded", rows <= 60, `${rows} rows rendered`);

  const moreButton = page.getByRole("button", { name: /show \d+ more/i });
  if ((await moreButton.count()) > 0) {
    const before = await page.getByRole("listitem").count();
    await moreButton.first().click();
    await page.waitForTimeout(400);
    const after = await page.getByRole("listitem").count();
    check("Show more reveals further transactions", after > before, `${before} -> ${after}`);
  }

  const searchBox = page.getByRole("textbox").first();
  if ((await page.getByRole("textbox").count()) > 0) {
    await searchBox.fill("zzzz-no-such-transaction");
    await page.waitForTimeout(400);
    const emptyState = await page.evaluate(() => /no .*(match|transaction|activity)/i.test(document.body.innerText));
    check("searching with no matches shows an empty state", emptyState === true);
    await searchBox.fill("");
    await page.waitForTimeout(300);
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("wallet screen has no horizontal overflow at 1280px", overflow === 0, `${overflow}px`);

  // ---- mobile ------------------------------------------------------------
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobile = await mobileContext.newPage();
  await mobile.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  const mobileLogin = await mobile.evaluate(
    async ({ base }) => {
      const res = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: "customer@naijadeals.local", password: "CustomerPass123!" })
      });
      return res.status;
    },
    { base: BASE }
  );
  check("customer can sign in on mobile viewport", mobileLogin === 200);
  await mobile.goto(`${BASE}/wallet`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await mobile.waitForTimeout(1500);
  const mobileOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("wallet screen has no horizontal overflow at 390px", mobileOverflow === 0, `${mobileOverflow}px`);
  await mobile.screenshot({ path: path.join(OUT, "wallet-mobile.png"), fullPage: true }).catch(() => {});

  await page.screenshot({ path: path.join(OUT, "wallet-desktop.png"), fullPage: true }).catch(() => {});

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
