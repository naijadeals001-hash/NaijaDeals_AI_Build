# REVIEW catalogue repair — continuation handoff

Baseline: source HEAD `9437cda`, served build `GL7aNLfBsDqgSXc4zngK3`, port 3047,
database `naijadeals_review` (classification REVIEW, 72 migrations). Catalogue: 23 active
DEMO products across 7 departments, 24 product images, 1 demonstration seller, 0 orders,
0 CRF records. Financial TEST database `naijadeals_checkout_refund_test` untouched.

## Completed and verified

- REVIEW database created and migrated; classification REVIEW; CRF categories absent.
- Seed `scripts/review-catalogue-seed.ts` (idempotent, REVIEW-only) and repair
  `scripts/review-catalogue-repair.ts` (tomatoes → Groceries, perfume → Beauty, sunscreen
  archived for image mismatch).
- Guard `scripts/review-preview-guard.ts`; launcher `scripts/start-review-preview.cmd`
  requires `REVIEW_DATABASE_URL`, runs the guard and refuses non-REVIEW databases.
- Compiled review indicator present in served HTML.
- 23/23 active product URLs return 200.
- Archived sunscreen absent from search.

## Known defect to fix first

`GET /product/demo-daily-sunscreen` returns HTTP 200 while rendering not-found content.
`getPublicProductDetail` correctly returns null; the route's not-found path is losing the
status code (likely a streaming boundary after `notFound()` or a catch that re-renders).
Fix with the framework-supported not-found response, verify direct HTTP status and client
navigation, and keep unpublished product payloads out of the response body.

## NOT RUN (fresh session)

1. Read the preview process's own effective database through its client during a guarded
   start; record sanitised identity only. No public diagnostics endpoint.
2. Add REVIEW restrictions to funding, payment, refund, payout and other provider entry
   points; prove refusal with fake credentials, controlled adapters and outbound-network
   blocking. Do not contact providers.
3. Create a guarded idempotent REVIEW-only customer and run authenticated sign-in, add,
   quantity, remove, badge, refresh and navigation continuity. No payment.
4. Build if code changed, restart through `scripts/start-review-preview.cmd`, and assign a
   separate reviewer for desktop/mobile inspection of images, descriptions, placement,
   archived-product exclusion and basket behaviour.

## Constraints still in force

No production deployment, live transactions, destructive cleanup, unapproved spending, or
copies of customer identities/wallets/orders/financial history. GitHub preservation stays
blocked until access is restored and remote SHA is verified.
