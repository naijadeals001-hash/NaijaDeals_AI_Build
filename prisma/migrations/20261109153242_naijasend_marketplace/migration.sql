-- CreateTable
CREATE TABLE "LogisticsShipment" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerKind" TEXT NOT NULL DEFAULT 'individual',
    "cargoClass" TEXT NOT NULL DEFAULT 'parcel',
    "cargoCategory" TEXT,
    "description" TEXT NOT NULL,
    "weightKg" INTEGER NOT NULL DEFAULT 1,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "dimensions" TEXT,
    "declaredValueKobo" BIGINT NOT NULL DEFAULT 0,
    "handling" TEXT,
    "originLabel" TEXT NOT NULL,
    "originCountry" TEXT NOT NULL DEFAULT 'Nigeria',
    "destinationLabel" TEXT NOT NULL,
    "destinationCountry" TEXT NOT NULL DEFAULT 'Nigeria',
    "senderName" TEXT NOT NULL,
    "senderPhone" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "pickupDate" TIMESTAMP(3),
    "bookingModel" TEXT NOT NULL DEFAULT 'request_quote',
    "preferredMode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "sourceVertical" TEXT,
    "sourceReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogisticsShipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentPackage" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "weightKg" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "dimensions" TEXT,

    CONSTRAINT "ShipmentPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogisticsProvider" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "providerType" TEXT NOT NULL,
    "sourcePlatform" TEXT NOT NULL DEFAULT 'naijasend',
    "country" TEXT NOT NULL DEFAULT 'Nigeria',
    "operatingCities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contactPhone" TEXT NOT NULL,
    "licenceRef" TEXT,
    "insuranceRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "verifiedAt" TIMESTAMP(3),
    "capacityKg" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogisticsProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderVehicle" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "vehicleType" TEXT NOT NULL,
    "make" TEXT,
    "model" TEXT,
    "plate" TEXT,
    "capacityKg" INTEGER NOT NULL DEFAULT 0,
    "driverProfileId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentQuote" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "amountKobo" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "transitDays" INTEGER NOT NULL DEFAULT 1,
    "modes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'offered',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipmentQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentLeg" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "providerId" TEXT,
    "fromLabel" TEXT NOT NULL,
    "toLabel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "carrierRef" TEXT,
    "pickupPin" TEXT,
    "deliveryPin" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ShipmentLeg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentEvent" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "note" TEXT,
    "actorId" TEXT,
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentProof" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "legId" TEXT,
    "kind" TEXT NOT NULL,
    "note" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentProof_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LogisticsShipment_reference_key" ON "LogisticsShipment"("reference");

-- CreateIndex
CREATE INDEX "LogisticsShipment_customerId_status_idx" ON "LogisticsShipment"("customerId", "status");

-- CreateIndex
CREATE INDEX "LogisticsShipment_status_createdAt_idx" ON "LogisticsShipment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "LogisticsShipment_sourceVertical_sourceReference_idx" ON "LogisticsShipment"("sourceVertical", "sourceReference");

-- CreateIndex
CREATE INDEX "ShipmentPackage_shipmentId_idx" ON "ShipmentPackage"("shipmentId");

-- CreateIndex
CREATE INDEX "LogisticsProvider_providerType_status_idx" ON "LogisticsProvider"("providerType", "status");

-- CreateIndex
CREATE INDEX "LogisticsProvider_country_status_idx" ON "LogisticsProvider"("country", "status");

-- CreateIndex
CREATE INDEX "LogisticsProvider_sourcePlatform_idx" ON "LogisticsProvider"("sourcePlatform");

-- CreateIndex
CREATE INDEX "ProviderVehicle_providerId_active_idx" ON "ProviderVehicle"("providerId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderVehicle_providerId_plate_key" ON "ProviderVehicle"("providerId", "plate");

-- CreateIndex
CREATE INDEX "ShipmentQuote_shipmentId_status_idx" ON "ShipmentQuote"("shipmentId", "status");

-- CreateIndex
CREATE INDEX "ShipmentQuote_providerId_status_idx" ON "ShipmentQuote"("providerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentQuote_shipmentId_providerId_key" ON "ShipmentQuote"("shipmentId", "providerId");

-- CreateIndex
CREATE INDEX "ShipmentLeg_shipmentId_status_idx" ON "ShipmentLeg"("shipmentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentLeg_shipmentId_sequence_key" ON "ShipmentLeg"("shipmentId", "sequence");

-- CreateIndex
CREATE INDEX "ShipmentEvent_shipmentId_createdAt_idx" ON "ShipmentEvent"("shipmentId", "createdAt");

-- CreateIndex
CREATE INDEX "ShipmentProof_shipmentId_idx" ON "ShipmentProof"("shipmentId");

-- AddForeignKey
ALTER TABLE "LogisticsShipment" ADD CONSTRAINT "LogisticsShipment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentPackage" ADD CONSTRAINT "ShipmentPackage_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "LogisticsShipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogisticsProvider" ADD CONSTRAINT "LogisticsProvider_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderVehicle" ADD CONSTRAINT "ProviderVehicle_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "LogisticsProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentQuote" ADD CONSTRAINT "ShipmentQuote_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "LogisticsShipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentQuote" ADD CONSTRAINT "ShipmentQuote_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "LogisticsProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentLeg" ADD CONSTRAINT "ShipmentLeg_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "LogisticsShipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "LogisticsShipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
