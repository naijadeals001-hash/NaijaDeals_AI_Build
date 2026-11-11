import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { enqueueIntent } from "@/lib/notifications/intent.service";

type Db = typeof prisma | Prisma.TransactionClient;

export async function notifyUser(input: {
  tx?: Db | Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
  userId: string;
  kind: string;
  title: string;
  body?: string | null;
  href?: string | null;
}) {
  const db = (input.tx ?? prisma) as typeof prisma;
  return db.partnerNotification.create({
    data: {
      userId: input.userId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null
    }
  });
}

export async function notifyVendorOwner(input: {
  tx?: Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
  vendorId: string;
  kind: string;
  title: string;
  body?: string | null;
  href?: string | null;
}) {
  // The transaction client is authoritative when one is supplied. Calling the
  // global client here from inside a transaction is what made a single-connection
  // pool (connection_limit=1) wait on itself and fail with P2028.
  const db = (input.tx ?? prisma) as typeof prisma;
  const vendor = await db.vendor.findUnique({ where: { id: input.vendorId }, select: { ownerId: true } });
  if (!vendor) return null;
  return notifyUser({ tx: input.tx, userId: vendor.ownerId, kind: input.kind, title: input.title, body: input.body, href: input.href });
}

/**
 * Records a vendor notification in the durable outbox inside the caller's
 * transaction.
 *
 * The financial transaction (payment, escrow, status change) must commit even
 * when notification delivery is unavailable, and must leave no notification
 * behind when it rolls back. Writing a `NotificationIntent` row in the same
 * transaction gives both properties; the worker delivers it afterwards. The
 * vendor lookup uses the transaction client, so a `connection_limit=1` pool is
 * not asked for a second connection while the transaction holds the only one.
 */
export async function enqueueVendorNotification(input: {
  tx: Db;
  vendorId: string;
  eventType: string;
  dedupeKey: string;
  entityType: string;
  entityId: string;
  orderNumber: string;
  href?: string | null;
}): Promise<boolean> {
  const vendor = await input.tx.vendor.findUnique({ where: { id: input.vendorId }, select: { ownerId: true } });
  if (!vendor) return false;
  return enqueueIntent(input.tx, {
    dedupeKey: input.dedupeKey,
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    recipientUserId: vendor.ownerId,
    payload: { orderNumber: input.orderNumber, href: input.href ?? "/seller" }
  });
}

export async function listNotifications(userId: string) {
  return prisma.partnerNotification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50
  });
}

export async function markNotificationsRead(userId: string) {
  return prisma.partnerNotification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() }
  });
}
