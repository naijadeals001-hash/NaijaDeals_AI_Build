import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/api-error";
import { postBalancedTransaction } from "@/lib/services/core/wallet.service";
import { ensureWallet } from "@/lib/payments/service";
import { recordAudit } from "@/lib/services/core/audit.service";

/**
 * NaijaStream Premium subscriptions.
 *
 * Billing runs through the SHARED NaijaPay ledger: a subscription payment is a
 * balanced wallet transaction (listener wallet → platform wallet) with a unique
 * reference, so it is idempotent and reconciled alongside every other payment.
 *
 * Live card/bank billing is NOT enabled here: no Paystack/Flutterwave
 * credentials are configured and the database is TEST-classified. Plans,
 * entitlement checks, cancellation and expiry all work today; charging a
 * provider is gated behind lib/payments/boundary.ts by design.
 */
export const PREMIUM_PAID_CODES = ["BASIC", "STANDARD", "PREMIUM"] as const;

export async function listPlans() {
  return prisma.streamPlan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
}

export function periodEnd(from: Date, interval: string) {
  const end = new Date(from);
  if (interval === "YEAR") end.setFullYear(end.getFullYear() + 1);
  else end.setMonth(end.getMonth() + 1);
  return end;
}

export async function currentSubscription(userId: string) {
  const sub = await prisma.streamSubscription.findFirst({
    where: { userId, status: "ACTIVE" },
    include: { plan: true },
    orderBy: { createdAt: "desc" }
  });
  if (!sub) return null;
  if (sub.currentPeriodEnd.getTime() <= Date.now()) {
    await prisma.streamSubscription.update({ where: { id: sub.id }, data: { status: "EXPIRED" } });
    return null;
  }
  return sub;
}

/** Entitlement check used by premium-gated features. */
export async function isPremium(userId: string) {
  const sub = await currentSubscription(userId);
  return Boolean(sub && sub.status === "ACTIVE");
}

/**
 * Subscribe to a plan, paying from the listener's NaijaPay wallet.
 * Idempotent per (user, plan, open period): a repeat call inside the same
 * period returns the existing subscription without charging again.
 */
export async function subscribeWithWallet(userId: string, planCode: string) {
  const plan = await prisma.streamPlan.findUnique({ where: { code: planCode } });
  if (!plan || !plan.isActive) throw new ApiError(404, "plan_not_found", "That plan is not available.");
  const existing = await currentSubscription(userId);
  if (existing && existing.planId === plan.id) {
    return { subscription: existing, charged: false, alreadyActive: true };
  }
  if (plan.priceKobo <= BigInt(0)) throw new ApiError(400, "free_plan", "The free plan needs no payment.");

  const now = new Date();
  const endsAt = periodEnd(now, plan.interval);
  const reference = `stream:sub:${userId.slice(-8)}:${plan.code}:${now.toISOString().slice(0, 13)}:${randomBytes(3).toString("hex")}`;

  const result = await prisma.$transaction(async (tx) => {
    const listenerWallet = await ensureWallet(tx, { userId, ownerType: "CUSTOMER" });
    const platform = await ensureWallet(tx, { ownerType: "SYSTEM" });
    const fresh = await tx.wallet.findUniqueOrThrow({ where: { id: listenerWallet.id }, select: { availableKobo: true } });
    if (fresh.availableKobo < plan.priceKobo) {
      throw new ApiError(402, "insufficient_wallet", "Top up your NaijaPay wallet to activate Premium.");
    }
    await tx.wallet.update({ where: { id: listenerWallet.id }, data: { availableKobo: { decrement: plan.priceKobo } } });
    await tx.wallet.update({ where: { id: platform.id }, data: { availableKobo: { increment: plan.priceKobo } } });

    await postBalancedTransaction({
      tx,
      actorId: userId,
      walletId: listenerWallet.id,
      type: "debit",
      amountKobo: plan.priceKobo,
      reference,
      description: `NaijaStream ${plan.name} subscription (${plan.interval.toLowerCase()}ly)`,
      entries: [
        { walletId: listenerWallet.id, direction: "DEBIT", amountKobo: plan.priceKobo, memo: `Premium ${plan.code}` },
        { walletId: platform.id, direction: "CREDIT", amountKobo: plan.priceKobo, memo: `Premium ${plan.code}` }
      ]
    });

    // One active subscription per user: close any other active plan.
    await tx.streamSubscription.updateMany({ where: { userId, status: "ACTIVE" }, data: { status: "CANCELLED", cancelledAt: now } });
    const subscription = await tx.streamSubscription.create({
      data: { userId, planId: plan.id, status: "ACTIVE", startsAt: now, currentPeriodEnd: endsAt, provider: "wallet", ledgerReference: reference },
      include: { plan: true }
    });
    await tx.streamBillingRecord.create({
      data: { subscriptionId: subscription.id, userId, amountKobo: plan.priceKobo, currency: plan.currency, ledgerReference: reference, periodStart: now, periodEnd: endsAt, status: "PAID" }
    });
    return subscription;
  });

  await recordAudit({ actorId: userId, action: "stream.subscription_started", entity: "StreamSubscription", entityId: result.id, metadata: { plan: plan.code, reference } });
  return { subscription: result, charged: true, alreadyActive: false };
}

export async function cancelSubscription(userId: string) {
  const sub =
    (await currentSubscription(userId)) ??
    (await prisma.streamSubscription.findFirst({
      where: { userId, status: { in: ["ACTIVE", "CANCELLED"] } },
      include: { plan: true },
      orderBy: { createdAt: "desc" }
    }));
  if (!sub) throw new ApiError(404, "no_subscription", "You have no subscription to cancel.");
  if (sub.status === "CANCELLED") return sub;
  const updated = await prisma.streamSubscription.update({
    where: { id: sub.id },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelAtPeriodEnd: true },
    include: { plan: true }
  });
  await recordAudit({ actorId: userId, action: "stream.subscription_cancelled", entity: "StreamSubscription", entityId: sub.id });
  return updated;
}

export async function billingHistory(userId: string) {
  return prisma.streamBillingRecord.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 24 });
}
