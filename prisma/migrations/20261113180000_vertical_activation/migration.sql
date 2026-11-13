CREATE TYPE "VerticalActivationStatus" AS ENUM ('DISABLED','PREVIEW','LIVE');
CREATE TABLE "VerticalActivation" (
  "id" TEXT NOT NULL,
  "verticalKey" TEXT NOT NULL,
  "scopeType" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL DEFAULT '',
  "cityCode" TEXT NOT NULL DEFAULT '',
  "status" "VerticalActivationStatus" NOT NULL DEFAULT 'DISABLED',
  "reason" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VerticalActivation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VerticalActivation_verticalKey_scopeType_countryCode_cityCode_key" ON "VerticalActivation"("verticalKey","scopeType","countryCode","cityCode");
CREATE INDEX "VerticalActivation_verticalKey_idx" ON "VerticalActivation"("verticalKey");
