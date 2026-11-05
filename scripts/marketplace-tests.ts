/**
 * End-to-end marketplace verification against a running local server.
 *
 * Usage:
 *   1. npm run prisma:seed (or npx prisma db seed)
 *   2. Start the app with ENABLE_TEST_PAYMENTS=true (non-production only).
 *   3. TEST_BASE_URL=http://localhost:3100 npx tsx scripts/marketplace-tests.ts
 *
 * The local test provider is the only payment method used here. It is disabled
 * in production and never claims to be a real payment.
 */

import { PrismaClient } from "@prisma/client";

const BASE = (process.env.TEST_BASE_URL || "http://localhost:3100").replace(/\/$/, "");

const prisma = new PrismaClient();

type Json = Record<string, any>;

class Client {
  private cookies = new Map<string, string>();

  cookieHeader() {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  async request(path: string, options: { method?: string; body?: unknown; headers?: Record<string, string>; redirect?: RequestRedirect } = {}) {
    const headers: Record<string, string> = {
      Origin: BASE,
      ...(options.headers ?? {})
    };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    const cookie = this.cookieHeader();
    if (cookie) headers.Cookie = cookie;

    const response = await fetch(`${BASE}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      redirect: options.redirect ?? "manual"
    });

    const setCookies = response.headers.getSetCookie?.() ?? [];
    for (const entry of setCookies) {
      const pair = entry.split(";")[0];
      const index = pair.indexOf("=");
      if (index > 0) this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }

    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: response.status, body, headers: response.headers };
  }

  async get(path: string) {
    return this.request(path);
  }

  async post(path: string, body?: unknown) {
    return this.request(path, { method: "POST", body });
  }

  async patch(path: string, body?: unknown) {
    return this.request(path, { method: "PATCH", body });
  }

  async del(path: string) {
    return this.request(path, { method: "DELETE" });
  }

  async login(email: string, password: string) {
    const result = await this.post("/api/auth/login", { email, password });
    assert(result.status === 200, `login ${email} failed: ${result.status} ${JSON.stringify(result.body)}`);
    return result.body.user;
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isStatus(result: { status: number; body?: unknown }, expected: number, label: string) {
  assert(result.status === expected, `${label}: expected HTTP ${expected}, got ${result.status} ${JSON.stringify(result.body)}`);
}

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];

async function step(name: string, fn: () => Promise<void>) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, detail: `${Date.now() - started}ms` });
    console.log(`PASS  ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, detail: message });
    console.error(`FAIL  ${name}\n      ${message}`);
  }
}

function address(suffix: string) {
  return {
    label: "Home",
    contactName: "Marketplace Tester",
    contactPhone: "08035551234",
    countryCode: "NG",
    state: "Lagos",
    city: "Ikeja",
    line1: `${suffix} Test Street`,
    line2: "Near Computer Village",
    postalCode: "100001"
  };
}

async function clearCart(client: Client) {
  const cart = await client.get("/api/cart");
  if (cart.status !== 200) return;
  for (const item of cart.body.items ?? []) {
    await client.del(`/api/cart/items/${item.id}`);
  }
}

async function products(client: Client) {
  const response = await client.get("/api/products");
  isStatus(response, 200, "list products");
  assert(Array.isArray(response.body) && response.body.length > 0, "catalog is empty");
  return response.body as Json[];
}

async function productBySlug(client: Client, slug: string) {
  const response = await client.get(`/api/products/${encodeURIComponent(slug)}`);
  isStatus(response, 200, `get product ${slug}`);
  return response.body as Json;
}

async function checkoutAndPayTest(client: Client, productId: string, quantity: number, suffix: string) {
  await clearCart(client);
  const added = await client.post("/api/cart/items", { productId, quantity });
  isStatus(added, 201, "add cart item");

  const checkout = await client.post("/api/checkout", { address: address(suffix), saveAddress: false });
  isStatus(checkout, 201, "checkout");
  assert(Array.isArray(checkout.body.orders) && checkout.body.orders.length > 0, "checkout returned no orders");
  const order = checkout.body.orders[0];

  const methods = checkout.body.paymentMethods as Json[];
  assert(methods.some((method) => method.id === "test"), "local test payment method is not enabled on the server");

  const initialized = await client.post("/api/payments/initialize", { orderId: order.orderId, provider: "test" });
  isStatus(initialized, 201, "initialize test payment");
  assert(initialized.body.reference, "payment reference missing");

  const confirmed = await client.post("/api/payments/confirm", { reference: initialized.body.reference, provider: "test" });
  isStatus(confirmed, 200, "confirm test payment");
  assert(confirmed.body.status === "COMPLETED", `payment did not complete: ${JSON.stringify(confirmed.body)}`);

  return { orderId: order.orderId as string, orderNumber: order.orderNumber as string, reference: initialized.body.reference as string };
}

async function getOrder(client: Client, id: string) {
  const response = await client.get(`/api/orders/${id}`);
  isStatus(response, 200, `get order ${id}`);
  return response.body as Json;
}

/**
 * Seeded catalogue rows are intentionally marked `isSample` so the storefront
 * can show a demo catalogue without letting anyone buy demo inventory. Every
 * purchasing test therefore creates its own real, non-sample listing through
 * the seller API instead of buying fixture data.
 */
async function createPurchasableProduct(seller: Client, unique: string, label: string, quantity: number) {
  const categories = await seller.get("/api/categories");
  isStatus(categories, 200, `categories for ${label} fixture`);
  const created = await seller.post("/api/seller/products", {
    name: `Test ${label} ${unique}`,
    description: `A real non-sample listing created for the ${label} verification run.`,
    categoryId: categories.body[0].id,
    priceKobo: "1800000",
    imageUrl: "/products/anker-power-bank-20000.svg",
    quantity
  });
  isStatus(created, 201, `create product for ${label}`);
  return created.body as Json;
}

async function main() {
  const admin = new Client();
  const customer = new Client();
  const seller = new Client();
  const seller2 = new Client();
  const courier = new Client();

  const unique = Date.now().toString(36);
  let createdSellerProductId = "";
  let paidOrderId = "";
  let unassignedDeliveryId = "";

  await step("Public catalog, category and storefront pages respond", async () => {
    const catalog = await products(customer);
    assert(catalog.length >= 12, `expected seeded catalog, got ${catalog.length} products`);
    assert(catalog.every((product) => product.images?.length > 0), "a product has no image");
    assert(catalog.every((product) => /^\d+$/.test(String(product.priceKobo))), "priceKobo is not an integer string");

    const categories = await customer.get("/api/categories");
    isStatus(categories, 200, "list categories");
    assert(categories.body.length >= 8, "categories missing");

    for (const path of ["/", "/naijashop", "/search", "/login", "/register"]) {
      const page = await customer.get(path);
      isStatus(page, 200, `page ${path}`);
      assert(typeof page.body === "string" && page.body.includes("NaijaDeals"), `${path} did not render the storefront`);
    }
  });

  await step("Auth, roles and server-side RBAC are enforced", async () => {
    const anonymousAdmin = await new Client().get("/api/admin/overview");
    isStatus(anonymousAdmin, 401, "anonymous admin overview");

    const customerUser = await customer.login("customer@naijadeals.local", "CustomerPass123!");
    assert(customerUser.roles.includes("customer"), "customer role missing");

    isStatus(await customer.get("/api/admin/overview"), 403, "customer admin overview");
    isStatus(await customer.get("/api/seller/overview"), 403, "customer seller overview");
    isStatus(await customer.get("/api/courier/deliveries"), 403, "customer courier deliveries");
    isStatus(await customer.post("/api/seller/products", {}), 403, "customer create product");

    await seller.login("seller@naijadeals.local", "SellerPass123!");
    await seller2.login("seller2@naijadeals.local", "SellerPass123!");
    await courier.login("courier@naijadeals.local", "CourierPass123!");
    await admin.login("admin@naijadeals.local", "AdminPass123!");

    isStatus(await seller.get("/api/admin/overview"), 403, "seller admin overview");
    isStatus(await admin.get("/api/admin/overview"), 200, "admin overview");
    isStatus(await courier.get("/api/courier/deliveries"), 200, "courier deliveries");

    const adminPage = await new Client().get("/admin");
    assert([302, 307, 308].includes(adminPage.status), `unauthenticated /admin should redirect, got ${adminPage.status}`);
    assert(String(adminPage.headers.get("location") || "").includes("/login"), "unauthenticated /admin did not redirect to login");
  });

  await step("Variant products require an option (no double stock pool)", async () => {
    const categories = await seller.get("/api/categories");
    isStatus(categories, 200, "categories for variant fixture");
    const vendor = await prisma.vendor.findFirstOrThrow({ where: { status: "VERIFIED" } });
    const variantProduct = await prisma.product.create({
      data: {
        vendorId: vendor.id,
        categoryId: categories.body[0].id,
        name: `Variant Fixture ${unique}`,
        slug: `variant-fixture-${unique}`,
        description: "Variant fixture used to prove that a buyer must choose an option before stock is reserved.",
        priceKobo: 1200000n,
        status: "ACTIVE",
        images: { create: [{ url: "/products/anker-power-bank-20000.svg", alt: "Variant fixture", sortOrder: 0 }] },
        stock: { create: { quantity: 0, lowStockLevel: 1 } },
        variants: {
          create: [
            { name: "Small", sku: `VAR-${unique}-S`, priceKobo: 1200000n, stock: 4 },
            { name: "Large", sku: `VAR-${unique}-L`, priceKobo: 1500000n, stock: 4 }
          ]
        }
      },
      include: { variants: true }
    });
    // The Prisma schema does not model saleMode; the catalogue reads it via raw SQL.
    await prisma.$executeRaw`UPDATE "Product" SET "saleMode" = 'escrow'::"SaleMode" WHERE id = ${variantProduct.id}`;

    await clearCart(customer);

    const withoutVariant = await customer.post("/api/cart/items", { productId: variantProduct.id, quantity: 1 });
    isStatus(withoutVariant, 400, "variantless add to cart");
    assert(withoutVariant.body.code === "variant_required", `expected variant_required, got ${JSON.stringify(withoutVariant.body)}`);

    const withVariant = await customer.post("/api/cart/items", {
      productId: variantProduct.id,
      variantId: variantProduct.variants[0].id,
      quantity: 1
    });
    isStatus(withVariant, 201, "variant add to cart");
    const line = withVariant.body.items.find((item: Json) => item.productId === variantProduct.id);
    assert(line?.variantId === variantProduct.variants[0].id, "cart did not retain the selected variant");
    await clearCart(customer);
  });

  await step("Customer purchase: checkout, verified payment, idempotent duplicate callback", async () => {
    const product = await createPurchasableProduct(seller, unique, "checkout", 4);
    const before = await productBySlug(customer, product.slug);

    const paid = await checkoutAndPayTest(customer, product.id, 1, unique);
    paidOrderId = paid.orderId;

    const duplicate = await customer.post("/api/payments/confirm", { reference: paid.reference, provider: "test" });
    isStatus(duplicate, 200, "duplicate payment confirmation");
    assert(duplicate.body.duplicate === true, "duplicate confirmation was not flagged");

    const order = await getOrder(customer, paid.orderId);
    assert(order.paymentStatus === "paid", `order paymentStatus is ${order.paymentStatus}`);
    assert(["escrow_held", "vendor_notified"].includes(order.status), `unexpected order status ${order.status}`);
    assert(order.payments.length === 1, "duplicate confirmation created a second payment");
    assert(order.deliveries.length === 1, "duplicate confirmation created a second delivery");
    assert(order.escrowHolds.length === 1, "duplicate confirmation created a second escrow hold");
    assert(order.escrowHolds[0].status === "held", "escrow was not held");
    assert(order.deliveries[0].status === "pending_assignment", "delivery was not created");
    unassignedDeliveryId = order.deliveries[0].id;

    const after = await productBySlug(customer, product.slug);
    assert(after.available === before.available - 1, `stock did not decrement (${before.available} -> ${after.available})`);
  });

  await step("Seller product creation, fulfilment, courier delivery and escrow release", async () => {
    const categories = await seller.get("/api/categories");
    isStatus(categories, 200, "seller categories");
    const categoryId = categories.body[0].id;

    const created = await seller.post("/api/seller/products", {
      name: `Test Seller Lamp ${unique}`,
      description: "A real test product created through the seller API for fulfilment verification.",
      categoryId,
      priceKobo: "2500000",
      imageUrl: "/products/anker-power-bank-20000.svg",
      quantity: 5
    });
    isStatus(created, 201, "seller create product");
    createdSellerProductId = created.body.id;
    assert(created.body.status === "ACTIVE", "seller product is not active");

    const paid = await checkoutAndPayTest(customer, createdSellerProductId, 1, `${unique}-seller`);

    for (const status of ["accepted", "preparing", "ready_for_pickup"]) {
      const advanced = await seller.post(`/api/seller/orders/${paid.orderId}/status`, { status });
      isStatus(advanced, 200, `seller advance ${status}`);
    }

    const adminOrders = await admin.get("/api/admin/orders");
    isStatus(adminOrders, 200, "admin orders");
    const order = (adminOrders.body as Json[]).find((item) => item.id === paid.orderId);
    assert(order, "paid order missing from admin orders");
    const delivery = order.deliveries[0];
    assert(delivery, "delivery missing after payment");

    const couriers = await admin.get("/api/admin/couriers");
    isStatus(couriers, 200, "admin couriers");
    assert(couriers.body.length > 0, "no courier seeded");

    const assigned = await admin.post(`/api/admin/deliveries/${delivery.id}/assign`, { courierId: couriers.body[0].id });
    isStatus(assigned, 200, "assign courier");

    const afterAssign = await getOrder(customer, paid.orderId);
    assert(afterAssign.status === "courier_assigned", `order did not advance after courier assignment (${afterAssign.status})`);

    const courierDeliveries = await courier.get("/api/courier/deliveries");
    isStatus(courierDeliveries, 200, "courier deliveries");
    assert((courierDeliveries.body as Json[]).some((item) => item.id === delivery.id), "assigned delivery missing from courier queue");

    for (const status of ["pickup_started", "picked_up", "in_transit", "delivery_attempted"]) {
      const updated = await courier.post(`/api/courier/deliveries/${delivery.id}/status`, { status, note: `Courier ${status}` });
      isStatus(updated, 200, `courier ${status}`);
    }
    const delivered = await courier.post(`/api/courier/deliveries/${delivery.id}/status`, {
      status: "delivered",
      note: "Delivered to customer",
      proofCode: `POD-${unique}`
    });
    isStatus(delivered, 200, "courier delivered");

    const deliveredOrder = await getOrder(customer, paid.orderId);
    assert(deliveredOrder.status === "delivered", `order did not reach delivered (${deliveredOrder.status})`);
    assert(deliveredOrder.deliveries[0].status === "delivered", "delivery did not reach delivered");

    const completed = await customer.post(`/api/orders/${paid.orderId}/confirm`, { action: "complete" });
    isStatus(completed, 200, "customer confirm delivery");
    assert(completed.body.status === "completed", "order did not complete");

    const finalOrder = await getOrder(customer, paid.orderId);
    assert(finalOrder.escrowHolds[0].status === "released", "escrow was not released after completion");

    const sellerOverview = await seller.get("/api/seller/overview");
    isStatus(sellerOverview, 200, "seller overview");
    assert(BigInt(sellerOverview.body.stats.grossKobo) > BigInt(0), "seller gross did not include the paid order");
  });

  await step("Seller onboarding: application, admin approval, vendor access", async () => {
    const applicant = new Client();
    const email = `applicant-${unique}@naijadeals.local`;
    const registered = await applicant.post("/api/auth/register", {
      name: "Test Applicant",
      email,
      password: "ApplicantPass123!",
      phone: "08035559999"
    });
    isStatus(registered, 201, "register applicant");

    const application = await applicant.post("/api/account/seller-application", {
      businessName: `Applicant Store ${unique}`,
      market: "Yaba, Lagos",
      countryCode: "NG",
      pickupAddress: "9 Test Market Road, Yaba, Lagos",
      phone: "08035559999",
      category: "Home & Kitchen"
    });
    isStatus(application, 201, "submit seller application");

    const applications = await admin.get("/api/admin/applications");
    isStatus(applications, 200, "admin applications");
    const submitted = (applications.body as Json[]).find((item) => item.id === application.body.id);
    assert(submitted, "application missing from admin queue");

    const approved = await admin.post(`/api/admin/applications/${application.body.id}`, { decision: "approve", note: "Verified for test" });
    isStatus(approved, 200, "approve seller application");

    const me = await applicant.get("/api/auth/me");
    isStatus(me, 200, "applicant me");
    assert(me.body.user.roles.includes("vendor"), "approved applicant did not receive the vendor role");

    const overview = await applicant.get("/api/seller/overview");
    isStatus(overview, 200, "approved applicant seller overview");
  });

  await step("Failed wallet payment is rejected, order stays unpaid, cancel releases stock", async () => {
    const broke = new Client();
    const email = `broke-${unique}@naijadeals.local`;
    const registered = await broke.post("/api/auth/register", { name: "No Wallet Buyer", email, password: "BrokePass123!" });
    isStatus(registered, 201, "register broke customer");

    const product = await createPurchasableProduct(seller, unique, "failed-payment", 2);
    const before = await productBySlug(broke, product.slug);

    await clearCart(broke);
    isStatus(await broke.post("/api/cart/items", { productId: product.id, quantity: 1 }), 201, "broke add cart");
    const checkout = await broke.post("/api/checkout", { address: address(`${unique}-broke`), saveAddress: false });
    isStatus(checkout, 201, "broke checkout");
    const orderId = checkout.body.orders[0].orderId;

    const initialized = await broke.post("/api/payments/initialize", { orderId, provider: "wallet" });
    isStatus(initialized, 201, "initialize wallet payment");
    const failed = await broke.post("/api/payments/confirm", { reference: initialized.body.reference, provider: "wallet" });
    isStatus(failed, 402, "insufficient wallet payment");

    const order = await getOrder(broke, orderId);
    assert(order.paymentStatus === "pending", `failed payment changed order paymentStatus to ${order.paymentStatus}`);
    assert(order.status === "payment_pending", `failed payment changed order status to ${order.status}`);

    const cancelled = await broke.post(`/api/orders/${orderId}/cancel`, { reason: "Payment could not be completed." });
    isStatus(cancelled, 200, "cancel unpaid order");
    assert(cancelled.body.refunded === false, "unpaid cancellation claimed a refund");

    const after = await productBySlug(broke, product.slug);
    assert(after.available === before.available, `reserved stock was not released (${before.available} -> ${after.available})`);
  });

  await step("Concurrent checkout cannot oversell a one-unit product", async () => {
    const categories = await seller.get("/api/categories");
    const categoryId = categories.body[0].id;
    const created = await seller.post("/api/seller/products", {
      name: `Last Unit ${unique}`,
      description: "Single-unit product used to prove atomic stock reservation under concurrency.",
      categoryId,
      priceKobo: "1500000",
      imageUrl: "/products/anker-power-bank-20000.svg",
      quantity: 1
    });
    isStatus(created, 201, "create one-unit product");

    const buyerA = new Client();
    const buyerB = new Client();
    for (const [buyer, label] of [
      [buyerA, "concurrent-a"],
      [buyerB, "concurrent-b"]
    ] as const) {
      const email = `${label}-${unique}@naijadeals.local`;
      isStatus(await buyer.post("/api/auth/register", { name: label, email, password: "ConcurrentPass123!" }), 201, `register ${label}`);
      isStatus(await buyer.post("/api/cart/items", { productId: created.body.id, quantity: 1 }), 201, `${label} add cart`);
    }

    const [resultA, resultB] = await Promise.all([
      buyerA.post("/api/checkout", { address: address(`${unique}-a`), saveAddress: false }),
      buyerB.post("/api/checkout", { address: address(`${unique}-b`), saveAddress: false })
    ]);
    const statuses = [resultA.status, resultB.status].sort();
    assert(statuses[0] === 201 && statuses[1] === 409, `expected one 201 and one 409, got ${statuses.join(", ")}`);

    const after = await productBySlug(customer, created.body.slug);
    assert(after.available === 0, `available units should be 0 while the last unit is reserved, got ${after.available}`);
    assert(after.stock.reserved === 1, `stock.reserved should be 1, got ${after.stock.reserved}`);

    const winner = resultA.status === 201 ? resultA : resultB;
    const winnerClient = resultA.status === 201 ? buyerA : buyerB;
    const cancelled = await winnerClient.post(`/api/orders/${winner.body.orders[0].orderId}/cancel`, { reason: "Concurrency test cleanup." });
    isStatus(cancelled, 200, "cancel concurrency winner");
    const released = await productBySlug(customer, created.body.slug);
    assert(released.available === 1, `stock was not released after cancel (${released.available})`);
  });

  await step("Paid cancellation refunds and restocks exactly once", async () => {
    const product = await createPurchasableProduct(seller, unique, "refund", 6);
    const before = await productBySlug(customer, product.slug);

    const paid = await checkoutAndPayTest(customer, product.id, 2, `${unique}-refund`);
    const afterPayment = await productBySlug(customer, product.slug);
    assert(afterPayment.available === before.available - 2, "paid stock was not committed");

    const cancelled = await customer.post(`/api/orders/${paid.orderId}/cancel`, { reason: "Customer changed their mind." });
    isStatus(cancelled, 200, "cancel paid order");
    assert(cancelled.body.refunded === true, "paid cancellation did not refund");

    const order = await getOrder(customer, paid.orderId);
    assert(order.status === "refunded", `order status is ${order.status}`);
    assert(order.paymentStatus === "refunded", `paymentStatus is ${order.paymentStatus}`);
    assert(order.payments[0].status === "REFUNDED", "payment record was not refunded");

    const afterRefund = await productBySlug(customer, product.slug);
    assert(afterRefund.available === before.available, `refund did not restock (${before.available} -> ${afterRefund.available})`);

    const second = await customer.post(`/api/orders/${paid.orderId}/cancel`, { reason: "Duplicate cancel." });
    isStatus(second, 409, "duplicate cancellation");

    const stockAfterSecond = await productBySlug(customer, product.slug);
    assert(stockAfterSecond.available === before.available, "duplicate cancellation restocked twice");
  });

  await step("Delivery failure and retry reach delivered", async () => {
    const product = await createPurchasableProduct(seller, unique, "retry", 4);
    const paid = await checkoutAndPayTest(customer, product.id, 1, `${unique}-retry`);

    for (const status of ["accepted", "preparing", "ready_for_pickup"]) {
      isStatus(await seller.post(`/api/seller/orders/${paid.orderId}/status`, { status }), 200, `retry seller ${status}`);
    }

    const adminOrders = await admin.get("/api/admin/orders");
    const order = (adminOrders.body as Json[]).find((item) => item.id === paid.orderId);
    assert(order, "paid order missing from admin order list");
    const deliveryId = order.deliveries[0].id;
    const couriers = await admin.get("/api/admin/couriers");
    const courierId = couriers.body[0].id;

    isStatus(await admin.post(`/api/admin/deliveries/${deliveryId}/assign`, { courierId }), 200, "retry assign");
    isStatus(await courier.post(`/api/courier/deliveries/${deliveryId}/status`, { status: "pickup_started" }), 200, "retry pickup started");
    isStatus(await courier.post(`/api/courier/deliveries/${deliveryId}/status`, { status: "failed", note: "Customer unavailable" }), 200, "delivery failed");

    const failedOrder = await getOrder(customer, paid.orderId);
    assert(failedOrder.deliveries[0].status === "failed", "delivery did not record failure");

    isStatus(await admin.post(`/api/admin/deliveries/${deliveryId}/assign`, { courierId }), 200, "retry reassign");
    for (const status of ["pickup_started", "picked_up", "in_transit"]) {
      isStatus(await courier.post(`/api/courier/deliveries/${deliveryId}/status`, { status }), 200, `retry courier ${status}`);
    }
    isStatus(
      await courier.post(`/api/courier/deliveries/${deliveryId}/status`, { status: "delivered", proofCode: `POD-RETRY-${unique}` }),
      200,
      "retry delivered"
    );

    const finalOrder = await getOrder(customer, paid.orderId);
    assert(finalOrder.status === "delivered", `retried order is ${finalOrder.status}`);
    assert(finalOrder.deliveries[0].trackingEvents.length >= 6, "retry tracking events missing");
    assert(
      finalOrder.deliveries[0].trackingEvents.some((event: Json) => event.status === "failed"),
      "failed tracking event missing"
    );
  });

  await step("Cross-tenant and unauthorized access is rejected", async () => {
    const otherProduct = await seller2.patch(`/api/seller/products/${createdSellerProductId}`, { quantity: 99 });
    isStatus(otherProduct, 403, "other seller update product");

    isStatus(await customer.get("/api/admin/orders"), 403, "customer admin orders");
    isStatus(await customer.get(`/api/orders/${paidOrderId}`), 200, "own order read");

    const outsider = new Client();
    const email = `outsider-${unique}@naijadeals.local`;
    isStatus(await outsider.post("/api/auth/register", { name: "Outsider", email, password: "OutsiderPass123!" }), 201, "register outsider");
    isStatus(await outsider.get(`/api/orders/${paidOrderId}`), 403, "other customer order read");

    isStatus(
      await courier.post(`/api/courier/deliveries/${unassignedDeliveryId}/status`, { status: "pickup_started" }),
      403,
      "courier update unassigned delivery"
    );
    isStatus(await new Client().get("/api/orders"), 401, "anonymous order list");
  });

  await step("Webhook signatures are rejected when invalid or unconfigured", async () => {
    const invalid = await customer.request("/api/payments/webhooks/paystack", {
      method: "POST",
      body: { event: "charge.success", data: { reference: "fake" } },
      headers: { "x-paystack-signature": "not-a-valid-signature" }
    });
    isStatus(invalid, 401, "invalid paystack webhook signature");

    const unknown = await customer.request("/api/payments/webhooks/unknown", { method: "POST", body: {} });
    isStatus(unknown, 404, "unknown webhook provider");
  });

  await step("Mobile and accessibility shell markers are present", async () => {
    for (const path of ["/", "/naijashop", "/cart", "/checkout", "/orders", "/login"]) {
      const page = await customer.get(path);
      isStatus(page, 200, `accessibility page ${path}`);
      const html = String(page.body);
      assert(html.includes('name="viewport"'), `${path} missing viewport meta`);
      assert(html.includes("Skip to content"), `${path} missing skip link`);
      assert(html.includes('aria-label="Primary"'), `${path} missing primary nav label`);
      assert(html.includes('aria-label="Mobile"'), `${path} missing mobile nav label`);
      assert(!/coming soon/i.test(html), `${path} contains a coming soon placeholder`);
    }
  });

  const failed = results.filter((result) => !result.ok);
  console.log("\n========================================");
  console.log(`Marketplace verification: ${results.length - failed.length}/${results.length} passed`);
  for (const result of results) {
    console.log(`${result.ok ? "PASS" : "FAIL"}  ${result.name}${result.detail ? ` — ${result.detail}` : ""}`);
  }
  if (failed.length > 0) {
    console.log("\nEvidence for persistence check:");
    console.log(JSON.stringify({ paidOrderId, createdSellerProductId }, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log("\nEvidence:");
  console.log(JSON.stringify({ paidOrderId, createdSellerProductId, unassignedDeliveryId }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

export {};
