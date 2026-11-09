import { LedgerDirection, type Prisma, type PrismaClient, type WalletTransactionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "./audit.service";
import { recordSystemEvent } from "./event.service";

type Db = PrismaClient | Prisma.TransactionClient;

function sumDebits(entries: Array<{ direction: LedgerDirection; amountKobo: bigint }>) {
  return entries.filter((entry) => entry.direction === "DEBIT").reduce((total, entry) => total + entry.amountKobo, BigInt(0));
}

function sumCredits(entries: Array<{ direction: LedgerDirection; amountKobo: bigint }>) {
  return entries.filter((entry) => entry.direction === "CREDIT").reduce((total, entry) => total + entry.amountKobo, BigInt(0));
}

/**
 * The customer's wallet with history.
 *
 * History must include transactions where this wallet is on EITHER side of the
 * journal, not only those it "owns". An incoming transfer has the sender's
 * wallet as the primary `walletId`, so filtering on that alone leaves the
 * recipient with no record of money they received.
 */
export async function getWalletForUser(userId: string) {
  const wallet = await prisma.wallet.findFirstOrThrow({ where: { userId } });
  const transactions = await prisma.walletTransaction.findMany({
    where: { ledger: { some: { walletId: wallet.id } } },
    orderBy: { createdAt: "desc" },
    take: 300
  });
  const escrowHolds = await prisma.escrowHold.findMany({
    where: { order: { customerId: userId } },
    include: { order: { select: { orderNumber: true, status: true } }, events: { orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "desc" }
  });
  return { ...wallet, transactions, escrowHolds };
}

export async function getWalletLedger(userId: string) {
  const wallet = await prisma.wallet.findFirstOrThrow({ where: { userId } });
  return prisma.ledgerEntry.findMany({
    where: { walletId: wallet.id },
    include: { transaction: true },
    orderBy: { createdAt: "desc" }
  });
}

export async function postBalancedTransaction(input: {
  tx: Db;
  actorId?: string | null;
  orderId?: string | null;
  walletId: string;
  type: WalletTransactionType;
  amountKobo: bigint;
  reference: string;
  description: string;
  entries: Array<{ walletId: string; direction: LedgerDirection; amountKobo: bigint; memo: string }>;
}) {
  if (input.amountKobo <= BigInt(0)) throw new Error("Wallet transaction amount must be positive.");
  if (sumDebits(input.entries) !== sumCredits(input.entries)) {
    throw new Error("Ledger entries must balance before posting.");
  }

  const transaction = await input.tx.walletTransaction.create({
    data: {
      walletId: input.walletId,
      orderId: input.orderId ?? null,
      type: input.type,
      amountKobo: input.amountKobo,
      reference: input.reference,
      description: input.description,
      ledger: {
        create: input.entries.map((entry) => ({
          walletId: entry.walletId,
          direction: entry.direction,
          amountKobo: entry.amountKobo,
          memo: entry.memo
        }))
      }
    },
    include: { ledger: true }
  });

  await recordSystemEvent({
    tx: input.tx,
    type: "wallet.transaction_created",
    actorId: input.actorId,
    entity: "WalletTransaction",
    entityId: transaction.id,
    payload: { reference: input.reference, amountKobo: input.amountKobo.toString(), type: input.type }
  });
  await recordSystemEvent({
    tx: input.tx,
    type: "ledger.entry_posted",
    actorId: input.actorId,
    entity: "WalletTransaction",
    entityId: transaction.id,
    payload: { entryCount: input.entries.length, amountKobo: input.amountKobo.toString() }
  });
  await recordAudit({
    tx: input.tx,
    actorId: input.actorId,
    action: "ledger.entry_posted",
    entity: "WalletTransaction",
    entityId: transaction.id,
    metadata: { reference: input.reference, amountKobo: input.amountKobo.toString() }
  });

  return transaction;
}

export async function assertLedgerBalanced(transactionId: string) {
  const entries = await prisma.ledgerEntry.findMany({ where: { transactionId } });
  return sumDebits(entries) === sumCredits(entries);
}
