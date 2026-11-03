-- Runtime activation overrides for countries; absent rows fall back to config.
CREATE TABLE IF NOT EXISTS "CountrySetting" (
  "code" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "deliveryEnabled" BOOLEAN NOT NULL DEFAULT false,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CountrySetting_pkey" PRIMARY KEY ("code")
);
