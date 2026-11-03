CREATE TYPE "RestaurantStatus" AS ENUM ('PENDING', 'VERIFIED', 'SUSPENDED');
CREATE TABLE "Restaurant" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "cuisine" TEXT NOT NULL,
  "market" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "status" "RestaurantStatus" NOT NULL DEFAULT 'PENDING',
  "isSample" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Restaurant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Restaurant_slug_key" ON "Restaurant"("slug");
CREATE INDEX "Restaurant_status_market_idx" ON "Restaurant"("status", "market");
CREATE TABLE "MenuItem" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "priceKobo" BIGINT NOT NULL,
  "available" BOOLEAN NOT NULL DEFAULT true,
  "isSample" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MenuItem_restaurantId_available_idx" ON "MenuItem"("restaurantId", "available");
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
