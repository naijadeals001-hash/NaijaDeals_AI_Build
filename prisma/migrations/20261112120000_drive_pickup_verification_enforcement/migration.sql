-- Bounded compatibility for protected pickup verification.
--
-- Before this migration a missing RideVerification row was treated as "legacy" on
-- every read. That inference could not be bounded: deleting a row from a ride
-- assigned after enforcement was indistinguishable from a pre-enforcement ride.
--
-- This migration records the one-time boundary in the ride row itself. Only rides
-- that were already assigned and had no protected record at enforcement receive
-- the marker. Runtime code never sets a timestamp; it only clears the marker when
-- the assignment ends or support explicitly opts the ride into verification. New
-- assignments therefore fail closed when their protected record is missing.

ALTER TABLE "Ride" ADD COLUMN "pickupVerificationLegacyAt" TIMESTAMP(3);

UPDATE "Ride"
SET "pickupVerificationLegacyAt" = CURRENT_TIMESTAMP
WHERE "status" IN ('driver_assigned', 'driver_arriving')
  AND NOT EXISTS (
    SELECT 1
    FROM "RideVerification" AS "verification"
    WHERE "verification"."rideId" = "Ride"."id"
  );
