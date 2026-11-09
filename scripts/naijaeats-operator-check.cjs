/**
 * Restaurant-operator acceptance: a kitchen accepts an order, marks preparation,
 * signals pickup, and an unrelated account is refused. Uses the real food-order
 * state machine; nothing is simulated in the UI.
 *
 * Usage: node scripts/naijaeats-operator-check.cjs
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

async function login(context, email, password) {
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
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
    { email, password }
  );
  return { page, status };
}

(async () => {
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });

  // Customer places a real order.
  const customerCtx = await browser.newContext();
  const customer = await login(customerCtx, "customer@naijadeals.local", "CustomerPass123!");
  check("customer signs in", customer.status === 200, String(customer.status));
  const order = await customer.page.evaluate(async () => {
    const restaurants = await (await fetch("/api/eats/restaurants")).json();
    const kitchen = restaurants.find((row) => /Demo Lagos Kitchen/i.test(row.name)) ?? restaurants[0];
    const response = await fetch("/api/eats/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        restaurantId: kitchen.id,
        items: [{ menuItemId: kitchen.menuItems[0].id, quantity: 1 }],
        deliveryAddress: "12 Adeola Odeku Street, Lagos",
        contactName: "Ada",
        contactPhone: "08030000000"
      })
    });
    const body = await response.json().catch(() => ({}));
    return { status: response.status, id: body.id, number: body.orderNumber, error: body.error, kitchen: kitchen.name };
  });
  check("customer places an order", order.status === 201 && Boolean(order.id), JSON.stringify(order));

  // An unrelated customer cannot progress it.
  const strangerCtx = await browser.newContext();
  const stranger = await login(strangerCtx, "demo.stream.amaka@naijastream.demo", "NaijaStreamDemo2026!");
  const strangerAttempt = await stranger.page.evaluate(
    async (id) =>
      (
        await fetch(`/api/eats/orders/${id}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: "kitchen_accepted" })
        })
      ).status,
    order.id
  );
  check("an unrelated account cannot progress the order", strangerAttempt === 403, String(strangerAttempt));

  // The kitchen owner accepts and advances it.
  const operatorCtx = await browser.newContext();
  const operator = await login(operatorCtx, "demo.eats@naijaeats.demo", "NaijaEatsDemo2026!");
  const queue = await operator.page.evaluate(async () => {
    const response = await fetch("/api/restaurant/orders", { credentials: "include" });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  });
  const listed = Array.isArray(queue.body?.orders) ? queue.body.orders.some((row) => row.id === order.id) : false;
  check("kitchen sees the new order in its queue", queue.status === 200 && listed, JSON.stringify({ status: queue.status, count: queue.body?.orders?.length }));

  const steps = ["kitchen_accepted", "preparing", "ready_for_pickup"];
  for (const status of steps) {
    const result = await operator.page.evaluate(
      async ({ id, status }) => {
        const response = await fetch(`/api/eats/orders/${id}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status })
        });
        return { status: response.status, body: await response.json().catch(() => ({})) };
      },
      { id: order.id, status }
    );
    check(`kitchen sets ${status}`, result.status === 200, JSON.stringify(result.body).slice(0, 120));
  }

  // Illegal jump is refused by the state machine.
  const illegal = await operator.page.evaluate(
    async (id) => {
      const response = await fetch(`/api/eats/orders/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "delivered" })
      });
      return response.status;
    },
    order.id
  );
  check("kitchen cannot jump straight to delivered", illegal === 409 || illegal === 403, String(illegal));

  const finalState = await customer.page.evaluate(async (id) => {
    const orders = await (await fetch("/api/eats/orders", { credentials: "include" })).json();
    return (Array.isArray(orders) ? orders : []).find((row) => row.id === id)?.status ?? "unknown";
  }, order.id);
  check("customer sees the kitchen's real status", finalState === "ready_for_pickup", String(finalState));

  await customerCtx.close();
  await strangerCtx.close();
  await operatorCtx.close();
  await browser.close();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.error("FAILURES:", failures.slice(0, 8));
    process.exit(1);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
