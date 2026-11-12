import { Prisma, type PlusEntitlement, type PlusMembership, type PlusMembershipStatus, type PlusRedemption } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/api-error";
import type { SessionUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/services/core/audit.service";
import { requirePlusPermission } from "./access";
import { parseKey, parseMetadata, parseOptionalDate, requiredText } from "./validation";

/**
 * Membership, entitlement and redemption state.
 *
 * Memberships are created by authorised staff only. There is no customer
 * purchase path in this module and no wallet or payment call: the Plus+
 * foundation records entitlement state, not money.
 */

const CREATE_STATUSES: readonly PlusMembershipStatus[] = ["INVITED", "ACTIVE"];

function parseCreateStatus(value: unknown): PlusMembershipStatus {
  const status = value === undefined || value === null || value === "" ? "INVITED" : value;
  if (typeof status !== "string" || !CREATE_STATUSES.includes(status as PlusMembershipStatus)) {
    throw new ApiError(400, "validation_error", `status must be one of: ${CREATE_STATUSES.join(", ")}.`);
  }
  return status as PlusMembershipStatus;
}

export async function createMembership(
  actor: SessionUser,
  input: Record<string, unknown>
): Promise<PlusMembership> {
  requirePlusPermission(actor, "plus:membership:configure");
  const userId = requiredText(input.userId, "userId", 100);
  const planId = requiredText(input.planId, "planId", 100);
  const status = parseCreateStatus(input.status);

  const [user, plan] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true } }),
    prisma.plusPlan.findUnique({ where: { id: planId }, select: { id: true } })
  ]);
  if (!user) throw new ApiError(404, "user_not_found", "The account for this membership does not exist.");
  if (!plan) throw new ApiError(404, "plan_not_found", "The Plus+ plan does not exist.");

  if (status === "ACTIVE") {
    const active = await prisma.plusMembership.findFirst({
      where: { userId, planId, status: "ACTIVE" },
      select: { id: true }
    });
    if (active) throw new ApiError(409, "membership_exists", "This account already has an active membership on that plan.");
  }

  const startedAt = status === "ACTIVE"
    ? parseOptionalDate(input.startedAt, "startedAt") ?? new Date()
    : parseOptionalDate(input.startedAt, "startedAt");
  const currentPeriodEnd = parseOptionalDate(input.currentPeriodEnd, "currentPeriodEnd");
  if (startedAt && currentPeriodEnd && currentPeriodEnd.getTime() <= startedAt.getTime()) {
    throw new ApiError(400, "invalid_window", "currentPeriodEnd must be later than startedAt.");
  }

  let membership: PlusMembership;
  try {
    membership = await prisma.plusMembership.create({
      data: { userId, planId, status, startedAt, currentPeriodEnd }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ApiError(409, "membership_exists", "This account already has an active membership on that plan.");
    }
    throw error;
  }
  await recordAudit({
    actorId: actor.id,
    action: "plus.membership.created",
    entity: "PlusMembership",
    entityId: membership.id,
    metadata: { userId, planId, status }
  });
  return membership;
}

export async function grantEntitlement(
  actor: SessionUser,
  membershipId: string,
  input: Record<string, unknown>
): Promise<PlusEntitlement> {
  requirePlusPermission(actor, "plus:membership:configure");
  const membership = await prisma.plusMembership.findUnique({ where: { id: membershipId } });
  if (!membership) throw new ApiError(404, "not_found", "Plus+ membership not found.");
  if (membership.status !== "ACTIVE") {
    throw new ApiError(409, "membership_not_active", "Entitlements can only be granted to an ACTIVE membership.");
  }

  const code = parseKey(input.code, "code");
  const expiresAt = parseOptionalDate(input.expiresAt, "expiresAt");
  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    throw new ApiError(400, "invalid_expiry", "expiresAt must be in the future.");
  }
  const metadata = parseMetadata(input.metadata);

  const existingEntitlement = await prisma.plusEntitlement.findUnique({
    where: { membershipId_code: { membershipId, code } },
    select: { id: true }
  });
  if (existingEntitlement) {
    throw new ApiError(409, "entitlement_exists", "That entitlement code has already been granted to this membership.");
  }

  let entitlement: PlusEntitlement;
  try {
    entitlement = await prisma.plusEntitlement.create({
      data: {
        membershipId,
        code,
        status: "ACTIVE",
        ...(expiresAt ? { expiresAt } : {}),
        ...(metadata ? { metadata: metadata as Prisma.InputJsonValue } : {})
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ApiError(409, "entitlement_exists", "That entitlement code has already been granted to this membership.");
    }
    throw error;
  }
  await recordAudit({
    actorId: actor.id,
    action: "plus.entitlement.granted",
    entity: "PlusEntitlement",
    entityId: entitlement.id,
    metadata: { membershipId, code }
  });
  return entitlement;
}

export async function expireEntitlement(actor: SessionUser, entitlementId: string): Promise<PlusEntitlement> {
  requirePlusPermission(actor, "plus:membership:configure");
  const entitlement = await prisma.plusEntitlement.findUnique({ where: { id: entitlementId } });
  if (!entitlement) throw new ApiError(404, "not_found", "Plus+ entitlement not found.");
  if (entitlement.status === "EXPIRED") return entitlement;
  if (entitlement.status === "REVOKED") {
    throw new ApiError(409, "entitlement_revoked", "A revoked entitlement cannot be expired.");
  }

  const expired = await prisma.plusEntitlement.update({
    where: { id: entitlement.id },
    data: { status: "EXPIRED" }
  });
  await recordAudit({
    actorId: actor.id,
    action: "plus.entitlement.expired",
    entity: "PlusEntitlement",
    entityId: expired.id,
    metadata: { membershipId: expired.membershipId, code: expired.code }
  });
  return expired;
}

export type RedemptionResult = { redemption: PlusRedemption; replayed: boolean };

/**
 * Redeem an entitlement for its owner.
 *
 * The caller supplies an idempotency key. A replay with the same key returns
 * the original redemption; reusing a key for a different owner or entitlement
 * is a conflict. Ownership, ACTIVE state and expiry are checked on every new
 * redemption, never inferred from the request.
 */
export async function redeemEntitlement(
  userId: string,
  input: Record<string, unknown>
): Promise<RedemptionResult> {
  const ownerId = requiredText(userId, "userId", 100);
  const entitlementId = requiredText(input.entitlementId, "entitlementId", 100);
  const idempotencyKey = requiredText(input.idempotencyKey, "idempotencyKey", 200);
  const reference = requiredText(input.reference, "reference", 200);
  const metadata = parseMetadata(input.metadata);

  const replay = await prisma.plusRedemption.findUnique({ where: { idempotencyKey } });
  if (replay) {
    if (replay.userId !== ownerId || replay.entitlementId !== entitlementId) {
      throw new ApiError(409, "idempotency_conflict", "That idempotency key was already used for a different redemption.");
    }
    return { redemption: replay, replayed: true };
  }

  const entitlement = await prisma.plusEntitlement.findUnique({
    where: { id: entitlementId },
    include: { membership: { select: { userId: true, status: true, currentPeriodEnd: true } } }
  });
  // Do not reveal another account's entitlement.
  if (!entitlement || entitlement.membership.userId !== ownerId) {
    throw new ApiError(404, "entitlement_not_found", "Plus+ entitlement not found.");
  }
  if (entitlement.membership.status !== "ACTIVE") {
    throw new ApiError(409, "membership_not_active", "The membership backing this entitlement is not active.");
  }
  if (entitlement.membership.currentPeriodEnd && entitlement.membership.currentPeriodEnd.getTime() <= Date.now()) {
    throw new ApiError(409, "membership_expired", "The membership period for this entitlement has ended.");
  }
  if (entitlement.status !== "ACTIVE") {
    throw new ApiError(409, "entitlement_not_active", "This entitlement is not active.");
  }
  if (entitlement.expiresAt && entitlement.expiresAt.getTime() <= Date.now()) {
    throw new ApiError(409, "entitlement_expired", "This entitlement has expired.");
  }
  const existingRedemption = await prisma.plusRedemption.findUnique({ where: { entitlementId } });
  if (existingRedemption) {
    throw new ApiError(409, "already_redeemed", "This entitlement has already been redeemed.");
  }

  try {
    const redemption = await prisma.$transaction(async (tx) => {
      const created = await tx.plusRedemption.create({
        data: {
          entitlementId,
          userId: ownerId,
          idempotencyKey,
          reference,
          ...(metadata ? { metadata: metadata as Prisma.InputJsonValue } : {})
        }
      });
      await recordAudit({
        tx,
        actorId: ownerId,
        action: "plus.redemption.redeemed",
        entity: "PlusRedemption",
        entityId: created.id,
        metadata: { entitlementId, reference }
      });
      return created;
    });
    return { redemption, replayed: false };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // A concurrent request inserted the same key first. Return that row when
      // it belongs to this owner/entitlement, otherwise report the conflict.
      const existing = await prisma.plusRedemption.findUnique({ where: { idempotencyKey } });
      if (existing && existing.userId === ownerId && existing.entitlementId === entitlementId) {
        return { redemption: existing, replayed: true };
      }
      const byEntitlement = await prisma.plusRedemption.findUnique({ where: { entitlementId } });
      if (byEntitlement) {
        throw new ApiError(409, "already_redeemed", "This entitlement has already been redeemed.");
      }
      throw new ApiError(409, "idempotency_conflict", "That idempotency key was already used for a different redemption.");
    }
    throw error;
  }
}
