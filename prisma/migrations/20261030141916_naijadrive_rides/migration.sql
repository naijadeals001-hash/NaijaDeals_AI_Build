-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('pending', 'approved', 'suspended');

-- CreateEnum
CREATE TYPE "RideStatus" AS ENUM ('requested', 'driver_assigned', 'driver_arriving', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "RidePaymentMethod" AS ENUM ('cash', 'wallet');

-- CreateEnum
CREATE TYPE "RidePaymentStatus" AS ENUM ('pending', 'held', 'paid', 'refunded');

-- AlterEnum
ALTER TYPE "ActorType" ADD VALUE 'DRIVER';

-- CreateTable
CREATE TABLE "DriverProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "licenseNumber" TEXT NOT NULL,
    "status" "DriverStatus" NOT NULL DEFAULT 'pending',
    "vehicleClass" TEXT NOT NULL DEFAULT 'economy',
    "vehicleMake" TEXT NOT NULL,
    "vehicleModel" TEXT NOT NULL,
    "vehiclePlate" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ride" (
    "id" TEXT NOT NULL,
    "rideNumber" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "driverId" TEXT,
    "status" "RideStatus" NOT NULL DEFAULT 'requested',
    "pickupLabel" TEXT NOT NULL,
    "pickupAddress" TEXT NOT NULL,
    "pickupLat" DOUBLE PRECISION NOT NULL,
    "pickupLng" DOUBLE PRECISION NOT NULL,
    "dropoffLabel" TEXT NOT NULL,
    "dropoffAddress" TEXT NOT NULL,
    "dropoffLat" DOUBLE PRECISION NOT NULL,
    "dropoffLng" DOUBLE PRECISION NOT NULL,
    "vehicleClass" TEXT NOT NULL,
    "distanceMeters" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "fareKobo" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "paymentMethod" "RidePaymentMethod" NOT NULL,
    "paymentStatus" "RidePaymentStatus" NOT NULL DEFAULT 'pending',
    "paymentReference" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RideEvent" (
    "id" TEXT NOT NULL,
    "rideId" TEXT NOT NULL,
    "status" "RideStatus" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RideEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DriverProfile_userId_key" ON "DriverProfile"("userId");

-- CreateIndex
CREATE INDEX "DriverProfile_status_active_idx" ON "DriverProfile"("status", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Ride_rideNumber_key" ON "Ride"("rideNumber");

-- CreateIndex
CREATE INDEX "Ride_riderId_status_idx" ON "Ride"("riderId", "status");

-- CreateIndex
CREATE INDEX "Ride_driverId_status_idx" ON "Ride"("driverId", "status");

-- CreateIndex
CREATE INDEX "Ride_status_createdAt_idx" ON "Ride"("status", "createdAt");

-- CreateIndex
CREATE INDEX "RideEvent_rideId_createdAt_idx" ON "RideEvent"("rideId", "createdAt");

-- AddForeignKey
ALTER TABLE "DriverProfile" ADD CONSTRAINT "DriverProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ride" ADD CONSTRAINT "Ride_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ride" ADD CONSTRAINT "Ride_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "DriverProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RideEvent" ADD CONSTRAINT "RideEvent_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "Ride"("id") ON DELETE CASCADE ON UPDATE CASCADE;
