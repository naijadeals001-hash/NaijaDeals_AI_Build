CREATE TABLE IF NOT EXISTS "PartnerNotification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT,
  "href" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerNotification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PartnerNotification_userId_createdAt_idx" ON "PartnerNotification"("userId", "createdAt");
ALTER TABLE "PartnerNotification" ADD CONSTRAINT "PartnerNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
