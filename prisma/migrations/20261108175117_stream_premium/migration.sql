-- CreateEnum
CREATE TYPE "StreamSubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'EXPIRED', 'PAST_DUE');

-- CreateTable
CREATE TABLE "StreamPlan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceKobo" BIGINT NOT NULL DEFAULT 0,
    "interval" TEXT NOT NULL DEFAULT 'MONTH',
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreamPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreamSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "StreamSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMP(3),
    "provider" TEXT NOT NULL DEFAULT 'wallet',
    "ledgerReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StreamSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreamBillingRecord" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountKobo" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "ledgerReference" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PAID',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreamBillingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StreamPlan_code_key" ON "StreamPlan"("code");

-- CreateIndex
CREATE UNIQUE INDEX "StreamSubscription_ledgerReference_key" ON "StreamSubscription"("ledgerReference");

-- CreateIndex
CREATE INDEX "StreamSubscription_userId_status_idx" ON "StreamSubscription"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StreamSubscription_userId_planId_status_key" ON "StreamSubscription"("userId", "planId", "status");

-- CreateIndex
CREATE INDEX "StreamBillingRecord_userId_createdAt_idx" ON "StreamBillingRecord"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "StreamSubscription" ADD CONSTRAINT "StreamSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamSubscription" ADD CONSTRAINT "StreamSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "StreamPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
