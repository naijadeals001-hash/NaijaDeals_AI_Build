ALTER TABLE "Category" ADD COLUMN "key" TEXT;
ALTER TABLE "Category" ADD COLUMN "parentId" TEXT;
ALTER TABLE "Category" ADD COLUMN "level" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Category" ADD COLUMN "isSelectable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Category" ADD COLUMN "showOnHomepage" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Category" ADD COLUMN "deprecatedAt" TIMESTAMP(3);
ALTER TABLE "Product" ADD COLUMN "attributes" JSONB;
CREATE UNIQUE INDEX "Category_key_key" ON "Category"("key");
CREATE INDEX "Category_parentId_idx" ON "Category"("parentId");
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "CategoryAlias" (
  "id" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "alias" TEXT NOT NULL,
  "locale" TEXT NOT NULL DEFAULT 'en',
  CONSTRAINT "CategoryAlias_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CategoryAlias_alias_locale_key" ON "CategoryAlias"("alias", "locale");
CREATE INDEX "CategoryAlias_categoryId_idx" ON "CategoryAlias"("categoryId");
ALTER TABLE "CategoryAlias" ADD CONSTRAINT "CategoryAlias_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TYPE "CategoryAttributeType" AS ENUM ('TEXT','NUMBER','SELECT','BOOLEAN');
CREATE TABLE "CategoryAttribute" (
  "id" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "type" "CategoryAttributeType" NOT NULL DEFAULT 'TEXT',
  "required" BOOLEAN NOT NULL DEFAULT false,
  "options" JSONB,
  CONSTRAINT "CategoryAttribute_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CategoryAttribute_categoryId_key_key" ON "CategoryAttribute"("categoryId", "key");
ALTER TABLE "CategoryAttribute" ADD CONSTRAINT "CategoryAttribute_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "CategoryCountryRule" (
  "categoryId" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL,
  "canPublish" BOOLEAN NOT NULL DEFAULT true,
  "note" TEXT,
  CONSTRAINT "CategoryCountryRule_pkey" PRIMARY KEY ("categoryId","countryCode")
);
ALTER TABLE "CategoryCountryRule" ADD CONSTRAINT "CategoryCountryRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TYPE "CategoryRequestStatus" AS ENUM ('PENDING','APPROVED','REJECTED');
CREATE TABLE "CategoryRequest" (
  "id" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "suggestedName" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "parentId" TEXT,
  "imageUrl" TEXT,
  "status" "CategoryRequestStatus" NOT NULL DEFAULT 'PENDING',
  "adminNote" TEXT,
  "resolvedCategoryId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CategoryRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CategoryRequest_sellerId_status_idx" ON "CategoryRequest"("sellerId","status");
ALTER TABLE "CategoryRequest" ADD CONSTRAINT "CategoryRequest_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
