-- CreateEnum
CREATE TYPE "ReversalIntentState" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "AffiliateReversalIntent" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amountKobo" BIGINT NOT NULL,
    "state" "ReversalIntentState" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 6,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "lastError" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateReversalIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateReversalIntent_dedupeKey_key" ON "AffiliateReversalIntent"("dedupeKey");

-- CreateIndex
CREATE INDEX "AffiliateReversalIntent_state_createdAt_idx" ON "AffiliateReversalIntent"("state", "createdAt");

-- CreateIndex
CREATE INDEX "AffiliateReversalIntent_orderId_idx" ON "AffiliateReversalIntent"("orderId");

