/**
 * NaijaEats end-to-end delivery acceptance.
 *
 * Customer orders → kitchen accepts/prepares → marks ready → dispatch opens
 * offers across NaijaSend couriers AND NaijaDrive drivers → one accepts →
 * pickup PIN → delivery PIN → settlement. Then the failure and security paths:
 * competing offers withdrawn, a second acceptance refused, a wrong PIN refused,
 * an unassigned provider refused, and settlement happening exactly once.
 *
 * Usage: node scripts/naijaeats-delivery-e2e.cjs
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

async function login(browser, email, password = "NaijaEatsDemo2026!") {
  const context = await browser.newContext();
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
  return { context, page, status };
}

(async () => {
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });

  const customer = await login(browser, "customer@naijadeals.local", "CustomerPass123!");
  check("customer signs in", customer.status === 200, String(customer.status));
  const kitchen = await login(browser, "demo.eats@naijaeats.demo");
  check("kitchen operator signs in", kitchen.status === 200, String(kitchen.status));
  const rider = await login(browser, "demo.rider.moto@naijaeats.demo");
  check("NaijaSend motorcycle rider signs in", rider.status === 200, String(rider.status));
  const driver = await login(browser, "demo.driver.car@naijaeats.demo");
  check("NaijaDrive car driver signs in", driver.status === 200, String(driver.status));

  // ---- Customer places an order --------------------------------------
  const order = await customer.page.evaluate(async () => {
    const restaurants = await (await fetch("/api/eats/restaurants")).json();
    const target = restaurants.find((row) => /Demo Lagos Kitchen/i.test(row.name)) ?? restaurants[0];
    await fetch("/api/eats/cart", { method: "DELETE", credentials: "include" });
    for (const item of target.menuItems.slice(0, 2)) {
      await fetch("/api/eats/cart/items", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ menuItemId: item.id, quantity: 1 }) });
    }
    const response = await fetch("/api/eats/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        restaurantId: target.id,
        items: target.menuItems.slice(0, 2).map((item) => ({ menuItemId: item.id, quantity: 1 })),
        deliveryAddress: "12 Adeola Odeku Street, Victoria Island, Lagos",
        contactName: "Ada",
        contactPhone: "08030000000"
      })
    });
    const body = await response.json().catch(() => ({}));
    return { status: response.status, id: body.id, number: body.orderNumber, kitchen: target.name, error: body.error };
  });
  check("customer order is accepted and paid", order.status === 201 && Boolean(order.id), JSON.stringify({ status: order.status, error: order.error }));
  if (!order.id) {
    console.log(`\n${passed} passed, ${failures.length} failed`);
    process.exit(1);
  }

  // ---- Kitchen progresses to ready (dispatch opens automatically) -----
  const progress = await kitchen.page.evaluate(
    async (id) => {
      const results = [];
      for (const status of ["kitchen_accepted", "preparing", "ready_for_pickup"]) {
        const response = await fetch(`/api/eats/orders/${id}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status })
        });
        const body = await response.json().catch(() => ({}));
        results.push({ status, code: response.status, dispatch: body.dispatch ?? null });
      }
      return results;
    },
    order.id
  );
  check("kitchen accepts, prepares and marks ready", progress.every((row) => row.code === 200), JSON.stringify(progress.map((row) => row.code)));
  const dispatched = progress.at(-1)?.dispatch;
  check("dispatching opens offers automatically on ready", Boolean(dispatched?.offers > 0), JSON.stringify(dispatched));

  // ---- Both platforms see the offer ----------------------------------
  // A motorcycle job goes to motorcycle providers on BOTH platforms; the car
  // driver must be excluded, which is the vehicle-eligibility rule working.
  const riderOffers = await rider.page.evaluate(async () => (await fetch("/api/eats/dispatch/offers", { credentials: "include" })).json());
  const motorDriver = await login(browser, "demo.driver.moto@naijaeats.demo");
  const motorDriverOffers = await motorDriver.page.evaluate(async () => (await fetch("/api/eats/dispatch/offers", { credentials: "include" })).json());
  const carRider = await login(browser, "demo.rider.car@naijaeats.demo");
  const carRiderOffers = await carRider.page.evaluate(async () => (await fetch("/api/eats/dispatch/offers", { credentials: "include" })).json());
  const driverOffers = await driver.page.evaluate(async () => (await fetch("/api/eats/dispatch/offers", { credentials: "include" })).json());
  check("a NaijaSend motorcycle courier receives the food offer", (riderOffers.courier ?? []).length > 0, JSON.stringify(riderOffers.courier?.length));
  check("a NaijaDrive motorcycle driver receives the same offer", (motorDriverOffers.driver ?? []).length > 0, JSON.stringify(motorDriverOffers.driver?.length));
  check("car providers are excluded from a motorcycle job", (carRiderOffers.courier ?? []).length === 0 && (driverOffers.driver ?? []).length === 0, JSON.stringify({ carRider: carRiderOffers.courier?.length, carDriver: driverOffers.driver?.length }));
  const offer = riderOffers.courier[0];
  check("offer hides the customer's details before assignment", !JSON.stringify(offer).includes("Ada") && !JSON.stringify(offer).includes("Adeola"), JSON.stringify(Object.keys(offer)));
  check("offer carries delivery earnings", Number(offer.earningsKobo) > 0, offer.earningsKobo);

  // ---- One provider accepts; the other is withdrawn ------------------
  const accepted = await rider.page.evaluate(async (offerId) => {
    const response = await fetch(`/api/eats/dispatch/offers/${offerId}`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ action: "accept" }) });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }, offer.offerId);
  check("rider accepts the delivery", accepted.status === 200 && accepted.body.accepted === true, JSON.stringify(accepted));

  const competingDriver = motorDriverOffers.driver[0];
  const losingAccept = await motorDriver.page.evaluate(async (offerId) => {
    const response = await fetch(`/api/eats/dispatch/offers/${offerId}`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ action: "accept" }) });
    return response.status;
  }, competingDriver.offerId);
  check("a competing provider cannot take an assigned delivery", losingAccept === 409, String(losingAccept));

  const dispatchId = accepted.body.dispatchId;
  const dispatchState = await kitchen.page.evaluate(async (id) => (await (await fetch(`/api/eats/dispatch?orderId=${id}`, { credentials: "include" })).json()).dispatch, order.id);
  check("the dispatch has exactly one assignment", dispatchState?.status === "assigned" && dispatchState?.assignedType === "courier", JSON.stringify(dispatchState));

  // ---- PINs: wrong first, then right ---------------------------------
  // The customer receives their delivery PIN from the API used by the tracker.
  const customerPins = await customer.page.evaluate(async (id) => {
    const response = await fetch(`/api/eats/orders/${id}/pins`, { credentials: "include" });
    return response.ok ? response.json() : {};
  }, order.id);

  const wrongPickup = await rider.page.evaluate(
    async ({ dispatchId }) => {
      const response = await fetch("/api/eats/dispatch/status", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ step: "pickup", dispatchId, pin: "000000" }) });
      return response.status;
    },
    { dispatchId }
  );
  check("an incorrect pickup PIN is rejected", wrongPickup === 400, String(wrongPickup));

  const strangerPickup = await driver.page.evaluate(
    async ({ dispatchId, pin }) => {
      const response = await fetch("/api/eats/dispatch/status", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ step: "pickup", dispatchId, pin }) });
      return response.status;
    },
    { dispatchId, pin: customerPins.pickupPin ?? "111111" }
  );
  check("an unassigned provider cannot confirm pickup", strangerPickup === 403, String(strangerPickup));

  const pickup = await rider.page.evaluate(
    async ({ dispatchId, pin }) => {
      const response = await fetch("/api/eats/dispatch/status", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ step: "pickup", dispatchId, pin }) });
      return { status: response.status, body: await response.json().catch(() => ({})) };
    },
    { dispatchId, pin: customerPins.pickupPin }
  );
  check("rider confirms pickup with the PIN", pickup.status === 200 && pickup.body.pickedUp === true, JSON.stringify(pickup.body));

  const delivered = await rider.page.evaluate(
    async ({ dispatchId, pin }) => {
      const response = await fetch("/api/eats/dispatch/status", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ step: "delivery", dispatchId, pin }) });
      return { status: response.status, body: await response.json().catch(() => ({})) };
    },
    { dispatchId, pin: customerPins.deliveryPin }
  );
  check("rider confirms delivery with the customer PIN", delivered.status === 200 && delivered.body.delivered === true, JSON.stringify(delivered.body));
  check("settlement reference is issued", Boolean(delivered.body.settlementReference), JSON.stringify(delivered.body));

  // ---- Order state and duplicate settlement --------------------------
  const finalOrder = await customer.page.evaluate(async (id) => {
    const orders = await (await fetch("/api/eats/orders", { credentials: "include" })).json();
    return (Array.isArray(orders) ? orders : []).find((row) => row.id === id)?.status ?? "unknown";
  }, order.id);
  check("customer sees the order as delivered", finalOrder === "delivered", finalOrder);

  const repeat = await rider.page.evaluate(
    async ({ dispatchId, pin }) => {
      const response = await fetch("/api/eats/dispatch/status", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ step: "delivery", dispatchId, pin }) });
      return response.status;
    },
    { dispatchId, pin: customerPins.deliveryPin }
  );
  check("a repeated delivery confirmation is refused", repeat === 409, String(repeat));

  console.log(`  INFO order ${order.number} · dispatch ${dispatchId} · settlement ${delivered.body.settlementReference}`);

  for (const session of [customer, kitchen, rider, driver, motorDriver, carRider]) await session.context.close();
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
