-- Cut over outstanding pre-key pickup codes at deployment.
--
-- The server-keyed runtime never derives or verifies a row with a NULL
-- `keyVersion`. A legacy row that is still active and unverified would keep a
-- usable salt-only code until it expires (up to two hours), so the database-only
-- disclosure path would survive the deploy for that window. Invalidate exactly
-- those rows here. The rider's trip screen (or the rider/support reset) issues a
-- keyed replacement; the attempt budget is carried by the runtime.
--
-- Verified rows are left alone: they can authorise the start they already
-- verified and cannot disclose a code that the verify endpoint would accept.
-- Expired/locked rows are left alone for the same reason; the reset endpoint
-- handles them normally.

UPDATE "RideVerification"
SET "invalidatedAt" = CURRENT_TIMESTAMP,
    "invalidatedReason" = 'Server-keyed pickup verification cutover',
    "verifiedAt" = NULL,
    "verifiedByUserId" = NULL
WHERE "keyVersion" IS NULL
  AND "invalidatedAt" IS NULL
  AND "verifiedAt" IS NULL
  AND "expiresAt" > CURRENT_TIMESTAMP;
