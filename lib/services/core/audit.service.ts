import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordSystemEvent } from "./event.service";

type Db = PrismaClient | Prisma.TransactionClient;

export async function recordAudit(input: {
  tx?: Db;
  actorId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  const db = input.tx ?? prisma;
  const audit = await db.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      metadata: input.metadata
    }
  });
  await recordSystemEvent({
    tx: db,
    type: input.action,
    actorId: input.actorId,
    entity: input.entity,
    entityId: input.entityId,
    payload: input.metadata
  });
  return audit;
}
