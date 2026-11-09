#!/usr/bin/env node
/**
 * NaijaPay correction preview — read-only.
 *
 * Produces the evidence package a correction decision needs, without changing a
 * single row: classification, affected records, proposed treatment, before/after
 * journal totals and wallet balances, audit links and a recovery procedure.
 *
 * It also states plainly what a correction can and cannot achieve:
 *
 *   A balanced journal cannot erase an existing debit/credit difference. If the
 *   global figure is SUM(DEBIT) - SUM(CREDIT), adding equal amounts to both sides
 *   leaves it unchanged. The stated difference here therefore has to be explained
 *   by which rows are postings, not removed by posting more of them.
 *
 * Usage: node scripts/naijapay-correction-preview.cjs [--markdown]
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const NGN = (k) => "NGN " + (Number(k) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CASES = [
  {
    reference: "ADJ-PHASE07-FIXTURE-FUNDING-20261103",
    classification: "documentation_posted_as_money",
    summary:
      "A FIXTURE_EQUITY opening-equity recognition whose wallet line was written as a signed LedgerEntry while its memo says the correction was not applied. The equity posting carries the exact contra, so the two books cancel.",
    proposedTreatment: "restate_as_equity_only"
  },
  {
    reference: "GIGS-E2E-CLEANUP-CORRECTION-1",
    classification: "documentation_posted_as_money",
    summary:
      "A one-off NaijaGigs e2e cleanup that debited a customer wallet NGN 500 and credited SYSTEM NGN 60 in one transaction, with an NGN 440 FIXTURE_EQUITY contra. Written by direct create(), bypassing postBalancedTransaction.",
    proposedTreatment: "restate_as_equity_only"
  }
];

async function loadLedger() {
  const totals = await prisma.ledgerEntry.groupBy({ by: ["direction"], _sum: { amountKobo: true } });
  const credit = totals.find((t) => t.direction === "CREDIT")?._sum.amountKobo ?? 0n;
  const debit = totals.find((t) => t.direction === "DEBIT")?._sum.amountKobo ?? 0n;
  return { credit, debit, difference: credit - debit };
}

async function caseDetail(c) {
  const txn = await prisma.walletTransaction.findUnique({ where: { reference: c.reference }, include: { ledger: true } });
  if (!txn) return { ...c, found: false };
  const postings = await prisma.accountPosting.findMany({ where: { transactionId: txn.id }, include: { account: { select: { code: true, kind: true } } } });
  const walletNet = txn.ledger.reduce((s, e) => s + (e.direction === "CREDIT" ? e.amountKobo : -e.amountKobo), 0n);
  const equityNet = postings.reduce((s, p) => s + (p.direction === "CREDIT" ? p.amountKobo : -p.amountKobo), 0n);

  const wallets = [];
  for (const entry of txn.ledger) {
    const wallet = await prisma.wallet.findUnique({
      where: { id: entry.walletId },
      include: { user: { select: { email: true } }, vendor: { select: { name: true } } }
    });
    const ledgerNet = await prisma.ledgerEntry.groupBy({ by: ["direction"], where: { walletId: entry.walletId }, _sum: { amountKobo: true } });
    const net = ledgerNet.reduce((s, r) => s + (r.direction === "CREDIT" ? r._sum.amountKobo ?? 0n : -(r._sum.amountKobo ?? 0n)), 0n);
    wallets.push({
      walletId: entry.walletId,
      owner: wallet?.user?.email ?? wallet?.vendor?.name ?? wallet?.ownerType,
      entry: { direction: entry.direction, amountKobo: entry.amountKobo.toString(), memo: entry.memo },
      storedBefore: { availableKobo: (wallet?.availableKobo ?? 0n).toString(), heldKobo: (wallet?.heldKobo ?? 0n).toString() },
      journalNetBefore: net.toString(),
      storedAfterIfRestated: {
        // Restating moves the amount out of the wallet journal into equity, so the
        // stored balance must follow the journal by the same signed amount.
        availableKobo: ((wallet?.availableKobo ?? 0n) - (entry.direction === "CREDIT" ? entry.amountKobo : -entry.amountKobo)).toString(),
        heldKobo: (wallet?.heldKobo ?? 0n).toString()
      }
    });
  }

  const audit = await prisma.auditLog.findMany({
    where: { OR: [{ metadata: { path: ["reference"], equals: c.reference } }, { entityId: txn.id }] },
    select: { id: true, action: true, actorId: true, createdAt: true },
    take: 10
  });

  return {
    ...c,
    found: true,
    transactionId: txn.id,
    createdAt: txn.createdAt.toISOString(),
    walletNet: walletNet.toString(),
    equityNet: equityNet.toString(),
    combined: (walletNet + equityNet).toString(),
    journalBalances: walletNet + equityNet === 0n,
    entries: txn.ledger.map((e) => ({ direction: e.direction, amountKobo: e.amountKobo.toString(), memo: e.memo })),
    equity: postings.map((p) => ({ account: p.account.code, kind: p.account.kind, direction: p.direction, amountKobo: p.amountKobo.toString(), adjustmentId: p.adjustmentId })),
    wallets,
    auditLinks: audit.map((a) => ({ id: a.id, action: a.action, actorId: a.actorId, at: a.createdAt.toISOString() }))
  };
}

(async () => {
  const before = await loadLedger();
  const cases = [];
  for (const c of CASES) cases.push(await caseDetail(c));

  // Treatment: the two rows become equity-only. The wallet-journal difference they
  // create disappears because the rows stop being wallet postings; the total
  // journal difference is then zero only if nothing else is unbalanced.
  let restated = 0n;
  for (const c of cases) if (c.found) restated += BigInt(c.walletNet);
  const after = { credit: before.credit - (restated > 0n ? restated : 0n), debit: before.debit + (restated < 0n ? -restated : 0n) };

  const preview = {
    database: (await prisma.$queryRawUnsafe(`SELECT current_database() AS db`))[0].db,
    generatedAt: new Date().toISOString(),
    before: { creditKobo: before.credit.toString(), debitKobo: before.debit.toString(), differenceKobo: before.difference.toString() },
    cases,
    treatment: {
      name: "restate_as_equity_only",
      whatItDoes: [
        "Marks the two transactions as equity documentation rather than wallet postings.",
        "Moves their amounts out of the wallet journal into the FIXTURE_EQUITY book, where the contra already sits.",
        "Adjusts each affected wallet's stored balance by exactly the amount removed from its journal, so stored and journal stay equal."
      ],
      whatItDoesNotDo: [
        "It does not invent or write off any amount: the value is relocated between the two books that already hold it.",
        "It does not delete rows; originals carry a restatement link.",
        "A new balanced posting would NOT reduce the global difference — equal debits and credits leave it unchanged."
      ]
    },
    after: {
      // Only the wallet-journal side moves; the equity book already holds the contra,
      // so the global debit/credit difference across both books is unchanged at zero
      // when the books are read together.
      creditKobo: after.credit.toString(),
      debitKobo: after.debit.toString(),
      differenceKobo: (after.credit - after.debit).toString(),
      note:
        "This figure assumes the two rows are the only imbalance. Run naijapay-reconcile.cjs after any approval to confirm."
    },
    recovery: [
      "Snapshot the two WalletTransaction ids, their LedgerEntry ids and AccountPosting ids before applying anything.",
      "Apply inside one transaction with an idempotency key and a restatement reference per original.",
      "Re-run node scripts/naijapay-reconcile.cjs; wallets must remain 182/184 or improve, never worsen.",
      "To roll back: delete the restatement link and restore the recorded before-state from the snapshot; the originals were never edited."
    ],
    approvalRequired: true,
    appliesToSharedData: false
  };

  if (process.argv.includes("--markdown")) {
    const lines = [];
    lines.push("# NaijaPay correction preview\n");
    lines.push(`Database: \`${preview.database}\` · generated ${preview.generatedAt}\n`);
    lines.push("## Before\n");
    lines.push(`| Measure | Value |\n|---|---:|`);
    lines.push(`| Journal CREDIT | ${NGN(preview.before.creditKobo)} |`);
    lines.push(`| Journal DEBIT | ${NGN(preview.before.debitKobo)} |`);
    lines.push(`| Difference | ${NGN(preview.before.differenceKobo)} |\n`);
    for (const c of preview.cases) {
      lines.push(`## ${c.reference}\n`);
      if (!c.found) {
        lines.push("Not found in this database.\n");
        continue;
      }
      lines.push(`${c.summary}\n`);
      lines.push(`- Classification: \`${c.classification}\``);
      lines.push(`- Transaction: \`${c.transactionId}\` (${c.createdAt})`);
      lines.push(`- Wallet journal net: ${NGN(c.walletNet)}; equity net: ${NGN(c.equityNet)}; combined: ${NGN(c.combined)}`);
      lines.push(`- Both books balance: ${c.journalBalances}\n`);
      lines.push("| Account | Entry | Amount | Stored before | Stored after restatement |\n|---|---|---:|---:|---:|");
      for (const w of c.wallets) {
        lines.push(
          `| ${w.owner} (${w.walletId.slice(-8)}) | ${w.entry.direction} | ${NGN(w.entry.amountKobo)} | ${NGN(w.storedBefore.availableKobo)} | ${NGN(w.storedAfterIfRestated.availableKobo)} |`
        );
      }
      lines.push("");
      for (const w of c.wallets) lines.push(`- ${w.owner}: memo — ${w.entry.memo}`);
      for (const e of c.equity) lines.push(`- Equity: ${e.account} ${e.direction} ${NGN(e.amountKobo)}`);
      lines.push(`- Audit rows found: ${c.auditLinks.length}\n`);
    }
    lines.push("## Proposed treatment\n");
    for (const s of preview.treatment.whatItDoes) lines.push(`- ${s}`);
    lines.push("\n### What this does not do\n");
    for (const s of preview.treatment.whatItDoesNotDo) lines.push(`- ${s}`);
    lines.push("\n## After (projected)\n");
    lines.push(`Wallet journal CREDIT ${NGN(preview.after.creditKobo)} · DEBIT ${NGN(preview.after.debitKobo)} · difference ${NGN(preview.after.differenceKobo)}\n`);
    lines.push(preview.after.note + "\n");
    lines.push("## Recovery\n");
    for (const s of preview.recovery) lines.push(`1. ${s}`);
    lines.push("\n**Awaiting approval. Nothing has been applied; shared data is unchanged.**");
    console.log(lines.join("\n"));
  } else {
    console.log(JSON.stringify(preview, null, 2));
  }
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
