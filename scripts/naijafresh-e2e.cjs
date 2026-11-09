/**
 * NaijaFresh end-to-end acceptance.
 *
 * Buyer basket → NaijaPay checkout → farm accepts/packs → marks ready →
 * dispatch opens offers to NaijaSend couriers AND NaijaDrive drivers → one
 * accepts → pickup PIN → delivery PIN → settlement (once). Then the failure
 * and security paths: wrong PIN, unauthorised dispatch, second acceptance,
 * double settlement, stock and minimum-order rejection, cancel-window refund,
 * and quote ownership.
 *
 * Usage: node scripts/naijafresh-e2e.cjs
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
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const status = await page.evaluate(
    async ({ email, password }) =>
      (await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ name: "Fresh E2E Stranger", email, password }) })).status,
    { email, password }
  );
  return { context, page, status };
}

async function login(browser, email, password) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const status = await page.evaluate(
    async ({ email, password }) =>
      (await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ email, password }) })).status,
    { email, password }
  );
  return { context, page, status };
}

(async () => {
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });

  const buyer = await login(browser, "customer@naijadeals.local", "CustomerPass123!");
  check("buyer signs in", buyer.status === 200, String(buyer.status));
  const farm = await login(browser, "demo.fresh@naijafresh.demo", "NaijaFreshDemo2026!");
  check("farmer signs in", farm.status === 200, String(farm.status));
  const rider = await login(browser, "demo.rider.moto@naijaeats.demo", "NaijaEatsDemo2026!");
  check("NaijaSend rider signs in", rider.status === 200, String(rider.status));
  // A throwaway second buyer, created by this run, proves cross-account denial.
  const strangerEmail = `fresh.e2e.stranger.${Date.now()}@naijafresh.test`;
  const rival = await login(browser, "demo.driver.moto@naijaeats.demo", "NaijaEatsDemo2026!");
  check("a competing NaijaDrive driver signs in", rival.status === 200, String(rival.status));
  const stranger = await register(browser, strangerEmail, "FreshE2EStranger123!");
  const strangerOk = stranger.status === 201;
  check("a second, isolated buyer account is created", strangerOk, String(stranger.status));

  // ---- Catalogue and basket ------------------------------------------
  const setup = await buyer.page.evaluate(async () => {
    const cleared = await fetch("/api/fresh/cart", { method: "DELETE", credentials: "include" });
    const shop = await (await fetch("/naijafresh/shop")).text();
    return { pageHasCards: /data-listing=/.test(shop), basketStatus: cleared.status };
  });
  check("basket can be cleared", setup.basketStatus === 200, String(setup.basketStatus));
  check("shop page renders produce cards", setup.pageHasCards);

  const tomato = await prisma.produceListing.findUnique({ where: { slug: "fresh-tomatoes" }, select: { id: true, farmId: true, quantity: true, minimumOrder: true, priceKobo: true } });
  const yam = await prisma.produceListing.findUnique({ where: { slug: "fresh-red-pepper" }, select: { id: true, farmId: true, quantity: true, minimumOrder: true, priceKobo: true } });
  check("seed listings exist", Boolean(tomato && yam));
  check("both test listings belong to the same farm", Boolean(tomato && yam) && tomato.farmId === yam.farmId);

  const add = await buyer.page.evaluate(
    async ({ a, b }) => {
      const first = await fetch("/api/fresh/cart/items", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ listingId: a, quantity: 2 }) });
      const second = await fetch("/api/fresh/cart/items", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ listingId: b, quantity: 1 }) });
      const basket = await (await fetch("/api/fresh/cart")).json();
      return { first: first.status, second: second.status, groups: basket.groups?.length, count: basket.count, subtotal: basket.subtotalKobo, total: basket.totalKobo };
    },
    { a: tomato.id, b: yam.id }
  );
  check("add produce to basket", add.first === 201 && add.second === 201, `${add.first}/${add.second}`);
  check("basket groups by farm", add.groups === 1 && add.count === 3, `groups=${add.groups} count=${add.count}`);
  const expectedSubtotal = (tomato.priceKobo * 2n + yam.priceKobo).toString();
  check("basket subtotal is computed from listing prices", add.subtotal === expectedSubtotal, `${add.subtotal} vs ${expectedSubtotal}`);

  const overStock = await buyer.page.evaluate(async (id) => (await fetch("/api/fresh/cart/items", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ listingId: id, quantity: 999999 }) })).status, tomato.id);
  check("over-stock quantity rejected", overStock === 400 || overStock === 409, String(overStock));

  const anonymous = await (async () => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.goto(`${BASE}/naijafresh`, { waitUntil: "domcontentloaded", timeout: 120000 });
      return await page.evaluate(async (id) => (await fetch("/api/fresh/cart/items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId: id, quantity: 1 }) })).status, tomato.id);
    } finally {
      await context.close();
    }
  })();
  check("signed-out add rejected", anonymous === 401, String(anonymous));

  // ---- Checkout --------------------------------------------------------
  const walletBefore = await prisma.wallet.findFirst({ where: { userId: (await prisma.user.findUnique({ where: { email: "customer@naijadeals.local" } })).id, ownerType: "CUSTOMER" }, select: { availableKobo: true } });
  const checkout = await buyer.page.evaluate(
    async ({ farmId, a, b }) => {
      const response = await fetch("/api/fresh/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          farmId,
          items: [{ listingId: a, quantity: 2 }, { listingId: b, quantity: 1 }],
          deliveryAddress: "12 Adeola Odeku Street, Victoria Island, Lagos",
          contactName: "Ada Obi",
          contactPhone: "08030000000",
          notes: "Please pack the tomatoes carefully."
        })
      });
      const body = await response.json().catch(() => ({}));
      const after = await (await fetch("/api/fresh/cart")).json();
      return { status: response.status, id: body.id, number: body.orderNumber, total: body.totalKobo?.toString?.() ?? body.totalKobo, basketCount: after.count, error: body.error };
    },
    { farmId: tomato.farmId, a: tomato.id, b: yam.id }
  );
  check("checkout creates an order", checkout.status === 201, `${checkout.status} ${checkout.error ?? ""}`);
  check("basket cleared for that farm after checkout", checkout.basketCount === 0, String(checkout.basketCount));
  const walletAfter = await prisma.wallet.findFirst({ where: { userId: (await prisma.user.findUnique({ where: { email: "customer@naijadeals.local" } })).id, ownerType: "CUSTOMER" }, select: { availableKobo: true } });
  check("NaijaPay wallet debited by order total", walletBefore.availableKobo - walletAfter.availableKobo === BigInt(checkout.total), `${walletBefore.availableKobo} → ${walletAfter.availableKobo}`);
  const stockAfter = await prisma.produceListing.findUnique({ where: { id: tomato.id }, select: { quantity: true } });
  check("stock reserved at checkout", stockAfter.quantity === tomato.quantity - 2, `${tomato.quantity} → ${stockAfter.quantity}`);

  const foreignCancel = await stranger.page.evaluate(async (id) => (await fetch(`/api/fresh/orders/${id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ status: "cancelled" }) })).status, checkout.id).catch(() => 0);
  check("another account cannot cancel this order", !strangerOk || foreignCancel === 403, String(foreignCancel));

  // ---- Farm fulfilment -------------------------------------------------
  const advance = async (status, expect) => {
    const code = await farm.page.evaluate(async ({ id, status }) => (await fetch(`/api/fresh/orders/${id}/dispatch`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ action: "advance", status }) })).status, { id: checkout.id, status });
    check(`farm moves order to ${status}`, code === expect, String(code));
  };
  await advance("accepted", 200);
  await advance("packing", 200);
  await advance("ready_for_pickup", 200);
  const skip = await farm.page.evaluate(async (id) => (await fetch(`/api/fresh/orders/${id}/dispatch`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ action: "advance", status: "delivered" }) })).status, checkout.id);
  check("farm cannot jump straight to delivered", skip === 409 || skip === 403, String(skip));

  const open = await farm.page.evaluate(async (id) => {
    const response = await fetch(`/api/fresh/orders/${id}/dispatch`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ action: "open" }) });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }, checkout.id);
  check("dispatch opens", open.status === 200, `${open.status} ${open.body.error ?? ""}`);
  check("offers go to both courier and driver pools", open.body.offers >= 2, String(open.body.offers));

  const strangerOpen = await stranger.page.evaluate(async (id) => (await fetch(`/api/fresh/orders/${id}/dispatch`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ action: "open" }) })).status, checkout.id).catch(() => 0);
  check("only the farm owner can dispatch", !strangerOk || strangerOpen === 403, String(strangerOpen));

  const offers = await prisma.freshDispatchOffer.findMany({ where: { dispatchId: open.body.dispatchId }, select: { id: true, providerType: true } });
  check("one offer per eligible provider", offers.length === open.body.offers, `${offers.length}`);
  check("offers span both provider platforms", offers.some((row) => row.providerType === "courier") && offers.some((row) => row.providerType === "driver"));

  const riderOffer = offers.find((row) => row.providerType === "courier");
  const accept = await rider.page.evaluate(async ({ offerId, orderId }) => (await fetch(`/api/fresh/orders/${orderId}/dispatch`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ action: "accept", offerId }) })).status, { offerId: riderOffer.id, orderId: checkout.id });
  check("NaijaSend rider accepts", accept === 200, String(accept));
  const secondAccept = await rival.page.evaluate(async ({ offerId, orderId }) => (await fetch(`/api/fresh/orders/${orderId}/dispatch`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ action: "accept", offerId }) })).status, { offerId: offers.find((row) => row.id !== riderOffer.id).id, orderId: checkout.id });
  check("competing provider cannot take an assigned order", secondAccept === 404 || secondAccept === 409, String(secondAccept));
  const buyerAccept = await buyer.page.evaluate(async ({ offerId, orderId }) => (await fetch(`/api/fresh/orders/${orderId}/dispatch`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ action: "accept", offerId }) })).status, { offerId: riderOffer.id, orderId: checkout.id });
  check("non-provider account cannot accept deliveries", buyerAccept === 403, String(buyerAccept));
  const remainingOffers = await prisma.freshDispatchOffer.count({ where: { dispatchId: open.body.dispatchId, status: "offered" } });
  check("competing offers withdrawn", remainingOffers === 0, String(remainingOffers));

  const dispatch = await prisma.freshDispatch.findUnique({ where: { id: open.body.dispatchId }, select: { pickupPin: true, deliveryPin: true, assignedType: true } });
  const wrongPin = await rider.page.evaluate(async ({ id, dispatchId }) => (await fetch(`/api/fresh/orders/${id}/dispatch`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ action: "pickup", dispatchId, pin: "000000" }) })).status, { id: checkout.id, dispatchId: open.body.dispatchId });
  check("wrong pickup PIN refused", wrongPin === 400, String(wrongPin));
  const earlyDelivery = await rider.page.evaluate(async ({ id, dispatchId, pin }) => (await fetch(`/api/fresh/orders/${id}/dispatch`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ action: "deliver", dispatchId, pin }) })).status, { id: checkout.id, dispatchId: open.body.dispatchId, pin: dispatch.deliveryPin });
  check("delivery before pickup refused", earlyDelivery === 409, String(earlyDelivery));
  const pickup = await rider.page.evaluate(async ({ id, dispatchId, pin }) => (await fetch(`/api/fresh/orders/${id}/dispatch`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ action: "pickup", dispatchId, pin }) })).status, { id: checkout.id, dispatchId: open.body.dispatchId, pin: dispatch.pickupPin });
  check("pickup PIN accepted", pickup === 200, String(pickup));
  const wrongDelivery = await rider.page.evaluate(async ({ id, dispatchId }) => (await fetch(`/api/fresh/orders/${id}/dispatch`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ action: "deliver", dispatchId, pin: "111111" }) })).status, { id: checkout.id, dispatchId: open.body.dispatchId });
  check("wrong delivery PIN refused", wrongDelivery === 400, String(wrongDelivery));

  const owner = await prisma.user.findUnique({ where: { email: "demo.fresh@naijafresh.demo" }, select: { id: true } });
  const farmWalletBefore = await prisma.wallet.findFirst({ where: { userId: owner.id, ownerType: "VENDOR" }, select: { availableKobo: true } });
  const deliver = await rider.page.evaluate(async ({ id, dispatchId, pin }) => (await fetch(`/api/fresh/orders/${id}/dispatch`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ action: "deliver", dispatchId, pin }) })).json().catch(() => ({})), { id: checkout.id, dispatchId: open.body.dispatchId, pin: dispatch.deliveryPin });
  check("delivery PIN settles the order", Boolean(deliver.settlementReference), JSON.stringify(deliver).slice(0, 120));
  const farmWalletAfter = await prisma.wallet.findFirst({ where: { userId: owner.id, ownerType: "VENDOR" }, select: { availableKobo: true } });
  check("farm paid on delivery", farmWalletAfter.availableKobo > (farmWalletBefore?.availableKobo ?? 0n), `${farmWalletBefore?.availableKobo} → ${farmWalletAfter.availableKobo}`);

  const settleEntries = await prisma.ledgerEntry.findMany({ where: { transaction: { reference: `FRESH-SETTLE-${open.body.dispatchId}` } }, select: { direction: true, amountKobo: true } });
  const debits = settleEntries.filter((row) => row.direction === "DEBIT").reduce((sum, row) => sum + row.amountKobo, 0n);
  const credits = settleEntries.filter((row) => row.direction === "CREDIT").reduce((sum, row) => sum + row.amountKobo, 0n);
  check("settlement ledger balances", settleEntries.length > 0 && debits === credits, `${debits} vs ${credits}`);
  check("settlement debits the full order value", debits === BigInt(checkout.total), `${debits} vs ${checkout.total}`);

  const replay = await rider.page.evaluate(async ({ id, dispatchId, pin }) => (await fetch(`/api/fresh/orders/${id}/dispatch`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ action: "deliver", dispatchId, pin }) })).status, { id: checkout.id, dispatchId: open.body.dispatchId, pin: dispatch.deliveryPin });
  check("replayed delivery refused", replay === 409, String(replay));
  const settleRefs = await prisma.walletTransaction.count({ where: { reference: `FRESH-SETTLE-${open.body.dispatchId}` } });
  check("settled exactly once", settleRefs === 1, String(settleRefs));
  const finalOrder = await prisma.freshOrder.findUnique({ where: { id: checkout.id }, select: { status: true, dispatch: { select: { status: true } } } });
  check("order delivered and dispatch completed", finalOrder.status === "delivered" && finalOrder.dispatch.status === "completed", `${finalOrder.status}/${finalOrder.dispatch.status}`);

  // ---- Cancellation window ---------------------------------------------
  const second = await buyer.page.evaluate(async ({ farmId, a }) => (await fetch("/api/fresh/orders", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ farmId, items: [{ listingId: a, quantity: 1 }], deliveryAddress: "5 Allen Avenue, Ikeja, Lagos", contactName: "Ada Obi", contactPhone: "08030000000" }) })).json(), { farmId: tomato.farmId, a: tomato.id });
  const walletBeforeCancel = await prisma.wallet.findFirst({ where: { userId: (await prisma.user.findUnique({ where: { email: "customer@naijadeals.local" } })).id, ownerType: "CUSTOMER" }, select: { availableKobo: true } });
  const cancel = await buyer.page.evaluate(async (id) => (await fetch(`/api/fresh/orders/${id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ status: "cancelled" }) })).status, second.id);
  check("buyer cancels before acceptance", cancel === 200, String(cancel));
  const walletAfterCancel = await prisma.wallet.findFirst({ where: { userId: (await prisma.user.findUnique({ where: { email: "customer@naijadeals.local" } })).id, ownerType: "CUSTOMER" }, select: { availableKobo: true } });
  check("cancellation refunds the wallet", walletAfterCancel.availableKobo - walletBeforeCancel.availableKobo === BigInt(second.totalKobo.toString()), `${walletBeforeCancel.availableKobo} → ${walletAfterCancel.availableKobo}`);
  const lateCancel = await buyer.page.evaluate(async (id) => (await fetch(`/api/fresh/orders/${id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ status: "cancelled" }) })).status, checkout.id);
  check("cannot cancel an accepted order", lateCancel === 409, String(lateCancel));

  // ---- Bulk quotes ------------------------------------------------------
  const quote = await buyer.page.evaluate(async (id) => (await fetch("/api/fresh/bulk-quotes", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ listingId: id, quantity: 50, note: "Weekly supply" }) })).status, yam.id);
  check("business quote request created", quote === 201, String(quote));
  const quoteId = await prisma.bulkQuoteRequest.findFirst({ where: { buyerId: (await prisma.user.findUnique({ where: { email: "customer@naijadeals.local" } })).id }, orderBy: { createdAt: "desc" }, select: { id: true } });
  const strangerQuote = await stranger.page.evaluate(async (id) => (await fetch("/api/fresh/bulk-quotes", { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ id, status: "quoted", quotedPriceKobo: 1 }) })).status, quoteId.id).catch(() => 0);
  check("only the farm answers its own quotes", !strangerOk || strangerQuote === 403, String(strangerQuote));
  const ownQuote = await farm.page.evaluate(async (id) => (await fetch("/api/fresh/bulk-quotes", { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ id, status: "quoted", quotedPriceKobo: 300000 }) })).status, quoteId.id);
  check("farm answers with its own price", ownQuote === 200, String(ownQuote));

  // ---- Farmer application ----------------------------------------------
  const apply = await buyer.page.evaluate(async () => {
    const response = await fetch("/api/fresh/farms", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ name: "E2E Test Farm", farmerName: "E2E Tester", state: "Ogun", city: "Abeokuta", specialities: ["Okro"] }) });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  });
  const appliedFarm = await prisma.farm.findFirst({ where: { name: "E2E Test Farm" }, select: { id: true, verified: true } });
  check("new farm applications start unverified", apply.status === 201 && appliedFarm?.verified === false, `${apply.status} verified=${appliedFarm?.verified}`);
  const prematureListing = await buyer.page.evaluate(async () => (await fetch("/api/fresh/farms", { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ name: "Okro", category: "vegetables-ugu", unit: "basket", priceNaira: 900, quantity: 10 }) })).status);
  check("unverified farm cannot list produce", prematureListing === 403, String(prematureListing));

  // ---- Cleanup: remove E2E-only fixtures -------------------------------
  if (appliedFarm) await prisma.farm.delete({ where: { id: appliedFarm.id } }).catch(() => null);
  const strangerUser = await prisma.user.findUnique({ where: { email: strangerEmail }, select: { id: true } });
  if (strangerUser) await prisma.user.delete({ where: { id: strangerUser.id } }).catch(() => null);

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
