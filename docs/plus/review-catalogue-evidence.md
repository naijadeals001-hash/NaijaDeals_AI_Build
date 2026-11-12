# REVIEW catalogue — acceptance evidence (2026-11-12)

Source HEAD at time of writing: `479783c` plus the financial-boundary commit.
Canonical preview: http://localhost:3047/naijashop, database `naijadeals_review`
(classification REVIEW, 72 migrations).

## Catalogue

- 7 departments, 23 active DEMO products, 24 product images, 1 demonstration seller,
  0 orders, 0 CRF categories.
- Department imagery: Electronics & Appliances uses
  `/generated/shop/banner-electronics.webp` (1024×576, served 200, rendered).
- Demonstration seller is announced as "demonstration seller"; the verified-seller
  claim is reserved for non-DEMO vendors.
- Public copy uses the approved label "Deliveries & Freight"; no "NaijaSend" remains in
  Shop components.

## Verified public behaviour

| Check | Result |
|---|---|
| `/naijashop` at 320/390/768/1440 | served 200; document scrollWidth equals viewport after the `.sr-only` and grid-track fixes |
| Wholesale paragraph at 390 | right edge 358 inside section right 378; 0 px clipped |
| Product cards | demonstration seller; no verified claim |
| `/product/demo-daily-sunscreen` | HTTP 404 with branded "This product is not available" and recovery links |
| Basket journey (`scripts/review-basket-journey.cjs`) | 10/10: sign-in, add, quantity 2, refresh, back, remove, empty cart, no checkout |
| Cart heading | "1 product line · 2 units" while badge announces 2 |

## Financial boundary

`lib/payments/review-financial-guard.ts` reads `DatabaseClassification` through the
application client and refuses REVIEW/UNKNOWN, or a missing classification. It is wired
at the ledger posting choke point (`postBalancedTransaction`) and the provider HTTP choke
point (`jsonRequest`).

`scripts/review-financial-refusal.ts` on REVIEW: 5/5 — provider initialize refused with
`review_financial_operations_disabled`, **0 outbound fetch calls**, ledger posting refused,
wallet transaction count unchanged. The same guard resolves successfully on the TEST
database, so financial acceptance suites remain usable.

## Request-method correction

The earlier reviewer log line "GET POST /checkout" is contradictory. The recorded method
was **GET**: Next.js read-only RSC prefetch of the cart's checkout link. No POST to
`/checkout` or any provider endpoint occurred during the basket journey.
