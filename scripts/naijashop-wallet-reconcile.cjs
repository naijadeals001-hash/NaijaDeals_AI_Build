/**
 * Read-only wallet reconciliation: the SYSTEM wallet's negative balance must be
 * fully explained by the local test transactions this workspace ran.
 *
 * Usage: node scripts/naijashop-wallet-reconcile.cjs
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

(async () => {
  const system = await prisma.wallet.findFirstOrThrow({ where: { ownerType: "SYSTEM" }, select: { id: true, availableKobo: true, heldKobo: true, currency: true } });

  const byMemo = await prisma.$queryRawUnsafe(
    `select coalesce(split_part(memo, ':', 1), 'other') as kind,
            count(*)::int as entries,
            coalesce(sum(case when direction = 'CREDIT' then "amountKobo" else -"amountKobo" end), 0)::bigint as net
       from "LedgerEntry"
      where "walletId" = $1
      group by 1
      order by abs(sum(case when direction = 'CREDIT' then "amountKobo" else -"amountKobo" end)) desc`,
    system.id
  );

  const funding = await prisma.walletTransaction.groupBy({
    by: ["type"],
    where: { walletId: system.id },
    _count: { _all: true },
    _sum: { amountKobo: true }
  });

  const recent = await prisma.$queryRawUnsafe(
    `select "createdAt"::text as at, direction, "amountKobo"::text as amount, left(memo, 48) as memo
       from "LedgerEntry" where "walletId" = $1 order by "createdAt" desc limit 12`,
    system.id
  );

  console.log(
    JSON.stringify(
      {
        system: { available: system.availableKobo.toString(), held: system.heldKobo.toString(), currency: system.currency },
        ledgerNetByMemo: byMemo,
        walletTransactions: funding,
        latestEntries: recent
      },
      (_key, value) => (typeof value === "bigint" ? value.toString() : value),
      1
    )
  );
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
