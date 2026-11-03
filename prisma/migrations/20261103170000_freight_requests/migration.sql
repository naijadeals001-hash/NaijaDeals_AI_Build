CREATE TYPE "FreightServiceType" AS ENUM ('bus', 'air', 'truck', 'last_mile');
CREATE TYPE "FreightStatus" AS ENUM ('quote_requested', 'quoted', 'carrier_assigned', 'in_transit', 'delivered', 'cancelled');
CREATE TABLE "FreightRequest" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "serviceType" "FreightServiceType" NOT NULL,
  "originCity" TEXT NOT NULL,
  "destinationCity" TEXT NOT NULL,
  "commodity" TEXT NOT NULL,
  "weightKg" INTEGER NOT NULL,
  "dimensions" TEXT,
  "pickupRequired" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "status" "FreightStatus" NOT NULL DEFAULT 'quote_requested',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FreightRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FreightRequest_reference_key" ON "FreightRequest"("reference");
CREATE INDEX "FreightRequest_customerId_status_idx" ON "FreightRequest"("customerId", "status");
CREATE INDEX "FreightRequest_status_createdAt_idx" ON "FreightRequest"("status", "createdAt");
ALTER TABLE "FreightRequest" ADD CONSTRAINT "FreightRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
