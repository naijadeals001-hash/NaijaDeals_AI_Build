import "dotenv/config";
import { randomUUID } from "node:crypto";
import { inspect } from "node:util";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth/password";
import { TOOLS, TOOL_STATUS, type ToolContext } from "../lib/aura/tools";
import { TOOL_SPECS } from "../lib/aura/capabilities";

/**
 * Aura affiliate assistance — deterministic, fail-closed.
 *
 *   npx tsx scripts/aura-affiliate-tool-verify.ts
 *
 * Calls the tool handler directly, so no model provider is involved and nothing
 * is billed. The identity must come from ToolContext: arguments that name a user
 * or affiliate are ignored.
 */

const REQUIRED_DB = "naijadeals_affiliate_test";
const runId = randomUUID().slice(0, 8);
const rows: { name: string; status: "PASS" | "FAIL"; detail: string }[] = [];
let failures = 0;
function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}
async function check(name: string, run: () => Promise<string>) {
  try { rows.push({ name, status: "PASS", detail: await run() }); }
  catch (error) {
    failures += 1;
    rows.push({ name, status: "FAIL", detail: String(inspect(error, { depth: 3 })).slice(0, 900) });
  }
}

async function main() {
  const database = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  const actual = database[0]?.db ?? "";
  if (actual !== REQUIRED_DB) throw new Error(`Refusing to run: connected to "${actual}", expected "${REQUIRED_DB}".`);

  const passwordHash = await hashPassword(`Aura-${randomUUID()}`);
  const affiliateUser = await prisma.user.create({
    data: { email: `aura-${runId}-aff@example.test`, name: "Aura affiliate", actorType: "CUSTOMER", passwordHash }
  });
  const stranger = await prisma.user.create({
    data: { email: `aura-${runId}-stranger@example.test`, name: "Aura stranger", actorType: "CUSTOMER", passwordHash }
  });
  const profile = await prisma.affiliateProfile.create({
    data: { userId: affiliateUser.id, termsVersion: "aura", termsAcceptedAt: new Date(), status: "APPROVED", approvedAt: new Date(), displayName: "Aura Affiliate" }
  });
  const campaign = await prisma.affiliateCampaign.create({
    data: {
      slug: `aura-${runId}`, name: "Aura campaign", vertical: "shop", status: "ACTIVE",
      commissionBps: 500, budgetKobo: 1_000_000n, commissionBasis: "SUBTOTAL", ruleVersion: 1
    }
  });
  const link = await prisma.affiliateLink.create({
    data: { affiliateId: profile.id, campaignId: campaign.id, code: runId.toUpperCase().slice(0, 10), destination: "/" }
  });
  await prisma.affiliateConversion.create({
    data: {
      dedupeKey: `Order:aura-${runId}`, affiliateId: profile.id, campaignId: campaign.id, linkId: link.id,
      entityType: "Order", entityId: `aura-order-${runId}`, ruleVersion: 1, basisType: "SUBTOTAL",
      commissionBps: 500, basisKobo: 100_000n, amountKobo: 5_000n, state: "TRACKED"
    }
  });

  const ctx = (userId: string): ToolContext => ({ userId });

  await check("1. The tool is registered with a spec and a progress label", async () => {
    assert(typeof TOOLS.get_affiliate_summary === "function", "tool handler is not registered");
    assert(TOOL_SPECS.some((spec) => spec.name === "get_affiliate_summary"), "tool spec is missing");
    assert(TOOL_STATUS.get_affiliate_summary, "progress label is missing");
    return `handler, spec and status present`;
  });

  await check("2. A signed-in affiliate sees only their own totals", async () => {
    const result = await TOOLS.get_affiliate_summary(ctx(affiliateUser.id), {}, "verify");
    const data = result.data as { enrolled: boolean; links: number; pendingKobo: string; affiliateId?: string };
    assert(data.enrolled === true, "approved affiliate reported as not enrolled");
    assert(data.links === 1, `expected one link, got ${data.links}`);
    assert(data.pendingKobo === "5000", `expected 5000 pending, got ${data.pendingKobo}`);
    assert(data.affiliateId === undefined, "tool exposed an affiliate id in its data");
    return `enrolled, 1 link, pending=5000, no affiliate id in the payload`;
  });

  await check("3. A non-affiliate gets an empty answer, not another account's data", async () => {
    const result = await TOOLS.get_affiliate_summary(ctx(stranger.id), {}, "verify");
    const serialised = JSON.stringify(result);
    assert((result.data as { enrolled: boolean }).enrolled === false, "stranger reported as enrolled");
    assert(!serialised.includes("5000") && !serialised.includes(profile.id), "stranger response leaked affiliate data");
    return `enrolled:false and no affiliate id or amount in the payload`;
  });

  await check("4. Arguments cannot assert a different identity", async () => {
    const result = await TOOLS.get_affiliate_summary(ctx(stranger.id), {
      userId: affiliateUser.id, affiliateId: profile.id, affiliateUserId: affiliateUser.id
    }, "verify");
    assert((result.data as { enrolled: boolean }).enrolled === false, "argument-supplied identity changed the result");
    return `userId/affiliateId in arguments were ignored; context identity is authoritative`;
  });

  console.log(JSON.stringify({ runId, database: actual, checks: rows, failures }, null, 2));
  await prisma.$disconnect();
  if (failures > 0) process.exit(1);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
