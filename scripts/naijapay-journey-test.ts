/**
 * NaijaPay journey acceptance test — isolated schema.
 *
 * Runs the directive's target outcome end to end, plus the failure modes that
 * must not create money:
 *
 *   User A adds money (test provider) -> sends to User B -> B funds an escrow
 *   milestone -> the milestone is released to the recipient -> history and
 *   receipts reflect it -> every affected wallet reconciles.
 *
 * Then: duplicate top-up confirmation, duplicate transfer, concurrent transfers,
 * insufficient funds, self-transfer, and unbalanced-journal rejection.
 *
 * Runs entirely inside `naijapay_journey_test`; the shared database is untouched.
 *
 * Usage: npx tsx scripts/naijapay-journey-test.ts
 */
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/auth/password";

const SCHEMA = "naijapay_journey_test";
const base = (process.env.DATABASE_URL ?? "").replace(/^"|"$/g, "");
if (!base) {
  console.error("DATABASE_URL is not set");
  process.exit(2);
}
const url = base + (base.includes("?") ? "&" : "?") + "schema=" + SCHEMA;

let pass = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures.push(`${name}${detail ? ` (${detail})` : ""}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
};
const NGN = (k: bigint) => "NGN " + (Number(k) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 });

const db = new PrismaClient({ datasources: { db: { url } } });

async function walletOf(userId: string) {
  return db.wallet.findFirstOrThrow({ where: { userId } });
}

async function journalNet(walletId: string) {
  const rows = await db.ledgerEntry.groupBy({ by: ["direction"], where: { walletId }, _sum: { amountKobo: true } });
  return rows.reduce((s, r) => s + (r.direction === "CREDIT" ? r._sum.amountKobo ?? 0n : -(r._sum.amountKobo ?? 0n)), 0n);
}

(async () => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });

  // Import services only after the environment points at the isolated schema.
  process.env.DATABASE_URL = url;
  const { sendP2PTransfer } = await import("../lib/services/core/transfer.service");
  const { createTopUp, creditTopUp } = await import("../lib/services/core/topup.service");
  const { postBalancedTransaction } = await import("../lib/services/core/wallet.service");
  const { completeOrder } = await import("../lib/services/core/order.service");

  const passwordHash = await hashPassword("JourneyTest123!");

  // ---- fixtures ---------------------------------------------------------
  await db.auditLog.deleteMany({});
  await db.systemEvent.deleteMany({});
  await db.walletTopUp.deleteMany({});
  await db.ledgerEntry.deleteMany({});
  await db.walletTransaction.deleteMany({});
  await db.accountPosting.deleteMany({});
  await db.ledgerAdjustment.deleteMany({});
  await db.ledgerAccount.deleteMany({});
  await db.wallet.updateMany({ data: { availableKobo: 0n, heldKobo: 0n } });

  const userA = await db.user.create({ data: { email: `journey-a-${Date.now()}@naijadeals.test`, name: "Journey A", passwordHash, actorType: "CUSTOMER" } });
  const userB = await db.user.create({ data: { email: `journey-b-${Date.now()}@naijadeals.test`, name: "Journey B", passwordHash, actorType: "CUSTOMER" } });
  const sellerUser = await db.user.create({ data: { email: `journey-seller-${Date.now()}@naijadeals.test`, name: "Journey Seller", passwordHash, actorType: "CUSTOMER" } });

  const walletA = await db.wallet.create({ data: { ownerType: "CUSTOMER", userId: userA.id } });
  const walletB = await db.wallet.create({ data: { ownerType: "CUSTOMER", userId: userB.id } });
  let platform = await db.wallet.findFirst({ where: { ownerType: "SYSTEM" } });
  if (!platform) platform = await db.wallet.create({ data: { ownerType: "SYSTEM" } });

  const vendor = await db.vendor.create({
    data: {
      ownerId: sellerUser.id,
      name: "Journey Escrow Seller",
      slug: `journey-seller-${Date.now()}`,
      market: "Test Market",
      pickupAddress: "1 Test Street",
      pickupPhone: "08000000000",
      status: "VERIFIED",
      commissionBps: 800
    }
  });
  const walletSeller = await db.wallet.create({ data: { ownerType: "VENDOR", vendorId: vendor.id } });

  // Fund the platform wallet through a BALANCED journal so its stored balance and
  // journal agree. A self-credit against a self-debit nets to zero, so the seed
  // posts two wallets: platform opening equity funded from a dedicated equity wallet.
  const equityWallet = await db.wallet.create({ data: { ownerType: "SYSTEM" } });
  await db.wallet.update({ where: { id: platform.id }, data: { availableKobo: { increment: 10_000_000n } } });
  await db.wallet.update({ where: { id: equityWallet.id }, data: { availableKobo: { decrement: 10_000_000n } } });
  await db.walletTransaction.create({
    data: {
      walletId: platform.id,
      type: "credit",
      amountKobo: 10_000_000n,
      reference: `JOURNEY-PLATFORM-SEED-${Date.now()}`,
      description: "Journey test platform funding (opening equity)",
      ledger: { create: [
        { walletId: equityWallet.id, direction: "DEBIT", amountKobo: 10_000_000n, memo: "Opening equity source" },
        { walletId: platform.id, direction: "CREDIT", amountKobo: 10_000_000n, memo: "Opening equity funding" }
      ] }
    }
  });


  // ---- 1. User A adds money via the test provider -----------------------
  console.log("\n1) User A adds money (local test provider)");
  const topUpKey = `journey-topup-${Date.now()}`;
  const created = await createTopUp(db, {
    walletId: walletA.id,
    amountKobo: 200_000n, // ₦2,000
    provider: "test",
    providerReference: `TEST-${topUpKey}`,
    idempotencyKey: topUpKey
  });
  check("top-up is created as PENDING", created.topUp.status === "PENDING", created.topUp.status);

  const credited = await creditTopUp(db, {
    providerReference: created.topUp.providerReference,
    verifiedAmountKobo: 200_000n,
    verifiedCurrency: "NGN"
  });
  check("verified top-up credits the wallet", credited.status === "credited");
  check("A balance is now ₦2,000", (await walletOf(userA.id)).availableKobo === 200_000n, NGN((await walletOf(userA.id)).availableKobo));

  // ---- duplicate + mismatched confirmations -----------------------------
  console.log("\n2) Duplicate and mismatched confirmations cannot create money");
  const replay = await creditTopUp(db, { providerReference: created.topUp.providerReference, verifiedAmountKobo: 200_000n, verifiedCurrency: "NGN" });
  check("replayed confirmation reports already_credited", replay.status === "already_credited", replay.status);
  check("balance unchanged after replay", (await walletOf(userA.id)).availableKobo === 200_000n);

  const topUp2 = await createTopUp(db, {
    walletId: walletA.id,
    amountKobo: 100_000n,
    provider: "test",
    providerReference: `TEST-${topUpKey}-2`,
    idempotencyKey: `${topUpKey}-2`
  });
  let mismatchBlocked = false;
  try {
    await creditTopUp(db, { providerReference: topUp2.topUp.providerReference, verifiedAmountKobo: 999_999n, verifiedCurrency: "NGN" });
  } catch (e) {
    mismatchBlocked = (e as Error).message.includes("amount") || (e as { code?: string }).code === "amount_mismatch";
  }
  check("mismatched verified amount is rejected", mismatchBlocked);
  check("rejected mismatch left the balance alone", (await walletOf(userA.id)).availableKobo === 200_000n);

  let currencyBlocked = false;
  try {
    await creditTopUp(db, { providerReference: topUp2.topUp.providerReference, verifiedAmountKobo: 100_000n, verifiedCurrency: "USD" });
  } catch (e) {
    currencyBlocked = true;
  }
  check("mismatched currency is rejected", currencyBlocked);

  // Concurrent confirmations of the same top-up must credit once.
  const results = await Promise.allSettled([
    creditTopUp(db, { providerReference: topUp2.topUp.providerReference, verifiedAmountKobo: 100_000n, verifiedCurrency: "NGN" }),
    creditTopUp(db, { providerReference: topUp2.topUp.providerReference, verifiedAmountKobo: 100_000n, verifiedCurrency: "NGN" })
  ]);
  const creditedCount = results.filter((r) => r.status === "fulfilled" && r.value.status === "credited").length;
  check("concurrent confirmations credit exactly once", creditedCount === 1, `${creditedCount} credited`);
  check("balance reflects exactly one extra ₦1,000", (await walletOf(userA.id)).availableKobo === 300_000n, NGN((await walletOf(userA.id)).availableKobo));

  // ---- 3. A sends to B ---------------------------------------------------
  console.log("\n3) User A sends money to User B");
  const sendKey = `journey-send-${Date.now()}`;
  const sent = await sendP2PTransfer(db, {
    senderUserId: userA.id,
    recipientEmail: userB.email,
    amountKobo: 150_000n,
    idempotencyKey: sendKey,
    note: "Journey transfer"
  });
  check("transfer posts", !sent.duplicate, sent.reference);
  check("A debited to ₦1,500", (await walletOf(userA.id)).availableKobo === 150_000n, NGN((await walletOf(userA.id)).availableKobo));
  check("B credited to ₦1,500", (await walletOf(userB.id)).availableKobo === 150_000n, NGN((await walletOf(userB.id)).availableKobo));

  const retry = await sendP2PTransfer(db, { senderUserId: userA.id, recipientEmail: userB.email, amountKobo: 150_000n, idempotencyKey: sendKey });
  check("same idempotency key returns the original", retry.duplicate === true);
  check("retry did not debit again", (await walletOf(userA.id)).availableKobo === 150_000n);

  // Interruption: the client retries after a timeout with the same key.
  const afterDrop = await sendP2PTransfer(db, { senderUserId: userA.id, recipientEmail: userB.email, amountKobo: 150_000n, idempotencyKey: sendKey });
  check("retry after a dropped connection does not duplicate", afterDrop.duplicate === true && afterDrop.reference === sent.reference);

  // ---- 4. Concurrent sends cannot overspend -----------------------------
  console.log("\n4) Concurrency and insufficient funds");
  const balanceBeforeRace = (await walletOf(userA.id)).availableKobo;
  const sendAmount = 30_000n;
  const affordable = balanceBeforeRace / sendAmount;
  const attempts = 6;
  const concurrent = await Promise.allSettled(
    Array.from({ length: attempts }, (_, i) =>
      sendP2PTransfer(db, { senderUserId: userA.id, recipientEmail: userB.email, amountKobo: sendAmount, idempotencyKey: `journey-race-${i}-${Date.now()}` })
    )
  );
  const okCount = concurrent.filter((r) => r.status === "fulfilled").length;
  const balanceA = (await walletOf(userA.id)).availableKobo;
  // Serializable isolation may abort some contention rather than queue it, so the
  // guarantee is "never more than affordable", not "exactly the maximum".
  check("no more concurrent sends succeed than the balance allows", BigInt(okCount) <= affordable, `${okCount} succeeded; ${affordable} affordable`);
  check("A never went negative", balanceA >= 0n, NGN(balanceA));
  check("A's balance matches the successful sends", balanceA === balanceBeforeRace - BigInt(okCount) * sendAmount, NGN(balanceA));
  check("at least one concurrent send completed", okCount > 0, `${okCount} succeeded`);

  let insufficientBlocked = false;
  try {
    await sendP2PTransfer(db, { senderUserId: userA.id, recipientEmail: userB.email, amountKobo: 5_000_000n, idempotencyKey: `journey-big-${Date.now()}` });
  } catch (e) {
    insufficientBlocked = (e as { code?: string }).code === "insufficient_funds";
  }
  check("insufficient funds is rejected", insufficientBlocked);

  let selfBlocked = false;
  try {
    await sendP2PTransfer(db, { senderUserId: userB.id, recipientEmail: userB.email, amountKobo: 1_000n, idempotencyKey: `journey-self-${Date.now()}` });
  } catch (e) {
    selfBlocked = (e as { code?: string }).code === "self_transfer";
  }
  check("self-transfer is rejected", selfBlocked);

  // ---- 5. Escrow: B funds a milestone, release pays the seller ----------
  console.log("\n5) Escrow milestone funded by B, released to the seller");
  const subtotal = 100_000n, commission = 8_000n, delivery = 5_000n;
  const total = subtotal + delivery; // matches checkout: total excludes commission
  const payable = subtotal - commission + delivery;

  const order = await db.order.create({
    data: {
      orderNumber: `ND-JOURNEY-${Date.now()}`,
      customerId: userB.id,
      vendorId: vendor.id,
      status: "delivered",
      deliveryAddress: "1 Test Street, Lagos",
      contactName: "Journey B",
      contactPhone: "08000000000",
      subtotalKobo: subtotal,
      commissionKobo: commission,
      deliveryFeeKobo: delivery,
      totalKobo: total
    }
  });
  await db.payment.create({
    data: { orderId: order.id, provider: "wallet", status: "COMPLETED", amountKobo: total, providerReference: `PAY-${order.id}`, idempotencyKey: `PAY-${order.id}` }
  });
  await db.escrowHold.create({ data: { orderId: order.id, amountKobo: total, status: "held", buyerWalletId: walletB.id, vendorWalletId: walletSeller.id, reason: "Journey escrow" } });

  // Fund exactly as recordEscrow does.
  await db.wallet.update({ where: { id: walletB.id }, data: { availableKobo: { decrement: total }, heldKobo: { increment: total } } });
  await db.wallet.update({ where: { id: walletSeller.id }, data: { heldKobo: { increment: total } } });
  await db.walletTransaction.create({
    data: {
      walletId: walletB.id, orderId: order.id, type: "hold", amountKobo: total, reference: `ESCROW-HOLD-${order.id}`,
      description: "Escrow hold",
      ledger: { create: [
        { walletId: walletB.id, direction: "DEBIT", amountKobo: total, memo: "Buyer wallet moved to escrow" },
        { walletId: walletSeller.id, direction: "CREDIT", amountKobo: total, memo: "Vendor payable held in escrow" }
      ] }
    }
  });
  check("escrow reserved from B", (await walletOf(userB.id)).heldKobo > 0n, NGN((await walletOf(userB.id)).heldKobo));

  await completeOrder(userB.id, order.id);
  const sellerAfter = await db.wallet.findFirstOrThrow({ where: { vendorId: vendor.id } });
  const sellerJournal = await journalNet(walletSeller.id);
  check("seller received the payable", sellerAfter.availableKobo === payable, `${NGN(sellerAfter.availableKobo)} vs ${NGN(payable)}`);
  check("seller stored balance equals its journal", sellerAfter.availableKobo + sellerAfter.heldKobo === sellerJournal, `${NGN(sellerAfter.availableKobo + sellerAfter.heldKobo)} vs ${NGN(sellerJournal)}`);
  check("seller holds nothing after release", sellerAfter.heldKobo === 0n, NGN(sellerAfter.heldKobo));
  check("buyer's escrow hold is cleared", (await walletOf(userB.id)).heldKobo === 0n, NGN((await walletOf(userB.id)).heldKobo));

  let doubleReleaseBlocked = false;
  try {
    await completeOrder(userB.id, order.id);
  } catch (e) {
    doubleReleaseBlocked = true;
  }
  check("repeated release is refused", doubleReleaseBlocked);
  check("seller was paid exactly once", (await db.wallet.findFirstOrThrow({ where: { vendorId: vendor.id } })).availableKobo === payable);

  // ---- 6. History reflects every event ----------------------------------
  console.log("\n6) History and receipts");
  const refsA = await db.walletTransaction.findMany({ where: { ledger: { some: { walletId: walletA.id } } }, select: { reference: true, type: true } });
  check("A's history includes the top-up", refsA.some((r) => r.reference.startsWith("TOPUP-")));
  check("A's history includes the outgoing transfer", refsA.some((r) => r.reference.startsWith("P2P-")));
  const refsB = await db.walletTransaction.findMany({ where: { ledger: { some: { walletId: walletB.id } } }, select: { reference: true } });
  check("B's history includes the incoming transfer", refsB.some((r) => r.reference.startsWith("P2P-")));
  check("B's history includes the escrow hold", refsB.some((r) => r.reference.startsWith("ESCROW-HOLD-")));
  const refsSeller = await db.walletTransaction.findMany({ where: { ledger: { some: { walletId: walletSeller.id } } }, select: { reference: true, type: true } });
  check("seller's history includes the release", refsSeller.some((r) => r.reference.startsWith("RELEASE-")));

  // ---- 7. Every affected wallet reconciles ------------------------------
  console.log("\n7) Reconciliation");
  for (const [label, walletId] of [["A", walletA.id], ["B", walletB.id], ["seller", walletSeller.id], ["platform", platform.id]] as const) {
    const w = await db.wallet.findUniqueOrThrow({ where: { id: walletId } });
    const net = await journalNet(walletId);
    // availableKobo is the wallet's whole journal position. heldKobo is the escrow
    // still open for that wallet, read from the escrow records rather than inferred
    // from journal residue: a release settles escrow without zeroing its history.
    const holds = await db.escrowHold.findMany({
      where: { status: { in: ["held", "disputed"] }, OR: [{ buyerWalletId: walletId }, { vendorWalletId: walletId }] }
    });
    const openEscrow = holds.reduce((sum, h) => sum + h.amountKobo, 0n);
    check(
      `${label} wallet reconciles`,
      w.availableKobo === net && w.heldKobo === openEscrow,
      `stored available ${NGN(w.availableKobo)} vs journal ${NGN(net)} | stored held ${NGN(w.heldKobo)} vs open escrow ${NGN(openEscrow)}`
    );
  }

  const whole = await db.$queryRawUnsafe<Array<{ credit: string; debit: string }>>(
    `SELECT COALESCE(SUM(CASE WHEN direction='CREDIT' THEN "amountKobo" END),0)::text AS credit, COALESCE(SUM(CASE WHEN direction='DEBIT' THEN "amountKobo" END),0)::text AS debit FROM "LedgerEntry"`
  );
  check("whole journal balances", whole[0].credit === whole[0].debit, `${NGN(BigInt(whole[0].credit))} vs ${NGN(BigInt(whole[0].debit))}`);

  const unbalanced = await db.$queryRawUnsafe<Array<{ n: string }>>(
    `SELECT COUNT(*)::text AS n FROM (SELECT t.id FROM "WalletTransaction" t JOIN "LedgerEntry" l ON l."transactionId" = t.id GROUP BY t.id HAVING SUM(CASE WHEN l.direction='CREDIT' THEN l."amountKobo" ELSE -l."amountKobo" END) <> 0) x`
  );
  check("no transaction in this journey is unbalanced", unbalanced[0].n === "0", `${unbalanced[0].n} unbalanced`);

  // ---- 8. Rejection path: unbalanced postings are impossible ------------
  console.log("\n8) The ledger refuses unbalanced postings");
  let unbalancedRejected = false;
  try {
    await postBalancedTransaction({
      tx: db,
      walletId: walletA.id,
      type: "credit",
      amountKobo: 1_000n,
      reference: `JOURNEY-UNBALANCED-${Date.now()}`,
      description: "should be rejected",
      entries: [{ walletId: walletA.id, direction: "CREDIT", amountKobo: 1_000n, memo: "unilateral credit" }]
    });
  } catch (e) {
    unbalancedRejected = (e as Error).message.includes("balance");
  }
  check("a unilateral credit is refused", unbalancedRejected);

  await db.$disconnect();
  console.log(`\n${pass} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("Failures:\n" + failures.map((f) => " - " + f).join("\n"));
    process.exit(1);
  }
})().catch(async (error) => {
  console.error(error);
  await db.$disconnect().catch(() => {});
  process.exit(1);
});
