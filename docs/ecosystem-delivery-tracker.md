# NaijaDeals ecosystem delivery tracker

Last updated: 2026-10-30
Branch: `naijashop-marketplace`
Baseline commit: `d996d224` (Correct stale verification claims in Amazon behaviour record)
Latest increment commit: `d9fc004a` (ecosystem homepage, products grid, original artwork)

This tracker separates three states so a screen existing is never confused with a
service working:

- **Implemented** — code exists in this repository and runs.
- **Test-verified** — exercised by an automated test or a recorded manual run against
  this branch on the local preview.
- **Live-verified** — exercised against real provider credentials, real money or real
  operational partners. Nothing in this repository is live-verified yet.

---

## Increment 1 — ecosystem shell, products and original artwork

| Requirement | Reference evidence | Implementation | Acceptance test / result | Remaining work |
| --- | --- | --- | --- | --- |
| Bolt/Uber-like homepage: clear hero, search, quick actions, product discovery | Reference screenshots in `C:\Users\User\Documents\Uber and Bolt` (`home page`, ride-flow sets); publicly documented Bolt/Uber homepage structure | `components/sections/ecosystem-home.tsx`; `app/page.tsx` | `scripts/ecosystem-smoke.mjs` — `/` renders heading, 25/25 checks passed | Real device testing; content localisation |
| Products section with large, accessible cards that open module routes | Screenshots of Uber/Bolt service grids | `ModuleCard` in `ecosystem-home.tsx`; `/products` page in `components/sections/products-page.tsx`, `app/products/page.tsx` | Whole-card links verified: home → NaijaShop card → `/naijashop`; browser Back returns `/`; 0 px horizontal overflow at 390 px and 1440 px | Replace “Setup required” modules with real flows (see matrix) |
| Every card has original generated imagery, including product cards | Reference imagery inspected for composition only; no competitor assets copied | `scripts/generate-ecosystem-art.mjs` (hero + 10 module scenes), `scripts/generate-product-art.mjs` (12 catalogue items), output in `public/generated/` and `public/products/` | 11 artwork files return 200 with `svg` content type; product art rendered in `/naijashop` screenshot | Higher-fidelity art direction pass; add artwork for future listings |
| Mobile-first app-like navigation with bottom bar | Bolt/Uber mobile screenshots | `components/shell/app-shell.tsx` — Home / Products / Cart / Orders / Account; 56 px targets; `aria-current` | Mobile screenshot at 390×844, no overflow, nav reachable; keyboard focus styles present | PWA install prompt, offline shell |
| Keep NaijaDrive name, remove Ruki branding | Prompt requirement | No `Ruki` occurrences remain in `app/`, `components/`, `lib/`, `prisma/`, `public/`; NaijaDrive card and route use the mobility name | Source scan returned no matches | Dedicated NaijaDrive experience |
| Honest module states | Prompt requirement | `lib/data/ecosystem.ts` status + `components/sections/generic-page.tsx` status pages | `/naijaeats`, `/naijafresh`, `/naijadrive`, `/naijagigs`, `/naijastay`, `/naijastream`, `/aura-ai` return 200 and name the missing dependency | Build the services or keep status until contracted |

Test evidence: `npm run qa:ecosystem` against `http://localhost:3100` → **25/25 checks passed**.

---

## Increment 2 — country, city, language and currency context

| Requirement | Implementation | Acceptance test / result | Remaining work |
| --- | --- | --- | --- |
| Shared country/city selection, persisted and validated | `lib/config/regions.ts` (cities per country), `lib/i18n/server.ts` (cookie reading + validation), `lib/i18n/locale-provider.tsx` | Cookie-driven render verified by `npm run qa:locale`; invalid values fall back to `NG` / `Lagos` | Real geolocation and per-country catalogues |
| Language switcher in the shell, reachable on mobile | `components/shell/locale-switcher.tsx`; wired into `app-shell.tsx` header | Playwright opens the panel and switches to Arabic; cookie persists; heading translates — 27/27 checks | Translate checkout, orders, seller and admin copy |
| Swahili added | Full dictionary in `lib/i18n/dictionary.ts` | `qa:locale`: `lang="sw"`, Swahili hero/nav labels at 390 px and 1440 px, 0 px overflow | Native-speaker review |
| Arabic added with RTL | Full dictionary; `<html lang="ar" dir="rtl">`; `rtl:` layout classes for sidebar, main, footer, switcher, arrows | `qa:locale`: RTL document, Arabic hero/nav, sidebar right-aligned on desktop, 0 px overflow, no console errors | Native-speaker review; RTL polish on commerce pages |
| Currency context honest about what is charged | Selector shows country currency but states “Prices are charged in NGN”; checkout continues to charge NGN kobo | Locale panel copy; no converted price is displayed anywhere | Enable additional selling currencies with real FX/settlement |
| Service availability by country | Delivery availability shown from `lib/config/commerce.ts` (`deliveryEnabled`) | Nigeria shows available; other countries show not configured | Country-by-country provider onboarding |

Test evidence: `npm run qa:locale` against `http://localhost:3100` → **27/27 checks passed**
(English, Swahili, Arabic × mobile 390×844 and desktop 1440×1000, plus live switcher).
Screenshots: `qa-artifacts/locale/`.

---

## Module matrix

| Module | Route | Implemented | Test-verified | Live-verified | What is real today | What is missing |
| --- | --- | --- | --- | --- | --- | --- |
| NaijaShop | `/naijashop` | Yes | Marketplace suite 13/13 + shell smoke | No | Catalogue, variants, stock reservation, cart, checkout, orders, reviews, seller tools | — (provider payments still test/mock only) |
| NaijaPay | `/wallet` | Yes | Marketplace suite (wallet failure/refund paths) + login-return journey | No | Ledger-backed wallet balance, transactions, escrow holds | Funding via real provider keys |
| NaijaSend | `/naijasend` | Partial | Marketplace suite (courier delivery, failure/retry) + shell smoke | No | Manual courier delivery states tied to marketplace orders | Standalone quote/booking, third-party courier API |
| NaijaEats | `/naijaeats` | Route + status page | Route smoke | No | Honest status | Restaurants, menus, dispatch |
| NaijaFresh | `/naijafresh` | Route + status page | Route smoke | No | Honest status | Grocery inventory, picking, substitutions |
| NaijaDrive | `/naijadrive` | Route + status page | Route smoke | No | Honest status | Ride models, quotes, dispatch, driver onboarding |
| NaijaGigs | `/naijagigs` | Route + status page | Route smoke | No | Honest status | Gig catalogue, milestones |
| NaijaStay | `/naijastay` | Route + status page | Route smoke | No | Honest status | Property inventory, availability |
| NaijaStream | `/naijastream` | Route + status page | Route smoke | No | Honest status | Licensed media, rights, royalties |
| Aura AI | `/aura-ai` | Route + status page | Route smoke | No | Honest status | Model provider, tool permissions |
| Control Center | `/admin` | Existing admin dashboard | Existing suite (not rerun in this increment) | No | Orders, vendors, products, payments, couriers, payouts, audit | Countries/cities, unified finance, RBAC matrix expansion |
| Business accounts | `/business/[vertical]` | Existing informational route | Build-time static generation | No | Service descriptions | Company accounts, groups, limits, consolidated billing |

---

## Verification checklist (prompt acceptance list)

| # | Check | Status | Evidence / gap |
| --- | --- | --- | --- |
| 1 | Homepage → Products → every module | Test-verified | `npm run qa:ecosystem`: all 10 module routes 200 (wallet 307 → login); homepage card opens NaijaShop; browser Back returns home |
| 2 | Login and return to intended journey | Test-verified | `?next=/wallet` login lands on wallet with customer fixture |
| 3 | Core customer and partner workflows | Test-verified | `npm run test:marketplace` against `localhost:3001` with `ENABLE_TEST_PAYMENTS=true`: catalogue, customer purchase, seller fulfilment, courier delivery and escrow release pass |
| 4 | Control Center actions and permissions | Test-verified | Marketplace suite: auth/RBAC enforced, seller onboarding + admin approval, cross-tenant access rejected |
| 5 | Persistence after refresh/restart | Test-verified | The suite writes orders/products/deliveries to PostgreSQL and reads them back; DB has 2 migrations applied and is up to date |
| 6 | Mobile usability, accessibility, performance | Partial | 390 px and 1440 px screenshots for English, Swahili and Arabic; 0 px overflow; whole-card links, skip link, focus styles, RTL shell; Lighthouse/axe not yet run |
| 7 | Failed payments, duplicate callbacks, retries | Test-verified | Marketplace suite: failed wallet payment rejected and order stays unpaid; duplicate callback idempotent; invalid/unconfigured webhook signatures rejected |
| 8 | Concurrent stock requests | Test-verified | Marketplace suite: concurrent checkout cannot oversell a one-unit product |
| 9 | Cancellation, refund, inventory restoration | Test-verified | Marketplace suite: paid cancellation refunds and restocks exactly once |
| 10 | Delivery/dispatch failures and recovery | Test-verified | Marketplace suite: delivery failure and retry reach delivered |
| 11 | Unauthorized cross-account access | Test-verified | Marketplace suite: cross-tenant and unauthorized access rejected |

### Recorded runs

```
$ npm run test:marketplace          # TEST_BASE_URL=http://localhost:3001, ENABLE_TEST_PAYMENTS=true
Marketplace verification: 13/13 passed

$ npm run qa:ecosystem              # QA_BASE_URL=http://localhost:3100
25/25 checks passed

$ npm run qa:locale                 # QA_BASE_URL=http://localhost:3100
27/27 checks passed
```

Artifacts: `qa-artifacts/ecosystem/*.png` (mobile 390×844 and desktop 1440×1000 for
`/`, `/products`, `/naijashop`, `/naijadrive`, `/naijafresh`) and
`qa-artifacts/locale/*.png` (English, Swahili, Arabic at 390×844 and 1440×1000).

Not yet verified: Lighthouse performance budget, axe audit, offline behaviour, and any
run against real provider credentials.

---

## Artwork provenance

Every image is generated from source in `scripts/generate-ecosystem-art.mjs` and
`scripts/generate-product-art.mjs`. The scripts compose gradients, geometry and labels
with no network access. Reference screenshots were used only to study layout and
journey structure; no competitor branding, screenshots, icons or assets are included.

Regenerate with:

```powershell
npm run art:generate
```

---

## External dependencies and blockers

| Dependency | Needed for | State |
| --- | --- | --- |
| `PAYSTACK_SECRET_KEY` | Live card/bank/USSD payments | Not configured |
| `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_WEBHOOK_HASH` | Live Flutterwave payments/webhooks | Not configured |
| Merchant approval + settlement account | Live provider onboarding | Not started |
| Maps/geocoding + dispatch partner | NaijaDrive, NaijaSend quotes and tracking | Not configured |
| Restaurant and grocery partner data | NaijaEats, NaijaFresh | Not supplied |
| Licensed audio/artwork + rights metadata | NaijaStream | Not supplied |
| Model provider key + permission policy | Aura AI actions | Not configured |
| Email/SMS provider | Outbound notifications and support | Not configured |
| PWA icons/manifest review | Installable web app | Not started |

Tooling: REA 6.8.0 is installed and its catalogue responds, but native analysis engines
(Ghidra, IDA, Hopper on Windows, JADX) are unavailable and no analysis provider is bound.
ECC and Soup are not installed. See `docs/reference-and-tooling-evidence.md`.

---

## Next increments (ordered)

1. ~~Countries, cities, language and currency context shared by shell and modules.~~ Done in Increment 2.
2. NaijaDrive: quote → request → driver accept → trip states → receipt, with DB models,
   RBAC, cancellation and concurrency tests.
3. Translate checkout, orders, seller and admin flows into Swahili and Arabic.
4. NaijaGigs and NaijaStay with real inventory and double-booking protection.
5. NaijaEats and NaijaFresh with partner-supplied catalogues only.
6. Unified Control Center expansion: geography, provider connection status, finance,
   disputes, reconciliation, audit.
7. NaijaStream and Aura only when licensed media and a model provider exist.
8. PWA manifest, offline states, Lighthouse/axe audits, full marketplace regression.
