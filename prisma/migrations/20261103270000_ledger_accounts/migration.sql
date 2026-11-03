ALTER TABLE "LedgerAdjustment" ADD COLUMN "appliedBy" TEXT;

CREATE TABLE "LedgerAccount" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "balanceKobo" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LedgerAccount_code_key" ON "LedgerAccount"("code");

CREATE TABLE "AccountPosting" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "adjustmentId" TEXT,
  "transactionId" TEXT NOT NULL,
  "direction" "LedgerDirection" NOT NULL,
  "amountKobo" BIGINT NOT NULL,
  "memo" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountPosting_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AccountPosting_accountId_idx" ON "AccountPosting"("accountId");
CREATE UNIQUE INDEX "AccountPosting_adjustmentId_accountId_key" ON "AccountPosting"("adjustmentId", "accountId");
ALTER TABLE "AccountPosting" ADD CONSTRAINT "AccountPosting_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountPosting" ADD CONSTRAINT "AccountPosting_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "LedgerAdjustment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
