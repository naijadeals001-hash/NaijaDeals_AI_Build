import { prisma } from "@/lib/prisma";

type Db = typeof prisma;

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
  const vendor = await prisma.vendor.findUnique({ where: { id: input.vendorId }, select: { ownerId: true } });
  if (!vendor) return null;
  return notifyUser({ tx: input.tx, userId: vendor.ownerId, kind: input.kind, title: input.title, body: input.body, href: input.href });
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
