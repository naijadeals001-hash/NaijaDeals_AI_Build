-- CreateEnum
CREATE TYPE "PlusPublishStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PlusPlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "PlusBillingPeriod" AS ENUM ('MONTHLY', 'ANNUAL', 'NONE');

-- CreateEnum
CREATE TYPE "PlusMembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PlusEntitlementStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "PlusPromotionKind" AS ENUM ('HOUSE', 'SPONSORED');

-- CreateEnum
CREATE TYPE "PlusPromotionStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "PlusContentCard" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imageAlt" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "serviceKey" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "PlusPublishStatus" NOT NULL DEFAULT 'DRAFT',
    "language" TEXT NOT NULL DEFAULT 'en',
    "countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlusContentCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlusPlan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "PlusPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL,
    "priceMinor" BIGINT,
    "billingPeriod" "PlusBillingPeriod",
    "paidActivationApproved" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlusPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlusPlanCountry" (
    "planId" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PlusPlanCountry_pkey" PRIMARY KEY ("planId","countryCode")
);

-- CreateTable
CREATE TABLE "PlusPlanTerm" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "priceMinor" BIGINT,
    "currency" TEXT NOT NULL,
    "billingPeriod" "PlusBillingPeriod" NOT NULL,
    "cancellationSummary" TEXT,
    "termsUrl" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlusPlanTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlusMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "PlusMembershipStatus" NOT NULL DEFAULT 'INVITED',
    "startedAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlusMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlusEntitlement" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "PlusEntitlementStatus" NOT NULL DEFAULT 'ACTIVE',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "PlusEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlusRedemption" (
    "id" TEXT NOT NULL,
    "entitlementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "PlusRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlusBenefit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "planId" TEXT,
    "status" "PlusPublishStatus" NOT NULL DEFAULT 'DRAFT',
    "countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "imageUrl" TEXT,
    "imageAlt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlusBenefit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlusPromotion" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "PlusPromotionKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "imageUrl" TEXT,
    "imageAlt" TEXT,
    "href" TEXT,
    "status" "PlusPromotionStatus" NOT NULL DEFAULT 'DRAFT',
    "countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "sponsorName" TEXT,
    "disclosureLabel" TEXT NOT NULL DEFAULT 'Sponsored',
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "campaignRef" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlusPromotion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlusContentCard_key_key" ON "PlusContentCard"("key");

-- CreateIndex
CREATE INDEX "PlusContentCard_status_sortOrder_idx" ON "PlusContentCard"("status", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PlusPlan_code_key" ON "PlusPlan"("code");

-- CreateIndex
CREATE INDEX "PlusPlan_status_sortOrder_idx" ON "PlusPlan"("status", "sortOrder");

-- CreateIndex
CREATE INDEX "PlusPlanCountry_countryCode_enabled_idx" ON "PlusPlanCountry"("countryCode", "enabled");

-- CreateIndex
CREATE INDEX "PlusPlanTerm_planId_effectiveFrom_idx" ON "PlusPlanTerm"("planId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "PlusPlanTerm_planId_version_key" ON "PlusPlanTerm"("planId", "version");

-- CreateIndex
CREATE INDEX "PlusMembership_userId_status_idx" ON "PlusMembership"("userId", "status");

-- CreateIndex
CREATE INDEX "PlusMembership_planId_status_idx" ON "PlusMembership"("planId", "status");

-- CreateIndex
CREATE INDEX "PlusEntitlement_membershipId_code_idx" ON "PlusEntitlement"("membershipId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "PlusRedemption_idempotencyKey_key" ON "PlusRedemption"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PlusRedemption_userId_redeemedAt_idx" ON "PlusRedemption"("userId", "redeemedAt");

-- CreateIndex
CREATE INDEX "PlusRedemption_entitlementId_idx" ON "PlusRedemption"("entitlementId");

-- CreateIndex
CREATE UNIQUE INDEX "PlusBenefit_key_key" ON "PlusBenefit"("key");

-- CreateIndex
CREATE INDEX "PlusBenefit_status_sortOrder_idx" ON "PlusBenefit"("status", "sortOrder");

-- CreateIndex
CREATE INDEX "PlusBenefit_planId_status_idx" ON "PlusBenefit"("planId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PlusPromotion_key_key" ON "PlusPromotion"("key");

-- CreateIndex
CREATE INDEX "PlusPromotion_status_sortOrder_idx" ON "PlusPromotion"("status", "sortOrder");

-- CreateIndex
CREATE INDEX "PlusPromotion_kind_status_idx" ON "PlusPromotion"("kind", "status");

-- AddForeignKey
ALTER TABLE "PlusPlanCountry" ADD CONSTRAINT "PlusPlanCountry_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlusPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlusPlanTerm" ADD CONSTRAINT "PlusPlanTerm_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlusPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlusMembership" ADD CONSTRAINT "PlusMembership_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlusPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlusEntitlement" ADD CONSTRAINT "PlusEntitlement_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "PlusMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlusRedemption" ADD CONSTRAINT "PlusRedemption_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "PlusEntitlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlusBenefit" ADD CONSTRAINT "PlusBenefit_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlusPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

