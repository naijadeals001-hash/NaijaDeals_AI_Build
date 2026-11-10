-- CreateEnum
CREATE TYPE "AuraRole" AS ENUM ('user', 'assistant', 'tool');

-- CreateEnum
CREATE TYPE "AuraActionStatus" AS ENUM ('proposed', 'awaiting_confirmation', 'executing', 'completed', 'failed', 'cancelled', 'expired');

-- CreateTable
CREATE TABLE "AuraConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New conversation',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuraConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuraMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "AuraRole" NOT NULL,
    "content" TEXT NOT NULL,
    "attachments" JSONB,
    "toolNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "saved" BOOLEAN NOT NULL DEFAULT false,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuraMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuraAction" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "status" "AuraActionStatus" NOT NULL DEFAULT 'proposed',
    "summary" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "inputHash" TEXT NOT NULL,
    "reviewSnapshot" JSONB NOT NULL,
    "resultReference" TEXT,
    "resultPayload" JSONB,
    "failureReason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuraAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuraPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "title" TEXT NOT NULL,
    "city" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "components" JSONB NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuraPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuraPreference" (
    "userId" TEXT NOT NULL,
    "personalised" BOOLEAN NOT NULL DEFAULT false,
    "useSavedPreferences" BOOLEAN NOT NULL DEFAULT false,
    "savedPreferences" JSONB,
    "preferredCity" TEXT,
    "preferredArea" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuraPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "AuraUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "conversationId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "toolCalls" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuraUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuraConversation_userId_archived_updatedAt_idx" ON "AuraConversation"("userId", "archived", "updatedAt");

-- CreateIndex
CREATE INDEX "AuraMessage_conversationId_createdAt_idx" ON "AuraMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuraMessage_saved_idx" ON "AuraMessage"("saved");

-- CreateIndex
CREATE UNIQUE INDEX "AuraAction_idempotencyKey_key" ON "AuraAction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AuraAction_userId_status_idx" ON "AuraAction"("userId", "status");

-- CreateIndex
CREATE INDEX "AuraAction_conversationId_idx" ON "AuraAction"("conversationId");

-- CreateIndex
CREATE INDEX "AuraPlan_userId_updatedAt_idx" ON "AuraPlan"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "AuraPreference_userId_idx" ON "AuraPreference"("userId");

-- CreateIndex
CREATE INDEX "AuraUsage_createdAt_idx" ON "AuraUsage"("createdAt");

-- CreateIndex
CREATE INDEX "AuraUsage_status_createdAt_idx" ON "AuraUsage"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "AuraConversation" ADD CONSTRAINT "AuraConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuraMessage" ADD CONSTRAINT "AuraMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AuraConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuraAction" ADD CONSTRAINT "AuraAction_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AuraConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuraPreference" ADD CONSTRAINT "AuraPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

