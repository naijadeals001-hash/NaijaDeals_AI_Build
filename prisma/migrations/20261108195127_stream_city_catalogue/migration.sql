-- CreateTable
CREATE TABLE "StreamCity" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "countryName" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "genres" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "imageUrl" TEXT,
    "imageCredit" TEXT,
    "imageApprovedAt" TIMESTAMP(3),
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StreamCity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreamPodcastCategory" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StreamPodcastCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StreamCity_slug_key" ON "StreamCity"("slug");

-- CreateIndex
CREATE INDEX "StreamCity_region_sortOrder_idx" ON "StreamCity"("region", "sortOrder");

-- CreateIndex
CREATE INDEX "StreamCity_featured_idx" ON "StreamCity"("featured");

-- CreateIndex
CREATE UNIQUE INDEX "StreamPodcastCategory_slug_key" ON "StreamPodcastCategory"("slug");
