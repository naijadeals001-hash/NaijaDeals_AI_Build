CREATE TABLE "DatabaseClassification" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "classification" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DatabaseClassification_pkey" PRIMARY KEY ("id")
);
INSERT INTO "DatabaseClassification" ("id", "classification", "updatedAt") VALUES ('default', 'TEST', CURRENT_TIMESTAMP);
