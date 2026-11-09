#!/usr/bin/env node
/**
 * NaijaPay reconciliation report — read-only.
 *
 * Reproduces the wallet reconciliation against current data and separates the
 * four things the directive asks to be distinguished:
 *   1. global journal debit/credit imbalance,
 *   2. per-wallet stored-vs-journal differences,
 *   3. documentation rows counted as financial entries,
 *   4. which records are test fixtures and which are genuine activity.
 *
 * Writes nothing. Usage: node scripts/naijapay-reconcile.cjs [--json]
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const NGN = (k) => "NGN " + (Number(k) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ESCROW = /ESCROW-HOLD|RELEASE-/i;
const TESTISH = /^(ADJ-PHASE07|GIGS-E2E|SHOP-REVIEW-FUNDING|SEED-|RIDE-.*-HOLD|.*-E2E-.*|.*-TEST-.*)/i;

async function report() {
  const [{ db }] = await prisma.$queryRawUnsafe(`SELECT current_database() AS db`);

  // 1. journal totals
  const totals = await prisma.ledgerEntry.groupBy({ by: ["direction"], _sum: { amountKobo: true }, _count: { _all: true } });
  const credit = totals.find((t) => t.direction === "CREDIT")?._sum.amountKobo ?? 0n;
  const debit = totals.find((t) => t.direction === "DEBIT")?._sum.amountKobo ?? 0n;

  // 2. documentation rows written as postings
  const unbalanced = await prisma.$queryRawUnsafe(`
    SELECT t.id, t.reference, t."createdAt"::text AS created,
           (SUM(CASE WHEN l.direction='CREDIT' THEN l."amountKobo" ELSE -l."amountKobo" END))::text AS net
    FROM "WalletTransaction" t JOIN "LedgerEntry" l ON l."transactionId" = t.id
    GROUP BY t.id, t.reference, t."createdAt"
    HAVING SUM(CASE WHEN l.direction='CREDIT' THEN l."amountKobo" ELSE -l."amountKobo" END) <> 0
    ORDER BY t."createdAt"`);

  const postings = await prisma.accountPosting.findMany({ include: { account: { select: { code: true } } } });
  const byTxn = new Map();
  for (const p of postings) {
    const list = byTxn.get(p.transactionId) ?? [];
    list.push(p);
    byTxn.set(p.transactionId, list);
  }

  const docs = [];
  for (const row of unbalanced) {
    const entries = await prisma.ledgerEntry.findMany({ where: { transactionId: row.id } });
    const equity = byTxn.get(row.id) ?? [];
    const equityNet = equity.reduce((s, p) => s + (p.direction === "CREDIT" ? p.amountKobo : -p.amountKobo), 0n);
    docs.push({
      reference: row.reference,
      created: row.created,
      walletNet: row.net,
      equityNet: equityNet.toString(),
      combined: (BigInt(row.net) + equityNet).toString(),
      entries: entries.map((e) => ({ direction: e.direction, amountKobo: e.amountKobo.toString(), walletId: e.walletId, memo: e.memo })),
      equity: equity.map((p) => ({ account: p.account.code, direction: p.direction, amountKobo: p.amountKobo.toString(), adjustmentId: p.adjustmentId }))
    });
  }

  // 3. per-wallet invariant
  const journals = await prisma.ledgerEntry.findMany({ select: { walletId: true, direction: true, amountKobo: true, transaction: { select: { reference: true } } } });
  const net = new Map();
  const escrow = new Map();
  for (const e of journals) {
    const v = e.direction === "CREDIT" ? e.amountKobo : -e.amountKobo;
    net.set(e.walletId, (net.get(e.walletId) ?? 0n) + v);
    if (ESCROW.test(e.transaction.reference)) escrow.set(e.walletId, (escrow.get(e.walletId) ?? 0n) + v);
  }
  const wallets = await prisma.wallet.findMany({
    include: { user: { select: { email: true, name: true } }, vendor: { select: { name: true } } },
    orderBy: { id: "asc" }
  });
  const exceptions = [];
  let reconciled = 0;
  for (const w of wallets) {
    const journalNet = net.get(w.id) ?? 0n;
    const escrowNet = escrow.get(w.id) ?? 0n;
    const availDelta = w.availableKobo - journalNet;
    const escrowMagnitude = escrowNet < 0n ? -escrowNet : escrowNet;
    const heldDelta = w.heldKobo - escrowMagnitude;
    if (availDelta === 0n && heldDelta === 0n) {
      reconciled++;
      continue;
    }
    const refs = journals.filter((e) => e.walletId === w.id);
    const testish = refs.filter((e) => TESTISH.test(e.transaction.reference)).length;
    exceptions.push({
      walletId: w.id,
      owner: w.user?.email ?? w.vendor?.name ?? w.ownerType,
      ownerType: w.ownerType,
      domainTest: w.user?.email?.endsWith(".local") || w.user?.email?.endsWith(".demo") || false,
      availableKobo: w.availableKobo.toString(),
      heldKobo: w.heldKobo.toString(),
      journalNet: journalNet.toString(),
      escrowNet: escrowNet.toString(),
      availableDelta: availDelta.toString(),
      heldDelta: heldDelta.toString(),
      entryCount: refs.length,
      testReferenceEntries: testish
    });
  }

  // 4. equity accounts vs their own postings
  const accounts = await prisma.ledgerAccount.findMany({ include: { postings: true } });
  const accountDrift = accounts
    .map((a) => {
      const derived = a.postings.reduce((s, p) => s + (p.direction === "CREDIT" ? p.amountKobo : -p.amountKobo), 0n);
      return { code: a.code, cached: a.balanceKobo.toString(), derived: derived.toString(), ok: derived === a.balanceKobo, postings: a.postings.length };
    })
    .filter((a) => !a.ok);

  return {
    database: db,
    generatedAt: new Date().toISOString(),
    journal: {
      creditKobo: credit.toString(),
      debitKobo: debit.toString(),
      differenceKobo: (credit - debit).toString(),
      entryCount: journals.length
    },
    wallets: { total: wallets.length, reconciled, exceptions: exceptions.length },
    documentationRows: docs,
    walletExceptions: exceptions,
    equityAccountDrift: accountDrift
  };
}

(async () => {
  const data = await report();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(data, null, 2));
    await prisma.$disconnect();
    return;
  }
  console.log(`database: ${data.database}`);
  console.log(`journal: CREDIT ${NGN(data.journal.creditKobo)} | DEBIT ${NGN(data.journal.debitKobo)} | difference ${NGN(data.journal.differenceKobo)}`);
  console.log(`wallets: ${data.wallets.total} total, ${data.wallets.reconciled} reconciled, ${data.wallets.exceptions} exceptions`);
  console.log("\nDocumentation rows carried as postings:");
  for (const d of data.documentationRows) {
    console.log(`  ${d.reference}  wallet ${NGN(d.walletNet)} + equity ${NGN(d.equityNet)} = ${NGN(d.combined)}${d.combined === "0" ? "  (both books balance)" : "  <-- UNEXPLAINED"}`);
  }
  console.log("\nWallet exceptions:");
  for (const e of data.walletExceptions) {
    console.log(`  ${e.owner} (${e.walletId.slice(-8)}) ${e.ownerType}`);
    console.log(`     available ${NGN(e.availableKobo)} delta ${NGN(e.availableDelta)} | held ${NGN(e.heldKobo)} delta ${NGN(e.heldDelta)}`);
    console.log(`     domain-marked test account: ${e.domainTest} | entries ${e.entryCount} (${e.testReferenceEntries} with test references)`);
  }
  console.log(`\nEquity account drift: ${data.equityAccountDrift.length === 0 ? "none" : JSON.stringify(data.equityAccountDrift)}`);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
