-- CreateTable
CREATE TABLE "StreamShow" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "coverUrl" TEXT,
    "category" TEXT NOT NULL DEFAULT 'Culture',
    "language" TEXT NOT NULL DEFAULT 'English',
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreamShow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreamEpisode" (
    "id" TEXT NOT NULL,
    "showId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "audioUrl" TEXT,
    "durationSec" INTEGER NOT NULL,
    "season" INTEGER NOT NULL DEFAULT 1,
    "episodeNo" INTEGER NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "status" "StreamTrackStatus" NOT NULL DEFAULT 'DRAFT',
    "isSample" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "StreamEpisode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreamVideo" (
    "id" TEXT NOT NULL,
    "artistId" TEXT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "videoUrl" TEXT NOT NULL,
    "posterUrl" TEXT,
    "durationSec" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'MUSIC_VIDEO',
    "status" "StreamTrackStatus" NOT NULL DEFAULT 'DRAFT',
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "views" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreamVideo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StreamShow_slug_key" ON "StreamShow"("slug");

-- CreateIndex
CREATE INDEX "StreamShow_published_category_idx" ON "StreamShow"("published", "category");

-- CreateIndex
CREATE UNIQUE INDEX "StreamEpisode_slug_key" ON "StreamEpisode"("slug");

-- CreateIndex
CREATE INDEX "StreamEpisode_status_publishedAt_idx" ON "StreamEpisode"("status", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StreamEpisode_showId_season_episodeNo_key" ON "StreamEpisode"("showId", "season", "episodeNo");

-- CreateIndex
CREATE UNIQUE INDEX "StreamVideo_slug_key" ON "StreamVideo"("slug");

-- CreateIndex
CREATE INDEX "StreamVideo_status_publishedAt_idx" ON "StreamVideo"("status", "publishedAt");

-- AddForeignKey
ALTER TABLE "StreamShow" ADD CONSTRAINT "StreamShow_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "StreamArtist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamEpisode" ADD CONSTRAINT "StreamEpisode_showId_fkey" FOREIGN KEY ("showId") REFERENCES "StreamShow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamVideo" ADD CONSTRAINT "StreamVideo_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "StreamArtist"("id") ON DELETE SET NULL ON UPDATE CASCADE;
