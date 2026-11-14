-- Backfill the reviewed regulated taxonomy nodes. The column default is false,
-- so a deployment that applies the schema migration without the REVIEW-only
-- taxonomy seed would otherwise treat regulated goods as unregulated and let
-- an absent country rule act as permission.
UPDATE "Category"
SET "isRegulated" = true
WHERE "key" IN (
  'brake-system-parts',
  'car-seats-boosters',
  'cycling-helmets-protection',
  'electrical-installation-materials',
  'fertilizers-crop-nutrition',
  'health-monitors',
  'herbal-traditional-remedies',
  'infant-formula',
  'mobility-support-aids',
  'motorcycle-brakes-safety',
  'motorcycle-helmets-protection',
  'motorcycle-tyres-wheels',
  'otc-medicines-treatments',
  'pesticides-crop-protection',
  'seeds-seedlings',
  'suspension-steering-parts',
  'tyres-tubes',
  'vitamins-minerals-supplements'
);
