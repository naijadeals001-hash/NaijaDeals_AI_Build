/**
 * Escrow completion and external-escrow accounting acceptance.
 *
 * Isolated database: the URL is derived from `.env` by replacing only the
 * database path with `naijadeals_wallet_acceptance`, and `current_database()`
 * is a hard guard. No production database, real charge, payout, push or
 * deployment is touched. Provider traffic is intercepted; any non-Paystack URL
 * aborts, so a missing mock cannot become a real request.
 *
 * Cases:
 *   A. Wallet-paid order -> partial refund -> completion: the release pays the
 *      remaining payable only, not the original escrow amount.
 *   B. Multiple partial refunds -> completion.
 *   C. Full refund -> completion attempt is refused with no release.
 *   D. Completion racing a refund (wallet, simultaneous) and an external refund
 *      that is still PENDING at the provider (deterministic).
 *   E. Duplicate completion returns the recorded release without moving money.
 *   F. External payment: duplicate confirmation creates one escrow, projection
 *      matches the journal, release/partial refund/full refund/cancellation all
 *      reconcile per stage.
 *
 * After each stage the shared invariant is asserted for every involved wallet:
 *   availableKobo == ledgerNet - open counterparty hold credits
 *   heldKobo      == open buyer holds + open counterparty hold credits
 * plus a whole-book `reconcile()` with zero issues.
 *
 * Usage: npx tsx scripts/escrow-completion-acceptance.ts
 */
import "dotenv/config";
import { createHmac, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { requireTestDatabase, testDatabaseChildEnv } from "./lib/test-db-guard";

const DB = "naijadeals_wallet_acceptance";
const RUN_ID = `${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${randomBytes(4).toString("hex")}`;
const REPO_ROOT = path.resolve(__dirname, "..");
const TSX_CLI = path.join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs");

const SUBTOTAL_KOBO = BigInt(4_951);
const DELIVERY_KOBO = BigInt(150_000);
const TOTAL_KOBO = BigInt(155_000);
const COMMISSION_KOBO = BigInt(495);
const PAYABLE_KOBO = SUBTOTAL_KOBO - COMMISSION_KOBO + DELIVERY_KOBO; // 154,456
const FUNDING_KOBO = BigInt(175_000);
const PROVIDER_SECRET = `sk_test_escrow_completion_${RUN_ID}`;

type CheckResult = { name: string; pass: boolean; detail: string };
type WalletSnapshot = { available: string; held: string };
type Scenario = {
  label: string;
  userId: string;
  walletId: string;
  vendorOwnerId: string;
  vendorId: string;
  categoryId: string;
  productId: string;
  cartId: string;
  orderId: string;
  orderNumber: string;
  paymentId: string;
  reference: string;
  provider: "wallet" | "paystack";
  totalKobo: bigint;
};

const checks: CheckResult[] = [];
let failures = 0;
let providerCalls = 0;

function record(name: string, pass: boolean, detail: string) {
  checks.push({ name, pass, detail });
  if (!pass) failures += 1;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function snapshot(wallet: { availableKobo: bigint; heldKobo: bigint }): WalletSnapshot {
  return { available: wallet.availableKobo.toString(), held: wallet.heldKobo.toString() };
}

function acceptanceUrl() {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error("TEST_DATABASE_URL is not set by the test database guard.");
  return raw;
}

/* ------------------------------------------------------------ provider --- */

type RefundGate = { promise: Promise<void>; release: () => void };
let refundGate: RefundGate | null = null;

function holdRefundResponses() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = () => {
      refundGate = null;
      resolve();
    };
  });
  refundGate = { promise, release };
}

function releaseRefundResponses() {
  refundGate?.release();
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

/** Deterministic Paystack double. No other host is reachable from this test. */
function installProviderMock() {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    if (!url.startsWith("https://api.paystack.co")) {
      throw new Error(`Blocked non-provider network call: ${method} ${url}`);
    }
    providerCalls += 1;

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
      return json({
        status: true,
        data: { status: "success", reference, amount: Number(TOTAL_KOBO), currency: "NGN" }
      });
    }

    if (url.startsWith("https://api.paystack.co/refund")) {
      if (refundGate) await refundGate.promise;
      return json({ status: true, data: { status: "processed", id: `refund-${RUN_ID}-${providerCalls}` } });
    }

    throw new Error(`Unhandled provider fixture: ${method} ${url}`);
  }) as typeof fetch;
}

function paystackSignature(body: string) {
  return createHmac("sha512", PROVIDER_SECRET).update(body).digest("hex");
}

function paystackEvent(reference: string, eventId: string) {
  const body = JSON.stringify({
    event: "charge.success",
    data: { id: eventId, reference, amount: Number(TOTAL_KOBO), currency: "NGN", status: "success" }
  });
  return { body, headers: new Headers({ "x-paystack-signature": paystackSignature(body) }) };
}

/* ------------------------------------------------------------- fixtures --- */

async function ensureCity(prisma: PrismaClient) {
  await prisma.citySetting.upsert({
    where: { countryCode_code: { countryCode: "NG", code: "lagos" } },
    update: { name: "Lagos", enabled: true },
    create: { countryCode: "NG", code: "lagos", name: "Lagos", enabled: true }
  });
}

async function createScenario(
  prisma: PrismaClient,
  label: string,
  options: { fundKobo?: bigint; provider: "wallet" | "paystack" }
): Promise<Scenario> {
  const { ensureWallet, initializePayment, confirmPayment } = await import("../lib/payments/service");
  const { checkout } = await import("../lib/services/core/checkout.service");
  const { createTopUp, creditTopUp } = await import("../lib/services/core/topup.service");
  const lower = RUN_ID.toLowerCase();

  const user = await prisma.user.create({
    data: { email: `esc-${RUN_ID}-${label}@example.test`, name: `Escrow acceptance ${label}`, actorType: "CUSTOMER" }
  });
  const vendorOwner = await prisma.user.create({
    data: { email: `esc-${RUN_ID}-${label}-owner@example.test`, name: `Escrow acceptance ${label} owner`, actorType: "VENDOR" }
  });
  const vendor = await prisma.vendor.create({
    data: {
      ownerId: vendorOwner.id,
      name: `Escrow acceptance vendor ${RUN_ID} ${label}`,
      slug: `esc-vendor-${lower}-${label}`,
      market: "Isolated acceptance fixture market",
      description: "Isolated escrow completion fixture. Not a real vendor.",
      pickupAddress: "1 Acceptance Fixture Way, Lagos",
      pickupPhone: "+2348000000000",
      status: "VERIFIED",
      commissionBps: 1000
    }
  });
  const category = await prisma.category.create({
    data: { name: `Escrow acceptance category ${RUN_ID} ${label}`, slug: `esc-category-${lower}-${label}` }
  });
  const product = await prisma.product.create({
    data: {
      vendorId: vendor.id,
      categoryId: category.id,
      name: `Escrow acceptance product ${RUN_ID} ${label}`,
      slug: `esc-product-${lower}-${label}`,
      description: "Isolated escrow completion fixture product.",
      priceKobo: SUBTOTAL_KOBO,
      status: "ACTIVE",
      isSample: false,
      stock: { create: { quantity: 5, reserved: 0 } }
    }
  });
  const cart = await prisma.cart.create({
    data: { userId: user.id, status: "ACTIVE", items: { create: { productId: product.id, quantity: 1 } } }
  });
  const wallet = await ensureWallet(prisma, { userId: user.id, ownerType: "CUSTOMER" });

  if (options.fundKobo && options.fundKobo > BigInt(0)) {
    const key = `esc-topup-${RUN_ID}-${label}`;
    const topUp = await createTopUp(prisma, {
      walletId: wallet.id,
      amountKobo: options.fundKobo,
      provider: "test",
      providerReference: `TEST-${key}`,
      idempotencyKey: key
    });
    const credited = await creditTopUp(prisma, {
      providerReference: topUp.topUp.providerReference,
      verifiedAmountKobo: options.fundKobo,
      verifiedCurrency: "NGN",
      raw: { simulated: true, note: "Escrow completion acceptance TEST funding. Not a real payment." }
    });
    assert(credited.status === "credited", `${label}: funding was not credited`);
  }

  const created = await checkout({
    userId: user.id,
    address: {
      contactName: `Escrow acceptance ${label}`,
      contactPhone: "08000000000",
      countryCode: "NG",
      state: "Lagos",
      city: "Lagos",
      line1: "1 Acceptance Fixture Way"
    }
  });
  assert(created.orders.length === 1, `${label}: checkout must create one order`);
  const order = created.orders[0];
  assert(BigInt(order.totalKobo) === TOTAL_KOBO, `${label}: checkout total ${order.totalKobo}`);

  const init = await initializePayment({
    orderId: order.orderId,
    userId: user.id,
    provider: options.provider,
    callbackUrl: "http://localhost/orders/callback"
  });

  if (options.provider === "wallet") {
    const paid = await confirmPayment({ reference: init.reference, provider: "wallet" });
    assert(paid.status === "COMPLETED", `${label}: wallet payment did not complete`);
  } else {
    const event = paystackEvent(init.reference, `${RUN_ID}-${label}-success`);
    await (await import("../lib/payments/service")).processWebhook("paystack", event.body, event.headers);
  }

  const payment = await prisma.payment.findFirstOrThrow({
    where: { orderId: order.orderId, status: "COMPLETED" }
  });

  return {
    label,
    userId: user.id,
    walletId: wallet.id,
    vendorOwnerId: vendorOwner.id,
    vendorId: vendor.id,
    categoryId: category.id,
    productId: product.id,
    cartId: cart.id,
    orderId: order.orderId,
    orderNumber: order.orderNumber,
    paymentId: payment.id,
    reference: init.reference,
    provider: options.provider,
    totalKobo: BigInt(order.totalKobo)
  };
}

async function readWallet(prisma: PrismaClient, walletId: string) {
  return prisma.wallet.findUniqueOrThrow({
    where: { id: walletId },
    select: { id: true, availableKobo: true, heldKobo: true }
  });
}

async function vendorWallet(prisma: PrismaClient, scenario: Scenario) {
  const wallet = await prisma.wallet.findFirstOrThrow({
    where: { vendorId: scenario.vendorId, ownerType: "VENDOR" }
  });
  return readWallet(prisma, wallet.id);
}

async function orderState(prisma: PrismaClient, orderId: string) {
  return prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { payments: true, escrowHolds: true, refunds: true, statusEvents: true }
  });
}

async function deliverOrder(prisma: PrismaClient, scenario: Scenario) {
  const { updateOrderStatus } = await import("../lib/services/core/order.service");
  const flow = ["accepted", "preparing", "ready_for_pickup", "courier_assigned", "picked_up", "in_transit", "delivered"] as const;
  for (const status of flow) {
    await updateOrderStatus({
      actorId: scenario.userId,
      orderId: scenario.orderId,
      status,
      note: `Escrow completion acceptance transition to ${status}.`
    });
  }
}

function statusOf(promise: Promise<unknown>) {
  return promise.then(
    (value) => ({ ok: true as const, status: 200, code: "ok", value }),
    (error: { status?: number; code?: string; message?: string }) => ({
      ok: false as const,
      status: error.status ?? 500,
      code: error.code ?? "unknown",
      value: null,
      message: (error.message ?? String(error)).slice(0, 200)
    })
  );
}

/* ---------------------------------------------------------- projections --- */

async function walletProjection(prisma: PrismaClient, walletId: string) {
  const { loadOpenHoldLedger, compareWalletProjection } = await import(
    "../lib/services/core/reconciliation-correct"
  );
  const [wallet, entries, holds] = await Promise.all([
    readWallet(prisma, walletId),
    prisma.ledgerEntry.findMany({ where: { walletId }, select: { direction: true, amountKobo: true } }),
    loadOpenHoldLedger(prisma)
  ]);
  const ledgerNet = entries.reduce(
    (sum, entry) => sum + (entry.direction === "CREDIT" ? entry.amountKobo : -entry.amountKobo),
    BigInt(0)
  );
  const projection = compareWalletProjection({
    walletId,
    availableKobo: wallet.availableKobo,
    heldKobo: wallet.heldKobo,
    ledgerNetKobo: ledgerNet,
    holds
  });
  return { wallet, ledgerNet, projection };
}

async function assertStage(
  prisma: PrismaClient,
  stage: string,
  scenario: Scenario,
  walletIds: { buyer: string; vendor: string; system: string }
) {
  const { reconcile } = await import("../lib/services/core/reconciliation-correct");
  const projections = await Promise.all(
    Object.entries(walletIds).map(async ([role, walletId]) => [role, await walletProjection(prisma, walletId)] as const)
  );
  const mismatched = projections.filter(
    ([, value]) =>
      value.projection.availableDifferenceKobo !== BigInt(0) || value.projection.heldDifferenceKobo !== BigInt(0)
  );
  const negativeHeld = projections.filter(([, value]) => value.wallet.heldKobo < BigInt(0));
  record(
    `${scenario.label} / ${stage}: every involved wallet projection matches its journal`,
    mismatched.length === 0,
    mismatched
      .map(
        ([role, value]) =>
          `${role} available diff ${value.projection.availableDifferenceKobo}, held diff ${value.projection.heldDifferenceKobo}`
      )
      .join("; ") || "0 kobo difference"
  );
  record(
    `${scenario.label} / ${stage}: no wallet has negative held funds`,
    negativeHeld.length === 0,
    negativeHeld.map(([role, value]) => `${role} ${value.wallet.heldKobo}`).join(", ") || "all held >= 0"
  );
  const book = await reconcile();
  record(
    `${scenario.label} / ${stage}: whole-book reconciliation has no issues`,
    book.issues.length === 0,
    book.issues.length === 0 ? "CLEAN" : book.issues.slice(0, 3).map((issue) => `${issue.kind}:${issue.subject}`).join("; ")
  );
  return { projections: Object.fromEntries(projections) };
}

async function releaseTransactions(prisma: PrismaClient, orderId: string) {
  return prisma.walletTransaction.findMany({
    where: { orderId, type: "release" },
    include: { ledger: true }
  });
}

async function platformCreditsFor(prisma: PrismaClient, orderId: string, systemWalletId: string) {
  const transactions = await releaseTransactions(prisma, orderId);
  return transactions
    .flatMap((transaction) => transaction.ledger)
    .filter((leg) => leg.walletId === systemWalletId && leg.direction === "CREDIT")
    .reduce((sum, leg) => sum + leg.amountKobo, BigInt(0));
}

/* --------------------------------------------------------------- tests --- */

async function walletPartialThenComplete(prisma: PrismaClient, systemId: string) {
  const { completeOrder } = await import("../lib/services/core/order.service");
  const { refundPayment } = await import("../lib/payments/service");
  const scenario = await createScenario(prisma, "wallet-partial", { fundKobo: FUNDING_KOBO, provider: "wallet" });
  const walletIds = { buyer: scenario.walletId, vendor: (await vendorWallet(prisma, scenario)).id, system: systemId };

  let state = await assertStage(prisma, "paid", scenario, walletIds);
  record(
    `${scenario.label}: wallet payment holds the full order total`,
    state.projections.buyer.wallet.availableKobo === BigInt(20_000) &&
      state.projections.buyer.wallet.heldKobo === TOTAL_KOBO &&
      state.projections.vendor.wallet.heldKobo === TOTAL_KOBO,
    `buyer ${JSON.stringify(snapshot(state.projections.buyer.wallet))}, vendor held ${state.projections.vendor.wallet.heldKobo}`
  );
  const escrowPaid = (await orderState(prisma, scenario.orderId)).escrowHolds[0];
  record(
    `${scenario.label}: the customer wallet is the buyer of record for a wallet payment`,
    escrowPaid?.buyerWalletId === scenario.walletId && escrowPaid?.amountKobo === TOTAL_KOBO,
    `escrow buyer ${escrowPaid?.buyerWalletId}, amount ${escrowPaid?.amountKobo}`
  );

  await refundPayment({
    orderId: scenario.orderId,
    actorId: scenario.userId,
    reason: "Wallet partial before completion.",
    amountKobo: BigInt(55_000),
    idempotencyKey: `esc-wallet-partial-${RUN_ID}`
  });
  state = await assertStage(prisma, "partial refund", scenario, walletIds);
  const orderAfterPartial = await orderState(prisma, scenario.orderId);
  record(
    `${scenario.label}: the partial refund reduces both holds without touching the escrow amount`,
    orderAfterPartial.refundedKobo === BigInt(55_000) &&
      orderAfterPartial.escrowHolds[0]?.amountKobo === TOTAL_KOBO &&
      orderAfterPartial.escrowHolds[0]?.status === "held" &&
      state.projections.buyer.wallet.availableKobo === BigInt(75_000) &&
      state.projections.buyer.wallet.heldKobo === BigInt(100_000) &&
      state.projections.vendor.wallet.heldKobo === BigInt(100_000),
    `refunded ${orderAfterPartial.refundedKobo}, escrow ${orderAfterPartial.escrowHolds[0]?.amountKobo}/${orderAfterPartial.escrowHolds[0]?.status}, buyer ${JSON.stringify(snapshot(state.projections.buyer.wallet))}, vendor held ${state.projections.vendor.wallet.heldKobo}`
  );

  await deliverOrder(prisma, scenario);
  const completion = await completeOrder(scenario.userId, scenario.orderId);
  state = await assertStage(prisma, "completion", scenario, walletIds);
  const escrowAfter = (await orderState(prisma, scenario.orderId)).escrowHolds[0];
  const releases = await releaseTransactions(prisma, scenario.orderId);
  record(
    `${scenario.label}: completion releases only the remaining obligation`,
    completion.payableKobo === "99650" &&
      state.projections.vendor.wallet.availableKobo === BigInt(99_650) &&
      state.projections.vendor.wallet.heldKobo === BigInt(0) &&
      state.projections.buyer.wallet.heldKobo === BigInt(0) &&
      escrowAfter?.status === "released" &&
      releases.length === 1 &&
      releases[0].amountKobo === BigInt(99_650) &&
      releases[0].ledger.reduce((sum, leg) => sum + (leg.direction === "DEBIT" ? -leg.amountKobo : leg.amountKobo), BigInt(0)) === BigInt(0),
    `payable ${completion.payableKobo}, vendor ${JSON.stringify(snapshot(state.projections.vendor.wallet))}, escrow ${escrowAfter?.status}, release rows ${releases.length}`
  );
  record(
    `${scenario.label}: no excess release and no duplicate earnings`,
    state.projections.vendor.wallet.availableKobo === BigInt(99_650) &&
      state.projections.vendor.wallet.availableKobo < PAYABLE_KOBO &&
      releases.reduce((sum, transaction) => sum + transaction.amountKobo, BigInt(0)) === BigInt(99_650),
    `vendor available ${state.projections.vendor.wallet.availableKobo}, cumulative release ${releases.reduce((sum, transaction) => sum + transaction.amountKobo, BigInt(0))}`
  );

  const replay = await completeOrder(scenario.userId, scenario.orderId);
  const afterReplay = await assertStage(prisma, "duplicate completion", scenario, walletIds);
  record(
    `${scenario.label}: duplicate completion is idempotent and moves no money`,
    replay.duplicate === true &&
      replay.payableKobo === "99650" &&
      afterReplay.projections.vendor.wallet.availableKobo === BigInt(99_650) &&
      (await releaseTransactions(prisma, scenario.orderId)).length === 1,
    `duplicate ${replay.duplicate}, payable ${replay.payableKobo}, vendor ${afterReplay.projections.vendor.wallet.availableKobo}`
  );

  return scenario;
}

async function walletMultiplePartialsThenComplete(prisma: PrismaClient, systemId: string) {
  const { completeOrder } = await import("../lib/services/core/order.service");
  const { refundPayment } = await import("../lib/payments/service");
  const scenario = await createScenario(prisma, "wallet-multi", { fundKobo: FUNDING_KOBO, provider: "wallet" });
  const walletIds = { buyer: scenario.walletId, vendor: (await vendorWallet(prisma, scenario)).id, system: systemId };

  await refundPayment({
    orderId: scenario.orderId,
    actorId: scenario.userId,
    reason: "First wallet partial.",
    amountKobo: BigInt(40_000),
    idempotencyKey: `esc-wallet-multi-a-${RUN_ID}`
  });
  await refundPayment({
    orderId: scenario.orderId,
    actorId: scenario.userId,
    reason: "Second wallet partial.",
    amountKobo: BigInt(30_000),
    idempotencyKey: `esc-wallet-multi-b-${RUN_ID}`
  });
  const stateAfterRefunds = await assertStage(prisma, "two partial refunds", scenario, walletIds);
  const orderAfterRefunds = await orderState(prisma, scenario.orderId);
  record(
    `${scenario.label}: two partial refunds accumulate against the order`,
    orderAfterRefunds.refundedKobo === BigInt(70_000) &&
      orderAfterRefunds.paymentStatus === "partially_refunded" &&
      stateAfterRefunds.projections.buyer.wallet.availableKobo === BigInt(90_000) &&
      stateAfterRefunds.projections.buyer.wallet.heldKobo === BigInt(85_000) &&
      stateAfterRefunds.projections.vendor.wallet.heldKobo === BigInt(85_000),
    `refunded ${orderAfterRefunds.refundedKobo}, buyer ${JSON.stringify(snapshot(stateAfterRefunds.projections.buyer.wallet))}, vendor held ${stateAfterRefunds.projections.vendor.wallet.heldKobo}`
  );

  await deliverOrder(prisma, scenario);
  const completion = await completeOrder(scenario.userId, scenario.orderId);
  const final = await assertStage(prisma, "completion after two partials", scenario, walletIds);
  const platformCredits = await platformCreditsFor(prisma, scenario.orderId, systemId);
  record(
    `${scenario.label}: completion after multiple partials pays the exact remaining share`,
    completion.payableKobo === "84702" &&
      final.projections.vendor.wallet.availableKobo === BigInt(84_702) &&
      final.projections.buyer.wallet.availableKobo === BigInt(90_000) &&
      final.projections.buyer.wallet.heldKobo === BigInt(0) &&
      platformCredits === BigInt(298) &&
      final.projections.buyer.wallet.availableKobo + final.projections.vendor.wallet.availableKobo + platformCredits === FUNDING_KOBO,
    `payable ${completion.payableKobo}, buyer ${final.projections.buyer.wallet.availableKobo}, vendor ${final.projections.vendor.wallet.availableKobo}, platform ${platformCredits}, sum ${final.projections.buyer.wallet.availableKobo + final.projections.vendor.wallet.availableKobo + platformCredits}`
  );

  return scenario;
}

async function walletFullRefundThenCompleteAttempt(prisma: PrismaClient, systemId: string) {
  const { completeOrder } = await import("../lib/services/core/order.service");
  const { refundPayment } = await import("../lib/payments/service");
  const scenario = await createScenario(prisma, "wallet-full", { fundKobo: FUNDING_KOBO, provider: "wallet" });
  const walletIds = { buyer: scenario.walletId, vendor: (await vendorWallet(prisma, scenario)).id, system: systemId };

  await refundPayment({
    orderId: scenario.orderId,
    actorId: scenario.userId,
    reason: "First refund toward a full refund.",
    amountKobo: BigInt(100_000),
    idempotencyKey: `esc-wallet-full-a-${RUN_ID}`
  });
  await refundPayment({
    orderId: scenario.orderId,
    actorId: scenario.userId,
    reason: "Remaining refund closes the order.",
    idempotencyKey: `esc-wallet-full-b-${RUN_ID}`
  });
  const state = await assertStage(prisma, "full refund", scenario, walletIds);
  const order = await orderState(prisma, scenario.orderId);
  record(
    `${scenario.label}: the final refund closes payment and escrow`,
    order.paymentStatus === "refunded" &&
      order.status === "refunded" &&
      order.escrowHolds[0]?.status === "refunded" &&
      order.refundedKobo === TOTAL_KOBO &&
      state.projections.buyer.wallet.availableKobo === FUNDING_KOBO &&
      state.projections.buyer.wallet.heldKobo === BigInt(0) &&
      state.projections.vendor.wallet.heldKobo === BigInt(0) &&
      state.projections.vendor.wallet.availableKobo === BigInt(0),
    `order ${order.status}/${order.paymentStatus}, escrow ${order.escrowHolds[0]?.status}, buyer ${JSON.stringify(snapshot(state.projections.buyer.wallet))}, vendor ${JSON.stringify(snapshot(state.projections.vendor.wallet))}`
  );

  await deliverOrder(prisma, scenario).catch(() => undefined);
  const attempt = await statusOf(completeOrder(scenario.userId, scenario.orderId));
  const afterAttempt = await assertStage(prisma, "completion after full refund", scenario, walletIds);
  record(
    `${scenario.label}: completion after a full refund is refused with no release`,
    attempt.status === 409 &&
      ["not_delivered", "order_closed"].includes(attempt.code) &&
      (await releaseTransactions(prisma, scenario.orderId)).length === 0 &&
      afterAttempt.projections.buyer.wallet.availableKobo === FUNDING_KOBO &&
      afterAttempt.projections.vendor.wallet.availableKobo === BigInt(0),
    `${attempt.status} ${attempt.code}, release rows ${(await releaseTransactions(prisma, scenario.orderId)).length}, buyer ${afterAttempt.projections.buyer.wallet.availableKobo}, vendor ${afterAttempt.projections.vendor.wallet.availableKobo}`
  );

  return scenario;
}

async function walletCompletionRacingRefund(prisma: PrismaClient, systemId: string) {
  const { completeOrder } = await import("../lib/services/core/order.service");
  const { refundPayment } = await import("../lib/payments/service");
  const scenario = await createScenario(prisma, "wallet-race", { fundKobo: FUNDING_KOBO, provider: "wallet" });
  const walletIds = { buyer: scenario.walletId, vendor: (await vendorWallet(prisma, scenario)).id, system: systemId };
  await deliverOrder(prisma, scenario);

  const [completion, refund] = await Promise.allSettled([
    completeOrder(scenario.userId, scenario.orderId),
    refundPayment({
      orderId: scenario.orderId,
      actorId: scenario.userId,
      reason: "Refund racing completion.",
      amountKobo: BigInt(55_000),
      idempotencyKey: `esc-wallet-race-${RUN_ID}`
    })
  ]);
  const state = await assertStage(prisma, "completion racing refund", scenario, walletIds);
  const releases = await releaseTransactions(prisma, scenario.orderId);
  const platformCredits = await platformCreditsFor(prisma, scenario.orderId, systemId);
  const releasesOnce = releases.length === 1;
  const completionFirst =
    completion.status === "fulfilled" &&
    releasesOnce &&
    releases[0].amountKobo === PAYABLE_KOBO &&
    state.projections.vendor.wallet.availableKobo === PAYABLE_KOBO &&
    state.projections.buyer.wallet.availableKobo === BigInt(20_000) &&
    platformCredits === BigInt(544) &&
    refund.status === "rejected" &&
    ((refund.reason as { code?: string }).code ?? "") === "refund_conflict";
  const refundFirst =
    completion.status === "fulfilled" &&
    refund.status === "fulfilled" &&
    releasesOnce &&
    releases[0].amountKobo === BigInt(99_650) &&
    state.projections.vendor.wallet.availableKobo === BigInt(99_650) &&
    state.projections.buyer.wallet.availableKobo === BigInt(75_000) &&
    platformCredits === BigInt(350);
  record(
    `${scenario.label}: racing writers conserve the order with exactly one release`,
    completionFirst || refundFirst,
    `completion ${completion.status}, refund ${refund.status}, release ${releases.map((row) => row.amountKobo).join(",")}, buyer ${state.projections.buyer.wallet.availableKobo}, vendor ${state.projections.vendor.wallet.availableKobo}, platform ${platformCredits}`
  );
  record(
    `${scenario.label}: the two valid race outcomes return the whole funded balance`,
    completionFirst || refundFirst
      ? (completionFirst ? BigInt(20_000) + PAYABLE_KOBO + BigInt(544) : BigInt(75_000) + BigInt(99_650) + BigInt(350)) ===
        FUNDING_KOBO
      : false,
    `buyer ${state.projections.buyer.wallet.availableKobo} + vendor ${state.projections.vendor.wallet.availableKobo} + platform ${platformCredits}`
  );
  const duplicate = await completeOrder(scenario.userId, scenario.orderId);
  const afterDuplicate = await assertStage(prisma, "race duplicate completion", scenario, walletIds);
  record(
    `${scenario.label}: a follow-up duplicate completion adds nothing after the race`,
    duplicate.duplicate === true &&
      (await releaseTransactions(prisma, scenario.orderId)).length === 1 &&
      afterDuplicate.projections.vendor.wallet.availableKobo === state.projections.vendor.wallet.availableKobo,
    `duplicate ${duplicate.duplicate}, release rows ${(await releaseTransactions(prisma, scenario.orderId)).length}`
  );

  return scenario;
}

async function walletConcurrentDuplicateCompletion(prisma: PrismaClient, systemId: string) {
  const { completeOrder } = await import("../lib/services/core/order.service");
  const scenario = await createScenario(prisma, "wallet-double", { fundKobo: FUNDING_KOBO, provider: "wallet" });
  const walletIds = { buyer: scenario.walletId, vendor: (await vendorWallet(prisma, scenario)).id, system: systemId };
  await deliverOrder(prisma, scenario);

  const [a, b] = await Promise.all([
    completeOrder(scenario.userId, scenario.orderId),
    completeOrder(scenario.userId, scenario.orderId)
  ]);
  const state = await assertStage(prisma, "concurrent duplicate completion", scenario, walletIds);
  record(
    `${scenario.label}: two simultaneous completions release exactly once`,
    (a.duplicate !== b.duplicate) &&
      state.projections.vendor.wallet.availableKobo === PAYABLE_KOBO &&
      (await releaseTransactions(prisma, scenario.orderId)).length === 1,
    `duplicates ${a.duplicate}/${b.duplicate}, vendor ${state.projections.vendor.wallet.availableKobo}, release rows ${(await releaseTransactions(prisma, scenario.orderId)).length}`
  );

  return scenario;
}

async function externalEscrowLifecycle(prisma: PrismaClient, systemId: string) {
  const systemPreScenario = snapshot(await readWallet(prisma, systemId));
  const scenario = await createScenario(prisma, "external", { provider: "paystack" });
  const systemBefore = await assertStage(prisma, "external escrow creation", scenario, {
    buyer: scenario.walletId,
    vendor: (await vendorWallet(prisma, scenario)).id,
    system: systemId
  });
  const order = await orderState(prisma, scenario.orderId);
  const escrow = order.escrowHolds[0];
  record(
    `${scenario.label}: verified external payment creates one platform-held escrow`,
    order.payments.filter((payment) => payment.status === "COMPLETED").length === 1 &&
      order.escrowHolds.length === 1 &&
      escrow?.status === "held" &&
      escrow?.buyerWalletId === systemId &&
      escrow?.amountKobo === TOTAL_KOBO &&
      systemBefore.projections.system.wallet.availableKobo === BigInt(systemPreScenario.available) - TOTAL_KOBO &&
      systemBefore.projections.system.wallet.heldKobo === BigInt(systemPreScenario.held) + TOTAL_KOBO &&
      systemBefore.projections.vendor.wallet.heldKobo === TOTAL_KOBO &&
      systemBefore.projections.buyer.wallet.availableKobo === BigInt(0) &&
      systemBefore.projections.buyer.wallet.heldKobo === BigInt(0),
    `escrow buyer ${escrow?.buyerWalletId}, SYSTEM ${JSON.stringify(snapshot(systemBefore.projections.system.wallet))}, vendor held ${systemBefore.projections.vendor.wallet.heldKobo}`
  );

  const { processWebhook } = await import("../lib/payments/service");
  const replayEvent = paystackEvent(scenario.reference, `${RUN_ID}-external-success`);
  const duplicate = await processWebhook("paystack", replayEvent.body, replayEvent.headers);
  const duplicateState = await assertStage(prisma, "duplicate confirmation", scenario, {
    buyer: scenario.walletId,
    vendor: (await vendorWallet(prisma, scenario)).id,
    system: systemId
  });
  const afterDuplicate = await orderState(prisma, scenario.orderId);
  record(
    `${scenario.label}: duplicate confirmation is a no-op with one escrow and one journal`,
    duplicate.duplicate === true &&
      afterDuplicate.escrowHolds.length === 1 &&
      (await prisma.walletTransaction.count({ where: { orderId: scenario.orderId, type: "hold" } })) === 1 &&
      duplicateState.projections.system.wallet.availableKobo === systemBefore.projections.system.wallet.availableKobo &&
      duplicateState.projections.system.wallet.heldKobo === systemBefore.projections.system.wallet.heldKobo,
    `duplicate ${duplicate.duplicate}, escrows ${afterDuplicate.escrowHolds.length}, SYSTEM ${JSON.stringify(snapshot(duplicateState.projections.system.wallet))}`
  );

  const { refundPayment, confirmPayment } = await import("../lib/payments/service");
  await refundPayment({
    orderId: scenario.orderId,
    actorId: scenario.userId,
    reason: "External partial before completion.",
    amountKobo: BigInt(55_000),
    idempotencyKey: `esc-external-partial-${RUN_ID}`
  });
  const afterRefund = await assertStage(prisma, "external partial refund", scenario, {
    buyer: scenario.walletId,
    vendor: (await vendorWallet(prisma, scenario)).id,
    system: systemId
  });
  const refundOrder = await orderState(prisma, scenario.orderId);
  record(
    `${scenario.label}: the external refund reverses the platform hold and the vendor hold`,
    refundOrder.refundedKobo === BigInt(55_000) &&
      refundOrder.escrowHolds[0]?.status === "held" &&
      afterRefund.projections.system.wallet.heldKobo === BigInt(systemPreScenario.held) + BigInt(100_000) &&
      afterRefund.projections.vendor.wallet.heldKobo === BigInt(100_000) &&
      afterRefund.projections.vendor.wallet.availableKobo === BigInt(0),
    `refunded ${refundOrder.refundedKobo}, SYSTEM held ${afterRefund.projections.system.wallet.heldKobo}, vendor held ${afterRefund.projections.vendor.wallet.heldKobo}`
  );

  await deliverOrder(prisma, scenario);
  const { completeOrder } = await import("../lib/services/core/order.service");
  const completion = await completeOrder(scenario.userId, scenario.orderId);
  const finalState = await assertStage(prisma, "external completion", scenario, {
    buyer: scenario.walletId,
    vendor: (await vendorWallet(prisma, scenario)).id,
    system: systemId
  });
  const platformCredits = await platformCreditsFor(prisma, scenario.orderId, systemId);
  record(
    `${scenario.label}: external completion pays the remaining payable and reconciles`,
    completion.payableKobo === "99650" &&
      finalState.projections.system.wallet.heldKobo === BigInt(systemPreScenario.held) &&
      finalState.projections.vendor.wallet.availableKobo === BigInt(99_650) &&
      finalState.projections.vendor.wallet.heldKobo === BigInt(0) &&
      platformCredits === BigInt(350) &&
      finalState.projections.system.wallet.availableKobo === finalState.projections.system.projection.expectedAvailableKobo,
    `payable ${completion.payableKobo}, SYSTEM ${JSON.stringify(snapshot(finalState.projections.system.wallet))}, vendor ${JSON.stringify(snapshot(finalState.projections.vendor.wallet))}, platform ${platformCredits}`
  );

  const replay = await confirmPayment({ reference: scenario.reference, provider: "paystack" });
  record(
    `${scenario.label}: provider confirmation replay after settlement is a duplicate`,
    replay.duplicate === true,
    `duplicate ${replay.duplicate}`
  );

  return scenario;
}

async function externalFullRefundThenCompleteAttempt(prisma: PrismaClient, systemId: string) {
  const { refundPayment } = await import("../lib/payments/service");
  const { completeOrder } = await import("../lib/services/core/order.service");
  const systemAtStart = await readWallet(prisma, systemId);
  const scenario = await createScenario(prisma, "external-full", { provider: "paystack" });
  const walletIds = { buyer: scenario.walletId, vendor: (await vendorWallet(prisma, scenario)).id, system: systemId };

  await refundPayment({
    orderId: scenario.orderId,
    actorId: scenario.userId,
    reason: "External partial toward full.",
    amountKobo: BigInt(100_000),
    idempotencyKey: `esc-external-full-a-${RUN_ID}`
  });
  await refundPayment({
    orderId: scenario.orderId,
    actorId: scenario.userId,
    reason: "External remaining refund.",
    idempotencyKey: `esc-external-full-b-${RUN_ID}`
  });
  const state = await assertStage(prisma, "external full refund", scenario, walletIds);
  const order = await orderState(prisma, scenario.orderId);
  record(
    `${scenario.label}: a full external refund closes escrow and restores the platform position`,
    order.paymentStatus === "refunded" &&
      order.status === "refunded" &&
      order.escrowHolds[0]?.status === "refunded" &&
      state.projections.system.wallet.availableKobo === systemAtStart.availableKobo &&
      state.projections.system.wallet.heldKobo === systemAtStart.heldKobo &&
      state.projections.vendor.wallet.heldKobo === BigInt(0) &&
      state.projections.vendor.wallet.availableKobo === BigInt(0),
    `order ${order.status}/${order.paymentStatus}, escrow ${order.escrowHolds[0]?.status}, SYSTEM ${JSON.stringify(snapshot(state.projections.system.wallet))}`
  );

  const attempt = await statusOf(completeOrder(scenario.userId, scenario.orderId));
  const afterAttempt = await assertStage(prisma, "external completion after full refund", scenario, walletIds);
  record(
    `${scenario.label}: completion after the full external refund is refused with no release`,
    attempt.status === 409 &&
      (await releaseTransactions(prisma, scenario.orderId)).length === 0 &&
      afterAttempt.projections.system.wallet.availableKobo === systemAtStart.availableKobo &&
      afterAttempt.projections.system.wallet.heldKobo === systemAtStart.heldKobo,
    `${attempt.status} ${attempt.code}, release rows ${(await releaseTransactions(prisma, scenario.orderId)).length}`
  );

  return scenario;
}

async function externalCancellation(prisma: PrismaClient, systemId: string) {
  const { adminUpdateOrderStatus } = await import("../lib/services/core/admin.service");
  const systemAtStart = await readWallet(prisma, systemId);
  const scenario = await createScenario(prisma, "external-cancel", { provider: "paystack" });
  const walletIds = { buyer: scenario.walletId, vendor: (await vendorWallet(prisma, scenario)).id, system: systemId };

  const result = (await adminUpdateOrderStatus({
    adminId: scenario.vendorOwnerId,
    orderId: scenario.orderId,
    status: "cancelled",
    note: "Escrow acceptance: cancel a paid external order."
  })) as { refundedKobo?: string };
  const state = await assertStage(prisma, "external cancellation", scenario, walletIds);
  const order = await orderState(prisma, scenario.orderId);
  const stock = await prisma.inventoryStock.findUniqueOrThrow({ where: { productId: scenario.productId } });
  record(
    `${scenario.label}: cancelling a paid external order refunds fully and restocks`,
    result.refundedKobo === TOTAL_KOBO.toString() &&
      order.status === "refunded" &&
      order.paymentStatus === "refunded" &&
      order.escrowHolds[0]?.status === "refunded" &&
      state.projections.system.wallet.availableKobo === systemAtStart.availableKobo &&
      state.projections.system.wallet.heldKobo === systemAtStart.heldKobo &&
      state.projections.vendor.wallet.heldKobo === BigInt(0) &&
      stock.quantity === 5 &&
      stock.reserved === 0,
    `refund ${result.refundedKobo}, order ${order.status}/${order.paymentStatus}, escrow ${order.escrowHolds[0]?.status}, stock ${stock.quantity}/${stock.reserved}`
  );

  return scenario;
}

async function externalPendingRefundRacingCompletion(prisma: PrismaClient, systemId: string) {
  const { refundPayment } = await import("../lib/payments/service");
  const { completeOrder } = await import("../lib/services/core/order.service");
  const systemPreScenario = snapshot(await readWallet(prisma, systemId));
  const scenario = await createScenario(prisma, "external-race", { provider: "paystack" });
  const walletIds = { buyer: scenario.walletId, vendor: (await vendorWallet(prisma, scenario)).id, system: systemId };
  await deliverOrder(prisma, scenario);
  const beforeRace = await assertStage(prisma, "external race start", scenario, walletIds);
  const vendorBeforeRace = await vendorWallet(prisma, scenario);

  holdRefundResponses();
  const refundPromise = refundPayment({
    orderId: scenario.orderId,
    actorId: scenario.userId,
    reason: "External refund held at the provider.",
    amountKobo: BigInt(55_000),
    idempotencyKey: `esc-external-race-${RUN_ID}`
  });
  // Wait until the claim is committed and the provider call is pending.
  const deadline = Date.now() + 10_000;
  let pending = null;
  while (Date.now() < deadline) {
    pending = await prisma.refund.findFirst({ where: { orderId: scenario.orderId, status: "PENDING" } });
    if (pending) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert(pending, "the external refund claim never became pending");

  const duringRefund = await statusOf(completeOrder(scenario.userId, scenario.orderId));
  const buyerDuring = await readWallet(prisma, scenario.walletId);
  const vendorDuring = await vendorWallet(prisma, scenario);
  const systemDuring = await readWallet(prisma, systemId);
  record(
    `${scenario.label}: completion refuses while an external refund is unconfirmed`,
    duringRefund.status === 409 &&
      duringRefund.code === "refund_pending" &&
      (await releaseTransactions(prisma, scenario.orderId)).length === 0 &&
      systemDuring.availableKobo === beforeRace.projections.system.wallet.availableKobo &&
      systemDuring.heldKobo === beforeRace.projections.system.wallet.heldKobo &&
      vendorDuring.availableKobo === vendorBeforeRace.availableKobo &&
      vendorDuring.heldKobo === vendorBeforeRace.heldKobo &&
      buyerDuring.availableKobo === BigInt(0) &&
      buyerDuring.heldKobo === BigInt(0),
    `${duringRefund.status} ${duringRefund.code}, SYSTEM ${JSON.stringify(snapshot(systemDuring))}, vendor ${JSON.stringify(snapshot(vendorDuring))}`
  );
  // The claim has not moved money yet, so the held position equals the journal.
  // The shared exposure formula reads `refundedKobo`, which already includes the
  // reservation; that temporary divergence is documented as a limitation rather
  // than asserted as a settled stage.
  record(
    `${scenario.label}: a pending external claim moves no wallet balance`,
    vendorDuring.heldKobo === BigInt(155_000) &&
      buyerDuring.availableKobo === BigInt(0) &&
      systemDuring.heldKobo === beforeRace.projections.system.wallet.heldKobo,
    `vendor held ${vendorDuring.heldKobo}, buyer ${buyerDuring.availableKobo}/${buyerDuring.heldKobo}, SYSTEM held ${systemDuring.heldKobo}`
  );

  releaseRefundResponses();
  const refund = await refundPromise;
  record(
    `${scenario.label}: the held external refund settles once released`,
    refund.refundedKobo === "55000",
    `refunded ${refund.refundedKobo}`
  );

  const completion = await completeOrder(scenario.userId, scenario.orderId);
  const finalState = await assertStage(prisma, "external race completion", scenario, walletIds);
  record(
    `${scenario.label}: completion after the pending refund settles releases only the remainder`,
    completion.payableKobo === "99650" &&
      finalState.projections.system.wallet.heldKobo === BigInt(systemPreScenario.held) &&
      finalState.projections.vendor.wallet.availableKobo === BigInt(99_650) &&
      (await releaseTransactions(prisma, scenario.orderId)).length === 1,
    `payable ${completion.payableKobo}, SYSTEM held ${finalState.projections.system.wallet.heldKobo}, vendor ${finalState.projections.vendor.wallet.availableKobo}`
  );

  return scenario;
}

async function completionMathRegression() {
  const { releaseObligation } = await import("../lib/services/core/order.service");
  const clean = releaseObligation({
    escrowAmountKobo: TOTAL_KOBO,
    orderTotalKobo: TOTAL_KOBO,
    payableKobo: PAYABLE_KOBO,
    completedRefundKobo: BigInt(0)
  });
  const partial = releaseObligation({
    escrowAmountKobo: TOTAL_KOBO,
    orderTotalKobo: TOTAL_KOBO,
    payableKobo: PAYABLE_KOBO,
    completedRefundKobo: BigInt(55_000)
  });
  const full = releaseObligation({
    escrowAmountKobo: TOTAL_KOBO,
    orderTotalKobo: TOTAL_KOBO,
    payableKobo: PAYABLE_KOBO,
    completedRefundKobo: TOTAL_KOBO
  });
  const over = releaseObligation({
    escrowAmountKobo: TOTAL_KOBO,
    orderTotalKobo: TOTAL_KOBO,
    payableKobo: PAYABLE_KOBO,
    completedRefundKobo: TOTAL_KOBO + BigInt(1)
  });
  record(
    "release obligation derives the remainder from frozen amounts and completed refunds",
    clean.releasableKobo === TOTAL_KOBO &&
      clean.payableKobo === PAYABLE_KOBO &&
      clean.platformKobo === TOTAL_KOBO - PAYABLE_KOBO &&
      partial.releasableKobo === BigInt(100_000) &&
      partial.payableKobo === BigInt(99_650) &&
      partial.platformKobo === BigInt(350) &&
      full.releasableKobo === BigInt(0) &&
      full.payableKobo === BigInt(0) &&
      over.releasableKobo === BigInt(0) &&
      over.payableKobo === BigInt(0),
    `clean ${clean.releasableKobo}/${clean.payableKobo}, partial ${partial.releasableKobo}/${partial.payableKobo}/${partial.platformKobo}, full ${full.releasableKobo}/${full.payableKobo}, over ${over.releasableKobo}/${over.payableKobo}`
  );
}

/* --------------------------------------------------------------- cleanup --- */

async function cleanupRun(prisma: PrismaClient, systemSnapshot: WalletSnapshot) {
  const emailPrefix = `esc-${RUN_ID}-`;
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
  const refunds = await prisma.refund.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } });
  const refundIds = refunds.map((row) => row.id);
  const wallets = await prisma.wallet.findMany({
    where: { OR: [{ userId: { in: userIds } }, { vendorId: { in: vendorIds } }] },
    select: { id: true }
  });
  const walletIds = wallets.map((row) => row.id);
  const topUps = await prisma.walletTopUp.findMany({ where: { walletId: { in: walletIds } }, select: { id: true } });
  const topUpIds = topUps.map((row) => row.id);
  const transactions = await prisma.walletTransaction.findMany({
    where: {
      OR: [{ walletId: { in: walletIds } }, { reference: { contains: RUN_ID } }, { orderId: { in: orderIds } }]
    },
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
    ...refundIds,
    ...productIds,
    ...vendorIds,
    ...categoryIds,
    ...transactionIds,
    ...topUpIds,
    ...walletIds
  ];

  const system = await prisma.wallet.findFirstOrThrow({ where: { ownerType: "SYSTEM" }, select: { id: true } });

  await prisma.$transaction(async (tx) => {
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
    await tx.review.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.returnRequest.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.refund.deleteMany({ where: { id: { in: refundIds } } });
    await tx.escrowEvent.deleteMany({ where: { escrowId: { in: escrowIds } } });
    await tx.escrowHold.deleteMany({ where: { id: { in: escrowIds } } });
    await tx.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.orderStatusEvent.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.orderAttribution.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.ledgerEntry.deleteMany({
      where: { OR: [{ transactionId: { in: transactionIds } }, { walletId: { in: walletIds } }] }
    });
    await tx.walletTransaction.deleteMany({ where: { id: { in: transactionIds } } });
    await tx.order.deleteMany({ where: { id: { in: orderIds } } });
    await tx.cartItem.deleteMany({ where: { cartId: { in: cartIds } } });
    await tx.cart.deleteMany({ where: { id: { in: cartIds } } });
    await tx.walletTopUp.deleteMany({ where: { id: { in: topUpIds } } });
    await tx.wallet.deleteMany({ where: { id: { in: walletIds } } });
    await tx.auditLog.deleteMany({
      where: { OR: [{ actorId: { in: userIds } }, { entityId: { in: entityIds } }] }
    });
    await tx.systemEvent.deleteMany({
      where: { OR: [{ actorId: { in: userIds } }, { entityId: { in: entityIds } }] }
    });
    // Admin closure now records an AdminAction in addition to the refund audit;
    // remove the fixture rows before deleting the referenced user.
    await tx.adminAction.deleteMany({
      where: { OR: [{ adminId: { in: userIds } }, { entityId: { in: entityIds } }] }
    });
    await tx.inventoryStock.deleteMany({ where: { productId: { in: productIds } } });
    await tx.productImage.deleteMany({ where: { productId: { in: productIds } } });
    await tx.product.deleteMany({ where: { id: { in: productIds } } });
    await tx.vendor.deleteMany({ where: { id: { in: vendorIds } } });
    await tx.category.deleteMany({ where: { id: { in: categoryIds } } });
    await tx.session.deleteMany({ where: { userId: { in: userIds } } });
    await tx.address.deleteMany({ where: { userId: { in: userIds } } });
    await tx.user.deleteMany({ where: { id: { in: userIds } } });
    // Test-fixture isolation: restore the platform wallet captured before the
    // run, exactly. This is cleanup of test money, never a production repair.
    await tx.wallet.update({
      where: { id: system.id },
      data: { availableKobo: BigInt(systemSnapshot.available), heldKobo: BigInt(systemSnapshot.held) }
    });
  }, { timeout: 120_000 });

  const leftovers =
    (await prisma.user.count({ where: { email: { startsWith: emailPrefix } } })) +
    (await prisma.order.count({ where: { id: { in: orderIds } } })) +
    (await prisma.walletTransaction.count({ where: { id: { in: transactionIds } } })) +
    (await prisma.refund.count({ where: { id: { in: refundIds } } })) +
    (await prisma.webhookEvent.count({ where: { eventId: { contains: RUN_ID } } }));
  return { users: userIds.length, wallets: walletIds.length, orders: orderIds.length, refunds: refundIds.length, leftovers };
}

/* ------------------------------------------------------------------ main --- */

async function main(prisma: PrismaClient, url: string) {
  const { ensureWallet } = await import("../lib/payments/service");
  const { reconcile } = await import("../lib/services/core/reconciliation-correct");

  const db = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  assert(db[0]?.db === DB, `wrong database ${db[0]?.db ?? "unknown"}, expected ${DB}`);
  await ensureCity(prisma);

  const system = await ensureWallet(prisma, { ownerType: "SYSTEM" });
  const systemSnapshot = snapshot(await readWallet(prisma, system.id));
  const systemWalletId = system.id;

  await completionMathRegression();
  await walletPartialThenComplete(prisma, systemWalletId);
  await walletMultiplePartialsThenComplete(prisma, systemWalletId);
  await walletFullRefundThenCompleteAttempt(prisma, systemWalletId);
  await walletCompletionRacingRefund(prisma, systemWalletId);
  await walletConcurrentDuplicateCompletion(prisma, systemWalletId);
  await externalEscrowLifecycle(prisma, systemWalletId);
  await externalFullRefundThenCompleteAttempt(prisma, systemWalletId);
  await externalCancellation(prisma, systemWalletId);
  await externalPendingRefundRacingCompletion(prisma, systemWalletId);

  /* ---- cleanup and whole-book reconciliation ---- */
  const cleanup = await cleanupRun(prisma, systemSnapshot);
  const systemAfter = await readWallet(prisma, systemWalletId);
  const book = await reconcile();
  const reconcileCli = spawnSync(
    process.execPath,
    [TSX_CLI, path.join(REPO_ROOT, "scripts", "wallet-reconcile.ts")],
    {
      cwd: REPO_ROOT,
      env: { ...testDatabaseChildEnv(url), RECONCILE_DB: DB, VALKEY_URL: "" },
      encoding: "utf8",
      timeout: 180_000
    }
  );
  let reconcileReport: { status?: string; mismatches?: number } = {};
  try {
    reconcileReport = JSON.parse(reconcileCli.stdout);
  } catch {
    reconcileReport = {};
  }
  record(
    "fixture cleanup removes every run row and restores the exact SYSTEM position",
    cleanup.leftovers === 0 &&
      systemAfter.availableKobo === BigInt(systemSnapshot.available) &&
      systemAfter.heldKobo === BigInt(systemSnapshot.held),
    `leftovers ${cleanup.leftovers}, SYSTEM ${JSON.stringify(systemSnapshot)} -> ${JSON.stringify(snapshot(systemAfter))}`
  );
  record(
    "whole-book reconciliation is clean after cleanup",
    book.issues.length === 0 && reconcileReport.status === "CLEAN",
    `issues ${book.issues.length}, cli ${reconcileReport.status ?? reconcileCli.status}`
  );

  console.log(
    JSON.stringify(
      {
        runId: RUN_ID,
        database: DB,
        providerCalls,
        checks,
        failures,
        cleanup,
        system: { before: systemSnapshot, after: snapshot(systemAfter) },
        reconciliation: { issues: book.issues.length, totals: book.totals },
        reconcileCli: reconcileReport,
        status: failures === 0 ? "PASS" : "FAIL"
      },
      (key, value) => (typeof value === "bigint" ? value.toString() : value),
      2
    )
  );
}

async function run() {
  process.env.VALKEY_URL = "";
  process.env.PAYSTACK_SECRET_KEY = PROVIDER_SECRET;
  installProviderMock();
  const url = (await requireTestDatabase()).url;
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const { ensureWallet } = await import("../lib/payments/service");
  const system = await ensureWallet(prisma, { ownerType: "SYSTEM" });
  const systemSnapshot = snapshot(await readWallet(prisma, system.id));
  try {
    await main(prisma, url);
  } catch (error) {
    try {
      await cleanupRun(prisma, systemSnapshot);
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
