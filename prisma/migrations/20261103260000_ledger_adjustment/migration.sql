CREATE TABLE "LedgerAdjustment" (
  "id" TEXT NOT NULL,
  "adjustmentKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PREPARED',
  "journal" JSONB NOT NULL,
  "references" JSONB NOT NULL,
  "preparedBy" TEXT NOT NULL,
  "preparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "appliedAt" TIMESTAMP(3),
  CONSTRAINT "LedgerAdjustment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LedgerAdjustment_adjustmentKey_key" ON "LedgerAdjustment"("adjustmentKey");
