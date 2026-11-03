# Module capability matrix (code-verified, 2026-11-03)

Status vocabulary is the playbook's: **PASS / PARTIAL / BLOCKED / NOT STARTED**. No module is
PASS — none has the full runtime acceptance evidence the playbook requires.

| Module | Customer routes | APIs | Data models | UI | Tests | Status |
| --- | --- | --- | --- | --- | --- | --- |
| NaijaShop | `/naijashop`, `/products`, `/product/[id]`, `/cart`, `/checkout`, `/orders`, `/seller` | `products`, `categories`, `cart`, `checkout`, `orders*`, `reviews`, `seller/*` | Product, Variant, InventoryStock, Cart, Order, OrderItem, Payment, EscrowHold, ReturnRequest | `naijashop.tsx` (1,328 L), product detail, seller dashboard | `test:marketplace` | **PARTIAL** — catalog/cart/checkout/orders/seller exist; live payment provider unconfigured; acceptance run not repeated in this audit |
| NaijaDrive | `/naijadrive`, `/driver` | `drive/quote`, `drive/rides*`, `drive/driver/rides*`, `drive/places` | Ride, RideEvent, SavedPlace, DriverProfile | `drive-page.tsx` (964 L), `drive-map.tsx`, `driver-dashboard.tsx` (471 L) | `test:drive` | **PARTIAL** — booking/quote/dispatch/cancel implemented; no live GPS/map telemetry; live dispatch not claimed |
| NaijaSend | `/naijasend` (status), `/courier`, `/tracking/[id]` | `deliveries`, `deliveries/:id/status`, `courier/deliveries*` | Delivery, TrackingEvent, Courier | `courier-dashboard.tsx` | none dedicated | **PARTIAL** — parcel booking is a status page; courier workflow serves marketplace deliveries only |
| NaijaPay | `/wallet` | `wallet`, `wallet/ledger`, `payments/*` | Wallet, WalletTransaction, LedgerEntry, EscrowHold, Payout | `NaijaPayPage` in `naijashop.tsx` | none dedicated | **PARTIAL** — balances/ledger/holds read; no customer deposit/withdraw UI; payout is admin-only |
| NaijaEats | `/naijaeats` | none | none (no restaurant/menu models) | status card only | none | **NOT STARTED** — ordering explicitly disabled in UI |
| NaijaFresh | none (`/[slug]` generic) | none | none | GenericPage | none | **NOT STARTED** |
| NaijaGigs | none (`/[slug]` generic) | none | none | GenericPage | none | **NOT STARTED** |
| NaijaStay | none (`/[slug]` generic) | none | none | GenericPage | none | **NOT STARTED** |
| NaijaStream | none (`/[slug]` generic) | none | none | GenericPage | none | **NOT STARTED** |
| Aura AI | none (`/[slug]` generic) | none | none | GenericPage | none | **NOT STARTED** — `DEEPSEEK_API_KEY` is present in `.env` but no server route calls it |
| NaijaProperty | none | none | none | none | none | **NOT STARTED** (only mentioned in the playbook) |
| Control Center | `/admin`, `/super-admin` | `admin/*`, `super-admin/*` | AdminAction, AuditLog, SystemEvent | 15 admin components incl. map/charts/quick actions | `test:admin-security`, `.qa` browser run | **PARTIAL** — see admin audit |

## Cross-cutting gaps by module

- **NaijaShop:** provider credentials (Paystack/Flutterwave) absent; multi-vendor settlement and
  returns exist only at admin/seller level; no evidence of oversell-race or duplicate-checkout
  tests in this audit.
- **NaijaDrive:** assignment sweeper is an in-process timer (`startDriveSweeper`), not a durable
  worker; the playbook requires release without UI reads, which needs runtime proof.
- **NaijaSend:** no parcel quote model (size/weight restrictions) and no proof-of-delivery upload;
  tracking exists as recorded events.
- **NaijaPay:** ledger display is read-only for customers; no deposit/withdraw endpoints.
- **All "setup" verticals:** the homepage card links to a generic page, not a module. This is
  honest, but it also means the ecosystem grid advertises nine modules of which five are static.

## Module imagery

17 module image references in `lib/data/ecosystem.ts`; **0 missing** files under
`public/real-photography` and `public/stitch`. Originality/licensing provenance is **not**
recorded per image anywhere in the repo — that is an asset-pipeline gap (Phase 02), not a broken
image.
