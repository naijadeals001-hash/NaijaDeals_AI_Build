/**
 * NaijaEats basket → checkout acceptance, driven in a real browser.
 *
 * Verifies persisted basket state, quantity changes, ordering per kitchen, the
 * basket clearing after a successful order, favourites persisting across a new
 * browser context (i.e. stored server-side), and the negative paths.
 *
 * Usage: node scripts/naijaeats-cart-check.cjs
 */
const { chromium } = require("playwright-core");

const BASE = process.env.BASE_URL ?? "http://localhost:3015";
let passed = 0;
const failures = [];
const check = (name, ok, detail) => {
  if (ok) {
    passed += 1;
    console.log(`  PASS ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

async function signIn(context) {
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const status = await page.evaluate(async () =>
    (
      await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: "customer@naijadeals.local", password: "CustomerPass123!" })
      })
    ).status
  );
  return { page, status };
}

(async () => {
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const session = await signIn(context);
  check("customer signs in", session.status === 200, String(session.status));
  const page = session.page;

  // Start from an empty basket.
  await page.evaluate(async () => fetch("/api/eats/cart", { method: "DELETE", credentials: "include" }));

  const target = await page.evaluate(async () => {
    const restaurants = await (await fetch("/api/eats/restaurants")).json();
    const kitchen = restaurants.find((row) => (row.menuItems?.length ?? 0) >= 2) ?? restaurants[0];
    return { restaurantId: kitchen.id, slug: kitchen.slug, items: kitchen.menuItems.slice(0, 2) };
  });
  console.log(`  INFO checking out with ${target.slug}`);
  check("a kitchen with dishes is available", Boolean(target?.items?.length >= 2), JSON.stringify(target?.slug));

  // Add two dishes through the API, then confirm the basket page renders them.
  const added = await page.evaluate(
    async ({ items }) => {
      const results = [];
      for (const item of items) {
        const response = await fetch("/api/eats/cart/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ menuItemId: item.id, quantity: 1 })
        });
        results.push({ status: response.status, body: await response.json().catch(() => ({})) });
      }
      return results;
    },
    { items: target.items }
  );
  check("dishes can be added to the basket", added.every((row) => row.status === 201), JSON.stringify(added.map((row) => row.status)));

  await page.goto(`${BASE}/naijaeats/cart`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const rendered = await page.evaluate(() => ({ lines: document.querySelectorAll("[data-line]").length, text: document.body.innerText.slice(0, 160) }));
  check("basket page renders the saved lines", rendered.lines === 2, JSON.stringify(rendered.lines));

  // Quantity increase persists.
  const firstLine = await page.locator("[data-line]").first().getAttribute("data-line");
  await page.getByRole("button", { name: /Increase/i }).first().click();
  await page.waitForTimeout(1200);
  const quantityAfter = await page.evaluate(async () => {
    const basket = await (await fetch("/api/eats/cart", { credentials: "include" })).json();
    return basket.groups.flatMap((group) => group.lines).map((line) => line.quantity);
  });
  check("quantity change persists", quantityAfter.some((quantity) => quantity === 2), JSON.stringify(quantityAfter));

  // Basket survives a brand-new browser context (server-side storage).
  const otherContext = await browser.newContext();
  const other = await signIn(otherContext);
  const persisted = await other.page.evaluate(async () => {
    const basket = await (await fetch("/api/eats/cart", { credentials: "include" })).json();
    return basket.count;
  });
  check("basket persists across sessions", persisted >= 3, String(persisted));

  // Checkout in the UI.
  // Fill the delivery section by its labels, then place the order.
  await page.getByLabel("Name", { exact: true }).fill("Ada");
  await page.getByLabel("Phone").fill("08030000000");
  await page.getByLabel("Delivery address").fill("12 Adeola Odeku Street, Lagos");
  const placeButton = page.getByRole("button", { name: /Place order with/i }).first();
  await placeButton.waitFor({ state: "visible", timeout: 20000 });
  const beforeOrder = await page.evaluate(async () => (await (await fetch("/api/eats/cart", { credentials: "include" })).json()).count);
  check("basket holds the items being checked out", beforeOrder > 0, String(beforeOrder));
  await placeButton.click();
  await page.waitForTimeout(4500);
  const afterOrder = await page.evaluate(async () => {
    const basket = await (await fetch("/api/eats/cart", { credentials: "include" })).json();
    const orders = await (await fetch("/api/eats/orders", { credentials: "include" })).json();
    return { basketCount: basket.count, orders: Array.isArray(orders) ? orders.length : 0, latest: Array.isArray(orders) ? orders[0]?.orderNumber : null };
  });
  check("checkout creates an order and empties the basket", afterOrder.basketCount === 0 && afterOrder.orders > 0, JSON.stringify(afterOrder));
  console.log(`  INFO latest order ${afterOrder.latest}`);

  // Favourites persist server-side.
  const fav = await page.evaluate(async (id) => {
    const current = await (await fetch("/api/eats/favourites", { credentials: "include" })).json();
    // Normalise first so the assertion tests the toggle, not leftover state.
    if ((current.restaurants ?? []).some((row) => row.id === id)) {
      await fetch("/api/eats/favourites", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ kind: "restaurant", targetId: id }) });
    }
    const response = await fetch("/api/eats/favourites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ kind: "restaurant", targetId: id })
    });
    return { status: response.status, body: await response.json() };
  }, target.restaurantId);
  check("restaurant can be favourited", fav.status === 200 && fav.body.favourited === true, JSON.stringify(fav));
  const favElsewhere = await other.page.evaluate(async () => {
    const list = await (await fetch("/api/eats/favourites", { credentials: "include" })).json();
    return list.restaurants?.length ?? 0;
  });
  check("favourites persist across sessions", favElsewhere >= 1, String(favElsewhere));

  // ---- Negative paths ----
  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(`${BASE}/naijaeats`, { waitUntil: "domcontentloaded" });
  const guestAdd = await guestPage.evaluate(async (id) => (await fetch("/api/eats/cart/items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ menuItemId: id, quantity: 1 }) })).status, target.items[0].id);
  check("guest cannot add to a basket", guestAdd === 401, String(guestAdd));

  const overLimit = await page.evaluate(async (id) => {
    const response = await fetch("/api/eats/cart/items", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ menuItemId: id, quantity: 11 }) });
    if (response.status !== 201) return response.status;
    const basket = await (await fetch("/api/eats/cart", { credentials: "include" })).json();
    const line = basket.groups.flatMap((group) => group.lines).find((row) => row.menuItemId === id);
    await fetch("/api/eats/cart", { method: "DELETE", credentials: "include" });
    return line?.quantity <= 10 ? 201 : "overflow";
  }, target.items[0].id);
  check("quantity is capped at 10", overLimit === 201, String(overLimit));

  const crossKitchen = await page.evaluate(async () => {
    const restaurants = await (await fetch("/api/eats/restaurants")).json();
    const a = restaurants[0];
    const b = restaurants.find((row) => row.id !== a.id);
    const response = await fetch("/api/eats/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ restaurantId: a.id, items: [{ menuItemId: b.menuItems[0].id, quantity: 1 }], deliveryAddress: "x", contactName: "x", contactPhone: "x" })
    });
    return response.status;
  });
  check("an item from another kitchen is rejected", crossKitchen === 400, String(crossKitchen));

  await guest.close();
  await otherContext.close();
  await context.close();
  await browser.close();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.error("FAILURES:", failures.slice(0, 10));
    process.exit(1);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
