# NaijaDeals Requirements Matrix

Statuses use the playbook vocabulary: **PASS / PARTIAL / BLOCKED / NOT STARTED**.
Evidence columns name the code path and the execution that proved it. Last verified
2026-11-03 (HEAD `7590af5`) against the isolated `naijadeals_test` database.

## Identity and access

| Requirement | Status | Evidence |
| --- | --- | --- |
| Registration | PASS | `/api/auth/register`, exercised by marketplace suite ("Auth, roles and server-side RBAC") |
| Login / logout | PASS | `/api/auth/login|logout`, session cookie `nd_session`, suite coverage |
| Session validation | PASS | `lib/auth/session.ts` `getSessionUser()`; expired rows deleted |
| RBAC (server-side) | PASS | `lib/auth/guard.ts`; cross-tenant rejection in marketplace suite |
| Scoped staff roles (ops/finance/support/moderator) | PASS | `requireAdminPermission` + `permissions.ts`; admin suite 19/19 |
| Region scope enforcement | PASS | `lib/auth/scope.ts`; `region_forbidden` cases in admin suite |
| Super-admin boundary | PASS | `requireSuperAdmin`; admin suite 403/200 cases |
| Password reset (expiring, single-use) | NOT STARTED | No reset route or token storage |
| Email verification | NOT STARTED | No provider |
| Admin MFA | NOT STARTED | No enrolment or recovery |
| Rate limiting | NOT STARTED | No limiter in route handlers |

## Commerce (NaijaShop)

| Requirement | Status | Evidence |
| --- | --- | --- |
| Catalog, categories, product detail | PASS | `/api/products`, `/api/categories`; marketplace suite |
| Cart and variants | PASS | `/api/cart*`; variant-option check in suite |
| Checkout with server-side price/stock | PASS | `checkout.service`; oversell race test |
| Escrow hold + release | PASS | `EscrowHold`/`EscrowEvent`; purchase and release tests |
| Duplicate callback idempotency | PASS | "idempotent duplicate callback" check |
| Refunds and restock | PASS | paid-cancellation test |
| Returns | PARTIAL | `ReturnRequest` model + seller resolve; no customer end-to-end test |
| Seller tools | PASS | seller product/fulfilment tests |
| Live payment provider | BLOCKED | Paystack/Flutterwave credentials absent; test adapter only |
| Product images for all active listings | PARTIAL | seller-created product without an image can appear in catalog (found in test run) |

## Mobility and delivery

| Requirement | Status | Evidence |
| --- | --- | --- |
| Ride quote and fare breakdown | PASS | `/api/drive/quote`, drive suite |
| Booking, dispatch, accept/arrive/start/complete | PASS | drive suite 28/28 |
| Two-driver acceptance yields one winner | PASS | race checks in drive suite |
| Assignment expiry released without UI reads | PASS | sweeper + expiry tests |
| Saved places CRUD | PASS | drive suite |
| Live GPS/map telemetry | BLOCKED | No map provider |
| Parcel booking with size/weight rules | NOT STARTED | `/naijasend` is a status page |
| Courier delivery workflow (marketplace) | PASS | delivery tests in marketplace suite |

## Money (NaijaPay)

| Requirement | Status | Evidence |
| --- | --- | --- |
| Integer minor units | PASS | `BigInt` kobo throughout (D-001) |
| Wallet balance / ledger / holds | PASS | `/api/wallet`, `/api/wallet/ledger` |
| Webhook signature verification | PASS | invalid/unconfigured signature test |
| Payouts (admin) | PASS | admin suite finance cases |
| Customer deposit/withdraw | NOT STARTED | No endpoints or UI |
| Reconciliation reports | NOT STARTED | No report surface |

## Control Center

| Requirement | Status | Evidence |
| --- | --- | --- |
| Unified `/admin` + `/super-admin` | PASS | Both render `AdminDashboard`; QA report |
| Real data tables (orders, rides, payouts, users, audit…) | PASS | `.qa/control-center` run 29/29 |
| Permission + region enforcement | PASS | admin suite 19/19 |
| Audit trail for sensitive changes | PARTIAL | `admin.roles_updated` covered; before/after detail incomplete |
| Pagination | PASS | 10-row pages with range label and Previous/Next on every admin table; client-side over the server-filtered dataset |
| Bulk actions / record detail | NOT STARTED | No bulk mutation or drawer/detail view yet |
| Region filter (country) | PASS | Server-validated `geo`, scope-clamped for staff, applied before serialisation; catalogue-driven options; 17/17 browser checks |
| Country/city activation | PARTIAL | Countries live in `lib/config/commerce.ts` (`enabled`, `deliveryEnabled`); admin selector reads them. No activation workflow or per-country UI yet, and the catalogue currently lists 6 countries (4 African), not all 54 |
| Live operations map | BLOCKED | No provider; UI shows honest placeholder |
| Notifications centre | NOT STARTED | Bell is decorative |

## Platform, i18n, design

| Requirement | Status | Evidence |
| --- | --- | --- |
| English / Swahili / Arabic dictionaries + RTL | PASS | `lib/i18n/*`, locale QA script |
| Design tokens | PARTIAL | `tailwind.config.ts` tokens; no documented component system |
| Accessible shells | PARTIAL | App shell + QA markers; no screen-reader/contrast audit |
| Original imagery | PARTIAL | 17 module images present, 0 broken; provenance not registered |
| PWA installability | NOT STARTED | No manifest or service worker |
| Native Android/iOS | NOT STARTED | No mobile project |

## Engineering gates

| Requirement | Status | Evidence |
| --- | --- | --- |
| Type-check | PASS | `npx tsc --noEmit` clean |
| Lint | PARTIAL | `next lint` script exists; not run in this audit |
| Automated suites | PASS | marketplace 13/13, admin 19/19, drive 28/28 |
| CI pipeline | PASS | `.github/workflows/ci.yml` with PostgreSQL service; no deploy |
| Disposable failing CI check | BLOCKED | Requires push; GitHub returns 403 |
| Isolated test database | PASS | `naijadeals_test` created/migrated/seeded locally |
| Browser screenshot regression baseline | NOT STARTED | QA screenshots exist but no diff baseline |
| Observability / health endpoint | NOT STARTED | None |

## Notes

- "PASS" here means the stated evidence was executed, not that the whole phase is accepted.
  Phase acceptance still follows the playbook's exit gates in `docs/phase-tracker.md`.
- Older claims in this file ("no tests", "no CI") were stale and have been replaced.


| Customer signed-in header and account menu | Implemented: real name, cart count, default address, functional account links, Escape/focus | 2026-11-05 |
| Customer order detail | Implemented route /orders/[id] with items, totals, address, payment status, timeline; needs order-fixture browser test | 2026-11-05 |


| Customer profile/password/address/saved actions | Implemented with audit and ownership; profile/address persistence and cross-customer isolation tested in isolated TEST schema; password error path and stock rejection remain gaps | 2026-11-05 |
