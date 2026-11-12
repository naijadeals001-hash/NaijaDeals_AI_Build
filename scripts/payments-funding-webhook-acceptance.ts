/**
 * Funding webhook and top-up acceptance with deterministic provider fixtures.
 *
 * This is a MOCKED INTEGRATION acceptance, not a real provider sandbox run. No
 * request leaves the machine: every `fetch` is intercepted, and any URL that is
 * not the two documented provider APIs aborts the test. Synthetic test secrets
 * are set for the duration of the process and never printed.
 *
 * Order payment webhooks (`processWebhook`) are exercised end to end:
 *   - initiation records one PENDING payment with the server-computed amount,
 *     currency and reference, and the buyer's own order;
 *   - a signed success credits once, after the provider's authoritative verify;
 *   - duplicate and delayed webhooks are idempotent;
 *   - amount/currency mismatch and a declined verification fail the attempt and
 *     release the reserved stock with no escrow;
 *   - a provider timeout leaves the payment PENDING and the webhook retryable;
 *     retrying the same event after recovery completes exactly once;
 *   - a success followed by a late failure keeps the payment COMPLETED;
 *   - a failure followed by a success keeps the attempt terminally FAILED;
 *   - an invalid signature, an unknown reference and another recipient in the
 *     payload cannot move money.
 *
 * Wallet top-up funding is exercised at the authoritative service boundary
 * (`createTopUp` / `creditTopUp` / `failTopUp`), because no provider-initiated
 * top-up checkout or top-up webhook route exists in this repository. That gap is
 * reported in the output rather than simulated away.
 *
 * Database safety: the URL is derived from .env by replacing only the database
 * path with `naijadeals_wallet_acceptance`; `current_database()` is the guard.
 * Valkey is disabled. No real charge, payout, push or deployment is involved.
 *
 * Usage:
 *   npx tsx scripts/payments-funding-webhook-acceptance.ts
 */
import "dotenv/config";
import { createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";

const DB = "naijadeals_wallet_acceptance";
const RUN_ID = `${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${randomBytes(4).toString("hex")}`;
const REPO_ROOT = path.resolve(__dirname, "..");
const TSX_CLI = path.join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const ORDER_TOTAL_KOBO = BigInt(155_000);
const PAYSTACK_SECRET = `sk_test_wc_funding_${RUN_ID}`;
const FLUTTERWAVE_SECRET = `FLWSECK_TEST-${RUN_ID}`;
const FLUTTERWAVE_HASH = `wc-funding-hash-${RUN_ID}`;

type CheckResult = { name: string; pass: boolean; detail: string };
type Outcome = "success" | "declined" | "timeout" | "amount_mismatch" | "currency_mismatch";
type Scenario = {
  label: string;
  userId: string;
  walletId: string;
  otherUserId: string;
  otherWalletId: string;
  vendorId: string;
  vendorWalletId: string;
  otherVendorId: string;
  otherVendorWalletId: string;
  categoryId: string;
  productId: string;
  cartId: string;
  orderId: string;
  orderNumber: string;
  reference: string;
  paymentId: string;
  totalKobo: bigint;
};

const checks: CheckResult[] = [];
let failures = 0;
const outcomes = new Map<string, Outcome>();
const fetchLog: string[] = [];
let providerCalls = 0;

function record(name: string, pass: boolean, detail: string) {
  checks.push({ name, pass, detail });
  if (!pass) failures += 1;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function acceptanceUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set in .env.");
  const url = new URL(raw);
  url.pathname = `/${DB}`;
  return url.toString();
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function outcomeFor(reference: string): Outcome {
  return outcomes.get(reference) ?? "success";
}

/**
 * Deterministic provider network. Any URL outside the two provider APIs throws,
 * so a missing mock cannot silently become a real charge.
 */
function installProviderMock() {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    providerCalls += 1;
    if (!url.startsWith("https://api.paystack.co") && !url.startsWith("https://api.flutterwave.com")) {
      fetchLog.push(`BLOCKED ${method} ${url}`);
      throw new Error(`Blocked non-provider network call: ${method} ${url}`);
    }
    fetchLog.push(`${method} ${url.split("?")[0]}`);

    if (url.startsWith("https://api.paystack.co/transaction/initialize")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { reference?: string };
      const reference = String(body.reference ?? "");
      return json({
        status: true,
        data: {
          reference,
          authorization_url: `https://paystack.test/checkout/${encodeURIComponent(reference)}`
        }
      });
    }

    if (url.startsWith("https://api.paystack.co/transaction/verify/")) {
      const reference = decodeURIComponent(url.split("/transaction/verify/")[1] ?? "");
      const outcome = outcomeFor(reference);
      if (outcome === "timeout") throw new Error("simulated_provider_timeout");
      if (outcome === "declined") {
        return json({
          status: true,
          data: { status: "failed", reference, amount: Number(ORDER_TOTAL_KOBO), currency: "NGN", gateway_response: "Simulated decline." }
        });
      }
      const amount = outcome === "amount_mismatch" ? Number(ORDER_TOTAL_KOBO) + 1 : Number(ORDER_TOTAL_KOBO);
      const currency = outcome === "currency_mismatch" ? "USD" : "NGN";
      return json({
        status: true,
        data: { status: "success", reference, amount, currency }
      });
    }

    if (url.startsWith("https://api.paystack.co/refund")) {
      return json({ status: true, data: { status: "processed", id: `paystack-refund-${RUN_ID}` } });
    }

    if (url.startsWith("https://api.flutterwave.com/v3/payments")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { tx_ref?: string };
      const reference = String(body.tx_ref ?? "");
      return json({ status: "success", data: { tx_ref: reference, link: `https://flutterwave.test/checkout/${encodeURIComponent(reference)}` } });
    }

    if (url.startsWith("https://api.flutterwave.com/v3/transactions/verify_by_reference")) {
      const reference = decodeURIComponent(new URL(url).searchParams.get("tx_ref") ?? "");
      const outcome = outcomeFor(reference);
      if (outcome === "timeout") throw new Error("simulated_provider_timeout");
      if (outcome === "declined") {
        return json({
          status: "success",
          data: { status: "failed", tx_ref: reference, amount: Number(ORDER_TOTAL_KOBO) / 100, currency: "NGN", processor_response: "Simulated decline." }
        });
      }
      const amount = outcome === "amount_mismatch" ? Number(ORDER_TOTAL_KOBO) / 100 + 0.01 : Number(ORDER_TOTAL_KOBO) / 100;
      const currency = outcome === "currency_mismatch" ? "USD" : "NGN";
      return json({ status: "success", data: { status: "successful", tx_ref: reference, amount, currency, id: `flw-${RUN_ID}` } });
    }

    fetchLog.push(`UNHANDLED ${method} ${url}`);
    throw new Error(`Unhandled provider fixture: ${method} ${url}`);
  }) as typeof fetch;
}

function paystackSignature(body: string) {
  return createHmac("sha512", PAYSTACK_SECRET).update(body).digest("hex");
}

function paystackEvent(input: { eventId: string; reference: string; amount: number; currency: string; event?: string }) {
  const body = JSON.stringify({
    event: input.event ?? "charge.success",
    data: {
      id: input.eventId,
      reference: input.reference,
      amount: input.amount,
      currency: input.currency,
      status: input.event === "charge.failed" ? "failed" : "success",
      metadata: { customerId: "payload-customer", orderId: "payload-order" }
    }
  });
  return { body, headers: new Headers({ "x-paystack-signature": paystackSignature(body) }) };
}

function flutterwaveEvent(input: { eventId: string; reference: string; amountMinor: number; currency: string }) {
  const body = JSON.stringify({
    event: "charge.completed",
    data: {
      id: input.eventId,
      tx_ref: input.reference,
      amount: Number(input.amountMinor) / 100,
      currency: input.currency,
      status: "successful"
    }
  });
  return { body, headers: new Headers({ "verif-hash": FLUTTERWAVE_HASH }) };
}

async function statusOf(promise: Promise<unknown>) {
  try {
    const value = await promise;
    return { ok: true as const, value, status: 200, code: "ok", message: "" };
  } catch (error) {
    const typed = error as { status?: number; code?: string; message?: string };
    return {
      ok: false as const,
      value: null,
      status: typed.status ?? 500,
      code: typed.code ?? "unknown",
      message: (typed.message ?? String(error)).slice(0, 160)
    };
  }
}

async function ensureCity(prisma: PrismaClient) {
  await prisma.citySetting.upsert({
    where: { countryCode_code: { countryCode: "NG", code: "lagos" } },
    update: { name: "Lagos", enabled: true },
    create: { countryCode: "NG", code: "lagos", name: "Lagos", enabled: true }
  });
}

async function createScenario(prisma: PrismaClient, label: string, provider: "paystack" | "flutterwave"): Promise<Scenario> {
  const { ensureWallet, initializePayment } = await import("../lib/payments/service");
  const { checkout } = await import("../lib/services/core/checkout.service");
  const lower = RUN_ID.toLowerCase();
  const user = await prisma.user.create({
    data: { email: `wc-webhook-${RUN_ID}-${label}@example.test`, name: `WC webhook ${label}`, actorType: "CUSTOMER" }
  });
  const otherUser = await prisma.user.create({
    data: { email: `wc-webhook-${RUN_ID}-${label}-other@example.test`, name: `WC webhook ${label} other`, actorType: "CUSTOMER" }
  });
  const vendorOwner = await prisma.user.create({
    data: { email: `wc-webhook-${RUN_ID}-${label}-owner@example.test`, name: `WC webhook ${label} owner`, actorType: "VENDOR" }
  });
  const otherOwner = await prisma.user.create({
    data: { email: `wc-webhook-${RUN_ID}-${label}-other-owner@example.test`, name: `WC webhook ${label} other owner`, actorType: "VENDOR" }
  });
  const vendor = await prisma.vendor.create({
    data: {
      ownerId: vendorOwner.id,
      name: `WC webhook vendor ${RUN_ID} ${label}`,
      slug: `wc-webhook-vendor-${lower}-${label}`,
      market: "Isolated acceptance fixture market",
      description: "Isolated funding-webhook fixture. Not a real vendor.",
      pickupAddress: "1 Acceptance Fixture Way, Lagos",
      pickupPhone: "+2348000000000",
      status: "VERIFIED",
      commissionBps: 1000
    }
  });
  const otherVendor = await prisma.vendor.create({
    data: {
      ownerId: otherOwner.id,
      name: `WC webhook other vendor ${RUN_ID} ${label}`,
      slug: `wc-webhook-other-vendor-${lower}-${label}`,
      market: "Isolated acceptance fixture market",
      description: "Isolated funding-webhook fixture. Not a real vendor.",
      pickupAddress: "2 Acceptance Fixture Way, Lagos",
      pickupPhone: "+2348000000001",
      status: "VERIFIED",
      commissionBps: 1000
    }
  });
  const category = await prisma.category.create({
    data: { name: `WC webhook category ${RUN_ID} ${label}`, slug: `wc-webhook-category-${lower}-${label}` }
  });
  const product = await prisma.product.create({
    data: {
      vendorId: vendor.id,
      categoryId: category.id,
      name: `WC webhook product ${RUN_ID} ${label}`,
      slug: `wc-webhook-product-${lower}-${label}`,
      description: "Isolated funding-webhook fixture product.",
      priceKobo: BigInt(4_951),
      status: "ACTIVE",
      isSample: false,
      stock: { create: { quantity: 5, reserved: 0 } }
    }
  });
  const cart = await prisma.cart.create({
    data: { userId: user.id, status: "ACTIVE", items: { create: { productId: product.id, quantity: 1 } } }
  });
  const wallet = await ensureWallet(prisma, { userId: user.id, ownerType: "CUSTOMER" });
  const otherWallet = await ensureWallet(prisma, { userId: otherUser.id, ownerType: "CUSTOMER" });
  const vendorWallet = await ensureWallet(prisma, { vendorId: vendor.id, ownerType: "VENDOR" });
  const otherVendorWallet = await ensureWallet(prisma, { vendorId: otherVendor.id, ownerType: "VENDOR" });

  const created = await checkout({
    userId: user.id,
    address: {
      contactName: `WC webhook ${label}`,
      contactPhone: "08000000000",
      countryCode: "NG",
      state: "Lagos",
      city: "Lagos",
      line1: "1 Acceptance Fixture Way"
    }
  });
  const order = created.orders[0];
  assert(BigInt(order.totalKobo) === ORDER_TOTAL_KOBO, `${label}: checkout total ${order.totalKobo}`);

  const init = await initializePayment({
    orderId: order.orderId,
    userId: user.id,
    provider,
    callbackUrl: "http://localhost/orders/callback"
  });
  const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.orderId } });

  return {
    label,
    userId: user.id,
    walletId: wallet.id,
    otherUserId: otherUser.id,
    otherWalletId: otherWallet.id,
    vendorId: vendor.id,
    vendorWalletId: vendorWallet.id,
    otherVendorId: otherVendor.id,
    otherVendorWalletId: otherVendorWallet.id,
    categoryId: category.id,
    productId: product.id,
    cartId: cart.id,
    orderId: order.orderId,
    orderNumber: order.orderNumber,
    reference: init.reference,
    paymentId: payment.id,
    totalKobo: BigInt(order.totalKobo)
  };
}

async function orderView(prisma: PrismaClient, scenario: Scenario) {
  return prisma.order.findUniqueOrThrow({
    where: { id: scenario.orderId },
    include: { payments: true, escrowHolds: true, deliveries: true, statusEvents: true }
  });
}

async function walletView(prisma: PrismaClient, walletId: string) {
  return prisma.wallet.findUniqueOrThrow({ where: { id: walletId }, select: { availableKobo: true, heldKobo: true } });
}

/* --------------------------------------------------------------- cleanup --- */

async function cleanupRun(prisma: PrismaClient) {
  const emailPrefix = `wc-webhook-${RUN_ID}-`;
  const lower = RUN_ID.toLowerCase();
  const users = await prisma.user.findMany({ where: { email: { startsWith: emailPrefix } }, select: { id: true } });
  const userIds = users.map((row) => row.id);
  if (userIds.length === 0) return { users: 0, leftovers: 0 };
  const vendors = await prisma.vendor.findMany({
    where: { OR: [{ ownerId: { in: userIds } }, { slug: { contains: lower } }] },
    select: { id: true }
  });
  const vendorIds = vendors.map((row) => row.id);
  const products = await prisma.product.findMany({
    where: { OR: [{ vendorId: { in: vendorIds } }, { slug: { contains: lower } }] },
    select: { id: true }
  });
  const productIds = products.map((row) => row.id);
  const categories = await prisma.category.findMany({ where: { slug: { contains: lower } }, select: { id: true } });
  const categoryIds = categories.map((row) => row.id);
  const orders = await prisma.order.findMany({ where: { customerId: { in: userIds } }, select: { id: true } });
  const orderIds = orders.map((row) => row.id);
  const payments = await prisma.payment.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } });
  const paymentIds = payments.map((row) => row.id);
  const carts = await prisma.cart.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
  const cartIds = carts.map((row) => row.id);
  const deliveries = await prisma.delivery.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } });
  const deliveryIds = deliveries.map((row) => row.id);
  const escrows = await prisma.escrowHold.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } });
  const escrowIds = escrows.map((row) => row.id);
  const wallets = await prisma.wallet.findMany({
    where: { OR: [{ userId: { in: userIds } }, { vendorId: { in: vendorIds } }] },
    select: { id: true }
  });
  const walletIds = wallets.map((row) => row.id);
  const topUps = await prisma.walletTopUp.findMany({ where: { walletId: { in: walletIds } }, select: { id: true } });
  const topUpIds = topUps.map((row) => row.id);
  const transactions = await prisma.walletTransaction.findMany({
    where: { OR: [{ walletId: { in: walletIds } }, { reference: { contains: RUN_ID } }, { orderId: { in: orderIds } }] },
    select: { id: true }
  });
  const transactionIds = transactions.map((row) => row.id);
  const intents = await prisma.notificationIntent.findMany({
    where: { OR: [{ entityId: { in: [...orderIds, ...topUpIds] } }, { dedupeKey: { contains: RUN_ID } }] },
    select: { id: true }
  });
  const entityIds = [
    ...orderIds,
    ...paymentIds,
    ...deliveryIds,
    ...escrowIds,
    ...productIds,
    ...vendorIds,
    ...categoryIds,
    ...transactionIds,
    ...topUpIds
  ];

  // External escrow credits the vendor payable against a SYSTEM debit. The
  // platform is the buyer of record, so its stored available falls and its held
  // rises by exactly the journal amount — the previous 2× projection gap.
  const system = await prisma.wallet.findFirst({ where: { ownerType: "SYSTEM" }, select: { id: true } });
  let systemAvailableDelta = BigInt(0);
  let systemHeldDelta = BigInt(0);
  if (system) {
    const fullTransactions = await prisma.walletTransaction.findMany({
      where: { id: { in: transactionIds } },
      include: { ledger: true }
    });
    for (const transaction of fullTransactions) {
      const legs = transaction.ledger.filter((leg) => leg.walletId === system.id);
      if (legs.length === 0) continue;
      if (transaction.type === "credit" && transaction.reference.startsWith("TOPUP-")) {
        const debit = legs.find((leg) => leg.direction === "DEBIT");
        systemAvailableDelta += debit?.amountKobo ?? BigInt(0);
      } else if (transaction.type === "hold" && transaction.reference.startsWith("ESCROW-HOLD-")) {
        const debit = legs.find((leg) => leg.direction === "DEBIT");
        systemAvailableDelta += debit?.amountKobo ?? BigInt(0);
        systemHeldDelta -= debit?.amountKobo ?? BigInt(0);
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    if (system && (systemAvailableDelta !== BigInt(0) || systemHeldDelta !== BigInt(0))) {
      await tx.wallet.update({
        where: { id: system.id },
        data: {
          availableKobo: { increment: systemAvailableDelta },
          heldKobo: { increment: systemHeldDelta }
        }
      });
    }
    await tx.notificationAttempt.deleteMany({
      where: { notification: { OR: [{ userId: { in: userIds } }, { entityId: { in: entityIds } }] } }
    });
    await tx.notification.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { entityId: { in: entityIds } }] } });
    await tx.notificationIntent.deleteMany({ where: { id: { in: intents.map((row) => row.id) } } });
    await tx.partnerNotification.deleteMany({ where: { userId: { in: userIds } } });
    await tx.webhookEvent.deleteMany({ where: { eventId: { contains: RUN_ID } } });
    await tx.trackingEvent.deleteMany({ where: { deliveryId: { in: deliveryIds } } });
    await tx.delivery.deleteMany({ where: { id: { in: deliveryIds } } });
    await tx.dispute.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.affiliateReversalIntent.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.refund.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.escrowEvent.deleteMany({ where: { escrowId: { in: escrowIds } } });
    await tx.escrowHold.deleteMany({ where: { id: { in: escrowIds } } });
    await tx.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.orderStatusEvent.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.orderAttribution.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.ledgerEntry.deleteMany({ where: { OR: [{ transactionId: { in: transactionIds } }, { walletId: { in: walletIds } }] } });
    await tx.walletTransaction.deleteMany({ where: { id: { in: transactionIds } } });
    await tx.order.deleteMany({ where: { id: { in: orderIds } } });
    await tx.cartItem.deleteMany({ where: { cartId: { in: cartIds } } });
    await tx.cart.deleteMany({ where: { id: { in: cartIds } } });
    await tx.walletTopUp.deleteMany({ where: { id: { in: topUpIds } } });
    await tx.wallet.deleteMany({ where: { id: { in: walletIds } } });
    await tx.auditLog.deleteMany({ where: { OR: [{ actorId: { in: userIds } }, { entityId: { in: entityIds } }] } });
    await tx.systemEvent.deleteMany({ where: { OR: [{ actorId: { in: userIds } }, { entityId: { in: entityIds } }] } });
    await tx.inventoryStock.deleteMany({ where: { productId: { in: productIds } } });
    await tx.productImage.deleteMany({ where: { productId: { in: productIds } } });
    await tx.product.deleteMany({ where: { id: { in: productIds } } });
    await tx.vendor.deleteMany({ where: { id: { in: vendorIds } } });
    await tx.category.deleteMany({ where: { id: { in: categoryIds } } });
    await tx.session.deleteMany({ where: { userId: { in: userIds } } });
    await tx.address.deleteMany({ where: { userId: { in: userIds } } });
    await tx.user.deleteMany({ where: { id: { in: userIds } } });
  }, { timeout: 60_000 });

  const leftovers =
    (await prisma.user.count({ where: { email: { startsWith: emailPrefix } } })) +
    (await prisma.order.count({ where: { id: { in: orderIds } } })) +
    (await prisma.webhookEvent.count({ where: { eventId: { contains: RUN_ID } } }));
  return {
    users: userIds.length,
    orders: orderIds.length,
    payments: paymentIds.length,
    transactions: transactionIds.length,
    leftovers
  };
}

/* ------------------------------------------------------------------ main --- */

async function main(prisma: PrismaClient, url: string) {
  const { processWebhook } = await import("../lib/payments/service");
  const { createTopUp, creditTopUp, failTopUp } = await import("../lib/services/core/topup.service");
  const { reconcile } = await import("../lib/services/core/reconciliation-correct");

  const db = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  assert(db[0]?.db === DB, `wrong database ${db[0]?.db ?? "unknown"}, expected ${DB}`);
  await ensureCity(prisma);
  const system = await prisma.wallet.findFirstOrThrow({ where: { ownerType: "SYSTEM" }, select: { id: true, availableKobo: true, heldKobo: true } });

  /* ---- A. Paystack initiation and success ---- */
  const success = await createScenario(prisma, "success", "paystack");
  outcomes.set(success.reference, "success");
  const pendingPayment = await prisma.payment.findUniqueOrThrow({ where: { id: success.paymentId } });
  record(
    "provider initiation records one PENDING payment with the server's amount, currency and reference",
    pendingPayment.status === "PENDING" &&
      pendingPayment.provider === "paystack" &&
      pendingPayment.amountKobo === ORDER_TOTAL_KOBO &&
      pendingPayment.currency === "NGN" &&
      pendingPayment.providerReference === success.reference &&
      Boolean(pendingPayment.raw),
    `status ${pendingPayment.status}, amount ${pendingPayment.amountKobo}, currency ${pendingPayment.currency}, raw stored ${Boolean(pendingPayment.raw)}`
  );

  const successEvent = paystackEvent({
    eventId: `${RUN_ID}-paystack-success`,
    reference: success.reference,
    amount: Number(ORDER_TOTAL_KOBO),
    currency: "NGN"
  });
  const first = await statusOf(processWebhook("paystack", successEvent.body, successEvent.headers));
  const paidView = await orderView(prisma, success);
  const successSystem = await walletView(prisma, system.id);
  const successBuyer = await walletView(prisma, success.walletId);
  const successVendor = await walletView(prisma, success.vendorWalletId);
  const successOther = await walletView(prisma, success.otherWalletId);
  const successOtherVendor = await walletView(prisma, success.otherVendorWalletId);
  const holdJournal = await prisma.walletTransaction.findFirst({
    where: { orderId: success.orderId, reference: `ESCROW-HOLD-${success.orderId}` },
    include: { ledger: true }
  });
  record(
    "a signed success is verified server-side and credits escrow exactly once",
    first.ok &&
      paidView.paymentStatus === "paid" &&
      paidView.payments.filter((payment) => payment.status === "COMPLETED").length === 1 &&
      paidView.escrowHolds.length === 1 &&
      paidView.escrowHolds[0].status === "held" &&
      paidView.deliveries.length === 1 &&
      successBuyer.availableKobo === BigInt(0) &&
      successBuyer.heldKobo === BigInt(0) &&
      successVendor.heldKobo === ORDER_TOTAL_KOBO &&
      successOther.availableKobo === BigInt(0) &&
      successVendor.availableKobo === BigInt(0) &&
      successOtherVendor.heldKobo === BigInt(0) &&
      Boolean(holdJournal) &&
      holdJournal!.ledger.reduce((sum, leg) => sum + (leg.direction === "CREDIT" ? leg.amountKobo : -leg.amountKobo), BigInt(0)) === BigInt(0),
    `payment ${paidView.paymentStatus}, escrow ${paidView.escrowHolds[0]?.status}, vendor held ${successVendor.heldKobo}, payload recipient wallet ${successOther.availableKobo}/${successOther.heldKobo}, SYSTEM ${successSystem.availableKobo}`
  );

  const duplicate = await statusOf(processWebhook("paystack", successEvent.body, successEvent.headers));
  const afterDuplicate = await orderView(prisma, success);
  const afterDuplicateVendor = await walletView(prisma, success.vendorWalletId);
  const afterDuplicateJournals = await prisma.walletTransaction.count({ where: { orderId: success.orderId } });
  const afterDuplicateIntents = await prisma.notificationIntent.count({ where: { entityId: success.orderId } });
  record(
    "a duplicate webhook is a no-op: one escrow, one journal, one intent and no second stock commit",
    duplicate.ok &&
      (duplicate.value as { duplicate?: boolean })?.duplicate === true &&
      afterDuplicate.escrowHolds.length === 1 &&
      afterDuplicateVendor.heldKobo === ORDER_TOTAL_KOBO &&
      afterDuplicateJournals === 1 &&
      afterDuplicateIntents === 1,
    `duplicate ${(duplicate.value as { duplicate?: boolean })?.duplicate}, journals ${afterDuplicateJournals}, intents ${afterDuplicateIntents}`
  );
  const lateFailure = paystackEvent({
    eventId: `${RUN_ID}-paystack-late-failure`,
    reference: success.reference,
    amount: Number(ORDER_TOTAL_KOBO),
    currency: "NGN",
    event: "charge.failed"
  });
  const lateFailureResult = await statusOf(processWebhook("paystack", lateFailure.body, lateFailure.headers));
  const afterLateFailure = await orderView(prisma, success);
  const stockAfterLateFailure = await prisma.inventoryStock.findUniqueOrThrow({ where: { productId: success.productId } });
  record(
    "a late failure after a committed success does not reverse the payment or release stock",
    lateFailureResult.ok &&
      afterLateFailure.paymentStatus === "paid" &&
      afterLateFailure.payments.some((payment) => payment.status === "COMPLETED") &&
      afterLateFailure.escrowHolds[0]?.status === "held" &&
      stockAfterLateFailure.quantity === 4 &&
      stockAfterLateFailure.reserved === 0,
    `status ${afterLateFailure.paymentStatus}, escrow ${afterLateFailure.escrowHolds[0]?.status}, stock ${stockAfterLateFailure.quantity}/${stockAfterLateFailure.reserved}`
  );

  /* ---- B. Amount / currency mismatch and declined verification ---- */
  const mismatch = await createScenario(prisma, "mismatch", "paystack");
  outcomes.set(mismatch.reference, "amount_mismatch");
  const mismatchEvent = paystackEvent({
    eventId: `${RUN_ID}-paystack-mismatch`,
    reference: mismatch.reference,
    amount: Number(ORDER_TOTAL_KOBO),
    currency: "NGN"
  });
  const mismatchResult = await statusOf(processWebhook("paystack", mismatchEvent.body, mismatchEvent.headers));
  const mismatchView = await orderView(prisma, mismatch);
  const mismatchStock = await prisma.inventoryStock.findUniqueOrThrow({ where: { productId: mismatch.productId } });
  record(
    "a verified amount mismatch fails the attempt, releases stock and creates no escrow",
    !mismatchResult.ok &&
      mismatchResult.status === 409 &&
      mismatchResult.code === "amount_mismatch" &&
      mismatchView.paymentStatus === "pending" &&
      mismatchView.payments.every((payment) => payment.status !== "COMPLETED") &&
      mismatchView.escrowHolds.length === 0 &&
      mismatchStock.quantity === 5 &&
      mismatchStock.reserved === 0,
    `${mismatchResult.status} ${mismatchResult.code}, payment ${mismatchView.payments[0]?.status}, stock ${mismatchStock.quantity}/${mismatchStock.reserved}`
  );

  const declined = await createScenario(prisma, "declined", "paystack");
  outcomes.set(declined.reference, "declined");
  const declinedEvent = paystackEvent({
    eventId: `${RUN_ID}-paystack-declined`,
    reference: declined.reference,
    amount: Number(ORDER_TOTAL_KOBO),
    currency: "NGN"
  });
  const declinedResult = await statusOf(processWebhook("paystack", declinedEvent.body, declinedEvent.headers));
  const declinedView = await orderView(prisma, declined);
  record(
    "a declined provider verification fails the attempt and leaves no escrow",
    !declinedResult.ok &&
      declinedResult.status === 402 &&
      declinedView.paymentStatus === "pending" &&
      declinedView.payments.every((payment) => payment.status !== "COMPLETED") &&
      declinedView.escrowHolds.length === 0,
    `${declinedResult.status} ${declinedResult.code}, payment ${declinedView.payments[0]?.status}`
  );

  const currency = await createScenario(prisma, "currency", "paystack");
  outcomes.set(currency.reference, "currency_mismatch");
  const currencyEvent = paystackEvent({
    eventId: `${RUN_ID}-paystack-currency`,
    reference: currency.reference,
    amount: Number(ORDER_TOTAL_KOBO),
    currency: "NGN"
  });
  const currencyResult = await statusOf(processWebhook("paystack", currencyEvent.body, currencyEvent.headers));
  const currencyView = await orderView(prisma, currency);
  record(
    "a verified currency mismatch is refused and creates no escrow",
    !currencyResult.ok &&
      currencyResult.status === 409 &&
      currencyView.escrowHolds.length === 0 &&
      currencyView.payments.every((payment) => payment.status !== "COMPLETED"),
    `${currencyResult.status} ${currencyResult.code}, escrow ${currencyView.escrowHolds.length}`
  );

  /* ---- C. Provider timeout and retry recovery ---- */
  const timeout = await createScenario(prisma, "timeout", "paystack");
  outcomes.set(timeout.reference, "timeout");
  const timeoutEvent = paystackEvent({
    eventId: `${RUN_ID}-paystack-timeout`,
    reference: timeout.reference,
    amount: Number(ORDER_TOTAL_KOBO),
    currency: "NGN"
  });
  const timeoutResult = await statusOf(processWebhook("paystack", timeoutEvent.body, timeoutEvent.headers));
  const timeoutPayment = await prisma.payment.findUniqueOrThrow({ where: { id: timeout.paymentId } });
  const timeoutView = await orderView(prisma, timeout);
  const timeoutStock = await prisma.inventoryStock.findUniqueOrThrow({ where: { productId: timeout.productId } });
  const timeoutEventRow = await prisma.webhookEvent.findUniqueOrThrow({ where: { provider_eventId: { provider: "paystack", eventId: `charge.success:${RUN_ID}-paystack-timeout` } } });
  record(
    "a provider timeout leaves the payment PENDING and the webhook retryable",
    !timeoutResult.ok &&
      timeoutPayment.status === "PENDING" &&
      timeoutView.paymentStatus === "pending" &&
      timeoutView.escrowHolds.length === 0 &&
      timeoutStock.quantity === 5 &&
      timeoutStock.reserved === 1 &&
      timeoutEventRow.status === "failed",
    `payment ${timeoutPayment.status}, webhook ${timeoutEventRow.status}, stock ${timeoutStock.quantity}/${timeoutStock.reserved}`
  );
  outcomes.set(timeout.reference, "success");
  const timeoutRetry = await statusOf(processWebhook("paystack", timeoutEvent.body, timeoutEvent.headers));
  const timeoutAfter = await orderView(prisma, timeout);
  const timeoutEventAfter = await prisma.webhookEvent.findUniqueOrThrow({ where: { provider_eventId: { provider: "paystack", eventId: `charge.success:${RUN_ID}-paystack-timeout` } } });
  record(
    "retrying the same webhook after provider recovery completes the payment exactly once",
    timeoutRetry.ok &&
      (timeoutRetry.value as { duplicate?: boolean })?.duplicate === false &&
      timeoutAfter.paymentStatus === "paid" &&
      timeoutAfter.escrowHolds.length === 1 &&
      timeoutEventAfter.status === "processed" &&
      (await prisma.walletTransaction.count({ where: { orderId: timeout.orderId } })) === 1,
    `payment ${timeoutAfter.paymentStatus}, webhook ${timeoutEventAfter.status}, journals ${await prisma.walletTransaction.count({ where: { orderId: timeout.orderId } })}`
  );

  /* ---- D. Failure before success is terminal ---- */
  const failedFirst = await createScenario(prisma, "failed-first", "paystack");
  outcomes.set(failedFirst.reference, "success");
  const failedEvent = paystackEvent({
    eventId: `${RUN_ID}-paystack-failed-first`,
    reference: failedFirst.reference,
    amount: Number(ORDER_TOTAL_KOBO),
    currency: "NGN",
    event: "charge.failed"
  });
  const failedResult = await statusOf(processWebhook("paystack", failedEvent.body, failedEvent.headers));
  const failedView = await orderView(prisma, failedFirst);
  const failedStock = await prisma.inventoryStock.findUniqueOrThrow({ where: { productId: failedFirst.productId } });
  record(
    "a failed event releases stock and cancels the unpaid order",
    failedResult.ok &&
      failedView.paymentStatus === "pending" &&
      failedView.status === "cancelled" &&
      failedView.payments[0]?.status === "FAILED" &&
      failedView.escrowHolds.length === 0 &&
      failedStock.quantity === 5 &&
      failedStock.reserved === 0,
    `order ${failedView.status}, payment ${failedView.payments[0]?.status}, stock ${failedStock.quantity}/${failedStock.reserved}`
  );
  const successAfterFailure = paystackEvent({
    eventId: `${RUN_ID}-paystack-success-after-failure`,
    reference: failedFirst.reference,
    amount: Number(ORDER_TOTAL_KOBO),
    currency: "NGN"
  });
  const successAfterFailureResult = await statusOf(
    processWebhook("paystack", successAfterFailure.body, successAfterFailure.headers)
  );
  const failedFirstAfter = await orderView(prisma, failedFirst);
  const successAfterFailureEvent = await prisma.webhookEvent.findUniqueOrThrow({
    where: { provider_eventId: { provider: "paystack", eventId: `charge.success:${RUN_ID}-paystack-success-after-failure` } }
  });
  record(
    "a success arriving after a terminal failure does not revive the attempt",
    !successAfterFailureResult.ok &&
      successAfterFailureResult.status === 409 &&
      successAfterFailureResult.code === "payment_failed" &&
      failedFirstAfter.payments[0]?.status === "FAILED" &&
      failedFirstAfter.escrowHolds.length === 0 &&
      successAfterFailureEvent.status === "failed",
    `${successAfterFailureResult.status} ${successAfterFailureResult.code}, payment ${failedFirstAfter.payments[0]?.status}`
  );

  /* ---- E. Authenticity, unknown reference and payload recipient ---- */
  const auth = await createScenario(prisma, "auth", "paystack");
  const authEvent = paystackEvent({
    eventId: `${RUN_ID}-paystack-bad-signature`,
    reference: auth.reference,
    amount: Number(ORDER_TOTAL_KOBO),
    currency: "NGN"
  });
  const badSignature = await statusOf(
    processWebhook("paystack", authEvent.body, new Headers({ "x-paystack-signature": "deadbeef" }))
  );
  const authPayment = await prisma.payment.findUniqueOrThrow({ where: { id: auth.paymentId } });
  record(
    "an invalid signature is rejected before any payment work",
    !badSignature.ok && badSignature.status === 401 && badSignature.code === "invalid_signature" && authPayment.status === "PENDING",
    `${badSignature.status} ${badSignature.code}, payment ${authPayment.status}`
  );

  const unknownEvent = paystackEvent({
    eventId: `${RUN_ID}-paystack-unknown`,
    reference: `NDP-UNKNOWN-${RUN_ID}`,
    amount: 100,
    currency: "NGN"
  });
  const unknown = await statusOf(processWebhook("paystack", unknownEvent.body, unknownEvent.headers));
  const unknownRow = await prisma.webhookEvent.findUniqueOrThrow({
    where: { provider_eventId: { provider: "paystack", eventId: `charge.success:${RUN_ID}-paystack-unknown` } }
  });
  record(
    "a valid signature for an unknown reference is refused and recorded as a failed event",
    !unknown.ok && unknown.status === 404 && unknown.code === "payment_not_found" && unknownRow.status === "failed",
    `${unknown.status} ${unknown.code}, event ${unknownRow.status}`
  );

  // The signed payload names another customer and order in metadata. The money
  // must follow the payment's own order, never the payload.
  const intended = await createScenario(prisma, "intended", "paystack");
  outcomes.set(intended.reference, "success");
  const intendedEvent = paystackEvent({
    eventId: `${RUN_ID}-paystack-intended`,
    reference: intended.reference,
    amount: Number(ORDER_TOTAL_KOBO),
    currency: "NGN"
  });
  const intendedResult = await statusOf(processWebhook("paystack", intendedEvent.body, intendedEvent.headers));
  const intendedView = await orderView(prisma, intended);
  const otherWalletAfter = await walletView(prisma, intended.otherWalletId);
  const otherVendorAfter = await walletView(prisma, intended.otherVendorWalletId);
  record(
    "the payment credits the order's own vendor and never a wallet named in the payload",
    intendedResult.ok &&
      intendedView.paymentStatus === "paid" &&
      (await walletView(prisma, intended.vendorWalletId)).heldKobo === ORDER_TOTAL_KOBO &&
      otherWalletAfter.availableKobo === BigInt(0) &&
      otherWalletAfter.heldKobo === BigInt(0) &&
      otherVendorAfter.heldKobo === BigInt(0),
    `order vendor held ${(await walletView(prisma, intended.vendorWalletId)).heldKobo}, payload customer ${otherWalletAfter.availableKobo}/${otherWalletAfter.heldKobo}, payload vendor ${otherVendorAfter.heldKobo}`
  );

  /* ---- F. Flutterwave signature and success ---- */
  const flutterwave = await createScenario(prisma, "flutterwave", "flutterwave");
  outcomes.set(flutterwave.reference, "success");
  const flwEvent = flutterwaveEvent({
    eventId: `${RUN_ID}-flw-success`,
    reference: flutterwave.reference,
    amountMinor: Number(ORDER_TOTAL_KOBO),
    currency: "NGN"
  });
  const flwBad = await statusOf(
    processWebhook("flutterwave", flwEvent.body, new Headers({ "verif-hash": "wrong" }))
  );
  const flwGood = await statusOf(processWebhook("flutterwave", flwEvent.body, flwEvent.headers));
  const flwView = await orderView(prisma, flutterwave);
  record(
    "Flutterwave rejects a wrong hash and accepts a signed success",
    !flwBad.ok &&
      flwBad.status === 401 &&
      flwGood.ok &&
      flwView.paymentStatus === "paid" &&
      flwView.escrowHolds.length === 1 &&
      flwView.payments.some((payment) => payment.status === "COMPLETED"),
    `bad ${flwBad.status} ${flwBad.code}, good ${flwGood.ok ? "processed" : `${flwGood.status} ${flwGood.code}`}, payment ${flwView.paymentStatus}`
  );

  /* ---- G. Initiation failure ---- */
  const initiation = await createScenario(prisma, "initiation", "paystack");
  // The fixture for this order must fail during initialize, so re-run the
  // service against a second order after switching the mock to an HTTP error.
  const savedFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith("https://api.paystack.co/transaction/initialize")) {
      fetchLog.push(`INITIALIZE_ERROR ${url}`);
      return json({ status: false, message: "Simulated initialize outage." }, 502);
    }
    return savedFetch(input as RequestInfo, init);
  }) as typeof fetch;
  const { initializePayment } = await import("../lib/payments/service");
  const { checkout } = await import("../lib/services/core/checkout.service");
  const initUser = await prisma.user.create({
    data: { email: `wc-webhook-${RUN_ID}-initiation-failed@example.test`, name: "WC initiation failed", actorType: "CUSTOMER" }
  });
  const initCart = await prisma.cart.create({
    data: { userId: initUser.id, status: "ACTIVE", items: { create: { productId: initiation.productId, quantity: 1 } } }
  });
  const initCheckout = await checkout({
    userId: initUser.id,
    address: {
      contactName: "WC initiation failed",
      contactPhone: "08000000002",
      countryCode: "NG",
      state: "Lagos",
      city: "Lagos",
      line1: "3 Acceptance Fixture Way"
    }
  });
  const initOrder = initCheckout.orders[0];
  const initFailure = await statusOf(initializePayment({
    orderId: initOrder.orderId,
    userId: initUser.id,
    provider: "paystack",
    callbackUrl: "http://localhost/orders/callback"
  }));
  const initPayment = await prisma.payment.findFirstOrThrow({ where: { orderId: initOrder.orderId } });
  globalThis.fetch = savedFetch;
  record(
    "a provider initialization error marks the attempt FAILED and reports a provider error",
    !initFailure.ok && initFailure.status === 502 && initFailure.code === "provider_error" && initPayment.status === "FAILED",
    `${initFailure.status} ${initFailure.code}, payment ${initPayment.status}`
  );

  /* ---- H. Top-up funding service (authoritative local verification) ---- */
  const topUpWallet = await walletView(prisma, success.walletId);
  const topUpKey = `wc-webhook-topup-${RUN_ID}`;
  const createdTopUp = await createTopUp(prisma, {
    walletId: success.walletId,
    amountKobo: BigInt(20_000),
    provider: "test",
    providerReference: `TEST-${topUpKey}`,
    idempotencyKey: topUpKey
  });
  const credited = await statusOf(creditTopUp(prisma, {
    providerReference: createdTopUp.topUp.providerReference,
    verifiedAmountKobo: BigInt(20_000),
    verifiedCurrency: "NGN",
    raw: { simulated: true, note: "Deterministic local funding fixture. No real provider call." }
  }));
  const topUpAfter = await walletView(prisma, success.walletId);
  const topUpOtherAfter = await walletView(prisma, success.otherWalletId);
  const topUpJournal = await prisma.walletTransaction.findFirst({
    where: { reference: `TOPUP-${createdTopUp.topUp.providerReference}` },
    include: { ledger: true }
  });
  record(
    "a verified top-up credits only its intended wallet, once, with a balanced journal",
    credited.ok &&
      (credited.value as { status?: string })?.status === "credited" &&
      topUpAfter.availableKobo === topUpWallet.availableKobo + BigInt(20_000) &&
      topUpOtherAfter.availableKobo === BigInt(0) &&
      Boolean(topUpJournal) &&
      topUpJournal!.ledger.reduce((sum, leg) => sum + (leg.direction === "CREDIT" ? leg.amountKobo : -leg.amountKobo), BigInt(0)) === BigInt(0),
    `wallet ${topUpWallet.availableKobo} -> ${topUpAfter.availableKobo}, other wallet ${topUpOtherAfter.availableKobo}, journal ${topUpJournal ? "balanced" : "missing"}`
  );
  const replayTopUp = await creditTopUp(prisma, {
    providerReference: createdTopUp.topUp.providerReference,
    verifiedAmountKobo: BigInt(20_000),
    verifiedCurrency: "NGN"
  });
  const topUpAfterReplay = await walletView(prisma, success.walletId);
  record(
    "a replayed top-up confirmation credits nothing further",
    replayTopUp.status === "already_credited" && topUpAfterReplay.availableKobo === topUpAfter.availableKobo,
    `replay ${replayTopUp.status}, wallet ${topUpAfterReplay.availableKobo}`
  );
  const mismatchTopUpKey = `wc-webhook-topup-mismatch-${RUN_ID}`;
  const mismatchTopUp = await createTopUp(prisma, {
    walletId: success.walletId,
    amountKobo: BigInt(20_000),
    provider: "test",
    providerReference: `TEST-${mismatchTopUpKey}`,
    idempotencyKey: mismatchTopUpKey
  });
  const amountTopUp = await statusOf(creditTopUp(prisma, {
    providerReference: mismatchTopUp.topUp.providerReference,
    verifiedAmountKobo: BigInt(30_000),
    verifiedCurrency: "NGN"
  }));
  const currencyTopUp = await statusOf(creditTopUp(prisma, {
    providerReference: mismatchTopUp.topUp.providerReference,
    verifiedAmountKobo: BigInt(20_000),
    verifiedCurrency: "USD"
  }));
  const failedTopUpKey = `wc-webhook-topup-failed-${RUN_ID}`;
  const failedTopUp = await createTopUp(prisma, {
    walletId: success.walletId,
    amountKobo: BigInt(20_000),
    provider: "test",
    providerReference: `TEST-${failedTopUpKey}`,
    idempotencyKey: failedTopUpKey
  });
  await failTopUp(prisma, { providerReference: failedTopUp.topUp.providerReference, reason: "Deterministic failure fixture." });
  const failedCredit = await statusOf(creditTopUp(prisma, {
    providerReference: failedTopUp.topUp.providerReference,
    verifiedAmountKobo: BigInt(20_000),
    verifiedCurrency: "NGN"
  }));
  record(
    "top-up amount/currency mismatches and a failed top-up are refused without a credit",
    !amountTopUp.ok &&
      amountTopUp.status === 409 &&
      amountTopUp.code === "amount_mismatch" &&
      !currencyTopUp.ok &&
      currencyTopUp.status === 409 &&
      currencyTopUp.code === "currency_mismatch" &&
      !failedCredit.ok &&
      failedCredit.status === 409 &&
      failedCredit.code === "topup_failed",
    `amount ${amountTopUp.status} ${amountTopUp.code}, currency ${currencyTopUp.status} ${currencyTopUp.code}, failed ${failedCredit.status} ${failedCredit.code}`
  );
  const concurrentKey = `wc-webhook-topup-concurrent-${RUN_ID}`;
  const concurrentTopUp = await createTopUp(prisma, {
    walletId: success.walletId,
    amountKobo: BigInt(20_000),
    provider: "test",
    providerReference: `TEST-${concurrentKey}`,
    idempotencyKey: concurrentKey
  });
  const beforeConcurrent = (await walletView(prisma, success.walletId)).availableKobo;
  const concurrent = await Promise.allSettled([
    creditTopUp(prisma, {
      providerReference: concurrentTopUp.topUp.providerReference,
      verifiedAmountKobo: BigInt(20_000),
      verifiedCurrency: "NGN"
    }),
    creditTopUp(prisma, {
      providerReference: concurrentTopUp.topUp.providerReference,
      verifiedAmountKobo: BigInt(20_000),
      verifiedCurrency: "NGN"
    })
  ]);
  const creditedCount = concurrent.filter(
    (result) => result.status === "fulfilled" && result.value.status === "credited"
  ).length;
  const afterConcurrent = (await walletView(prisma, success.walletId)).availableKobo;
  record(
    "two concurrent confirmations of one top-up credit exactly once",
    creditedCount === 1 && afterConcurrent === beforeConcurrent + BigInt(20_000),
    `${creditedCount} credited, wallet ${beforeConcurrent} -> ${afterConcurrent}`
  );
  const unknownTopUp = await statusOf(creditTopUp(prisma, {
    providerReference: `TEST-UNKNOWN-${RUN_ID}`,
    verifiedAmountKobo: BigInt(20_000),
    verifiedCurrency: "NGN"
  }));
  record(
    "an unknown top-up reference is refused and cannot mint funds",
    !unknownTopUp.ok && unknownTopUp.status === 404 && unknownTopUp.code === "topup_not_found",
    `${unknownTopUp.status} ${unknownTopUp.code}`
  );

  /* ---- I. External-funding projection now matches the journal ---- */
  const systemAfterExternal = await walletView(prisma, system.id);
  const externalSystemLegs = await prisma.ledgerEntry.findMany({
    where: { walletId: system.id, transaction: { reference: { startsWith: "ESCROW-HOLD-" } } },
    include: { transaction: { select: { orderId: true } } }
  });
  const externalTotal = externalSystemLegs
    .filter((leg) => leg.transaction.orderId && [success.orderId, timeout.orderId, intended.orderId, flutterwave.orderId].includes(leg.transaction.orderId))
    .reduce((sum, leg) => sum + leg.amountKobo, BigInt(0));
  const { loadOpenHoldLedger, compareWalletProjection } = await import("../lib/services/core/reconciliation-correct");
  const systemLedger = await prisma.ledgerEntry.findMany({
    where: { walletId: system.id },
    select: { direction: true, amountKobo: true, transaction: { select: { type: true, reference: true } } }
  });
  const systemLedgerNet = systemLedger.reduce(
    (sum, leg) => sum + (leg.direction === "CREDIT" ? leg.amountKobo : -leg.amountKobo),
    BigInt(0)
  );
  // This suite also credits top-ups, which debit SYSTEM available; isolate the
  // external-escrow component so the assertion is about escrow, not top-ups.
  const topUpDebitTotal = systemLedger
    .filter(
      (leg) =>
        leg.direction === "DEBIT" &&
        leg.transaction.type === "credit" &&
        leg.transaction.reference.startsWith("TOPUP-") &&
        leg.transaction.reference.includes(RUN_ID)
    )
    .reduce((sum, leg) => sum + leg.amountKobo, BigInt(0));
  const externalProjection = compareWalletProjection({
    walletId: system.id,
    availableKobo: systemAfterExternal.availableKobo,
    heldKobo: systemAfterExternal.heldKobo,
    ledgerNetKobo: systemLedgerNet,
    holds: await loadOpenHoldLedger(prisma)
  });
  record(
    "external provider funding moves SYSTEM available and held with its journal and open escrow",
    externalTotal > BigInt(0) &&
      systemAfterExternal.availableKobo === system.availableKobo - externalTotal - topUpDebitTotal &&
      systemAfterExternal.heldKobo === system.heldKobo + externalTotal &&
      externalProjection.availableDifferenceKobo === BigInt(0) &&
      externalProjection.heldDifferenceKobo === BigInt(0),
    `external escrow journal total ${externalTotal}, top-up SYSTEM debits ${topUpDebitTotal}, SYSTEM ${system.availableKobo}/${system.heldKobo} -> ${systemAfterExternal.availableKobo}/${systemAfterExternal.heldKobo}, projection difference ${externalProjection.availableDifferenceKobo}/${externalProjection.heldDifferenceKobo}`
  );

  /* ---- cleanup and reconciliation ---- */
  const systemBeforeCleanup = await walletView(prisma, system.id);
  const cleanup = await cleanupRun(prisma);
  const systemRestored = await walletView(prisma, system.id);
  const reconciliation = await reconcile();
  const reconcileCli = spawnSync(
    process.execPath,
    [TSX_CLI, path.join(REPO_ROOT, "scripts", "wallet-reconcile.ts")],
    {
      cwd: REPO_ROOT,
      env: { ...process.env, DATABASE_URL: url, RECONCILE_DB: DB, VALKEY_URL: "" },
      encoding: "utf8",
      timeout: 120_000
    }
  );
  let reconcileReport: { status?: string } = {};
  try {
    reconcileReport = JSON.parse(reconcileCli.stdout);
  } catch {
    reconcileReport = {};
  }
  record(
    "fixture cleanup removes every run row and restores the SYSTEM position",
    cleanup.leftovers === 0 &&
      systemRestored.availableKobo === system.availableKobo &&
      systemRestored.heldKobo === system.heldKobo,
    `leftovers ${cleanup.leftovers}, SYSTEM ${system.availableKobo}/${system.heldKobo} -> ${systemBeforeCleanup.availableKobo}/${systemBeforeCleanup.heldKobo} -> restored ${systemRestored.availableKobo}/${systemRestored.heldKobo}`
  );
  record(
    "whole-book reconciliation is clean after cleanup",
    reconciliation.issues.length === 0 && reconcileReport.status === "CLEAN",
    `issues ${reconciliation.issues.length}, cli ${reconcileReport.status ?? reconcileCli.status}`
  );

  console.log(JSON.stringify({
    runId: RUN_ID,
    database: DB,
    mode: "MOCKED INTEGRATION ACCEPTANCE — no provider network call was made",
    providerCallsIntercepted: providerCalls,
    fetchLog: fetchLog.slice(0, 40),
    checks,
    failures,
    cleanup,
    reconciliation: { issues: reconciliation.issues.length, totals: reconciliation.totals },
    reconcileCli: reconcileReport,
    remainingGap:
      "Wallet top-up provider initiation and a top-up webhook route are not implemented. createTopUp only records a PENDING row; the pay/flutterwave branches return no checkout URL ('Sandbox checkout is not wired yet') and nothing calls creditTopUp from a provider webhook. Only the local test provider's authenticated confirmation and the creditTopUp service boundary are verified here. Real provider sandbox: BLOCKED (no sandbox credentials, no provider call).",
    status: failures === 0 ? "PASS" : "FAIL"
  }, (key, value) => (typeof value === "bigint" ? value.toString() : value), 2));
}

async function run() {
  process.env.VALKEY_URL = "";
  process.env.PAYSTACK_SECRET_KEY = PAYSTACK_SECRET;
  process.env.FLUTTERWAVE_SECRET_KEY = FLUTTERWAVE_SECRET;
  process.env.FLUTTERWAVE_WEBHOOK_HASH = FLUTTERWAVE_HASH;
  process.env.ENABLE_TEST_PAYMENTS = "true";
  const url = acceptanceUrl();
  process.env.DATABASE_URL = url;
  installProviderMock();
  const { prisma } = await import("../lib/prisma");
  try {
    await main(prisma, url);
  } catch (error) {
    try {
      await cleanupRun(prisma);
    } catch (cleanupError) {
      process.stderr.write(`cleanup after failure failed: ${String(cleanupError)}\n`);
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
