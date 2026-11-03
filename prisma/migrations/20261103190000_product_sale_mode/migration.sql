CREATE TYPE "SaleMode" AS ENUM ('escrow', 'contact');
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "saleMode" "SaleMode" NOT NULL DEFAULT 'escrow';
