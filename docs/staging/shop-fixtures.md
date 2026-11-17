# Staging Shop fixtures and acceptance journey

Staging-only demonstration catalogue, tester funding and browser journey for the
NaijaShop checkout slice. Everything here is for the staging TEST environment;
none of it is a production procedure or a live-payment procedure.

## 1. Payment verification level

**Local test top-up → wallet checkout. There is no live provider in this path.**

| Step | What actually happens | Evidence |
| --- | --- | --- |
| Funding | `scripts/staging/fund-shop-testers.ts` calls the existing `createTopUp` + `creditTopUp` services with `provider: "test"`. `ENABLE_TEST_PAYMENTS=true` is set **inside that script process only**, after the verified staging database is loaded. | Balanced `TOPUP-<reference>` ledger transaction with one platform DEBIT and one tester02 CREDIT leg; the running app's environment is unchanged. |
| Checkout | The browser pays with the already-offered `wallet` method. The server verifies the server-side wallet balance, creates the escrow hold and marks the payment COMPLETED. | `Payment.status = COMPLETED`, order `paymentStatus = paid`, one escrow hold and one delivery. |
| Refund | Cancelling the paid order goes through the supported customer cancellation → `refundPayment` path. | Order `status = refunded`, `paymentStatus = refunded`, wallet restored, escrow no longer held. |

The staging application does **not** offer the `test` payment adapter (it is
gated on `NODE_ENV !== "production"` in `lib/payments/adapters.ts`), and this
work does not change that. No Paystack or Flutterwave request, card detail,
bank transfer, real charge or payout is made.

## 2. Database safety

Both scripts:

1. load `C:/NaijaDeals-Staging/env/staging.env` before importing Prisma;
2. copy only `DATABASE_URL` into the script process;
3. verify the target with the shared `scripts/lib/test-db-guard.ts` guard
   (explicit URL, actual `current_database()`, deny list, required tables and
   the canonical TEST marker);
4. additionally require `current_database() === "naijadeals_staging"`.

They refuse any other database, including a differently named TEST database.
They print counts, slugs and balances only — never the connection string,
passwords, emails or other environment values.

No application code or environment file is changed by this slice.

## 3. Persistent fixture inventory

Prepared by `scripts/staging/prepare-shop-fixtures.ts`. All catalogue rows are
`isDemo: true`, every name/description contains `STAGING DEMO`, and only
already-approved project images are used (no paid generation).

| Fixture | Identifier | Details |
| --- | --- | --- |
| Fixture audit actor (non-login) | `staging.shop.fixture@staging.invalid` | Passwordless, `actorType = CUSTOMER`, NG scope, exactly the dedicated `staging_catalogue_fixture` role. That role is not in `STAFF_ROLES` or the app permission map, so it grants no Control Center access even if a future login path appeared. Used only as the service-layer audit actor; it cannot sign in. |
| Demonstration seller | `demo-catalogue-review` | `STAGING DEMO — Catalogue Seller (not a real seller)`, `VERIFIED`, `NG`, market `Wuse, Abuja`. Required by `chooseVendor(isDemo)` in `catalogue-admin.service.ts`. |
| Department | `staging-demo-phones-tablets` | `STAGING DEMO — Phones & Tablets` |
| Department | `staging-demo-fashion` | `STAGING DEMO — Fashion` |
| Department | `staging-demo-home-kitchen` | `STAGING DEMO — Home & Kitchen` |
| Simple in-stock product | `staging-demo-simple-instock-phone` | ₦18,500 illustrative price, 25 test units, image `/products/tecno-spark-20.svg` |
| Variant product | `staging-demo-variant-sneakers` | Two active options: `STG-DEMO-SNK-BLUE-42` (6 units) and `STG-DEMO-SNK-RED-44` (0 units, deliberately out of stock). Image `/products/ankara-sneakers.svg` |
| Simple out-of-stock product | `staging-demo-out-of-stock-blender` | ₦7,500 illustrative price, published and then set to 0 available units. Image `/products/binatone-blender-15l.svg` |

The out-of-stock simple product is created with 2 units so the existing
`publishProduct` validation can pass, then `updateProduct` sets quantity to 0.
That is the supported catalogue-admin path; stock is not edited directly.

The department images are `/generated/shop/category-phones-tablets.webp`,
`/generated/shop/category-fashion.webp` and
`/generated/shop/category-home-kitchen.webp`.

### Idempotency and maintenance

- The actor is resolved by its deterministic email; the vendor, departments and
  products by their deterministic slugs.
- Re-running converges the DEMO labels, description, price, approved image and
  publication state without creating duplicates.
- `--restock` restores the configured demo quantities only when the affected
  stock source has no reserved units (open orders are never overwritten).
- `--cleanup` archives the demo products and deactivates the demo departments
  through the catalogue services. It deletes nothing. The demo vendor and
  passwordless actor are retained because there is no delete workflow and they
  anchor audit references.
- Orders, payments, refunds, escrow and ledger rows are never deleted by any of
  these scripts.

## 4. Seller ownership boundary

The demo seller is **not** the tester02 seller persona vendor
(`staging-test-seller-tester02`). The preparation script refuses to continue if:

- the demo vendor slug is owned by a login/persona account;
- the demo vendor owner holds `vendor`, `driver`, `admin`, `super_admin`, `ops`,
  `finance`, `support` or `courier`;
- the resolved demo vendor is the seller persona's vendor row.

The journey proves the boundary through the real seller API:

```text
Sign in as the seller persona
GET  /api/seller/overview                 -> no staging-demo-* product
PATCH /api/seller/products/<demo product> -> HTTP 403 forbidden
GET  /api/orders/<demo vendor order>      -> HTTP 403 forbidden
```

`updateSellerProduct` scopes every write to the authenticated seller's own
`vendorId`, and `GET /api/orders/[id]` only allows the customer, the vendor owner
or an administrator.

## 5. Tester funding

`scripts/staging/fund-shop-testers.ts`:

- resolves `tester02` and `tester03` from the protected activation file without
  printing their emails or passwords;
- ensures and credits only the **tester02 CUSTOMER wallet**;
- uses the deterministic `idempotencyKey = staging-shop-tester02-topup-v1` and
  `providerReference = TEST-STAGING-SHOP-TESTER02-V1` (the version suffix comes
  from `STAGING_SHOP_TOPUP_VERSION`, default `v1`);
- credits ₦100,000 of test money (10,000,000 kobo, currency NGN) through
  `creditTopUp`, which posts the balanced journal and moves the platform funding
  wallet by the same amount;
- proves one DEBIT and one CREDIT leg of the exact amount, tester02 +amount,
  platform −amount, and that the NGN sum of all wallet positions is unchanged
  (currencies are never summed together). The TEST platform counter-wallet
  therefore shows `-10,000,000` kobo after funding; it is a test-funding
  counterparty, not a funded treasury, and no real money is represented;
- re-submits the same create and credit calls to prove idempotency: the create
  returns the same row and the credit returns `already_credited` with no balance
  movement;
- leaves **tester03 unfunded** and reports its existing wallet state without
  creating or crediting anything.

Re-running the same funding version is idempotent and does **not** add more test
money. If an authorised new test top-up is genuinely needed, set
`STAGING_SHOP_TOPUP_VERSION` to a new reviewed value (for example `v2`); the
deterministic key and provider reference change together, so the new top-up is
still exactly one balanced credit. Do not do this as routine repetition.

Wallet balances are never edited outside the service's balanced path.

## 6. Commands

Run from the repository root. The coordinator executed these scripts centrally
on 2026-11-16 after review; the exact user-facing result and report are below.

```bash
# 1. Verify the staging app build/identity separately, then prepare the catalogue
npx tsx scripts/staging/prepare-shop-fixtures.ts

# 2. Fund tester02 only (test top-up -> wallet)
npx tsx scripts/staging/fund-shop-testers.ts

# 3. Exercise the real UI against the running local staging app
node scripts/staging/shop-tester-journey.cjs
```

Optional:

```bash
STAGING_BASE_URL=http://localhost:3200 node scripts/staging/shop-tester-journey.cjs
SHOP_JOURNEY_HEADED=1 node scripts/staging/shop-tester-journey.cjs   # watch the browser
SHOP_JOURNEY_TIMEOUT_MS=45000 node scripts/staging/shop-tester-journey.cjs
STAGING_SHOP_TOPUP_VERSION=v2 npx tsx scripts/staging/fund-shop-testers.ts   # only for an authorised new test top-up
```

Prerequisites for the journey:

- the staging application is running and its `/api/health` database check is
  healthy;
- Shop is reachable in the selected market (the registry default is live; the
  scripts do not change service activation);
- Playwright Chromium is installed (`npx playwright install chromium` if not);
- `C:/NaijaDeals-Staging/secrets/tester-activation.json` contains `tester02`,
  `tester03` and the seller persona with their activation passwords. The
  scripts resolve the two primary testers by the documented `tester02` /
  `tester03` labels (normalised across display name, email and purpose) and
  refuse an ambiguous or missing match rather than guessing;
- the demo catalogue is published and tester02 is funded.

The journey is for the local staging URL. The protected external hostname also
sits behind Cloudflare Access, which the script does not authenticate; use a
session you are already authorised to use, or run against localhost.

### Executed result

- Preparation: 3 departments + 3 products created/published; fixture actor,
  demo vendor and seller-boundary checks passed.
- Funding: tester02 credited `10,000,000` kobo through one balanced test
  top-up; replay was idempotent; tester03 remained unfunded.
- Browser journey: **28 PASS, 0 FAIL, 0 BLOCKED, 1 DEFERRED**. The deferred
  row is return-case creation after a legitimate delivery; the honest empty
  state was checked. Evidence:
  `qa-artifacts/staging-shop/report-20261117000309-be279b.json` and the
  corresponding screenshots. The report records build
  `ygTpeinzqY0L2X5fgwNUL`, the health database check, zero baseline cart/saved
  records and zero run-owned leftovers.
- n8n outbox evidence: order/refund/status intents are `PROCESSED`; vendor,
  refund and status notifications are `SENT`. A direct customer `order.paid`
  notification may remain `QUEUED` because the optional Valkey worker is not
  configured; order history still shows `Payment: Paid`.

## 7. What the journey covers

`scripts/staging/shop-tester-journey.cjs` outputs `PASS`, `FAIL`, `BLOCKED` or
`DEFERRED` per step, writes screenshots and a JSON report to
`qa-artifacts/staging-shop/` (ignored by Git), and exits:

- `0` — no FAIL and no BLOCKED;
- `1` — at least one FAIL;
- `2` — at least one BLOCKED (for example missing fixtures or funding).

Covered steps:

| Area | Checks |
| --- | --- |
| Catalogue | `/naijashop` shell, `/naijashop/search?q=STAGING%20DEMO`, three demo cards, product-detail DEMO badge and notice |
| Variants | two options, the out-of-stock option is disabled, the in-stock option updates availability and adds the exact variant |
| Availability | simple out-of-stock product shows `Out of stock`, disables Add to cart and explains why |
| Saved items | save from the product page, list under `/account#saved`, remove again |
| Cart | add, increase/decrease quantity, save for later, move back to cart, remove, honest empty state |
| Checkout validation | browser blocks empty required fields; the server returns `400 validation_error`; no order is created |
| Successful payment | one order created, wallet offered, init + confirm, `paid`/`vendor_notified`, one delivery, one escrow hold, exact wallet movement |
| Duplicate submissions | duplicate checkout returns `409` with no second order; duplicate payment confirm returns `duplicate: true` with no second delivery/escrow/balance movement |
| Order history and ownership | owner sees the order and paid state; tester03 gets `403` and no order number is rendered |
| Refund | paid order cancellation returns `refunded: true`, order becomes `refunded`, wallet and escrow restored; duplicate cancellation is `409` and moves no funds |
| Returns | `/returns` honestly reports "No orders are ready to return"; return-case creation is `DEFERRED` because no delivered/completed order exists |
| Insufficient balance | tester03's wallet is below the order total; payment returns `402 insufficient_wallet`; the unpaid order is cancelled, its pending payment marked FAILED and the reservation released |
| Seller persona | own empty overview; demo products absent; demo product update `403`; demo vendor order read `403` |
| Non-login actor | the passwordless catalogue fixture actor login returns `401` |
| Responsive | 390×844 search viewport with no document-level horizontal overflow |

The `DEFERRED` return case is not a defect: the demo vendor owner is a
non-login fixture, so no seller fulfilment → delivery → completion can occur in
this customer-only journey. Do not fabricate a delivered order or a return.

## 8. Run-owned records and cleanup

| Record | Owner | Cleanup |
| --- | --- | --- |
| Demo departments, vendor and products | Persistent staging fixtures | Retained; `--cleanup` archives/deactivates |
| Passwordless `staging_catalogue_fixture` actor | Persistent staging fixture | Retained for audit references |
| tester02/tester03 cart lines for `staging-demo-*` products | This run only | Baseline captured; journey blocks if active baseline lines exist and removes only IDs it created |
| tester02/tester03 saved demo products | This run only | Baseline captured; journey removes only saved IDs it created |
| Addresses | Avoided | The journey unchecks "Save this address to my account" |
| Orders, payments, refunds, escrow, ledger | Financial records | **Retained.** The journey never deletes them |

Run-owned orders are identified by `contactName` `STAGING TESTER02` /
`STAGING TESTER03` and delivery address line 2 `RUN <runId>`. The journey report
lists their ids and numbers under `runOwnedRecords.persistentOrders`.

If a run is interrupted between checkout and payment/cancellation, an unpaid
order may keep a stock reservation. Resolve it through the supported customer
cancellation or the Control Center — do not edit inventory or wallet balances
directly.

## 9. Current limitations

- No live provider is used or implied. The payment evidence is wallet + local
  test top-up on the TEST database.
- The `test` payment adapter remains unoffered by the running staging app.
- Return-case creation cannot be exercised until an order reaches
  delivered/completed through legitimate seller fulfilment.
- The journey does not authenticate Cloudflare Access; it targets the local
  staging app.
- The direct customer `order.paid` notification is not routed through the n8n
  outbox in this build; without the optional Valkey notification worker it can
  stay `QUEUED`. The paid order itself and the n8n delivery/refund/status
  intents are verified.
- No paid image generation was used. Only approved project images are
  referenced.
- This documentation and these scripts do not mutate the staging database
  themselves; the coordinator executes them after review.
