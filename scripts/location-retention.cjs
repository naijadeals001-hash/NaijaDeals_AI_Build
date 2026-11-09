/**
 * Deletes raw location pings older than the documented retention window.
 *
 * - Runs in bounded batches so no long table lock is taken.
 * - Prints a JSON summary for monitoring and exits non-zero on failure, so a
 *   scheduler records the failure instead of silently succeeding.
 * - Safe to re-run: it only deletes rows older than the cutoff.
 *
 * Usage:
 *   node scripts/location-retention.cjs            # delete
 *   node scripts/location-retention.cjs --dry-run  # report only
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const RETENTION_DAYS = Number(process.env.LOCATION_RETENTION_DAYS ?? 30);
const BATCH = Number(process.env.LOCATION_RETENTION_BATCH ?? 5000);
const dryRun = process.argv.includes("--dry-run");

(async () => {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
  let deleted = 0;
  let batches = 0;

  if (dryRun) {
    const expired = await prisma.locationPing.count({ where: { capturedAt: { lt: cutoff } } });
    console.log(JSON.stringify({ dryRun: true, retentionDays: RETENTION_DAYS, cutoff: cutoff.toISOString(), expired }));
    await prisma.$disconnect();
    return;
  }

  for (;;) {
    // Select ids first, then delete by id: keeps each statement small.
    const rows = await prisma.locationPing.findMany({
      where: { capturedAt: { lt: cutoff } },
      select: { id: true },
      take: BATCH,
      orderBy: { capturedAt: "asc" }
    });
    if (!rows.length) break;
    const result = await prisma.locationPing.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
    deleted += result.count;
    batches += 1;
    if (rows.length < BATCH) break;
  }

  // Report what remains inside the window so a scheduler can alert on anomalies.
  const remaining = await prisma.locationPing.count();
  console.log(JSON.stringify({ retentionDays: RETENTION_DAYS, cutoff: cutoff.toISOString(), deleted, batches, remaining }));
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(JSON.stringify({ error: String(error).slice(0, 300) }));
  await prisma.$disconnect();
  process.exit(1);
});
