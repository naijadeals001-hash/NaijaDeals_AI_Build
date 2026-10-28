import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Db = PrismaClient | Prisma.TransactionClient;

export async function recordSystemEvent(input: {
  tx?: Db;
  type: string;
  actorId?: string | null;
  entity: string;
  entityId?: string | null;
  payload?: Prisma.InputJsonValue;
}) {
  const db = input.tx ?? prisma;
  return db.systemEvent.create({
    data: {
      type: input.type,
      actorId: input.actorId ?? null,
      entity: input.entity,
      entityId: input.entityId ?? null,
      payload: input.payload
    }
  });
}
