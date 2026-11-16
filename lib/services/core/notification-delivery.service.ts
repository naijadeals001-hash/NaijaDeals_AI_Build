import type { Notification, NotificationCategory, NotificationChannel, Prisma } from "@prisma/client";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { contactAddress } from "@/lib/data/contact-directory";
import { recordAudit } from "./audit.service";
import { QUEUE_NAMES, enqueue, isQueueConfigured } from "@/lib/infra/queue";
import { log } from "@/lib/infra/logger";
import { infraMetrics } from "@/lib/infra/metrics";
import { renderTemplate, templateCategory, TemplateDataMissing } from "@/lib/notifications/templates";
import {
  transportsFor,
  type NotificationMessage,
  type NotificationTransport
} from "@/lib/notifications/transports";
import { flakyInAppTestTransport, flakyTestMode } from "@/lib/notifications/test-transport";

/**
 * Multi-channel delivery for the notifications NaijaDeals already shows in-app.
 *
 * `notification.service.ts` remains the in-app feed: `notifyUser` and
 * `notifyVendorOwner` still write `PartnerNotification`, which the seller,
 * driver, courier, gigs and stream screens read. This module adds templates,
 * preferences, delivery state, retries, failover and auditing on top, and the
 * in-app transport writes that same feed row, so there is exactly one feed.
 *
 * Rules:
 *  - `dedupeKey` is unique: a replayed webhook cannot produce a second message.
 *  - Delivery is claimed by a conditional update, so two workers cannot send
 *    the same row.
 *  - A channel with no provider account is SUPPRESSED with a reason, never
 *    marked SENT. Nothing here reports a delivery that did not happen.
 *  - Messages are created after the business transaction commits; a failed
 *    message never rolls back a payment.
 */

export type NotifyInput = {
  userId?: string | null;
  channel: NotificationChannel;
  templateKey: string;
  eventType: string;
  entityType?: string | null;
  entityId?: string | null;
  data?: Record<string, unknown>;
  category?: NotificationCategory;
  dedupeKey?: string;
  scheduledFor?: Date;
};

const BACKOFF_MS = [30_000, 120_000, 600_000, 1_800_000];
const CAPTURE_DIR = join(process.cwd(), "logs", "notifications");

/** Categories a user cannot switch off. */
const MANDATORY: NotificationCategory[] = ["ACCOUNT", "SYSTEM"];

function stableHash(value: unknown): string {
  const text = JSON.stringify(value ?? {});
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function defaultDedupeKey(input: NotifyInput): string {
  return [
    input.eventType,
    input.channel,
    input.entityType ?? "-",
    input.entityId ?? "-",
    input.userId ?? "anonymous",
    stableHash(input.data)
  ].join(":");
}

export async function isChannelEnabled(
  userId: string | null | undefined,
  channel: NotificationChannel,
  category: NotificationCategory
): Promise<boolean> {
  if (!userId) return false;
  if (MANDATORY.includes(category)) return true;
  const preference = await prisma.notificationPreference
    .findUnique({ where: { userId_channel_category: { userId, channel, category } } })
    .catch(() => null);
  return preference ? preference.enabled : true;
}

async function resolveRecipient(
  userId: string | null | undefined,
  channel: NotificationChannel
): Promise<string | null> {
  if (!userId) return null;
  if (channel === "IN_APP") return `in-app:${userId}`;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, phone: true }
  });
  if (!user) return null;

  if (channel === "EMAIL") return user.email ?? null;
  if (channel === "SMS") {
    if (!user.phone) return null;
    const digits = user.phone.replace(/[^\d+]/g, "");
    return digits.startsWith("+") ? digits : `+234${digits.replace(/^0/, "")}`;
  }

  const device = await prisma.deviceRegistration.findFirst({
    where: { userId, revokedAt: null, pushToken: { not: null } },
    orderBy: { lastSeenAt: "desc" },
    select: { pushToken: true }
  });
  return device?.pushToken ?? null;
}

async function templateOverride(key: string, channel: NotificationChannel) {
  return prisma.notificationTemplate
    .findUnique({
      where: { key_channel_locale: { key, channel, locale: "en-NG" } },
      select: { subject: true, body: true, active: true }
    })
    .catch(() => null);
}

/** Writes the row the existing in-app feed already renders. */
async function writeFeed(message: NotificationMessage): Promise<string> {
  const source = await prisma.notification.findUnique({
    where: { id: message.notificationId },
    select: { eventType: true, templateKey: true }
  });
  const row = await prisma.partnerNotification.create({
    data: {
      userId: message.userId!,
      kind: source?.eventType ?? source?.templateKey ?? "system",
      title: message.subject ?? message.body.slice(0, 90),
      body: message.body,
      href: typeof message.data?.href === "string" ? message.data.href : null
    },
    select: { id: true }
  });
  return row.id;
}

function transportChain(channel: NotificationChannel): NotificationTransport[] {
  const chain = transportsFor(channel, { captureDirectory: CAPTURE_DIR, feed: writeFeed });
  if (channel !== "IN_APP") return chain;
  // Test-only seam: replaces the chain (not extends it) so a deterministic
  // failure cannot fall through to the real transport in the same call. The
  // guard keeps unset variables and production builds on the normal path.
  const mode = flakyTestMode();
  if (!mode) return chain;
  const real = chain.find((transport) => transport.name === "in-app");
  if (!real) return chain;
  return [flakyInAppTestTransport(real, mode)];
}

/**
 * Creates the notification, or returns the existing one for a duplicate, and
 * queues delivery when a queue backend exists.
 */
export async function notify(input: NotifyInput): Promise<{ notification: Notification; created: boolean }> {
  const category = input.category ?? templateCategory(input.templateKey);
  const dedupeKey = input.dedupeKey ?? defaultDedupeKey(input);

  const existing = await prisma.notification.findUnique({ where: { dedupeKey } });
  if (existing) return { notification: existing, created: false };

  const enabled = await isChannelEnabled(input.userId, input.channel, category);
  const recipient = enabled ? await resolveRecipient(input.userId, input.channel) : null;

  let title = "";
  let body = "";
  let renderError: string | null = null;

  try {
    const override = await templateOverride(input.templateKey, input.channel);
    const rendered = renderTemplate(
      input.templateKey,
      input.channel,
      input.data ?? {},
      override && override.active ? override : null
    );
    title = rendered.title;
    body = rendered.body;
  } catch (error) {
    renderError = error instanceof TemplateDataMissing ? error.message : `template_error:${input.templateKey}`;
    title = "Notification could not be prepared";
    body = "A message for this event could not be rendered. Report this to support.";
  }

  const suppressed = !enabled ? "preference_disabled" : !recipient ? "no_recipient" : renderError;

  try {
    const notification = await prisma.notification.create({
      data: {
        userId: input.userId ?? null,
        channel: input.channel,
        category,
        templateKey: input.templateKey,
        eventType: input.eventType,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        title,
        body,
        data: (input.data ?? {}) as Prisma.InputJsonValue,
        dedupeKey,
        status: suppressed ? "SUPPRESSED" : "QUEUED",
        lastError: suppressed,
        scheduledFor: input.scheduledFor ?? new Date()
      }
    });

    infraMetrics().queueJobs.inc({ queue: "notifications", event: suppressed ? "suppressed" : "enqueued" });

    if (!suppressed) await scheduleDelivery(notification.id, input.scheduledFor);

    if (suppressed === "preference_disabled" || suppressed === "no_recipient") {
      await recordAudit({
        action: "notification.suppressed",
        entity: "Notification",
        entityId: notification.id,
        metadata: { channel: input.channel, templateKey: input.templateKey, reason: suppressed }
      });
    }

    return { notification, created: true };
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      const raced = await prisma.notification.findUnique({ where: { dedupeKey } });
      if (raced) return { notification: raced, created: false };
    }
    throw error;
  }
}

async function scheduleDelivery(notificationId: string, scheduledFor?: Date): Promise<boolean> {
  if (!isQueueConfigured()) return false;
  const delayMs = scheduledFor ? Math.max(0, scheduledFor.getTime() - Date.now()) : 0;
  const jobId = await enqueue(
    QUEUE_NAMES.notifications,
    "deliver",
    { notificationId },
    { jobId: `notification-${notificationId}`, delayMs, attempts: 1 }
  );
  return Boolean(jobId);
}

/**
 * Why a delivery call did or did not send anything.
 *
 * `skipped` alone is ambiguous: a message that is waiting for its backoff, one
 * another worker is sending right now, a terminal failure and a missing row all
 * failed to claim. Callers that must not lose a message (the intent processor)
 * branch on `reason`, never on `skipped`.
 */
export type DeliveryReason = "delivered" | "suppressed" | "not_due" | "in_flight" | "terminal" | "missing";

export type DeliveryOutcome = {
  id: string;
  status: string;
  provider?: string;
  error?: string;
  /** Retained for backwards compatibility. Never infer success from it alone. */
  skipped?: boolean;
  reason: DeliveryReason;
  /** When `reason` is "not_due": the earliest moment a claim can succeed. */
  scheduledFor?: Date;
};

/** Classifies a row that could not be claimed without sending anything. */
function unclaimedOutcome(row: {
  id: string;
  status: string;
  scheduledFor: Date;
  lastError: string | null;
  provider: string | null;
}): DeliveryOutcome {
  switch (row.status) {
    case "SENT":
    case "DELIVERED":
    case "READ":
      return { id: row.id, status: row.status, provider: row.provider ?? undefined, reason: "delivered" };
    case "SUPPRESSED":
      return { id: row.id, status: row.status, error: row.lastError ?? undefined, reason: "suppressed" };
    case "QUEUED":
      return {
        id: row.id,
        status: row.status,
        error: row.lastError ?? undefined,
        reason: "not_due",
        scheduledFor: row.scheduledFor
      };
    case "SENDING":
      return { id: row.id, status: row.status, provider: row.provider ?? undefined, reason: "in_flight" };
    default:
      // FAILED and any future terminal status. Retrying without operator action
      // would resend a message the provider already rejected.
      return {
        id: row.id,
        status: row.status,
        provider: row.provider ?? undefined,
        error: row.lastError ?? undefined,
        reason: "terminal"
      };
  }
}

/**
 * Sends one notification. Safe to call twice: the claim is a conditional
 * update from QUEUED to SENDING, so only one caller proceeds. When the claim
 * fails, the current row is read and classified so callers can distinguish a
 * message that is merely not due from one that is in flight or terminally
 * failed.
 */
export async function deliverNotification(notificationId: string): Promise<DeliveryOutcome> {
  const claim = await prisma.notification.updateMany({
    where: { id: notificationId, status: "QUEUED", scheduledFor: { lte: new Date() } },
    data: { status: "SENDING", attempts: { increment: 1 } }
  });
  if (claim.count === 0) {
    const current = await prisma.notification.findUnique({
      where: { id: notificationId },
      select: { id: true, status: true, scheduledFor: true, lastError: true, provider: true }
    });
    if (!current) return { id: notificationId, status: "missing", skipped: true, reason: "missing" };
    return { ...unclaimedOutcome(current), skipped: true };
  }

  const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!notification) return { id: notificationId, status: "missing", skipped: true, reason: "missing" };

  const recipient = await resolveRecipient(notification.userId, notification.channel);
  const chain = transportChain(notification.channel);
  const attempt = notification.attempts;
  let last: { provider: string; error: string; retryable: boolean } | null = null;

  for (const transport of chain) {
    if (!transport.configured()) {
      // Still recorded: an operator inspecting a failed message needs to see
      // that the channel was attempted and why it could not be sent.
      await prisma.notificationAttempt.create({
        data: {
          notificationId: notification.id,
          attempt,
          provider: transport.name,
          ok: false,
          retryable: false,
          error: "no_provider_configured"
        }
      });
      last = { provider: transport.name, error: "no_provider_configured", retryable: false };
      continue;
    }

    const result = await transport.send({
      notificationId: notification.id,
      userId: notification.userId,
      to: recipient ?? "unknown",
      subject: notification.title,
      body: notification.body,
      replyTo: notification.channel === "EMAIL" ? contactAddress("support") : undefined,
      data: (notification.data ?? {}) as Record<string, unknown>
    });

    await prisma.notificationAttempt.create({
      data: {
        notificationId: notification.id,
        attempt,
        provider: transport.name,
        ok: result.ok,
        retryable: result.retryable,
        error: result.error ?? null
      }
    });

    if (result.ok) {
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: "SENT",
          provider: transport.name,
          providerMessageId: result.messageId ?? null,
          sentAt: new Date(),
          lastError: null
        }
      });
      infraMetrics().queueJobs.inc({ queue: "notifications", event: "sent" });
      log.info("notification.sent", {
        id: notification.id,
        channel: notification.channel,
        template: notification.templateKey,
        provider: transport.name
      });
      return { id: notification.id, status: "SENT", provider: transport.name, reason: "delivered" };
    }

    last = { provider: transport.name, error: result.error ?? "send_failed", retryable: result.retryable };
    if (!result.retryable) break;
  }

  const exhausted = attempt >= notification.maxAttempts;
  const retryable = last?.retryable ?? false;
  const nextStatus = retryable && !exhausted ? "QUEUED" : "FAILED";
  const backoff = BACKOFF_MS[Math.min(Math.max(attempt - 1, 0), BACKOFF_MS.length - 1)];
  const retryAt = new Date(Date.now() + backoff);

  await prisma.notification.update({
    where: { id: notification.id },
    data: {
      status: nextStatus,
      lastError: last?.error ?? "no_transport",
      scheduledFor: nextStatus === "QUEUED" ? retryAt : notification.scheduledFor
    }
  });

  infraMetrics().queueJobs.inc({ queue: "notifications", event: nextStatus === "QUEUED" ? "retry" : "failed" });

  if (nextStatus === "QUEUED") {
    await scheduleDelivery(notification.id, retryAt);
  } else {
    await recordAudit({
      action: "notification.failed",
      entity: "Notification",
      entityId: notification.id,
      metadata: {
        channel: notification.channel,
        templateKey: notification.templateKey,
        attempts: attempt,
        provider: last?.provider ?? "none",
        error: last?.error ?? "no_transport"
      }
    });
    log.warn("notification.failed", {
      id: notification.id,
      channel: notification.channel,
      template: notification.templateKey,
      attempts: attempt,
      error: last?.error ?? "no_transport"
    });
  }

  return {
    id: notification.id,
    status: nextStatus,
    provider: last?.provider,
    error: last?.error,
    reason: nextStatus === "QUEUED" ? "not_due" : "terminal",
    // A retryable send failure retries on the notification's own backoff; the
    // intent processor reuses that schedule instead of inventing a second one.
    scheduledFor: nextStatus === "QUEUED" ? retryAt : undefined
  };
}

/** Creates and delivers immediately, for environments without a queue. */
export async function notifyNow(input: NotifyInput): Promise<Notification> {
  const { notification, created } = await notify(input);
  if (created) await deliverNotification(notification.id);
  return notification;
}

/** Crash recovery: delivers rows a lost queue job left behind. */
export async function flushDueNotifications(limit = 25): Promise<number> {
  const due = await prisma.notification.findMany({
    where: { status: "QUEUED", scheduledFor: { lte: new Date() } },
    orderBy: { scheduledFor: "asc" },
    take: limit,
    select: { id: true }
  });

  let delivered = 0;
  for (const row of due) {
    const outcome = await deliverNotification(row.id);
    if (outcome.reason === "delivered") delivered += 1;
  }
  return delivered;
}

/** Recovers rows stuck in SENDING after a worker died mid-send. */
export async function recoverStuckSending(olderThanMs = 5 * 60_000): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const result = await prisma.notification.updateMany({
    where: { status: "SENDING", updatedAt: { lt: cutoff } },
    data: { status: "QUEUED", lastError: "recovered_after_worker_restart" }
  });
  return result.count;
}

export async function setNotificationPreference(input: {
  userId: string;
  channel: NotificationChannel;
  category: NotificationCategory;
  enabled: boolean;
}) {
  if (MANDATORY.includes(input.category) && !input.enabled) {
    return { ok: false as const, reason: "mandatory_category" };
  }
  const row = await prisma.notificationPreference.upsert({
    where: {
      userId_channel_category: {
        userId: input.userId,
        channel: input.channel,
        category: input.category
      }
    },
    update: { enabled: input.enabled },
    create: input
  });
  return { ok: true as const, preference: row };
}

export async function listPreferences(userId: string) {
  return prisma.notificationPreference.findMany({ where: { userId } });
}

/**
 * Fire-and-forget helper for business services. A notification failure is
 * logged and counted, never thrown into the caller's transaction.
 */
export async function notifySafely(input: NotifyInput): Promise<void> {
  try {
    await notify(input);
  } catch (error) {
    infraMetrics().queueJobs.inc({ queue: "notifications", event: "error" });
    log.error("notification.enqueue_failed", {
      template: input.templateKey,
      eventType: input.eventType,
      entityType: input.entityType ?? null,
      error: error instanceof Error ? error.message.slice(0, 160) : "unknown"
    });
  }
}
