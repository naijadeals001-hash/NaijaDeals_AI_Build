-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "category" TEXT,
ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "imageUrl" TEXT;

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "countryCode" TEXT NOT NULL DEFAULT 'NG',
ADD COLUMN     "coverUrl" TEXT,
ADD COLUMN     "deliveryFeeKobo" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "dishes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "highlighted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "prepMaxMinutes" INTEGER,
ADD COLUMN     "prepMinMinutes" INTEGER,
ADD COLUMN     "region" TEXT NOT NULL DEFAULT 'West';

-- CreateTable
CREATE TABLE "RestaurantRating" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RestaurantRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantRating_orderId_key" ON "RestaurantRating"("orderId");

-- CreateIndex
CREATE INDEX "RestaurantRating_restaurantId_idx" ON "RestaurantRating"("restaurantId");

-- CreateIndex
CREATE INDEX "Restaurant_region_countryCode_idx" ON "Restaurant"("region", "countryCode");

-- AddForeignKey
ALTER TABLE "RestaurantRating" ADD CONSTRAINT "RestaurantRating_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
