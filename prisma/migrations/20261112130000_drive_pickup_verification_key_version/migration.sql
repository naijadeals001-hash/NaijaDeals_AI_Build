-- Server-secret key version for protected pickup codes.
--
-- New records derive the 4-digit code and the stored verifier with a secret held
-- outside the database. The version identifies which configured key was used so
-- rotation can keep old records verifiable until they expire. Existing rows are
-- left NULL: they were derived from the stored salt alone, are treated as legacy
-- by the runtime (never derived or verified), and are replaced with a keyed
-- record on rider read, rider reset or support action.

ALTER TABLE "RideVerification" ADD COLUMN "keyVersion" INTEGER;
