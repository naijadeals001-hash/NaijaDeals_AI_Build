-- CreateTable
CREATE TABLE "StreamLiveEvent" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "artworkUrl" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'UPCOMING',
    "streamUrl" TEXT,
    "isFree" BOOLEAN NOT NULL DEFAULT true,
    "priceKobo" BIGINT,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreamLiveEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StreamLiveEvent_slug_key" ON "StreamLiveEvent"("slug");

-- CreateIndex
CREATE INDEX "StreamLiveEvent_status_startsAt_idx" ON "StreamLiveEvent"("status", "startsAt");
