import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";

/**
 * Read-only merchant finance aggregation for the NaijaPay Business dashboard.
 * Everything derives from the shared financial engine: the vendor Wallet
 * (cached balances over the ledger), Payout records, EscrowHold state and
 * paid orders. No separate merchant accounting exists or is created here.
 */
export async function businessOverview(vendorId: string) {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { id: true, name: true, status: true, slug: true } });
  if (!vendor) throw new ApiError(404, "vendor_not_found", "Merchant account not found.");

  const wallet = await prisma.wallet.findFirst({
    where: { vendorId },
    include: { transactions: { orderBy: { createdAt: "desc" }, take: 10 } }
  });

  const [payouts, openEscrow, settledOrders, paidOrders] = await Promise.all([
    prisma.payout.findMany({ where: { vendorId }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.escrowHold.findMany({
      where: { vendorWalletId: wallet?.id, status: { in: ["pending", "held", "disputed"] } },
      include: { order: { select: { orderNumber: true } } },
      orderBy: { createdAt: "desc" }
    }),
    prisma.order.findMany({
      where: { vendorId, paymentStatus: "released" },
      select: { totalKobo: true, orderNumber: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 50
    }),
    prisma.order.findMany({
      where: { vendorId, paymentStatus: { in: ["paid", "released"] } },
      select: { totalKobo: true }
    })
  ]);

  const grossSalesKobo = paidOrders.reduce((sum, order) => sum + order.totalKobo, 0n);
  const settledKobo = settledOrders.reduce((sum, order) => sum + order.totalKobo, 0n);
  const pendingSettlementKobo = openEscrow.reduce((sum, hold) => sum + hold.amountKobo, 0n);
  const pendingPayoutsKobo = payouts
    .filter((payout) => payout.status === "PENDING")
    .reduce((sum, payout) => sum + payout.amountKobo, 0n);

  return {
    vendor,
    wallet: wallet
      ? {
          id: wallet.id,
          currency: wallet.currency,
          availableKobo: wallet.availableKobo,
          heldKobo: wallet.heldKobo,
          recentTransactions: wallet.transactions
        }
      : null,
    payouts,
    settlements: settledOrders,
    openEscrow,
    stats: {
      grossSalesKobo,
      settledKobo,
      pendingSettlementKobo,
      pendingPayoutsKobo,
      paidOrderCount: paidOrders.length
    }
  };
}
