-- City-level activation overrides; absent rows fall back to lib/config/regions.ts.
CREATE TABLE IF NOT EXISTS "CitySetting" (
  "id" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CitySetting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CitySetting_countryCode_code_key" ON "CitySetting"("countryCode", "code");
CREATE INDEX IF NOT EXISTS "CitySetting_countryCode_idx" ON "CitySetting"("countryCode");
