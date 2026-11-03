# Architecture audit (verified against code, 2026-11-03)

## 1. Actual stack (from manifests and code)

| Layer | Verified technology |
| --- | --- |
| App | Next.js 14.2.x (App Router), React 18.3, TypeScript 5 |
| Styling | Tailwind CSS 3 + custom tokens in `tailwind.config.ts`; `clsx`; lucide-react icons |
| Data | PostgreSQL via Prisma 6.19 (`prisma/schema.prisma`, 815 lines) |
| Server logic | Route handlers in `app/api/**` + service layer `lib/services/core/*` |
| Auth | Custom cookie sessions (`lib/auth/session.ts`), scrypt password hashing, SHA-256 token hash, Prisma `Session` table |
| Payments | `lib/payments/service.ts` (703 lines) + `adapters.ts` (282 lines): wallet, Paystack, Flutterwave, and a test adapter gated by `isTestPaymentsEnabled` |
| Maps | Leaflet dependency + `components/functional/drive-map.tsx`, but **no live provider configured** (Control Center reports "Map not connected") |
| Media | `sharp` present; 43 public images under `public/` |
| Tests | `@playwright/test`, `tsx` suites in `scripts/` |
| CI | `.github/workflows/ci.yml`: type-check, lint, build, PostgreSQL-service tests, Docker build (no deploy) |

There is **no `middleware.ts`**; authorization is enforced per route/page via `lib/auth/guard.ts`
and the session helpers.

## 2. Data model

39 models / 19 enums across: identity (User, Role, UserRole, Session), commerce (Vendor,
Category, Product, ProductImage, ProductVariant, InventoryStock, Cart, CartItem, Order,
OrderItem, OrderStatusEvent), money (Wallet, WalletTransaction, LedgerEntry, EscrowHold,
EscrowEvent, Payment, WebhookEvent, Payout, ReturnRequest), mobility/logistics (DriverProfile,
Ride, RideEvent, Courier, Delivery, TrackingEvent, SavedPlace), reputation/support (Review,
Dispute, SellerApplication), governance (AdminAction, AuditLog, SystemEvent), addresses
(Address, SavedItem).

Five migrations exist, from `20260605163319_core_commerce_engine` to
`20261102173000_admin_region_scope`.

**Absent domains:** restaurant/menu (NaijaEats), grocery (NaijaFresh), gigs, stay/property,
stream/media, AI conversations. Those verticals therefore cannot be functional yet, which
matches their "Setup required" status.

## 3. Service layer

- **Core (real):** `account, admin, audit, cart, catalog, checkout, courier, delivery, dispute,
  drive, drive-sweeper, escrow, event, identity, order, seller, serialize, state-machines,
  tracking, wallet` — 20 files under `lib/services/core/`.
- **Legacy stubs:** `lib/services/*-service.ts` (10 files) contain only `TODO(backend)`
  comments and demo arrays. They are re-exported by `lib/services/index.ts`, and **no
  application file imports that index**. This is dead surface and should be deleted or wired,
  not extended.
- **State machines:** `state-machines.ts` centralises order/ride/delivery transitions; services
  validate transitions server-side.

## 4. Request and authorization flow

1. Browser calls typed `apiClient` (`lib/api-client.ts`, query-string helper, `ApiRequestError`).
2. Route handler resolves the session cookie, hashes the token and looks up `Session`.
3. `lib/auth/guard.ts` exposes `requireUser`, `requireAdmin`, `requireSuperAdmin`; `scope.ts`
   carries regional scoping added by the latest migration.
4. Services receive the actor and enforce ownership/role rules; `AdminAction`/`AuditLog` rows
   are written for sensitive mutations.

## 5. Money and payments

- Amounts are `BigInt` minor units (kobo) end to end (D-001).
- Escrow: `EscrowHold` + `EscrowEvent`; checkout records a 1% fee (documented as an
  *unverified existing policy*, not an approved commercial decision).
- Providers: wallet, Paystack, Flutterwave, test adapter. Webhooks land at
  `/api/payments/webhooks/[provider]`; confirmation is server-side.
- No live charge was executed in this audit; provider credentials are not configured
  (Control Center shows Paystack/Flutterwave "Setup").

## 6. Runtime evidence

| Check | Result | Source |
| --- | --- | --- |
| Public homepage renders with styles and data | Pass (captured 2026-11-03, `http://localhost:3000`) | REA CDP capture, this session |
| Anonymous `/admin` redirects to `/login?next=/admin` | Pass | `.qa/control-center/report.json` (2026-11-03T00:23) |
| Authenticated `/admin` loads with clean console/network | Pass (9 screenshots, 29 checks in that report) | same report — **not re-executed by this audit** |
| CI workflow exists with tests and no deploy job | Pass by file inspection | `.github/workflows/ci.yml` |

## 7. Documentation contradictions found

| Document | Claim | Reality |
| --- | --- | --- |
| `docs/architecture.md` | Last commit `61b066ee`; stash available for rollback | HEAD is `e59bd68`; `git stash list` is empty |
| `docs/requirements-matrix.md` | "Automated test suite: Missing", "CI/CD: Missing" | 3 test suites exist and CI runs them |
| `docs/functional-gap-report.md` | App is a localStorage demo MVP (dated 2026-06-05) | Current app is Prisma/PostgreSQL-backed with real sessions and ledger |
| `docs/reconciled-phase-mapping.md` | References "line 37" and "line 1188" of the playbook | Table at ~208, Part M at ~1439 |
| `docs/phase-tracker.md` | Tracks only Phases 00–01; 02+ not enumerated | Playbook defines 21 phases |

## 8. Technical debt and risks

1. **Dead stub service layer** (10 files) contradicts the real core services.
2. **No native mobile project** in the repository (no `android/`, `ios/`, `expo/`); PWA is also
   not verifiable from source (no manifest/service worker found).
3. **No background worker runtime** beyond the in-process `startDriveSweeper`; no durable queue,
   outbox or scheduler. Phase 11 requires a durable mechanism.
4. **No live map provider**; Leaflet is wired but telemetry is absent, and the UI honestly says so.
5. **No email/SMS provider**; password reset delivery cannot be real yet (Phase 03 gate).
6. **No rate limiting / CSRF token layer** visible in route handlers.
7. **Admin RBAC is coarse**: `isAdmin`/`requireSuperAdmin` only; the reference's operations,
   finance, support, moderation and regional roles are not modelled as permissions.
8. **No observability** (metrics, traces, error reporting) or health endpoint.
9. **Docs drift** — four documents contradict the code; they must be corrected rather than trusted.
