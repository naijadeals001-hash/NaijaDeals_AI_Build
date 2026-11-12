-- Plus+ integrity constraints.
--
-- One entitlement code per membership, one redemption per entitlement, and at
-- most one ACTIVE membership per account/plan. The partial index is expressed
-- in raw SQL because Prisma does not model partial unique indexes.

-- Entitlement: (membershipId, code) becomes unique instead of a plain index.
DROP INDEX IF EXISTS "PlusEntitlement_membershipId_code_idx";
CREATE UNIQUE INDEX "PlusEntitlement_membershipId_code_key" ON "PlusEntitlement"("membershipId", "code");

-- Redemption: an entitlement can be redeemed once; retries use the same
-- idempotency key and return the existing row.
DROP INDEX IF EXISTS "PlusRedemption_entitlementId_idx";
CREATE UNIQUE INDEX "PlusRedemption_entitlementId_key" ON "PlusRedemption"("entitlementId");

-- Membership: at most one ACTIVE row per account and plan. Cancelled, expired
-- and invited rows remain unrestricted for history.
CREATE UNIQUE INDEX "PlusMembership_active_user_plan_key"
  ON "PlusMembership"("userId", "planId")
  WHERE "status" = 'ACTIVE';
