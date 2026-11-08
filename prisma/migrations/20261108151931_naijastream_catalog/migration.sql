-- CreateEnum
CREATE TYPE "StreamTrackStatus" AS ENUM ('DRAFT', 'PROCESSING', 'PUBLISHED', 'UNPUBLISHED', 'TAKEDOWN');

-- CreateEnum
CREATE TYPE "StreamReleaseType" AS ENUM ('SINGLE', 'EP', 'ALBUM', 'PODCAST', 'MIX', 'LIVE');

-- CreateEnum
CREATE TYPE "StreamRoyaltyStatus" AS ENUM ('ACCRUED', 'STATEMENTED', 'PAID', 'VOID');

-- CreateTable
CREATE TABLE "StreamArtist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "bio" TEXT,
    "avatarUrl" TEXT,
    "coverUrl" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "countryCode" TEXT NOT NULL DEFAULT 'NG',
    "genres" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "commissionBps" INTEGER NOT NULL DEFAULT 1200,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StreamArtist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreamRelease" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "StreamReleaseType" NOT NULL DEFAULT 'SINGLE',
    "artworkUrl" TEXT,
    "description" TEXT,
    "releasedAt" TIMESTAMP(3),
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreamRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreamTrack" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "releaseId" TEXT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "durationSec" INTEGER NOT NULL,
    "audioUrl" TEXT,
    "artworkUrl" TEXT,
    "genre" TEXT,
    "language" TEXT,
    "explicit" BOOLEAN NOT NULL DEFAULT false,
    "status" "StreamTrackStatus" NOT NULL DEFAULT 'DRAFT',
    "rightsDeclared" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "playCount" BIGINT NOT NULL DEFAULT 0,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StreamTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreamPlaylist" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "artistId" TEXT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "coverUrl" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "isEditorial" BOOLEAN NOT NULL DEFAULT false,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreamPlaylist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreamPlaylistItem" (
    "id" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreamPlaylistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreamPlaylistFollow" (
    "id" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreamPlaylistFollow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreamFollow" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreamFollow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreamLike" (
    "id" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreamLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreamPlay" (
    "id" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "userId" TEXT,
    "bucket" TEXT NOT NULL,
    "secondsPlayed" INTEGER NOT NULL DEFAULT 0,
    "eligible" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreamPlay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreamRoyaltyAccrual" (
    "id" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "eligiblePlays" BIGINT NOT NULL DEFAULT 0,
    "rateKoboPerPlay" BIGINT NOT NULL DEFAULT 0,
    "grossKobo" BIGINT NOT NULL DEFAULT 0,
    "platformKobo" BIGINT NOT NULL DEFAULT 0,
    "artistKobo" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "status" "StreamRoyaltyStatus" NOT NULL DEFAULT 'ACCRUED',
    "ledgerReference" TEXT,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreamRoyaltyAccrual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreamRevenuePool" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "poolKobo" BIGINT NOT NULL,
    "eligiblePlays" BIGINT NOT NULL,
    "rateKoboPerPlay" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreamRevenuePool_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StreamArtist_userId_key" ON "StreamArtist"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StreamArtist_slug_key" ON "StreamArtist"("slug");

-- CreateIndex
CREATE INDEX "StreamArtist_verified_isSample_idx" ON "StreamArtist"("verified", "isSample");

-- CreateIndex
CREATE UNIQUE INDEX "StreamRelease_slug_key" ON "StreamRelease"("slug");

-- CreateIndex
CREATE INDEX "StreamRelease_artistId_isPublished_idx" ON "StreamRelease"("artistId", "isPublished");

-- CreateIndex
CREATE UNIQUE INDEX "StreamTrack_slug_key" ON "StreamTrack"("slug");

-- CreateIndex
CREATE INDEX "StreamTrack_status_publishedAt_idx" ON "StreamTrack"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "StreamTrack_artistId_status_idx" ON "StreamTrack"("artistId", "status");

-- CreateIndex
CREATE INDEX "StreamTrack_genre_idx" ON "StreamTrack"("genre");

-- CreateIndex
CREATE UNIQUE INDEX "StreamPlaylist_slug_key" ON "StreamPlaylist"("slug");

-- CreateIndex
CREATE INDEX "StreamPlaylist_isEditorial_isPublic_idx" ON "StreamPlaylist"("isEditorial", "isPublic");

-- CreateIndex
CREATE INDEX "StreamPlaylistItem_playlistId_position_idx" ON "StreamPlaylistItem"("playlistId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "StreamPlaylistItem_playlistId_trackId_key" ON "StreamPlaylistItem"("playlistId", "trackId");

-- CreateIndex
CREATE UNIQUE INDEX "StreamPlaylistFollow_playlistId_userId_key" ON "StreamPlaylistFollow"("playlistId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "StreamFollow_artistId_userId_key" ON "StreamFollow"("artistId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "StreamLike_trackId_userId_key" ON "StreamLike"("trackId", "userId");

-- CreateIndex
CREATE INDEX "StreamPlay_trackId_createdAt_idx" ON "StreamPlay"("trackId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StreamPlay_trackId_userId_bucket_key" ON "StreamPlay"("trackId", "userId", "bucket");

-- CreateIndex
CREATE INDEX "StreamRoyaltyAccrual_artistId_period_idx" ON "StreamRoyaltyAccrual"("artistId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "StreamRoyaltyAccrual_trackId_period_key" ON "StreamRoyaltyAccrual"("trackId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "StreamRevenuePool_period_key" ON "StreamRevenuePool"("period");

-- AddForeignKey
ALTER TABLE "StreamArtist" ADD CONSTRAINT "StreamArtist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamRelease" ADD CONSTRAINT "StreamRelease_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "StreamArtist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamTrack" ADD CONSTRAINT "StreamTrack_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "StreamArtist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamTrack" ADD CONSTRAINT "StreamTrack_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "StreamRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamPlaylist" ADD CONSTRAINT "StreamPlaylist_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamPlaylist" ADD CONSTRAINT "StreamPlaylist_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "StreamArtist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamPlaylistItem" ADD CONSTRAINT "StreamPlaylistItem_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "StreamPlaylist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamPlaylistItem" ADD CONSTRAINT "StreamPlaylistItem_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "StreamTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamPlaylistFollow" ADD CONSTRAINT "StreamPlaylistFollow_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "StreamPlaylist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamPlaylistFollow" ADD CONSTRAINT "StreamPlaylistFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamFollow" ADD CONSTRAINT "StreamFollow_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "StreamArtist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamFollow" ADD CONSTRAINT "StreamFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamLike" ADD CONSTRAINT "StreamLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamLike" ADD CONSTRAINT "StreamLike_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "StreamTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamPlay" ADD CONSTRAINT "StreamPlay_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "StreamTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamRoyaltyAccrual" ADD CONSTRAINT "StreamRoyaltyAccrual_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "StreamTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
