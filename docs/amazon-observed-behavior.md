# Amazon observed behavior (reference capture)

Purpose: record what the public Amazon.com shopping journey actually did, so NaijaDeals can build an equivalent journey with its own branding, copy, data and visual design. Nothing here is a template to copy: no Amazon text, images, icons or layout files are reused.

## Method and evidence

Captured with REA's supported CLI fallback (`rea capture-browser-scenario`) driving a local Chrome (Chromium 155.0.8059.80), 1440x900, en-US, America/New_York, light scheme, reduced motion, service workers blocked. Each run produced an Evidence object containing sanitized URL, accessibility tree, screenshot hash and per-step status.

| # | Surface | Evidence ID | Steps | Duration |
|---|---------|-------------|-------|----------|
| 1 | Homepage `https://www.amazon.com/` | `ev_ac74042bd5297ac263091309ca0ce83d244e59137f333002742d29b5c1a5f957` | all completed | 5,176 ms |
| 2 | Search `https://www.amazon.com/s?k=wireless+headphones` | `ev_1fcbbc7d76ac1c04367c099563e64523c2fc88dcd62bf776d8a8c26e9de7a22d` | all completed | 4,405 ms |
| 3 | Product page `/dp/B0C3HCD34R` | `ev_8e0f08e123445378720d4472d0a18e38c6143ba71a8c5fee69a07c3bbf0fda49` | all completed | 6,524 ms |
| 4 | Add-to-cart (modal state) | `ev_e773f780e122f9028429f5cf54de633057b3b653af3d702cee396cc8c6cb00f8` | all completed | 11,830 ms |
| 5 | Cart page (empty state) | `ev_dc0fc1d64b498722452f3a25ed9faec62d5409fbe5e83ce48c66c6bf0a44affe` | all completed | 14,088 ms |

Failed attempts are kept as negative evidence, not discarded:

- `ev_c42dc5ee5ccb189b21af4497c5a68f684af5166db5556942e63cc06009b246af` — search aborted because `div[data-component-type="s-search-result"]` matched 16 nodes (strict-mode locator). Fixed in run 2 by waiting on `#search` and settling.
- `ev_35841ecec1f08a2bd8a192466d510c3917282499f7ae3230eb55aaafb3bae6e1` and `ev_21b9f7ef430ca6689b78fad8893f9a82ef678f36a38182a3cc3e533834087ea0` — product page `#productTitle` matched both the visible `span` and a hidden `input`; the second run also timed out, consistent with throttling.
- `ev_4e2acb01505b958434346095c29eb70673f26bc9ca3aa4eafb741fac7e6840e3` — retry during throttling; product page never became visible within 30 s.

Provider limitations that bound every claim below (quoted from the Evidence): event order is receipt order and does not prove causality; network bodies are retained only when selected; Playwright does not expose request initiator stacks; accessibility capture is a semantic tree, not pixels.

## Observed

### 1. Homepage

- Header, in order: Amazon logo link, location control labelled "Delivering to Bronx 10470 Update location", department `<select>` (default "All Departments"), search box, search submit, language/country control, "Hello, sign in Account & Lists", "Returns & Orders", cart link labelled "0 items in cart".
- A horizontal category strip beneath the header, then a separate in-category strip ("All Electronics", "New Arrivals", "Deals", ...) when the department is Electronics.
- Main promotional content exists below the captured header region. The accessibility capture recorded the header and nav reliably; the merchandising grid content was not the focus of this run.
- Cart state is expressed in the header as a count string ("N items in cart"), not a separate badge element.

### 2. Search results

- Results heading states the window and total: "1-16 of over 50,000 results" for this query.
- Sort control offers: Featured, Price: Low to High, Price: High to Low, Avg. Customer Review, Newest Arrivals, Best Sellers.
- Each result card carries: title link, star rating plus review count, a social-proof line ("10K+ bought in past month"), price and any strike-through list price / discount, delivery promise text, and a primary buy action that is either "Add to cart" or "See options" when a variant choice is required.
- Some cards expose colour swatches directly in the results list.
- Left rail filters observed: free shipping, delivery day, brand checkboxes, price (slider with numeric bounds plus preset bands "Up to $20", "$20-$40", "$40-$70", "$70+"), deals, customer review ("4 stars & up").
- Pagination control present below results.
- Search results are server-rendered with a stable `#search` container; individual cards share `div[data-component-type="s-search-result"]`.

### 3. Product page

Above-the-fold buying area, in reading order:

- Breadcrumbs: Electronics > Headphones, Earbuds & Accessories > Headphones & Earbuds > Over-Ear Headphones.
- Media gallery with thumbnails and a video count ("16 VIDEOS").
- H1 product title plus a longer subtitle line.
- Brand link ("Visit the Soundcore Store").
- Rating "4.5 out of 5 stars" with "78,420 Reviews" link, an "Amazon's Choice" badge, a sustainability badge, and "10K+ bought in past month".
- Price block: "$44.99 with 36 percent savings", "List Price: $69.99", a pricing-explanation link, and "FREE Returns".
- Variant selectors are radio groups, not dropdowns: 5 colours, each radio labelled with colour, its own price, discount and stock state; a Style group; a Size line. Selecting a colour therefore can change price and availability.
- Reassurance line: "Customers usually keep this item."
- Short spec list: Brand, Color, Ear Placement, Form Factor, Impedance.
- "About this item" bullet list (7 bullets in this capture).
- Delivery/purchase panel: price, "FREE delivery Monday, November 2", Prime alternative ("Tomorrow, October 29. Order within 8 hrs 53 mins"), location button, "In Stock", a `Quantity` combobox with options 1 through 61, then "Add to cart" and "Buy Now".
- Seller block: Ships from Amazon, Sold by AnkerDirect (linked), Returns "FREE 30-day refund/replacement", Gift options "Available at checkout".
- "Add a protection plan" group with checkboxes: 2-Year $6.99, 3-Year $9.99, Complete Protect $16.99/month.
- "Add to List" link points at sign-in (anonymous visitor cannot save).
- Share control; image thumbnail radiogroup.
- Below the buy box: newer-model notice, "Frequently bought together" group with per-item checkboxes, a summed "Total price" and a single "Add all 3 to Cart" button, then recommendation carousels.

### 4. Add to cart interaction

- Clicking `#add-to-cart-button` did **not** add the item immediately. It opened a modal dialog headed "Add to your order".
- Dialog contents: three benefit bullets (accidental-damage coverage, 24/7 support, easy claims), "Cover this product:" with the same protection-plan checkboxes, "Cover all of your eligible devices:" with Complete Protect, and two actions: "No thanks" and "Add protection".
- The URL stayed on the product page while the dialog was open; the header cart count stayed at "0 items in cart".
- Consequence: add-to-cart is a two-step confirmation whenever protection plans are offered, and a scripted journey must dismiss or accept the dialog before the item reaches the cart.

### 5. Cart page (empty)

- Page heading "All Carts"; a second content region headed "Customers Who Bought Items in Your Recent History Also Bought" with per-card add buttons.
- Empty state: "Your Amazon Cart is empty", with "Shop today's deals", "Sign in to your account" and "Sign up now" links.
- Disclosure paragraph: prices and availability can change, and the cart is a temporary list reflecting each item's most recent price.
- Gift-card/promo note: a claim code is requested at payment time.
- A recently-viewed strip repeats the product just visited with rating, discount, price, delivery promise and an add button.

## Inferred (not directly observed)

- A populated cart renders line items with quantity and remove/save controls, a subtotal, and a proceed-to-checkout action. This is standard Amazon behavior and is strongly implied by the empty-state copy, but no capture in this set shows it.
- Search sort and filter controls change the result set when activated. Only their presence was captured; no post-click state was recorded.
- The header cart count increments after a completed add. Not observed, because the add was never completed.
- Prices, delivery promises and stock differ by location because the header shows a resolved delivery ZIP. Only the Bronx 10470 rendering was captured.

## Unobserved (explicit gaps)

- Populated cart: line items, quantity editing, remove, "Save for later", "Delete", subtotal math, "Proceed to checkout".
- Checkout: address, delivery speed, payment, order review, order confirmation.
- Sign-in, registration, account, order history.
- Search: autocomplete suggestions, zero-results state, pagination clicks, filter interaction, sort interaction.
- Variant switching effects on price/stock; quantity > 1 add.
- Responsive/mobile layouts; dark mode; keyboard-shortcut behavior.
- Session persistence, cart merge after sign-in, and multi-device behavior.
- Any localisation outside en-US/USD/US delivery.

## Design consequences for NaijaDeals (decisions, not observations)

Kept because they are load-bearing for the journey:

1. Header shows location, search, account entry point, and a cart count.
2. Results page shows a result-count window, a sort control, faceted filters, and cards with price, rating, delivery promise and a single primary action.
3. Product page puts price, stock, variant choice, quantity and the primary action in one buy box, with seller/returns/gift facts adjacent.
4. Add to cart gives explicit confirmation and an optional add-on step that can be declined.
5. Cart page must support empty and populated states, quantity changes, removal, and a subtotal.

Deliberately not carried over: Amazon's wording, badge names, category taxonomy, price bands, plan pricing, promotional modules, colour system, typography and DOM structure. NaijaDeals uses its own Naira pricing, Nigerian delivery language, seller model and existing design tokens.

## Verified against NaijaDeals

Two passes against the running app on 2026-10-28:

- **API pass** - scripted HTTP against `http://localhost:3010` with `Origin: http://localhost:3010` and a real cookie session (`nd_session`), covering register, catalogue, cart, quantity, save-for-later, checkout, orders, cancel and the negative cases.
- **UI pass** - the in-app Chromium browser on the same server: real fills, clicks and selects, with console and network inspected on every page.

Seed data at the time: 12 active listings from 4 verified vendors (HP EliteBook 840 G6 and Anker PowerCore among them), prices in Naira. The final seed ships 12 products from 2 verified vendors; this section is a record of the state during that pass.

### Behaviour mapping

| Amazon behaviour (observed or inferred) | NaijaDeals implementation | Test result |
|---|---|---|
| Listing page with price, rating, delivery promise, add action | `/naijashop` and `/`: hero, category chips, cards with stock count, price, compare-at, `Add to cart` / `Choose options` | Pass - 12 cards, 9 one-click adds, 3 variant products routed to detail |
| Search results with result count, facets and sort | `/search?q=` with category, sort (`Newest`, price, seller trust) and empty state | Pass - `q=hp` returned 1 result; `q=zzzznothing` showed "No products matched your filters."; `sort=price-asc` ordered correctly |
| Product buy box: price, stock, variant, quantity, Add to cart, Buy now | `/product/[slug]`: price, stock line, variant `<select>`, quantity `<select>` capped at stock, `Add to cart`, `Buy now`, `Save for later` | Pass - variant switch changed ₦385,000 to ₦310,000 and stock 2 to 3; quantity capped at available |
| Add-to-cart is a two-step modal (protection plans) | One step, then a `role="status"` notice "`<product>` added to your cart. View cart" | Different by design - no protection-plan product exists; single POST 201 |
| Header cart count stays visible during add | Cart icon without a count badge; confirmation is the status notice above | Different - see gaps |
| Empty cart: explanation plus sign-in entry | Signed out: "Sign in to see your cart" with a Sign in button. Signed in, no items: "Your cart is empty. Browse products" | Pass |
| Populated cart: line items, quantity, remove, save for later, subtotal, checkout | `/cart`: variant name, unit price, `-/+`, `Save for later`, `Remove`, subtotal, "Calculated at checkout", escrow 1%, `Proceed to checkout` | Pass |
| Quantity editing | `PATCH /api/cart/items/:id`; 4th unit on a 3-unit variant returned 409 "Only 3 unit(s) available." and kept quantity 3 | Pass |
| Remove item | `DELETE /api/cart/items/:id`; subtotal recalculated from ₦452,000 to ₦310,000 | Pass |
| Save for later | `PATCH ... savedForLater: true`, "Move to cart" restores with `savedForLater: false` | Pass after fix 1 |
| Checkout: address, totals, order number | `/checkout` address form (name, phone, line 1/2, city, state, country, label, save address) then order + payment step | Pass - ND-20261028-D682DD (1 x 16GB, ₦388,850) and ND-20261028-619119 (3 x 8GB, ₦939,300 incl. ₦9,300 escrow) |
| Order history and cancellation | `/orders` lists orders with items, totals, status, `Pay` and `Cancel order` | Pass - cancel released reserved stock (variant reserved back to 0, availability 5) |
| Payment must be server-verified, not client-claimed | `POST /api/payments/initialize` then confirm; zero-balance wallet produced "NaijaPay wallet balance is insufficient for this order." and no order was marked paid | Pass |
| Sign-in required for cart, wallet and checkout | `/register` creates the account and session, `/login` signs in, `/account` shows the profile and saved address; anonymous add-to-cart redirects to `/login`; `/cart` and `/wallet` show sign-in prompts | Pass, with the checkout caveat below |
| Cross-site request protection | `assertSameOrigin` on every mutation | Pass - POST without `Origin` returned 403 `origin_required` |

API status log from the scripted pass: register `201`, `/api/auth/me` `200`, products `200`, add item `201` twice, cart `200`, quantity `200`, save `200`, restore `200`, checkout `201`, post-checkout cart `200` (new empty cart), orders `200`, order detail `200`, empty-cart checkout `400`, missing Origin `403`, quantity 11 `400`, unknown product `404`.

### Defects found and fixed

1. **Saved-for-later items disappeared when the cart was empty.** In `components/commerce/naijashop.tsx` the saved list was rendered inside the "cart has active items" branch, so saving the only cart item removed it from view entirely even though `GET /api/cart` still returned it with `savedForLater: true`. The saved section now renders outside that branch as "Saved for later (n)" with a "Move to cart" action; verified with an empty cart and after restoring the item.
2. **Product page showed a struck-through "list price" lower than the selected price.** `components/functional/product-detail-client.tsx` rendered `compareAtKobo` unconditionally, so the 16GB variant (₦385,000) displayed ₦355,000 struck through as if discounted. The compare-at line now renders only when it exceeds the selected unit price; verified hidden for 16GB and shown (₦355,000) for the ₦310,000 8GB variant.

### Differences from the Amazon capture (intentional or still missing)

- No protection-plan upsell step; adding to cart is one click and one request.
- No persistent cart-count badge in the header (Amazon showed "0 items in cart" throughout the modal). The confirmation notice links to the cart instead.
- Cart "Save for later" supports restore only; saved items cannot be deleted from the saved list.
- `Cancel order` uses a native `confirm()` dialog ("Cancel order ND-...? Reserved stock will be released.") rather than a styled modal.
- ~~Signed-out `/checkout` still renders the address form. Submitting then hits `401` and redirects to `/login`; the cart survives, but the form is filled for nothing.~~ Resolved: `/cart`, `/checkout`, `/orders`, `/wallet`, `/account` and `/tracking/[id]` now redirect to `/login?next=...` server-side before rendering.
- Delivery is free at subtotals of ₦150,000 or more, so the large variant orders resolved to a ₦0 delivery line and a small order (₦38,500) charged the ₦2,000 Lagos Island fee.

### Not verified / limitations

- Real payment capture: the test wallet had a zero balance, so only the insufficient-funds path ran. No provider redirect or webhook callback was exercised.
- Delivery and tracking lifecycle: no courier assignment, pickup, transit or proof-of-delivery run.
- Mobile viewport, keyboard-only navigation and screen-reader announcement quality: the status region and labels exist, but no assistive-technology audit was performed.
- Amazon's populated cart was never captured; the NaijaDeals cart pass covers the behaviours that the Amazon section lists as inferred, not a side-by-side comparison.
- `npm run type-check` now passes across the app and the marketplace test harness. An earlier note that it failed in `scripts/marketplace-tests.ts` is superseded.

### Re-verified on the production build

The same journeys were repeated on the compiled app (`next build`, served by `next start` on `http://localhost:3100`) to confirm the fixes survived compilation.

- Routes: `/`, `/naijashop`, `/cart`, `/login`, `/register`, `/search`, `/orders`, `/wallet`, `/account`, `/product/hp-elitebook-840-g6` and `/api/products` all returned `200`.
- API journey: register `201`, `/api/auth/me` `200`, products `200`, add item `201`, cart `200`, quantity `200`, save `200`, restore `200`, checkout `201` (order `ND-20261028-D3EB58`, ₦38,500 + ₦2,000 delivery + ₦385 escrow = ₦40,885), orders `200`, order detail `200`, empty-cart checkout `400`, missing Origin `403`, quantity 11 `400`, unknown product `404`.
- Fix 1 on the build: with the only item saved, `/cart` showed "0 line item(s)", "Your cart is empty." and "Saved for later (1)" with a working "Move to cart".
- Fix 2 on the build: default 16GB variant (₦385,000) rendered no compare-at line; switching to the 8GB variant (₦310,000) rendered ₦355,000 struck through.
- UI checkout on the build: order `ND-20261028-CFF6B0` (₦40,885) reached Payment Pending; "Pay from wallet" produced `POST /api/payments/initialize` `201`, `POST /api/payments/confirm` `402` and the on-screen alert "NaijaPay wallet balance is insufficient for this order."; `/orders` listed the order with `Pay ₦40,885` and `Cancel order`.
- The production build marks `nd_session` as `Secure`. The in-app browser stores it over `http://localhost` because localhost is a secure context, but a deployed instance must be served over HTTPS or sessions will not persist. One earlier sign-out during this pass was traced to a concurrent reseed deleting the session row, not to the cookie.


## Final status update (supersedes earlier details)

The passes above were recorded while the marketplace was being built. The shipped state is
recorded in `docs/marketplace-verification.md`, which is authoritative. Changes since:

- Authenticated pages (`/cart`, `/checkout`, `/orders`, `/wallet`, `/account`,
  `/tracking/[id]`) now redirect anonymous visitors to `/login?next=...` server-side
  instead of rendering a client-side gate and firing `401` API calls.
- The marketplace suite runs 13/13 scenarios and covers payments, escrow, refunds,
  concurrency, delivery retries and RBAC. `npm run type-check` passes.
- Visual QA now signs in per role and checks 99 page/viewport combinations, including the
  seller, courier and admin dashboards and the anonymous redirect behaviour.
- The seeded wallet fixture is backed by a balanced ledger transaction labelled as local
  test funding. Escrow figures on the wallet page are derived from active holds.
- The seed ships 12 products from 2 verified vendors and creates no orders, payments,
  reviews or revenue.
- Order IDs quoted above belong to earlier local databases and no longer exist after
  reseeding. They are evidence of past runs, not current data.
