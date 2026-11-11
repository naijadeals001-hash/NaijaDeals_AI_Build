import "dotenv/config";
import { prisma } from "../lib/prisma";
/**
 * Read-only wallet reconciliation. No writes.
 * Ledger convention (verified against lib/services/core/wallet.service.ts):
 * every journal has debit legs and credit legs of equal total; a wallet's
 * balance is the sum of its own legs (CREDIT - DEBIT). `availableKobo` and
 * `heldKobo` are stored projections of that balance. Opening balances and any
 * direct balance write without a journal therefore surface as a difference.
 */
const DB = "naijadeals_affiliate_test";
(async () => {
  const db = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  if (db[0]?.db !== DB) throw new Error(`wrong database ${db[0]?.db}`);
  const wallets = await prisma.wallet.findMany({ select: { id: true, ownerType: true, userId: true, vendorId: true, currency: true, availableKobo: true, heldKobo: true, createdAt: true } });
  const legs = await prisma.ledgerEntry.groupBy({ by: ["walletId", "direction"], _sum: { amountKobo: true } });
  const txCounts = await prisma.walletTransaction.groupBy({ by: ["walletId"], _count: { _all: true } });
  const net = new Map<string, bigint>();
  for (const leg of legs) {
    const current = net.get(leg.walletId) ?? 0n;
    const amount = leg._sum.amountKobo ?? 0n;
    net.set(leg.walletId, current + (leg.direction === "CREDIT" ? amount : -amount));
  }
  const txMap = new Map(txCounts.map((row) => [row.walletId, row._count._all]));
  const identity = (w: (typeof wallets)[number]) => w.userId ?? w.vendorId ?? "SYSTEM";
  const byIdentity = new Map<string, number>();
  for (const w of wallets) byIdentity.set(`${identity(w)}|${w.ownerType}|${w.currency}`, (byIdentity.get(`${identity(w)}|${w.ownerType}|${w.currency}`) ?? 0) + 1);
  const rows = wallets.map((w) => {
    const ledger = net.get(w.id) ?? 0n;
    const stored = w.availableKobo + w.heldKobo;
    return { walletId: w.id, identity: identity(w), ownerType: w.ownerType, currency: w.currency, available: w.availableKobo.toString(), held: w.heldKobo.toString(), storedTotal: stored.toString(), ledgerNet: ledger.toString(), difference: (stored - ledger).toString(), walletTransactions: txMap.get(w.id) ?? 0, duplicateIdentity: (byIdentity.get(`${identity(w)}|${w.ownerType}|${w.currency}`) ?? 0) > 1, createdAt: w.createdAt.toISOString() };
  });
  const mismatches = rows.filter((r) => r.difference !== "0");
  const duplicates = rows.filter((r) => r.duplicateIdentity);
  console.log(JSON.stringify({ database: DB, convention: "wallet balance = sum(CREDIT) - sum(DEBIT) of its ledger legs; storedTotal = availableKobo + heldKobo", wallets: rows.length, mismatches: mismatches.length, duplicateIdentities: duplicates.length, duplicates, mismatchRows: mismatches.slice(0, 50), status: mismatches.length || duplicates.length ? "REVIEW" : "CLEAN" }, null, 2));
  await prisma.$disconnect();
  process.exit(0);
})().catch(async (e) => { console.error(e); await prisma.$disconnect().catch(() => undefined); process.exit(1); });
