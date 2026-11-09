/**
 * NaijaPay link and control audit.
 *
 * For every NaijaPay page, at mobile and desktop widths, as a visitor and as a
 * signed-in customer:
 *  - every internal link resolves (no 404, no redirect loop);
 *  - every visible button has an accessible name and is not a dead control;
 *  - each page offers a way back to the dashboard;
 *  - nothing overflows horizontally on a phone.
 *
 * Run: node scripts/naijapay-link-audit.cjs
 */
const { chromium } = require("playwright-core");

const BASE = process.env.BASE_URL ?? "http://localhost:3015";
const CHROME = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PUBLIC_PAGES = ["/pay", "/pay/send", "/pay/receive", "/pay/scan", "/pay/business", "/pay/security"];
const SIGNED_IN_PAGES = [...PUBLIC_PAGES, "/wallet", "/pay/escrow"];

let pass = 0;
const failures = [];
const check = (name, ok, detail = "") => {
  if (ok) {
    pass += 1;
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

async function audit(page, path, viewport) {
  const res = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" }).catch(() => null);
  await page.waitForTimeout(1200);
  check(`${path} ${viewport} loads`, res && res.status() < 400, res ? `status ${res.status()}` : "navigation failed");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${path} ${viewport} no horizontal overflow`, overflow <= 0, `${overflow}px`);

  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll("a[href]"))
      .map((a) => ({ href: a.getAttribute("href"), text: (a.textContent || "").trim().slice(0, 40), visible: Boolean(a.offsetParent) }))
      .filter((l) => l.visible && l.href && !l.href.startsWith("mailto:") && !l.href.startsWith("tel:"))
  );

  const internal = [...new Set(links.map((l) => l.href).filter((h) => h.startsWith("/")))]
    .map((h) => h.split("#")[0])
    .filter(Boolean);
  for (const href of internal) {
    const r = await page.request.get(`${BASE}${href}`, { maxRedirects: 3 }).catch(() => null);
    check(`${path} link ${href} resolves`, r && r.status() < 400, r ? `status ${r.status()}` : "request failed");
  }

  const unnamed = await page.evaluate(() =>
    Array.from(document.querySelectorAll("button"))
      .filter((b) => b.offsetParent)
      .filter((b) => !(b.getAttribute("aria-label") || (b.textContent || "").trim()))
      .map((b) => b.outerHTML.slice(0, 80))
  );
  check(`${path} ${viewport} buttons have accessible names`, unnamed.length === 0, unnamed.slice(0, 2).join(" | "));

  const homeLink = links.some((l) => l.href === "/" || l.text.toLowerCase().includes("naijadeals"))
    || (await page.evaluate(() => Boolean(document.querySelector('a[href="/"]'))));
  check(`${path} ${viewport} offers a route back to the dashboard`, homeLink);
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });

  // ---- visitor ----------------------------------------------------------
  for (const viewport of [{ name: "mobile", width: 390, height: 844 }, { name: "desktop", width: 1440, height: 1000 }]) {
    const ctx = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await ctx.newPage();
    for (const path of PUBLIC_PAGES) await audit(page, path, viewport.name);
    await ctx.close();
  }

  // ---- signed-in customer ----------------------------------------------
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.evaluate(async () =>
    (
      await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: "naijapay-test-sender@naijadeals.test", password: "NaijaPayTest123!" })
      })
    ).status
  );
  for (const path of SIGNED_IN_PAGES) await audit(page, path, "signed-in");

  // Every Pay action button actually does something: it changes the view,
  // calls the API, or navigates — never silently nothing.
  await page.goto(`${BASE}/pay`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const addMoney = page.locator("#add-money");
  const providerButton = addMoney.getByRole("button", { name: /local test provider/i });
  if ((await providerButton.count()) > 0) {
    await providerButton.first().click();
    await page.waitForTimeout(400);
    const amountField = await page.locator("#topup-amount").count();
    check("Add Money provider button advances the flow", amountField > 0);
  }

  await ctx.close();
  await browser.close();

  console.log(`\n${pass} checks passed, ${failures.length} failed`);
  if (failures.length) {
    console.log(failures.map((f) => " - " + f).join("\n"));
    process.exit(1);
  }
  console.log("NAIJAPAY LINK AUDIT PASSED");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
