/**
 * Negative and security checks for the NaijaShop purchase/review pipeline.
 *
 * Each case asserts a specific rejection — a 200 here would be a failure.
 * Runs against the local preview and TEST database only.
 *
 * Usage: node scripts/naijashop-security-checks.cjs
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

async function session(browser, email, password) {
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

  const customer = await session(browser, "customer@naijadeals.local", "CustomerPass123!");
  check("customer can sign in", customer.status === 200, String(customer.status));
  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(`${BASE}/naijashop`, { waitUntil: "domcontentloaded", timeout: 120000 });

  // ---- Anonymous access ------------------------------------------------
  const anon = await guestPage.evaluate(async () => {
    const reviewQueue = await fetch("/api/admin/reviews/pending");
    const moderate = await fetch("/api/admin/reviews/anything", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "APPROVE" })
    });
    const seller = await fetch("/api/seller/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Unauthorised listing" })
    });
    const cart = await fetch("/api/cart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    return { reviewQueue: reviewQueue.status, moderate: moderate.status, seller: seller.status, cart: cart.status };
  });
  check("anonymous cannot read the review queue", anon.reviewQueue === 401, String(anon.reviewQueue));
  check("anonymous cannot approve reviews", anon.moderate === 401, String(anon.moderate));
  check("anonymous cannot create seller products", anon.seller === 401, String(anon.seller));
  check("anonymous cart mutation is rejected", anon.cart >= 400, String(anon.cart));

  // ---- Customer cannot act as seller/admin -----------------------------
  const customerEscalation = await customer.page.evaluate(async () => {
    const products = await (await fetch("/api/products?take=200")).json();
    const target = (products.items ?? products).find((product) => !product.isSample);
    const moderate = await fetch("/api/admin/reviews/anything", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "APPROVE" })
    });
    const sellerCreate = await fetch("/api/seller/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: "Customer listing", description: "x", categoryId: "x", priceKobo: 100, imageUrl: "/generated/shop/product-2-slice-toaster.webp", quantity: 1 })
    });
    return { moderate: moderate.status, sellerCreate: sellerCreate.status, sampleTarget: target?.isSample ?? "none" };
  });
  check("customer cannot moderate reviews", customerEscalation.moderate === 403, String(customerEscalation.moderate));
  check("customer cannot publish products", customerEscalation.sellerCreate === 403, String(customerEscalation.sellerCreate));

  // ---- Review eligibility ----------------------------------------------
  const reviewGate = await customer.page.evaluate(async () => {
    const products = await (await fetch("/api/products?take=200")).json();
    const target = (products.items ?? products).find((product) => !product.isSample);
    const withoutOrder = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ orderId: "does-not-exist", productId: target.id, rating: 5, title: "x", body: "x" })
    });
    const badRating = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ orderId: "does-not-exist", productId: target.id, rating: 9, title: "x", body: "x" })
    });
    return { withoutOrder: withoutOrder.status, badRating: badRating.status };
  });
  check("review without a real order is rejected", reviewGate.withoutOrder === 404 || reviewGate.withoutOrder === 403, String(reviewGate.withoutOrder));
  check("out-of-range rating is rejected", reviewGate.badRating >= 400, String(reviewGate.badRating));

  // ---- Sample catalogue cannot be purchased ----------------------------
  const sampleCheck = await customer.page.evaluate(async () => {
    const products = await (await fetch("/api/products?take=200")).json();
    const sample = (products.items ?? products).find((product) => product.isSample);
    if (!sample) return { skipped: true };
    const added = await fetch("/api/cart/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ productId: sample.id, quantity: 1 })
    });
    const checkout = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ address: { contactName: "A", contactPhone: "0803", line1: "x", city: "Lagos", state: "Lagos", countryCode: "NG" }, saveAddress: false })
    });
    const body = await checkout.json().catch(() => ({}));
    // Leave the cart clean for the next run.
    const cart = await (await fetch("/api/cart", { credentials: "include" })).json();
    for (const item of cart.items ?? []) await fetch(`/api/cart/items/${item.id}`, { method: "DELETE", credentials: "include" });
    return { added: added.status, checkout: checkout.status, code: body.code ?? null };
  });
  check("demo inventory cannot be checked out", sampleCheck.skipped || sampleCheck.checkout === 409, JSON.stringify(sampleCheck));

  // ---- Price tampering on the client is ignored ------------------------
  const tamper = await customer.page.evaluate(async () => {
    const products = await (await fetch("/api/products?take=200")).json();
    const target = (products.items ?? products).find((product) => !product.isSample && (product.stock?.quantity ?? 0) > 0);
    await fetch("/api/cart/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ productId: target.id, quantity: 1 })
    });
    const checkout = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      // A tampered client-supplied total must be ignored.
      body: JSON.stringify({ address: { contactName: "A", contactPhone: "0803", line1: "x", city: "Lagos", state: "Lagos", countryCode: "NG" }, saveAddress: false, totalKobo: 1 })
    });
    const body = await checkout.json();
    const order = body.orders?.[0];
    const serverTotal = Number(order?.totalKobo ?? 0);
    const expected = Number(target.priceKobo) + 1500; // subtotal + flat delivery in the local quote
    const cart = await (await fetch("/api/cart", { credentials: "include" })).json();
    for (const item of cart.items ?? []) await fetch(`/api/cart/items/${item.id}`, { method: "DELETE", credentials: "include" });
    return { status: checkout.status, serverTotal, expected, targetPrice: Number(target.priceKobo) };
  });
  check(
    "client-supplied total is ignored (server prices the order)",
    tamper.status === 201 && tamper.serverTotal >= tamper.targetPrice,
    JSON.stringify(tamper)
  );
  // Cancel any order the tamper test created so it does not sit unpaid forever.
  await customer.page.evaluate(async () => {
    const orders = await (await fetch("/api/orders", { credentials: "include" })).json().catch(() => []);
    const list = Array.isArray(orders) ? orders : orders.orders ?? [];
    for (const order of list.filter((row) => row.paymentStatus === "pending" && row.status === "payment_created")) {
      await fetch(`/api/orders/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ action: "cancel" }) });
    }
  });

  await customer.context.close();
  await guest.close();
  await browser.close();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.error("FAILURES:", failures);
    process.exit(1);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
