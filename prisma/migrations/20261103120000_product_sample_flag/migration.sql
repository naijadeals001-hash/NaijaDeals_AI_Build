-- Mark fixture catalogue rows so they are never presented as real seller listings.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "isSample" BOOLEAN NOT NULL DEFAULT false;
