ALTER TABLE "FreightRequest" ADD COLUMN IF NOT EXISTS "carrierName" TEXT;
ALTER TABLE "FreightRequest" ADD COLUMN IF NOT EXISTS "quoteKobo" BIGINT;
CREATE TABLE IF NOT EXISTS "FreightEvent" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "status" "FreightStatus" NOT NULL,
  "note" TEXT,
  "actorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FreightEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FreightEvent_requestId_createdAt_idx" ON "FreightEvent"("requestId", "createdAt");
ALTER TABLE "FreightEvent" ADD CONSTRAINT "FreightEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "FreightRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
