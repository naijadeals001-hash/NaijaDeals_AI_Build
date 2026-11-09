-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('draft', 'awaiting_funding', 'funded', 'submitted', 'accepted', 'released', 'refunded', 'disputed', 'cancelled');

-- CreateTable
CREATE TABLE "EscrowMilestone" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "payerUserId" TEXT NOT NULL,
    "payeeUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "amountKobo" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "status" "MilestoneStatus" NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 0,
    "fundedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "fundingTransactionId" TEXT,
    "settlementTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EscrowMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EscrowMilestone_reference_key" ON "EscrowMilestone"("reference");

-- CreateIndex
CREATE INDEX "EscrowMilestone_payerUserId_status_idx" ON "EscrowMilestone"("payerUserId", "status");

-- CreateIndex
CREATE INDEX "EscrowMilestone_payeeUserId_status_idx" ON "EscrowMilestone"("payeeUserId", "status");

