import type { MilestoneStatus, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { postBalancedTransaction } from "./wallet.service";
import { recordAudit } from "./audit.service";

export const MILESTONE_MIN_KOBO = 10_000n; // ₦100
export const MILESTONE_MAX_KOBO = 200_000_000n; // ₦2,000,000

/**
 * Milestone escrow between two people.
 *
 * The payer funds a stage; the payee delivers and submits; the payer accepts;
 * the milestone is released to the payee. Either side may dispute at any point
 * up to release, and a dispute stops release until an administrator resolves it.
 *
 * Two properties are enforced server-side, never in the UI:
 *
 *  - **Permissions.** Only the payer can fund, accept, refund or cancel their
 *    own milestone. Only the payee can submit work. Only an administrator can
 *    resolve a dispute. Every check reads the session identity, not the payload.
 *  - **Exactly-once settlement.** `version` is bumped by a conditional update,
 *    so two concurrent releases (or a release racing a refund) cannot both
 *    succeed: the second sees version N+1 and is refused.
 *
 * Internal reserved balances are NaijaPay ledger holds. They are not
 * provider-held escrow and no claim of regulated escrow is made here.
 */

const TRANSITIONS: Record<MilestoneStatus, MilestoneStatus[]> = {
  draft: ["awaiting_funding", "cancelled"],
  awaiting_funding: ["funded", "cancelled"],
  funded: ["submitted", "disputed", "refunded"],
  submitted: ["accepted", "disputed", "refunded"],
  accepted: ["released", "disputed", "refunded"],
  released: [],
  refunded: [],
  disputed: ["released", "refunded"],
  cancelled: []
};

/**
 * Who may perform each transition.
 *
 * Administrators resolve a dispute by releasing or refunding it; they cannot
 * fund, submit or accept, because those are the parties' own acts. A disputed
 * milestone is deliberately NOT releasable by the payer: once a dispute is open
 * the decision leaves the parties' hands, which is the point of raising one.
 */
const ACTORS: Record<string, Array<"payer" | "payee" | "admin">> = {
  fund: ["payer"],
  submit: ["payee"],
  accept: ["payer"],
  release: ["payer", "admin"],
  refund: ["payer", "admin"],
  dispute: ["payer", "payee"],
  cancel: ["payer"]
};

/** Actions an administrator may only take on a disputed milestone. */
const ADMIN_ONLY_WHILE_DISPUTED = new Set(["release", "refund"]);

function assertTransition(from: MilestoneStatus, to: MilestoneStatus) {
  if (!(TRANSITIONS[from] ?? []).includes(to)) {
    throw new ApiError(409, "invalid_milestone_transition", `A milestone that is ${from.replace(/_/g, " ")} cannot become ${to.replace(/_/g, " ")}.`);
  }
}

function roleOf(milestone: { payerUserId: string; payeeUserId: string }, actorId: string, isAdmin = false) {
  if (isAdmin) return "admin" as const;
  if (milestone.payerUserId === actorId) return "payer" as const;
  if (milestone.payeeUserId === actorId) return "payee" as const;
  // Neither party: report not-found rather than forbidden, so the endpoint cannot
  // be used to probe which references exist.
  throw new ApiError(404, "milestone_not_found", "That milestone was not found.");
}

function assertActor(action: keyof typeof ACTORS, role: "payer" | "payee" | "admin") {
  if (!ACTORS[action].includes(role)) {
    throw new ApiError(403, "milestone_forbidden", `A ${role} cannot ${action} this milestone.`);
  }
}

export async function createMilestone(
  client: PrismaClient,
  input: { payerUserId: string; payeeEmail: string; title: string; description?: string; amountKobo: bigint }
) {
  if (input.amountKobo < MILESTONE_MIN_KOBO || input.amountKobo > MILESTONE_MAX_KOBO) {
    throw new ApiError(
      400,
      "amount_out_of_range",
      `Milestones must be between ₦${Number(MILESTONE_MIN_KOBO) / 100} and ₦${(Number(MILESTONE_MAX_KOBO) / 100).toLocaleString("en-NG")}.`
    );
  }
  const title = input.title.trim();
  if (title.length < 3 || title.length > 120) throw new ApiError(400, "invalid_title", "Give the milestone a title of 3-120 characters.");

  const payee = await client.user.findUnique({ where: { email: input.payeeEmail.trim().toLowerCase() }, include: { wallets: true } });
  if (!payee || payee.wallets.length === 0) throw new ApiError(404, "recipient_not_found", "That person has no NaijaPay wallet.");
  if (payee.id === input.payerUserId) throw new ApiError(400, "self_milestone", "You cannot create an escrow milestone with yourself.");

  const reference = `MS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const milestone = await client.escrowMilestone.create({
    data: {
      reference,
      payerUserId: input.payerUserId,
      payeeUserId: payee.id,
      title,
      description: input.description?.trim().slice(0, 500) || null,
      amountKobo: input.amountKobo,
      status: "awaiting_funding"
    }
  });
  await recordAudit({
    actorId: input.payerUserId,
    action: "milestone.created",
    entity: "EscrowMilestone",
    entityId: milestone.id,
    metadata: { reference, amountKobo: input.amountKobo.toString(), payeeUserId: payee.id }
  });
  return milestone;
}

/**
 * Moves a milestone one legal step and posts the matching ledger entry.
 *
 * Funding moves the payer's available balance into held. Release moves it to the
 * payee's available balance. Refund returns it to the payer. Each is a single
 * balanced transaction with a reference derived from the milestone, so a retry
 * finds the existing transaction instead of moving money twice.
 */
export async function transitionMilestone(
  client: PrismaClient,
  input: {
    reference: string;
    actorId: string;
    action: "fund" | "submit" | "accept" | "release" | "refund" | "dispute" | "cancel";
    isAdmin?: boolean;
    note?: string;
  }
) {
  return client.$transaction(
    async (tx) => {
      const milestone = await tx.escrowMilestone.findUnique({ where: { reference: input.reference } });
      if (!milestone) throw new ApiError(404, "milestone_not_found", "That milestone was not found.");

      const role = roleOf(milestone, input.actorId, input.isAdmin);
      assertActor(input.action, role);

      // A payer's release/refund cannot override an open dispute; only an
      // administrator may settle one.
      if (role === "payer" && milestone.status === "disputed" && ADMIN_ONLY_WHILE_DISPUTED.has(input.action)) {
        throw new ApiError(409, "dispute_open", "This milestone is in dispute. An administrator must resolve it before funds move.");
      }
      // Conversely, an administrator decides only disputes — not ordinary flow.
      if (role === "admin" && ADMIN_ONLY_WHILE_DISPUTED.has(input.action) && milestone.status !== "disputed") {
        throw new ApiError(403, "admin_not_permitted", "Only a disputed milestone can be settled by an administrator.");
      }

      const next: Record<typeof input.action, MilestoneStatus> = {
        fund: "funded",
        submit: "submitted",
        accept: "accepted",
        release: "released",
        refund: "refunded",
        dispute: "disputed",
        cancel: "cancelled"
      };
      const target = next[input.action];
      assertTransition(milestone.status, target);

      // Claim the transition atomically. A concurrent duplicate loses here.
      const claim = await tx.escrowMilestone.updateMany({
        where: { id: milestone.id, version: milestone.version },
        data: {
          status: target,
          version: { increment: 1 },
          ...(target === "funded" ? { fundedAt: new Date() } : {}),
          ...(target === "submitted" ? { submittedAt: new Date() } : {}),
          ...(target === "accepted" ? { acceptedAt: new Date() } : {}),
          ...(target === "released" ? { releasedAt: new Date() } : {}),
          ...(target === "refunded" ? { refundedAt: new Date() } : {})
        }
      });
      if (claim.count !== 1) throw new ApiError(409, "milestone_conflict", "That milestone changed while this request was in flight. Reload and try again.");

      const payer = await tx.wallet.findFirstOrThrow({ where: { userId: milestone.payerUserId } });
      const payee = await tx.wallet.findFirstOrThrow({ where: { userId: milestone.payeeUserId } });

      if (target === "funded") {
        const reserved = await tx.wallet.updateMany({
          where: { id: payer.id, availableKobo: { gte: milestone.amountKobo } },
          data: { availableKobo: { decrement: milestone.amountKobo }, heldKobo: { increment: milestone.amountKobo } }
        });
        if (reserved.count !== 1) throw new ApiError(409, "insufficient_funds", "Your available balance is too low to fund this milestone.");
        // Funding moves the payer's money into escrow, not to the payee. Crediting
        // the payee here would let the later release move the same amount again,
        // doubling the journal even though the stored balances only moved once.
        // Both legs therefore stay on the payer's wallet: available -> held.
        const txn = await postBalancedTransaction({
          tx,
          actorId: input.actorId,
          walletId: payer.id,
          type: "hold",
          amountKobo: milestone.amountKobo,
          reference: `MS-FUND-${milestone.id}`,
          description: `Milestone funded: ${milestone.title}`,
          entries: [
            { walletId: payer.id, direction: "DEBIT", amountKobo: milestone.amountKobo, memo: "Milestone funded into escrow" },
            { walletId: payer.id, direction: "CREDIT", amountKobo: milestone.amountKobo, memo: "Milestone held in escrow" }
          ]
        });
        await tx.escrowMilestone.update({ where: { id: milestone.id }, data: { fundingTransactionId: txn.id } });
      }

      if (target === "released") {
        const released = await tx.wallet.updateMany({
          where: { id: payer.id, heldKobo: { gte: milestone.amountKobo } },
          data: { heldKobo: { decrement: milestone.amountKobo } }
        });
        if (released.count !== 1) throw new ApiError(409, "escrow_not_funded", "This milestone has no held funds to release.");
        await tx.wallet.update({ where: { id: payee.id }, data: { availableKobo: { increment: milestone.amountKobo } } });
        const txn = await postBalancedTransaction({
          tx,
          actorId: input.actorId,
          walletId: payee.id,
          type: "release",
          amountKobo: milestone.amountKobo,
          reference: `MS-RELEASE-${milestone.id}`,
          description: `Milestone released: ${milestone.title}`,
          entries: [
            { walletId: payer.id, direction: "DEBIT", amountKobo: milestone.amountKobo, memo: "Milestone escrow settled" },
            { walletId: payee.id, direction: "CREDIT", amountKobo: milestone.amountKobo, memo: "Milestone payment received" }
          ]
        });
        await tx.escrowMilestone.update({ where: { id: milestone.id }, data: { settlementTransactionId: txn.id } });
      }

      if (target === "refunded") {
        const returned = await tx.wallet.updateMany({
          where: { id: payer.id, heldKobo: { gte: milestone.amountKobo } },
          data: { heldKobo: { decrement: milestone.amountKobo }, availableKobo: { increment: milestone.amountKobo } }
        });
        if (returned.count !== 1) {
          // Nothing was ever held (e.g. cancelled before funding): only the status moves.
          const txn = await postBalancedTransaction({
            tx,
            actorId: input.actorId,
            walletId: payer.id,
            type: "refund",
            amountKobo: milestone.amountKobo,
            reference: `MS-REFUND-${milestone.id}`,
            description: `Milestone cancelled before funding: ${milestone.title}`,
            entries: [
              { walletId: payer.id, direction: "DEBIT", amountKobo: milestone.amountKobo, memo: "Milestone cancelled, no funds held" },
              { walletId: payer.id, direction: "CREDIT", amountKobo: milestone.amountKobo, memo: "Milestone cancelled, no funds held" }
            ]
          });
          await tx.escrowMilestone.update({ where: { id: milestone.id }, data: { settlementTransactionId: txn.id } });
        } else {
          // Held -> available on the payer: the money never left the payer's wallet.
          const txn = await postBalancedTransaction({
            tx,
            actorId: input.actorId,
            walletId: payer.id,
            type: "refund",
            amountKobo: milestone.amountKobo,
            reference: `MS-REFUND-${milestone.id}`,
            description: `Milestone refunded: ${milestone.title}`,
            entries: [
              { walletId: payer.id, direction: "DEBIT", amountKobo: milestone.amountKobo, memo: "Milestone escrow released from hold" },
              { walletId: payer.id, direction: "CREDIT", amountKobo: milestone.amountKobo, memo: "Milestone funds returned to payer" }
            ]
          });
          await tx.escrowMilestone.update({ where: { id: milestone.id }, data: { settlementTransactionId: txn.id } });
        }
      }

      await recordAudit({
        tx,
        actorId: input.actorId,
        action: `milestone.${input.action}`,
        entity: "EscrowMilestone",
        entityId: milestone.id,
        metadata: {
          reference: milestone.reference,
          before: { status: milestone.status, version: milestone.version },
          after: { status: target, version: milestone.version + 1 },
          role,
          note: input.note ?? null
        }
      });

      return tx.escrowMilestone.findUniqueOrThrow({ where: { id: milestone.id } });
    },
    { isolationLevel: "Serializable" as Prisma.TransactionIsolationLevel }
  );
}

export async function listMilestones(userId: string) {
  return prisma.escrowMilestone.findMany({
    where: { OR: [{ payerUserId: userId }, { payeeUserId: userId }] },
    orderBy: { createdAt: "desc" },
    take: 50
  });
}
