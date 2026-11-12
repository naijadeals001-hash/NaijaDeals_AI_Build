-- Drive-only protected pickup verification, participant ratings and safety reports.
-- No existing table is altered; the three new tables carry no payment, ledger or
-- affiliate data.

CREATE TYPE "RideParticipantRole" AS ENUM ('customer', 'driver');

CREATE TYPE "RideSafetyReportStatus" AS ENUM ('submitted', 'under_review', 'closed');

CREATE TABLE "RideVerification" (
    "id" TEXT NOT NULL,
    "rideId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'scrypt-hmac-sha256-v1',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastAttemptAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "verifiedByUserId" TEXT,
    "invalidatedAt" TIMESTAMP(3),
    "invalidatedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RideVerification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RideVerification_rideId_key" ON "RideVerification"("rideId");
CREATE INDEX "RideVerification_expiresAt_idx" ON "RideVerification"("expiresAt");
CREATE INDEX "RideVerification_verifiedAt_idx" ON "RideVerification"("verifiedAt");

CREATE TABLE "RideRating" (
    "id" TEXT NOT NULL,
    "rideId" TEXT NOT NULL,
    "raterUserId" TEXT NOT NULL,
    "raterRole" "RideParticipantRole" NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RideRating_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RideRating_score_check" CHECK ("score" BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX "RideRating_rideId_raterUserId_key" ON "RideRating"("rideId", "raterUserId");
CREATE INDEX "RideRating_subjectUserId_raterRole_idx" ON "RideRating"("subjectUserId", "raterRole");
CREATE INDEX "RideRating_rideId_idx" ON "RideRating"("rideId");

CREATE TABLE "RideSafetyReport" (
    "id" TEXT NOT NULL,
    "rideId" TEXT NOT NULL,
    "reporterUserId" TEXT NOT NULL,
    "reporterRole" "RideParticipantRole" NOT NULL,
    "category" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "status" "RideSafetyReportStatus" NOT NULL DEFAULT 'submitted',
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RideSafetyReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RideSafetyReport_rideId_createdAt_idx" ON "RideSafetyReport"("rideId", "createdAt");
CREATE INDEX "RideSafetyReport_status_createdAt_idx" ON "RideSafetyReport"("status", "createdAt");

ALTER TABLE "RideVerification" ADD CONSTRAINT "RideVerification_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "Ride"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RideRating" ADD CONSTRAINT "RideRating_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "Ride"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RideRating" ADD CONSTRAINT "RideRating_raterUserId_fkey" FOREIGN KEY ("raterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RideRating" ADD CONSTRAINT "RideRating_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RideSafetyReport" ADD CONSTRAINT "RideSafetyReport_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "Ride"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RideSafetyReport" ADD CONSTRAINT "RideSafetyReport_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
