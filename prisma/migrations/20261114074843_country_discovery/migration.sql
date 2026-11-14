-- CreateEnum
CREATE TYPE "CountryEditorialStatus" AS ENUM ('NEEDS_REVIEW', 'REVIEWED');

-- CreateEnum
CREATE TYPE "CountryPublicationStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "originBasis" TEXT,
ADD COLUMN     "originCountryCode" TEXT,
ADD COLUMN     "originNote" TEXT,
ADD COLUMN     "originVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "originVerifiedBy" TEXT;

-- CreateTable
CREATE TABLE "CountryProfile" (
    "code" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "localizedNames" JSONB,
    "introduction" TEXT NOT NULL,
    "editorialStatus" "CountryEditorialStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "publicationStatus" "CountryPublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "homeFeatured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "publishedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CountryProfile_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "CountryTheme" (
    "id" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "association" TEXT NOT NULL,
    "imageUrl" TEXT,
    "imageAlt" TEXT,
    "imageKind" TEXT,
    "imageProvenance" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "editorialStatus" "CountryEditorialStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CountryTheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountryThemeSource" (
    "id" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publisher" TEXT,
    "url" TEXT NOT NULL,
    "accessedAt" TIMESTAMP(3) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CountryThemeSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CountryProfile_slug_key" ON "CountryProfile"("slug");

-- CreateIndex
CREATE INDEX "CountryProfile_publicationStatus_sortOrder_idx" ON "CountryProfile"("publicationStatus", "sortOrder");

-- CreateIndex
CREATE INDEX "CountryProfile_homeFeatured_sortOrder_idx" ON "CountryProfile"("homeFeatured", "sortOrder");

-- CreateIndex
CREATE INDEX "CountryTheme_countryCode_sortOrder_idx" ON "CountryTheme"("countryCode", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CountryTheme_countryCode_key_key" ON "CountryTheme"("countryCode", "key");

-- CreateIndex
CREATE INDEX "CountryThemeSource_themeId_sortOrder_idx" ON "CountryThemeSource"("themeId", "sortOrder");

-- CreateIndex
CREATE INDEX "Product_originCountryCode_status_idx" ON "Product"("originCountryCode", "status");

-- AddForeignKey
ALTER TABLE "CountryTheme" ADD CONSTRAINT "CountryTheme_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "CountryProfile"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountryThemeSource" ADD CONSTRAINT "CountryThemeSource_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "CountryTheme"("id") ON DELETE CASCADE ON UPDATE CASCADE;
