-- AlterEnum
ALTER TYPE "RidePaymentStatus" ADD VALUE 'partially_refunded';

-- AlterEnum
ALTER TYPE "WalletTransactionType" ADD VALUE 'fee';

-- AlterTable
ALTER TABLE "Ride" ADD COLUMN     "assignmentExpiresAt" TIMESTAMP(3),
ADD COLUMN     "cancellationFeeKobo" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SavedPlace" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedPlace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedPlace_userId_idx" ON "SavedPlace"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedPlace_userId_nickname_key" ON "SavedPlace"("userId", "nickname");

-- CreateIndex
CREATE INDEX "Ride_status_assignmentExpiresAt_idx" ON "Ride"("status", "assignmentExpiresAt");

-- AddForeignKey
ALTER TABLE "SavedPlace" ADD CONSTRAINT "SavedPlace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
