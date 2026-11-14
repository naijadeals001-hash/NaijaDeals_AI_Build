# Product-origin data audit (Discover Africa)

Date: 2026-11-14. This records what existed before the country discovery slice and what was added.

## Existing fields inspected

| Field | Meaning found in code | Used as origin? |
|---|---|---|
| `Vendor.countryCode` / `Vendor.market` | Seller's registered market | **No.** A Ghanaian seller may sell goods made elsewhere. |
| `Product.countryCode` | The marketplace fulfilment country used by catalogue queries and checkout (`COUNTRIES`) | **No.** It is not a country-of-manufacture field and is not used to populate a country guide. |
| `Product.attributes` | Category-specific product attributes | **No.** Free-form style/material information is not proof of origin. |
| `CountryTheme` (new) | Editorial "Known for" association | **No.** Cultural or style association is not manufacture. |
| `ProductImage` | Product photography | **No.** A photo is not origin evidence. |
| Delivery address / `OrderItem` | Customer destination | **No.** Destination is not origin. |

There was **no separate product country-of-origin field** and **no dispatch-location field** before this slice. Existing code did not assert origin, so no origin claims were invented.

## Added fields

`Product`:

- `originCountryCode` — ISO alpha-2 code of the country where the product was made/produced, only when recorded.
- `originBasis` — `SELLER_DECLARED` or `VERIFIED`.
- `originNote` — the recorded evidence/declaration text.
- `originVerifiedAt`, `originVerifiedBy` — set only for operator-verified origin.

`CountryProfile` / `CountryTheme` / `CountryThemeSource` hold the editorial country guide and its source records. They do not modify `Product.countryCode`, `Vendor.countryCode`, currency, delivery or activation.

## Public rule

`listCountryOriginProducts(code)` filters on:

```
originCountryCode = <country>
originBasis IN (SELLER_DECLARED, VERIFIED)
status = ACTIVE
isSample = false
vendor.status = VERIFIED
category active
```

It deliberately does **not** filter on `vendor.countryCode`. The Ghana guide therefore shows no listing merely because a Ghanaian seller has an unrecorded-origin product; the automated acceptance proves that seller-location products do not leak into the guide.

## Current recorded-origin inventory

At this baseline: **0 products have a recorded origin**. Demo products remain demo and are not relabelled. The country pages therefore show the honest empty state, not a fabricated producer, stock level or origin claim. The Control Center origin tab can record a declaration or a verified origin with an evidence note; it does not publish, price, stock or deliver the product.

## Dispatch location

Dispatch is not separately modelled. `Product.countryCode` is the marketplace fulfilment market, not a dispatch warehouse or origin. This is a documented gap; it must not be presented as a dispatch-location feature until a real dispatch field and operational data exist.

## Review authorization and paging (2026-11-13)

Origin review is authorised against the **product's marketplace scope**, not against equality between the origin country and the reviewer's market:

- A reviewer scoped to NG may record a GH origin (or any registered discovery-country origin) for an NG-market product. A product legitimately may have an origin different from its seller's market or fulfilment country.
- A GH-scoped reviewer is refused (`403 region_forbidden`) when attempting to set **or clear** an NG product's origin. The route resolves the product and enforces its `countryCode`; the service repeats the check under a row lock.
- `GET /api/admin/country-discovery/origin` is server-paginated (`page`, `pageSize` up to 100, default 25) with `total`, `totalPages`, per-status summary counts and filters for search, origin status (`recorded` / `unrecorded`), evidence basis (`VERIFIED` / `SELLER_DECLARED`) and fulfilment market. Every eligible product is reachable by paging; there is no 1000-row client-side cap.
- Set and clear both record the before/after origin fields in `AuditLog`. `VERIFIED` requires an evidence note of at least 20 characters; the origin must be a registered discovery country.
- The tests use a run-owned NG-market product and remove it afterwards. No accepted product's origin was changed; the recorded-origin inventory remains 0 at this baseline.

| Reviewer | Product market | Requested origin | Observed |
|---|---|---|---|
| NG-scoped origin reviewer | NG | GH | Allowed (declared and verified) |
| GH-scoped origin reviewer | NG | GH | `403 region_forbidden`, record unchanged |
| NG-scoped origin reviewer | NG | clear | Allowed |
| GH-scoped origin reviewer | NG | clear | `403 region_forbidden`, record unchanged |
