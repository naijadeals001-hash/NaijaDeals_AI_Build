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
- Quantity edits and variant transitions take the same `InventoryStock` row lock;
  absolute quantity cannot fall below reserved units. Refund, cancellation and
  return restocking uses a durable order-level marker and restores the variant
  source exactly once; a product-level order item whose listing later became
  variant-managed is suppressed rather than credited to `InventoryStock`.
- Saved items, the Control Center preview/list, the homepage rail and both search
  index writers use the shared availability projection. A variant-managed saved
  item offers "Choose options"; no surface renders "N available of 0 on hand".

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
Deactivation is refused while the variant has reserved units or an unsaved line in
an ACTIVE cart. Saved-for-later lines do not reserve stock and do not block
deactivation; they remain readable and become unavailable with a "choose
options" path. Historical CHECKED_OUT cart rows and order items keep their
variant reference and never block deactivation. Sellers still cannot
publish; the Control Center remains the publisher, and every create/update
writes before/after audit metadata including variants.

## Editors

The seller draft form and Control Center catalogue editor expose the same
variant fields. Selecting/adding an active variant fixes product-level quantity
at zero and disables that field. The backend is authoritative if a client sends
conflicting values.
