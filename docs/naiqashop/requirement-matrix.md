# NaijaShop requirement matrix (2026-11-12)

Status ladder kept separate: architecture-supported, configured, tested, approved, live. No NaijaShop requirement is live; no non-Nigeria market is approved.

| Area | Requirement | Existing state | Gap | Acceptance | Dependency |
|---|---|---|---|---|---|
| Storefront | Header with real account/location | Misleading sign-in copy | Load session user; inline location | Signed-in name renders; cart count matches | Session/address APIs |
| Storefront | Search suggestions | Missing | Suggest API + keyboard UI | Only real matches suggested | Search index |
| Storefront | Filters/sort/pagination | Working (discovery slice `4f951ab`) | Facets limited; in-memory pagination | Each filter changes results; totals truthful | Catalog SQL pagination |
| Storefront | Deals integrity | Misleading | No discount filter | Every deal has real compare-at | Catalog fields |
| Product | Variant-aware CTA | Broken on grid | Route to detail/options | Variant product purchasable from grid | None |
| Product | Seller identity/profile | Missing profile | Public seller route | Seller name links to real catalogue | Vendor model |
| Product | Delivery/returns disclosure | Partial | No ETA/window | Fee and window before checkout | Delivery zones/policy |
| Customer | Receipt/invoice | Missing | New receipt route | Owner downloads receipt; non-owner 403 | Order/payment |
| Customer | Returns | Partial | Whole-order, seller-only, no admin queue | Line-level return + admin queue | Returns logistics |
| Customer | Disputes | Missing | No intake route | Paid undelivered order opens dispute | Dispute service |
| Customer | Support | Missing | No ticket queue; copy misleading | Ticket linked to order; support resolves | Support model/RBAC |
| Seller | Variants/price editing | Missing UI | Editor + audit | Edits reflect on storefront | Seller API |
| Seller | Payout request/history | Missing | Vendor request + admin creation | Payout debits wallet, ledger reconciles | Payout lifecycle |
| Seller | Staff access | Missing | Model + scoped roles | Staff sees only granted capabilities | Auth/RBAC |
| Fulfilment | Courier assignment UI | Broken | Control Center assign dialog | Courier sees assigned delivery | Existing API |
| Admin | Review moderation | Missing UI | Reviews tab | Approved review updates rating | Existing API |
| Admin | Coupon/returns queues | Missing | Returns and coupon tabs | Queues show real rows/actions | Services |
| Admin | Storefront controls wired | Misleading | Consume saved fields | Change visible publicly | Storefront config |
| Financial | Refund-aware completion/dispute | Fixed in escrow workstream | Provider refund status API absent | Conservation tests pass | Provider API |
| Country | NG only delivery | Configured | No other country price list/currency | Checkout blocked outside supported | Business decision |
| Country | Pan-African expansion | Unverified | Currencies, catalogues, providers, logistics, legal | Readiness checklist per country | Business decisions |

## Readiness
- Architecture-supported: countryCode fields, country/city activation, per-country cu
