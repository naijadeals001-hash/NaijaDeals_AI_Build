# REA module research map

Plan of record for reference-driven journeys. Each row is researched one customer journey at a
time with REA; observations are recorded, then NaijaDeals implements its **own** journey and proves
it in the browser. Landing-page availability stays separate from "transaction completed".

| Module and route | Coverage shown | Reference products | What we reverse engineer | Status |
| --- | --- | --- | --- | --- |
| NaijaShop `/naijashop` | Live storefront | Jumia Nigeria, Amazon Marketplace, Jiji | Two journeys: escrow **Buy** vs **Contact seller**; search, compare, variant, delivery, pay, track, return | Not started (research) |
| NaijaDrive `/naijadrive` | Live booking page | Uber, Bolt | Landmark/pin pickup, saved places, classes and fares, request, assignment, expiry, tracking, receipt; driver accept→complete | Partial: booking, assignment expiry, driver accept; saved places exist |
| NaijaEats `/naijaeats` | Landing; ordering gated | Chowdeck, Uber Eats, Bolt Food | Location/craving discovery, menus, options, fees, kitchen acceptance, courier pickup, delivery | Not started |
| NaijaFresh `/naijafresh` | Landing; ordering gated | Instacart, Glovo, local market services | Ingredient search, units (bunch/kg/tuber/crate), basket, substitutions, slots, missing-item refunds | Not started |
| NaijaSend `/naijasend` | Landing; courier workflow live | DHL, Kobo360, GIG Logistics, bus cargo | Quote → book → track freight across **truck**, **air** and **bus terminal** paths; waybill, handoffs, milestones, POD | **Started (quote intake + operator queue)** |
| NaijaGigs `/naijagigs` | Landing; booking gated | Taskrabbit, Upwork, Fiverr | Defined-service booking vs job brief with quotes; samples, scope, scheduling, milestones, disputes | Not started |
| NaijaStay `/naijastay` | Landing; booking gated | Airbnb, Booking.com, PropertyPro | Destination/dates/guests, map+list, galleries, amenities, availability, total price, cancellation, check-in; power/water/security; **Book** vs **Contact agent** | Not started |
| NaijaStream `/naijastream` | Landing; playback gated | Spotify, Audiomack, Boomplay, Apple Music | Listener: discovery→queue→saved; artist: upload→published release | Not started |
| Aura AI `/aura-ai` | Landing; assistant gated | ChatGPT, Google Maps, own workflows | Clarify, choose, remember task context, hand off to a real action with confirmation (e.g. Abuja shortlet + airport ride) | Not started |
| NaijaPay `/naijapay` → `/wallet` | Overview cards → wallet | OPay, PalmPay, Paystack, Flutterwave | Where the money is: available / held / pending / paid out; purchase → escrow → release → settlement → refund | Partial: ledger + escrow + refunds exist; status vocabulary to align |

Shared experiences:

- **Homepage and app shell** — Uber/Bolt public homes: multi-service presentation, one clear action
  per service, retained location, mobile task switching. Apply: Book a ride, Order food, Shop
  groceries, Ship freight, Book a stay.
- **Admin Control Center** — operator queues per module (e.g. freight quote → shipment record →
  carrier assignment → milestone visible to sender). Super Admin: permissions + ecosystem config,
  server-enforced.

## Journey 1 — NaijaSend freight quote (2026-11-03)

REA capture (`rea-cdp-browser` v2, Chrome 156, `https://giglogistics.com/` and
`/shipping-price-calculator/`):

- Entry points observed: **Track Shipment / Track Now**, **Shipping Price Calculator**, product
  families (GoFaster, Last-Mile, E-commerce, Haulage, Mailroom, Warehousing, Express Drop-Off,
  Export, Import), international lanes (Canada/China/Ghana/UK/US → Nigeria).
- Calculator factors observed: **Delivery Distance**, **Package Weight**, **Selected Shipping
  Plan**, **Preferred Shipping Mode**; Domestic mode; **Calculate** / **Reset**.
- Limitations: accessibility names only (DOM/text policy-filtered), no price, SLA or availability
  facts captured; no competitor dispatch logic observed.

NaijaDeals implementation (first slice):

- `FreightRequest` model + migration; validated intake API `POST /api/send/freight` with service
  type **bus / air / truck / last_mile**, origin, destination, commodity, weight, dimensions,
  pickup flag and notes; audited `freight.requested`.
- `/naijasend` now has a **Freight quote** form and the signed-in customer's request history; an
  operator queue is exposed at `GET /api/admin/freight`.
- Verified end to end: quote **NFS-20261103-BF20** (Lagos → Abuja, 120 kg, bus cargo) created from
  the browser, appeared in the customer table and in the operator queue, axe 0.
- Operator journey completed (2026-11-03): **Quote** (amount + carrier) → **Assign carrier** → **In transit** →
  **Delivered**, each recorded as a `FreightEvent` milestone with an audited `freight.status_changed` row.
  The Control Center gained a **Freight** tab in the NaijaSend admin workspace; the sender sees a
  **Shipment milestones** timeline on `/naijasend`.
- Verified end to end: truck request Lagos → Kano (800 kg, solar panels) quoted at ₦450,000 with
  "Kobo360 Haulage", assigned, moved in transit and delivered; customer API returned 4 events and
  the timeline rendered; operator queue showed both requests; axe 0.
