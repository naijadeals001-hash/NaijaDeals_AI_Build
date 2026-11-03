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
7. **Dense grid** — results use four columns on wide screens, closer to Amazon's search results density.

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
