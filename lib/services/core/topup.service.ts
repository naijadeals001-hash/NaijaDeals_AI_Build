import type { PrismaClient, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { postBalancedTransaction } from "./wallet.service";
import { getDatabaseClassification } from "@/lib/payments/boundary";

export const TOP_UP_MIN_KOBO = 10_000n; // ₦100
export const TOP_UP_MAX_KOBO = 50_000_000n; // ₦500,000

type Db = PrismaClient | Prisma.TransactionClient;

export type TopUpProvider = "test" | "paystack" | "flutterwave";

/**
 * Wallet top-up (Add Money).
 *
 * The credit is exactly-once because two unique constraints guard it:
 *
 *  - `providerReference` — a provider can only ever be credited for a reference
 *    once, so a replayed or duplicated webhook cannot credit twice.
 *  - `idempotencyKey` — a resubmitted form returns the original top-up.
 *
 * Money moves only through `postBalancedTransaction`, so the wallet credit has a
 * matching counter-entry and can never be a free-floating increase.
 *
 * A browser returning to a "success" URL proves nothing: `creditTopUp` requires a
 * server-side verification result, and refuses to credit on a TEST-classified
 * database unless the local test provider is explicitly in use.
 */

/**
 * Local test provider: a development aid for a TEST-classified database.
 *
 * It is gated on the database classification rather than on NODE_ENV because a
 * local `next start` preview runs with NODE_ENV=production while still pointing
 * at a TEST database; blocking on NODE_ENV alone would make the flow
 * unverifiable locally without making it any safer. A LIVE database always
 * blocks it (checked again in creditTopUp), so test money cannot reach real
 * balances.
 */
export function testProviderAllowed() {
  return process.env.ENABLE_TEST_PAYMENTS === "true";
}

/** Combines the flag with the database class; the class is authoritative. */
export async function testProviderAvailable(client: PrismaClient) {
  if (!testProviderAllowed()) return false;
  const classification = await getDatabaseClassification(client);
  return classification === "TEST";
}

export async function createTopUp(
  client: PrismaClient,
  input: {
    walletId: string;
    amountKobo: bigint;
    provider: TopUpProvider;
    providerReference: string;
    idempotencyKey: string;
    currency?: string;
  }
) {
  const amount = input.amountKobo;
  if (amount < TOP_UP_MIN_KOBO || amount > TOP_UP_MAX_KOBO) {
    throw new ApiError(
      400,
      "amount_out_of_range",
      `Top-ups must be between ₦${Number(TOP_UP_MIN_KOBO) / 100} and ₦${(Number(TOP_UP_MAX_KOBO) / 100).toLocaleString("en-NG")}.`
    );
  }
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(input.idempotencyKey)) {
    throw new ApiError(400, "invalid_idempotency_key", "Provide 8-80 alphanumeric characters as the idempotency key.");
  }

  const existing = await client.walletTopUp.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    return { topUp: existing, duplicate: true as const };
  }

  const topUp = await client.walletTopUp.create({
    data: {
      walletId: input.walletId,
      provider: input.provider,
      providerReference: input.providerReference,
      idempotencyKey: input.idempotencyKey,
      amountKobo: amount,
      currency: input.currency ?? "NGN",
      status: "PENDING"
    }
  });
  return { topUp, duplicate: false as const };
}

/**
 * Credits a verified top-up exactly once.
 *
 * `verified` must come from a server-side provider check, never from a redirect
 * URL. The claim is taken with a conditional update so two concurrent webhooks
 * for the same top-up cannot both credit.
 */
export async function creditTopUp(
  client: PrismaClient,
  input: {
    providerReference: string;
    verifiedAmountKobo: bigint;
    verifiedCurrency: string;
    actorId?: string | null;
    raw?: unknown;
  }
) {
  const classification = await getDatabaseClassification(client);
  const { topUp } = await (async () => {
    const found = await client.walletTopUp.findUnique({ where: { providerReference: input.providerReference } });
    if (!found) throw new ApiError(404, "topup_not_found", "That top-up reference is not known.");
    return { topUp: found };
  })();

  if (topUp.provider === "test" && (!testProviderAllowed() || classification === "LIVE")) {
    throw new ApiError(403, "test_provider_blocked", "The local test provider is not available in this environment.");
  }
  if (topUp.amountKobo !== input.verifiedAmountKobo) {
    throw new ApiError(409, "amount_mismatch", "The verified amount does not match the top-up request.");
  }
  if (topUp.currency !== input.verifiedCurrency) {
    throw new ApiError(409, "currency_mismatch", "The verified currency does not match the top-up request.");
  }
  if (topUp.status === "COMPLETED") {
    return { status: "already_credited" as const, topUpId: topUp.id };
  }
  if (topUp.status === "FAILED") {
    throw new ApiError(409, "topup_failed", "That top-up was marked failed and cannot be credited.");
  }

  return client.$transaction(async (tx) => {
    // Exactly-once claim: only one caller can move PENDING -> COMPLETED.
    const claimed = await tx.walletTopUp.updateMany({
      where: { id: topUp.id, status: { in: ["PENDING", "AUTHORIZED"] } },
      data: { status: "COMPLETED", creditedAt: new Date(), verifiedAt: new Date(), raw: (input.raw ?? undefined) as Prisma.InputJsonValue | undefined }
    });
    if (claimed.count !== 1) {
      return { status: "already_credited" as const, topUpId: topUp.id };
    }

    const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: topUp.walletId } });

    // The counter-entry comes from the platform's funding source so the whole
    // journal stays balanced. On a TEST database this is platform test funding.
    // Both stored balances must move with the journal: debiting the platform in
    // the ledger without reducing its stored balance would leave the platform
    // overstating funds by every top-up it ever funded.
    const platform = await tx.wallet.findFirst({ where: { ownerType: "SYSTEM" }, select: { id: true } });
    if (!platform) throw new ApiError(500, "platform_wallet_missing", "The platform wallet is missing; the ledger cannot be balanced.");

    await tx.wallet.update({ where: { id: wallet.id }, data: { availableKobo: { increment: topUp.amountKobo } } });
    await tx.wallet.update({ where: { id: platform.id }, data: { availableKobo: { decrement: topUp.amountKobo } } });

    const transaction = await postBalancedTransaction({
      tx,
      actorId: input.actorId ?? null,
      walletId: wallet.id,
      type: "credit",
      amountKobo: topUp.amountKobo,
      reference: `TOPUP-${topUp.providerReference}`,
      description: `Wallet top-up via ${topUp.provider}`,
      entries: [
        { walletId: platform.id, direction: "DEBIT", amountKobo: topUp.amountKobo, memo: `${topUp.provider} funding credited to wallet` },
        { walletId: wallet.id, direction: "CREDIT", amountKobo: topUp.amountKobo, memo: "Wallet top-up" }
      ]
    });

    return { status: "credited" as const, topUpId: topUp.id, transactionId: transaction.id, reference: transaction.reference };
  });
}

export async function failTopUp(client: PrismaClient, input: { providerReference: string; reason: string }) {
  const result = await client.walletTopUp.updateMany({
    where: { providerReference: input.providerReference, status: "PENDING" },
    data: { status: "FAILED", failureReason: input.reason.slice(0, 300) }
  });
  return { updated: result.count };
}

export async function listTopUps(userId: string) {
  const wallet = await prisma.wallet.findFirst({ where: { userId }, select: { id: true } });
  if (!wallet) return [];
  return prisma.walletTopUp.findMany({
    where: { walletId: wallet.id },
    select: { id: true, provider: true, providerReference: true, status: true, amountKobo: true, currency: true, creditedAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 25
  });
}
