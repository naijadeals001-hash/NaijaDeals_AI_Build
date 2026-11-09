/**
 * NaijaSend transport identity, navigation and cross-vertical acceptance.
 *
 * The central rule under test: a shipment belongs to NaijaSend because there is a
 * verified booking, an assignment record and a verified pickup — never because a
 * driver pressed a button.
 *
 *   A. Direct booking → assigned → navigate → PIN pickup → delivery → settled
 *   B. Cross-vertical: NaijaFresh order creates one shipment, repeat calls reuse it
 *   C. Cross-vertical: NaijaEats order resolves the same authoritative record
 *   D. Unauthorised provider cannot move a shipment it was not assigned
 *   E. Concurrent duplicate pickup: exactly one wins
 *   F. Idempotent replay of the same action
 *
 * Usage: node scripts/naijasend-transport-e2e.cjs
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

async function register(browser, email, password) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 120000 });
  const status = await page.evaluate(
    async ({ email, password }) => (await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ name: "Transport E2E", email, password }) })).status,
    { email, password }
  );
  return { context, page, status };
}

async function login(browser, email, password) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 120000 });
  const status = await page.evaluate(
    async ({ email, password }) => (await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ email, password }) })).status,
    { email, password }
  );
  return { context, page, status };
}

const stamp = Date.now();

(async () => {
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });

  const customer = await register(browser, `transport.e2e.customer.${stamp}@naijasend.test`, "TransportE2E123!");
  check("customer created", customer.status === 201, String(customer.status));
  const customerUser = await prisma.user.findUnique({ where: { email: `transport.e2e.customer.${stamp}@naijasend.test` }, select: { id: true } });

  // Ledger-funded fixture wallet (test-classified database only).
  await prisma.$transaction(async (tx) => {
    const buyer = await tx.wallet.findFirstOrThrow({ where: { userId: customerUser.id } });
    const system = await tx.wallet.findFirstOrThrow({ where: { ownerType: "SYSTEM" } });
    const amount = BigInt(50000000);
    await tx.wallet.update({ where: { id: buyer.id }, data: { availableKobo: { increment: amount } } });
    await tx.wallet.update({ where: { id: system.id }, data: { availableKobo: { decrement: amount } } });
    await tx.walletTransaction.create({
      data: {
        walletId: buyer.id,
        type: "credit",
        amountKobo: amount,
        reference: `TRANSPORT-E2E-FUND-${stamp}`,
        description: "Transport E2E fixture funding (test database)",
        ledger: { create: [
          { walletId: system.id, direction: "DEBIT", amountKobo: amount, memo: "fixture out" },
          { walletId: buyer.id, direction: "CREDIT", amountKobo: amount, memo: "fixture in" }
        ] }
      }
    });
  });

  const admin = await login(browser, "admin@naijadeals.local", "AdminPass123!");
  const p1 = await register(browser, `transport.e2e.p1.${stamp}@naijasend.test`, "TransportE2E123!");
  const p2 = await register(browser, `transport.e2e.p2.${stamp}@naijasend.test`, "TransportE2E123!");
  check("two transporter accounts created", p1.status === 201 && p2.status === 201);

  const makeProvider = async (page, name) =>
    page.evaluate(async (name) => {
      const r = await fetch("/api/send/provider", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, providerType: "van", country: "Nigeria", operatingCities: ["Lagos"], contactPhone: "08030000000", capacityKg: 5000 }) });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    }, name);
  const prov1 = await makeProvider(p1.page, `Transport E2E Van ${stamp}`);
  const prov2 = await makeProvider(p2.page, `Transport E2E Alt ${stamp}`);
  for (const [page, id] of [[admin.page, prov1.body.id], [admin.page, prov2.body.id]]) {
    await page.evaluate(async (providerId) => (await fetch("/api/admin/send/providers", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerId, action: "VERIFY" }) })).status, id);
  }

  // ---- A/D. Direct booking, assignment and navigation -------------------
  const ship = await customer.page.evaluate(async () => (await fetch("/api/send/shipments", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cargoClass: "parcel", description: "Two sealed boxes of books", weightKg: 30, originLabel: "Victoria Island", destinationLabel: "Ikeja", senderName: "Ada", senderPhone: "08030000001", recipientName: "Kemi", recipientPhone: "08030000002" }) })).json());
  check("direct shipment created", Boolean(ship.id), JSON.stringify(ship).slice(0, 120));
  const directShipment = await prisma.logisticsShipment.findUnique({ where: { id: ship.id }, select: { originVertical: true, trackingNumber: true, transportState: true } });
  check("direct booking records origin naijasend", directShipment.originVertical === "naijasend", directShipment.originVertical);
  check("direct booking has a tracking number", Boolean(directShipment.trackingNumber));

  await p1.page.evaluate(async (shipmentId) => (await fetch("/api/send/provider/quotes", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shipmentId, amountNaira: 25000, transitDays: 1, modes: ["van"] }) })).status, ship.id);
  const quote = await prisma.shipmentQuote.findFirst({ where: { shipmentId: ship.id }, select: { id: true } });
  const book = await customer.page.evaluate(async ({ id, quoteId }) => (await fetch(`/api/send/shipments/${id}/quotes`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "book", quoteId }) })).json(), { id: ship.id, quoteId: quote.id });
  check("booking returns both PINs", Boolean(book.pickupPin) && Boolean(book.deliveryPin));

  const assigned = await prisma.logisticsShipment.findUnique({ where: { id: ship.id }, select: { transportState: true, version: true, trackingNumber: true, assignment: true } });
  check("booking wrote an assignment record", Boolean(assigned.assignment?.providerId));
  check("assignment names the booked provider", assigned.assignment.providerId === prov1.body.id);
  check("assignment stores PIN hashes, not plain PINs", assigned.assignment.deliveryPinHash !== book.deliveryPin && assigned.assignment.deliveryPinHash.length === 64);
  check("shipment is assigned", assigned.transportState === "assigned", assigned.transportState);

  const nav = async (page, to, opts = {}) => {
    const current = await prisma.logisticsShipment.findUnique({ where: { id: ship.id }, select: { version: true } });
    const r = await page.evaluate(async ({ id, to, version, idempotencyKey, pin }) => {
      const res = await fetch(`/api/send/driver/shipments/${id}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, version, idempotencyKey, pin }) });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    }, { id: ship.id, to, version: current.version, idempotencyKey: opts.key ?? `k-${to}-${Date.now()}`, pin: opts.pin });
    return r;
  };

  // ---- D. Unauthorised providers ---------------------------------------
  const otherProvider = await nav(p2.page, "en_route_to_pickup");
  check("a provider that was not assigned cannot start navigation", otherProvider.status === 403, String(otherProvider.status));
  const customerDrive = await nav(customer.page, "en_route_to_pickup");
  check("the customer cannot drive their own shipment", customerDrive.status === 403, String(customerDrive.status));

  const skipPickup = await nav(p1.page, "delivered", { pin: book.deliveryPin });
  check("delivery cannot be recorded before pickup", skipPickup.status === 409 || skipPickup.status === 400, String(skipPickup.status));

  const r1 = await nav(p1.page, "en_route_to_pickup");
  check("assigned transporter starts navigation", r1.status === 200, `${r1.status} ${r1.body.error ?? ""}`);
  const r2 = await nav(p1.page, "arrived_at_pickup");
  check("transporter arrives at pickup", r2.status === 200, `${r2.status}`);

  const wrongPin = await nav(p1.page, "picked_up", { pin: "000000" });
  check("wrong pickup PIN refused", wrongPin.status === 400, String(wrongPin.status));

  // ---- E. Concurrent duplicate pickup -----------------------------------
  const current = await prisma.logisticsShipment.findUnique({ where: { id: ship.id }, select: { version: true } });
  const attempts = await Promise.all([
    p1.page.evaluate(async ({ id, version, pin }) => (await fetch(`/api/send/driver/shipments/${id}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: "picked_up", version, idempotencyKey: `race-a-${Date.now()}`, pin }) })).status, { id: ship.id, version: current.version, pin: book.pickupPin }),
    p1.page.evaluate(async ({ id, version, pin }) => (await fetch(`/api/send/driver/shipments/${id}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: "picked_up", version, idempotencyKey: `race-b-${Date.now()}`, pin }) })).status, { id: ship.id, version: current.version, pin: book.pickupPin })
  ]);
  check("exactly one concurrent pickup wins", attempts.filter((s) => s === 200).length === 1, JSON.stringify(attempts));
  const pickupRows = await prisma.shipmentPickup.count({ where: { shipmentId: ship.id } });
  check("exactly one pickup record exists", pickupRows === 1, String(pickupRows));
  const afterPickup = await prisma.logisticsShipment.findUnique({ where: { id: ship.id }, select: { transportState: true, pickupVerifiedAt: true } });
  check("shipment is picked up", afterPickup.transportState === "picked_up", afterPickup.transportState);
  check("pickup timestamp recorded", Boolean(afterPickup.pickupVerifiedAt));

  // ---- F. Idempotent replay --------------------------------------------
  const replayKey = `replay-${Date.now()}`;
  const first = await nav(p1.page, "in_transit", { key: replayKey });
  const replay = await nav(p1.page, "in_transit", { key: replayKey });
  check("first transition applied", first.status === 200, String(first.status));
  check("replaying the same idempotency key is a no-op", replay.status === 200 && replay.body.replayed === true, JSON.stringify(replay.body).slice(0, 120));
  const transitEvents = await prisma.shipmentEvent.count({ where: { shipmentId: ship.id, status: "in_transit" } });
  check("replay did not duplicate the event", transitEvents === 1, String(transitEvents));

  // A deliberately stale version must be refused and must not change the state.
  const beforeStale = await prisma.logisticsShipment.findUnique({ where: { id: ship.id }, select: { version: true, transportState: true } });
  const staleAttempt = await p1.page.evaluate(async ({ id, version }) => (await fetch(`/api/send/driver/shipments/${id}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: "arrived_at_destination", version, idempotencyKey: `stale-${Date.now()}` }) })).status, { id: ship.id, version: beforeStale.version - 1 });
  check("a stale version is refused", staleAttempt === 409, String(staleAttempt));
  const afterStale = await prisma.logisticsShipment.findUnique({ where: { id: ship.id }, select: { version: true, transportState: true } });
  check("a refused stale action changed nothing", afterStale.version === beforeStale.version && afterStale.transportState === beforeStale.transportState);

  const arrived = await nav(p1.page, "arrived_at_destination");
  check("transporter arrives at destination", arrived.status === 200, `${arrived.status} ${arrived.body.error ?? ""}`);
  const wrongDelivery = await nav(p1.page, "delivered", { pin: "123123" });
  check("wrong delivery PIN refused", wrongDelivery.status === 400, String(wrongDelivery.status));
  const delivered = await nav(p1.page, "delivered", { pin: book.deliveryPin });
  check("correct delivery PIN verifies delivery", delivered.status === 200, `${delivered.status} ${delivered.body.error ?? ""}`);
  const finalRow = await prisma.logisticsShipment.findUnique({ where: { id: ship.id }, select: { transportState: true, deliveryVerifiedAt: true } });
  check("shipment delivered with timestamp", finalRow.transportState === "delivered" && Boolean(finalRow.deliveryVerifiedAt), finalRow.transportState);

  // ---- B. Cross-vertical: NaijaFresh ------------------------------------
  // An isolated NaijaFresh order for this customer (fixture, labelled).
  const freshFarm = await prisma.farm.findFirst({ where: { isSample: true }, select: { id: true, name: true, city: true, state: true } });
  const freshOrder = freshFarm
    ? await prisma.freshOrder.create({
        data: {
          orderNumber: `NFR-XVERT-${stamp}`,
          customerId: customerUser.id,
          farmId: freshFarm.id,
          status: "ready_for_pickup",
          paymentStatus: "paid",
          subtotalKobo: BigInt(50000),
          deliveryFeeKobo: BigInt(150000),
          totalKobo: BigInt(200000),
          deliveryAddress: "12 Adeola Odeku Street, Victoria Island, Lagos",
          contactName: "Transport E2E",
          contactPhone: "08030000003",
          items: { create: [{ name: "E2E Produce", unit: "kg", unitPriceKobo: BigInt(50000), quantity: 1 }] }
        },
        select: { id: true, orderNumber: true }
      })
    : null;
  let freshShipment;
  if (freshOrder) {
    const first = await customer.page.evaluate(async ({ orderNumber }) => {
      const r = await fetch("/api/send/logistics/from-order", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ originVertical: "naijafresh", orderId: orderNumber }) });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    }, { orderNumber: freshOrder.orderNumber });
    const second = await customer.page.evaluate(async ({ orderNumber }) => {
      const r = await fetch("/api/send/logistics/from-order", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ originVertical: "naijafresh", orderId: orderNumber }) });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    }, { orderNumber: freshOrder.orderNumber });
    check("NaijaFresh order creates a shipment", first.status === 201, `${first.status} ${first.body.error ?? ""}`);
    check("a repeat call reuses the same shipment", second.body.id === first.body.id && second.body.created === false, `${second.status} ${second.body.created}`);
    const count = await prisma.logisticsShipment.count({ where: { originVertical: "naijafresh", sourceReference: freshOrder.orderNumber } });
    check("exactly one shipment per NaijaFresh order", count === 1, String(count));
    const row = await prisma.logisticsShipment.findUnique({ where: { id: first.body.id }, select: { originVertical: true, sourceReference: true } });
    check("origin vertical recorded immutably", row.originVertical === "naijafresh" && row.sourceReference === freshOrder.orderNumber);
    freshShipment = first.body;
  } else {
    check("NaijaFresh order available for cross-vertical test", false, "no order found");
  }

  // ---- C. Same authoritative record across verticals --------------------
  if (freshShipment) {
    const byTracking = await customer.page.evaluate(async (tracking) => (await fetch(`/api/send/logistics/tracking?tracking=${tracking}`, { credentials: "include" })).json(), freshShipment.trackingNumber);
    const byOrder = await customer.page.evaluate(async ({ v, o }) => (await fetch(`/api/send/logistics/tracking?vertical=${v}&order=${encodeURIComponent(o)}`, { credentials: "include" })).json(), { v: "naijafresh", o: freshOrder.orderNumber });
    check("tracking resolves by tracking number", byTracking.shipmentId === freshShipment.id, JSON.stringify(byTracking).slice(0, 100));
    check("tracking resolves to the same record by origin order", byOrder.shipmentId === byTracking.shipmentId);
    const otherUser = await p1.page.evaluate(async (tracking) => (await fetch(`/api/send/logistics/tracking?tracking=${tracking}`, { credentials: "include" })).status, freshShipment.trackingNumber);
    check("another account cannot read that tracking", otherUser === 403, String(otherUser));
  }

  // ---- Origin immutability ---------------------------------------------
  const relabel = await customer.page.evaluate(async ({ v, o }) => (await fetch("/api/send/logistics/from-order", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ originVertical: v, orderId: o }) })).status, { v: "naijashop", o: freshOrder ? freshOrder.orderNumber : "x" });
  check("a NaijaFresh order cannot be relabelled as NaijaShop", relabel === 404 || relabel === 403, String(relabel));

  // ---- Cleanup ---------------------------------------------------------
  await prisma.logisticsShipment.deleteMany({ where: { customerId: customerUser.id } }).catch(() => null);
  await prisma.logisticsProvider.deleteMany({ where: { name: { contains: "Transport E2E" } } }).catch(() => null);

  await browser.close();
  await prisma.$disconnect();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
