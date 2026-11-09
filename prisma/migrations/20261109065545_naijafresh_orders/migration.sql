-- CreateTable
CREATE TABLE "FreshCartItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FreshCartItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreshOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "orderKind" TEXT NOT NULL DEFAULT 'customer',
    "status" TEXT NOT NULL DEFAULT 'payment_pending',
    "paymentStatus" TEXT NOT NULL DEFAULT 'pending',
    "subtotalKobo" BIGINT NOT NULL,
    "deliveryFeeKobo" BIGINT NOT NULL DEFAULT 0,
    "totalKobo" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "deliveryAddress" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FreshOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreshOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "listingId" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPriceKobo" BIGINT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "FreshOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreshOrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FreshOrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreshDispatch" (
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

    CONSTRAINT "FreshDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreshDispatchOffer" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "providerType" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'offered',
    "earningsKobo" BIGINT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FreshDispatchOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FreshCartItem_userId_idx" ON "FreshCartItem"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FreshCartItem_userId_listingId_key" ON "FreshCartItem"("userId", "listingId");

-- CreateIndex
CREATE UNIQUE INDEX "FreshOrder_orderNumber_key" ON "FreshOrder"("orderNumber");

-- CreateIndex
CREATE INDEX "FreshOrder_customerId_createdAt_idx" ON "FreshOrder"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "FreshOrder_farmId_status_idx" ON "FreshOrder"("farmId", "status");

-- CreateIndex
CREATE INDEX "FreshOrderItem_orderId_idx" ON "FreshOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "FreshOrderEvent_orderId_createdAt_idx" ON "FreshOrderEvent"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FreshDispatch_orderId_key" ON "FreshDispatch"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "FreshDispatch_settlementReference_key" ON "FreshDispatch"("settlementReference");

-- CreateIndex
CREATE INDEX "FreshDispatch_status_idx" ON "FreshDispatch"("status");

-- CreateIndex
CREATE INDEX "FreshDispatchOffer_dispatchId_status_idx" ON "FreshDispatchOffer"("dispatchId", "status");

-- CreateIndex
CREATE INDEX "FreshDispatchOffer_providerType_providerId_status_idx" ON "FreshDispatchOffer"("providerType", "providerId", "status");

-- AddForeignKey
ALTER TABLE "FreshCartItem" ADD CONSTRAINT "FreshCartItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreshCartItem" ADD CONSTRAINT "FreshCartItem_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "ProduceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreshOrder" ADD CONSTRAINT "FreshOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreshOrder" ADD CONSTRAINT "FreshOrder_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreshOrderItem" ADD CONSTRAINT "FreshOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "FreshOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreshOrderEvent" ADD CONSTRAINT "FreshOrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "FreshOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreshDispatch" ADD CONSTRAINT "FreshDispatch_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "FreshOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreshDispatchOffer" ADD CONSTRAINT "FreshDispatchOffer_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "FreshDispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
