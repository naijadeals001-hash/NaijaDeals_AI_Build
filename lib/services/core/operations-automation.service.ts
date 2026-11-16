import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { enqueueIntent, type IntentInput } from "@/lib/notifications/intent.service";
import { recordSystemEvent } from "./event.service";

/**
 * Operations automation for the local consumer (n8n) and the staging jobs.
 *
 * Everything here is deliberately operator-facing: onboarding reminders, a
 * daily summary and backup status alerts. No wallet is read and no money is
 * recomputed; the summary only counts rows in their committed state.
 *
 * Repeatability rests on intent dedupe keys alone. A scan may run every few
 * minutes, from more than one process, and still produce at most one intent per
 * applicant per day, per staff member per report, and per backup run.
 */

export const OPERATIONS_STAFF_ROLES = ["admin", "ops", "super_admin"] as const;

/** A staff account that is not narrowed to a country or city. */
const UNSCOPED_STAFF_WHERE = {
  scopeCountryCode: null,
  scopeCityCode: null,
  roles: { some: { role: { name: { in: [...OPERATIONS_STAFF_ROLES] } } } }
} satisfies Prisma.UserWhereInput;

const ONBOARDING_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const BACKUP_STALE_MS = 26 * 60 * 60 * 1000;
const PAYLOAD_VERSION = 1;

export type OnboardingKind = "seller" | "restaurant" | "driver";

/**
 * Skips a key that already exists before asking the intent store to insert it.
 * The unique index remains the only overlap protection; this read just keeps a
 * routine repeat scan from logging a unique-constraint error for every key that
 * was already written (two concurrent scanners can still race, and P2002 is
 * still handled by `enqueueIntent`).
 */
async function enqueueOnce(input: IntentInput): Promise<boolean> {
  const existing = await prisma.notificationIntent.findUnique({
    where: { dedupeKey: input.dedupeKey },
    select: { id: true }
  });
  if (existing) return false;
  // Spell the fields out so the source-level contract check can see that every
  // wrapper call carries a dedupe key, even though the key comes from input.
  return enqueueIntent(prisma, {
    dedupeKey: input.dedupeKey,
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    recipientUserId: input.recipientUserId,
    payload: input.payload,
    scheduledAt: input.scheduledAt
  });
}

/**
 * Presentation grouping for the daily report. The grouping only decides how
 * existing OrderStatus counts are shown; it never changes an order.
 */
export const ORDER_STATUS_GROUPS = [
  { label: "awaiting", statuses: ["created", "payment_pending"] },
  {
    label: "in progress",
    statuses: [
      "escrow_held",
      "vendor_notified",
      "accepted",
      "preparing",
      "ready_for_pickup",
      "courier_assigned",
      "picked_up",
      "in_transit"
    ]
  },
  { label: "delivered", statuses: ["delivered", "completed"] },
  { label: "exception", statuses: ["cancelled", "disputed", "refunded"] }
] as const;

/** UTC calendar day, the unit every daily dedupe key is scoped to. */
export function utcDay(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export type OperationsRecipient = { id: string };

/** Unscoped admin/ops/super_admin accounts, in a stable order. */
export async function listOperationsRecipients(): Promise<OperationsRecipient[]> {
  return prisma.user.findMany({
    where: UNSCOPED_STAFF_WHERE,
    select: { id: true },
    orderBy: { id: "asc" }
  });
}

type OnboardingCandidate = {
  kind: OnboardingKind;
  entityType: string;
  entityId: string;
  recipientUserId: string;
  status: string;
  createdAt: Date;
  href: string;
};

/**
 * Applications that have waited more than three days without a decision.
 * The href is the applicant-facing destination; it is not the admin review page.
 */
export async function findStaleOnboarding(now: Date = new Date()): Promise<OnboardingCandidate[]> {
  const cutoff = new Date(now.getTime() - ONBOARDING_AGE_MS);

  const [sellers, restaurants, drivers] = await Promise.all([
    prisma.sellerApplication.findMany({
      where: { status: "SUBMITTED", createdAt: { lt: cutoff } },
      select: { id: true, userId: true, status: true, createdAt: true },
      orderBy: { createdAt: "asc" }
    }),
    prisma.restaurantApplication.findMany({
      where: { status: "SUBMITTED", createdAt: { lt: cutoff } },
      select: { id: true, userId: true, status: true, createdAt: true },
      orderBy: { createdAt: "asc" }
    }),
    prisma.driverProfile.findMany({
      where: { status: "pending", createdAt: { lt: cutoff } },
      select: { id: true, userId: true, status: true, createdAt: true },
      orderBy: { createdAt: "asc" }
    })
  ]);

  return [
    ...sellers.map((row) => ({
      kind: "seller" as const,
      entityType: "SellerApplication",
      entityId: row.id,
      recipientUserId: row.userId,
      status: row.status,
      createdAt: row.createdAt,
      href: "/seller"
    })),
    ...restaurants.map((row) => ({
      kind: "restaurant" as const,
      entityType: "RestaurantApplication",
      entityId: row.id,
      recipientUserId: row.userId,
      status: row.status,
      createdAt: row.createdAt,
      href: "/restaurant/apply"
    })),
    ...drivers.map((row) => ({
      kind: "driver" as const,
      entityType: "DriverProfile",
      entityId: row.id,
      recipientUserId: row.userId,
      status: row.status,
      createdAt: row.createdAt,
      href: "/onboarding/driver"
    }))
  ];
}

export type OnboardingScanResult = {
  seller: number;
  restaurant: number;
  driver: number;
  intentsCreated: number;
};

/** One reminder per applicant, per kind, per UTC day. */
export async function scanOnboardingReminders(now: Date = new Date()): Promise<OnboardingScanResult> {
  const day = utcDay(now);
  const created: Record<OnboardingKind, number> = { seller: 0, restaurant: 0, driver: 0 };

  for (const candidate of await findStaleOnboarding(now)) {
    const wrote = await enqueueOnce({
      dedupeKey: `onboarding.reminder:${candidate.kind}:${candidate.entityId}:${day}`,
      eventType: "onboarding.reminder",
      entityType: candidate.entityType,
      entityId: candidate.entityId,
      recipientUserId: candidate.recipientUserId,
      payload: {
        version: PAYLOAD_VERSION,
        kind: candidate.kind,
        status: candidate.status,
        createdAt: candidate.createdAt.toISOString(),
        href: candidate.href
      }
    });
    if (wrote) created[candidate.kind] += 1;
  }

  return {
    seller: created.seller,
    restaurant: created.restaurant,
    driver: created.driver,
    intentsCreated: created.seller + created.restaurant + created.driver
  };
}

/**
 * A compact, factual summary for the daily operations report. Counts are read
 * in their committed state; the text is deterministic for a given database.
 */
export async function buildDailySummary(): Promise<string> {
  const [ordersByStatus, openSupport, pendingRefunds, pendingPayouts, sellers, restaurants, drivers, deadIntents] =
    await Promise.all([
      prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.supportTicket.count({ where: { status: { in: ["OPEN", "PENDING"] } } }),
      prisma.refund.count({ where: { status: "PENDING" } }),
      // PENDING and APPROVED are both unpaid; PAID and REJECTED are finished.
      prisma.payout.count({ where: { status: { in: ["PENDING", "APPROVED"] } } }),
      prisma.sellerApplication.count({ where: { status: "SUBMITTED" } }),
      prisma.restaurantApplication.count({ where: { status: "SUBMITTED" } }),
      prisma.driverProfile.count({ where: { status: "pending" } }),
      prisma.notificationIntent.count({ where: { status: "DEAD" } })
    ]);

  const counts = new Map(ordersByStatus.map((row) => [row.status, row._count._all]));
  const orderParts = ORDER_STATUS_GROUPS.map((group) => {
    const total = group.statuses.reduce((sum, status) => sum + (counts.get(status) ?? 0), 0);
    return `${group.label} ${total}`;
  });

  return [
    `Orders ${orderParts.join(", ")}.`,
    `Open support ${openSupport}.`,
    `Pending refunds ${pendingRefunds}.`,
    `Pending payouts ${pendingPayouts}.`,
    `Applications seller ${sellers}, restaurant ${restaurants}, driver ${drivers}.`,
    `Dead notification intents ${deadIntents}.`
  ].join(" ");
}

export type DailyReportScanResult = {
  recipients: number;
  intentsCreated: number;
};

/** One report intent per unscoped staff member per UTC day. */
export async function scanDailyReports(now: Date = new Date()): Promise<DailyReportScanResult> {
  const day = utcDay(now);
  const recipients = await listOperationsRecipients();
  if (recipients.length === 0) return { recipients: 0, intentsCreated: 0 };

  const summary = await buildDailySummary();
  let intentsCreated = 0;
  for (const recipient of recipients) {
    const wrote = await enqueueOnce({
      dedupeKey: `ops.daily_report:${day}:${recipient.id}`,
      eventType: "ops.daily_report",
      entityType: "System",
      entityId: day,
      recipientUserId: recipient.id,
      payload: { version: PAYLOAD_VERSION, date: day, summary }
    });
    if (wrote) intentsCreated += 1;
  }
  return { recipients: recipients.length, intentsCreated };
}

/** The latest successful backup, newest first. */
export async function latestSuccessfulBackup(): Promise<
  { runId: string | null; finishedAt: Date; recordedAt: Date } | null
> {
  const event = await prisma.systemEvent.findFirst({
    where: { type: "backup.status", payload: { path: ["status"], equals: "success" } },
    orderBy: { createdAt: "desc" },
    select: { entityId: true, payload: true, createdAt: true }
  });
  if (!event) return null;

  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const finishedAt = typeof payload.finishedAt === "string" ? new Date(payload.finishedAt) : null;
  return {
    runId: event.entityId,
    finishedAt: finishedAt && !Number.isNaN(finishedAt.getTime()) ? finishedAt : event.createdAt,
    recordedAt: event.createdAt
  };
}

/**
 * True when the newest successful backup event is absent or older than 26
 * hours. `lastSuccessAt` is the completion time when the event carries one,
 * otherwise the event's own recorded time.
 */
export function backupIsStale(latest: { finishedAt: Date } | null, now: Date = new Date()): boolean {
  if (!latest) return true;
  return now.getTime() - latest.finishedAt.getTime() > BACKUP_STALE_MS;
}

export type StaleBackupScanResult = {
  stale: boolean;
  lastSuccessAt: string | null;
  intentsCreated: number;
};

/** One stale-backup alert per staff member per UTC day, only while stale. */
export async function scanBackupStaleness(now: Date = new Date()): Promise<StaleBackupScanResult> {
  const day = utcDay(now);
  const latest = await latestSuccessfulBackup();
  if (!backupIsStale(latest, now)) {
    return { stale: false, lastSuccessAt: latest?.finishedAt.toISOString() ?? null, intentsCreated: 0 };
  }

  const recipients = await listOperationsRecipients();
  const lastSuccessAt = latest?.finishedAt.toISOString() ?? null;
  let intentsCreated = 0;
  for (const recipient of recipients) {
    const wrote = await enqueueOnce({
      dedupeKey: `ops.backup_stale:${day}:${recipient.id}`,
      eventType: "ops.backup_stale",
      entityType: "System",
      entityId: day,
      recipientUserId: recipient.id,
      payload: { version: PAYLOAD_VERSION, date: day, lastSuccessAt }
    });
    if (wrote) intentsCreated += 1;
  }
  return { stale: true, lastSuccessAt, intentsCreated };
}

export type BackupStatusInput = {
  runId: string;
  status: "success" | "failure";
  target: "staging-db" | "n8n" | "files";
  finishedAt: Date;
  message?: string;
};

export type BackupStatusResult = {
  duplicate: boolean;
  intentsCreated: number;
};

/**
 * Records a backup outcome and alerts every unscoped staff member.
 *
 * The SystemEvent and the intents commit together. A per-run advisory lock
 * serialises concurrent reports for the same run id, so a retried HTTP request
 * observes the first event instead of writing a second one. The intents are
 * independently protected by their dedupe keys.
 */
export async function recordBackupStatus(input: BackupStatusInput): Promise<BackupStatusResult> {
  return prisma.$transaction(async (tx) => {
    // Transaction-scoped lock: released automatically on commit or rollback.
    // hashtext collisions can only serialise two unrelated runs; they cannot
    // let a duplicate through. The outer select hides the lock function's
    // `void` return, which Prisma cannot deserialize.
    await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${`backup.status:${input.runId}`})) AS acquired) AS lock`;

    const existing = await tx.systemEvent.findFirst({
      where: { type: "backup.status", entity: "Backup", entityId: input.runId },
      select: { id: true }
    });
    if (existing) return { duplicate: true, intentsCreated: 0 };

    const eventType = input.status === "success" ? "ops.backup_succeeded" : "ops.backup_failed";
    const payload = {
      version: PAYLOAD_VERSION,
      target: input.target,
      runId: input.runId,
      finishedAt: input.finishedAt.toISOString(),
      message: input.message ?? ""
    };

    await recordSystemEvent({
      tx,
      type: "backup.status",
      entity: "Backup",
      entityId: input.runId,
      payload: { ...payload, status: input.status }
    });

    const recipients = await tx.user.findMany({
      where: UNSCOPED_STAFF_WHERE,
      select: { id: true },
      orderBy: { id: "asc" }
    });

    let intentsCreated = 0;
    for (const recipient of recipients) {
      const wrote = await enqueueIntent(tx, {
        dedupeKey: `ops.backup.${input.status}:${input.runId}:${recipient.id}`,
        eventType,
        entityType: "Backup",
        entityId: input.runId,
        recipientUserId: recipient.id,
        payload
      });
      if (wrote) intentsCreated += 1;
    }

    return { duplicate: false, intentsCreated };
  });
}

export type OperationalScanResult = {
  onboarding: number;
  reports: number;
  stale: number;
  intentsCreated: number;
};

/**
 * Runs the three periodic scans. Safe to call as often as the scheduler likes:
 * every write is an intent whose dedupe key is the only overlap protection.
 */
export async function runOperationalScan(now: Date = new Date()): Promise<OperationalScanResult> {
  const onboarding = await scanOnboardingReminders(now);
  const reports = await scanDailyReports(now);
  const stale = await scanBackupStaleness(now);

  return {
    onboarding: onboarding.intentsCreated,
    reports: reports.intentsCreated,
    stale: stale.intentsCreated,
    intentsCreated: onboarding.intentsCreated + reports.intentsCreated + stale.intentsCreated
  };
}
