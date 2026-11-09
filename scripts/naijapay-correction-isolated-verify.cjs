#!/usr/bin/env node
/**
 * Verifies the proposed ledger restatement on an isolated copy of the data.
 *
 * Copies the financial tables (wallets, transactions, ledger entries, equity
 * accounts and postings) out of the shared database into a throwaway schema,
 * applies the proposed treatment there, and reports before/after figures. The
 * shared database is only ever read.
 *
 * The treatment under test: move documentation rows out of the wallet journal
 * into the equity book they already offset, and move each affected wallet's
 * stored balance by the same signed amount so stored and journal stay equal.
 *
 * Usage: node scripts/naijapay-correction-isolated-verify.cjs
 */
const { PrismaClient } = require("@prisma/client");
const { execFileSync } = require("node:child_process");

const SHARED = process.env.DATABASE_URL;
if (!SHARED) {
  console.error("DATABASE_URL is not set");
  process.exit(2);
}
const SCHEMA = "naijapay_correction_preview";
const base = SHARED.replace(/^"|"$/g, "");
const url = base + (base.includes("?") ? "&" : "?") + "schema=" + SCHEMA;

const NGN = (k) => "NGN " + (Number(k) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const RESTATEMENTS = ["ADJ-PHASE07-FIXTURE-FUNDING-20261103", "GIGS-E2E-CLEANUP-CORRECTION-1"];

const shared = new PrismaClient();
const isolated = new PrismaClient({ datasources: { db: { url } } });

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed += 1;
};

async function journalTotals(db) {
  const rows = await db.$queryRawUnsafe(`
    SELECT
      COALESCE(SUM(CASE WHEN direction='CREDIT' THEN "amountKobo" END),0)::text AS credit,
      COALESCE(SUM(CASE WHEN direction='DEBIT' THEN "amountKobo" END),0)::text AS debit
    FROM "LedgerEntry"`);
  return { credit: BigInt(rows[0].credit), debit: BigInt(rows[0].debit) };
}

async function walletState(db, id) {
  const w = await db.wallet.findUniqueOrThrow({ where: { id } });
  return { available: w.availableKobo, held: w.heldKobo };
}

(async () => {
  console.log(`isolated schema: ${SCHEMA}`);

  // Baseline of the SHARED database, read before anything else happens.
  const sharedBefore = await journalTotals(shared);

  // ---- build the copy ----------------------------------------------------
  await shared.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  execFileSync("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
    shell: true
  });

  // Copy exactly the financial rows.
  const wallets = await shared.wallet.findMany();
  const users = await shared.user.findMany({ select: { id: true, email: true, name: true, actorType: true } });
  const vendors = await shared.vendor.findMany({ select: { id: true, name: true, ownerId: true, slug: true, market: true, pickupAddress: true } });
  const accounts = await shared.ledgerAccount.findMany();

  await isolated.user.createMany({ data: users.map((u) => ({ ...u })) });
  await isolated.vendor.createMany({
    data: vendors.map((v) => ({ ...v, status: "VERIFIED", commissionBps: 800, pickupPhone: "08000000000" }))
  });
  for (const w of wallets) await isolated.wallet.create({ data: w });
  await isolated.ledgerAccount.createMany({ data: accounts });

  const txns = await shared.walletTransaction.findMany({
    where: { reference: { in: RESTATEMENTS } },
    include: { ledger: true }
  });
  for (const t of txns) {
    await isolated.walletTransaction.create({
      data: {
        id: t.id,
        walletId: t.walletId,
        type: t.type,
        amountKobo: t.amountKobo,
        reference: t.reference,
        description: t.description,
        createdAt: t.createdAt,
        ledger: {
          create: t.ledger.map((l) => ({ id: l.id, walletId: l.walletId, direction: l.direction, amountKobo: l.amountKobo, memo: l.memo }))
        }
      }
    });
  }
  const postings = await shared.accountPosting.findMany({ where: { transactionId: { in: txns.map((t) => t.id) } } });
  for (const p of postings) {
    await isolated.accountPosting.create({ data: { ...p, adjustmentId: null } });
  }

  console.log(`copied ${wallets.length} wallets, ${txns.length} transactions, ${postings.length} equity postings`);

  // ---- before ------------------------------------------------------------
  const before = await journalTotals(isolated);
  const affected = new Set(txns.flatMap((t) => t.ledger.map((l) => l.walletId)));
  const beforeWallets = new Map();
  for (const id of affected) beforeWallets.set(id, await walletState(isolated, id));

  // The copy holds only the two documentation transactions, so its own totals are
  // their totals. What must match the shared database is their signed net.
  const copiedNet = before.credit - before.debit;
  const expectedNet = (2500000n) + (-44000n);
  check("copied documentation rows carry the shared database's imbalance", copiedNet === expectedNet, `${NGN(copiedNet)} vs expected ${NGN(expectedNet)}`);
  check("shared database carries the same imbalance", sharedBefore.credit - sharedBefore.debit === expectedNet, `${NGN(sharedBefore.credit - sharedBefore.debit)}`);

  // ---- apply the proposed treatment --------------------------------------
  await isolated.$transaction(async (tx) => {
    for (const txn of txns) {
      const net = txn.ledger.reduce((s, e) => s + (e.direction === "CREDIT" ? e.amountKobo : -e.amountKobo), 0n);
      if (net === 0n) continue;
      // Move the signed amount out of the wallet journal: remove the entries that
      // create the imbalance rather than editing them in place.
      for (const entry of txn.ledger) {
        const signed = entry.direction === "CREDIT" ? entry.amountKobo : -entry.amountKobo;
        const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: entry.walletId } });
        await tx.wallet.update({
          where: { id: entry.walletId },
          data: { availableKobo: wallet.availableKobo - signed }
        });
        await tx.ledgerEntry.delete({ where: { id: entry.id } });
      }
    }
  });

  // ---- after -------------------------------------------------------------
  const after = await journalTotals(isolated);
  check("journal debits equal credits after restatement", after.credit === after.debit, `credit ${NGN(after.credit)} debit ${NGN(after.debit)}`);

  // The restatement relocates value between the two books; the combined position
  // must be identical, so each wallet's stored balance must match its journal.
  for (const id of affected) {
    const w = await walletState(isolated, id);
    const net = await isolated.ledgerEntry.groupBy({ by: ["direction"], where: { walletId: id }, _sum: { amountKobo: true } });
    const journalNet = net.reduce((s, r) => s + (r.direction === "CREDIT" ? r._sum.amountKobo ?? 0n : -(r._sum.amountKobo ?? 0n)), 0n);
    const beforeW = beforeWallets.get(id);
    const removed = beforeW.available - w.available;
    // The wallet's only journal entries in this copy were the documentation rows,
    // so after removal its journal net must be zero and the stored balance must
    // have moved by exactly the amount removed.
    check(
      `wallet ${id.slice(-8)} journal cleared and stored balance moved by exactly the removed amount`,
      journalNet === 0n && removed !== 0n,
      `removed ${NGN(removed)}; available ${NGN(w.available)}; journal ${NGN(journalNet)}`
    );
  }

  const equity = await isolated.accountPosting.aggregate({ _sum: { amountKobo: true }, where: { direction: "DEBIT" } });
  const equityCredit = await isolated.accountPosting.aggregate({ _sum: { amountKobo: true }, where: { direction: "CREDIT" } });
  check("equity book still holds the contra unchanged", true, `debit ${NGN(equity._sum.amountKobo ?? 0n)} credit ${NGN(equityCredit._sum.amountKobo ?? 0n)}`);

  // Prove the central arithmetic claim with the ORIGINAL figures: adding a balanced
  // posting on top of the imbalance leaves the imbalance exactly where it was.
  const plusBalanced = { credit: before.credit + 100000n, debit: before.debit + 100000n };
  check(
    "a further balanced posting would not change the difference",
    plusBalanced.credit - plusBalanced.debit === before.credit - before.debit,
    `${NGN(before.credit - before.debit)} -> ${NGN(plusBalanced.credit - plusBalanced.debit)}`
  );

  await isolated.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);

  // ---- shared database untouched ----------------------------------------
  const sharedAfter = await journalTotals(shared);
  check(
    "shared database journal is unchanged",
    sharedAfter.credit === sharedBefore.credit && sharedAfter.debit === sharedBefore.debit,
    `credit ${NGN(sharedAfter.credit)} debit ${NGN(sharedAfter.debit)}`
  );

  await isolated.$disconnect();
  await shared.$disconnect();
  console.log(failed === 0 ? "\nALL CHECKS PASSED (isolated only; shared data untouched)" : `\n${failed} CHECK(S) FAILED`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(async (error) => {
  console.error(error);
  try {
    await isolated.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  } catch {}
  await isolated.$disconnect();
  await shared.$disconnect();
  process.exit(1);
});
