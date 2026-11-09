/**
 * Milestone escrow permissions and state-machine test — isolated schema.
 *
 * Proves the directives for Phase 4: only the right party can move a milestone,
 * transitions are enforced, and no sequence of requests can release or refund
 * the same money twice.
 *
 * Usage: npx tsx scripts/naijapay-milestone-test.ts
 */
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/auth/password";

const SCHEMA = "naijapay_milestone_test";
const base = (process.env.DATABASE_URL ?? "").replace(/^"|"$/g, "");
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
const codeOf = (e: unknown) => (e as { code?: string }).code;

const db = new PrismaClient({ datasources: { db: { url } } });

(async () => {
  // Fresh schema each run so repeated execution cannot mask a leak.
  const admin = new PrismaClient();
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${SCHEMA}"`);
  await admin.$disconnect();
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });

  process.env.DATABASE_URL = url;
  const { createMilestone, transitionMilestone } = await import("../lib/services/core/milestone.service");

  const passwordHash = await hashPassword("MilestoneTest123!");
  const stamp = Date.now();
  const payer = await db.user.create({ data: { email: `ms-payer-${stamp}@naijadeals.test`, name: "Payer", passwordHash, actorType: "CUSTOMER" } });
  const payee = await db.user.create({ data: { email: `ms-payee-${stamp}@naijadeals.test`, name: "Payee", passwordHash, actorType: "CUSTOMER" } });
  const stranger = await db.user.create({ data: { email: `ms-stranger-${stamp}@naijadeals.test`, name: "Stranger", passwordHash, actorType: "CUSTOMER" } });
  // A real user row: the ledger's audit trail has a foreign key to User, and a
  // made-up administrator id must be rejected rather than silently recorded.
  const adminUser = await db.user.create({ data: { email: `ms-admin-${stamp}@naijadeals.test`, name: "Milestone Admin", passwordHash, actorType: "CUSTOMER" } });

  const payerWallet = await db.wallet.create({ data: { ownerType: "CUSTOMER", userId: payer.id, availableKobo: 500_000n } });
  await db.wallet.create({ data: { ownerType: "CUSTOMER", userId: payee.id } });
  await db.wallet.create({ data: { ownerType: "CUSTOMER", userId: stranger.id, availableKobo: 500_000n } });

  const amount = 100_000n;

  // ---- creation ---------------------------------------------------------
  console.log("\n1) Creation and permissions");
  const milestone = await createMilestone(db, { payerUserId: payer.id, payeeEmail: payee.email, title: "Logo design", amountKobo: amount });
  check("milestone starts awaiting funding", milestone.status === "awaiting_funding", milestone.status);

  let selfBlocked = false;
  try {
    await createMilestone(db, { payerUserId: payer.id, payeeEmail: payer.email, title: "Self deal", amountKobo: amount });
  } catch (e) {
    selfBlocked = codeOf(e) === "self_milestone";
  }
  check("cannot create a milestone with yourself", selfBlocked);

  let strangerFundBlocked = false;
  try {
    await transitionMilestone(db, { reference: milestone.reference, actorId: stranger.id, action: "fund" });
  } catch (e) {
    strangerFundBlocked = codeOf(e) === "milestone_not_found";
  }
  check("a stranger cannot act on someone else's milestone", strangerFundBlocked);

  let payeeFundBlocked = false;
  try {
    await transitionMilestone(db, { reference: milestone.reference, actorId: payee.id, action: "fund" });
  } catch (e) {
    payeeFundBlocked = codeOf(e) === "milestone_forbidden";
  }
  check("the payee cannot fund their own milestone", payeeFundBlocked);

  // ---- funding ----------------------------------------------------------
  console.log("\n2) Funding reserves the payer's money");
  const funded = await transitionMilestone(db, { reference: milestone.reference, actorId: payer.id, action: "fund" });
  check("status becomes funded", funded.status === "funded", funded.status);
  const payerAfterFund = await db.wallet.findUniqueOrThrow({ where: { id: payerWallet.id } });
  check("payer available fell by the amount", payerAfterFund.availableKobo === 500_000n - amount, NGN(payerAfterFund.availableKobo));
  check("payer holds the amount", payerAfterFund.heldKobo === amount, NGN(payerAfterFund.heldKobo));

  let doubleFundBlocked = false;
  try {
    await transitionMilestone(db, { reference: milestone.reference, actorId: payer.id, action: "fund" });
  } catch (e) {
    doubleFundBlocked = codeOf(e) === "invalid_milestone_transition" || codeOf(e) === "milestone_conflict";
  }
  check("funding twice is refused", doubleFundBlocked);
  check("payer was debited once", (await db.wallet.findUniqueOrThrow({ where: { id: payerWallet.id } })).availableKobo === 500_000n - amount);

  // ---- delivery ---------------------------------------------------------
  console.log("\n3) Submission, acceptance and release");
  let payerSubmitBlocked = false;
  try {
    await transitionMilestone(db, { reference: milestone.reference, actorId: payer.id, action: "submit" });
  } catch (e) {
    payerSubmitBlocked = codeOf(e) === "milestone_forbidden";
  }
  check("the payer cannot submit work on the payee's behalf", payerSubmitBlocked);

  const submitted = await transitionMilestone(db, { reference: milestone.reference, actorId: payee.id, action: "submit" });
  check("payee can submit", submitted.status === "submitted", submitted.status);

  let payeeAcceptBlocked = false;
  try {
    await transitionMilestone(db, { reference: milestone.reference, actorId: payee.id, action: "accept" });
  } catch (e) {
    payeeAcceptBlocked = codeOf(e) === "milestone_forbidden";
  }
  check("the payee cannot accept their own work", payeeAcceptBlocked);

  await transitionMilestone(db, { reference: milestone.reference, actorId: payer.id, action: "accept" });
  const released = await transitionMilestone(db, { reference: milestone.reference, actorId: payer.id, action: "release" });
  check("milestone is released", released.status === "released", released.status);

  const payeeWallet = await db.wallet.findFirstOrThrow({ where: { userId: payee.id } });
  check("payee received the amount", payeeWallet.availableKobo === amount, NGN(payeeWallet.availableKobo));
  check("payer holds nothing", (await db.wallet.findUniqueOrThrow({ where: { id: payerWallet.id } })).heldKobo === 0n);

  // ---- double settlement ------------------------------------------------
  console.log("\n4) The same money cannot be released or refunded twice");
  let releaseAgainBlocked = false;
  try {
    await transitionMilestone(db, { reference: milestone.reference, actorId: payer.id, action: "release" });
  } catch (e) {
    releaseAgainBlocked = codeOf(e) === "invalid_milestone_transition";
  }
  check("second release refused", releaseAgainBlocked);

  let refundAfterReleaseBlocked = false;
  try {
    await transitionMilestone(db, { reference: milestone.reference, actorId: payer.id, action: "refund" });
  } catch (e) {
    refundAfterReleaseBlocked = codeOf(e) === "invalid_milestone_transition";
  }
  check("refund after release refused", refundAfterReleaseBlocked);
  check("payee still has exactly one payment", (await db.wallet.findFirstOrThrow({ where: { userId: payee.id } })).availableKobo === amount);

  // Concurrent release attempts on a fresh milestone.
  const m2 = await createMilestone(db, { payerUserId: payer.id, payeeEmail: payee.email, title: "Banner design", amountKobo: 50_000n });
  await transitionMilestone(db, { reference: m2.reference, actorId: payer.id, action: "fund" });
  await transitionMilestone(db, { reference: m2.reference, actorId: payee.id, action: "submit" });
  await transitionMilestone(db, { reference: m2.reference, actorId: payer.id, action: "accept" });
  const payeeBefore = (await db.wallet.findFirstOrThrow({ where: { userId: payee.id } })).availableKobo;
  const race = await Promise.allSettled([
    transitionMilestone(db, { reference: m2.reference, actorId: payer.id, action: "release" }),
    transitionMilestone(db, { reference: m2.reference, actorId: payer.id, action: "release" })
  ]);
  const releaseCount = race.filter((r) => r.status === "fulfilled").length;
  const payeeAfter = (await db.wallet.findFirstOrThrow({ where: { userId: payee.id } })).availableKobo;
  check("concurrent releases settle once", payeeAfter - payeeBefore === 50_000n, `${releaseCount} succeeded, delta ${NGN(payeeAfter - payeeBefore)}`);

  // ---- dispute ----------------------------------------------------------
  console.log("\n5) Disputes block release until an administrator decides");
  const m3 = await createMilestone(db, { payerUserId: payer.id, payeeEmail: payee.email, title: "Website copy", amountKobo: 40_000n });
  await transitionMilestone(db, { reference: m3.reference, actorId: payer.id, action: "fund" });
  const disputed = await transitionMilestone(db, { reference: m3.reference, actorId: payee.id, action: "dispute", note: "Scope grew" });
  check("either party can dispute", disputed.status === "disputed", disputed.status);

  let payerReleaseWhileDisputed = false;
  try {
    await transitionMilestone(db, { reference: m3.reference, actorId: payer.id, action: "release" });
  } catch (e) {
    payerReleaseWhileDisputed = true;
  }
  check("a disputed milestone cannot be released by the payer", payerReleaseWhileDisputed);

  const adminResolved = await transitionMilestone(db, { reference: m3.reference, actorId: adminUser.id, action: "release", isAdmin: true, note: "Admin accepted evidence" });
  check("an administrator can resolve the dispute", adminResolved.status === "released", adminResolved.status);

  // ---- cancellation and refund -----------------------------------------
  console.log("\n6) Cancellation and refund");
  const m4 = await createMilestone(db, { payerUserId: payer.id, payeeEmail: payee.email, title: "Podcast edit", amountKobo: 30_000n });
  const cancelled = await transitionMilestone(db, { reference: m4.reference, actorId: payer.id, action: "cancel" });
  check("an unfunded milestone can be cancelled", cancelled.status === "cancelled", cancelled.status);

  const m5 = await createMilestone(db, { payerUserId: payer.id, payeeEmail: payee.email, title: "Photo shoot", amountKobo: 25_000n });
  await transitionMilestone(db, { reference: m5.reference, actorId: payer.id, action: "fund" });
  const payerBeforeRefund = (await db.wallet.findUniqueOrThrow({ where: { id: payerWallet.id } })).availableKobo;
  const refunded = await transitionMilestone(db, { reference: m5.reference, actorId: payer.id, action: "refund", note: "Cancelled the shoot" });
  check("funded milestone can be refunded", refunded.status === "refunded", refunded.status);
  const payerAfterRefund = (await db.wallet.findUniqueOrThrow({ where: { id: payerWallet.id } })).availableKobo;
  check("refund returns exactly the held amount", payerAfterRefund - payerBeforeRefund === 25_000n, NGN(payerAfterRefund - payerBeforeRefund));
  check("no funds remain held", (await db.wallet.findUniqueOrThrow({ where: { id: payerWallet.id } })).heldKobo === 0n);

  let cancelFunded = false;
  try {
    await transitionMilestone(db, { reference: m5.reference, actorId: payer.id, action: "cancel" });
  } catch (e) {
    cancelFunded = true;
  }
  check("a refunded milestone cannot be cancelled", cancelFunded);

  // ---- reconciliation ---------------------------------------------------
  console.log("\n7) Ledger reconciliation");
  const whole = await db.$queryRawUnsafe<Array<{ credit: string; debit: string }>>(
    `SELECT COALESCE(SUM(CASE WHEN direction='CREDIT' THEN "amountKobo" END),0)::text AS credit, COALESCE(SUM(CASE WHEN direction='DEBIT' THEN "amountKobo" END),0)::text AS debit FROM "LedgerEntry"`
  );
  check("the milestone journal balances", whole[0].credit === whole[0].debit, `${NGN(BigInt(whole[0].credit))} vs ${NGN(BigInt(whole[0].debit))}`);

  const unbalanced = await db.$queryRawUnsafe<Array<{ n: string }>>(
    `SELECT COUNT(*)::text AS n FROM (SELECT t.id FROM "WalletTransaction" t JOIN "LedgerEntry" l ON l."transactionId"=t.id GROUP BY t.id HAVING SUM(CASE WHEN l.direction='CREDIT' THEN l."amountKobo" ELSE -l."amountKobo" END)<>0) x`
  );
  check("no milestone transaction is unbalanced", unbalanced[0].n === "0", `${unbalanced[0].n} unbalanced`);

  const payerFinal = await db.wallet.findUniqueOrThrow({ where: { id: payerWallet.id } });
  const payerJournal = await db.ledgerEntry.groupBy({ by: ["direction"], where: { walletId: payerWallet.id }, _sum: { amountKobo: true } });
  const payerNet = payerJournal.reduce((s, r) => s + (r.direction === "CREDIT" ? r._sum.amountKobo ?? 0n : -(r._sum.amountKobo ?? 0n)), 0n);
  // The payer wallet was seeded with a stored balance and no journal entry, so
  // compare the CHANGE rather than the absolute value: the seed is the only gap.
  const SEED = 500_000n;
  const payerStoredChange = payerFinal.availableKobo + payerFinal.heldKobo - SEED;
  check(
    "payer's balance change equals the journal change",
    payerStoredChange === payerNet,
    `changed ${NGN(payerStoredChange)} vs journal ${NGN(payerNet)}`
  );

  for (const [label, userId] of [["payer", payer.id], ["payee", payee.id]] as const) {
    const w = await db.wallet.findFirstOrThrow({ where: { userId } });
    const rows = await db.ledgerEntry.groupBy({ by: ["direction"], where: { walletId: w.id }, _sum: { amountKobo: true } });
    const net = rows.reduce((s, r) => s + (r.direction === "CREDIT" ? r._sum.amountKobo ?? 0n : -(r._sum.amountKobo ?? 0n)), 0n);
    const seed = label === "payer" ? SEED : 0n;
    check(
      `${label} stored balance equals journal plus its seed`,
      w.availableKobo + w.heldKobo - seed === net,
      `stored ${NGN(w.availableKobo + w.heldKobo)} vs journal ${NGN(net)}`
    );
  }

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
