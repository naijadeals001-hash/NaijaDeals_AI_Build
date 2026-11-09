-- CreateEnum
CREATE TYPE "DispatchOfferStatus" AS ENUM ('offered', 'accepted', 'declined', 'expired', 'withdrawn');

-- AlterTable
ALTER TABLE "Courier" ADD COLUMN     "foodDeliveryEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "online" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "serviceZone" TEXT,
ADD COLUMN     "vehiclePlate" TEXT,
ADD COLUMN     "vehicleType" TEXT NOT NULL DEFAULT 'motorcycle';

-- AlterTable
ALTER TABLE "DriverProfile" ADD COLUMN     "foodDeliveryEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "foodVehicleType" TEXT NOT NULL DEFAULT 'car',
ADD COLUMN     "insulatedBag" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "online" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "serviceZone" TEXT;

-- CreateTable
CREATE TABLE "FoodDispatch" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "vehicleNeed" TEXT NOT NULL DEFAULT 'motorcycle',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "assignedType" TEXT,
    "assignedId" TEXT,
    "pickupPin" TEXT NOT NULL,
    "deliveryPin" TEXT NOT NULL,
    "pickedUpAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "settlementReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchOffer" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "providerType" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "status" "DispatchOfferStatus" NOT NULL DEFAULT 'offered',
    "earningsKobo" BIGINT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DispatchOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FoodDispatch_orderId_key" ON "FoodDispatch"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "FoodDispatch_settlementReference_key" ON "FoodDispatch"("settlementReference");

-- CreateIndex
CREATE INDEX "FoodDispatch_status_idx" ON "FoodDispatch"("status");

-- CreateIndex
CREATE INDEX "DispatchOffer_providerType_providerId_status_idx" ON "DispatchOffer"("providerType", "providerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DispatchOffer_dispatchId_providerType_providerId_key" ON "DispatchOffer"("dispatchId", "providerType", "providerId");

-- AddForeignKey
ALTER TABLE "DispatchOffer" ADD CONSTRAINT "DispatchOffer_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "FoodDispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
