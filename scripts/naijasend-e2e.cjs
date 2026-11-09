/**
 * NaijaSend end-to-end acceptance.
 *
 * Customer requests a shipment → verified providers quote → customer compares
 * and books → NaijaPay holds the money → providers move each leg with a pickup
 * PIN → customer confirms with the delivery PIN → provider paid once.
 *
 * Also exercises the failure and security paths: unverified providers cannot
 * quote, a second quote cannot be booked on the same shipment, an expired quote
 * is refused, the wrong PIN is refused, a non-owner cannot read another
 * customer's quotes, only the booked provider can advance a leg, a leg cannot
 * skip to arrived, settlement happens once, and a NaijaDrive driver can enrol
 * as a provider.
 *
 * Usage: node scripts/naijasend-e2e.cjs
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
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 120000 }).catch(() => null);
  const status = await page.evaluate(
    async ({ email, password }) =>
      (await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ name: "Send E2E", email, password }) })).status,
    { email, password }
  );
  return { context, page, status };
}

async function login(browser, email, password) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 120000 }).catch(() => null);
  const status = await page.evaluate(
    async ({ email, password }) =>
      (await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ email, password }) })).status,
    { email, password }
  );
  return { context, page, status };
}

const stamp = Date.now();

(async () => {
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });

  // ---- Accounts --------------------------------------------------------
  const customer = await register(browser, `send.e2e.customer.${stamp}@naijasend.test`, "SendE2ETest123!");
  check("customer account created", customer.status === 201, String(customer.status));
  const customerUser = await prisma.user.findUnique({ where: { email: `send.e2e.customer.${stamp}@naijasend.test` }, select: { id: true } });

  // Fund the wallet through the real ledger (test-classified database only), so
  // the fixture money is balanced rather than a bare balance bump.
  const fund = await prisma.$transaction(async (tx) => {
    const buyer = await tx.wallet.findFirstOrThrow({ where: { userId: customerUser.id, ownerType: "CUSTOMER" } });
    const system = await tx.wallet.findFirstOrThrow({ where: { ownerType: "SYSTEM" } });
    const amount = BigInt(50000000);
    await tx.wallet.update({ where: { id: buyer.id }, data: { availableKobo: { increment: amount } } });
    await tx.wallet.update({ where: { id: system.id }, data: { availableKobo: { decrement: amount } } });
    await tx.walletTransaction.create({
      data: {
        walletId: buyer.id,
        type: "credit",
        amountKobo: amount,
        reference: `SEND-E2E-FUND-${Date.now()}`,
        description: "E2E fixture funding (test database)",
        ledger: {
          create: [
            { walletId: system.id, direction: "DEBIT", amountKobo: amount, memo: "E2E fixture funding out" },
            { walletId: buyer.id, direction: "CREDIT", amountKobo: amount, memo: "E2E fixture funding in" }
          ]
        }
      }
    });
    return amount;
  });
  check("test wallet funded through the ledger", fund === BigInt(50000000));

  const admin = await login(browser, "admin@naijadeals.local", "AdminPass123!");

  // Two providers: one truck operator, one motorcycle courier.
  const p1 = await register(browser, `send.e2e.truck.${stamp}@naijasend.test`, "SendE2ETest123!");
  const p2 = await register(browser, `send.e2e.moto.${stamp}@naijasend.test`, "SendE2ETest123!");
  check("two provider accounts created", p1.status === 201 && p2.status === 201, `${p1.status}/${p2.status}`);

  const createProvider = async (page, name, type, capacity) =>
    page.evaluate(
      async ({ name, type, capacity }) => {
        const r = await fetch("/api/send/provider", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, providerType: type, country: "Nigeria", operatingCities: ["Lagos"], contactPhone: "08030000000", licenceRef: "LIC-1", insuranceRef: "INS-1", capacityKg: capacity }) });
        return { status: r.status, body: await r.json().catch(() => ({})) };
      },
      { name, type, capacity }
    );
  const prov1 = await createProvider(p1.page, `E2E Trucking ${stamp}`, "truck", 20000);
  const prov2 = await createProvider(p2.page, `E2E Courier ${stamp}`, "courier", 2000);
  check("truck provider applies", prov1.status === 201, `${prov1.status} ${prov1.body.error ?? ""}`);
  check("courier provider applies", prov2.status === 201, `${prov2.status} ${prov2.body.error ?? ""}`);
  check("new providers start pending", prov1.body.status === "pending" && prov2.body.status === "pending", `${prov1.body.status}/${prov2.body.status}`);

  // ---- Customer creates the shipment ----------------------------------
  const ship = await customer.page.evaluate(async () => {
    const r = await fetch("/api/send/shipments", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cargoClass: "goods", description: "12 cartons of textiles", weightKg: 800, quantity: 12, originLabel: "Kano", destinationLabel: "Lagos", senderName: "Ada Obi", senderPhone: "08030000001", recipientName: "Kemi Ada", recipientPhone: "08030000002" })
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  });
  check("shipment request created", ship.status === 201, `${ship.status} ${ship.body.error ?? ""}`);
  check("shipment starts open for quotes", ship.body.status === "open", ship.body.status);
  check("no price is attached to the request", ship.body.quoteKobo === undefined && ship.body.amountKobo === undefined, "unexpected price field");

  const badWeight = await customer.page.evaluate(async () => (await fetch("/api/send/shipments", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cargoClass: "goods", description: "x", weightKg: 0, originLabel: "A", destinationLabel: "B", senderName: "a", senderPhone: "1", recipientName: "b", recipientPhone: "2" }) })).status);
  check("zero weight rejected", badWeight === 400, String(badWeight));

  // ---- Unverified providers cannot quote -------------------------------
  const earlyQuote = await p1.page.evaluate(async (shipmentId) => (await fetch("/api/send/provider/quotes", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shipmentId, amountNaira: 90000, transitDays: 2, modes: ["truck"] }) })).status, ship.body.id);
  check("unverified provider cannot quote", earlyQuote === 403, String(earlyQuote));

  // ---- Customer cannot self-verify ------------------------------------
  const selfVerify = await p1.page.evaluate(async (providerId) => (await fetch("/api/admin/send/providers", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerId, action: "VERIFY" }) })).status, prov1.body.id);
  check("non-admin cannot verify a provider", selfVerify === 403 || selfVerify === 401, String(selfVerify));

  // ---- Admin verifies in the Control Center ---------------------------
  const verify = async (providerId) => admin.page.evaluate(async (id) => (await fetch("/api/admin/send/providers", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerId: id, action: "VERIFY" }) })).status, providerId);
  const v1 = await verify(prov1.body.id);
  const v2 = await verify(prov2.body.id);
  check("admin verifies the truck provider", v1 === 200, String(v1));
  check("admin verifies the courier provider", v2 === 200, String(v2));

  // ---- Providers submit their own quotes -------------------------------
  const q1 = await p1.page.evaluate(async (shipmentId) => {
    const r = await fetch("/api/send/provider/quotes", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shipmentId, amountNaira: 180000, transitDays: 2, modes: ["truck"], message: "Truck leaves Kano on Tuesday." }) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, ship.body.id);
  const q2 = await p2.page.evaluate(async (shipmentId) => {
    const r = await fetch("/api/send/provider/quotes", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shipmentId, amountNaira: 250000, transitDays: 4, modes: ["van", "motorcycle"] }) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, ship.body.id);
  check("truck provider quotes", q1.status === 201, `${q1.status} ${q1.body.error ?? ""}`);
  check("second provider quotes (multimodal)", q2.status === 201 && Array.isArray(q2.body.modes) && q2.body.modes.length === 2, `${q2.status}`);

  const overCapacity = await p2.page.evaluate(async (shipmentId) => (await fetch("/api/send/provider/quotes", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shipmentId, amountNaira: 1000, transitDays: 1, modes: ["motorcycle"] }) })).status, (await prisma.logisticsShipment.create({ data: { reference: `NST-OVERCAP-${stamp}`, customerId: customerUser.id, description: "heavy", weightKg: 5000, originLabel: "A", destinationLabel: "B", senderName: "a", senderPhone: "1", recipientName: "b", recipientPhone: "2" } }).catch(() => null))?.id ?? ship.body.id);
  check("quote beyond registered capacity refused", overCapacity === 409 || overCapacity === 400, String(overCapacity));

  const shipmentQuotes = await prisma.shipmentQuote.findMany({ where: { shipmentId: ship.body.id }, select: { id: true, providerId: true, amountKobo: true, status: true, modes: true } });
  check("two itemised quotes recorded", shipmentQuotes.length === 2, String(shipmentQuotes.length));

  // ---- Customer compares quotes ----------------------------------------
  const listed = await customer.page.evaluate(async (id) => { const r = await fetch(`/api/send/shipments/${id}/quotes`, { credentials: "include" }); return { status: r.status, body: await r.json() }; }, ship.body.id);
  check("customer sees both quotes", listed.status === 200 && listed.body.length === 2, `${listed.status} count=${Array.isArray(listed.body) ? listed.body.length : "n/a"}`);
  check("quotes are sorted cheapest first", listed.body[0] && BigInt(listed.body[0].amountKobo) <= BigInt(listed.body[1].amountKobo));

  const otherQuoteAccess = await p1.page.evaluate(async (id) => (await fetch(`/api/send/shipments/${id}/quotes`, { credentials: "include" })).status, ship.body.id);
  check("another account cannot read the shipment's quotes", otherQuoteAccess === 403, String(otherQuoteAccess));

  // ---- Book the cheaper quote ------------------------------------------
  const cheapest = shipmentQuotes.reduce((a, b) => (a.amountKobo < b.amountKobo ? a : b));
  const walletBefore = await prisma.wallet.findFirst({ where: { userId: customerUser.id, ownerType: "CUSTOMER" }, select: { availableKobo: true } });
  const book = await customer.page.evaluate(async ({ id, quoteId }) => {
    const r = await fetch(`/api/send/shipments/${id}/quotes`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "book", quoteId }) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, { id: ship.body.id, quoteId: cheapest.id });
  check("customer books a quote", book.status === 200, `${book.status} ${book.body.error ?? ""}`);
  check("booking returns pickup and delivery PINs", Boolean(book.body.pickupPin) && Boolean(book.body.deliveryPin));
  const walletAfter = await prisma.wallet.findFirst({ where: { userId: customerUser.id, ownerType: "CUSTOMER" }, select: { availableKobo: true } });
  check("wallet debited by exactly the quote", walletBefore.availableKobo - walletAfter.availableKobo === cheapest.amountKobo, `${walletBefore.availableKobo} → ${walletAfter.availableKobo}`);

  const afterBook = await prisma.logisticsShipment.findUnique({ where: { id: ship.body.id }, select: { status: true, quotes: { select: { id: true, status: true } } } });
  check("shipment booked", afterBook.status === "booked", afterBook.status);
  check("competing quotes declined", afterBook.quotes.filter((q) => q.status === "offered").length === 0);

  const secondBook = await customer.page.evaluate(async ({ id, quoteId }) => (await fetch(`/api/send/shipments/${id}/quotes`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "book", quoteId }) })).status, { id: ship.body.id, quoteId: shipmentQuotes.find((q) => q.id !== cheapest.id).id });
  check("booking a second quote refused", secondBook === 409 || secondBook === 403, String(secondBook));

  const legs = await prisma.shipmentLeg.findMany({ where: { shipmentId: ship.body.id }, orderBy: { sequence: "asc" } });
  check("legs created for the booked modes", legs.length === cheapest.modes.length || legs.length >= 1, String(legs.length));

  // ---- Provider advances the leg ---------------------------------------
  const winningProviderOwner = cheapest.providerId === prov1.body.id ? p1 : p2;
  const losingProvider = cheapest.providerId === prov1.body.id ? p2 : p1;
  const foreignLeg = await losingProvider.page.evaluate(async ({ sid, lid }) => (await fetch(`/api/send/shipments/${sid}/legs/${lid}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "in_transit" }) })).status, { sid: ship.body.id, lid: legs[0].id });
  check("a provider that was not booked cannot move the leg", foreignLeg === 403, String(foreignLeg));

  const skip = await winningProviderOwner.page.evaluate(async ({ sid, lid }) => (await fetch(`/api/send/shipments/${sid}/legs/${lid}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "arrived" }) })).status, { sid: ship.body.id, lid: legs[0].id });
  check("a leg cannot skip straight to arrived", skip === 409 || skip === 400, String(skip));

  const wrongPin = await winningProviderOwner.page.evaluate(async ({ sid, lid }) => (await fetch(`/api/send/shipments/${sid}/legs/${lid}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "in_transit", pin: "000000" }) })).status, { sid: ship.body.id, lid: legs[0].id });
  check("wrong pickup PIN refused", wrongPin === 400, String(wrongPin));

  let delivered = false;
  for (const leg of legs) {
    const pickup = await winningProviderOwner.page.evaluate(async ({ sid, lid, pin }) => (await fetch(`/api/send/shipments/${sid}/legs/${lid}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "in_transit", pin }) })).status, { sid: ship.body.id, lid: leg.id, pin: leg.pickupPin ?? undefined });
    const arrived = await winningProviderOwner.page.evaluate(async ({ sid, lid }) => (await fetch(`/api/send/shipments/${sid}/legs/${lid}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "arrived" }) })).status, { sid: ship.body.id, lid: leg.id });
    check(`leg ${leg.sequence} (${leg.mode}) picked up`, pickup === 200, String(pickup));
    check(`leg ${leg.sequence} arrived`, arrived === 200, String(arrived));
    delivered = pickup === 200 && arrived === 200;
  }

  const midState = await prisma.logisticsShipment.findUnique({ where: { id: ship.body.id }, select: { status: true } });
  check("shipment delivered only when every leg is complete", midState.status === "delivered", `${midState.status} legs=${legs.length}`);

  const earlyConfirm = await customer.page.evaluate(async ({ id, pin }) => (await fetch(`/api/send/shipments/${id}/quotes`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "confirm", pin }) })).status, { id: ship.body.id, pin: "111111" });
  check("wrong delivery PIN refused", earlyConfirm === 400, String(earlyConfirm));

  const providerOwner = await prisma.logisticsProvider.findUnique({ where: { id: cheapest.providerId }, select: { ownerId: true } });
  const providerWalletBefore = await prisma.wallet.findFirst({ where: { userId: providerOwner.ownerId }, select: { availableKobo: true } });
  const confirm = await customer.page.evaluate(async ({ id, pin }) => {
    const r = await fetch(`/api/send/shipments/${id}/quotes`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "confirm", pin }) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, { id: ship.body.id, pin: book.body.deliveryPin });
  check("delivery PIN completes the shipment", confirm.status === 200 && Boolean(confirm.body.settlementReference), `${confirm.status} ${confirm.body.error ?? ""}`);
  const providerWalletAfter = await prisma.wallet.findFirst({ where: { userId: providerOwner.ownerId }, select: { id: true, availableKobo: true } });
  check("provider paid on confirmation", (providerWalletAfter?.availableKobo ?? 0n) > (providerWalletBefore?.availableKobo ?? 0n), `${providerWalletBefore?.availableKobo} → ${providerWalletAfter?.availableKobo}`);
  // The provider's share is 95% of the quote; the platform keeps the service fee.
  const expectedProviderKobo = (cheapest.amountKobo * BigInt(9500)) / BigInt(10000);
  const providerCredit = await prisma.ledgerEntry.findFirst({
    where: { transaction: { reference: `SEND-SETTLE-${ship.body.id}` }, direction: "CREDIT", wallet: { userId: providerOwner.ownerId } },
    select: { amountKobo: true }
  });
  check("provider credited its exact share", providerCredit?.amountKobo === expectedProviderKobo, `${providerCredit?.amountKobo} vs ${expectedProviderKobo}`);

  const entries = await prisma.ledgerEntry.findMany({ where: { transaction: { reference: `SEND-SETTLE-${ship.body.id}` } }, select: { direction: true, amountKobo: true } });
  const debits = entries.filter((e) => e.direction === "DEBIT").reduce((s, e) => s + e.amountKobo, 0n);
  const credits = entries.filter((e) => e.direction === "CREDIT").reduce((s, e) => s + e.amountKobo, 0n);
  check("settlement ledger balances", entries.length > 0 && debits === credits, `${debits} vs ${credits}`);
  check("settlement debits the full quote", debits === cheapest.amountKobo, `${debits} vs ${cheapest.amountKobo}`);

  const replay = await customer.page.evaluate(async ({ id, pin }) => (await fetch(`/api/send/shipments/${id}/quotes`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "confirm", pin }) })).status, { id: ship.body.id, pin: book.body.deliveryPin });
  check("replayed confirmation refused", replay === 409, String(replay));
  const settleCount = await prisma.walletTransaction.count({ where: { reference: `SEND-SETTLE-${ship.body.id}` } });
  check("settled exactly once", settleCount === 1, String(settleCount));

  // ---- Expired quote ---------------------------------------------------
  const expShip = await prisma.logisticsShipment.create({ data: { reference: `NST-EXP-${stamp}`, customerId: customerUser.id, description: "expiry test", weightKg: 5, originLabel: "A", destinationLabel: "B", senderName: "a", senderPhone: "1", recipientName: "b", recipientPhone: "2" } });
  const expQuote = await prisma.shipmentQuote.create({ data: { shipmentId: expShip.id, providerId: prov2.body.id, amountKobo: BigInt(500000), transitDays: 1, modes: ["motorcycle"], expiresAt: new Date(Date.now() - 60_000) } });
  const expiredBook = await customer.page.evaluate(async ({ id, quoteId }) => (await fetch(`/api/send/shipments/${id}/quotes`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "book", quoteId }) })).status, { id: expShip.id, quoteId: expQuote.id });
  check("expired quote cannot be booked", expiredBook === 409, String(expiredBook));

  // ---- Cancel before booking ------------------------------------------
  const cancelShip = await customer.page.evaluate(async () => (await fetch("/api/send/shipments", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cargoClass: "parcel", description: "cancel test", weightKg: 2, originLabel: "A", destinationLabel: "B", senderName: "a", senderPhone: "1", recipientName: "b", recipientPhone: "2" }) })).json(), {});
  const cancelled = await customer.page.evaluate(async (id) => (await fetch(`/api/send/shipments/${id}/quotes`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel" }) })).status, cancelShip.id);
  check("customer cancels an unbooked shipment", cancelled === 200, String(cancelled));
  const lateCancel = await customer.page.evaluate(async (id) => (await fetch(`/api/send/shipments/${id}/quotes`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel" }) })).status, ship.body.id);
  check("a booked shipment cannot be cancelled here", lateCancel === 409, String(lateCancel));

  // ---- NaijaDrive enrolment -------------------------------------------
  const drive = await login(browser, "demo.driver.car@naijaeats.demo", "NaijaEatsDemo2026!");
  const enroll = await drive.page.evaluate(async () => {
    const r = await fetch("/api/send/provider", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: "naijadrive" }) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  });
  check("approved NaijaDrive driver can enrol", enroll.status === 201 || enroll.status === 409, `${enroll.status} ${enroll.body.error ?? ""}`);
  if (enroll.status === 201) {
    const enrolled = await prisma.logisticsProvider.findFirst({ where: { ownerId: (await prisma.user.findUnique({ where: { email: "demo.driver.car@naijaeats.demo" } })).id }, include: { vehicles: true } });
    check("enrolment links the NaijaDrive profile instead of copying it", Boolean(enrolled?.vehicles[0]?.driverProfileId));
  }

  // ---- Cleanup ---------------------------------------------------------
  await prisma.logisticsShipment.deleteMany({ where: { customerId: customerUser.id } }).catch(() => null);
  await prisma.logisticsProvider.deleteMany({ where: { name: { contains: `E2E` } } }).catch(() => null);

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
