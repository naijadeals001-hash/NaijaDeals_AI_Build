-- AlterTable
ALTER TABLE "LogisticsShipment" ADD COLUMN     "assignedPickupPinHash" TEXT,
ADD COLUMN     "transportState" TEXT NOT NULL DEFAULT 'awaiting_quote';
-- AlterTable
ALTER TABLE "ShipmentEvent" ADD COLUMN     "idempotencyKey" TEXT;
-- CreateIndex
CREATE UNIQUE INDEX "ShipmentEvent_shipmentId_idempotencyKey_key" ON "ShipmentEvent"("shipmentId", "idempotencyKey");
