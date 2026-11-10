-- CreateEnum
CREATE TYPE "RecoveryState" AS ENUM ('OUTSTANDING', 'COLLECTED', 'WRITTEN_OFF');

-- CreateTable
CREATE TABLE "AffiliateRecovery" (
    "id" TEXT NOT NULL,
    "conversionId" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "amountKobo" BIGINT NOT NULL,
    "collectedKobo" BIGINT NOT NULL DEFAULT 0,
    "state" "RecoveryState" NOT NULL DEFAULT 'OUTSTANDING',
    "ledgerReference" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateRecovery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AffiliateRecovery_affiliateId_state_idx" ON "AffiliateRecovery"("affiliateId", "state");

-- CreateIndex
CREATE INDEX "AffiliateRecovery_state_createdAt_idx" ON "AffiliateRecovery"("state", "createdAt");

-- CreateIndex
CREATE INDEX "AffiliateRecovery_conversionId_idx" ON "AffiliateRecovery"("conversionId");

