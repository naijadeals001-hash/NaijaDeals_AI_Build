import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import {
  applyAffiliate,
  decideAffiliate,
  createLink,
  resolveTouch,
  recordConversion,
  updateConversionState,
  affiliateSummary
} from "../lib/services/affiliate/service";

/**
 * Affiliate attribution and commission-accrual verification.
 *
 *   npx tsx scripts/affiliate-verify.ts
 *
 * Covers enrolment, approval gating, link creation, first-party touch capture,
 * commission accrual with a frozen rule version, duplicate-event safety, budget
 * enforcement and the conversion state machine. It does not test settlement:
 * no wallet is credited anywhere in this module.
 */

const runId = randomUUID().slice(0, 8);
const rows: { name: string; status: "PASS" | "FAIL"; detail: string }[] = [];

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}
async function check(name: string, run: () => Promise<string>) {
  try {
    rows.push({ name, status: "PASS", detail: await run() });
  } catch (error) {
    rows.push({ name, status: "FAIL", detail: error instanceof Error ? error.message : String(error) });
  }
}

async function main() {
  const db = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  console.log("database:", db[0].db);

  const affiliateUser = await prisma.user.create({
    data: { email: `aff-${runId}@example.test`, name: "Affiliate Test", actorType: "CUSTOMER" }
  });
  const admin = await prisma.user.create({
    data: { email: `aff-admin-${runId}@example.test`, name: "Affiliate Admin", actorType: "ADMIN" }
  });

  let linkCode = "";
  let conversionId = "";

  try {
    await check("enrolment is idempotent and starts as APPLIED", async () => {
      const first = await applyAffiliate({ userId: affiliateUser.id, termsVersion: "2026-11" });
      const second = await applyAffiliate({ userId: affiliateUser.id, termsVersion: "2026-11" });
      assert(first.id === second.id, "a second application created a new profile");
      assert(first.status === "APPLIED", `status ${first.status}`);
      return `profile ${first.id.slice(0, 8)} APPLIED, second call returned the same row`;
    });

    await check("an unapproved affiliate cannot create links", async () => {
      const campaign = await seedCampaign("1000", 10_000_000n, 500); // 5%, ₦100k budget
      const profile = await prisma.affiliateProfile.findUniqueOrThrow({ where: { userId: affiliateUser.id } });
      let status = 0;
      try {
        await createLink({ affiliateId: profile.id, campaignId: campaign.id, destination: "/product/abc" });
      } catch (error) {
        status = (error as { status?: number }).status ?? 500;
      }
      assert(status === 403, `expected 403, got ${status}`);
      return "403 before approval";
    });

    await check("approval unlocks link creation", async () => {
      const profile = await prisma.affiliateProfile.findUniqueOrThrow({ where: { userId: affiliateUser.id } });
      await decideAffiliate({ actorId: admin.id, affiliateId: profile.id, approve: true });
      const campaign = await prisma.affiliateCampaign.findFirstOrThrow({ where: { slug: `pilot-${runId}` } });
      const link = await createLink({ affiliateId: profile.id, campaignId: campaign.id, destination: "/product/abc" });
      linkCode = link.code;
      assert(link.code.length >= 8, "code too short");
      return `link ${link.code} -> ${link.destination}`;
    });

    await check("external destinations are refused", async () => {
      const profile = await prisma.affiliateProfile.findUniqueOrThrow({ where: { userId: affiliateUser.id } });
      const campaign = await prisma.affiliateCampaign.findFirstOrThrow({ where: { slug: `pilot-${runId}` } });
      let status = 0;
      try {
        await createLink({ affiliateId: profile.id, campaignId: campaign.id, destination: "https://evil.example" });
      } catch (error) {
        status = (error as { status?: number }).status ?? 500;
      }
      assert(status === 400, `expected 400, got ${status}`);
      return "open redirect prevented";
    });

    await check("a consented landing records a touch with expiry", async () => {
      const visitorKey = `visitor-${runId}`;
      const result = await resolveTouch({ code: linkCode, visitorKey, consent: true });
      assert(result, "touch not recorded");
      const days = Math.round((result!.touch.expiresAt.getTime() - Date.now()) / 86_400_000);
      assert(days >= 1, `expiry only ${days} days`);
      return `touch for ${visitorKey}, expires in ${days}d`;
    });

    await check("a qualifying order accrues commission at the frozen rule", async () => {
      const result = await recordConversion({
        entityType: "Order",
        entityId: `ord-${runId}`,
        basisKobo: 100_000n, // ₦1,000 subtotal
        visitorKey: `visitor-${runId}`
      });
      assert(result.created, `not created: ${"reason" in result ? result.reason : ""}`);
      if (!result.created) return "";
      conversionId = result.conversion.id;
      assert(result.conversion.amountKobo === 5_000n, `amount ${result.conversion.amountKobo}, expected 5000 (5%)`);
      assert(result.conversion.ruleVersion === 1, `rule version ${result.conversion.ruleVersion}`);
      return `₦${Number(result.conversion.amountKobo) / 100} on ₦${Number(result.conversion.basisKobo) / 100}, rule v${result.conversion.ruleVersion}`;
    });

    await check("the same order cannot produce a second commission", async () => {
      const again = await recordConversion({
        entityType: "Order",
        entityId: `ord-${runId}`,
        basisKobo: 100_000n,
        visitorKey: `visitor-${runId}`
      });
      assert(!again.created, "a duplicate conversion was created");
      const count = await prisma.affiliateConversion.count({ where: { entityId: `ord-${runId}` } });
      assert(count === 1, `${count} conversions for one order`);
      return "duplicate rejected, one row";
    });

    await check("a visit without consent earns nothing", async () => {
      const visitor = `no-consent-${runId}`;
      await resolveTouch({ code: linkCode, visitorKey: visitor, consent: false });
      const result = await recordConversion({
        entityType: "Order",
        entityId: `ord-noconsent-${runId}`,
        basisKobo: 100_000n,
        visitorKey: visitor
      });
      assert(!result.created, "commission accrued without consent");
      return "no attribution without consent";
    });

    await check("the campaign budget is enforced atomically", async () => {
      const campaign = await prisma.affiliateCampaign.findFirstOrThrow({ where: { slug: `pilot-${runId}` } });
      // Claim the remainder in one conversion, then a second must fail.
      const remaining = campaign.budgetKobo - campaign.spentKobo;
      const big = remaining * 20n; // at 5%, basis = remaining * 20 yields exactly the budget remainder
      const first = await recordConversion({
        entityType: "Order",
        entityId: `ord-budget-a-${runId}`,
        basisKobo: big,
        visitorKey: `visitor-${runId}`
      });
      const second = await recordConversion({
        entityType: "Order",
        entityId: `ord-budget-b-${runId}`,
        basisKobo: 100_000n,
        visitorKey: `visitor-${runId}`
      });
      assert(first.created, "first budget conversion failed");
      assert(!second.created && second.reason === "budget_exhausted", `second: ${"reason" in second ? second.reason : "created"}`);
      const after = await prisma.affiliateCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
      assert(after.spentKobo <= after.budgetKobo, `spent ${after.spentKobo} exceeds budget ${after.budgetKobo}`);
      return `spent ${after.spentKobo} of ${after.budgetKobo}, second refused`;
    });

    await check("invalid state transitions are refused", async () => {
      let status = 0;
      try {
        await updateConversionState({ actorId: admin.id, conversionId, to: "REVERSED" });
      } catch (error) {
        status = (error as { status?: number }).status ?? 500;
      }
      assert(status === 409, `expected 409, got ${status}`);
      return "TRACKED cannot jump to REVERSED";
    });

    await check("the state machine advances and is audited", async () => {
      await updateConversionState({ actorId: admin.id, conversionId, to: "VALIDATING" });
      await updateConversionState({ actorId: admin.id, conversionId, to: "APPROVED" });
      const row = await prisma.affiliateConversion.findUniqueOrThrow({ where: { id: conversionId } });
      assert(row.state === "APPROVED", `state ${row.state}`);
      const audits = await prisma.auditLog.count({ where: { entityId: conversionId } });
      assert(audits >= 2, `${audits} audit rows`);
      return `APPROVED with ${audits} audit rows`;
    });

    await check("summary totals come from conversion rows", async () => {
      const profile = await prisma.affiliateProfile.findUniqueOrThrow({ where: { userId: affiliateUser.id } });
      const summary = await affiliateSummary(profile.id);
      assert(summary.byState.APPROVED, "no approved bucket");
      assert(summary.clicks >= 1, `${summary.clicks} clicks`);
      return `APPROVED ${summary.byState.APPROVED.count} worth ${summary.byState.APPROVED.amountKobo} kobo, ${summary.clicks} clicks`;
    });
  } finally {
    const profile = await prisma.affiliateProfile.findUnique({ where: { userId: affiliateUser.id } });
    if (profile) {
      await prisma.affiliateConversion.deleteMany({ where: { affiliateId: profile.id } });
      await prisma.attributionTouch.deleteMany({ where: { link: { affiliateId: profile.id } } });
      await prisma.affiliateLink.deleteMany({ where: { affiliateId: profile.id } });
      await prisma.affiliateProfile.delete({ where: { id: profile.id } });
    }
    await prisma.affiliateCampaign.deleteMany({ where: { slug: `pilot-${runId}` } });
    await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: affiliateUser.id }, { entityId: conversionId }] } });
    await prisma.user.deleteMany({ where: { id: { in: [affiliateUser.id, admin.id] } } });
  }

  const width = Math.max(...rows.map((row) => row.name.length));
  for (const row of rows) console.log(`${row.status.padEnd(4)} ${row.name.padEnd(width)}  ${row.detail}`);
  const failed = rows.filter((row) => row.status === "FAIL").length;
  console.log(`\n${rows.length - failed} passed, ${failed} failed`);
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

async function seedCampaign(flat: string, budget: bigint, bps: number) {
  return prisma.affiliateCampaign.create({
    data: {
      slug: `pilot-${runId}`,
      name: `Pilot campaign ${runId}`,
      vertical: "shop",
      status: "ACTIVE",
      funding: "PLATFORM",
      commissionBps: bps,
      commissionFlatKobo: null,
      budgetKobo: budget,
      attributionDays: 30,
      commissionBasis: "SUBTOTAL",
      ruleVersion: 1
    }
  });
}

main().catch(async (error) => {
  console.error("crashed:", error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
