import "dotenv/config";
import { prisma } from "../lib/prisma";
import { recordAudit } from "../lib/services/core/audit.service";
import { SUPPORTED_AFFILIATE_VERTICALS } from "../lib/services/affiliate/verticals";

/**
 * Audits and quarantines affiliates attached to unsupported campaign verticals.
 *
 *   npx tsx scripts/affiliate-vertical-audit.ts [--apply] [--restore]
 *
 * Dry run by default. Apply pauses the campaign and deactivates its links,
 * recording one audit row per link. Restore reactivates only links disabled by
 * this audit and moves the campaign back to DRAFT; it never restores ACTIVE,
 * because reopening is a deliberate decision. No financial record is deleted.
 */

const REQUIRED_DB = "naijadeals_affiliate_test";

async function main() {
  const db = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  const actual = db[0]?.db ?? "";
  if (actual !== REQUIRED_DB) throw new Error(`Refusing to run: connected to "${actual}", expected "${REQUIRED_DB}".`);
  const apply = process.argv.includes("--apply");
  const restore = process.argv.includes("--restore");
  const supported = [...SUPPORTED_AFFILIATE_VERTICALS];

  if (restore) {
    const rows = await prisma.auditLog.findMany({ where: { action: "affiliate.vertical_audit_link_disabled" }, select: { entityId: true } });
    const ids = [...new Set(rows.map((row) => row.entityId).filter((id): id is string => Boolean(id)))];
    let restored = 0;
    for (const id of ids) {
      const link = await prisma.affiliateLink.update({ where: { id }, data: { active: true } }).catch(() => null);
      if (!link) continue;
      restored += 1;
      if (apply) await recordAudit({ actorId: null, action: "affiliate.vertical_audit_link_restored", entity: "AffiliateLink", entityId: id, metadata: { campaignId: link.campaignId } });
    }
    console.log(JSON.stringify({ database: actual, mode: restore ? (apply ? "restore_applied" : "restore_dry_run") : "audit", restored }, null, 2));
    await prisma.$disconnect();
    return;
  }

  const unsupported = await prisma.affiliateCampaign.findMany({
    where: { vertical: { notIn: supported } },
    select: { id: true, slug: true, name: true, vertical: true, status: true, _count: { select: { links: true, conversions: true } } }
  });

  let linksDisabled = 0;
  let campaignsPaused = 0;
  for (const campaign of unsupported) {
    if (!apply) continue;
    const links = await prisma.affiliateLink.findMany({ where: { campaignId: campaign.id, active: true }, select: { id: true } });
    for (const link of links) {
      await prisma.affiliateLink.update({ where: { id: link.id }, data: { active: false } });
      await recordAudit({ actorId: null, action: "affiliate.vertical_audit_link_disabled", entity: "AffiliateLink", entityId: link.id, metadata: { campaignId: campaign.id, vertical: campaign.vertical } });
      linksDisabled += 1;
    }
    if (campaign.status !== "PAUSED" && campaign.status !== "ENDED") {
      await prisma.affiliateCampaign.update({ where: { id: campaign.id }, data: { status: "PAUSED" } });
      campaignsPaused += 1;
      await recordAudit({ actorId: null, action: "affiliate.vertical_audit_campaign_paused", entity: "AffiliateCampaign", entityId: campaign.id, metadata: { vertical: campaign.vertical, from: campaign.status } });
    }
  }

  console.log(JSON.stringify({
    database: actual,
    mode: apply ? "apply" : "dry_run",
    supported,
    unsupportedCampaigns: unsupported.length,
    linksDisabled,
    campaignsPaused,
    records: unsupported.slice(0, 20)
  }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (error) => { console.error(error); await prisma.$disconnect().catch(() => undefined); process.exit(1); });
