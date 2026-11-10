-- CreateTable
CREATE TABLE "AffiliateReversalOperation" (
    "id" TEXT NOT NULL,
    "opKey" TEXT NOT NULL,
    "conversionId" TEXT NOT NULL,
    "intentId" TEXT,
    "requestedKobo" BIGINT NOT NULL,
    "recoveredKobo" BIGINT NOT NULL DEFAULT 0,
    "debtKobo" BIGINT NOT NULL DEFAULT 0,
    "ledgerReference" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateReversalOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateReversalOperation_opKey_key" ON "AffiliateReversalOperation"("opKey");

-- CreateIndex
CREATE INDEX "AffiliateReversalOperation_conversionId_idx" ON "AffiliateReversalOperation"("conversionId");

