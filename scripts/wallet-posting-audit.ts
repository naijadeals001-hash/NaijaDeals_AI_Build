import "dotenv/config";
import { prisma } from "../lib/prisma";
const DB = "naijadeals_affiliate_test";
const EXPECT: Array<[RegExp, string[], string]> = [
  [/^RIDE-.*-RELEASE$/, ["DRIVER"], "drive fare release"],
  [/^RIDE-.*-HOLD$/, ["CUSTOMER"], "drive fare hold"],
  [/^EATS-SETTLE-/, ["COURIER", "DRIVER"], "eats delivery settlement"],
  [/^AFF-COMM-/, ["CUSTOMER"], "affiliate commission"],
  [/^AFF-REVINT-/, ["CUSTOMER"], "affiliate reversal"]
];
(async () => {
  const db = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  if (db[0]?.db !== DB) throw new Error(`wrong database ${db[0]?.db}`);
  const rows = await prisma.$queryRawUnsafe<Array<{ reference: string; amount: string; ownerType: string; userId: string | null; vendorId: string | null; type: string }>>(
    `SELECT wt.reference, wt."amountKobo"::text AS amount, w."ownerType"::text AS "ownerType", w."userId", w."vendorId", wt.type::text AS type
     FROM "WalletTransaction" wt JOIN "Wallet" w ON w.id = wt."walletId"
     WHERE wt.reference ~ '^(RIDE-|EATS-SETTLE-|AFF-COMM-|AFF-REVINT-)'`
  );
  const mismatches: unknown[] = [];
  let checked = 0;
  for (const row of rows) {
    const rule = EXPECT.find(([pattern]) => pattern.test(row.reference));
    if (!rule) continue;
    checked += 1;
    if (!rule[1].includes(row.ownerType)) mismatches.push({ reference: row.reference, amountKobo: row.amount, walletOwnerType: row.ownerType, expected: rule[1], purpose: rule[2], userId: row.userId, vendorId: row.vendorId });
  }
  const dual = await prisma.$queryRawUnsafe<Array<{ userId: string; n: string; types: string }>>(
    `SELECT "userId", COUNT(*)::text AS n, string_agg("ownerType"::text, ',' ORDER BY "ownerType"::text) AS types
     FROM "Wallet" WHERE "userId" IS NOT NULL GROUP BY "userId" HAVING COUNT(*) > 1 LIMIT 20`
  );
  console.log(JSON.stringify({ database: DB, sampledTransactions: rows.length, checkedByRule: checked, mismatches, dualRoleWallets: dual, status: mismatches.length ? "REVIEW" : "NO_MISMATCHES_FOUND" }, null, 2));
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect().catch(() => undefined); process.exit(1); });
