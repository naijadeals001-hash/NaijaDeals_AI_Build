/**
 * Verifies the notification engine end to end, against the real database.
 *
 *   npx tsx scripts/notifications-verify.ts
 *
 * Creates an isolated test account, exercises every channel and failure mode,
 * then removes the account and its rows. Nothing is sent to a real provider: the
 * email transport is the local capture transport, and SMS/push have no provider
 * configured, which is exactly what one of the checks asserts.
 */

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../lib/prisma";
import {
  deliverNotification,
  notify,
  setNotificationPreference
} from "../lib/services/core/notification-delivery.service";
import { closeCache } from "../lib/infra/cache";
import { closeQueues } from "../lib/infra/queue";

type Row = { name: string; status: "PASS" | "FAIL"; detail: string };
const rows: Row[] = [];

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

const runId = randomUUID().slice(0, 8);

async function main() {
  const user = await prisma.user.create({
    data: {
      email: `notify-verify-${runId}@example.test`,
      name: "Notification Verification",
      phone: "08012345678",
      actorType: "CUSTOMER"
    }
  });

  const base = {
    userId: user.id,
    entityType: "Order" as const,
    entityId: `verify-order-${runId}`,
    data: { orderNumber: `ND-${runId}`, total: "₦12,500.00", href: "/orders" }
  };

  try {
    await check("in-app delivery writes the shared feed", async () => {
      const { notification, created } = await notify({
        ...base,
        channel: "IN_APP",
        templateKey: "order.paid",
        eventType: "order.paid"
      });
      assert(created, "notification was not created");
      const outcome = await deliverNotification(notification.id);
      assert(outcome.status === "SENT", `expected SENT, got ${outcome.status}`);

      const feed = await prisma.partnerNotification.findFirst({
        where: { userId: user.id, title: { contains: `ND-${runId}` } }
      });
      if (!feed) throw new Error("no PartnerNotification row was written");
      return `SENT via ${outcome.provider}, feed row ${feed.id.slice(0, 8)}…`;
    });

    await check("duplicate event produces one message", async () => {
      const first = await notify({
        ...base,
        channel: "IN_APP",
        templateKey: "order.paid",
        eventType: "order.paid"
      });
      const second = await notify({
        ...base,
        channel: "IN_APP",
        templateKey: "order.paid",
        eventType: "order.paid"
      });
      assert(second.created === false, "a duplicate was created");
      assert(second.notification.id === first.notification.id, "different rows for the same event");
      const count = await prisma.notification.count({ where: { dedupeKey: second.notification.dedupeKey } });
      assert(count === 1, `${count} rows share the dedupe key`);
      return "second call returned the original row, count=1";
    });

    await check("concurrent delivery sends once", async () => {
      const { notification } = await notify({
        userId: user.id,
        channel: "EMAIL",
        templateKey: "order.paid",
        eventType: "order.paid",
        entityType: "Order",
        entityId: `concurrent-${runId}`,
        data: { ...base.data, orderNumber: `ND-C-${runId}` }
      });
      const [a, b] = await Promise.all([
        deliverNotification(notification.id),
        deliverNotification(notification.id)
      ]);
      const statuses = [a.status, b.status].sort().join(",");
      assert(statuses === "SENT,skipped", `expected one send and one skip, got ${statuses}`);
      const attempts = await prisma.notificationAttempt.count({ where: { notificationId: notification.id } });
      assert(attempts === 1, `${attempts} attempts recorded for one send`);
      return "one sender, one attempt row, one skip";
    });

    await check("email uses the capture transport, not a vendor", async () => {
      const { notification } = await notify({
        userId: user.id,
        channel: "EMAIL",
        templateKey: "payment.topup_credited",
        eventType: "payment.topup_credited",
        entityType: "WalletTopUp",
        entityId: `email-${runId}`,
        data: { amount: "₦5,000.00" }
      });
      const outcome = await deliverNotification(notification.id);
      assert(outcome.status === "SENT", `expected SENT, got ${outcome.status}`);
      assert(outcome.provider === "capture", `provider was ${outcome.provider}`);
      const day = new Date().toISOString().slice(0, 10);
      const file = join(process.cwd(), "logs", "notifications", `${day}.jsonl`);
      assert(existsSync(file), "capture file was not written");
      const stored = await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } });
      assert(stored.provider === "capture", "provider not recorded on the row");
      return "SENT via capture, provider recorded, local record written";
    });

    await check("SMS without a provider is FAILED, never SENT", async () => {
      const { notification } = await notify({
        userId: user.id,
        channel: "SMS",
        templateKey: "payment.topup_credited",
        eventType: "payment.topup_credited",
        entityType: "WalletTopUp",
        entityId: `sms-${runId}`,
        data: { amount: "₦1,000.00" }
      });
      const outcome = await deliverNotification(notification.id);
      assert(outcome.status === "FAILED", `expected FAILED, got ${outcome.status}`);
      const stored = await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } });
      assert(stored.lastError === "no_provider_configured", `lastError was ${stored.lastError}`);
      const attempt = await prisma.notificationAttempt.findFirst({ where: { notificationId: notification.id } });
      assert(attempt && attempt.ok === false, "no failed attempt recorded");
      return "FAILED with no_provider_configured and an attempt row";
    });

    await check("preference opt-out suppresses email", async () => {
      await setNotificationPreference({
        userId: user.id,
        channel: "EMAIL",
        category: "ORDERS",
        enabled: false
      });
      const { notification } = await notify({
        userId: user.id,
        channel: "EMAIL",
        templateKey: "order.status_changed",
        eventType: "order.status_changed",
        entityType: "Order",
        entityId: `pref-${runId}`,
        data: { orderNumber: `ND-P-${runId}`, status: "shipped" }
      });
      assert(notification.status === "SUPPRESSED", `expected SUPPRESSED, got ${notification.status}`);
      assert(notification.lastError === "preference_disabled", `reason was ${notification.lastError}`);
      const audit = await prisma.auditLog.findFirst({
        where: { entity: "Notification", entityId: notification.id, action: "notification.suppressed" }
      });
      assert(audit, "suppression was not audited");
      return "SUPPRESSED with preference_disabled and an audit row";
    });

    await check("mandatory categories cannot be disabled", async () => {
      const outcome = await setNotificationPreference({
        userId: user.id,
        channel: "EMAIL",
        category: "ACCOUNT",
        enabled: false
      });
      assert(outcome.ok === false, "ACCOUNT preference was accepted");
      return "ACCOUNT opt-out refused";
    });

    await check("missing template variables suppress the message", async () => {
      const { notification } = await notify({
        userId: user.id,
        channel: "IN_APP",
        templateKey: "order.paid",
        eventType: "order.paid",
        entityType: "Order",
        entityId: `broken-${runId}`,
        data: {}
      });
      assert(notification.status === "SUPPRESSED", `expected SUPPRESSED, got ${notification.status}`);
      assert(
        (notification.lastError ?? "").startsWith("template_missing_variables"),
        `reason was ${notification.lastError}`
      );
      return `SUPPRESSED: ${notification.lastError}`;
    });

    await check("recovery requeues a stuck SENDING row", async () => {
      const { notification } = await notify({
        userId: user.id,
        channel: "IN_APP",
        templateKey: "order.paid",
        eventType: "order.paid",
        entityType: "Order",
        entityId: `stuck-${runId}`,
        data: base.data
      });
      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: "SENDING", updatedAt: new Date(Date.now() - 10 * 60_000) }
      });
      const { recoverStuckSending } = await import("../lib/services/core/notification-delivery.service");
      const recovered = await recoverStuckSending();
      assert(recovered >= 1, "nothing was recovered");
      const after = await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } });
      assert(after.status === "QUEUED", `status after recovery was ${after.status}`);
      return `recovered ${recovered} stuck row(s) back to QUEUED`;
    });
  } finally {
    // Feed rows are RESTRICTed to the user, so they go first.
    await prisma.partnerNotification.deleteMany({ where: { userId: user.id } }).catch(() => undefined);
    await prisma.notification.deleteMany({ where: { userId: user.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    await prisma.notification.deleteMany({ where: { userId: null, dedupeKey: { contains: runId } } }).catch(() => undefined);
  }

  const width = Math.max(...rows.map((row) => row.name.length));
  for (const row of rows) {
    console.log(`${row.status.padEnd(4)} ${row.name.padEnd(width)}  ${row.detail}`);
  }
  const failed = rows.filter((row) => row.status === "FAIL").length;
  console.log(`\n${rows.length - failed} passed, ${failed} failed`);

  await closeQueues();
  await closeCache();
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (error) => {
  console.error("notifications verification crashed:", error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
