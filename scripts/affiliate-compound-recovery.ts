import "dotenv/config";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth/password";
import { reverseConversion, settleConversion } from "../lib/services/affiliate/settlement";
import { collectRecovery } from "../lib/services/affiliate/recovery";
import { ensureWallet } from "../lib/payments/service";

const run = promisify(execFile);
const applyBackfill = () => process.platform === "win32"
  ? run("cmd.exe", ["/c", "npx", "tsx", "scripts/affiliate-recovery-backfill.ts", "--apply"], { env: process.env })
  : run("npx", ["tsx", "scripts/affiliate-recovery-backfill.ts", "--apply"], { env: process.env });
const DB = "naijadeals_affiliate_test";
const runId = randomUUID().slice(0, 8);
const rows: { name: string; status: "PASS" | "FAIL"; detail: string }[] = [];
let failures = 0;
function assert(c: unknown, m: string): void { if (!c) throw new Error(m); }
const s = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
async function check(name: string, fn: () => Promise<string>) {
  try { rows.push({ name, status: "PASS", detail: await fn() }); }
  catch (e) { failures += 1; rows.push({ name, status: "FAIL", detail: String(e).slice(0, 600) }); }
}

async function chain() {
  const passwordHash = await hashPassword(`Compound-${randomUUID()}`);
  const user = await prisma.user.create({ data: { email: `cmp-${runId}-${randomUUID().slice(0, 4)}@example.test`, name: "Compound", actorType: "CUSTOMER", passwordHash } });
  const profile = await prisma.affiliateProfile.create({ data: { userId: user.id, termsVersion: "cmp", termsAcceptedAt: new Date(), status: "APPROVED", approvedAt: new Date() } });
  const campaign = await prisma.affiliateCampaign.create({ data: { slug: `cmp-${runId}-${randomUUID().slice(0, 4)}`, name: "Cmp", vertical: "shop", status: "ACTIVE", commissionBps: 500, budgetKobo: 10_000_000n, spentKobo: 5_000n, commissionBasis: "SUBTOTAL", ruleVersion: 1 } });
  const link = await prisma.affiliateLink.create({ data: { affiliateId: profile.id, campaignId: campaign.id, code: randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase(), destination: "/" } });
  await ensureWallet(prisma, { userId: user.id, ownerType: "CUSTOMER" });
  return { userId: user.id, profileId: profile.id, campaignId: campaign.id, linkId: link.id };
}
async function conv(c: Awaited<ReturnType<typeof chain>>, state: "APPROVED" | "PAID", amount = 5_000n) {
  return prisma.affiliateConversion.create({ data: { dedupeKey: `Order:${randomUUID()}`, affiliateId: c.profileId, campaignId: c.campaignId, linkId: c.linkId, entityType: "Order", entityId: randomUUID(), ruleVersion: 1, basisType: "SUBTOTAL", commissionBps: 500, basisKobo: amount * 20n, amountKobo: amount, state } });
}
async function wallet(userId: string) {
  const w = await prisma.wallet.findFirstOrThrow({ where: { userId, ownerType: "CUSTOMER" } });
  return w.availableKobo;
}

async function main() {
  const db = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  assert(db[0]?.db === DB, `wrong database ${db[0]?.db}`);
  const actor = await prisma.user.create({ data: { email: `cmp-${runId}-actor@example.test`, name: "Actor", actorType: "ADMIN", passwordHash: await hashPassword(`A-${randomUUID()}`) } });

  await check("1. Three partial reversals and a duplicate event stay within the obligation", async () => {
    const c = await chain();
    const target = await conv(c, "APPROVED");
    for (const [key, amount] of [["a", 2_000n], ["b", 1_000n], ["c", 1_000n], ["c", 1_000n]] as const) {
      await reverseConversion({ actorId: actor.id, conversionId: target.id, amountKobo: amount, reason: `partial ${key}`, idempotencyKey: `cmp-${runId}-${key}` });
    }
    const ops = await prisma.affiliateReversalOperation.count({ where: { conversionId: target.id } });
    const recovery = await prisma.affiliateRecovery.findMany({ where: { conversionId: target.id } });
    const budget = await prisma.affiliateCampaign.findUniqueOrThrow({ where: { id: c.campaignId } });
    assert(ops === 3, `${ops} operations`);
    assert(recovery.length === 1 && recovery[0].amountKobo === 4_000n, `recovery ${s(recovery)}`);
    assert(budget.spentKobo === 1_000n, `budget ${budget.spentKobo}`);
    return `3 operations, recovery 4000, budget released 4000 exactly once`;
  });

  await check("2. Partial collection, then settlement offsets the rest, then a later reversal", async () => {
    const c = await chain();
    const target = await conv(c, "APPROVED");
    await reverseConversion({ actorId: actor.id, conversionId: target.id, amountKobo: 2_000n, reason: "p1", idempotencyKey: `cmp2-${runId}-a` });
    await reverseConversion({ actorId: actor.id, conversionId: target.id, amountKobo: 1_000n, reason: "p2", idempotencyKey: `cmp2-${runId}-b` });
    const recovery = await prisma.affiliateRecovery.findFirstOrThrow({ where: { conversionId: target.id } });
    const w = await prisma.wallet.findFirstOrThrow({ where: { userId: c.userId, ownerType: "CUSTOMER" } });
    await prisma.wallet.update({ where: { id: w.id }, data: { availableKobo: 1_000n } });
    const collected = await collectRecovery({ actorId: actor.id, recoveryId: recovery.id, amountKobo: 1_000n });
    assert(collected.collected, `collection ${s(collected)}`);
    const settled = await settleConversion({ actorId: actor.id, conversionId: target.id });
    if (!settled.settled) throw new Error(`settle ${s(settled)}`);
    assert(settled.offsetKobo === "2000" && settled.paidKobo === "3000", `settle ${s(settled)}`);
    const afterSettle = await wallet(c.userId);
    assert(afterSettle === 3_000n, `wallet after settle ${afterSettle}`);
    const later = await reverseConversion({ actorId: actor.id, conversionId: target.id, amountKobo: 1_000n, reason: "later", idempotencyKey: `cmp2-${runId}-c` });
    assert(later.reversed, `later reversal ${s(later)}`);
    const final = await prisma.affiliateRecovery.findFirstOrThrow({ where: { conversionId: target.id } });
    const ops = await prisma.affiliateReversalOperation.aggregate({ where: { conversionId: target.id }, _sum: { requestedKobo: true } });
    assert((ops._sum.requestedKobo ?? 0n) === 4_000n, `cumulative reversal ${ops._sum.requestedKobo}`);
    assert(final.collectedKobo + final.offsetKobo <= final.amountKobo, `recovery ${s(final)}`);
    return `collected 1000, offset 2000, paid 3000, later reversal 1000; cumulative 4000; recovery ${final.collectedKobo}+${final.offsetKobo} <= ${final.amountKobo}`;
  });

  await check("3. A fully offset commission settles with zero payout", async () => {
    const c = await chain();
    const target = await conv(c, "APPROVED");
    const before = await wallet(c.userId);
    // Legacy-style debt equal to the whole commission, with the conversion still
    // settleable: settlement must net all of it and pay nothing.
    await prisma.affiliateRecovery.create({ data: { conversionId: target.id, affiliateId: c.profileId, amountKobo: 5_000n, note: "legacy full debt" } });
    const settled = await settleConversion({ actorId: actor.id, conversionId: target.id });
    if (!settled.settled) throw new Error(`settle ${s(settled)}`);
    assert(settled.offsetKobo === "5000" && settled.paidKobo === "0", `settle ${s(settled)}`);
    assert((await wallet(c.userId)) === before, "wallet moved on a zero payout");
    const tx = await prisma.walletTransaction.count({ where: { reference: `AFF-COMM-${target.id}` } });
    assert(tx === 0, `${tx} payout transactions`);
    const after = await prisma.affiliateConversion.findUniqueOrThrow({ where: { id: target.id } });
    assert(after.state === "PAID" && after.ledgerReference === `AFF-OFFSET-${target.id}`, `conversion ${after.state}/${after.ledgerReference}`);
    return `offset 5000, payout 0, no ledger transaction, marker AFF-OFFSET`;
  });

  await check("4. Backfill tops up existing collected/offset recoveries only by the deficit", async () => {
    const c = await chain();
    const target = await conv(c, "PAID");
    await prisma.affiliateReversalOperation.create({ data: { opKey: `legacy-${runId}`, conversionId: target.id, requestedKobo: 3_000n, recoveredKobo: 1_800n, debtKobo: 3_000n, actorId: actor.id } });
    await prisma.affiliateRecovery.create({ data: { conversionId: target.id, affiliateId: c.profileId, amountKobo: 3_000n, collectedKobo: 400n, offsetKobo: 200n, note: "partial prior recovery" } });
    await prisma.affiliateRecovery.updateMany({ where: { conversionId: target.id }, data: { amountKobo: 1_000n } });
    // Run once, then run again to prove idempotency.
    await applyBackfill();
    const firstRows = await prisma.affiliateRecovery.findMany({ where: { conversionId: target.id } });
    assert(firstRows.length === 1 && firstRows[0].amountKobo === 3_000n, `recovery after first apply ${s(firstRows)}`);
    await applyBackfill();
    const rows2 = await prisma.affiliateRecovery.findMany({ where: { conversionId: target.id } });
    assert(rows2.length === 1 && rows2[0].amountKobo === 3_000n, `recovery after rerun ${s(rows2)}`);
    return `existing 1000 topped up to 3000 once; second run changed 0 records`;
  });

  await check("5. Two concurrent backfills create one row", async () => {
    const c = await chain();
    const target = await conv(c, "PAID");
    await prisma.affiliateReversalOperation.create({ data: { opKey: `concurrent-${runId}`, conversionId: target.id, requestedKobo: 2_000n, recoveredKobo: 0n, debtKobo: 2_000n, actorId: actor.id } });
    await Promise.all([
      applyBackfill(),
      applyBackfill()
    ]);
    const recoveries = await prisma.affiliateRecovery.findMany({ where: { conversionId: target.id } });
    assert(recoveries.length === 1 && recoveries[0].amountKobo === 2_000n, `recoveries ${s(recoveries)}`);
    return `one recovery of 2000 after two concurrent applies`;
  });

  console.log(JSON.stringify({ runId, database: DB, checks: rows, failures }, null, 2));
  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect().catch(() => undefined); process.exit(1); });
