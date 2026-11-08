-- CreateTable
CREATE TABLE "StreamHeroSlide" (
    "id" TEXT NOT NULL,
    "eyebrow" TEXT NOT NULL DEFAULT 'Featured',
    "headline" TEXT NOT NULL,
    "accent" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT NOT NULL,
    "mobileImageUrl" TEXT,
    "primaryLabel" TEXT NOT NULL,
    "primaryHref" TEXT NOT NULL,
    "secondaryLabel" TEXT NOT NULL,
    "secondaryHref" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreamHeroSlide_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StreamHeroSlide_isActive_sortOrder_idx" ON "StreamHeroSlide"("isActive", "sortOrder");
