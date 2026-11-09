-- AlterTable
ALTER TABLE "LogisticsShipment" ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "deliveryVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "originVertical" TEXT NOT NULL DEFAULT 'naijasend',
ADD COLUMN     "pickupVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "trackingNumber" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;
-- CreateTable
CREATE TABLE "ShipmentAssignment" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "deliveryPinHash" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    CONSTRAINT "ShipmentAssignment_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "ShipmentPickup" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "legId" TEXT,
    "actorId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "pickupPinUsed" BOOLEAN NOT NULL DEFAULT true,
    "providerId" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    CONSTRAINT "ShipmentPickup_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "ShipmentAssignment_shipmentId_key" ON "ShipmentAssignment"("shipmentId");
-- CreateIndex
CREATE INDEX "ShipmentAssignment_providerId_idx" ON "ShipmentAssignment"("providerId");
-- CreateIndex
CREATE UNIQUE INDEX "ShipmentPickup_shipmentId_key" ON "ShipmentPickup"("shipmentId");
-- CreateIndex
CREATE INDEX "ShipmentPickup_providerId_idx" ON "ShipmentPickup"("providerId");
-- CreateIndex
CREATE UNIQUE INDEX "LogisticsShipment_trackingNumber_key" ON "LogisticsShipment"("trackingNumber");
-- CreateIndex
CREATE INDEX "LogisticsShipment_originVertical_idx" ON "LogisticsShipment"("originVertical");
-- CreateIndex
CREATE UNIQUE INDEX "LogisticsShipment_originVertical_sourceReference_key" ON "LogisticsShipment"("originVertical", "sourceReference");
-- AddForeignKey
ALTER TABLE "ShipmentAssignment" ADD CONSTRAINT "ShipmentAssignment_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "LogisticsShipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ShipmentPickup" ADD CONSTRAINT "ShipmentPickup_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "LogisticsShipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One shipment per originating order; direct NaijaSend bookings have no source.
CREATE UNIQUE INDEX "LogisticsShipment_origin_order_key" ON "LogisticsShipment"("originVertical", "sourceReference") WHERE "sourceReference" IS NOT NULL;
