-- CreateEnum
CREATE TYPE "AffiliateStatus" AS ENUM ('APPLIED', 'APPROVED', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CampaignFunding" AS ENUM ('PLATFORM', 'MERCHANT');

-- CreateEnum
CREATE TYPE "AffiliateCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "ConversionState" AS ENUM ('TRACKED', 'VALIDATING', 'APPROVED', 'PAYABLE', 'PAYING', 'PAID', 'REJECTED', 'REVERSED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "PayoutState" AS ENUM ('REQUESTED', 'APPROVED', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "AffiliateProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "AffiliateStatus" NOT NULL DEFAULT 'APPLIED',
    "displayName" TEXT,
    "channels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "audienceCity" TEXT,
    "termsVersion" TEXT NOT NULL,
    "termsAcceptedAt" TIMESTAMP(3),
    "payoutBank" TEXT,
    "payoutAccountName" TEXT,
    "payoutAccountNumber" TEXT,
    "riskNote" TEXT,
    "approvedAt" TIMESTAMP(3),
    "suspendedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateCampaign" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vertical" TEXT NOT NULL DEFAULT 'shop',
    "status" "AffiliateCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "funding" "CampaignFunding" NOT NULL DEFAULT 'PLATFORM',
    "commissionBps" INTEGER NOT NULL DEFAULT 0,
    "commissionFlatKobo" BIGINT,
    "budgetKobo" BIGINT NOT NULL DEFAULT 0,
    "spentKobo" BIGINT NOT NULL DEFAULT 0,
    "attributionDays" INTEGER NOT NULL DEFAULT 30,
    "commissionBasis" TEXT NOT NULL DEFAULT 'SUBTOTAL',
    "ruleVersion" INTEGER NOT NULL DEFAULT 1,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "termsUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateLink" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttributionTouch" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "visitorKey" TEXT NOT NULL,
    "userId" TEXT,
    "landedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AttributionTouch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateConversion" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "linkId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "ruleVersion" INTEGER NOT NULL,
    "commissionBps" INTEGER NOT NULL,
    "basisKobo" BIGINT NOT NULL,
    "amountKobo" BIGINT NOT NULL,
    "state" "ConversionState" NOT NULL DEFAULT 'TRACKED',
    "ledgerReference" TEXT,
    "reversibleUntil" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateConversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliatePayout" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "amountKobo" BIGINT NOT NULL,
    "state" "PayoutState" NOT NULL DEFAULT 'REQUESTED',
    "ledgerReference" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "failureReason" TEXT,

    CONSTRAINT "AffiliatePayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateProfile_userId_key" ON "AffiliateProfile"("userId");

-- CreateIndex
CREATE INDEX "AffiliateProfile_status_createdAt_idx" ON "AffiliateProfile"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateCampaign_slug_key" ON "AffiliateCampaign"("slug");

-- CreateIndex
CREATE INDEX "AffiliateCampaign_status_vertical_idx" ON "AffiliateCampaign"("status", "vertical");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateLink_code_key" ON "AffiliateLink"("code");

-- CreateIndex
CREATE INDEX "AffiliateLink_affiliateId_createdAt_idx" ON "AffiliateLink"("affiliateId", "createdAt");

-- CreateIndex
CREATE INDEX "AttributionTouch_visitorKey_expiresAt_idx" ON "AttributionTouch"("visitorKey", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateConversion_dedupeKey_key" ON "AffiliateConversion"("dedupeKey");

-- CreateIndex
CREATE INDEX "AffiliateConversion_affiliateId_state_createdAt_idx" ON "AffiliateConversion"("affiliateId", "state", "createdAt");

-- CreateIndex
CREATE INDEX "AffiliateConversion_entityType_entityId_idx" ON "AffiliateConversion"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliatePayout_reference_key" ON "AffiliatePayout"("reference");

-- CreateIndex
CREATE INDEX "AffiliatePayout_affiliateId_state_requestedAt_idx" ON "AffiliatePayout"("affiliateId", "state", "requestedAt");

-- AddForeignKey
ALTER TABLE "AffiliateProfile" ADD CONSTRAINT "AffiliateProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateLink" ADD CONSTRAINT "AffiliateLink_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "AffiliateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateLink" ADD CONSTRAINT "AffiliateLink_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AffiliateCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributionTouch" ADD CONSTRAINT "AttributionTouch_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "AffiliateLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateConversion" ADD CONSTRAINT "AffiliateConversion_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "AffiliateProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateConversion" ADD CONSTRAINT "AffiliateConversion_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AffiliateCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateConversion" ADD CONSTRAINT "AffiliateConversion_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "AffiliateLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliatePayout" ADD CONSTRAINT "AffiliatePayout_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "AffiliateProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

