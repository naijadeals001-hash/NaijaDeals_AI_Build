# Serious Rebuild Plan for NaijaDeals.com

Date: 2026-06-05

This document is intentionally blunt. The current application should not be described as rollout-ready, production-ready, or a true functional marketplace. It is a visual prototype with light local interactions. NaijaDeals.com needs a serious product rebuild with real systems, real data flows, real backend services, and real operational tooling.

## 1. What Is Wrong With The Current App

The current app is too shallow for the ambition of NaijaDeals. It has the surface area of a super-app but not the operational depth of one. It presents many routes, verticals, dashboards, and flows, but most of them are not backed by real business logic, backend persistence, permissions, financial rules, inventory state, dispatch logic, seller workflows, or support operations.

Core problems:

- It tries to cover too many verticals at once without implementing any vertical deeply enough.
- The cart, checkout, wallet, orders, and admin features use browser-local demo state instead of real application state.
- Search only filters a tiny static demo catalog, so it does not behave like a marketplace search system.
- Product detail pages do not support variants, inventory, seller offers, delivery options, reviews, questions, returns, or fraud checks.
- Checkout does not validate addresses, stock, seller availability, payment authorization, escrow rules, delivery pricing, or order splitting.
- Wallet and escrow are only visual/local records, not a real ledger with double-entry accounting or payment reconciliation.
- Admin dashboards look busy but do not control real entities or workflows.
- Vendor, restaurant, driver, host, and creator onboarding forms do not perform real identity, compliance, document, payout, or approval workflows.
- Ride, delivery, food, stay, gig, and creator flows are represented as static pages rather than working vertical-specific products.
- AI is only copy and placeholder panels. It does not reason over data, call tools, handle support, rank listings, or detect risk.
- There is no real backend, database, authorization model, event system, payment provider, escrow service, dispatch engine, or audit trail.
- The current route structure is broad but not domain-driven enough for a real super ecosystem.

## 2. Why It Feels Fake Or Non-Functional

It feels fake because the app mostly demonstrates intent instead of capability. A real marketplace creates, validates, stores, reconciles, and operates transactions. The current app mostly displays cards and lets the browser remember a few local actions.

Specific reasons it feels toy-like:

- Demo data is too small, repetitive, and static.
- Buttons often create local effects but not credible business outcomes.
- Admin metrics are not derived from real order, user, vendor, payment, dispute, or dispatch systems.
- There are no realistic edge cases: failed payments, unavailable items, seller cancellations, refund windows, rider reassignment, driver no-show, restaurant prep delays, fraud holds, KYC failure, wallet limits, or dispute evidence review.
- The UI does not yet support the density required for Amazon-style shopping, Uber-style dispatch, or fintech-grade wallet operations.
- There is no separation between buyer, seller, driver, restaurant, admin, and super admin roles.
- There is no real concept of lifecycle: draft, pending, confirmed, paid, escrowed, assigned, picked up, delivered, completed, disputed, refunded, settled.
- The app claims more than it proves.

## 3. What Must Be Rebuilt From Scratch

The following must be rebuilt rather than patched:

- Marketplace catalog architecture.
- Search and filtering system.
- Cart and checkout domain logic.
- Order management lifecycle.
- Wallet and escrow ledger.
- Payment integration layer.
- Vendor/seller operating system.
- Restaurant ordering flow.
- Ride booking and driver dispatch flow.
- Courier/package delivery workflow.
- Gig booking and milestone escrow workflow.
- Stay booking and host/property workflow.
- Auth, roles, permissions, and session handling.
- Admin and super admin control centers.
- Dispute, refund, payout, review, and risk systems.
- AI assistant as a tool-using service connected to real platform data.

Some visual design patterns can be reused, but the product architecture must be rebuilt around real entities, state machines, APIs, and role-specific workflows.

## 4. Real MVP Scope For NaijaDeals.com

The real MVP should be narrower and deeper. Build one strong commerce foundation and two or three verticals that share common infrastructure.

Recommended MVP verticals:

1. NaijaShop: marketplace products.
2. NaijaEats: restaurant ordering.
3. NaijaSend: package delivery.
4. NaijaPay: wallet, escrow, refunds, payouts.
5. Admin: operations, disputes, vendors, users, orders, payments.
6. Aura AI: support assistant and marketplace concierge, initially limited to search/help/order support.

Defer or reduce scope:

- NaijaDrive should be a booking/request prototype until dispatch infrastructure is ready.
- NaijaGigs should be limited to service request and escrow milestone pilot.
- NaijaStay should be limited to inquiry/booking request pilot.
- NaijaStream should be deferred unless creator monetization is a strategic priority.

MVP must truly support:

- Real user accounts.
- Real vendor accounts.
- Real product catalog.
- Real cart.
- Real checkout.
- Real payment authorization.
- Real escrow hold records.
- Real orders.
- Real restaurant orders.
- Real delivery requests.
- Real admin management.
- Real dispute/refund flow.
- Real database persistence.

## 5. Proper Architecture

### Frontend

- Next.js App Router with TypeScript.
- Tailwind CSS plus a formal design system.
- Route groups by audience:
  - buyer app
  - vendor portal
  - driver/courier portal
  - restaurant portal
  - admin portal
  - super admin portal
- Server Components for data loading where appropriate.
- Client Components only for interactive UI.
- Form validation with shared schemas.
- API mutations with optimistic updates only where safe.
- Role-aware navigation.
- Proper loading, empty, error, pending, success, and failure states.

### Backend

Recommended approach:

- Node.js/NestJS or Next.js API route layer for MVP, with a clear path to separate services later.
- Domain modules:
  - auth
  - users
  - vendors
  - catalog
  - cart
  - checkout
  - orders
  - payments
  - wallet
  - escrow
  - restaurants
  - delivery
  - rides
  - gigs
  - stays
  - disputes
  - reviews
  - admin
  - AI assistant
- Background jobs for payment reconciliation, payout settlement, order expiry, dispute deadlines, dispatch assignment, notifications, and fraud review.
- Event-driven audit trail for important actions.

### Database

- PostgreSQL as primary database.
- Prisma or Drizzle ORM.
- Redis for sessions, queues, rate limits, temporary dispatch state, and cache.
- Object storage for images, documents, dispute evidence, KYC files, and receipts.
- Search index: Meilisearch, Typesense, OpenSearch, or Algolia.

### Auth

- Email/phone/password plus OTP.
- Role-based access control:
  - buyer
  - vendor
  - restaurant
  - courier
  - driver
  - host
  - creator
  - support agent
  - admin
  - super admin
- KYC status per account.
- Session management.
- Device/session audit.
- Admin permission matrix.

### Wallet And Escrow

- Double-entry wallet ledger.
- Separate available balance, pending balance, escrow balance, payout balance, refund balance.
- Escrow state machine:
  - created
  - funded
  - held
  - proof pending
  - release approved
  - released
  - disputed
  - refunded
  - partially refunded
- Immutable ledger entries.
- Reconciliation records against payment provider events.
- Admin override with audit trail.

### Payments

- Payment provider integration such as Paystack, Flutterwave, or Stripe where applicable.
- Bank transfer, card, USSD, wallet, and possibly cash-on-delivery policy.
- Webhook handling.
- Payment intent records.
- Refund records.
- Payout records.
- Settlement reconciliation.
- Fraud and velocity checks.

### Admin

- Real operational dashboard derived from database records.
- User management.
- Vendor approvals.
- Restaurant approvals.
- Driver/courier approvals.
- Order management.
- Delivery monitoring.
- Payment and escrow monitoring.
- Dispute management.
- Refund and payout approval.
- Risk alerts.
- Audit logs.
- Feature flags.
- System settings.

### Vendor System

- Vendor registration and KYC.
- Store profile.
- Product listing management.
- Inventory.
- Pricing.
- Shipping settings.
- Orders.
- Escrow and payout visibility.
- Reviews and ratings.
- Promotions.
- Support/dispute responses.

### Delivery/Ride Dispatch

- Delivery zone model.
- Rider/driver availability.
- Pricing rules.
- Assignment state.
- Manual reassignment.
- Pickup and dropoff proof.
- GPS/map integration.
- Status timeline.
- Failure handling.
- Driver/courier wallet payout.

### AI Assistant

Aura AI should start as a constrained assistant, not a vague chatbot.

Initial capabilities:

- Search and recommendation helper.
- Order status helper.
- Refund/dispute intake assistant.
- Seller support helper.
- Admin risk explanation assistant.

Architecture:

- Tool-calling assistant with strict permissions.
- Access to user/order/catalog/support data only through backend APIs.
- Conversation logs.
- Safety filters.
- Human handoff.
- Audit trail for AI-suggested actions.

## 6. Data Models Needed

Core models:

- User
- UserProfile
- Role
- Permission
- Session
- Address
- Vendor
- VendorKyc
- VendorStore
- Product
- ProductVariant
- ProductImage
- ProductCategory
- Inventory
- Price
- Cart
- CartItem
- Order
- OrderItem
- OrderStatusEvent
- CheckoutSession
- PaymentIntent
- PaymentTransaction
- WalletAccount
- WalletLedgerEntry
- EscrowHold
- Refund
- Payout
- Review
- Dispute
- DisputeEvidence
- SupportTicket
- Notification
- AuditLog

NaijaEats models:

- Restaurant
- RestaurantMenu
- MenuItem
- MenuItemOption
- KitchenSchedule
- FoodOrder
- FoodPrepStatus

NaijaSend models:

- DeliveryRequest
- Package
- DeliveryQuote
- CourierProfile
- DeliveryAssignment
- PickupProof
- DeliveryProof
- RouteEvent

NaijaDrive models:

- DriverProfile
- Vehicle
- RideRequest
- RideQuote
- RideAssignment
- RideStatusEvent
- DriverPayout

NaijaGigs models:

- ServiceProvider
- ServiceListing
- GigBooking
- GigMilestone
- MilestoneEvidence

NaijaStay models:

- HostProfile
- Property
- PropertyAvailability
- StayBooking
- GuestVerification

AI/admin models:

- AiConversation
- AiMessage
- AiToolCall
- RiskSignal
- RiskReview
- AdminAction
- FeatureFlag
- SystemSetting

## 7. Real User Flows

### Buyer Shopping

1. Buyer signs in or continues as guest.
2. Buyer searches catalog.
3. Buyer filters by category, vendor, price, location, rating, delivery option, escrow eligibility.
4. Buyer opens product detail.
5. Buyer selects variant and quantity.
6. System checks inventory and delivery eligibility.
7. Buyer adds item to cart.
8. Buyer checks out.
9. Payment is authorized.
10. Escrow hold is created where required.
11. Vendor receives order.
12. Delivery is assigned.
13. Buyer tracks status.
14. Delivery proof completes order.
15. Escrow releases to vendor.
16. Buyer can review, return, or dispute.

### Restaurant Order

1. Buyer searches restaurants or meals.
2. Buyer sees prep time, delivery fee, restaurant status, and ratings.
3. Buyer customizes menu items.
4. Checkout validates restaurant hours and kitchen capacity.
5. Payment is authorized.
6. Restaurant accepts or rejects within SLA.
7. Rider is assigned.
8. Kitchen prep status updates.
9. Rider picks up meal.
10. Buyer tracks delivery.
11. Delivery proof completes order.
12. Restaurant/rider settlement is queued.

### Ride Booking

1. Rider enters pickup and destination.
2. System estimates fare and route risk.
3. Rider confirms payment method.
4. Driver matching starts.
5. Driver accepts.
6. Rider tracks arrival.
7. Trip starts.
8. Trip completes.
9. Payment settles.
10. Rating and support windows open.

### Package Delivery

1. Sender enters pickup/dropoff, package type, weight, value, and urgency.
2. System quotes price.
3. Sender pays or funds wallet.
4. Courier is assigned.
5. Pickup QR is scanned.
6. Route events update.
7. Delivery barcode is confirmed.
8. Proof is stored.
9. Courier payout is queued.

### Gig Booking

1. Buyer searches service providers.
2. Buyer reviews portfolio, ratings, pricing, and availability.
3. Buyer selects gig package or requests quote.
4. Provider accepts.
5. Buyer funds milestone escrow.
6. Provider submits milestone evidence.
7. Buyer approves or disputes.
8. Escrow releases by milestone.

### Stay Booking

1. Guest searches by location, dates, price, safety, power, internet, and host rating.
2. Guest opens property detail.
3. System checks availability.
4. Guest pays booking deposit or full amount.
5. Host confirms.
6. Guest receives access instructions.
7. Check-in proof occurs.
8. Stay completes.
9. Host payout is queued.
10. Review/dispute window opens.

### Vendor Onboarding

1. Vendor creates account.
2. Vendor submits identity and business details.
3. Vendor uploads documents.
4. Vendor sets payout account.
5. Admin reviews KYC.
6. Vendor creates store.
7. Vendor lists products.
8. Products go through moderation.
9. Vendor receives orders.
10. Vendor tracks payouts, disputes, and reviews.

### Driver Onboarding

1. Driver creates account.
2. Driver submits identity, license, vehicle, bank/payout details.
3. Admin verifies.
4. Driver completes training.
5. Driver sets availability.
6. Driver accepts missions.
7. Driver receives payouts.

### Wallet/Escrow

1. User funds wallet or starts payment.
2. Payment provider confirms transaction via webhook.
3. Ledger credits wallet.
4. Checkout debits available balance.
5. Escrow hold is created.
6. Order lifecycle determines release/refund/dispute.
7. Ledger records every movement.
8. Reconciliation checks provider settlement.

### Admin Dispute Handling

1. Buyer opens dispute.
2. System freezes escrow release.
3. Buyer uploads evidence.
4. Seller/driver/restaurant responds.
5. Admin reviews timeline, proof, payment, and policy.
6. Admin decides refund, partial refund, release, or escalation.
7. Ledger records outcome.
8. Notifications are sent.
9. Audit log stores admin action.

## 8. Pages And Components That Must Be Rebuilt

Rebuild:

- Home page into real marketplace entry, not investor narrative.
- Universal search.
- Category browse.
- Product listing grid/list.
- Product detail.
- Cart.
- Checkout.
- Orders.
- Tracking.
- Wallet.
- Account/profile.
- Vendor portal.
- Vendor onboarding.
- Vendor product editor.
- Restaurant page.
- Menu ordering.
- Delivery booking.
- Ride booking.
- Gig booking.
- Stay booking.
- Admin dashboard.
- Admin entity tables.
- Admin detail drawers.
- Dispute management.
- Escrow management.
- Payout management.
- Risk review.
- AI assistant chat and handoff.

Reusable components needed:

- App shell.
- Role-aware navigation.
- Search bar.
- Filter drawer.
- Listing card.
- Product media gallery.
- Price/offer block.
- Cart line item.
- Checkout stepper.
- Address form.
- Payment method selector.
- Order timeline.
- Status badge.
- Wallet balance card.
- Ledger table.
- Admin data table.
- Entity detail panel.
- Evidence uploader.
- Review form.
- Support chat panel.
- Empty/error/loading states.

## 9. Backend APIs Required

Auth:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `POST /api/auth/otp/send`
- `POST /api/auth/otp/verify`

Catalog:

- `GET /api/categories`
- `GET /api/products`
- `GET /api/products/:id`
- `POST /api/vendor/products`
- `PATCH /api/vendor/products/:id`
- `PATCH /api/vendor/inventory/:id`

Cart/checkout/orders:

- `GET /api/cart`
- `POST /api/cart/items`
- `PATCH /api/cart/items/:id`
- `DELETE /api/cart/items/:id`
- `POST /api/checkout`
- `GET /api/orders`
- `GET /api/orders/:id`
- `PATCH /api/orders/:id/status`

Payments/wallet/escrow:

- `POST /api/payments/intent`
- `POST /api/payments/webhook`
- `GET /api/wallet`
- `GET /api/wallet/ledger`
- `POST /api/wallet/top-up`
- `GET /api/escrow`
- `POST /api/escrow/:id/release`
- `POST /api/escrow/:id/refund`

Restaurants:

- `GET /api/restaurants`
- `GET /api/restaurants/:id`
- `GET /api/restaurants/:id/menu`
- `POST /api/food-orders`
- `PATCH /api/restaurant/orders/:id/status`

Delivery/rides:

- `POST /api/delivery/quote`
- `POST /api/delivery/requests`
- `PATCH /api/delivery/:id/status`
- `POST /api/rides/quote`
- `POST /api/rides/requests`
- `PATCH /api/rides/:id/status`

Onboarding:

- `POST /api/onboarding/vendor`
- `POST /api/onboarding/restaurant`
- `POST /api/onboarding/driver`
- `POST /api/onboarding/courier`
- `POST /api/onboarding/host`
- `POST /api/onboarding/creator`
- `PATCH /api/admin/onboarding/:id/status`

Admin:

- `GET /api/admin/metrics`
- `GET /api/admin/users`
- `GET /api/admin/vendors`
- `GET /api/admin/orders`
- `GET /api/admin/payments`
- `GET /api/admin/escrow`
- `GET /api/admin/disputes`
- `PATCH /api/admin/disputes/:id`
- `GET /api/admin/risk-alerts`
- `PATCH /api/admin/risk-alerts/:id`
- `GET /api/admin/audit-logs`

AI:

- `POST /api/ai/chat`
- `POST /api/ai/search-assist`
- `POST /api/ai/support-intake`
- `POST /api/ai/admin-risk-summary`

## 10. What Can Be Kept From Stitch Designs

Keep:

- African/Nigerian visual direction.
- Marketplace card patterns.
- Mobile-first app shell ideas.
- Vertical identity concepts.
- Wallet/escrow visual language.
- Admin dashboard visual density ideas.
- Tracking timeline concept.
- QR/barcode proof visual concept.
- Aura AI support/concierge positioning.
- Trust badges and verification patterns.
- Seller/driver/restaurant onboarding visual inspiration.

The Stitch work should be treated as visual and UX inspiration, not as final product architecture.

## 11. What Must Be Thrown Away

Throw away:

- Claims that the current app is production-ready.
- Static fake metrics.
- LocalStorage as the main product state.
- Broad route coverage without real flows.
- Generic “super ecosystem” copy where product functionality is needed.
- Placeholder AI panels with no tool access.
- Admin dashboards that do not control real records.
- Wallet/escrow displays that are not backed by a ledger.
- Checkout flows that do not validate stock, address, payment, and fulfillment.
- Business onboarding that does not include documents, review, status, and admin approval.

## 12. 30-Day Build Plan

### Week 1: Product Foundation

- Freeze MVP scope to NaijaShop, NaijaEats, NaijaSend, NaijaPay, Admin, and limited Aura.
- Define domain models and database schema.
- Build auth/session system.
- Build role model.
- Build design system foundation.
- Create backend service skeleton.
- Create database migrations.
- Build real catalog seed data.

### Week 2: Marketplace And Checkout

- Build real product/category/search pages.
- Build vendor store and product management.
- Build cart and checkout.
- Integrate payment provider sandbox.
- Create order records.
- Create wallet ledger records.
- Create escrow hold records.
- Build order tracking timeline.

### Week 3: Restaurants, Delivery, Admin

- Build restaurant/menu model.
- Build food order flow.
- Build delivery quote/request flow.
- Build courier assignment mock/manual dispatch.
- Build admin dashboard with real database metrics.
- Build admin users/vendors/orders/payments/escrow tables.
- Build onboarding approval workflow.

### Week 4: Disputes, QA, Demo Hardening

- Build dispute/refund flow.
- Build evidence upload.
- Build payout queue.
- Add audit logs.
- Add Aura support intake for orders/refunds/search.
- Add end-to-end tests for buyer, vendor, restaurant, delivery, wallet, admin.
- Run security review.
- Run payment webhook tests.
- Prepare investor demo with real sandbox transactions and persisted data.

## 13. 90-Day Production Roadmap

### Days 1-30: Real MVP

- Working NaijaShop, NaijaEats, NaijaSend, NaijaPay, Admin.
- Real auth.
- Real database.
- Payment sandbox.
- Wallet ledger.
- Escrow holds.
- Admin operations.
- Disputes/refunds.
- Limited Aura support assistant.

### Days 31-60: Operational Beta

- Production payment provider approval.
- KYC workflow.
- Vendor payout workflow.
- Courier/driver mobile-ready workflow.
- Restaurant operations dashboard.
- Better search index.
- Reviews and ratings.
- Fraud/risk rules.
- Notifications via email/SMS/WhatsApp.
- Admin audit logs.
- Load testing.
- Security hardening.

### Days 61-90: Controlled Launch

- Launch with limited geography and selected vendors/restaurants/couriers.
- Monitor real orders and payment reconciliation.
- Add manual operations console for support team.
- Improve route assignment.
- Add wallet limits and compliance controls.
- Add production incident dashboard.
- Add seller growth analytics.
- Expand product catalog.
- Prepare NaijaDrive, NaijaGigs, and NaijaStay pilots only after core marketplace/payment/delivery infrastructure is stable.

## Final Honesty

The current app is not a real NaijaDeals product. It is a visual prototype with small local interactions. The serious rebuild should prioritize fewer verticals, deeper functionality, real persistence, payment correctness, escrow correctness, admin control, and operational reliability. NaijaDeals can become a serious African super-app marketplace, but only if the next phase stops adding surface area and starts building the transaction engine underneath.
