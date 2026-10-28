# Marketplace verification record

Date: 2026-10-28
Environment: local Windows, PostgreSQL 18, Node.js 24, Next.js 14.2.35
Marketplace test base URL: `http://localhost:3200` (development server)
Production preview base URL: `http://localhost:3100` (`.next-prod` build)

## Commands run

```powershell
npx prisma migrate deploy
npx prisma generate
npm run prisma:seed
npm run type-check

# Marketplace suite needs the labelled local test payment provider, which is
# deliberately unavailable when NODE_ENV=production.
$env:ENABLE_TEST_PAYMENTS="true"; npm run dev -- -p 3200
$env:TEST_BASE_URL="http://localhost:3200"; npm run test:marketplace

# Production build and preview
$env:NEXT_DIST_DIR=".next-prod"; npm run build
$env:NEXT_DIST_DIR=".next-prod"; npm run start -- -p 3100

# Authenticated visual QA against the production preview
$env:QA_BASE_URL="http://localhost:3100"; npm run qa:visual

# Persistence across a restart
node scripts/verify-persistence.mjs --out qa-artifacts/persistence-before.json
# stop and restart the preview
node scripts/verify-persistence.mjs --out qa-artifacts/persistence-after.json
node scripts/verify-persistence.mjs --compare qa-artifacts/persistence-before.json qa-artifacts/persistence-after.json
```

## Result

`npm run test:marketplace` — **13/13 passed**.

| # | Scenario | Result |
| --- | --- | --- |
| 1 | Public catalog, category and storefront pages respond | PASS |
| 2 | Auth, roles and server-side RBAC are enforced | PASS |
| 3 | Variant products require an option (no double stock pool) | PASS |
| 4 | Customer purchase: checkout, verified payment, idempotent duplicate callback | PASS |
| 5 | Seller product creation, fulfilment, courier delivery and escrow release | PASS |
| 6 | Seller onboarding: application, admin approval, vendor access | PASS |
| 7 | Failed wallet payment rejected, order unpaid, cancellation releases stock | PASS |
| 8 | Concurrent checkout cannot oversell a one-unit product | PASS |
| 9 | Paid cancellation refunds and restocks exactly once | PASS |
| 10 | Delivery failure and retry reach delivered | PASS |
| 11 | Cross-tenant and unauthorized access is rejected | PASS |
| 12 | Webhook signatures are rejected when invalid or unconfigured | PASS |
| 13 | Mobile and accessibility shell markers are present | PASS |

`npm run qa:visual` — **99 page checks, 0 failures, 0 broken links, 0 auth failures**.
Seven passes: public pages anonymously; cart, checkout, account, orders and wallet as the
customer; seller, courier and admin dashboards as their roles; and the role dashboards again
anonymously to confirm each redirects to `/login`. Screenshots and the report are in
`qa-artifacts/`.

`scripts/verify-persistence.mjs` — **persisted: true**. Admin counts and all recorded order
IDs were identical before and after restarting the production preview.

## Defects found and fixed during this pass

| Defect | Fix |
| --- | --- |
| Anonymous visits to `/cart`, `/checkout`, `/orders`, `/wallet`, `/account` and `/tracking/[id]` rendered a client-side sign-in gate while still firing authenticated API calls, producing 401 console errors | These pages now check the session server-side and redirect to `/login?next=...`, matching `/admin`, `/seller` and `/courier` |
| "Open escrow holds" counted released and refunded holds | It now counts only holds with status `held` or `disputed` |
| The wallet page claimed escrow holds were "shown separately" but never listed them | Escrow holds are now listed with order number, status and amount |
| "Held in escrow" showed the customer wallet's `heldKobo`, which is zero for card/bank payments because the platform holds those funds | It now sums the active escrow holds on the customer's orders |
| The seeded ₦25,000 wallet fixture had no ledger backing while the UI says "Balances are ledger-backed" | The seed now posts a balanced wallet transaction (`SEED-WALLET-FIXTURE`) labelled as local test fixture funding |
| Visual QA only ever saw sign-in walls on authenticated routes | QA now signs in per role and checks the real dashboards |

## What the tests prove

- Stock reservation is atomic under concurrency: one checkout returns `201`, the
  competing checkout returns `409 insufficient_stock`, and exactly one unit is
  reserved.
- A duplicate payment confirmation is idempotent and does not create a second
  completed payment.
- A failed wallet payment does not mark the order paid and does not consume stock.
- Paid cancellation refunds once, restocks once, and a second cancellation is
  rejected.
- Delivery failure can be retried and completed, with order status kept in sync.
- Customers cannot read another customer's order; sellers cannot act on another
  seller's products/orders; anonymous users cannot reach admin or courier APIs or pages.
- Invalid or unconfigured payment webhooks are rejected.
- Database-backed state survives a full server restart.

## Configuration still required for live operation

These are external dependencies. They are not simulated and were not verified live.

| Dependency | Required configuration | Current state |
| --- | --- | --- |
| Paystack | `PAYSTACK_SECRET_KEY`; dashboard webhook URL `/api/payments/webhooks/paystack` | Not configured |
| Flutterwave | `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_WEBHOOK_HASH`; webhook URL `/api/payments/webhooks/flutterwave` | Not configured |
| Email/SMS notifications | Provider credentials and sender IDs | Not implemented/configured |
| Maps and address autocomplete | Provider key | Not configured |
| Object storage for seller uploads | S3-compatible bucket and credentials | Not configured; seller product images use URLs |
| Real courier network | Provider API credentials and coverage contract | Not configured; courier updates are authenticated internal operations |
| Production deployment | Hosting credentials and explicit approval | Not performed |

No production deployment was triggered or authorised as part of this verification.
