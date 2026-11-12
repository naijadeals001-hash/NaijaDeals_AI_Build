/**
 * Seeds the Plus+ awareness rail from the canonical public service registry.
 *
 * Usage:
 *   TEST_DATABASE_URL=postgresql://... npx tsx scripts/plus-awareness-seed.ts
 *
 * For every service in `lib/data/public-services.ts` this upserts one PUBLISHED
 * PlusContentCard with the deterministic key `service:<key>`. It copies the
 * registry's real label, description, href, image and alt text; it invents no
 * service, plan, benefit or promotion.
 *
 * The script is idempotent: a second run updates only rows whose canonical
 * fields changed and leaves the rest untouched. It never deletes rows, never
 * writes plans/benefits/promotions/memberships and records an AuditLog row for
 * every created or updated card.
 *
 * The fail-closed guard requires an explicit TEST_DATABASE_URL and verifies the
 * actual database name and TEST classification before the first query.
 */
import "dotenv/config";
import { publicServices } from "@/lib/data/public-services";
import { DEFAULT_REQUIRED_TABLES, requireTestDatabase } from "./lib/test-db-guard";

type CardSummary = { key: string; title: string; sortOrder: number };

function comparableCard(service: (typeof publicServices)[number], index: number) {
  return {
    title: service.label,
    description: service.description,
    imageUrl: service.image,
    imageAlt: service.imageAlt,
    href: service.href,
    serviceKey: service.key,
    sortOrder: index * 10,
    status: "PUBLISHED" as const,
    language: "en",
    countries: [] as string[],
    startsAt: null as Date | null,
    endsAt: null as Date | null
  };
}

function changedFields(
  existing: {
    title: string;
    description: string;
    imageUrl: string;
    imageAlt: string;
    href: string;
    serviceKey: string | null;
    sortOrder: number;
    status: string;
    language: string;
    countries: string[];
    startsAt: Date | null;
    endsAt: Date | null;
  },
  desired: ReturnType<typeof comparableCard>
): string[] {
  const changed: string[] = [];
  if (existing.title !== desired.title) changed.push("title");
  if (existing.description !== desired.description) changed.push("description");
  if (existing.imageUrl !== desired.imageUrl) changed.push("imageUrl");
  if (existing.imageAlt !== desired.imageAlt) changed.push("imageAlt");
  if (existing.href !== desired.href) changed.push("href");
  if (existing.serviceKey !== desired.serviceKey) changed.push("serviceKey");
  if (existing.sortOrder !== desired.sortOrder) changed.push("sortOrder");
  if (existing.status !== desired.status) changed.push("status");
  if (existing.language !== desired.language) changed.push("language");
  if (JSON.stringify(existing.countries) !== JSON.stringify(desired.countries)) changed.push("countries");
  if ((existing.startsAt?.getTime() ?? null) !== (desired.startsAt?.getTime() ?? null)) changed.push("startsAt");
  if ((existing.endsAt?.getTime() ?? null) !== (desired.endsAt?.getTime() ?? null)) changed.push("endsAt");
  return changed;
}

async function main() {
  const target = await requireTestDatabase({
    requiredTables: [
      ...DEFAULT_REQUIRED_TABLES,
      "User",
      "AuditLog",
      "SystemEvent",
      "PlusContentCard",
      "PlusPlan",
      "PlusBenefit",
      "PlusPromotion",
      "PlusMembership",
      "PlusEntitlement",
      "PlusRedemption"
    ]
  });

  // Import Prisma and the audit service only after the guard has redirected
  // DATABASE_URL to the verified target.
  const { prisma } = await import("@/lib/prisma");
  const { recordAudit } = await import("@/lib/services/core/audit.service");

  async function otherTableCounts() {
    const [plans, benefits, promotions, memberships, entitlements, redemptions] = await Promise.all([
      prisma.plusPlan.count(),
      prisma.plusBenefit.count(),
      prisma.plusPromotion.count(),
      prisma.plusMembership.count(),
      prisma.plusEntitlement.count(),
      prisma.plusRedemption.count()
    ]);
    return { plans, benefits, promotions, memberships, entitlements, redemptions };
  }

  const before = await otherTableCounts();
  const created: CardSummary[] = [];
  const updated: CardSummary[] = [];
  const unchanged: CardSummary[] = [];

  try {
    for (const [index, service] of publicServices.entries()) {
      const key = `service:${service.key}`;
      const desired = comparableCard(service, index);
      const existing = await prisma.plusContentCard.findUnique({ where: { key } });

      if (!existing) {
        const row = await prisma.plusContentCard.create({
          data: { key, ...desired }
        });
        await recordAudit({
          actorId: null,
          action: "plus.seed.content_created",
          entity: "PlusContentCard",
          entityId: row.id,
          metadata: {
            key,
            serviceKey: service.key,
            source: "scripts/plus-awareness-seed.ts",
            mode: "created"
          }
        });
        created.push({ key: row.key, title: row.title, sortOrder: row.sortOrder });
        continue;
      }

      const fields = changedFields(existing, desired);
      if (fields.length === 0) {
        unchanged.push({ key: existing.key, title: existing.title, sortOrder: existing.sortOrder });
        continue;
      }

      const row = await prisma.plusContentCard.update({
        where: { key },
        data: desired
      });
      await recordAudit({
        actorId: null,
        action: "plus.seed.content_updated",
        entity: "PlusContentCard",
        entityId: row.id,
        metadata: {
          key,
          serviceKey: service.key,
          source: "scripts/plus-awareness-seed.ts",
          mode: "updated",
          fields
        }
      });
      updated.push({ key: row.key, title: row.title, sortOrder: row.sortOrder });
    }

    const after = await otherTableCounts();
    const otherTablesUnchanged = JSON.stringify(before) === JSON.stringify(after);
    if (!otherTablesUnchanged) {
      throw new Error(`Seed changed non-content tables: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
    }

    const expectedKeys = publicServices.map((service) => `service:${service.key}`);
    const seeded = await prisma.plusContentCard.findMany({
      where: { key: { startsWith: "service:" } },
      select: { key: true, status: true }
    });
    const byKey = new Map(seeded.map((row) => [row.key, row]));
    const missing = expectedKeys.filter((key) => !byKey.has(key));
    const unpublished = expectedKeys.filter((key) => byKey.get(key)?.status !== "PUBLISHED");
    if (missing.length > 0) throw new Error(`Seed did not create expected keys: ${missing.join(", ")}`);
    if (unpublished.length > 0) throw new Error(`Seed left cards unpublished: ${unpublished.join(", ")}`);
    const duplicates = seeded.length !== new Set(seeded.map((row) => row.key)).size;
    if (duplicates) throw new Error("Duplicate service:* keys found after seed.");
    const stale = seeded.filter((row) => !expectedKeys.includes(row.key)).map((row) => row.key);

    const summary = {
      database: target.databaseName,
      marker: target.marker,
      registrySize: publicServices.length,
      created,
      updated,
      unchanged,
      contentRowsWithServicePrefix: seeded.length,
      otherTablesUnchanged,
      otherTables: after,
      staleKeysNotDeleted: stale
    };
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
