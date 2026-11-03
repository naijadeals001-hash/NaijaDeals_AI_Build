# REA — Amazon.com reference for NaijaShop

Date: 2026-11-03. Method: REA connected to the local CDP browser, navigated to
`https://www.amazon.com/`, and inspected the live page (accessibility tree + DOM text). No Amazon
account was used and no purchase, cart or personal data was touched.

## Observed entry point

- URL: `https://www.amazon.com/`; title: "Amazon.com. Spend less. Smile more."
- DOM snapshot: ~3,569 nodes.
- Not signed in; the page personalised "Delivering to Bronx 10470" and showed the public storefront.

## Observed structure

| Region | What Amazon actually rendered |
| --- | --- |
| Utility header | Deliver-to location + **Update location**, "All" departments menu, search field ("Search Amazon"), language/country, Account & Lists, Returns & Orders, Cart |
| Department select | "All Departments" plus categories such as Alexa Skills, Amazon Autos, Amazon Devices, Amazon Fresh, Amazon Global Store, Amazon Haul, Pharmacy, Resale |
| Second nav row | All, Prime, Groceries, Pet Supplies, Home Improvement, Amazon Home, Toys & Games, Gift Cards, Today's Deals, Coupons, Pharmacy, Beauty & Personal Care, Fashion |
| Promo grid | 9 `a-cardui` tiles mixing lifestyle imagery and short merchandising headlines ("Shop winter outerwear under $100", "Holiday decor for every room", device offers) |
| Footer | "Back to top", then link columns: Get to Know Us, Make Money with Us, Amazon Payment Products, Let Us Help You |
| Keyboard | Shortcuts advertised in the accessibility tree: search "/", cart Shift+Alt+C, orders Shift+Alt+O |

## Search-results capture

`https://www.amazon.com/s?k=wireless+earbuds` was also inspected:

- result bar: `1-16 of over 20,000 results for "wireless earbuds"` plus Sort by (Featured, Price low/high, Avg. Customer Review, Newest);
- left refinements: Popular Shopping Ideas (Noise Cancelling, Long Battery, For iPhone, Bass), Eligible for Free Shipping, Delivery Day;
- each result row: square product image on the left, title, stars + rating count (e.g. 4.2 out of 5, 41.3K), price and list price, delivery promise, "Add to cart";
- Amazon mixes a "Results" heading with "Check each product page for other buying options."

The product-detail extraction did not complete (the sampled ASIN returned Page Not Found), so buy-box specifics are **not** claimed as observed.

## Design decisions applied to NaijaShop

1. **Full-bleed storefront** — the ecosystem sidebar is hidden on `/naijashop`, matching Amazon's
   page-wide shell.
2. **Two-row commerce header** — deliver-to location, department select, wide search with a distinct
   amber submit button, account/orders and cart; a category row sits directly below it.
3. **Left department rail + results column** — department counts, sort control and an empty state that
   explains the contract ("only verified seller listings appear").
4. **Promo tiles** — Today's deals / Top rated / New arrivals mirror Amazon's merchandising cards but
   only link to real filtered states.
5. **Footer columns** — "Back to top" plus four link groups using only routes that exist in this build.
6. **No fabricated ratings or review counts.** Amazon shows star ratings and review totals; NaijaShop
   renders them only when a product has real review data, and empty states are explicit.
7. **Amazon-style result rows** — square image left, title, stars ("No ratings yet" when there are no real reviews), price/list price with discount badge, delivery line, seller and stock, then a yellow **Add to cart** button and "View details". The four-column card grid was replaced for results.
8. **Search-results bar** — "Showing 1–12 of N results" with Sort by, a left refinement rail (department counts, price bands, rating, in-stock) and a Back-to-top footer.
9. **Demo catalogue** — when the database has no live listings, labelled sample rows are shown automatically so the storefront's layout can be evaluated; the amber banner states they are not real seller listings.

## Limitations recorded

- Only the public homepage was observed. Search-results, product-detail, cart and checkout pages were
  **not** captured; Amazon requires an account/session for parts of those flows.
- Amazon's layout is personalised and A/B tested; another session may render differently.
- Amazon trademarks, logos and photography were **not** copied; NaijaShop uses its own brand, licensed
  food/product imagery and sample labels.
- The homepage uses a horizontal promo carousel, which was not replicated as an auto-rotating carousel;
  NaijaShop keeps static, keyboard-accessible tiles.

Screenshot evidence: `qa-artifacts/preview/amazon-reference.png` (reference) and
`qa-artifacts/preview/naijashop-after.png` (NaijaShop after the pass).
