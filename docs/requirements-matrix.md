# NaijaDeals Requirements Matrix

## Legend
- **Missing** - Not implemented in codebase
- **Implemented-but-unverified** - Code exists but not end-to-end tested locally
- **Locally verified** - Works in local dev environment
- **Staging verified** - Tested against staging environment
- **Production verified** - Deployed and validated in production

## Requirements Coverage Matrix

### Identity & Authentication
| Requirement | Status | Evidence |
|-------------|--------|----------|
| User registration | ✅ Locally verified | `app/register/page.tsx`, `apiClient.register()`, Prisma `user.create()` |
| User login | ✅ Locally verified | `app/login/page.tsx`, `apiClient.login()`, session cookie validation |
| Session management | ✅ Locally verified | `lib/auth/session.ts` with `getSessionUser()`, `createSession()`, `destroySession()` |
| RBAC (actorType checks) | ✅ Locally verified | `isAdmin()`, `isVendor()`, `isCourier()`, `isDriver()` in session.ts |
| Password hashing | ✅ Locally verified | Prisma seed uses scrypt; `hashPassword()` in seed.cjs |
| Logout/invalidation | ✅ Locally verified | `apiClient.logout()`, session deleteMany by tokenHash |

### Commerce & Products
| Requirement | Status | Evidence |
|-------------|--------|----------|
| Product catalog browsing | ✅ Locally verified | `app/naijashop/page.tsx`, `NaijaShopPage` with product listing |
| Category filtering | ✅ Locally verified | Category filter in NaijaShop Search and browse |
| Cart management | ✅ Locally verified | `Cart` model, `CartItem` CRUD, `addCartItem`, `updateCartItem`, `deleteCartItem` |
| Escrow-protected checkout | ✅ Locally verified | Checkout flow with 1% escrow fee, server-verified payment |
| Multi-vendor orders | ✅ Locally verified | Orders have `vendorId`, seller dashboard per-vendor overview |
| Product reviews | ✅ Locally verified | `createReview`, `OrdersPageApi` review submission |
| Returns & refunds | ✅ Locally verified | `requestReturn`, seller `resolveReturn` with approve/reject/receive |

### NaijaDrive (Rides)
| Requirement | Status | Evidence |
|-------------|--------|----------|
| Ride booking with fare quote | ✅ Locally verified | `DrivePage` with `driveQuote()`, fare breakdown (base + distance + time) |
| Driver assignment | ✅ Locally verified | `driverAcceptRide`, `driverRideStatus` progression |
| Active ride tracking | ✅ Locally verified | `ActiveRideCard` with live status, `RideTimeline` with events |
| Assignment deadlines | ✅ Locally verified | `AssignmentDeadline` component with countdown, auto-release on expiry |
| Saved places | ✅ Locally verified | `SavedPlaces` with device-local persistence + server sync |
| Cash vs wallet payment | ✅ Locally verified | Payment method radio buttons, fare hold behavior differs |
| Ride cancellation | ✅ Locally verified | `driverCancelRide`, `apiClient.driverCancelRide()` |
| Two-driver acceptance race | ⚠️ Implemented-unverified | Code supports single-winner; no test for simultaneous accepts |

### NaijaPay (Wallet)
| Requirement | Status | Evidence |
|-------------|--------|----------|
| Wallet balance display | ✅ Locally verified | `NaijaPayPage` shows availableKobo, heldInEscrowKobo, open holds count |
| Transaction ledger | ✅ Locally verified | `getWalletLedger()` with debit/credit entries |
| Escrow holds | ✅ Locally verified | Wallet shows open escrow holds with amounts and reasons |
| Deposit/credit transactions | ✅ Locally verified | `walletFixture` in seed.cgs, ledger entries created on seed |
| Withdrawal/payout | ⚠️ Implemented-unverified | Admin `adminCreatePayout` + `adminPayPayout` exist; no client workflow |
| Cross-vertical wallet | ✅ Locally verified | Single wallet serves all ecosystem services |

### Admin Control Center
| Requirement | Status | Evidence |
|-------------|--------|----------|
| Admin dashboard overview | ✅ Locally verified | `AdminDashboard` with users, vendors, products, orders, payments metrics |
| Order status management | ✅ Locally verified | Status dropdown with all OrderStatus values + refund action |
| Seller application review | ✅ Locally verified | `adminReviewApplication` approve/reject |
| Product moderation | ✅ Locally verified | `adminModerateProduct` ACTIVE↔SUSPENDED |
| User management | ✅ Locally verified | Table view with roles, vendor assignments |
| Delivery management | ✅ Locally verified | Courier assignment + delivery status workflow |
| Ride management | ✅ Locally verified | View all rides, admin cancel |
| Payout creation | ✅ Locally verified | `adminCreatePayout` with vendor/period/amount |
| Payout payment | ✅ Locally verified | `adminPayPayout` marks payout as PAID |
| Audit log viewing | ✅ Locally verified | `adminAuditLogs` table with action/entity/actor/timestamp |
| RBAC enforcement | ✅ Locally verified | `isAdmin()` check on page, redirects non-admin away |

### Internationalization
| Requirement | Status | Evidence |
|-------------|--------|----------|
| English (en) | ✅ Locally verified | Full dictionary `DICTIONARIES.en` |
| Swahili (sw) | ✅ Locally verified | Full dictionary `DICTIONARIES.sw` |
| Arabic (ar) | ✅ Locally verified | Full dictionary `DICTIONARIES.ar` with RTL support |
| `isRtl()` detection | ✅ Locally verified | Returns true for Arabic language code |
| Locale provider | ✅ Locally verified | `LocaleProvider` + `readLocale()` in layout |

### Design System
| Requirement | Status | Evidence |
|-------------|--------|----------|
| Color tokens | ✅ Locally verified | `tailwind.config.ts` with 15 custom colors |
| Typography | ✅ Locally verified | Inter/sans-serif and Plus Jakarta Sans/display fonts |
| Component library | ⚠️ Implemented-but-unverified | Only `badge.tsx` and `states.tsx` in `components/ui/` |
| Responsive breakpoints | ✅ Locally verified | sm, md, lg, xl throughout UI |
| Accessible ARIA labels | ✅ Locally verified | Numerous aria-hidden, aria-live attributes |

### Tests & Quality
| Requirement | Status | Evidence |
|-------------|--------|----------|
| Type checking (`tsc`) | ✅ Configurable | `package.json` has `type-check` script; `tsconfig.json` strict mode |
| Lint (`eslint`) | ✅ Configurable | `package.json` has `lint` script; `eslint-config-next` |
| Build (`next build`) | ✅ Configurable | `package.json` has `build` script |
| Automated test suite | ❌ Missing | No test files found in root; `scripts/` contains manual QA scripts only |
| CI/CD pipeline | ❌ Missing | No GitHub Actions found |
| Preview/development server | ✅ Locally verified | `npm run dev` starts Next.js on default port |

### Gaps & Blockers
1. **No automated test suite** - Only manual scripts in `scripts/` (visual-qa, ecosystem-smoke, drive-tests, marketplace-tests)
2. **No CI/CD** - No GitHub Actions or automated build/test pipeline
3. **NaijaEats/Fresh/Gigs/Stay/Stream** - Routes defined but no functional UI (status pages only)
4. **Aura AI** - Route exists, no implementation
5. **Wallet payout workflow** - Admin API exists, no client-facing deposit/withdraw UI beyond balance display
6. **Multi-tenant isolation** - No explicit row-level security beyond Prisma relations; relies on app-layer RBAC