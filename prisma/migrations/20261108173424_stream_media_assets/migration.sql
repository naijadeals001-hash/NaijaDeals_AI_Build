-- CreateEnum
CREATE TYPE "StreamMediaStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "StreamMediaAsset" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "originalName" TEXT,
    "durationSec" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "bitrate" INTEGER,
    "status" "StreamMediaStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "processedKey" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "purpose" TEXT NOT NULL DEFAULT 'TRACK',
    "publicVisible" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StreamMediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StreamMediaAsset_storageKey_key" ON "StreamMediaAsset"("storageKey");

-- CreateIndex
CREATE INDEX "StreamMediaAsset_ownerId_status_idx" ON "StreamMediaAsset"("ownerId", "status");

-- CreateIndex
CREATE INDEX "StreamMediaAsset_kind_status_idx" ON "StreamMediaAsset"("kind", "status");

-- AddForeignKey
ALTER TABLE "StreamMediaAsset" ADD CONSTRAINT "StreamMediaAsset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
