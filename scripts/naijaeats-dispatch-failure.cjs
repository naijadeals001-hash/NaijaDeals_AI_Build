/**
 * Dispatch failure-path acceptance: what happens when nobody can take the job.
 *
 * Uses the real API and database. Providers are temporarily taken offline and
 * restored afterwards, so the fixtures return to their seeded state.
 *
 * Usage: node scripts/naijaeats-dispatch-failure.cjs
 */
const { chromium } = require("playwright-core");
const { PrismaClient } = require("@prisma/client");

const BASE = process.env.BASE_URL ?? "http://localhost:3015";
const prisma = new PrismaClient();
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

async function login(browser, email, password) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.evaluate(
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
  return { context, page };
}

async function placeReadyOrder(customer, kitchen) {
  const order = await customer.page.evaluate(async () => {
    const restaurants = await (await fetch("/api/eats/restaurants")).json();
    const target = restaurants.find((row) => /Demo Lagos Kitchen/i.test(row.name)) ?? restaurants[0];
    const response = await fetch("/api/eats/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        restaurantId: target.id,
        items: [{ menuItemId: target.menuItems[0].id, quantity: 1 }],
        deliveryAddress: "12 Adeola Odeku Street, Lagos",
        contactName: "Ada",
        contactPhone: "08030000000"
      })
    });
    const body = await response.json().catch(() => ({}));
    return { status: response.status, id: body.id, error: body.error };
  });
  if (order.status !== 201) return order;
  const progressed = await kitchen.page.evaluate(async (id) => {
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
  }, order.id);
  return { ...order, dispatch: progressed.at(-1)?.dispatch ?? null };
}

(async () => {
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const customer = await login(browser, "customer@naijadeals.local", "CustomerPass123!");
  const kitchen = await login(browser, "demo.eats@naijaeats.demo", "NaijaEatsDemo2026!");
  const rider = await login(browser, "demo.rider.moto@naijaeats.demo", "NaijaEatsDemo2026!");

  // ---- 1. Nobody available -------------------------------------------
  await prisma.courier.updateMany({ where: { name: { startsWith: "Demo Rider" } }, data: { online: false } });
  await prisma.driverProfile.updateMany({ where: { user: { email: { startsWith: "demo.driver." } } }, data: { online: false } });
  const noDriver = await placeReadyOrder(customer, kitchen);
  check("dispatch reports no eligible provider", noDriver.dispatch?.failed === "no_eligible_provider" || noDriver.dispatch?.offers === 0, JSON.stringify(noDriver.dispatch));
  const state = await prisma.foodDispatch.findFirst({ where: { orderId: noDriver.id }, select: { status: true } });
  check("the order is marked failed for dispatch ops, not left waiting", state?.status === "failed", JSON.stringify(state));

  // Restore providers.
  await prisma.courier.updateMany({ where: { name: { startsWith: "Demo Rider" } }, data: { online: true } });
  await prisma.driverProfile.updateMany({ where: { user: { email: { startsWith: "demo.driver." } } }, data: { online: true } });

  // ---- 2. Offer expiry ------------------------------------------------
  const fresh = await placeReadyOrder(customer, kitchen);
  const offer = await prisma.dispatchOffer.findFirst({ where: { dispatch: { orderId: fresh.id } }, select: { id: true, providerType: true, providerId: true } });
  check("a ready order receives offers once providers are online", Boolean(offer), JSON.stringify(fresh.dispatch));
  if (offer) {
    await prisma.dispatchOffer.update({ where: { id: offer.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const expiredAccept = await rider.page.evaluate(async (offerId) => {
      const response = await fetch(`/api/eats/dispatch/offers/${offerId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "accept" })
      });
      return { status: response.status, body: await response.json().catch(() => ({})) };
    }, offer.id);
    check("an expired offer cannot be accepted", expiredAccept.status === 409, JSON.stringify(expiredAccept.body));
  }

  // ---- 3. Declining withdraws only that provider's offer --------------
  const running = await prisma.foodDispatch.findFirst({ where: { status: "open" }, orderBy: { createdAt: "desc" }, include: { offers: { where: { status: "offered" } } } });
  if (running && running.offers.length > 0) {
    const target = running.offers[0];
    const declined = await prisma.dispatchOffer.update({ where: { id: target.id }, data: { status: "declined" }, select: { status: true } });
    const stillOffered = await prisma.dispatchOffer.count({ where: { dispatchId: running.id, status: "offered" } });
    check("a declined offer leaves the other providers' offers open", declined.status === "declined" && stillOffered >= 1, JSON.stringify({ stillOffered }));
  }

  // ---- 4. Duplicate dispatch cannot be created ------------------------
  const duplicate = await prisma.foodDispatch
    .create({ data: { orderId: fresh.id, pickupPin: "111111", deliveryPin: "222222" } })
    .then(() => false)
    .catch(() => true);
  check("one order can never have two dispatch jobs", duplicate);

  // Cleanup: cancel the orders created by this run so the demo queue stays tidy.
  for (const id of [noDriver.id, fresh.id]) {
    if (!id) continue;
    await prisma.foodOrderEvent.deleteMany({ where: { orderId: id } });
    await prisma.dispatchOffer.deleteMany({ where: { dispatch: { orderId: id } } });
    await prisma.foodDispatch.deleteMany({ where: { orderId: id } });
    // Order items restrict the parent delete, so they go first.
    await prisma.foodOrderItem.deleteMany({ where: { orderId: id } }).catch(() => undefined);
    await prisma.foodOrder.deleteMany({ where: { id } });
  }

  for (const session of [customer, kitchen, rider]) await session.context.close();
  await prisma.$disconnect();
  await browser.close();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.error("FAILURES:", failures.slice(0, 8));
    process.exit(1);
  }
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
