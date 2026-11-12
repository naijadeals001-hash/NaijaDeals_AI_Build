# Amazon/Jumia reference research (2026-11-12)

Method: anonymous public pages only, 1440x900 (one 390 attempt failed to reflow and is not treated as mobile evidence). No login, forms, cart writes or purchases. Jumia was blocked by Cloudflare 403 on every attempt; no Jumia behaviour is claimed.

## Observed on Amazon
- Header: department-scoped search select, persistent “Deliver to” control, account/returns/orders/cart, long department strip.
- Search: result count window (“1-16 of over 60,000”), six sorts, deep facet rail (brand, price, review, stock, delivery, condition), variant-aware card CTA (“See options”).
- Product: breadcrumbs, seller link (“Sold by …”), separate “Ships from”, list/compare price and saving, per-variant price/stock, delivery promise with location, returns window link, quantity bound by stock.
- Public returns policy: 30-day window, free returns at many locations, refund after receipt; help home is signed-in for order/return actions.
- Not observed: suggestions, populated cart/checkout, order history (sign-in), seller/admin screens.

## Mapped NaijaShop requirements
- Variant cards must route to variant selection, not add without a variant.
- Seller identity should be linkable with a profile/policy page.
- Product page should disclose delivery estimate and returns window before checkout.
- Deals must be filter-backed, not just a heading.
- Empty/typo states and truthful result counts are required.

## Limitations
Public marketing pages cannot establish screen-level parity; no private seller/admin behaviour was inferred.
