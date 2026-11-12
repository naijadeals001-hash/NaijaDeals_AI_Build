import "dotenv/config";
import { randomUUID } from "node:crypto";
import { inspect } from "node:util";
import { prisma } from "../lib/prisma";
import { refundPayment } from "../lib/payments/service";
import { processReversalIntents, reversalReferenceFor } from "../lib/services/affiliate/reversal-processor";
import { settleConversion } from "../lib/services/affiliate/settlement";
import { createLink, recordConversion, resolveTouch, updateConversionState } from "../lib/services/affiliate/service";
import { requireTestDatabase } from "./lib/test-db-guard";

/**
 * Settlement versus refund-driven reversal, through the real refund workflow.
 *
 *   npx tsx scripts/affiliate-settlement-race.ts
 *
 * refundPayment writes a durable AffiliateReversalIntent inside the transaction
 * that confirms the customer refund. This suite drives that intent with the real
 * processReversalIntents worker path next to settleConversion, in both
 * deterministic orders and under genuine overlap:
 *
 *   A. settlement commits first, then the intent is swept            (settled branch)
 *   B. the intent is swept while the conversion is APPROVED, then settlement
 *      pays the full commission while the recorded debt keeps the net position
 *      equal to commission minus the reversal                       (unsettled branch)
 *   C. settleConversion and processReversalIntents run concurrently on three
 *      fresh fixtures, then a second sweep drains any retry         (both branches)
 *
 * Fixtures mirror scripts/affiliate-refund-integration.ts: a completed paid order
 * with held escrow, a funded buyer wallet, an approved affiliate, an ACTIVE
 * campaign, a tracked link, a conversion created by recordConversion, then
 * refundPayment. The wallet provider is used instead of the emulated test
 * adapter: it is the server-verified capture path the handoff records as
 * authoritative, and a refund then debits a real escrow hold rather than a
 * simulated provider response or the shared SYSTEM wallet's accumulated balance.
 *
 * The target is the disposable affiliate database. The guard reads the ACTUAL
 * current_database(), not DATABASE_URL. There is no teardown: every fixture is
 * keyed by a unique run id, so a leftover row cannot be mistaken for this run's,
 * and a partial run leaves nothing that needs repair.
 */

const REQUIRED_DB = "naijadeals_affiliate_test";
const runId = randomUUID().slice(0, 8);

const ORDER_TOTAL = 5_000_000n; // kobo
const COMMISSION_BPS = 500;
const COMMISSION = (ORDER_TOTAL * BigInt(COMMISSION_BPS)) / 10_000n; // 250_000n
const CAMPAIGN_BUDGET = 100_000_000n;

const rows: { name: string; status: "PASS" | "FAIL"; detail: string }[] = [];
const built: Fixture[] = [];

type Fixture = {
  label: string;
  tag: string;
  orderId: string;
  orderNumber: string;
  customerId: string;
  affiliateUserId: string;
  conversionId: string;
  campaignId: string;
  refundId: string;
  intentId: string;
  refundKobo: bigint;
  expectedReversalKobo: bigint;
  campaignSpentAfterAccrual: bigint;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function describeError(error: unknown): string {
  // util.inspect with showHidden reaches Prisma's code/meta/clientVersion, which
  // are not always enumerable; JSON.stringify loses them and cannot handle BigInt.
  const redact = (text: string) => {
    const cut = text.indexOf("postgresql:");
    return (cut >= 0 ? text.slice(0, cut) + "postgresql:[redacted]" : text).slice(0, 1500);
  };
  try {
    const props = error && typeof error === "object" ? Object.getOwnPropertyNames(error) : [];
    const inspected = inspect(error, { depth: 4, showHidden: true, breakLength: 200, maxArrayLength: 10 });
    return redact(`props=[${props.join(",")}] ${inspected}`);
  } catch {
    return redact(`uninspectable thrown value: ${String(error)}`);
  }
}

async function check(name: string, run: () => Promise<string>) {
  try {
    rows.push({ name, status: "PASS", detail: await run() });
  } catch (error) {
    rows.push({ name, status: "FAIL", detail: describeError(error) });
  }
}

async function walletKobo(userId: string): Promise<bigint> {
  const wallet = await prisma.wallet.findFirst({ where: { userId, ownerType: "CUSTOMER" } });
  return wallet?.availableKobo ?? 0n;
}

async function affiliateWalletId(userId: string): Promise<string> {
  const wallet = await prisma.wallet.findFirst({ where: { userId, ownerType: "CUSTOMER" } });
  assert(wallet, `no affiliate wallet exists for ${userId}`);
  return wallet.id;
}

/**
 * One isolated fixture: paid order + held escrow, funded buyer wallet, approved
 * affiliate, ACTIVE campaign, link, conversion created through recordConversion,
 * state APPROVED, then a confirmed refund via refundPayment.
 *
 * Every email/slug/order number/reference carries the run id and a per-fixture
 * suffix, so a concurrent sweep or another run cannot consume this fixture.
 */
async function buildFixture(label: string, refundKobo: bigint): Promise<Fixture> {
  const tag = `${runId}-${label.toLowerCase()}-${randomUUID().slice(0, 4)}`;

  const customer = await prisma.user.create({
    data: { email: `race-customer-${tag}@example.test`, name: `Race customer ${tag}`, actorType: "CUSTOMER" }
  });
  const owner = await prisma.user.create({
    data: { email: `race-owner-${tag}@example.test`, name: `Race vendor owner ${tag}`, actorType: "VENDOR" }
  });
  const affiliateUser = await prisma.user.create({
    data: { email: `race-affiliate-${tag}@example.test`, name: `Race affiliate ${tag}`, actorType: "CUSTOMER" }
  });

  // The buyer wallet is funded and already holds the escrow a wallet capture
  // would have moved there (available -= total, held += total).
  const customerWallet = await prisma.wallet.create({
    data: {
      userId: customer.id,
      ownerType: "CUSTOMER",
      currency: "NGN",
      availableKobo: 5_000_000n,
      heldKobo: ORDER_TOTAL
    }
  });

  const vendor = await prisma.vendor.create({
    data: {
      ownerId: owner.id,
      name: `Race vendor ${tag}`,
      slug: `race-vendor-${tag}`,
      market: "Balogun",
      pickupAddress: "Balogun Market, Lagos",
      pickupPhone: "08012345678",
      status: "VERIFIED"
    }
  });
  const category = await prisma.category.create({
    data: { name: `Race category ${tag}`, slug: `race-category-${tag}` }
  });
  const product = await prisma.product.create({
    data: {
      vendorId: vendor.id,
      categoryId: category.id,
      name: `Race product ${tag}`,
      slug: `race-product-${tag}`,
      description: "Settlement versus refund-reversal race fixture",
      priceKobo: ORDER_TOTAL,
      status: "ACTIVE",
      stock: { create: { quantity: 10, reserved: 0 } }
    }
  });

  const orderNumber = `RACE-${tag.toUpperCase()}`;
  const order = await prisma.order.create({
    data: {
      orderNumber,
      customerId: customer.id,
      vendorId: vendor.id,
      status: "completed",
      paymentStatus: "paid",
      subtotalKobo: ORDER_TOTAL,
      totalKobo: ORDER_TOTAL,
      commissionKobo: 500_000n,
      deliveryFeeKobo: 0n,
      escrowFeeKobo: 0n,
      deliveryAddress: "12 Broad Street, Lagos",
      contactName: `Race customer ${tag}`,
      contactPhone: "08012345678",
      items: {
        create: [
          {
            productId: product.id,
            quantity: 1,
            unitKobo: ORDER_TOTAL,
            totalKobo: ORDER_TOTAL,
            productName: `Race product ${tag}`
          }
        ]
      }
    }
  });
  await prisma.payment.create({
    data: {
      orderId: order.id,
      provider: "wallet",
      providerReference: `WALLET-RACE-${tag}`,
      idempotencyKey: `race-payment-${tag}`,
      amountKobo: ORDER_TOTAL,
      currency: "NGN",
      status: "COMPLETED"
    }
  });
  const vendorWallet = await prisma.wallet.create({
    data: {
      vendorId: vendor.id,
      ownerType: "VENDOR",
      currency: "NGN",
      availableKobo: 0n,
      heldKobo: ORDER_TOTAL
    }
  });
  await prisma.escrowHold.create({
    data: {
      orderId: order.id,
      buyerWalletId: customerWallet.id,
      vendorWalletId: vendorWallet.id,
      amountKobo: ORDER_TOTAL,
      status: "held",
      reason: `race fixture ${tag}`
    }
  });

  const campaign = await prisma.affiliateCampaign.create({
    data: {
      slug: `race-campaign-${tag}`,
      name: `Race campaign ${tag}`,
      vertical: "shop",
      status: "ACTIVE",
      funding: "PLATFORM",
      commissionBps: COMMISSION_BPS,
      budgetKobo: CAMPAIGN_BUDGET,
      // 0 so reversibleUntil is creation time: the conversion is settleable now.
      attributionDays: 0,
      commissionBasis: "SUBTOTAL",
      ruleVersion: 1
    }
  });
  const affiliate = await prisma.affiliateProfile.create({
    data: {
      userId: affiliateUser.id,
      status: "APPROVED",
      termsVersion: "race",
      termsAcceptedAt: new Date(),
      approvedAt: new Date()
    }
  });
  const link = await createLink({
    affiliateId: affiliate.id,
    campaignId: campaign.id,
    destination: "/product/race-fixture"
  });
  const visitorKey = `race-visitor-${tag}`;
  const touch = await resolveTouch({ code: link.code, visitorKey, consent: true });
  assert(touch, "resolveTouch returned null for an active campaign and approved affiliate");

  const recorded = await recordConversion({
    entityType: "Order",
    entityId: order.id,
    basisKobo: ORDER_TOTAL,
    visitorKey
  });
  assert(recorded.created, `recordConversion refused: ${recorded.created ? "" : recorded.reason}`);
  await updateConversionState({ actorId: customer.id, conversionId: recorded.conversion.id, to: "VALIDATING" });
  await updateConversionState({ actorId: customer.id, conversionId: recorded.conversion.id, to: "APPROVED" });

  const conversion = await prisma.affiliateConversion.findUniqueOrThrow({ where: { id: recorded.conversion.id } });
  assert(conversion.state === "APPROVED", `fixture conversion state ${conversion.state}`);
  assert(conversion.basisType === "SUBTOTAL", `fixture basisType ${conversion.basisType}`);
  assert(conversion.amountKobo === COMMISSION, `fixture commission ${conversion.amountKobo}, expected ${COMMISSION}`);
  const campaignAfterAccrual = await prisma.affiliateCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
  assert(
    campaignAfterAccrual.spentKobo === COMMISSION,
    `fixture campaign spent ${campaignAfterAccrual.spentKobo}, expected ${COMMISSION}`
  );

  // The refund must go through the service: the intent is written inside the
  // transaction that moves the refund to COMPLETED, never inserted by hand.
  const refund = await refundPayment({
    orderId: order.id,
    actorId: customer.id,
    reason: `race ${label} refund`,
    amountKobo: refundKobo,
    idempotencyKey: `race-refund-${tag}`
  });
  const confirmed = await prisma.refund.findUniqueOrThrow({ where: { id: refund.refundId } });
  assert(confirmed.status === "COMPLETED", `refund ${refund.refundId} is ${confirmed.status}`);
  const intent = await prisma.affiliateReversalIntent.findFirstOrThrow({
    where: { orderId: order.id },
    orderBy: { createdAt: "desc" }
  });
  assert(intent.refundId === refund.refundId, "the intent is not tied to the confirmed refund");
  assert(intent.state === "PENDING", `intent ${intent.id} state ${intent.state}, expected PENDING`);
  assert(
    intent.eligibleKobo === refundKobo,
    `intent ${intent.id} eligible ${intent.eligibleKobo}, expected ${refundKobo} for a SUBTOTAL == TOTAL order`
  );

  const fixture: Fixture = {
    label,
    tag,
    orderId: order.id,
    orderNumber,
    customerId: customer.id,
    affiliateUserId: affiliateUser.id,
    conversionId: conversion.id,
    campaignId: campaign.id,
    refundId: refund.refundId,
    intentId: intent.id,
    refundKobo,
    expectedReversalKobo: (refundKobo * BigInt(COMMISSION_BPS)) / 10_000n,
    campaignSpentAfterAccrual: campaignAfterAccrual.spentKobo
  };
  built.push(fixture);
  return fixture;
}

async function main() {
  // Fail closed before the first query: the target must be named by
  // TEST_DATABASE_URL and carry a TEST marker. Never fall back to .env DATABASE_URL.
  await requireTestDatabase();
  const database = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  const actual = database[0]?.db ?? "";
  console.log("database:", actual);
  console.log("run:", runId);
  if (actual !== REQUIRED_DB) {
    console.error(`Refusing to run: connected to "${actual}", expected "${REQUIRED_DB}".`);
    await prisma.$disconnect();
    process.exit(2);
  }

  await check("A. settlement first: settleConversion then processReversalIntents", async () => {
    const fixture = await buildFixture("A", 2_500_000n);

    const settle = await settleConversion({ actorId: fixture.customerId, conversionId: fixture.conversionId });
    assert(settle.settled, `settlement refused: ${"reason" in settle ? settle.reason : "unknown"}`);
    assert(settle.amountKobo === COMMISSION.toString(), `settlement paid ${settle.amountKobo}, expected ${COMMISSION}`);
    const paid = await prisma.affiliateConversion.findUniqueOrThrow({ where: { id: fixture.conversionId } });
    assert(paid.state === "PAID", `conversion after settlement ${paid.state}, expected PAID`);
    const walletAfterSettlement = await walletKobo(fixture.affiliateUserId);
    assert(walletAfterSettlement === COMMISSION, `wallet after settlement ${walletAfterSettlement}, expected ${COMMISSION}`);
    const campaignBeforeReversal = await prisma.affiliateCampaign.findUniqueOrThrow({ where: { id: fixture.campaignId } });

    const batch = await processReversalIntents(`settle-first-${fixture.tag}`, 200);
    const drain = await processReversalIntents(`settle-first-drain-${fixture.tag}`, 200);

    const refund = await prisma.refund.findUniqueOrThrow({ where: { id: fixture.refundId } });
    const intent = await prisma.affiliateReversalIntent.findUniqueOrThrow({ where: { id: fixture.intentId } });
    const ops = await prisma.affiliateReversalOperation.findMany({ where: { conversionId: fixture.conversionId } });
    const conversion = await prisma.affiliateConversion.findUniqueOrThrow({ where: { id: fixture.conversionId } });

    assert(refund.status === "COMPLETED", `refund ${refund.id} is ${refund.status}`);
    assert(conversion.state === "PAID", `conversion state ${conversion.state}, expected PAID`);
    assert(
      ops.length === 1,
      `${ops.length} operations for conversion ${fixture.conversionId} (intent ${intent.id} state ${intent.state}, lastError ${intent.lastError})`
    );
    const op = ops.at(0);
    assert(op, "the operation row is missing");
    assert(op.opKey === reversalReferenceFor(intent.id), `operation key ${op.opKey}, expected ${reversalReferenceFor(intent.id)}`);
    assert(intent.state === "DONE", `intent ${intent.id} state ${intent.state}, lastError ${intent.lastError}`);
    assert(op.requestedKobo === fixture.expectedReversalKobo, `requested ${op.requestedKobo}, expected ${fixture.expectedReversalKobo}`);
    assert(
      op.recoveredKobo + op.debtKobo === op.requestedKobo,
      `recovered ${op.recoveredKobo} + debt ${op.debtKobo} != requested ${op.requestedKobo}`
    );

    const walletAfter = await walletKobo(fixture.affiliateUserId);
    assert(
      walletAfter === COMMISSION - op.recoveredKobo,
      `affiliate wallet ${walletAfter}, expected commission ${COMMISSION} - recovered ${op.recoveredKobo} = ${COMMISSION - op.recoveredKobo}`
    );

    // One journal transaction per reference: the settlement and the reversal must
    // each appear exactly once, so a replay cannot post a second one.
    const settlementTxs = await prisma.walletTransaction.count({ where: { reference: `AFF-COMM-${fixture.conversionId}` } });
    const reversalTxs = await prisma.walletTransaction.count({ where: { reference: reversalReferenceFor(intent.id) } });
    assert(settlementTxs === 1, `${settlementTxs} settlement transactions for AFF-COMM-${fixture.conversionId}`);
    assert(
      reversalTxs === (op.recoveredKobo > 0n ? 1 : 0),
      `${reversalTxs} reversal transactions for ${reversalReferenceFor(intent.id)}, expected ${op.recoveredKobo > 0n ? 1 : 0} (recovered ${op.recoveredKobo})`
    );
    if (op.recoveredKobo > 0n) {
      const reversalTx = await prisma.walletTransaction.findUniqueOrThrow({
        where: { reference: reversalReferenceFor(intent.id) },
        include: { ledger: true }
      });
      const debit = reversalTx.ledger
        .filter((entry) => entry.direction === "DEBIT")
        .reduce((sum, entry) => sum + entry.amountKobo, 0n);
      const credit = reversalTx.ledger
        .filter((entry) => entry.direction === "CREDIT")
        .reduce((sum, entry) => sum + entry.amountKobo, 0n);
      assert(
        debit === op.recoveredKobo && credit === op.recoveredKobo,
        `reversal journal debit ${debit} credit ${credit}, recovered ${op.recoveredKobo}`
      );
      const affiliateWallet = await affiliateWalletId(fixture.affiliateUserId);
      const platformWallet = await prisma.wallet.findFirstOrThrow({ where: { ownerType: "SYSTEM" } });
      assert(
        reversalTx.ledger.some(
          (entry) => entry.walletId === affiliateWallet && entry.direction === "DEBIT" && entry.amountKobo === op.recoveredKobo
        ),
        "the reversal does not debit the affiliate wallet"
      );
      assert(
        reversalTx.ledger.some(
          (entry) => entry.walletId === platformWallet.id && entry.direction === "CREDIT" && entry.amountKobo === op.recoveredKobo
        ),
        "the reversal does not credit the platform wallet"
      );
    }

    // Budget: a reversal releases exactly one adjustment's worth of campaign
    // spent, whether it is applied before or after settlement.
    const campaignAfter = await prisma.affiliateCampaign.findUniqueOrThrow({ where: { id: fixture.campaignId } });
    const budgetReleased = campaignBeforeReversal.spentKobo - campaignAfter.spentKobo;
    assert(
      budgetReleased === op.requestedKobo,
      `campaign ${fixture.campaignId} spentKobo ${campaignBeforeReversal.spentKobo} -> ${campaignAfter.spentKobo} (delta ${budgetReleased}); expected exactly one decrement of ${op.requestedKobo} for intent ${intent.id} (state ${intent.state}, lastError ${intent.lastError}) and operation ${op.id} (recovered ${op.recoveredKobo}, debt ${op.debtKobo})`
    );

    return `refund COMPLETED; conversion PAID; 1 op requested ${op.requestedKobo} recovered ${op.recoveredKobo} debt ${op.debtKobo}; intent DONE; wallet ${walletAfterSettlement} -> ${walletAfter}; campaign spent ${campaignAfter.spentKobo}; batch ${JSON.stringify(batch)} drain ${JSON.stringify(drain)}`;
  });

  await check("B. reversal first: processReversalIntents on APPROVED, then settleConversion", async () => {
    const fixture = await buildFixture("B", 2_000_000n);
    const campaignBefore = await prisma.affiliateCampaign.findUniqueOrThrow({ where: { id: fixture.campaignId } });
    const walletBefore = await walletKobo(fixture.affiliateUserId);

    const batch = await processReversalIntents(`reversal-first-${fixture.tag}`, 200);
    const intent = await prisma.affiliateReversalIntent.findUniqueOrThrow({ where: { id: fixture.intentId } });
    const ops = await prisma.affiliateReversalOperation.findMany({ where: { conversionId: fixture.conversionId } });

    assert(intent.state === "DONE", `intent ${intent.id} state ${intent.state}, lastError ${intent.lastError}`);
    assert(ops.length === 1, `${ops.length} operations (batch ${JSON.stringify(batch)})`);
    const op = ops.at(0);
    assert(op, "the operation row is missing");
    assert(op.opKey === reversalReferenceFor(intent.id), `operation key ${op.opKey}, expected ${reversalReferenceFor(intent.id)}`);
    assert(op.requestedKobo === fixture.expectedReversalKobo, `requested ${op.requestedKobo}, expected ${fixture.expectedReversalKobo}`);
    assert(op.recoveredKobo === 0n, `unsettled reversal recovered ${op.recoveredKobo}; no settled cash existed to recover`);
    assert(op.debtKobo === op.requestedKobo, `debt ${op.debtKobo}, expected ${op.requestedKobo}`);

    const conversionBeforeSettlement = await prisma.affiliateConversion.findUniqueOrThrow({ where: { id: fixture.conversionId } });
    assert(
      conversionBeforeSettlement.state === "APPROVED",
      `conversion after the unsettled reversal is ${conversionBeforeSettlement.state}, expected APPROVED for a partial reversal`
    );
    const campaignMid = await prisma.affiliateCampaign.findUniqueOrThrow({ where: { id: fixture.campaignId } });
    assert(
      campaignBefore.spentKobo - campaignMid.spentKobo === op.requestedKobo,
      `campaign spentKobo ${campaignBefore.spentKobo} -> ${campaignMid.spentKobo}, expected one release of ${op.requestedKobo}`
    );
    // The unsettled branch records the claw-back on the operation itself; no
    // AffiliateRecovery receivable exists before anything has been paid. The
    // count is reported so the ledger shape is visible, not assumed.
    const recoveries = await prisma.affiliateRecovery.findMany({ where: { conversionId: fixture.conversionId } });
    const receivableKobo = recoveries.reduce((sum, row) => sum + row.amountKobo, 0n);
    const walletMid = await walletKobo(fixture.affiliateUserId);
    assert(walletMid === walletBefore, `wallet moved ${walletBefore} -> ${walletMid} on an unsettled reversal`);
    const unsettledTxs = await prisma.walletTransaction.count({ where: { reference: reversalReferenceFor(intent.id) } });
    assert(unsettledTxs === 0, `${unsettledTxs} ledger transactions for an unsettled reversal`);

    const settle = await settleConversion({ actorId: fixture.customerId, conversionId: fixture.conversionId });
    if (!settle.settled) throw new Error(`settlement refused: ${"reason" in settle ? settle.reason : "unknown"}`);
    assert(
      settle.offsetKobo === op.requestedKobo.toString(),
      `settlement offset ${settle.offsetKobo}, expected the outstanding debt ${op.requestedKobo}`
    );
    assert(
      settle.paidKobo === (COMMISSION - op.requestedKobo).toString(),
      `settlement paid ${settle.paidKobo}, expected commission minus debt ${COMMISSION - op.requestedKobo}`
    );
    const conversionAfter = await prisma.affiliateConversion.findUniqueOrThrow({ where: { id: fixture.conversionId } });
    assert(conversionAfter.state === "PAID", `conversion state ${conversionAfter.state}, expected PAID`);
    const walletAfter = await walletKobo(fixture.affiliateUserId);
    assert(
      walletAfter === COMMISSION - op.requestedKobo,
      `affiliate wallet ${walletAfter}, expected commission minus offset ${COMMISSION - op.requestedKobo}`
    );

    // The debt was netted against the payout, so the affiliate's net position is
    // commission minus the reversal and no receivable remains open.
    const recoveryAfter = await prisma.affiliateRecovery.findMany({ where: { conversionId: fixture.conversionId } });
    const openAfter = recoveryAfter.filter((row) => row.state === "OUTSTANDING");
    assert(openAfter.length === 0, `${openAfter.length} recoveries still outstanding after offset`);
    assert(
      walletAfter === COMMISSION - op.requestedKobo,
      `net ${walletAfter} != commission ${COMMISSION} - reversal ${op.requestedKobo}`
    );

    // A sweep after settlement must not apply the reversal a second time or
    // release budget again.
    const drain = await processReversalIntents(`reversal-first-drain-${fixture.tag}`, 200);
    const campaignAfter = await prisma.affiliateCampaign.findUniqueOrThrow({ where: { id: fixture.campaignId } });
    const budgetDecremented = campaignBefore.spentKobo - campaignAfter.spentKobo;
    assert(
      budgetDecremented === op.requestedKobo,
      `campaign budget decremented ${budgetDecremented}, expected exactly once by ${op.requestedKobo}`
    );
    const opsAfterDrain = await prisma.affiliateReversalOperation.count({ where: { conversionId: fixture.conversionId } });
    assert(opsAfterDrain === 1, `${opsAfterDrain} operations after the post-settlement sweep, expected 1`);
    const walletAfterDrain = await walletKobo(fixture.affiliateUserId);
    assert(walletAfterDrain === walletAfter, `wallet moved ${walletAfter} -> ${walletAfterDrain} on the post-settlement sweep`);

    return `refund COMPLETED; unsettled op requested ${op.requestedKobo} recovered ${op.recoveredKobo} debt ${op.debtKobo} (receivable rows ${recoveries.length}, total ${receivableKobo}); intent DONE; settlement offset ${settle.offsetKobo} paid ${settle.paidKobo}; wallet ${walletAfter}; campaign spent ${campaignAfter.spentKobo}; drain ${JSON.stringify(drain)}`;
  });

  async function overlapCheck(index: number): Promise<string> {
    const fixture = await buildFixture(`C${index}`, ORDER_TOTAL);
    const campaignBefore = await prisma.affiliateCampaign.findUniqueOrThrow({ where: { id: fixture.campaignId } });
    const walletBefore = await walletKobo(fixture.affiliateUserId);

    const [settle, batch] = await Promise.all([
      settleConversion({ actorId: fixture.customerId, conversionId: fixture.conversionId }),
      processReversalIntents(`race-${index}-${fixture.tag}`, 50)
    ]);
    // The first sweep may have hit the settlement window and left the intent
    // PENDING with retry:settlement_contended; this is the worker's next pass.
    const drain = await processReversalIntents(`race-drain-${index}-${fixture.tag}`, 50);

    const refund = await prisma.refund.findUniqueOrThrow({ where: { id: fixture.refundId } });
    const intent = await prisma.affiliateReversalIntent.findUniqueOrThrow({ where: { id: fixture.intentId } });
    const ops = await prisma.affiliateReversalOperation.findMany({ where: { conversionId: fixture.conversionId } });
    const conversion = await prisma.affiliateConversion.findUniqueOrThrow({ where: { id: fixture.conversionId } });
    const campaignAfter = await prisma.affiliateCampaign.findUniqueOrThrow({ where: { id: fixture.campaignId } });
    const walletAfter = await walletKobo(fixture.affiliateUserId);

    assert(refund.status === "COMPLETED", `refund ${refund.id} is ${refund.status}`);
    assert(
      intent.state === "DONE",
      `intent ${intent.id} state ${intent.state}, lastError ${intent.lastError}; settle=${JSON.stringify(settle)} batch=${JSON.stringify(batch)} drain=${JSON.stringify(drain)}`
    );
    assert(
      ops.length === 1,
      `${ops.length} operations for conversion ${fixture.conversionId} (intent ${intent.id} state ${intent.state})`
    );
    const op = ops.at(0);
    assert(op, "the operation row is missing");
    assert(op.opKey === reversalReferenceFor(intent.id), `operation key ${op.opKey}, expected ${reversalReferenceFor(intent.id)}`);
    assert(op.requestedKobo === fixture.expectedReversalKobo, `requested ${op.requestedKobo}, expected ${fixture.expectedReversalKobo}`);
    assert(
      op.recoveredKobo + op.debtKobo === op.requestedKobo,
      `recovered ${op.recoveredKobo} + debt ${op.debtKobo} != requested ${op.requestedKobo}`
    );
    assert(
      intent.lastError !== "zero_adjustment" && intent.lastError !== "no_attributed_conversion",
      `intent ${intent.id} completed without an operation: ${intent.lastError}`
    );

    const campaignReleased = campaignBefore.spentKobo - campaignAfter.spentKobo;
    if (settle.settled) {
      assert(conversion.state === "REVERSED", `settlement won but conversion state ${conversion.state}, expected REVERSED`);
      assert(
        walletAfter === COMMISSION - op.recoveredKobo,
        `affiliate wallet ${walletAfter}, expected commission ${COMMISSION} - recovered ${op.recoveredKobo}`
      );
      // A settled reversal takes money back, so it must release the budget it
      // claimed; otherwise reversed commission permanently consumes campaign
      // headroom.
      assert(
        campaignReleased === op.requestedKobo,
        `campaign budget released ${campaignReleased}, expected ${op.requestedKobo}`
      );
      return `${fixture.label}: settlement won (${settle.amountKobo}); op requested ${op.requestedKobo} recovered ${op.recoveredKobo} debt ${op.debtKobo}; wallet ${walletAfter}; campaign spent ${campaignAfter.spentKobo}; intent DONE`;
    }

    const reason = settle.reason;
    assert(
      reason === "state_reversed" || reason === "already_claimed",
      `settlement refused with ${reason}; expected the reversal to have won`
    );
    assert(conversion.state === "REVERSED", `reversal won but conversion state ${conversion.state}, expected REVERSED`);
    assert(op.recoveredKobo === 0n, `unsettled reversal recovered ${op.recoveredKobo}; no settled cash existed to recover`);
    assert(walletAfter === walletBefore, `wallet moved ${walletBefore} -> ${walletAfter} although settlement did not pay`);
    assert(
      campaignReleased === op.requestedKobo,
      `campaign budget released ${campaignReleased}, expected ${op.requestedKobo} for the unsettled reversal`
    );
    return `${fixture.label}: reversal won (settlement ${reason}); op requested ${op.requestedKobo} recovered ${op.recoveredKobo} debt ${op.debtKobo}; wallet ${walletAfter}; campaign spent ${campaignAfter.spentKobo}; intent DONE`;
  }

  await check("C1. true overlap: settlement and sweep race on a fresh fixture", () => overlapCheck(1));
  await check("C2. true overlap: settlement and sweep race on a fresh fixture", () => overlapCheck(2));
  await check("C3. true overlap: settlement and sweep race on a fresh fixture", () => overlapCheck(3));

  await check("global: every conversion and operation reconciles for this run", async () => {
    assert(built.length === 5, `expected five built fixtures, got ${built.length}`);
    const orderIds = built.map((fixture) => fixture.orderId);
    const conversions = await prisma.affiliateConversion.findMany({
      where: { entityType: "Order", entityId: { in: orderIds } }
    });
    assert(conversions.length === orderIds.length, `${conversions.length} conversions for ${orderIds.length} orders`);
    const conversionIds = conversions.map((conversion) => conversion.id);
    const ops = await prisma.affiliateReversalOperation.findMany({ where: { conversionId: { in: conversionIds } } });
    const intents = await prisma.affiliateReversalIntent.findMany({ where: { orderId: { in: orderIds } } });
    assert(intents.length === orderIds.length, `${intents.length} intents for ${orderIds.length} orders`);

    const requestedSum = ops.reduce((sum, op) => sum + op.requestedKobo, 0n);
    const amountSum = conversions.reduce((sum, conversion) => sum + conversion.amountKobo, 0n);
    assert(requestedSum <= amountSum, `operations requested ${requestedSum}, exceeding commissioned ${amountSum}`);
    for (const op of ops) {
      assert(
        op.recoveredKobo + op.debtKobo === op.requestedKobo,
        `operation ${op.id} recovered ${op.recoveredKobo} + debt ${op.debtKobo} != requested ${op.requestedKobo}`
      );
    }
    for (const conversion of conversions) {
      const cumulative = ops
        .filter((op) => op.conversionId === conversion.id)
        .reduce((sum, op) => sum + op.requestedKobo, 0n);
      assert(
        cumulative <= conversion.amountKobo,
        `conversion ${conversion.id} reversed ${cumulative} of ${conversion.amountKobo}`
      );
    }

    const opKeys = new Set(ops.map((op) => op.opKey));
    for (const intent of intents) {
      assert(
        intent.state === "DONE",
        `intent ${intent.id} (order ${intent.orderId}) is ${intent.state}, lastError ${intent.lastError}`
      );
      const key = reversalReferenceFor(intent.id);
      if (!opKeys.has(key)) {
        assert(
          intent.lastError === "zero_adjustment" || intent.lastError === "no_attributed_conversion",
          `intent ${intent.id} is DONE with no operation and lastError ${intent.lastError}`
        );
      } else {
        const count = ops.filter((op) => op.opKey === key).length;
        assert(count === 1, `intent ${intent.id} has ${count} operations, expected exactly one`);
      }
    }

    return `${conversions.length} conversions, ${intents.length} intents, ${ops.length} operations; requested ${requestedSum} <= commissioned ${amountSum}; every operation recovered+debt=requested`;
  });

  const width = Math.max(...rows.map((row) => row.name.length));
  for (const row of rows) console.log(`${row.status.padEnd(4)} ${row.name.padEnd(width)}  ${row.detail}`);
  const failed = rows.filter((row) => row.status === "FAIL").length;
  console.log(`\n${rows.length - failed} passed, ${failed} failed`);
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (error) => {
  console.error("crashed:", describeError(error));
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
