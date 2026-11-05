import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { postBalancedTransaction } from "./wallet.service";

export const P2P_TRANSFER_LIMIT_KOBO = 5_000_000n;
export const P2P_TRANSFER_MIN_KOBO = 100n;

/**
 * Peer-to-peer NaijaPay transfer between customer wallets.
 *
 * Safety properties (verified by scripts/pay-transfer-tests.ts):
 * - Idempotency: the caller's idempotency key becomes the unique wallet
 *   transaction reference (P2P-<key>); retries return the original result
 *   instead of posting twice.
 * - Concurrency: the sender's balance is reserved with a conditional
 *   `UPDATE ... WHERE availableKobo >= amount`, so two simultaneous sends can
 *   never overspend one wallet.
 * - Balanced ledger: one WalletTransaction posts a DEBIT on the sender and a
 *   matching CREDIT on the receiver via postBalancedTransaction, which rejects
 *   unbalanced journals.
 */
export async function sendP2PTransfer(client: PrismaClient, input: {
  senderUserId: string;
  recipientEmail: string;
  amountKobo: bigint;
  idempotencyKey: string;
  note?: string;
}) {
  const amount = input.amountKobo;
  if (amount < P2P_TRANSFER_MIN_KOBO) {
    throw new ApiError(400, "invalid_amount", `Minimum transfer is ${(Number(P2P_TRANSFER_MIN_KOBO) / 100).toFixed(2)} NGN.`);
  }
  if (amount > P2P_TRANSFER_LIMIT_KOBO) {
    throw new ApiError(400, "invalid_amount", `Transfers above ${(Number(P2P_TRANSFER_LIMIT_KOBO) / 100).toFixed(2)} NGN are not supported yet.`);
  }
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(input.idempotencyKey)) {
    throw new ApiError(400, "invalid_idempotency_key", "Provide 8-64 alphanumeric characters as the idempotency key.");
  }
  const reference = `P2P-${input.idempotencyKey}`;

  const recipient = await client.user.findUnique({ where: { email: input.recipientEmail.toLowerCase() }, include: { wallets: true } });
  const recipientWallet = recipient?.wallets[0];
  if (!recipient || !recipientWallet) {
    throw new ApiError(404, "recipient_not_found", "No NaijaPay wallet exists for that email address.");
  }
  if (recipient.id === input.senderUserId) {
    throw new ApiError(400, "self_transfer", "You cannot send money to yourself.");
  }

  const senderWallet = await client.wallet.findFirst({ where: { userId: input.senderUserId } });
  if (!senderWallet) {
    throw new ApiError(404, "wallet_not_found", "Sender has no NaijaPay wallet.");
  }

  return client.$transaction(async (tx) => {
    // Idempotency: a completed transfer with this reference is returned as-is.
    const existing = await tx.walletTransaction.findUnique({ where: { reference }, include: { ledger: true } });
    if (existing) {
      return { duplicate: true as const, reference, transactionId: existing.id };
    }

    // Concurrency-safe reservation: only succeeds while the balance covers it.
    const reserved = await tx.wallet.updateMany({
      where: { id: senderWallet.id, availableKobo: { gte: amount } },
      data: { availableKobo: { decrement: amount } }
    });
    if (reserved.count !== 1) {
      throw new ApiError(409, "insufficient_funds", "The wallet balance is too low for this transfer.");
    }
    await tx.wallet.update({ where: { id: recipientWallet.id }, data: { availableKobo: { increment: amount } } });

    const transaction = await postBalancedTransaction({
      tx,
      actorId: input.senderUserId,
      walletId: senderWallet.id,
      type: "debit",
      amountKobo: amount,
      reference,
      description: input.note?.trim()
        ? `NaijaPay transfer to ${recipient.email}: ${input.note.trim()}`
        : `NaijaPay transfer to ${recipient.email}`,
      entries: [
        { walletId: senderWallet.id, direction: "DEBIT", amountKobo: amount, memo: "P2P send" },
        { walletId: recipientWallet.id, direction: "CREDIT", amountKobo: amount, memo: "P2P receive" }
      ]
    });

    return { duplicate: false as const, reference, transactionId: transaction.id };
  }, { isolationLevel: "Serializable" });
}

/** Convenience wrapper for routes using the shared prisma client. */
export async function sendP2PTransferFromApp(input: Parameters<typeof sendP2PTransfer>[1]) {
  return sendP2PTransfer(prisma, input);
}
