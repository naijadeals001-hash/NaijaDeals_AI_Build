-- CreateTable
CREATE TABLE "FoodCartItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodCartItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EatsFavourite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EatsFavourite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FoodCartItem_userId_restaurantId_idx" ON "FoodCartItem"("userId", "restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "FoodCartItem_userId_menuItemId_key" ON "FoodCartItem"("userId", "menuItemId");

-- CreateIndex
CREATE INDEX "EatsFavourite_userId_kind_idx" ON "EatsFavourite"("userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "EatsFavourite_userId_kind_targetId_key" ON "EatsFavourite"("userId", "kind", "targetId");

-- AddForeignKey
ALTER TABLE "FoodCartItem" ADD CONSTRAINT "FoodCartItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodCartItem" ADD CONSTRAINT "FoodCartItem_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodCartItem" ADD CONSTRAINT "FoodCartItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EatsFavourite" ADD CONSTRAINT "EatsFavourite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
