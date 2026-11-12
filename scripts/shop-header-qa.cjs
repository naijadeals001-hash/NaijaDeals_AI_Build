/**
 * Shop header acceptance probe.
 *
 * Verifies the shared Marketplace header at the required viewports, drives the
 * real search and drawer journeys, captures screenshots for inspection and
 * records measurements. It asserts rendered geometry and behaviour; a 200
 * response alone is never treated as a pass.
 *
 * Usage: QA_BASE_URL=http://localhost:3137 node scripts/shop-header-qa.cjs
 */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.QA_BASE_URL ?? "http://localhost:3137";
const OUT = path.join(process.cwd(), "qa-artifacts", "shop-header-final");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
fs.mkdirSync(OUT, { recursive: true });

const WIDTHS = [320, 360, 390, 412, 768, 1440];
const ROUTES = [
  "/naijashop",
  "/naijashop/search?q=laptop",
  "/naijashop/categories",
  "/naijashop/c/phones-tablets",
  "/naijashop/deals",
  "/naijashop/bestsellers",
  "/naijashop/sellers",
  "/naijashop/help",
  "/naijashop/plus"
];

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function rectOf(box) {
  if (!box) return null;
  return {
    top: Math.round(box.top),
    left: Math.round(box.left),
    right: Math.round(box.right),
    bottom: Math.round(box.bottom),
    width: Math.round(box.width),
    height: Math.round(box.height)
  };
}

async function headerMetrics(page) {
  return page.evaluate(() => {
    const rect = (node) => {
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return { top: box.top, left: box.left, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
    };
    const header = document.querySelector("[data-shop-header]");
    const buttons = [...document.querySelectorAll("[data-shop-header] button")];
    const account = buttons.find((node) => (node.getAttribute("aria-label") ?? "").toLowerCase().startsWith("account"));
    const location = buttons.find((node) => (node.getAttribute("aria-label") ?? "").toLowerCase().includes("delivery location"));
    const all = buttons.find((node) => node.getAttribute("aria-label") === "Open all departments");
    const more = buttons.find((node) => node.getAttribute("aria-label") === "More marketplace options");
    return {
      header: rect(header),
      position: header ? getComputedStyle(header).position : null,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      logo: rect(document.querySelector('[aria-label="NaijaDeals Marketplace home"]')),
      account: rect(account),
      orders: rect(document.querySelector('[aria-label="Returns and orders"]')),
      cart: rect(document.querySelector('a[aria-label^="Cart"]')),
      search: rect(document.querySelector('[data-shop-header] form[role="search"]')),
      scope: rect(document.querySelector("#shop-search-scope")),
      input: rect(document.querySelector("#shop-search-input")),
      location: rect(location),
      all: rect(all),
      priceDrops: rect(document.querySelector('a[href="/naijashop/deals"]')),
      bestsellers: rect(document.querySelector('a[href="/naijashop/bestsellers"]')),
      more: rect(more),
      footer: Boolean(document.querySelector("footer")),
      shellCount: document.querySelectorAll("[data-shop-shell]").length,
      headerCount: document.querySelectorAll("[data-shop-header]").length,
      mainCount: document.querySelectorAll("main#shop-main").length,
      locationText: location?.innerText.replace(/\s+/g, " ").trim() ?? null,
      searchValue: document.querySelector("#shop-search-input")?.value ?? null,
      scopeValue: document.querySelector("#shop-search-scope")?.value ?? null
    };
  });
}

function overlap(a, b, tolerance = 1) {
  if (!a || !b) return false;
  return !(
    a.right <= b.left + tolerance ||
    b.right <= a.left + tolerance ||
    a.bottom <= b.top + tolerance ||
    b.bottom <= a.top + tolerance
  );
}

async function crossSurfaceLocationDefaults(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const page = await context.newPage();
    await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForTimeout(900);
    const cookies = await context.cookies();
    const switcher = page.locator('button[aria-label^="Choose location, Nigeria"]');
    const switcherVisible = await switcher.first().isVisible().catch(() => false);
    record("homepage: no city cookie is written before a choice", !cookies.some((cookie) => cookie.name === "nd_city"));
    record("homepage: header asks for a location instead of showing Lagos", switcherVisible, `visible=${switcherVisible}`);
    const homeText = await page.locator("body").innerText();
    record(
      "homepage: Abuja journeys stay labelled as examples",
      /example journeys · abuja/i.test(homeText) && /choose city/i.test(homeText),
      /example journeys · abuja/i.test(homeText) ? "example label present" : "example label missing"
    );
    await page.screenshot({ path: path.join(OUT, "homepage-location-1440.png"), fullPage: false });

    const products = await page.evaluate(async () => {
      const response = await fetch("/api/products");
      return response.ok ? response.json() : [];
    });
    const product = (Array.isArray(products) ? products : []).find(
      (row) => row?.slug && !/^(variant fixture|test |upload test|last unit|product test)/i.test(row.name ?? "")
    );
    if (product) {
      await page.goto(`${BASE}/product/${product.slug}`, { waitUntil: "networkidle", timeout: 120000 });
      await page.waitForTimeout(500);
      const pdpSwitcher = page.locator('button[aria-label^="Choose location, Nigeria"]');
      const pdpVisible = await pdpSwitcher.first().isVisible().catch(() => false);
      record("product detail: shared header asks for a location, not Lagos", pdpVisible, `visible=${pdpVisible}`);
      await page.screenshot({ path: path.join(OUT, "product-detail-location-1440.png"), fullPage: false });
    } else {
      record("product detail: shared header asks for a location, not Lagos", false, "no product available to open");
    }

    // A homepage city choice must be explicit, persisted and reflected, without
    // changing any delivery address.
    await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForTimeout(500);
    await page.locator('button[aria-label^="Choose location, Nigeria"]').first().click();
    await page.waitForTimeout(300);
    await page.selectOption('select[aria-label^="City:"]', "Abuja");
    await page.waitForTimeout(1200);
    const chosenSwitcher = page.locator('button[aria-label^="Abuja, Nigeria"]');
    const chosenVisible = await chosenSwitcher.first().isVisible().catch(() => false);
    const chosenCookies = await context.cookies();
    record(
      "homepage: an explicit city choice updates the shared header and cookie",
      chosenVisible && chosenCookies.some((cookie) => cookie.name === "nd_city" && cookie.value === "Abuja"),
      `visible=${chosenVisible} city=${chosenCookies.find((cookie) => cookie.name === "nd_city")?.value}`
    );
    await page.screenshot({ path: path.join(OUT, "homepage-city-chosen-1440.png"), fullPage: false });
  } finally {
    await context.close();
  }
}

async function signedInSavedAddress(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  let addressId = null;
  try {
    const login = await context.request.post(`${BASE}/api/auth/login`, {
      data: { email: "customer@naijadeals.local", password: "CustomerPass123!" },
      headers: { Origin: BASE }
    });
    record("signed-in fixture: customer login works", login.ok(), String(login.status()));
    if (!login.ok()) return;

    const created = await context.request.post(`${BASE}/api/account/addresses`, {
      data: {
        label: "QA header check",
        countryCode: "NG",
        state: "Lagos",
        city: "Ikeja",
        line1: "1 QA Header Street",
        phone: "08030000000",
        isDefault: true
      },
      headers: { Origin: BASE }
    });
    const address = await created.json().catch(() => null);
    addressId = address?.id ?? null;
    record("signed-in fixture: temporary saved address accepted", created.ok() && Boolean(addressId), String(created.status()));

    const page = await context.newPage();
    await page.goto(`${BASE}/naijashop`, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForTimeout(1000);
    const locationTrigger = page.getByRole("button", { name: /delivery location/i });
    const before = (await locationTrigger.innerText()).replace(/\s+/g, " ");
    record(
      "signed-in: saved delivery address is shown, not Lagos-by-default",
      /Ikeja, Lagos/.test(before) && !/Choose delivery location/.test(before),
      before
    );
    await locationTrigger.click();
    await page.waitForTimeout(400);
    const panel = page.getByRole("dialog", { name: "Delivery location" });
    const panelText = await panel.innerText();
    record(
      "signed-in: location panel distinguishes the address from browsing city",
      /saved delivery address/i.test(panelText) &&
        /marketplace city/i.test(panelText) &&
        /choose a browsing city/i.test(panelText) &&
        /stays unchanged/i.test(panelText)
    );
    await page.screenshot({ path: path.join(OUT, "saved-address-390.png"), fullPage: false });
    await page.selectOption("#shop-location-city", "Abuja");
    await page.waitForTimeout(1200);
    const after = (await page.getByRole("button", { name: /delivery location/i }).innerText()).replace(/\s+/g, " ");
    const cookies = await context.cookies();
    record(
      "signed-in: choosing a browsing city does not overwrite the saved address",
      /Ikeja, Lagos/.test(after) && cookies.some((cookie) => cookie.name === "nd_city" && cookie.value === "Abuja"),
      `${after} | cityCookie=${cookies.find((cookie) => cookie.name === "nd_city")?.value}`
    );
    const remaining = await context.request.get(`${BASE}/api/account/addresses`);
    const list = await remaining.json().catch(() => []);
    record(
      "signed-in: saved address still present after the city choice",
      Array.isArray(list) && list.some((row) => row.city === "Ikeja" && row.state === "Lagos"),
      JSON.stringify(Array.isArray(list) ? list.map((row) => `${row.city}, ${row.state}`) : list)
    );
    await page.screenshot({ path: path.join(OUT, "saved-address-after-city-390.png"), fullPage: false });
  } finally {
    if (addressId) {
      await context.request.delete(`${BASE}/api/account/addresses/${addressId}`, { headers: { Origin: BASE } }).catch(() => {});
    }
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    for (const width of WIDTHS) {
      const height = width < 768 ? 900 : 1000;
      const context = await browser.newContext({
        viewport: { width, height },
        isMobile: width < 768,
        hasTouch: width < 768,
        deviceScaleFactor: width < 768 ? 2 : 1
      });
      const page = await context.newPage();
      const pageErrors = [];
      const consoleErrors = [];
      page.on("pageerror", (error) => pageErrors.push(String(error).slice(0, 160)));
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text().slice(0, 160));
      });

      await page.goto(`${BASE}/naijashop`, { waitUntil: "networkidle", timeout: 120000 });
      await page.waitForTimeout(700);
      const m = await headerMetrics(page);
      const mobile = width < 1024;

      record(`${width}px: exactly one shared header`, m.headerCount === 1 && m.shellCount === 1, `headers=${m.headerCount} shells=${m.shellCount}`);
      record(`${width}px: single main landmark`, m.mainCount === 1, `${m.mainCount}`);
      record(`${width}px: Marketplace footer present`, m.footer === true);
      record(`${width}px: no horizontal page overflow`, m.scrollWidth - m.clientWidth <= 1, `${m.scrollWidth - m.clientWidth}px`);
      record(
        `${width}px: no missing controls`,
        [m.logo, m.account, m.orders, m.cart, m.search, m.scope, m.input, m.location, m.all, m.priceDrops, m.bestsellers, m.more].every(Boolean)
      );
      const controls = [
        ["logo", m.logo],
        ["account", m.account],
        ["orders", m.orders],
        ["cart", m.cart],
        ["search", m.search],
        ["location", m.location],
        ["all", m.all],
        ["priceDrops", m.priceDrops],
        ["bestsellers", m.bestsellers],
        ["more", m.more]
      ];
      const clipped = controls.filter(([, box]) => !box || box.left < -1 || box.right > width + 1);
      record(`${width}px: every control inside the viewport`, clipped.length === 0, clipped.map(([name]) => name).join(", "));

      if (mobile) {
        const row1 = [m.logo, m.account, m.orders, m.cart];
        const row1Tops = new Set(row1.map((box) => Math.round(box.top / 8)));
        record(`${width}px: row 1 groups logo, Account & Lists, Orders, Cart`, row1Tops.size === 1, row1.map((box) => box.top).join(","));
        record(
          `${width}px: search occupies its own full-width row below row 1`,
          m.search.top >= Math.max(...row1.map((box) => box.bottom)) - 1 && m.search.width >= width - 80,
          `top=${m.search.top} width=${m.search.width}`
        );
        record(`${width}px: delivery row sits below search`, m.location.top >= m.search.bottom - 1, `${m.location.top} >= ${m.search.bottom}`);
        record(
          `${width}px: All / Price drops / Bestsellers / More share the navigation row below delivery`,
          m.all.top >= m.location.bottom - 1 &&
            new Set([m.all, m.priceDrops, m.bestsellers, m.more].map((box) => Math.round(box.top / 8))).size === 1,
          [m.all.top, m.priceDrops.top, m.bestsellers.top, m.more.top].join(",")
        );
        record(
          `${width}px: search input remains wide enough to type in`,
          m.input.width >= 120 && m.search.width >= width - 80,
          `input=${m.input.width} form=${m.search.width}`
        );
      } else {
        record(`${width}px: desktop header is sticky`, m.position === "sticky", String(m.position));
        const stickyHeight = m.header.height;
        record(`${width}px: sticky header height measured`, stickyHeight > 80 && stickyHeight < 220, `${stickyHeight}px`);
        record(
          `${width}px: logo, search, delivery and actions share the top row`,
          Math.abs(m.logo.top - m.search.top) < 40 &&
            Math.abs(m.search.top - m.location.top) < 40 &&
            Math.abs(m.location.top - m.account.top) < 40,
          [m.logo.top, m.search.top, m.location.top, m.account.top].join(",")
        );
      }
      const sameRowPairs = [
        ["account", m.account, "orders", m.orders],
        ["orders", m.orders, "cart", m.cart],
        ["logo", m.logo, "account", m.account],
        ["all", m.all, "priceDrops", m.priceDrops],
        ["priceDrops", m.priceDrops, "bestsellers", m.bestsellers],
        ["bestsellers", m.bestsellers, "more", m.more]
      ];
      const overlaps = sameRowPairs.filter(([, a, , b]) => overlap(a, b));
      record(`${width}px: no overlap between header controls`, overlaps.length === 0, overlaps.map(([name, , other]) => `${name}/${other}`).join(", "));

      await page.screenshot({ path: path.join(OUT, `landing-${width}.png`), fullPage: false });
      await page.screenshot({ path: path.join(OUT, `landing-${width}-full.png`), fullPage: true });

      // Search from the one shared field.
      await page.fill("#shop-search-input", "laptop");
      await page.press("#shop-search-input", "Enter");
      await page.waitForURL(/\/naijashop\/search\?q=laptop/, { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const searchState = await headerMetrics(page);
      record(`${width}px: header search submits to results`, page.url().includes("/naijashop/search?q=laptop"), page.url());
      record(`${width}px: query stays in the shared search field`, searchState.searchValue === "laptop", String(searchState.searchValue));

      // Department scope is a distinct control, not the All drawer.
      await page.selectOption("#shop-search-scope", "fashion");
      await page.fill("#shop-search-input", "shirt");
      await page.press("#shop-search-input", "Enter");
      await page.waitForURL(/\/naijashop\/c\/fashion\?q=shirt/, { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(1200);
      const scopedState = await headerMetrics(page);
      record(`${width}px: department scope submits within that department`, page.url().includes("/naijashop/c/fashion?q=shirt"), page.url());
      record(
        `${width}px: scope and query stay in sync after navigation`,
        scopedState.scopeValue === "fashion" && scopedState.searchValue === "shirt",
        `scope=${scopedState.scopeValue} q=${scopedState.searchValue}`
      );

      // All drawer: touch/click, scroll lock, Escape, focus restore.
      await page.goto(`${BASE}/naijashop`, { waitUntil: "networkidle", timeout: 120000 });
      await page.waitForTimeout(600);
      const allTrigger = page.getByRole("button", { name: "Open all departments" });
      await allTrigger.click();
      await page.waitForTimeout(400);
      const allOpen = await page.getByRole("dialog", { name: "All" }).isVisible();
      const bodyLocked = await page.evaluate(() => getComputedStyle(document.body).overflow === "hidden");
      record(`${width}px: All drawer opens with background scroll locked`, allOpen && bodyLocked, `open=${allOpen} locked=${bodyLocked}`);
      await page.screenshot({ path: path.join(OUT, `all-drawer-${width}.png`), fullPage: false });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(450);
      const allClosed = !(await page.getByRole("dialog", { name: "All" }).isVisible().catch(() => false));
      const allFocus = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
      record(`${width}px: All drawer closes on Escape and restores focus`, allClosed && allFocus === "Open all departments", `closed=${allClosed} focus=${allFocus}`);

      // Account panel: touch/click, backdrop close, focus restore, scroll unlock.
      const accountTrigger = page.getByRole("button", { name: /^Account and lists/ });
      await accountTrigger.click();
      await page.waitForTimeout(400);
      const accountOpen = await page.getByRole("dialog", { name: "Account & Lists" }).isVisible();
      record(`${width}px: Account & Lists panel opens`, accountOpen);
      await page.screenshot({ path: path.join(OUT, `account-${width}.png`), fullPage: false });
      let focusStayedInside = true;
      for (let index = 0; index < 8; index += 1) {
        await page.keyboard.press("Tab");
        focusStayedInside =
          focusStayedInside &&
          (await page.evaluate(() => {
            const dialog = document.getElementById("shop-account-panel");
            return Boolean(dialog && dialog.contains(document.activeElement));
          }));
      }
      record(`${width}px: Account panel traps keyboard focus`, focusStayedInside);
      await page.locator(".shop-nav-overlay").click({ position: { x: 4, y: 4 } });
      await page.waitForTimeout(400);
      const accountClosed = !(await page.getByRole("dialog", { name: "Account & Lists" }).isVisible().catch(() => false));
      const accountFocus = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
      const bodyUnlocked = await page.evaluate(() => getComputedStyle(document.body).overflow !== "hidden");
      record(
        `${width}px: Account panel closes on backdrop, restores focus and unlocks scroll`,
        accountClosed && bodyUnlocked && /Account and lists/.test(accountFocus ?? ""),
        `closed=${accountClosed} unlocked=${bodyUnlocked} focus=${accountFocus}`
      );

      // More drawer preserves bulk, freight, sell, help and departments.
      const moreTrigger = page.getByRole("button", { name: "More marketplace options" });
      await moreTrigger.click();
      await page.waitForTimeout(400);
      const moreOpen = await page.getByRole("dialog", { name: "More" }).isVisible();
      const moreText = await page.getByRole("dialog", { name: "More" }).innerText();
      record(
        `${width}px: More drawer keeps bulk, freight, sell, help and departments`,
        moreOpen &&
          /Bulk buying/.test(moreText) &&
          /Freight/.test(moreText) &&
          /Sell on NaijaDeals/.test(moreText) &&
          /Help/.test(moreText) &&
          /All departments/.test(moreText),
        `open=${moreOpen}`
      );
      await page.screenshot({ path: path.join(OUT, `more-${width}.png`), fullPage: false });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);

      // Delivery location: no silent Lagos, explicit choice, panel keyboard close.
      const locationTrigger = page.getByRole("button", { name: /delivery location/i });
      const beforeText = await locationTrigger.innerText();
      record(`${width}px: unknown location asks instead of defaulting to Lagos`, /Choose delivery location/.test(beforeText), beforeText.replace(/\s+/g, " "));
      await locationTrigger.click();
      await page.waitForTimeout(400);
      const locationOpen = await page.getByRole("dialog", { name: "Delivery location" }).isVisible();
      await page.screenshot({ path: path.join(OUT, `location-${width}.png`), fullPage: false });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(350);
      const locationClosed = !(await page.getByRole("dialog", { name: "Delivery location" }).isVisible().catch(() => false));
      const locationFocus = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
      record(
        `${width}px: location panel closes on Escape and restores focus`,
        locationClosed && /delivery location/i.test(locationFocus ?? ""),
        `closed=${locationClosed} focus=${locationFocus}`
      );
      await page.getByRole("button", { name: /delivery location/i }).click();
      await page.waitForTimeout(350);
      await page.selectOption("#shop-location-city", "Abuja");
      await page.waitForTimeout(1200);
      const afterText = await page.getByRole("button", { name: /delivery location/i }).innerText();
      record(`${width}px: explicit city choice updates the header without inventing an address`, /Abuja/.test(afterText), afterText.replace(/\s+/g, " "));

      record(`${width}px: no page errors`, pageErrors.length === 0, pageErrors.join(" | "));
      record(`${width}px: no console errors`, consoleErrors.length === 0, consoleErrors.join(" | "));

      // Every advertised Shop route renders the same one header, main and footer.
      for (const route of ROUTES) {
        await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 120000 });
        await page.waitForTimeout(350);
        const state = await headerMetrics(page);
        const ok =
          state.headerCount === 1 &&
          state.mainCount === 1 &&
          state.footer === true &&
          state.scrollWidth - state.clientWidth <= 1 &&
          Boolean(state.search) &&
          Boolean(state.account) &&
          Boolean(state.cart);
        record(`${width}px: shared shell on ${route}`, ok, JSON.stringify({ headers: state.headerCount, main: state.mainCount, footer: state.footer, overflow: state.scrollWidth - state.clientWidth }));
        if (width === 390 || width === 1440) {
          const slug = route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
          await page.screenshot({ path: path.join(OUT, `route-${width}-${slug}.png`), fullPage: false });
        }
      }

      // Enlarged text stress: 125% zoom on a phone, then confirm reflow.
      await page.goto(`${BASE}/naijashop`, { waitUntil: "networkidle", timeout: 120000 });
      await page.evaluate(() => {
        document.documentElement.style.zoom = "1.25";
      });
      await page.waitForTimeout(500);
      const zoomState = await page.evaluate(() => {
        // CSS zoom changes the effective layout width while the document
        // scrollWidth keeps reporting visual pixels. BODY is the layout box
        // that must reflow; comparing it avoids a false overflow reading.
        const header = document.querySelector("[data-shop-header]");
        const buttons = [...document.querySelectorAll("[data-shop-header] button")];
        const account = buttons.find((node) => (node.getAttribute("aria-label") ?? "").toLowerCase().startsWith("account"));
        const cart = document.querySelector('a[aria-label^="Cart"]');
        const search = document.querySelector('[data-shop-header] form[role="search"]');
        const r = (node) => (node ? node.getBoundingClientRect() : null);
        return {
          bodyOverflow: document.body.scrollWidth - document.body.clientWidth,
          headerHeight: header?.getBoundingClientRect().height ?? 0,
          headerControls: [r(account), r(cart), r(search)].map((box) => (box ? { left: box.left, right: box.right, bottom: box.bottom } : null))
        };
      });
      const zoomControls = zoomState.headerControls;
      record(
        `${width}px: enlarged text/reflow keeps the page usable`,
        zoomState.bodyOverflow <= 2 &&
          zoomState.headerHeight > 80 &&
          zoomControls.every(Boolean) &&
          zoomControls[2].bottom <= zoomState.headerHeight + 2,
        JSON.stringify(zoomState)
      );
      await page.screenshot({ path: path.join(OUT, `enlarged-text-${width}.png`), fullPage: false });

      await context.close();
    }

    await crossSurfaceLocationDefaults(browser);
    await signedInSavedAddress(browser);
  } finally {
    await browser.close();
  }

  const failed = results.filter((result) => !result.ok);
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ base: BASE, generatedAt: new Date().toISOString(), total: results.length, failed: failed.length, results }, null, 2));
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  console.log(`Artifacts: ${OUT}`);
  if (failed.length > 0) {
    console.log(failed.map((item) => `FAILED: ${item.name} — ${item.detail}`).join("\n"));
    process.exitCode = 1;
  }
})();
