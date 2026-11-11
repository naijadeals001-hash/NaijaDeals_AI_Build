import "dotenv/config";
import { prisma } from "../lib/prisma";
import { compareWalletProjection, loadOpenHoldLedger } from "../lib/services/core/reconciliation-correct";

/**
 * Read-only wallet reconciliation. No writes.
 *
 * A wallet has two balances that reconcile against different things:
 *
 *  - `availableKobo` is the spendable position. It equals the wallet's full
 *    journal net, less any hold credit the wallet has received as the escrow
 *    counterparty (SYSTEM for ride fare holds, VENDOR for shop escrow).
 *  - `heldKobo` is the open escrow reservation: buyer-side wallet holds plus
 *    escrow the wallet holds as a counterparty.
 *
 * The interpretation is owned by `lib/services/core/reconciliation-correct.ts`
 * and imported here, so the Control Center and this checker apply one tested
 * convention. Open holds are read from the records that own them: wallet-paid
 * `Ride` rows in `held` state and `EscrowHold` rows in an open status (less the
 * order's refunded amount, because a partial refund returns held money). Holds
 * with no attributable wallet are reported, never dropped.
 *
 * The earlier form of this script compared `availableKobo + heldKobo` with the
 * full journal net. That is the superseded convention documented as wrong in
 * `docs/naijapay-ledger-forensics.md`: an open buyer hold debits the buyer's
 * journal net while the money is still the buyer's, so the sum test reports
 * every open hold as broken.
 *
 * Duplicate (identity, ownerType, currency) wallet rows are also reported.
 */
const EXPECTED = process.env.RECONCILE_DB ?? "naijadeals_affiliate_test";
(async () => {
  const db = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  const DB = db[0]?.db ?? "";
  if (DB !== EXPECTED) throw new Error(`wrong database ${DB}, expected ${EXPECTED}`);

  const wallets = await prisma.wallet.findMany({
    select: {
      id: true,
      ownerType: true,
      userId: true,
      vendorId: true,
      currency: true,
      availableKobo: true,
      heldKobo: true,
      createdAt: true
    }
  });
  const legs = await prisma.ledgerEntry.groupBy({ by: ["walletId", "direction"], _sum: { amountKobo: true } });
  const txCounts = await prisma.walletTransaction.groupBy({ by: ["walletId"], _count: { _all: true } });

  const net = new Map<string, bigint>();
  for (const leg of legs) {
    const current = net.get(leg.walletId) ?? BigInt(0);
    const amount = leg._sum.amountKobo ?? BigInt(0);
    net.set(leg.walletId, current + (leg.direction === "CREDIT" ? amount : -amount));
  }
  const txMap = new Map(txCounts.map((row) => [row.walletId, row._count._all]));
  const identity = (wallet: (typeof wallets)[number]) => wallet.userId ?? wallet.vendorId ?? "SYSTEM";
  const byIdentity = new Map<string, number>();
  for (const wallet of wallets) {
    byIdentity.set(
      `${identity(wallet)}|${wallet.ownerType}|${wallet.currency}`,
      (byIdentity.get(`${identity(wallet)}|${wallet.ownerType}|${wallet.currency}`) ?? 0) + 1
    );
  }

  // One shared interpretation of what an open hold is and which wallet owes it.
  const holds = await loadOpenHoldLedger(prisma);
  const openRides = holds.holds.filter((hold) => hold.kind === "ride");
  const openEscrows = holds.holds.filter((hold) => hold.kind === "escrow");

  const rows = wallets.map((wallet) => {
    const ledgerNet = net.get(wallet.id) ?? BigInt(0);
    const projection = compareWalletProjection({
      walletId: wallet.id,
      availableKobo: wallet.availableKobo,
      heldKobo: wallet.heldKobo,
      ledgerNetKobo: ledgerNet,
      holds
    });
    return {
      walletId: wallet.id,
      identity: identity(wallet),
      ownerType: wallet.ownerType,
      currency: wallet.currency,
      available: wallet.availableKobo.toString(),
      held: wallet.heldKobo.toString(),
      ledgerNet: ledgerNet.toString(),
      openBuyerHeld: projection.openBuyerHeldKobo.toString(),
      openCounterpartyHeld: projection.openCounterpartyHeldKobo.toString(),
      expectedAvailable: projection.expectedAvailableKobo.toString(),
      expectedHeld: projection.expectedHeldKobo.toString(),
      availableDifference: projection.availableDifferenceKobo.toString(),
      heldDifference: projection.heldDifferenceKobo.toString(),
      walletTransactions: txMap.get(wallet.id) ?? 0,
      duplicateIdentity: (byIdentity.get(`${identity(wallet)}|${wallet.ownerType}|${wallet.currency}`) ?? 0) > 1,
      createdAt: wallet.createdAt.toISOString()
    };
  });

  const mismatches = rows.filter((row) => row.availableDifference !== "0" || row.heldDifference !== "0");
  const duplicates = rows.filter((row) => row.duplicateIdentity);
  const unattributed = holds.unattributed.map((hold) => ({
    kind: hold.kind,
    id: hold.id,
    reference: hold.reference,
    amountKobo: hold.amountKobo.toString(),
    reason: hold.reason
  }));
  console.log(
    JSON.stringify(
      {
        database: DB,
        convention:
          "availableKobo == ledgerNet - open counterparty hold credits; heldKobo == open buyer holds + open counterparty holds; duplicate identities and unattributed holds are reported",
        wallets: rows.length,
        openRides: openRides.length,
        openEscrows: openEscrows.length,
        unattributedRides: holds.unattributed.filter((hold) => hold.kind === "ride").length,
        unattributedHolds: unattributed.length,
        unattributed,
        mismatches: mismatches.length,
        duplicateIdentities: duplicates.length,
        duplicates,
        mismatchRows: mismatches.slice(0, 50),
        status: mismatches.length || duplicates.length || unattributed.length ? "REVIEW" : "CLEAN"
      },
      null,
      2
    )
  );
  await prisma.$disconnect();
  process.exit(0);
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
