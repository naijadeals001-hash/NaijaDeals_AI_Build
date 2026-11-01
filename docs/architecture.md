# NaijaDeals Architecture Overview

## Stack
- **Framework:** Next.js 14 (App Router) with TypeScript
- **UI:** React 18, Tailwind CSS 3, lucide-react icons
- **ORM:** Prisma 6 with PostgreSQL
- **Auth:** Next.js cookies + Prisma session management; RBAC with ActorType (CUSTOMER, VENDOR, COURIER, DRIVER, ADMIN, SYSTEM)
- **State:** Server Components for data fetching, Client Components for interactive UI
- **Design:** Custom color tokens (canvas, ink, muted, surface, primary, primary-live, primary-soft, amber, amber-soft, crimson, crimson-soft, night), Inter/sans-serif and Plus Jakarta Sans/display fonts

## Core Data Model (Prisma Schema)
The schema defines 50+ models across these domains:

### Identity & Access
- `User`, `Role`, `UserRole` - RBAC with 5 actor types
- `Session` - cookie-based sessions with HHO validation

### Commerce
- `Vendor`, `Category`, `Product` (with variants, images, stock)
- `Cart`, `CartItem` - unified cart across all verticals
- `Order`, `OrderStatusEvent`, `OrderItem` - full lifecycle tracking
- `Payment`, `PaymentMethod` - multi-provider (Paystack, Flutterwave, Wallet, Test)
- `EscrowHold`, `EscrowEvent`, `EscrowStatus` - 1% fee protection

### Wallet & Ledger
- `Wallet` (ownerType: CUSTOMER|VENDOR|COURIER|DRIVER|SYSTEM)
- `WalletTransaction`, `LedgerEntry` - double-entry bookkeeping
- `Payout`, `ReturnRequest` - vendor payouts and customer returns

### NaijaDrive (Mobility)
- `Courier`, `DriverProfile`, `Ride`, `RideStatus`, `RideEvent`, `AssignmentDeadline`
- Saved places, fare quotes/breakdowns, ride timelines

### NaijaSend (Logistics)
- `Delivery`, `DeliveryStatus`, `TrackingEvent`, `Courier` assignment workflow

### Social & Reputation
- `Review`, `Dispute`, `DisputeStatus`, `SellerApplication`

### Audit & Administration
- `AdminAction`, `AuditLog`, `SystemEvent`

## Vertical Ecosystem (10 planned services)

| Key | Name | Status | Route | State |
|-----|------|--------|-------|-------|
| shop | NaijaShop | ✅ Live | /naijashop | Product catalog, cart, checkout, escrow |
| eats | NaijaEats | ⚠️ Setup | /naijaeats | Status: "Setup required" |
| fresh | NaijaFresh | ⚠️ Setup | /naijafresh | Route only |
| gigs | NaijaGigs | ⚠️ Setup | /naijagigs | Route only |
| stay | NaijaStay | ⚠️ Setup | /naijastay | Route only |
| drive | NaijaDrive | ✅ Live | /naijadride | Bookings, quotes, driver assignment, tracking |
| send | NaijaSend | ⚠️ Setup | /naijasend | Manual courier workflow UI |
| wallet | NaijaPay | ✅ Live | /wallet | Ledger-backed balance, escrow holds |
| stream | NaijaStream | ⚠️ Setup | /naijastream | Route only |
| aura | Aura AI | ⚠️ Setup | /aura-ai | Route only |

## API Surface
All API routes are proxied through `lib/api-client.ts` (client-side):
- Auth, Products, Categories, Cart, Checkout
- Orders, Payments, Wallet, Account management
- Seller CRUD, Product moderation
- Admin: overview, orders, users, vendors, products, payments, payouts, couriers, rides, audit logs
- Courier: deliveries, status updates
- Drive: quotes, rides, driver actions

## Authentication Flow
1. Login/register via `/api/auth/login` / `/api/auth/register`
2. Session cookie (`nd_session` or env-configured name)
3. Server-side `getSessionUser()` validates tokenHash against Prisma `session` table
4. RBAC checks: `isAdmin()`, `isVendor()`, `isCourier()`, `isDriver()`
5. Role-based navigation: admin → Control Center, vendor → Seller Dashboard, driver → Driver Board, courier → Courier Dashboard

## Payment Flow
1. Add to cart → Checkout (address + payment method selection)
2. Server-side escrow hold (1% fee) before order confirmed
3. On delivery confirmation → Escrow released to vendor
4. Wallet ledger: credit/debit transactions with memo audit trail
5. Payouts: vendor receives net amount (gross - commission) per period

## Key Design Decisions
- **Honest UI:** "Setup required" pages explicitly name missing data; no simulated live data
- **Landmark-based routing:** NaijaDrive uses predefined Lagos locations, no GPS-invented addresses
- **Integer kobo:** All money uses NGN kobo (minor units), no float arithmetic
- **Server-verified:** All payments, orders, tracking events are real DB records
- **One account:** Unified user identity across all verticals via shared `User` model and `ActorType`

## Admin Control Center
Single `/admin` and `/super-admin` entry point (same `AdminDashboard` component):
- RBAC: super-admin, operations, finance, support, moderation, regional staff
- Separate navigation from public flow
- Audit logging on all sensitive actions
- Pagination, filtering, bulk actions on all record lists

## Recovery & Backup
- Git branch: `naijashop-marketplace` with remote `origin/naijashop-marketplace`
- Last commit: `61b066ee` "Increment 5: assignment deadlines, saved places and no invented cancellation fee"
- Stash available for rollback: `git stash list` shows backup state