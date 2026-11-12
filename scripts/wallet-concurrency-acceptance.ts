import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth/password";
import { ensureWallet } from "../lib/payments/service";
import { requireTestDatabase } from "./lib/test-db-guard";

const DB = "naijadeals_wallet_acceptance";
const rows: { name: string; status: "PASS" | "FAIL"; detail: string }[] = [];
let failures = 0;
function assert(c: unknown, m: string): void { if (!c) throw new Error(m); }
async function check(name: string, fn: () => Promise<string>) {
  try { rows.push({ name, status: "PASS", detail: await fn() }); }
  catch (e) { failures += 1; rows.push({ name, status: "FAIL", detail: String(e).slice(0, 400) }); }
}
async function user() { return prisma.user.create({ data: { email: `wc-${randomUUID()}@example.test`, name: "WC", actorType: "CUSTOMER", passwordHash: await hashPassword(`WC-${randomUUID()}`) } }); }

async function main() {
  // Fail closed before the first query: the target must be named by
  // TEST_DATABASE_URL and carry a TEST marker. Never fall back to .env DATABASE_URL.
  await requireTestDatabase();
  const db = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  assert(db[0]?.db === DB, `wrong database ${db[0]?.db}`);
  await check("1. Concurrent CUSTOMER creation yields one wallet", async () => {
    const u = await user();
    const results = await Promise.all(Array.from({ length: 10 }, () => ensureWallet(prisma, { userId: u.id, ownerType: "CUSTOMER" })));
    const ids = new Set(results.map((w) => w.id));
    const count = await prisma.wallet.count({ where: { userId: u.id, ownerType: "CUSTOMER", currency: "NGN" } });
    assert(ids.size === 1 && count === 1, `ids=${ids.size} rows=${count}`);
    return `10 calls -> 1 wallet ${[...ids][0]}`;
  });
  await check("2. Dual-role DRIVER and CUSTOMER remain distinct", async () => {
    const u = await user();
    const [customer, drivers] = await Promise.all([
      ensureWallet(prisma, { userId: u.id, ownerType: "CUSTOMER" }),
      Promise.all(Array.from({ length: 6 }, () => ensureWallet(prisma, { userId: u.id, ownerType: "DRIVER" })))
    ]);
    const driverIds = new Set(drivers.map((w) => w.id));
    assert(driverIds.size === 1 && !driverIds.has(customer.id), `driver ids ${driverIds.size}, customer collision ${driverIds.has(customer.id)}`);
    return `1 CUSTOMER + 1 DRIVER for the same account`;
  });
  await check("3. Concurrent VENDOR creation yields one wallet", async () => {
    const owner = await user();
    const vendor = await prisma.vendor.create({ data: { ownerId: owner.id, name: "WC vendor", slug: `wc-${randomUUID().slice(0, 10)}`, market: "Alaba", pickupAddress: "1 WC Way", pickupPhone: "+2348000000000", status: "VERIFIED" } });
    const results = await Promise.all(Array.from({ length: 8 }, () => ensureWallet(prisma, { vendorId: vendor.id, ownerType: "VENDOR" })));
    const count = await prisma.wallet.count({ where: { vendorId: vendor.id, ownerType: "VENDOR", currency: "NGN" } });
    assert(new Set(results.map((w) => w.id)).size === 1 && count === 1, `rows=${count}`);
    return `8 calls -> 1 VENDOR wallet`;
  });
  await check("4. Concurrent SYSTEM creation yields one wallet", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => ensureWallet(prisma, { ownerType: "SYSTEM" })));
    const count = await prisma.wallet.count({ where: { ownerType: "SYSTEM", currency: "NGN" } });
    assert(new Set(results.map((w) => w.id)).size === 1 && count === 1, `rows=${count}`);
    return `8 calls -> 1 SYSTEM wallet`;
  });
  await check("5. Invalid ownership combinations fail safely", async () => {
    const u = await user();
    const attempts = [
      () => ensureWallet(prisma, { ownerType: "SYSTEM", userId: u.id }),
      () => ensureWallet(prisma, { ownerType: "VENDOR", userId: u.id }),
      () => ensureWallet(prisma, { ownerType: "CUSTOMER", userId: u.id, vendorId: u.id })
    ];
    let rejected = 0;
    for (const attempt of attempts) { try { await attempt(); } catch (e) { if ((e as { code?: string }).code === "invalid_wallet_identity") rejected += 1; } }
    assert(rejected === 3, `only ${rejected}/3 rejected`);
    return `3 invalid combinations rejected with invalid_wallet_identity`;
  });
  console.log(JSON.stringify({ database: DB, checks: rows, failures }, null, 2));
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect().catch(() => undefined); process.exit(1); });
