-- CreateEnum
CREATE TYPE "NotificationIntentStatus" AS ENUM ('PENDING', 'CLAIMED', 'PROCESSED', 'DEAD');

-- CreateTable
CREATE TABLE "NotificationIntent" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "payloadVersion" INTEGER NOT NULL DEFAULT 1,
    "status" "NotificationIntentStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseOwner" TEXT,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationIntent_dedupeKey_key" ON "NotificationIntent"("dedupeKey");

-- CreateIndex
CREATE INDEX "NotificationIntent_status_nextAttemptAt_idx" ON "NotificationIntent"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "NotificationIntent_leaseExpiresAt_idx" ON "NotificationIntent"("leaseExpiresAt");

-- CreateIndex
CREATE INDEX "NotificationIntent_entityType_entityId_idx" ON "NotificationIntent"("entityType", "entityId");

