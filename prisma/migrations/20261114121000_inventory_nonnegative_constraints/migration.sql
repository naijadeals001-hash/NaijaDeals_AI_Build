-- Inventory integrity constraints.
--
-- Two authoritative stock sources exist:
--   * "InventoryStock" (quantity/reserved) for product-level listings;
--   * "ProductVariant" (stock/reserved) for variant-managed listings.
--
-- Every application writer already enforces these invariants by conditional
-- updates under a row lock (checkout reservation uses
-- `quantity - reserved >= n`; payment commit/cancel use `reserved >= n`).
-- The database must refuse a negative or over-reserved row even if a future
-- writer, manual SQL, or a bug bypasses those checks. The constraints do not
-- repair or coerce existing values.
--
-- Preflight: the migration fails closed (and changes nothing) when any
-- historical row already violates an invariant. Operators must investigate and
-- correct the actual rows under evidence/approval; the migration never deletes,
-- clamps or merges financial or inventory history.
DO $$
DECLARE
  stock_negative integer;
  stock_reserved_negative integer;
  stock_over_reserved integer;
  variant_stock_negative integer;
  variant_reserved_negative integer;
  variant_over_reserved integer;
BEGIN
  SELECT count(*) INTO stock_negative FROM "InventoryStock" WHERE "quantity" < 0;
  SELECT count(*) INTO stock_reserved_negative FROM "InventoryStock" WHERE "reserved" < 0;
  SELECT count(*) INTO stock_over_reserved FROM "InventoryStock" WHERE "reserved" > "quantity";
  SELECT count(*) INTO variant_stock_negative FROM "ProductVariant" WHERE "stock" < 0;
  SELECT count(*) INTO variant_reserved_negative FROM "ProductVariant" WHERE "reserved" < 0;
  SELECT count(*) INTO variant_over_reserved FROM "ProductVariant" WHERE "reserved" > "stock";

  IF stock_negative + stock_reserved_negative + stock_over_reserved
     + variant_stock_negative + variant_reserved_negative + variant_over_reserved > 0 THEN
    RAISE EXCEPTION
      'Inventory integrity preflight failed; constraints were not applied. InventoryStock: quantity<0=%, reserved<0=%, reserved>quantity=%. ProductVariant: stock<0=%, reserved<0=%, reserved>stock=%. Investigate and correct these rows under approval; this migration does not repair data.',
      stock_negative, stock_reserved_negative, stock_over_reserved,
      variant_stock_negative, variant_reserved_negative, variant_over_reserved;
  END IF;
END
$$;

-- NOT VALID + VALIDATE keeps the write-blocking check brief while still
-- verifying existing rows against the same predicate.
ALTER TABLE "InventoryStock"
  ADD CONSTRAINT "InventoryStock_quantity_nonnegative" CHECK ("quantity" >= 0) NOT VALID,
  ADD CONSTRAINT "InventoryStock_reserved_nonnegative" CHECK ("reserved" >= 0) NOT VALID,
  ADD CONSTRAINT "InventoryStock_reserved_within_quantity" CHECK ("reserved" <= "quantity") NOT VALID;

ALTER TABLE "InventoryStock"
  VALIDATE CONSTRAINT "InventoryStock_quantity_nonnegative",
  VALIDATE CONSTRAINT "InventoryStock_reserved_nonnegative",
  VALIDATE CONSTRAINT "InventoryStock_reserved_within_quantity";

ALTER TABLE "ProductVariant"
  ADD CONSTRAINT "ProductVariant_stock_nonnegative" CHECK ("stock" >= 0) NOT VALID,
  ADD CONSTRAINT "ProductVariant_reserved_nonnegative" CHECK ("reserved" >= 0) NOT VALID,
  ADD CONSTRAINT "ProductVariant_reserved_within_stock" CHECK ("reserved" <= "stock") NOT VALID;

ALTER TABLE "ProductVariant"
  VALIDATE CONSTRAINT "ProductVariant_stock_nonnegative",
  VALIDATE CONSTRAINT "ProductVariant_reserved_nonnegative",
  VALIDATE CONSTRAINT "ProductVariant_reserved_within_stock";
