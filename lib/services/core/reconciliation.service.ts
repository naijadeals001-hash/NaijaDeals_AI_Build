import { prisma } from "@/lib/prisma";

/**
 * Read-only wallet/ledger reconciliation for the Control Center.
 *
 * Compares each wallet's cached balances (availableKobo + heldKobo) against the
 * ledger-derived balance (sum of CREDIT minus sum of DEBIT entries on that
 * wallet) and lists unbalanced transactions. Deltas are reported, never
 * auto-corrected: resolving a discrepancy requires a documented adjustment.
 *
 * Expected legitimate deltas: escrow holds post a CREDIT to the vendor wallet
 * before the funds become spendable, so vendor wallets with open holds can show
 * ledger-derived above cached available by the held amount.
 */
export async function walletReconciliation() {
  const wallets = await prisma.wallet.findMany({
    include: {
      ledgerEntries: { select: { direction: true, amountKobo: true } },
      user: { select: { email: true, name: true } },
      vendor: { select: { name: true } }
    }
  });

  const openEscrow = await prisma.escrowHold.findMany({
    where: { status: { in: ["pending", "held", "disputed"] } },
    select: { buyerWalletId: true, vendorWalletId: true, amountKobo: true, status: true }
  });
  const openEscrowByWallet = new Map<string, bigint>();
  for (const hold of openEscrow) {
    for (const walletId of [hold.buyerWalletId, hold.vendorWalletId]) {
      openEscrowByWallet.set(walletId, (openEscrowByWallet.get(walletId) ?? 0n) + hold.amountKobo);
    }
  }

  const rows = wallets.map((wallet) => {
    const credits = wallet.ledgerEntries.filter((e) => e.direction === "CREDIT").reduce((sum, e) => sum + e.amountKobo, 0n);
    const debits = wallet.ledgerEntries.filter((e) => e.direction === "DEBIT").reduce((sum, e) => sum + e.amountKobo, 0n);
    const ledgerDerived = credits - debits;
    const cached = wallet.availableKobo + wallet.heldKobo;
    return {
      walletId: wallet.id,
      ownerType: wallet.ownerType,
      owner: wallet.user?.email ?? wallet.vendor?.name ?? (wallet.ownerType === "SYSTEM" ? "SYSTEM" : "—"),
      currency: wallet.currency,
      cachedAvailableKobo: wallet.availableKobo,
      cachedHeldKobo: wallet.heldKobo,
      ledgerCreditKobo: credits,
      ledgerDebitKobo: debits,
      ledgerDerivedKobo: ledgerDerived,
      deltaKobo: ledgerDerived - cached,
      openEscrowKobo: openEscrowByWallet.get(wallet.id) ?? 0n
    };
  });

  const unbalancedTransactions = await prisma.walletTransaction.findMany({
    include: { ledger: { select: { direction: true, amountKobo: true } } }
  });
  const unbalanced = unbalancedTransactions
    .filter((tx) => {
      const credits = tx.ledger.filter((e) => e.direction === "CREDIT").reduce((sum, e) => sum + e.amountKobo, 0n);
      const debits = tx.ledger.filter((e) => e.direction === "DEBIT").reduce((sum, e) => sum + e.amountKobo, 0n);
      return credits !== debits;
    })
    .map((tx) => ({ transactionId: tx.id, reference: tx.reference, amountKobo: tx.amountKobo }));

  const totals = rows.reduce(
    (acc, row) => ({
      cachedKobo: acc.cachedKobo + row.cachedAvailableKobo + row.cachedHeldKobo,
      ledgerDerivedKobo: acc.ledgerDerivedKobo + row.ledgerDerivedKobo,
      mismatchedWallets: acc.mismatchedWallets + (row.deltaKobo !== 0n ? 1 : 0)
    }),
    { cachedKobo: 0n, ledgerDerivedKobo: 0n, mismatchedWallets: 0 }
  );

  return {
    generatedAt: new Date().toISOString(),
    wallets: rows.sort((a, b) => (a.deltaKobo === b.deltaKobo ? 0 : a.deltaKobo !== 0n ? -1 : 1)),
    totals: { ...totals, walletCount: rows.length, openEscrowCount: openEscrow.length },
    unbalancedTransactions: unbalanced
  };
}
