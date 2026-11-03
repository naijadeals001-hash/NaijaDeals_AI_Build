CREATE TYPE "FoodOrderStatus" AS ENUM ('placed', 'kitchen_accepted', 'preparing', 'ready_for_pickup', 'courier_assigned', 'picked_up', 'delivered', 'cancelled');
CREATE TABLE "FoodOrder" (
  "id" TEXT NOT NULL,
  "orderNumber" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "courierId" TEXT,
  "status" "FoodOrderStatus" NOT NULL DEFAULT 'placed',
  "paymentStatus" TEXT NOT NULL DEFAULT 'paid',
  "subtotalKobo" BIGINT NOT NULL,
  "totalKobo" BIGINT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'NGN',
  "deliveryAddress" TEXT NOT NULL,
  "contactName" TEXT NOT NULL,
  "contactPhone" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FoodOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FoodOrder_orderNumber_key" ON "FoodOrder"("orderNumber");
CREATE INDEX "FoodOrder_customerId_createdAt_idx" ON "FoodOrder"("customerId", "createdAt");
CREATE INDEX "FoodOrder_restaurantId_status_idx" ON "FoodOrder"("restaurantId", "status");
CREATE TABLE "FoodOrderItem" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "menuItemId" TEXT,
  "name" TEXT NOT NULL,
  "unitPriceKobo" BIGINT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "notes" TEXT,
  CONSTRAINT "FoodOrderItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FoodOrderEvent" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "status" "FoodOrderStatus" NOT NULL,
  "note" TEXT,
  "actorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FoodOrderEvent_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "FoodOrder" ADD CONSTRAINT "FoodOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FoodOrder" ADD CONSTRAINT "FoodOrder_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FoodOrder" ADD CONSTRAINT "FoodOrder_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "Courier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FoodOrderItem" ADD CONSTRAINT "FoodOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "FoodOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FoodOrderEvent" ADD CONSTRAINT "FoodOrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "FoodOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "FoodOrderEvent_orderId_createdAt_idx" ON "FoodOrderEvent"("orderId", "createdAt");
