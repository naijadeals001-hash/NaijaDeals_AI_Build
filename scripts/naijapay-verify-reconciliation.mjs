#!/usr/bin/env node
/**
 * Read-only verification of the NaijaPay ledger findings.
 *
 * Distinguishes three separate things that the earlier forensic note mixed
 * together:
 *   1. Global journal balance: SUM(CREDIT) vs SUM(DEBIT) across the whole
 *      LedgerEntry table. A balanced posting cannot change this difference.
 *   2. Wallet-to-ledger deltas: stored Wallet.balanceKobo vs the ledger net
 *      for that wallet.
 *   3. Non-posting rows: transactions whose entries and memo show they were
 *      written as documentation ("correction; not applied") rather than as
 *      money movement.
 *
 * Writes nothing. Safe to run against the shared database.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const NGN = (kobo) => "₦" + (Number(kobo) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const dbName = url.split("/").pop()?.split("?")[0] ?? "(unknown)";
  console.log("=== 1. ENVIRONMENT IDENTITY ===");
  console.log(`database: ${dbName}`);
  const [{ now }] = await prisma.$queryRawUnsafe("SELECT now()::text AS now");
  console.log(`server time: ${now}`);

  // ---------------------------------------------------------------- journal
  console.log("\n=== 2. GLOBAL JOURNAL BALANCE ===");
  const totals = await prisma.ledgerEntry.groupBy({
    by: ["direction"],
    _sum: { amountKobo: true },
    _count: { _all: true }
  });
  const credit = totals.find((t) => t.direction === "CREDIT")?._sum.amountKobo ?? 0n;
  const debit = totals.find((t) => t.direction === "DEBIT")?._sum.amountKobo ?? 0n;
  const creditCount = totals.find((t) => t.direction === "CREDIT")?._count._all ?? 0;
  const debitCount = totals.find((t) => t.direction === "DEBIT")?._count._all ?? 0;
  console.log(`CREDIT ${NGN(credit)} (${creditCount} entries)`);
  console.log(`DEBIT  ${NGN(debit)} (${debitCount} entries)`);
  console.log(`difference (credit - debit): ${NGN(credit - debit)}`);

  // ------------------------------------------------- unbalanced transactions
  console.log("\n=== 3. UNBALANCED TRANSACTIONS (journal integrity) ===");
  const unbalanced = await prisma.$queryRawUnsafe(`
    SELECT t.id, t.reference, t.type::text AS type, t."createdAt"::text AS created,
           COUNT(l.id)::int AS entries,
           SUM(CASE WHEN l.direction = 'CREDIT' THEN l."amountKobo" ELSE -l."amountKobo" END)::text AS net
    FROM "WalletTransaction" t
    JOIN "LedgerEntry" l ON l."transactionId" = t.id
    GROUP BY t.id, t.reference, t.type, t."createdAt"
    HAVING SUM(CASE WHEN l.direction = 'CREDIT' THEN l."amountKobo" ELSE -l."amountKobo" END) <> 0
    ORDER BY t."createdAt"
  `);
  if (unbalanced.length === 0) console.log("none");
  let unbalancedNet = 0n;
  for (const t of unbalanced) {
    unbalancedNet += BigInt(t.net);
    console.log(`${t.reference}\n  type=${t.type} entries=${t.entries} net=${NGN(t.net)} created=${t.created}`);
  }
  console.log(`sum of unbalanced nets: ${NGN(unbalancedNet)}  (expected to equal the journal difference above)`);

  // ---------------------------------------------------------- wallet report
  console.log("\n=== 4. WALLET RECONCILIATION ===");
  const wallets = await prisma.wallet.findMany({
    select: {
      id: true,
      ownerType: true,
      availableKobo: true,
      heldKobo: true,
      currency: true,
      userId: true,
      vendorId: true,
      user: { select: { id: true, email: true, name: true, actorType: true, roles: true, createdAt: true } }
    },
    orderBy: { id: "asc" }
  });
  const netByWallet = new Map();
  for (const row of await prisma.ledgerEntry.groupBy({ by: ["walletId", "direction"], _sum: { amountKobo: true } })) {
    const cur = netByWallet.get(row.walletId) ?? 0n;
    netByWallet.set(row.walletId, row.direction === "CREDIT" ? cur + row._sum.amountKobo : cur - row._sum.amountKobo);
  }
  let reconciled = 0;
  const exceptions = [];
  for (const w of wallets) {
    const ledgerNet = netByWallet.get(w.id) ?? 0n;
    const stored = w.availableKobo + w.heldKobo;
    const delta = stored - ledgerNet;
    if (delta === 0n) reconciled++;
    else exceptions.push({ wallet: w, stored, ledgerNet, delta });
  }
  console.log(`wallets: ${wallets.length}  reconciled: ${reconciled}  exceptions: ${exceptions.length}`);
  // A wallet with a ledger net but no wallet row would mean entries point at a
  // deleted wallet; report that separately instead of silently ignoring it.
  const walletIds = new Set(wallets.map((w) => w.id));
  const orphanEntries = [...netByWallet.keys()].filter((id) => !walletIds.has(id));
  console.log(`ledger entries pointing at a missing wallet: ${orphanEntries.length}`);

  for (const e of exceptions) {
    console.log(`\n--- EXCEPTION: ${e.wallet.id}`);
    console.log(`    ownerType=${e.wallet.ownerType} user=${e.wallet.user?.email ?? "(none)"} vendor=${e.wallet.vendorId ?? "(none)"}`);
    if (e.wallet.user) {
      console.log(`    user.actorType=${e.wallet.user.actorType} roles=${e.wallet.user.roles.map((r) => typeof r === "string" ? r : r.role).join(",") || "(none)"} created=${e.wallet.user.createdAt.toISOString()}`);
    }
    console.log(`    stored balance : ${NGN(e.stored)}  (available ${NGN(e.wallet.availableKobo)} + held ${NGN(e.wallet.heldKobo)})`);
    console.log(`    ledger net     : ${NGN(e.ledgerNet)}`);
    console.log(`    delta          : ${NGN(e.delta)}`);
  }

  // -------------------------------------------------- non-posting detection
  console.log("\n=== 5. NON-POSTING ROWS (documentation written as journal entries) ===");
  const suspicious = await prisma.walletTransaction.findMany({
    where: {
      OR: [
        { reference: { contains: "CORRECTION" } },
        { reference: { contains: "ADJ-" } },
        { reference: { contains: "NOT-APPLIED" } },
        { description: { contains: "not applied" } },
        { description: { contains: "after fixture entry deletion" } }
      ]
    },
    select: { id: true, reference: true, type: true, description: true, createdAt: true }
  });
  for (const t of suspicious) {
    const entries = await prisma.ledgerEntry.findMany({
      where: { transactionId: t.id },
      select: { walletId: true, direction: true, amountKobo: true, memo: true }
    });
    const net = entries.reduce((a, e) => a + (e.direction === "CREDIT" ? e.amountKobo : -e.amountKobo), 0n);
    console.log(`\n${t.reference}  net=${NGN(net)}  ${net === 0n ? "BALANCED" : "UNBALANCED"}`);
    console.log(`  description: ${t.description}`);
    for (const e of entries) {
      const w = wallets.find((x) => x.id === e.walletId);
      console.log(`  ${e.direction.padEnd(6)} ${NGN(e.amountKobo).padStart(18)}  ${e.walletId.slice(-8)} ${w?.ownerType ?? "?"} ${w?.user?.email ?? w?.vendorId ?? ""}`);
      console.log(`         memo: ${e.memo}`);
    }
  }

  // -------------------------------- effect of a balanced correction, proven
  console.log("\n=== 6. ARITHMETIC CHECK: what a balanced correction does to each report ===");
  console.log("A correction posting with DEBIT X and CREDIT X:");
  console.log(`  global difference after: ${NGN((credit - debit) + 0n)}  (unchanged)`);
  console.log("  wallet delta after     : moves by X in the direction of the wallet side");
  console.log("So a balanced correction can fix a wallet delta and can never fix the journal difference.");

  console.log("\n=== 7. WHAT WOULD BALANCE THE JOURNAL ===");
  console.log(`Objects needed to neutralise the unbalanced postings: ${unbalanced.length}`);
  for (const t of unbalanced) {
    console.log(`  ${t.reference}: reversing journal of ${NGN(-BigInt(t.net))} net`);
  }
  console.log("Reversing each unbalanced posting restores SUM(DEBIT) = SUM(CREDIT) while preserving the original rows.");
  console.log("Wallet balances must then be re-checked: if a reversing entry touches a wallet, its stored balance must move too.");

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
