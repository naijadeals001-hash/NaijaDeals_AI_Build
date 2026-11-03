CREATE TYPE "RestaurantApplicationStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED');
CREATE TABLE "RestaurantApplication" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kitchenName" TEXT NOT NULL,
  "cuisine" TEXT NOT NULL,
  "market" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "status" "RestaurantApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
  "note" TEXT,
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RestaurantApplication_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RestaurantApplication_status_createdAt_idx" ON "RestaurantApplication"("status", "createdAt");
ALTER TABLE "RestaurantApplication" ADD CONSTRAINT "RestaurantApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Restaurant" ADD COLUMN "applicationId" TEXT;
CREATE UNIQUE INDEX "Restaurant_applicationId_key" ON "Restaurant"("applicationId");
ALTER TABLE "MenuItem" ADD COLUMN "published" BOOLEAN NOT NULL DEFAULT false;
UPDATE "MenuItem" SET "published" = true WHERE "isSample" = true;
