# Variant inventory and publication contract

The audit before this contract found two independent stock numbers for variant
products: `ProductVariant.stock/reserved` and `InventoryStock.quantity/reserved`.
The public catalogue already preferred variants, while the admin validator and
product-level edits used `InventoryStock`; the seller/admin APIs ignored
variant payloads.

## Authoritative source

- No active variants: `InventoryStock` is authoritative.
- One or more active variants: the sum of active `ProductVariant.stock -
  reserved` is authoritative. `InventoryStock.quantity` must be `0`; it is never
  added to variant availability.
- Adding an active variant to a product with product-level stock is refused
  with `409 variant_stock_conflict`. Product-level quantity writes while active
  variants exist are refused with `409 variant_stock_managed`.
- Product publication validation uses the same rule. A variant product needs at
  least one active, priced variant with available stock.

## Payload and validation

`POST/PATCH /api/seller/products` and `/api/admin/catalogue/products` accept an
explicit `variants` array. Omitted means unchanged; `[]` deactivates all
existing variants (subject to reservations/cart use). Malformed or non-array
payloads return `400 invalid_variants`; invalid SKU/options/price/stock/currency
return their specific 400/409 code. SKUs are globally unique. Variant records
may carry `id` (ownership is checked), `name`, `sku`, `priceKobo`, `stock`,
`attributes`/`options` (JSON object), `isActive`, and `currency` (must match the
listing country currency).

Existing variants omitted from a replacement set are deactivated, not deleted.
Deactivation is refused while the variant has reserved units or live cart lines.
Historical order items keep their variant reference. Sellers still cannot
publish; the Control Center remains the publisher, and every create/update
writes before/after audit metadata including variants.

## Editors

The seller draft form and Control Center catalogue editor expose the same
variant fields. Selecting/adding an active variant fixes product-level quantity
at zero and disables that field. The backend is authoritative if a client sends
conflicting values.
