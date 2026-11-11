import "dotenv/config";
import { prisma } from "../lib/prisma";
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
 * The earlier form of this script compared `availableKobo + heldKobo` with the
 * full journal net. That is the superseded convention documented as wrong in
 * `docs/naijapay-ledger-forensics.md` and
 * `lib/services/core/reconciliation-correct.ts`: an open buyer hold debits the
 * buyer's journal net while the money is still the buyer's, so the sum test
 * reports every open hold as broken.
 *
 * Authoritative open-hold sources wired here are the two used by the wallet
 * acceptance suite: wallet-paid `Ride` rows in `held` state and `EscrowHold`
 * rows in `held` state. Held money from any other module is not silently
 * ignored: it makes expected held smaller than stored held, so the wallet is
 * reported for review rather than marked clean.
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

  // Open reservations, straight from the records that own them. A wallet-paid
  // ride reserves the fare on the rider (buyer) and on SYSTEM (counterparty). A
  // shop escrow reserves on the buyer and on the vendor.
  const openRides = await prisma.ride.findMany({
    where: { paymentMethod: "wallet", paymentStatus: "held" },
    select: { riderId: true, fareKobo: true }
  });
  const openEscrows = await prisma.escrowHold.findMany({
    where: { status: "held" },
    select: { buyerWalletId: true, vendorWalletId: true, amountKobo: true }
  });
  const customerWalletByUser = new Map(
    wallets.filter((wallet) => wallet.ownerType === "CUSTOMER" && wallet.userId).map((wallet) => [wallet.userId as string, wallet.id])
  );
  const systemWallet = wallets.find((wallet) => wallet.ownerType === "SYSTEM");

  const buyerHeld = new Map<string, bigint>();
  const counterpartyHeld = new Map<string, bigint>();
  const addHeld = (map: Map<string, bigint>, walletId: string | null | undefined, amount: bigint) => {
    if (!walletId) return;
    map.set(walletId, (map.get(walletId) ?? BigInt(0)) + amount);
  };
  let unattributedRides = 0;
  for (const ride of openRides) {
    const riderWalletId = customerWalletByUser.get(ride.riderId);
    if (!riderWalletId) {
      unattributedRides += 1;
      continue;
    }
    addHeld(buyerHeld, riderWalletId, ride.fareKobo);
    addHeld(counterpartyHeld, systemWallet?.id, ride.fareKobo);
  }
  for (const escrow of openEscrows) {
    addHeld(buyerHeld, escrow.buyerWalletId, escrow.amountKobo);
    addHeld(counterpartyHeld, escrow.vendorWalletId, escrow.amountKobo);
  }

  const rows = wallets.map((wallet) => {
    const ledgerNet = net.get(wallet.id) ?? BigInt(0);
    const buyer = buyerHeld.get(wallet.id) ?? BigInt(0);
    const counterparty = counterpartyHeld.get(wallet.id) ?? BigInt(0);
    const expectedHeld = buyer + counterparty;
    const expectedAvailable = ledgerNet - counterparty;
    const availableDifference = wallet.availableKobo - expectedAvailable;
    const heldDifference = wallet.heldKobo - expectedHeld;
    return {
      walletId: wallet.id,
      identity: identity(wallet),
      ownerType: wallet.ownerType,
      currency: wallet.currency,
      available: wallet.availableKobo.toString(),
      held: wallet.heldKobo.toString(),
      ledgerNet: ledgerNet.toString(),
      openBuyerHeld: buyer.toString(),
      openCounterpartyHeld: counterparty.toString(),
      expectedAvailable: expectedAvailable.toString(),
      expectedHeld: expectedHeld.toString(),
      availableDifference: availableDifference.toString(),
      heldDifference: heldDifference.toString(),
      walletTransactions: txMap.get(wallet.id) ?? 0,
      duplicateIdentity: (byIdentity.get(`${identity(wallet)}|${wallet.ownerType}|${wallet.currency}`) ?? 0) > 1,
      createdAt: wallet.createdAt.toISOString()
    };
  });

  const mismatches = rows.filter((row) => row.availableDifference !== "0" || row.heldDifference !== "0");
  const duplicates = rows.filter((row) => row.duplicateIdentity);
  console.log(
    JSON.stringify(
      {
        database: DB,
        convention:
          "availableKobo == ledgerNet - open counterparty hold credits; heldKobo == open buyer holds + open counterparty holds; duplicate identities are reported",
        wallets: rows.length,
        openRides: openRides.length,
        openEscrows: openEscrows.length,
        unattributedRides,
        mismatches: mismatches.length,
        duplicateIdentities: duplicates.length,
        duplicates,
        mismatchRows: mismatches.slice(0, 50),
        status: mismatches.length || duplicates.length ? "REVIEW" : "CLEAN"
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
