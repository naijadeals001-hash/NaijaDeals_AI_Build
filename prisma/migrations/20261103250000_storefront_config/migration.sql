CREATE TABLE "StorefrontConfig" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "config" JSONB NOT NULL,
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StorefrontConfig_pkey" PRIMARY KEY ("id")
);
