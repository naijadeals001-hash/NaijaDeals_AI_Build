import "dotenv/config";
import { randomUUID } from "node:crypto";
import { inspect } from "node:util";
import { prisma } from "../lib/prisma";
import { refundPayment } from "../lib/payments/service";
import { processReversalIntents } from "../lib/services/affiliate/reversal-processor";
import { createLink, resolveTouch, recordConversion } from "../lib/services/affiliate/service";

/**
 * The real refund workflow: refundPayment → persisted intent → processor →
 * commission adjustment.
 *
 *   npx tsx scripts/affiliate-refund-integration.ts
 *
 * The intent is never inserted by hand. refundPayment writes it inside its own
 * transaction when the refund reaches COMPLETED; this test then runs the actual
 * processor and checks the committed financial effects.
 */

// Fail closed: this suite writes financial records and must never run against
// the shared development database. The guard checks the ACTUAL connected
// database, not an environment variable.
const REQUIRED_DB = "naijadeals_affiliate_test";

const runId = randomUUID().slice(0, 8);
const rows: { name: string; status: "PASS" | "FAIL"; detail: string }[] = [];
function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}
function describeError(error: unknown): string {
  // util.inspect with showHidden reaches Prisma's code/meta/clientVersion, which are
  // not always enumerable; JSON.stringify loses them and cannot handle BigInt.
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

let mixedOrderId = "";
let mixedConversionId = "";

const made = { users: [] as string[], conversions: [] as string[], intents: [] as string[], campaign: "", profile: "", order: "", vendor: "", product: "" };

async function main() {
  const db = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  console.log("database:", db[0].db);
  // Preflight: a pending migration on the target surfaces later as an opaque Prisma
  // error inside a financial write. Check before any fixture is created, and never
  // migrate here — the operator must run deploy against this exact target.
  const [{ applied }] = await prisma.$queryRawUnsafe<Array<{ applied: bigint }>>(
    "select count(*)::bigint as applied from _prisma_migrations where finished_at is not null"
  );
  const expected = Number(process.env.EXPECTED_MIGRATIONS ?? 0);
  if (expected && Number(applied) < expected) {
    console.error(`Refusing to run: ${applied} migrations applied on ${db[0].db}, expected at least ${expected}. Run prisma migrate deploy against this target.`);
    await prisma.$disconnect();
    process.exit(2);
  }

  if (db[0].db !== REQUIRED_DB) {
    console.error(`Refusing to run: connected to "${db[0].db}", expected "${REQUIRED_DB}".`);
    await prisma.$disconnect();
    process.exit(2);
  }

  const customer = await prisma.user.create({
    data: { email: `ri-cust-${runId}@example.test`, name: "Refund Integration Customer", actorType: "CUSTOMER" }
  });
  const owner = await prisma.user.create({
    data: { email: `ri-own-${runId}@example.test`, name: "Refund Integration Vendor", actorType: "VENDOR" }
  });
  made.users.push(customer.id, owner.id);

  const customerWallet = await prisma.wallet.create({
    data: { userId: customer.id, ownerType: "CUSTOMER", currency: "NGN", availableKobo: 10_000_000n, heldKobo: 0n }
  });

  const vendor = await prisma.vendor.create({
    data: {
      ownerId: owner.id, name: `Refund Vendor ${runId}`, slug: `ri-vendor-${runId}`, market: "Balogun",
      pickupAddress: "Balogun Market, Lagos", pickupPhone: "08012345678", status: "VERIFIED"
    }
  });
  made.vendor = vendor.id;
  const category = await prisma.category.create({ data: { name: `Refund Cat ${runId}`, slug: `ri-cat-${runId}` } });
  const product = await prisma.product.create({
    data: {
      vendorId: vendor.id, categoryId: category.id, name: `Refund Product ${runId}`, slug: `ri-prod-${runId}`,
      description: "Refund integration fixture", priceKobo: 5_000_000n, status: "ACTIVE",
      stock: { create: { quantity: 10, reserved: 0 } }
    }
  });
  made.product = product.id;

  const order = await prisma.order.create({
    data: {
      orderNumber: `RI-${runId}`, customerId: customer.id, vendorId: vendor.id,
      status: "completed", paymentStatus: "paid",
      subtotalKobo: 5_000_000n, totalKobo: 5_000_000n, commissionKobo: 500_000n,
      deliveryFeeKobo: 0n, escrowFeeKobo: 0n,
      deliveryAddress: "12 Broad Street, Lagos", contactName: "Refund Integration Customer", contactPhone: "08012345678",
      items: { create: [{ productId: product.id, quantity: 1, unitKobo: 5_000_000n, totalKobo: 5_000_000n, productName: `Refund Product ${runId}` }] }
    }
  });
  made.order = order.id;

  const payment = await prisma.payment.create({
    data: {
      orderId: order.id, provider: "test", providerReference: `TEST-RI-${runId}`,
      idempotencyKey: `ri-pay-${runId}`, amountKobo: 5_000_000n, currency: "NGN", status: "COMPLETED"
    }
  });
  // A real capture leaves the funds held against the vendor wallet, which is what
  // the refund reversal guard checks. Creating the hold without that balance is an
  // inconsistent fixture, not a reason to relax the guard.
  const vendorWallet = await prisma.wallet.create({
    data: { vendorId: vendor.id, ownerType: "VENDOR", currency: "NGN", availableKobo: 0n, heldKobo: 5_000_000n }
  });
  await prisma.escrowHold.create({
    data: {
      orderId: order.id, buyerWalletId: customerWallet.id, vendorWalletId: vendorWallet.id,
      amountKobo: 5_000_000n, status: "held", reason: "fixture"
    }
  });

  // The escrow hold must be reflected in the platform's held balance, which is
  // what a real payment capture does; without it the refund has nothing to draw.
  let platform = await prisma.wallet.findFirst({ where: { ownerType: "SYSTEM" } });
  if (!platform) {
    platform = await prisma.wallet.create({ data: { ownerType: "SYSTEM", currency: "NGN", availableKobo: 0n, heldKobo: 0n } });
  }
  // The released-escrow branch debits the platform's AVAILABLE balance, not its
  // held balance (lib/payments/service.ts:615), so that is what the fixture must
  // fund. Measured from the persisted record rather than assumed.
  // A disposable database starts with a zero platform wallet. Funding it here is
  // the fixture's own escrow, and cleanup below removes it in a way that is safe
  // after partial execution because the whole database is thrown away.
  await prisma.wallet.update({ where: { id: platform.id }, data: { availableKobo: { increment: 5_000_000n } } });

  // Attribution: an approved affiliate with a conversion for this order.
  const campaign = await prisma.affiliateCampaign.create({
    data: { slug: `ri-${runId}`, name: "RI campaign", vertical: "shop", status: "ACTIVE", funding: "PLATFORM", commissionBps: 500, budgetKobo: 100_000_000n, attributionDays: 0, commissionBasis: "SUBTOTAL", ruleVersion: 1 }
  });
  made.campaign = campaign.id;
  const affiliateUser = await prisma.user.create({ data: { email: `ri-aff-${runId}@example.test`, name: "Affiliate", actorType: "CUSTOMER" } });
  made.users.push(affiliateUser.id);
  const profile = await prisma.affiliateProfile.create({
    data: { userId: affiliateUser.id, status: "APPROVED", termsVersion: "t", termsAcceptedAt: new Date(), approvedAt: new Date() }
  });
  made.profile = profile.id;
  const conversion = await prisma.affiliateConversion.create({
    data: {
      dedupeKey: `Order:${order.id}`, affiliateId: profile.id, campaignId: campaign.id,
      entityType: "Order", entityId: order.id, ruleVersion: 1, basisType: "SUBTOTAL", commissionBps: 500,
      basisKobo: 5_000_000n, amountKobo: 250_000n, state: "PAID", ledgerReference: `AFF-COMM-${order.id}`
    }
  });
  made.conversions.push(conversion.id);

  let intentId = "";
  {
   

    await check("refundPayment confirms the refund and writes one intent", async () => {
      const result = await refundPayment({
        orderId: order.id, actorId: customer.id, reason: "integration test refund", idempotencyKey: `ri-refund-${runId}`
      });
      assert(result, "no result");
      const refund = await prisma.refund.findFirst({ where: { orderId: order.id }, orderBy: { createdAt: "desc" } });
      assert(refund && refund.status === "COMPLETED", `refund status ${refund?.status}`);
      const intents = await prisma.affiliateReversalIntent.findMany({ where: { orderId: order.id } });
      assert(intents.length === 1, `${intents.length} intents`);
      intentId = intents[0].id;
      made.intents.push(intentId);
      assert(intents[0].refundId === refund!.id, "intent is not tied to the confirmed refund");
      return `refund ${refund!.id.slice(0, 8)} COMPLETED, one intent ${intentId.slice(0, 8)}`;
    });

    await check("the processor commits the expected reversal operation", async () => {
      const before = await prisma.affiliateReversalOperation.count({ where: { conversionId: conversion.id } });
      const run = await processReversalIntents("refund-integration", 50);
      assert(run.done >= 1, `done ${run.done}`);
      const ops = await prisma.affiliateReversalOperation.findMany({ where: { conversionId: conversion.id } });
      assert(ops.length === before + 1, `${ops.length - before} operations written`);
      const intent = await prisma.affiliateReversalIntent.findUniqueOrThrow({ where: { id: intentId } });
      assert(intent.state === "DONE", `intent state ${intent.state}, error ${intent.lastError}`);
      return `intent DONE, ${ops.length} operation(s)`;
    });

    await check("wallet recovery plus debt equals the expected adjustment", async () => {
      const ops = await prisma.affiliateReversalOperation.findMany({ where: { conversionId: conversion.id } });
      const op = ops[ops.length - 1];
      // Full refund of 5,000,000 at 5% = 250,000 commission owed back.
      assert(op.requestedKobo === 250_000n, `requested ${op.requestedKobo}, expected 250000`);
      assert(op.recoveredKobo + op.debtKobo === op.requestedKobo, `recovered ${op.recoveredKobo} + debt ${op.debtKobo} != ${op.requestedKobo}`);
      const debts = await prisma.affiliateRecovery.findMany({ where: { conversionId: conversion.id } });
      const debtTotal = debts.reduce((sum, row) => sum + row.amountKobo, 0n);
      assert(debtTotal === op.debtKobo, `recovery rows total ${debtTotal}, operation debt ${op.debtKobo}`);
      return `requested ${op.requestedKobo} = recovered ${op.recoveredKobo} + debt ${op.debtKobo}`;
    });

    await check("zero-balance replay leaves every figure unchanged", async () => {
      const snap = async () => {
        const ops = await prisma.affiliateReversalOperation.findMany({ where: { conversionId: conversion.id } });
        const debts = await prisma.affiliateRecovery.findMany({ where: { conversionId: conversion.id } });
        // The reversal debits the AFFILIATE's wallet. Measuring the customer's
        // account, as this did, asserts nothing about the flow under test.
        const wallet = await prisma.wallet.findFirstOrThrow({ where: { userId: affiliateUser.id, ownerType: "CUSTOMER" } });
        return {
          operations: ops.length,
          cumulative: ops.reduce((sum, op) => sum + op.requestedKobo, 0n),
          debt: debts.reduce((sum, row) => sum + row.amountKobo, 0n),
          collected: debts.reduce((sum, row) => sum + row.collectedKobo, 0n),
          wallet: wallet.availableKobo
        };
      };
      const before = await snap();
      await prisma.affiliateReversalIntent.update({ where: { id: intentId }, data: { state: "PENDING" } });
      await processReversalIntents("zero-replay", 50);
      const after = await snap();
      assert(after.operations === before.operations, `operations ${before.operations} -> ${after.operations}`);
      assert(after.cumulative === before.cumulative, `cumulative ${before.cumulative} -> ${after.cumulative}`);
      assert(after.debt === before.debt, `debt ${before.debt} -> ${after.debt}`);
      assert(after.collected === before.collected, `collected ${before.collected} -> ${after.collected}`);
      assert(after.wallet === before.wallet, `wallet ${before.wallet} -> ${after.wallet}`);
      return `ops ${after.operations}, cumulative ${after.cumulative}, debt ${after.debt}, collected ${after.collected}, wallet ${after.wallet} — all unchanged`;
    });

    await check("a funded reversal debits the affiliate and balances the journal", async () => {
      const wallet = await prisma.wallet.update({
        where: { id: (await prisma.wallet.findFirstOrThrow({ where: { userId: affiliateUser.id } })).id },
        data: { availableKobo: { increment: 500_000n } }
      });
      assert(wallet.availableKobo === 500_000n, `affiliate wallet ${wallet.availableKobo}, expected 500000`);
      const { reverseConversion } = await import("../lib/services/affiliate/settlement");
      // The refund-driven conversion is already fully reversed, so this uses its own
      // conversion with headroom: the case under test is the ledger path, not the
      // refund trigger, which the other checks already cover.
      const fundedEntity = `funded-order-${runId}`;
      const fundedConversion = await prisma.affiliateConversion.create({
        data: {
          dedupeKey: `Order:${fundedEntity}`, affiliateId: profile.id, campaignId: campaign.id,
          entityType: "Order", entityId: fundedEntity, ruleVersion: 1, basisType: "SUBTOTAL", commissionBps: 500,
          basisKobo: 5_000_000n, amountKobo: 250_000n, state: "PAID", ledgerReference: `AFF-COMM-${fundedEntity}`
        }
      });
      const opsBefore = await prisma.affiliateReversalOperation.count({ where: { conversionId: fundedConversion.id } });
      const result = await reverseConversion({
        actorId: null, conversionId: fundedConversion.id, amountKobo: 100_000n, reason: "funded recovery",
        idempotencyKey: `funded-${runId}`
      });
      assert(result.reversed, `not reversed: ${"reason" in result ? result.reason : ""}`);
      const after = await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
      assert(after.availableKobo === 400_000n, `wallet ${after.availableKobo}, expected 400000 after a 100000 debit`);
      const ops = await prisma.affiliateReversalOperation.count({ where: { conversionId: fundedConversion.id } });
      assert(ops === opsBefore + 1, `operations ${opsBefore} -> ${ops}`);
      const op = await prisma.affiliateReversalOperation.findFirstOrThrow({ where: { conversionId: fundedConversion.id }, orderBy: { createdAt: "desc" } });
      assert(op.recoveredKobo === 100_000n, `recovered ${op.recoveredKobo}`);
      assert(op.debtKobo === 0n, `debt ${op.debtKobo}, expected 0 when fully covered`);
      const tx = await prisma.walletTransaction.findFirstOrThrow({ where: { reference: op.ledgerReference ?? "" }, include: { ledger: true } });
      const debit = tx.ledger.filter((e) => e.direction === "DEBIT").reduce((sum, e) => sum + e.amountKobo, 0n);
      const credit = tx.ledger.filter((e) => e.direction === "CREDIT").reduce((sum, e) => sum + e.amountKobo, 0n);
      assert(debit === credit && debit === 100_000n, `journal debit ${debit} credit ${credit}`);
      return `wallet 500000 -> ${after.availableKobo}, recovered 100000, debt 0, journal ${debit}=${credit}`;
    });

    await check("a failure after the ledger write rolls back every effect", async () => {
      const { reverseConversion } = await import("../lib/services/affiliate/settlement");
      const rollbackConversion = await prisma.affiliateConversion.create({
        data: {
          dedupeKey: `Order:rollback-${runId}`, affiliateId: profile.id, campaignId: campaign.id,
          entityType: "Order", entityId: `rollback-order-${runId}`, ruleVersion: 1, basisType: "SUBTOTAL", commissionBps: 500,
          basisKobo: 5_000_000n, amountKobo: 250_000n, state: "PAID", ledgerReference: `AFF-COMM-rollback-${runId}`
        }
      });
      const opsBefore = await prisma.affiliateReversalOperation.count({ where: { conversionId: rollbackConversion.id } });
      const debtsBefore = await prisma.affiliateRecovery.aggregate({ where: { conversionId: rollbackConversion.id }, _sum: { amountKobo: true } });
      const walletBefore = (await prisma.wallet.findFirstOrThrow({ where: { userId: customer.id } })).availableKobo;
      const ledgerBefore = await prisma.ledgerEntry.count({});

      let threw = "";
      try {
        await reverseConversion({
          actorId: null, conversionId: rollbackConversion.id, amountKobo: 1_000n, reason: "rollback probe",
          idempotencyKey: `rollback-${runId}`,
          testHooks: { failAfterLedgerWrite: true }
        });
      } catch (error) {
        threw = error instanceof Error ? error.message : String(error);
      }
      assert(threw === "injected_failure_after_ledger_write", `did not fail as intended: ${threw}`);

      const opsAfter = await prisma.affiliateReversalOperation.count({ where: { conversionId: rollbackConversion.id } });
      const debtsAfter = await prisma.affiliateRecovery.aggregate({ where: { conversionId: rollbackConversion.id }, _sum: { amountKobo: true } });
      const walletAfter = (await prisma.wallet.findFirstOrThrow({ where: { userId: customer.id } })).availableKobo;
      const ledgerAfter = await prisma.ledgerEntry.count({});

      assert(opsAfter === opsBefore, `operation survived the rollback (${opsBefore} -> ${opsAfter})`);
      assert((debtsBefore._sum.amountKobo ?? 0n) === (debtsAfter._sum.amountKobo ?? 0n), "recovery changed");
      assert(walletAfter === walletBefore, `wallet changed ${walletBefore} -> ${walletAfter}`);
      assert(ledgerAfter === ledgerBefore, `ledger entries changed ${ledgerBefore} -> ${ledgerAfter}`);
      return "ledger, wallet, operation, recovery and cumulative all rolled back";
    });

    await check("a failure before DONE replays to exactly one financial effect", async () => {
      const opsBefore = await prisma.affiliateReversalOperation.count({ where: { conversionId: conversion.id } });
      await prisma.affiliateReversalIntent.update({ where: { id: intentId }, data: { state: "PENDING" } });
      let threw = "";
      try {
        await processReversalIntents("post-commit", 50, { failBeforeDone: true });
      } catch (error) {
        threw = error instanceof Error ? error.message : String(error);
      }
      // The processor catches handler failures and marks the intent retryable; it
      // does not rethrow, so the boundary is observed through state, not exit.
      const afterFailure = await prisma.affiliateReversalIntent.findUniqueOrThrow({ where: { id: intentId } });
      assert(afterFailure.state === "PENDING", `intent state after the injected failure: ${afterFailure.state}`);
      assert((afterFailure.lastError ?? "").includes("injected_failure_before_done"), `lastError ${afterFailure.lastError}`);

      // Expire the lease and let the processor finish what it already committed.
      await prisma.affiliateReversalIntent.update({ where: { id: intentId }, data: { leaseExpiresAt: new Date(Date.now() - 1000) } });
      await processReversalIntents("post-commit-retry", 50);
      const opsAfter = await prisma.affiliateReversalOperation.count({ where: { conversionId: conversion.id } });
      const finalIntent = await prisma.affiliateReversalIntent.findUniqueOrThrow({ where: { id: intentId } });
      assert(opsAfter === opsBefore, `operations ${opsBefore} -> ${opsAfter} on retry`);
      assert(finalIntent.state === "DONE", `intent state ${finalIntent.state}, error ${finalIntent.lastError}`);
      const refund = await prisma.refund.findFirstOrThrow({ where: { orderId: order.id }, orderBy: { createdAt: "desc" } });
      assert(refund.status === "COMPLETED", `refund status ${refund.status}`);
      return `one effect before and after retry, intent DONE, refund COMPLETED`;
    });

    await check("any ledger entry the reversal posted is balanced", async () => {
      const ops = await prisma.affiliateReversalOperation.findMany({ where: { conversionId: conversion.id } });
      const op = ops[ops.length - 1];
      if (!op.ledgerReference) return "no cash recovered, so no ledger entry was posted (debt-only)";
      const tx = await prisma.walletTransaction.findFirst({ where: { reference: op.ledgerReference }, include: { ledger: true } });
      assert(tx, `no transaction for ${op.ledgerReference}`);
      const debit = tx!.ledger.filter((e) => e.direction === "DEBIT").reduce((s, e) => s + e.amountKobo, 0n);
      const credit = tx!.ledger.filter((e) => e.direction === "CREDIT").reduce((s, e) => s + e.amountKobo, 0n);
      assert(debit === credit, `debit ${debit} != credit ${credit}`);
      return `debit=${debit} credit=${credit}`;
    });

    await check("duplicate confirmation produces no second intent or adjustment", async () => {
      const intentsBefore = await prisma.affiliateReversalIntent.count({ where: { orderId: order.id } });
      const opsBefore = await prisma.affiliateReversalOperation.count({ where: { conversionId: conversion.id } });
      await refundPayment({
        orderId: order.id, actorId: customer.id, reason: "duplicate confirmation", idempotencyKey: `ri-refund-${runId}`
      }).catch(() => undefined);
      const intentsAfter = await prisma.affiliateReversalIntent.count({ where: { orderId: order.id } });
      const opsAfter = await prisma.affiliateReversalOperation.count({ where: { conversionId: conversion.id } });
      assert(intentsAfter === intentsBefore, `intents went ${intentsBefore} -> ${intentsAfter}`);
      assert(opsAfter === opsBefore, `operations went ${opsBefore} -> ${opsAfter}`);
      return `still ${intentsAfter} intent and ${opsAfter} operation after a repeat call`;
    });

    await check("replaying a DONE intent adds no financial effect", async () => {
      const opsBefore = await prisma.affiliateReversalOperation.count({ where: { conversionId: conversion.id } });
      const debtsBefore = await prisma.affiliateRecovery.aggregate({ where: { conversionId: conversion.id }, _sum: { amountKobo: true } });
      // Simulates the crash window: work committed, the intent not yet marked DONE.
      await prisma.affiliateReversalIntent.update({ where: { id: intentId }, data: { state: "PENDING" } });
      await processReversalIntents("replay-probe", 50);
      const opsAfter = await prisma.affiliateReversalOperation.count({ where: { conversionId: conversion.id } });
      const debtsAfter = await prisma.affiliateRecovery.aggregate({ where: { conversionId: conversion.id }, _sum: { amountKobo: true } });
      assert(opsAfter === opsBefore, `operations went ${opsBefore} -> ${opsAfter} on replay`);
      assert(
        (debtsBefore._sum.amountKobo ?? 0n) === (debtsAfter._sum.amountKobo ?? 0n),
        "debt changed on replay"
      );
      return `replay left ${opsAfter} operation and unchanged debt`;
    });

    await check("the customer refund is not affected by affiliate processing", async () => {
      const refund = await prisma.refund.findFirstOrThrow({ where: { orderId: order.id }, orderBy: { createdAt: "desc" } });
      assert(refund.status === "COMPLETED", `refund status ${refund.status}`);
      return "refund stayed COMPLETED";
    });
  }
  // No per-record teardown: the target is a disposable database whose whole point
  // is that partial execution leaves nothing to repair. Every fixture is keyed by
  // runId, so consecutive runs cannot collide, and drift is measured rather than
  // compensated — the previous version subtracted a hardcoded delta from a shared
  // balance, which is exactly how the development wallet was driven negative.

  await check("mixed component: three refunds allocate cumulatively", async () => {
    // subtotal 5,000,000 + delivery 2,000 = 5,002,000 paid, SUBTOTAL basis.
    const mixedOrderNumber = `MIX-${runId}`;
    const mixedOrder = await prisma.order.create({
      data: {
        orderNumber: mixedOrderNumber, customerId: customer.id, vendorId: vendor.id,
        status: "completed", paymentStatus: "paid",
        subtotalKobo: 5_000_000n, deliveryFeeKobo: 2_000n, totalKobo: 5_002_000n,
        commissionKobo: 250_000n, escrowFeeKobo: 0n,
        deliveryAddress: "12 Broad Street, Lagos", contactName: "Mixed Customer", contactPhone: "08012345678",
        items: { create: [{ productId: product.id, quantity: 1, unitKobo: 5_000_000n, totalKobo: 5_000_000n, productName: `Mixed ${runId}` }] }
      }
    });
    await prisma.payment.create({
      data: {
        orderId: mixedOrder.id, provider: "test", providerReference: `TEST-MIX-${runId}`,
        idempotencyKey: `mix-pay-${runId}`, amountKobo: 5_002_000n, currency: "NGN", status: "COMPLETED"
      }
    });
    // ensureWallet resolves a vendor wallet by vendorId, so a second row for the same
    // vendor would make the service and the fixture disagree about which one holds
    // the escrow. Reuse the existing row and fund it.
    const mixedVendorWallet = await prisma.wallet.update({
      where: { id: (await prisma.wallet.findFirstOrThrow({ where: { vendorId: vendor.id } })).id },
      data: { heldKobo: { increment: 5_002_000n } }
    });
    await prisma.escrowHold.create({
      data: {
        orderId: mixedOrder.id, buyerWalletId: customerWallet.id, vendorWalletId: mixedVendorWallet.id,
        amountKobo: 5_002_000n, status: "held", reason: "mixed fixture"
      }
    });
    // The branch taken for a non-wallet provider debits the platform's available
    // balance and the vendor's held balance.
    await prisma.wallet.update({ where: { id: platform.id }, data: { availableKobo: { increment: 5_002_000n } } });

    const mixedConversion = await prisma.affiliateConversion.create({
      data: {
        dedupeKey: `Order:${mixedOrder.id}`, affiliateId: profile.id, campaignId: campaign.id,
        entityType: "Order", entityId: mixedOrder.id, ruleVersion: 1, basisType: "SUBTOTAL",
        commissionBps: 500, basisKobo: 5_000_000n, amountKobo: 250_000n, state: "PAID",
        ledgerReference: `AFF-COMM-${mixedOrder.id}`
      }
    });

    mixedOrderId = mixedOrder.id;
    mixedConversionId = mixedConversion.id;
    const expected = [1_999_200n, 1_999_200n, 1_001_600n];
    const amounts = [2_000_000n, 2_000_000n, 1_002_000n];
    const deltas: bigint[] = [];

    for (let index = 0; index < amounts.length; index += 1) {
      await refundPayment({
        orderId: mixedOrder.id, actorId: customer.id, reason: `mixed partial ${index + 1}`,
        amountKobo: amounts[index], idempotencyKey: `mix-refund-${index}-${runId}`
      });
      const intent = await prisma.affiliateReversalIntent.findFirstOrThrow({
        where: { orderId: mixedOrder.id }, orderBy: { createdAt: "desc" }
      });
      assert(intent.eligibleKobo === expected[index], `refund ${index + 1} eligible ${intent.eligibleKobo}, expected ${expected[index]}`);
      deltas.push(intent.eligibleKobo!);
      await processReversalIntents(`mixed-${index}`, 50);
    }

    const intents = await prisma.affiliateReversalIntent.count({ where: { orderId: mixedOrder.id } });
    assert(intents === 3, `${intents} intents for three refunds`);
    const cumulative = deltas.reduce((sum, value) => sum + value, 0n);
    assert(cumulative === 5_000_000n, `cumulative eligible ${cumulative}, expected 5000000`);

    const ops = await prisma.affiliateReversalOperation.findMany({ where: { conversionId: mixedConversion.id } });
    const reversed = ops.reduce((sum, op) => sum + op.requestedKobo, 0n);
    assert(reversed === 250_000n, `commission reversed ${reversed}, expected the original 250000`);
    return `deltas ${deltas.join("+")} = ${cumulative}; commission reversed ${reversed}`;
  });

  await check("duplicate confirmation under mixed components adds nothing", async () => {
    const intentsBefore = await prisma.affiliateReversalIntent.count({ where: { orderId: mixedOrderId } });
    const opsBefore = await prisma.affiliateReversalOperation.count({ where: { conversionId: mixedConversionId } });
    const walletBefore = (await prisma.wallet.findFirstOrThrow({ where: { userId: affiliateUser.id } })).availableKobo;
    const debtBefore = await prisma.affiliateRecovery.aggregate({ where: { conversionId: mixedConversionId }, _sum: { amountKobo: true } });
    await refundPayment({ orderId: mixedOrderId, actorId: customer.id, reason: "mixed partial 3", amountKobo: 1_002_000n, idempotencyKey: `mix-refund-2-${runId}` }).catch(() => undefined);
    await processReversalIntents("mixed-dupe", 50);
    const intentsAfter = await prisma.affiliateReversalIntent.count({ where: { orderId: mixedOrderId } });
    const opsAfter = await prisma.affiliateReversalOperation.count({ where: { conversionId: mixedConversionId } });
    const walletAfter = (await prisma.wallet.findFirstOrThrow({ where: { userId: affiliateUser.id } })).availableKobo;
    const debtAfter = await prisma.affiliateRecovery.aggregate({ where: { conversionId: mixedConversionId }, _sum: { amountKobo: true } });
    assert(intentsAfter === intentsBefore, `intents ${intentsBefore} -> ${intentsAfter}`);
    assert(opsAfter === opsBefore, `operations ${opsBefore} -> ${opsAfter}`);
    assert(walletAfter === walletBefore, `wallet ${walletBefore} -> ${walletAfter}`);
    assert((debtBefore._sum.amountKobo ?? 0n) === (debtAfter._sum.amountKobo ?? 0n), "debt changed");
    return "intents, operations, wallet and debt unchanged";
  });

  await check("campaign edit does not move the frozen rule", async () => {
    // Snapshot 500 bps / SUBTOTAL, then edit the campaign to 900 bps / TOTAL
    // BEFORE the refund. Editing after the reversal would not test invariance.
    const invOrder = await prisma.order.create({
      data: {
        orderNumber: `INV-${runId}`, customerId: customer.id, vendorId: vendor.id,
        status: "completed", paymentStatus: "paid",
        subtotalKobo: 5_000_000n, deliveryFeeKobo: 2_000n, totalKobo: 5_002_000n,
        commissionKobo: 250_000n, escrowFeeKobo: 0n,
        deliveryAddress: "12 Broad Street, Lagos", contactName: "Invariance", contactPhone: "08012345678",
        items: { create: [{ productId: product.id, quantity: 1, unitKobo: 5_000_000n, totalKobo: 5_000_000n, productName: `Inv ${runId}` }] }
      }
    });
    await prisma.payment.create({
      data: { orderId: invOrder.id, provider: "test", providerReference: `TEST-INV-${runId}`, idempotencyKey: `inv-pay-${runId}`, amountKobo: 5_002_000n, currency: "NGN", status: "COMPLETED" }
    });
    const invVendorWallet = await prisma.wallet.findFirstOrThrow({ where: { vendorId: vendor.id } });
    await prisma.wallet.update({ where: { id: invVendorWallet.id }, data: { heldKobo: { increment: 5_002_000n } } });
    await prisma.wallet.update({ where: { id: platform.id }, data: { availableKobo: { increment: 5_002_000n } } });
    await prisma.escrowHold.create({
      data: { orderId: invOrder.id, buyerWalletId: customerWallet.id, vendorWalletId: invVendorWallet.id, amountKobo: 5_002_000n, status: "held", reason: "invariance fixture" }
    });
    const invConversion = await prisma.affiliateConversion.create({
      data: {
        dedupeKey: `Order:${invOrder.id}`, affiliateId: profile.id, campaignId: campaign.id,
        entityType: "Order", entityId: invOrder.id, ruleVersion: 1, basisType: "SUBTOTAL",
        commissionBps: 500, basisKobo: 5_000_000n, amountKobo: 250_000n, state: "PAID",
        ledgerReference: `AFF-COMM-${invOrder.id}`
      }
    });

    await prisma.affiliateCampaign.update({ where: { id: campaign.id }, data: { commissionBps: 900, commissionBasis: "TOTAL" } });

    await refundPayment({ orderId: invOrder.id, actorId: customer.id, reason: "invariance", amountKobo: 2_000_000n, idempotencyKey: `inv-refund-${runId}` });
    const intent = await prisma.affiliateReversalIntent.findFirstOrThrow({ where: { orderId: invOrder.id } });
    // SUBTOTAL snapshot: delivery excluded, so 2,000,000 x 5,000,000 / 5,002,000.
    assert(intent.eligibleKobo === 1_999_200n, `eligible ${intent.eligibleKobo}, expected 1999200 from the SUBTOTAL snapshot`);
    assert(intent.allocationPolicy === "proportional_subtotal_v1", `policy ${intent.allocationPolicy}`);
    await processReversalIntents("invariance", 50);
    const op = await prisma.affiliateReversalOperation.findFirstOrThrow({ where: { conversionId: invConversion.id } });
    // 5% of 1,999,200, not 9% of the full refund.
    assert(op.requestedKobo === 99_960n, `commission ${op.requestedKobo}, expected 99960 at the frozen 500 bps`);
    const wallet = await prisma.wallet.findFirstOrThrow({ where: { userId: affiliateUser.id } });
    const debt = await prisma.affiliateRecovery.aggregate({ where: { conversionId: invConversion.id }, _sum: { amountKobo: true } });
    assert((debt._sum.amountKobo ?? 0n) + op.recoveredKobo === op.requestedKobo, "wallet recovery plus debt does not equal the adjustment");
    await prisma.affiliateCampaign.update({ where: { id: campaign.id }, data: { commissionBps: 500, commissionBasis: "SUBTOTAL" } });
    return `eligible 1999200 and commission 99960 unchanged after the campaign moved to 900 bps / TOTAL`;
  });

  await check("TOTAL basis snapshot comes from recordConversion", async () => {
    // Built through the real service, not by writing basisType onto a fixture row.
    const totalCampaign = await prisma.affiliateCampaign.create({
      data: { slug: `total-${runId}`, name: "Total campaign", vertical: "shop", status: "ACTIVE", funding: "PLATFORM", commissionBps: 500, budgetKobo: 100_000_000n, attributionDays: 30, commissionBasis: "TOTAL", ruleVersion: 1 }
    });
    const totalLink = await createLink({ affiliateId: profile.id, campaignId: totalCampaign.id, destination: "/product/abc" });
    const visitor = `total-visitor-${runId}`;
    await resolveTouch({ code: totalLink.code, visitorKey: visitor, consent: true });

    const totalOrder = await prisma.order.create({
      data: {
        orderNumber: `TOT-${runId}`, customerId: customer.id, vendorId: vendor.id,
        status: "completed", paymentStatus: "paid",
        subtotalKobo: 5_000_000n, deliveryFeeKobo: 2_000n, totalKobo: 5_002_000n,
        commissionKobo: 250_100n, escrowFeeKobo: 0n,
        deliveryAddress: "12 Broad Street, Lagos", contactName: "Total Basis", contactPhone: "08012345678",
        items: { create: [{ productId: product.id, quantity: 1, unitKobo: 5_000_000n, totalKobo: 5_000_000n, productName: `Tot ${runId}` }] }
      }
    });
    await prisma.payment.create({
      data: { orderId: totalOrder.id, provider: "test", providerReference: `TEST-TOT-${runId}`, idempotencyKey: `tot-pay-${runId}`, amountKobo: 5_002_000n, currency: "NGN", status: "COMPLETED" }
    });
    const totVendorWallet = await prisma.wallet.findFirstOrThrow({ where: { vendorId: vendor.id } });
    await prisma.wallet.update({ where: { id: totVendorWallet.id }, data: { heldKobo: { increment: 5_002_000n } } });
    await prisma.wallet.update({ where: { id: platform.id }, data: { availableKobo: { increment: 5_002_000n } } });
    await prisma.escrowHold.create({
      data: { orderId: totalOrder.id, buyerWalletId: customerWallet.id, vendorWalletId: totVendorWallet.id, amountKobo: 5_002_000n, status: "held", reason: "total fixture" }
    });

    const recorded = await recordConversion({ entityType: "Order", entityId: totalOrder.id, basisKobo: 5_002_000n, visitorKey: visitor });
    assert(recorded.created, `conversion not created: ${"reason" in recorded ? recorded.reason : ""}`);
    if (!recorded.created) return "";
    const conversion = recorded.conversion;
    assert(conversion.basisType === "TOTAL", `snapshot basisType ${conversion.basisType}, expected TOTAL`);
    assert(conversion.basisKobo === 5_002_000n, `snapshot basis ${conversion.basisKobo}, expected the paid total`);

    await refundPayment({ orderId: totalOrder.id, actorId: customer.id, reason: "total basis", amountKobo: 2_000_000n, idempotencyKey: `tot-refund-${runId}` });
    const intent = await prisma.affiliateReversalIntent.findFirstOrThrow({ where: { orderId: totalOrder.id } });
    assert(intent.eligibleKobo === 2_000_000n, `eligible ${intent.eligibleKobo}, expected the full refund under TOTAL`);
    assert(intent.allocationPolicy === "proportional_total_v1", `policy ${intent.allocationPolicy}`);
    await processReversalIntents("total-basis", 50);
    const op = await prisma.affiliateReversalOperation.findFirstOrThrow({ where: { conversionId: conversion.id } });
    assert(op.requestedKobo === 100_000n, `commission ${op.requestedKobo}, expected 100000 (5% of 2,000,000)`);
    await prisma.affiliateCampaign.update({ where: { id: totalCampaign.id }, data: { spendingCents: 0 } as never }).catch(() => undefined);
    return `snapshot TOTAL on ${conversion.basisKobo}; eligible 2000000; commission 100000`;
  });

  const width = Math.max(...rows.map((row) => row.name.length));
  for (const row of rows) console.log(`${row.status.padEnd(4)} ${row.name.padEnd(width)}  ${row.detail}`);
  const failed = rows.filter((row) => row.status === "FAIL").length;
  console.log(`\n${rows.length - failed} passed, ${failed} failed`);
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (error) => {
  console.error("crashed:", error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
