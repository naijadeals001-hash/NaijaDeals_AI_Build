-- CreateTable
CREATE TABLE "HomeVariant" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "allocation" INTEGER NOT NULL DEFAULT 25,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HomeVariant_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "HomeHeroSlide" (
    "id" TEXT NOT NULL,
    "variantKey" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "ctaLabel" TEXT NOT NULL,
    "ctaHref" TEXT NOT NULL,
    "secondaryLabel" TEXT,
    "secondaryHref" TEXT,
    "imageId" TEXT,
    "alt" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    CONSTRAINT "HomeHeroSlide_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "HomeAssignment" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "variantKey" TEXT NOT NULL,
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HomeAssignment_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "HomeMetric" (
    "id" TEXT NOT NULL,
    "variantKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "slideSlug" TEXT NOT NULL DEFAULT '',
    "day" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "HomeMetric_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "HomeVariant_key_key" ON "HomeVariant"("key");
-- CreateIndex
CREATE INDEX "HomeHeroSlide_variantKey_enabled_sortOrder_idx" ON "HomeHeroSlide"("variantKey", "enabled", "sortOrder");
-- CreateIndex
CREATE UNIQUE INDEX "HomeHeroSlide_variantKey_slug_key" ON "HomeHeroSlide"("variantKey", "slug");
-- CreateIndex
CREATE UNIQUE INDEX "HomeAssignment_visitorId_key" ON "HomeAssignment"("visitorId");
-- CreateIndex
CREATE INDEX "HomeAssignment_variantKey_idx" ON "HomeAssignment"("variantKey");
-- CreateIndex
CREATE INDEX "HomeMetric_variantKey_day_idx" ON "HomeMetric"("variantKey", "day");
-- CreateIndex
CREATE UNIQUE INDEX "HomeMetric_variantKey_kind_slideSlug_day_key" ON "HomeMetric"("variantKey", "kind", "slideSlug", "day");
-- AddForeignKey
ALTER TABLE "HomeHeroSlide" ADD CONSTRAINT "HomeHeroSlide_variantKey_fkey" FOREIGN KEY ("variantKey") REFERENCES "HomeVariant"("key") ON DELETE CASCADE ON UPDATE CASCADE;
