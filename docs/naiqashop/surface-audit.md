# NaijaShop surface audit (2026-11-12)

Read-only audit at HEAD `e23c99b` plus uncommitted discovery work. Status: working / broken / missing / misleading / unverified.

## Canonical routes
- Storefront `/naijashop` (`components/shop/storefront.tsx`), categories `/naijashop/categories` and `/naijashop/c/[slug]`, search `/naijashop/search?q=`, deals `/naijashop/deals`, bestsellers `/naijashop/bestsellers` (all `components/shop/category-browse.tsx`).
- Product detail `/product/[id]`; basket `/cart`; checkout `/checkout`; orders `/orders`, `/orders/[id]`; tracking `/tracking/[id]`; seller `/seller`; Control Center `/admin` tabs.
- APIs: `/api/products`, `/api/categories`, `/api/cart*`, `/api/checkout`, `/api/payments/*`, `/api/orders*`, `/api/seller/*`, `/api/admin/*`.

## Highest-impact gaps
1. **Courier assignment has no Control Center UI.** Paid orders create a `pending_assignment` delivery; couriers only see rows assigned to them; `adminAssignCourier` exists but no component calls it. Fulfilment dead-ends after `ready_for_pickup`.
2. **Review moderation is API-only.** Reviews are created `PENDING`; only `POST /api/admin/reviews/[id]` can approve; no admin tab, so new reviews never surface.
3. **Non-Nigeria selling is unsafe.** Checkout writes the country currency against NGN catalogue prices with no conversion or country price list; city activation is not enforced at checkout.
4. **Control Center storefront controls are disconnected.** Announcement, hero copy, visible categories, shelf order and demo toggle save but are not consumed; hero slides are supported but not editable.
5. **No public seller profile**, no linkable seller identity, ratings or policy page.
6. **Support and customer disputes are missing** while help copy claims platform support; the `support` role is read-only and cannot resolve returns.
7. **No NaijaShop receipt/invoice**; order detail shows totals but no payment reference, tax or printable receipt.
8. **Returns are whole-order only**, seller-only resolution, no admin returns queue, return window or label.
9. **Seller tooling stops short**: no variant editor, no price edit UI, no draft/review gate, no payout request/history, no staff model.
10. **Discovery gaps**: no suggestions; limited facets; grid “Add to Cart” fails for variant products (`variant_required`); “Today’s deals” has no discount filter.

## Misleading copy
- `/naijashop` header always says “Hello, sign in” even when authenticated.
- `/orders` “Track deliveries” labels the first six orders “Delivered today” regardless of status; “See returns” self-links to `/orders`.
- Storefront admin fields save without visible effect.
- `/naijashop/help` claims platform support that does not exist.

## Roles
`ActorType` has no AGENT. Staff roles are super_admin, admin, ops, finance, support, moderator, affiliate_reviewer. `support` is read-only; `ops` writes orders/deliveries; `finance` writes payouts. There is no support ticket, conversation queue or impersonation capability.
