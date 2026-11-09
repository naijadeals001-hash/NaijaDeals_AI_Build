/**
 * Read-only escrow reconciliation.
 *
 * For every wallet, compares the stored `heldKobo` against the sum of escrow
 * holds it participates in, and totals the difference against the ledger. This
 * separates "expected held" from "recorded held" so an accounting defect is
 * visible rather than inferred.
 *
 * Usage: node scripts/naijashop-escrow-reconcile.cjs
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

(async () => {
  const report = await prisma.$queryRawUnsafe(`
    with holds as (
      select "buyerWalletId" as wallet_id, count(*)::int n, sum("amountKobo")::numeric total
        from "EscrowHold" where status = 'held' group by 1
    ), vendor_holds as (
      select "vendorWalletId" as wallet_id, count(*)::int n, sum("amountKobo")::numeric total
        from "EscrowHold" where status = 'held' group by 1
    )
    select w."ownerType",
           count(*)::int wallets,
           sum(w."availableKobo")::numeric available,
           sum(w."heldKobo")::numeric recorded_held,
           sum(coalesce(h.total, 0))::numeric buyer_holds,
           sum(coalesce(v.total, 0))::numeric vendor_holds
      from "Wallet" w
      left join holds h on h.wallet_id = w.id
      left join vendor_holds v on v.wallet_id = w.id
     group by 1
     order by 1
  `);

  const ledger = await prisma.$queryRawUnsafe(
    `select coalesce(sum(case when direction = 'CREDIT' then "amountKobo" else -"amountKobo" end), 0)::numeric as net from "LedgerEntry"`
  );
  const wallets = await prisma.$queryRawUnsafe(`select sum("availableKobo" + "heldKobo")::numeric as total from "Wallet"`);

  const normalise = (row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "bigint" ? value.toString() : value === null ? null : String(value)]));

  console.log(
    JSON.stringify(
      {
        byWalletType: report.map(normalise),
        ledgerNet: String(ledger[0].net),
        walletTotalAvailablePlusHeld: String(wallets[0].total),
        differences: {
          ledgerVsWallets: Number(wallets[0].total) - Number(ledger[0].net)
        }
      },
      null,
      1
    )
  );
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
