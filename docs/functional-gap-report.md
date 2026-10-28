# NaijaDeals Functional Gap Report

Date: 2026-06-05

This Phase 5 audit stops treating the preview as rollout-ready. The current app is now a functional local MVP for the core customer and operator loops, using typed demo data and localStorage. It is still not production-ready for real customers until backend, auth, payment, escrow, fraud, scanner, and dispatch systems are connected.

## Route Status Audit

| Route | Status | Current behavior |
| --- | --- | --- |
| `/` | partially working | Premium homepage with real navigation and listing CTAs; commerce state starts on deeper routes. |
| `/ecosystem-hub` | partially working | Ecosystem overview with working links and reusable listings; still informational. |
| `/categories` | working | Category cards open filtered search results using real demo catalog data. |
| `/search` | working | Local query and category filters search products, food, stays, gigs, rides, logistics, and creators. |
| `/product-listing` | working | Uses the same filterable local catalog and active add-to-cart actions. |
| `/product/[id]` | working | Dynamic product/service/food/stay detail reads typed demo data, saves items, and adds to cart. |
| `/cart` | working | Cart reads localStorage, updates quantities, removes items, and feeds checkout. |
| `/checkout` | working | Collects customer, delivery, payment, and notes; creates local order, wallet transaction, escrow hold, and tracking route. |
| `/orders` | working | Shows seeded and created demo orders from the same local store. |
| `/wallet` | working | Shows local balance, wallet transactions, and escrow holds created by checkout. |
| `/payments` | working | Reuses wallet/escrow ledger surface; real payment provider integration remains pending. |
| `/account` | working | Local demo sign-in/sign-out and profile updates persist in localStorage. |
| `/tracking/[id]` | working | Reads created or seeded orders and renders mission timeline plus verification structure. |
| `/onboarding/vendor` | working | Saves vendor onboarding submissions locally and exposes them in admin. |
| `/onboarding/driver` | working | Saves driver onboarding submissions locally and exposes them in admin. |
| `/onboarding/restaurant` | working | Saves restaurant onboarding submissions locally and exposes them in admin. |
| `/onboarding/creator` | working | Saves creator onboarding submissions locally and exposes them in admin. |
| `/onboarding/host` | working | Saves host onboarding submissions locally and exposes them in admin. |
| `/admin` | working | Shows static investor-grade ops modules plus live local orders, cart units, onboarding submissions, and escrow totals. |
| `/super-admin` | working | Shows root control content plus ecosystem-wide totals from the same local demo store. |
| `/naijashop` | working | Filtered local marketplace inventory with working listing cards. |
| `/naijaeats` | working | Filtered local food inventory with working listing cards. |
| `/naijagigs` | working | Filtered local services inventory with working listing cards. |
| `/naijastay` | working | Filtered local stays inventory with working listing cards. |
| `/naijadrive` | working | Filtered local ride inventory with working listing cards. |
| `/naijasend` | working | Filtered local logistics inventory with working listing cards. |
| `/naijastream` | working | Filtered local creator inventory with working listing cards. |
| `/aura-ai` | partially working | Support/Aura panels are structured and navigable; real AI calls are backend-required. |
| `/help` | partially working | Support guidance and Aura-ready prompts exist; no live ticket API yet. |
| `/returns` | partially working | Return/refund evidence model is represented; no real dispute workflow API yet. |
| `/safety` | partially working | Risk UI is represented; no real fraud scoring service yet. |
| `/shipping` | partially working | Tracking/proof concepts are represented; scanner and courier APIs are pending. |
| `/business/[vertical]` | partially working | Seller OS pages are detailed and route-safe; forms and live metrics belong in future business console API. |

## Working Local MVP Loops

- Search filters the typed demo catalog by query, category, and vertical.
- Category cards navigate into filtered search results.
- Product detail uses dynamic IDs and shared catalog data.
- Add to cart works from listing cards and product detail.
- Cart quantities, removal, totals, and checkout navigation work.
- Checkout creates local orders, wallet transactions, escrow holds, and tracking routes.
- Orders, wallet, admin, and super admin read from the same local store.
- Account demo sign-in/profile state persists locally.
- Vendor, driver, restaurant, creator, and host onboarding submissions persist locally.
- Tracking displays order-specific timelines and QR/barcode verification structure.
- Mobile menu, bottom nav, language demo button, and primary CTAs navigate or mutate state.

## Remaining Demo-Only Items

- Real authentication, KYC, session cookies, and role permissions.
- Real payment rails, wallet ledger service, escrow release rules, refunds, and payouts.
- Real vendor, restaurant, driver, host, and creator onboarding APIs.
- Real dispatch optimization, ride matching, courier routing, maps, GPS, and scanner integrations.
- Real AI recommendation, fraud scoring, customer support, and monitoring APIs.
- Real disputes, evidence uploads, returns, affiliate/referral, ads marketplace, and promotions workflows.
- Real inventory, restaurant menu, property availability, gig contracts, creator rights, and pricing APIs.

## Backend Integration Notes

The localStorage store is intentionally typed and isolated so it can be replaced by API-backed services. The next production step is to connect the existing `lib/services/*` placeholders to a real backend and gradually swap local mutations for API calls with optimistic UI and server validation.
