import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth/password";
import { ensureWallet } from "../lib/payments/service";

const DB = "naijadeals_affiliate_test";
const rows: { name: string; status: "PASS" | "FAIL"; detail: string }[] = [];
let failures = 0;
function assert(c: unknown, m: string): void { if (!c) throw new Error(m); }
async function check(name: string, fn: () => Promise<string>) {
  try { rows.push({ name, status: "PASS", detail: await fn() }); }
  catch (e) { failures += 1; rows.push({ name, status: "FAIL", detail: String(e).slice(0, 500) }); }
}
async function user() {
  return prisma.user.create({ data: { email: `wallet-${randomUUID().slice(0, 10)}@example.test`, name: "Wallet", actorType: "CUSTOMER", passwordHash: await hashPassword(`W-${randomUUID()}`) } });
}

async function main() {
  const db = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  assert(db[0]?.db === DB, `wrong database ${db[0]?.db}`);

  await check("1. Customer-only resolution stays CUSTOMER", async () => {
    const u = await user();
    const first = await ensureWallet(prisma, { userId: u.id, ownerType: "CUSTOMER" });
    const second = await ensureWallet(prisma, { userId: u.id, ownerType: "CUSTOMER" });
    assert(first.id === second.id && first.ownerType === "CUSTOMER", `unexpected ${first.id}/${first.ownerType}`);
    return `one CUSTOMER wallet ${first.id}`;
  });

  await check("2. Driver wallet is not the customer wallet", async () => {
    const u = await user();
    const customer = await ensureWallet(prisma, { userId: u.id, ownerType: "CUSTOMER" });
    const driverWallet = await prisma.wallet.create({ data: { userId: u.id, ownerType: "DRIVER", availableKobo: 0n, heldKobo: 0n } });
    const resolved = await ensureWallet(prisma, { userId: u.id, ownerType: "DRIVER" });
    assert(resolved.id === driverWallet.id, `resolved ${resolved.id} (${resolved.ownerType}), expected DRIVER ${driverWallet.id}, not customer ${customer.id}`);
    return `dual-role account resolves DRIVER ${driverWallet.id}`;
  });

  await check("3. Vendor wallet resolves by vendor identity", async () => {
    const owner = await user();
    const vendor = await prisma.vendor.create({ data: { ownerId: owner.id, name: `Wallet vendor ${randomUUID().slice(0, 6)}`, slug: `wallet-vendor-${randomUUID().slice(0, 8)}`, market: "Alaba", pickupAddress: "1 Wallet Way", pickupPhone: "+2348000000000", status: "VERIFIED" } });
    const w = await ensureWallet(prisma, { vendorId: vendor.id, ownerType: "VENDOR" });
    const again = await ensureWallet(prisma, { vendorId: vendor.id, ownerType: "VENDOR" });
    assert(w.id === again.id && w.vendorId === vendor.id, `unexpected vendor wallet ${w.id}`);
    return `VENDOR wallet ${w.id} for ${vendor.id}`;
  });

  await check("4. SYSTEM wallet is singular and stable", async () => {
    const a = await ensureWallet(prisma, { ownerType: "SYSTEM" });
    const b = await ensureWallet(prisma, { ownerType: "SYSTEM" });
    assert(a.id === b.id && a.ownerType === "SYSTEM", `system wallets ${a.id}/${b.id}`);
    return `SYSTEM wallet ${a.id}`;
  });

  await check("5. Duplicate wallet rows are reported, not hidden", async () => {
    const dupUsers = await prisma.$queryRawUnsafe<Array<{ userId: string; ownerType: string; n: string }>>(
      `SELECT "userId", "ownerType"::text AS "ownerType", COUNT(*)::text AS n FROM "Wallet" WHERE "userId" IS NOT NULL GROUP BY "userId","ownerType" HAVING COUNT(*) > 1 LIMIT 5`
    );
    return dupUsers.length === 0 ? "no duplicate (userId, ownerType) rows" : `DUPLICATES FOUND: ${JSON.stringify(dupUsers)}`;
  });

  console.log(JSON.stringify({ database: DB, checks: rows, failures }, null, 2));
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect().catch(() => undefined); process.exit(1); });
