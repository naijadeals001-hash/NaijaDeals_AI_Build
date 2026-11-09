-- CreateTable
CREATE TABLE "StayHost" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "bio" TEXT,
    "phone" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Nigeria',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "verifiedAt" TIMESTAMP(3),
    "documentRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StayHost_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "StayProperty" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "listingType" TEXT NOT NULL DEFAULT 'stay',
    "description" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Nigeria',
    "addressLine" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "bedrooms" INTEGER NOT NULL DEFAULT 1,
    "beds" INTEGER NOT NULL DEFAULT 1,
    "bathrooms" INTEGER NOT NULL DEFAULT 1,
    "maxGuests" INTEGER NOT NULL DEFAULT 2,
    "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "houseRules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "powerBackup" BOOLEAN NOT NULL DEFAULT false,
    "waterSupply" BOOLEAN NOT NULL DEFAULT false,
    "internet" BOOLEAN NOT NULL DEFAULT false,
    "parking" BOOLEAN NOT NULL DEFAULT false,
    "accessible" BOOLEAN NOT NULL DEFAULT false,
    "security24h" BOOLEAN NOT NULL DEFAULT false,
    "nightlyKobo" BIGINT NOT NULL DEFAULT 0,
    "salePriceKobo" BIGINT,
    "cleaningFeeKobo" BIGINT NOT NULL DEFAULT 0,
    "serviceFeeBps" INTEGER NOT NULL DEFAULT 500,
    "minimumNights" INTEGER NOT NULL DEFAULT 1,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "timeZone" TEXT NOT NULL DEFAULT 'Africa/Lagos',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StayProperty_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "StayImage" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "kind" TEXT NOT NULL DEFAULT 'photo',
    CONSTRAINT "StayImage_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "StayUnit" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maxGuests" INTEGER NOT NULL DEFAULT 2,
    "nightlyKobo" BIGINT NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "StayUnit_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "StayBlock" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StayBlock_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "StayReservation" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'hold',
    "paymentStatus" TEXT NOT NULL DEFAULT 'unpaid',
    "checkIn" TIMESTAMP(3) NOT NULL,
    "checkOut" TIMESTAMP(3) NOT NULL,
    "nights" INTEGER NOT NULL,
    "guests" INTEGER NOT NULL,
    "rooms" INTEGER NOT NULL DEFAULT 1,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "nightlyKobo" BIGINT NOT NULL,
    "subtotalKobo" BIGINT NOT NULL,
    "cleaningKobo" BIGINT NOT NULL DEFAULT 0,
    "serviceKobo" BIGINT NOT NULL DEFAULT 0,
    "totalKobo" BIGINT NOT NULL,
    "policySnapshot" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestPhone" TEXT NOT NULL,
    "holdExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "StayReservation_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "StayReservationEvent" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StayReservationEvent_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "StayReview" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "status" TEXT NOT NULL DEFAULT 'published',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StayReview_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "StayMessage" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT,
    "reservationId" TEXT,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StayMessage_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "StayHost_ownerId_key" ON "StayHost"("ownerId");
-- CreateIndex
CREATE INDEX "StayHost_status_idx" ON "StayHost"("status");
-- CreateIndex
CREATE UNIQUE INDEX "StayProperty_slug_key" ON "StayProperty"("slug");
-- CreateIndex
CREATE INDEX "StayProperty_category_status_idx" ON "StayProperty"("category", "status");
-- CreateIndex
CREATE INDEX "StayProperty_city_status_idx" ON "StayProperty"("city", "status");
-- CreateIndex
CREATE INDEX "StayProperty_listingType_status_idx" ON "StayProperty"("listingType", "status");
-- CreateIndex
CREATE INDEX "StayImage_propertyId_sortOrder_idx" ON "StayImage"("propertyId", "sortOrder");
-- CreateIndex
CREATE INDEX "StayUnit_propertyId_idx" ON "StayUnit"("propertyId");
-- CreateIndex
CREATE INDEX "StayBlock_unitId_startDate_idx" ON "StayBlock"("unitId", "startDate");
-- CreateIndex
CREATE UNIQUE INDEX "StayReservation_reference_key" ON "StayReservation"("reference");
-- CreateIndex
CREATE INDEX "StayReservation_propertyId_status_idx" ON "StayReservation"("propertyId", "status");
-- CreateIndex
CREATE INDEX "StayReservation_guestId_status_idx" ON "StayReservation"("guestId", "status");
-- CreateIndex
CREATE INDEX "StayReservation_unitId_checkIn_checkOut_idx" ON "StayReservation"("unitId", "checkIn", "checkOut");
-- CreateIndex
CREATE INDEX "StayReservationEvent_reservationId_createdAt_idx" ON "StayReservationEvent"("reservationId", "createdAt");
-- CreateIndex
CREATE UNIQUE INDEX "StayReview_reservationId_key" ON "StayReview"("reservationId");
-- CreateIndex
CREATE INDEX "StayReview_propertyId_status_idx" ON "StayReview"("propertyId", "status");
-- CreateIndex
CREATE INDEX "StayMessage_propertyId_createdAt_idx" ON "StayMessage"("propertyId", "createdAt");
-- CreateIndex
CREATE INDEX "StayMessage_reservationId_createdAt_idx" ON "StayMessage"("reservationId", "createdAt");
-- AddForeignKey
ALTER TABLE "StayHost" ADD CONSTRAINT "StayHost_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "StayProperty" ADD CONSTRAINT "StayProperty_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "StayHost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "StayImage" ADD CONSTRAINT "StayImage_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "StayProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "StayUnit" ADD CONSTRAINT "StayUnit_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "StayProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "StayReservation" ADD CONSTRAINT "StayReservation_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "StayProperty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "StayReservation" ADD CONSTRAINT "StayReservation_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "StayUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "StayReservation" ADD CONSTRAINT "StayReservation_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "StayReservationEvent" ADD CONSTRAINT "StayReservationEvent_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "StayReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "StayReview" ADD CONSTRAINT "StayReview_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "StayProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Prevent double-booking at the database level.
--
-- A unit may not hold two live reservations (hold, awaiting_payment, confirmed)
-- whose [checkIn, checkOut) ranges overlap. Application checks alone can be
-- raced, so this exclusion constraint is the authority; the service layer treats
-- a 23P01 violation as "dates no longer available".
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "StayReservation"
  ADD CONSTRAINT "StayReservation_no_overlap"
  EXCLUDE USING gist (
    "unitId" WITH =,
    daterange("checkIn"::date, "checkOut"::date, '[)') WITH &&
  )
  WHERE (status IN ('hold', 'awaiting_payment', 'confirmed'));
