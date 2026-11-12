# NaijaDrive market registry

**Purpose:** one maintained place to record what is actually known about each market before any
launch decision. This is a registry, not a coverage claim and not a parity claim. A country or city
appears here because it is being researched or prepared, not because NaijaDrive operates there.

**Rule:** every field carries a source, a date and a confidence level. A field with no source is
`UNVERIFIED`, not "probably true". Repository behaviour is evidence about the product, not evidence
about the market.

---

## 1. Launch states

| State | Meaning | Exit criteria to leave the state |
| --- | --- | --- |
| `researching` | Desk research only. No code/config, no commitments, no supply. | A verified source list, named market owner, and a written go/no-go for `preparing`. |
| `preparing` | Code/config or local operations prepared; no live trips and no public commitments. | Approved commercial terms, legal review, support process, payment method, launch city, operational runbook, and a decision to recruit. |
| `onboarding` | Drivers/partners being recruited and verified; no customer trips yet. | Approved driver documents, vehicle standards, insurance, background checks, supply threshold and safety process in place. |
| `pilot` | Limited live trips in a named area with approved terms and monitoring. | Pilot review: incidents, support load, reconciliation clean, financial defects closed, owner sign-off. |
| `live` | General availability with approved terms and support. | A safety, regulatory or financial trigger moves the market to `paused`. |
| `paused` | New trips stopped; existing obligations handled. | Remediation accepted by the market owner and the safety/finance owner. |

A state change is a decision record. It is not implied by code being present, by a country appearing
in a commerce catalogue, or by a competitor operating there.

---

## 2. Required fields per country and city

| ID | Field | What must be recorded |
| --- | --- | --- |
| M1 | Market identity | Country, city, currency, timezone, service area, launch state, owner, last reviewed, next review |
| M2 | Competitors | Named operators, observed presence, product/category coverage, source and date |
| M3 | Fare and fee disclosure | Fare structure, quote mechanism, surge, booking/airport/cancellation fees, receipt disclosure, customer-facing terms |
| M4 | Driver deductions and payout terms | Commission/subscription/fixed fees, payout cadence, minimum, cash policy, chargebacks, statements, tax handling |
| M5 | Categories and onboarding | Vehicle classes, eligibility, documents, vehicle standards, background checks, training, approval path |
| M6 | Pickup reliability and cancellation | Matching model, ETA, assignment timeout, cancellation windows and fees, no-show policy, driver release |
| M7 | Safety and support | SOS, insurance, support channels, response time, incident process, driver vetting, trip sharing |
| M8 | Payment preferences | Cash, card, wallet, transfer, provider coverage, settlement timing, failure handling |
| M9 | Language and accessibility | Customer/driver languages, RTL, literacy assumptions, accessibility baseline, screen-reader testing |
| M10 | Network and device constraints | Smartphone penetration, data cost/coverage, 2G/3G reality, PWA vs native, background location, offline behaviour |
| M11 | Legal requirements | Transport/licensing rules, data protection, insurance, tax, driver classification, municipal restrictions, counsel review status |
| M12 | Sources | Repository path or URL, access date, confidence, what the source actually proves |

Confidence scale:

| Level | Meaning |
| --- | --- |
| `HIGH` | Inspected code/config at a named commit, or first-party executed evidence with a recorded command/result |
| `MEDIUM` | Repository documentation with a recorded execution, or a public page captured without commercial terms |
| `LOW` | A single public claim or an inference not yet checked against a primary source |
| `UNVERIFIED` | No source. Do not use for a launch decision. |

---

## 3. Registry index

| Country | City | Currency | Launch state | Owner | Last reviewed | Next review |
| --- | --- | --- | --- | --- | --- | --- |
| Nigeria (NG) | Lagos | NGN | `preparing` | UNASSIGNED — a named operations owner is required before `onboarding` | 2026-11-11 | Before any pilot decision |
| Nigeria (NG) | Abuja | NGN | `researching` | UNASSIGNED | 2026-11-11 | After Lagos pilot criteria are defined |
| _Template_ | _City_ | _Currency_ | `researching` | _Owner_ | _Date_ | _Date_ |

No country is `live`. No country is in `onboarding`, `pilot` or `paused`.

---

## 4. Nigeria — Lagos

**Launch state: `preparing`.** The repository contains a functional Lagos-only ride slice, but there
is no live operation, no approved commercial terms, no driver onboarding, no driver payout and no live
payment provider. "Preparing" is the honest state; "live" would be false.

### M1 — Market identity

| Field | Value | Source | Confidence |
| --- | --- | --- | --- |
| Country | Nigeria (NG) | `lib/config/drive.ts:13` | HIGH |
| City | Lagos | `lib/config/drive.ts:14` | HIGH |
| Currency | NGN | `lib/config/drive.ts:15` | HIGH |
| Timezone used for daily reporting | Africa/Lagos (UTC+1, no DST) | `lib/services/core/drive.service.ts:1257-1264` | HIGH |
| Service area | 14 named Lagos landmarks; driver must be within 25 km of a named landmark | `lib/config/drive.ts:36-163`; `drive.service.ts:1439-1466` | HIGH |
| Dispatch coverage | Lagos only | `DRIVE_CITY` is a single constant; no per-city dispatch | HIGH |
| Owner | UNASSIGNED | — | — |
| Last reviewed | 2026-11-11 | This audit | — |
| Next review | Before any `onboarding` or `pilot` decision | — | — |

### M2 — Competitors

| Operator | Observed presence | What the source proves | Source and date | Confidence |
| --- | --- | --- | --- | --- |
| Uber | Public Nigeria ride page exists | Page structure: "Request a ride", ride options, pickup now / choose date and time, auto-fill cue. **No Lagos fare, commission, payout, onboarding, insurance or safety terms captured.** | `https://www.uber.com/ng/en/ride/` via REA, recorded in `docs/handoff.md:519-523` (2026-11-03) | MEDIUM for page existence; UNVERIFIED for terms |
| Uber | Public Kenya homepage and price estimate inspected | Homepage structure and estimator without login. **Not Nigeria-specific.** | `docs/reference-and-tooling-evidence.md:47-56` (2026-11-03) | MEDIUM for structure; UNVERIFIED for Nigeria terms |
| Bolt | Public Kenya homepage inspected | Homepage structure: hero, one primary action, service cards, minimal navigation. **Not Nigeria-specific. No Lagos terms.** | `docs/reference-and-tooling-evidence.md:49-57` (2026-11-03) | MEDIUM for structure; UNVERIFIED for Nigeria terms |
| inDrive | Not researched | — | — | UNVERIFIED |
| Local/regional operators | Not researched | — | — | UNVERIFIED |

Do not write "Uber and Bolt charge X%" or "they operate in Abuja" from these captures. The captures
prove page structure, not commercial terms or city coverage.

### M3 — Fare and fee disclosure

| Field | Value | Source | Confidence |
| --- | --- | --- | --- |
| Fare structure | Base fare + distance + time + rounding, per vehicle class | `lib/config/drive.ts:167-240`, `:330-365` | HIGH |
| Quote timing | Server quote before request; fare locked when the ride is requested | `drive.service.ts:128-186`; `components/drive/booking-workspace.tsx:283-293` | HIGH |
| Distance basis | Haversine × 1.35 road factor; 22 km/h average for the time estimate | `lib/config/drive.ts:325-348` | HIGH |
| Surge | None | No surge field or calculation in the drive path | HIGH |
| Airport surcharge | None; the landing page says so | `components/drive/drive-landing.tsx:622-626` | HIGH |
| Booking fee | None | No ride booking fee in code | HIGH |
| Cancellation fee | Zero; policy undefined | `drive.service.ts:359-366` | HIGH |
| Receipt disclosure | Base, distance, time, rounding, payment method/status, cancellation/refund adjustments | `drive.service.ts:2219-2308`; `booking-workspace.tsx:986+` | HIGH |
| Customer-facing terms | Help page terms summary; explicitly not a substitute for owner-approved legal terms | `app/naijadrive/help/page.tsx:117-129` | HIGH |
| Competitor fare/fee disclosure | Not captured | — | UNVERIFIED |
| Market willingness to pay | Not researched | — | UNVERIFIED |

### M4 — Driver deductions and payout terms

| Field | Value | Source | Confidence |
| --- | --- | --- | --- |
| Wallet fare split | 100% of the locked fare credited to the driver wallet; 0% platform deduction | `drive.service.ts:539-578` | HIGH |
| Cash fare | Collected directly by the driver; recorded separately | `drive.service.ts:768-809` | HIGH |
| Commission | None encoded | No commission field or calculation in the drive path | HIGH |
| Subscription | None encoded | No subscription model | HIGH |
| Payout flow | None for drivers | `Payout` is vendor-only (`prisma/schema.prisma:738-751`); no driver payout route | HIGH |
| Payout fee | None encoded (model input only) | `docs/nairadrive/driver-economics.md` | HIGH |
| Chargeback/refund recovery from driver | Undefined | No policy; no clawback mechanism | HIGH |
| Driver statements/tax | Not implemented | No statement or tax surface | HIGH |
| Competitor driver terms | Not captured | — | UNVERIFIED |
| Market cost of driver acquisition | Not researched | — | UNVERIFIED |

### M5 — Categories and onboarding

| Field | Value | Source | Confidence |
| --- | --- | --- | --- |
| Vehicle classes | Bike (1), Economy (4), Comfort (4), XL (6) | `lib/config/drive.ts:165-214` | HIGH |
| Driver application | Not open | `components/drive/drive-landing.tsx:688-691`; `app/naijadrive/help/page.tsx` | HIGH |
| Approval path | No API can approve a `pending` profile; seeds create approved profiles | `lib/services/core/admin.service.ts:223-233`; `scripts/nairadrive-fixtures.ts:100` | HIGH |
| Documents retained | Licence number only; no upload, expiry, insurance, roadworthiness or background check | `prisma/schema.prisma:781-806`; `driver-workspace.tsx:1083-1095` | HIGH |
| Vehicle standards | Make, model, plate and class recorded; no inspection record | Same schema | HIGH |
| Training | None encoded | No training model/route | HIGH |
| Competitor categories/onboarding | Not captured | — | UNVERIFIED |
| Regulatory vehicle categories | Not assessed | — | UNVERIFIED |

### M6 — Pickup reliability and cancellation

| Field | Value | Source | Confidence |
| --- | --- | --- | --- |
| Matching model | Open queue: an approved, online driver in the Lagos zone accepts; no score/ETA matching | `drive.service.ts:440-538` | HIGH |
| Assignment timeout | 10 minutes to the next driver action; automatic requeue | `lib/config/drive.ts:367-379`; `drive.service.ts:810-896` | HIGH |
| Rider cancellation | Allowed in `requested`, `driver_assigned`, `driver_arriving`; not after start | `drive.service.ts:336-357` | HIGH |
| Cancellation fee | Zero; policy undefined | `drive.service.ts:359-366` | HIGH |
| No-show policy | Not defined | No policy or fee | UNVERIFIED (as a policy) |
| Pickup verification | 4-digit rider code; driver must verify before start; 2-hour expiry; 5 attempts; 1.5-second cooldown | `drive.service.ts:1891-2168`; `prisma/schema.prisma:872-892` | HIGH |
| Scheduled rides | Not available | Help page; no scheduling model/route | HIGH |
| Competitor cancellation/no-show terms | Not captured | — | UNVERIFIED |
| Market traffic/ETA reliability | Not measured | — | UNVERIFIED |

### M7 — Safety and support

| Field | Value | Source | Confidence |
| --- | --- | --- | --- |
| Pickup verification | Yes, protected code before start | `drive.service.ts:1891-2168` | HIGH |
| Trip sharing | Text summary to the user's messaging app; no public live link | `booking-workspace.tsx:782-787`, `:930-938` | HIGH |
| Safety report | Participant-only report stored for operations; not public | `drive.service.ts:2421-2501`; `prisma/schema.prisma:919-945` | HIGH |
| Safety triage UI | None | No admin route/UI | HIGH |
| SOS/emergency | None | No code | HIGH |
| Insurance | Not recorded/verified | No insurance field or policy | UNVERIFIED |
| Support channels | Account and trip page; no phone line, no guaranteed response time | `app/naijadrive/help/page.tsx:64-78` | HIGH |
| Response SLA | None published | Same | HIGH |
| Driver vetting | No background check/document verification | See M5 | HIGH |
| Competitor safety/support terms | Not captured | — | UNVERIFIED |
| Market incident/insurance norms | Not researched | — | UNVERIFIED |

### M8 — Payment preferences

| Field | Value | Source | Confidence |
| --- | --- | --- | --- |
| Supported methods | Cash and NaijaPay wallet | `RidePaymentMethod` enum; `drive.service.ts:147-149` | HIGH |
| Card/transfer/POS | Not supported in the ride flow | No ride card adapter; help page says cash/wallet | HIGH |
| Wallet hold | Fare held at request; released to driver on completion | `drive.service.ts:188-226`, `:539-578` | HIGH |
| Live provider | Not configured; `test` adapter only, gated by `ENABLE_TEST_PAYMENTS` | `lib/payments/service.ts:448-458` | HIGH |
| Refund path | Wallet hold returned on cancellation; no cancellation fee | `drive.service.ts:267-334` | HIGH |
| Market cash/card/wallet preference | Not researched | — | UNVERIFIED |
| Competitor payment mix | Not captured | — | UNVERIFIED |

### M9 — Language and accessibility

| Field | Value | Source | Confidence |
| --- | --- | --- | --- |
| Drive UI language | English only | No `useLocale`/dictionary keys in `components/drive`, `app/naijadrive` or `app/driver` | HIGH |
| Shared shell languages | English, Swahili, Arabic with RTL for Arabic | `lib/i18n/dictionary.ts`; D-007 | HIGH |
| Drive dictionary coverage | None beyond module descriptions | `lib/i18n/dictionary.ts` | HIGH |
| Automated accessibility | Axe checks were recorded clean on earlier routes; no NaijaDrive-specific manual screen-reader pass | `docs/phase-tracker.md` Phase 02; no newer manual pass | MEDIUM |
| Keyboard/focus | Focus-visible styles and labels are present in drive components; not independently re-tested in this audit | Code inspection | MEDIUM |
| Market languages | Not researched (English, Nigerian Pidgin, Yoruba, Igbo, Hausa are plausible but unverified) | — | UNVERIFIED |
| Literacy/accessibility needs | Not researched | — | UNVERIFIED |

### M10 — Network and device constraints

| Field | Value | Source | Confidence |
| --- | --- | --- | --- |
| Web delivery | Installable PWA; offline page; web app manifest | `docs/mobile-foundation.md`; `app/offline/page.tsx` | HIGH |
| Location | Browser geolocation only in the web build | `components/drive/use-browser-location.ts` | HIGH |
| Background location | Not available in browser; iOS home-screen web apps cannot receive location while not visible | `docs/mobile-foundation.md:54-58`, `:119-126` | HIGH |
| Android shell | Debug and release APK builds recorded; no physical-device acceptance | `docs/mobile-foundation.md:205-228` | MEDIUM |
| Map tiles | OpenStreetMap raster tiles; low-data fallback and tile-failure message | `components/drive/trip-map.tsx:34-36`, `:317-320` | HIGH |
| Road routing | OSRM; local probe returned HTTP 200 during this audit; deployment capacity/failover not verified | `drive.service.ts:1653-1757` | MEDIUM |
| Smartphone/data coverage | Not researched | — | UNVERIFIED |
| Device mix | Not researched | — | UNVERIFIED |

### M11 — Legal requirements

| Field | Value | Source | Confidence |
| --- | --- | --- | --- |
| Legal review | Not recorded | No counsel memo in the repository | UNVERIFIED |
| Transport/licensing | Not assessed | — | UNVERIFIED |
| Data protection | Not assessed; help page describes data handling and disclaims legal compliance | `app/naijadrive/help/page.tsx:91-115` | UNVERIFIED |
| Insurance | Not assessed | — | UNVERIFIED |
| Tax/driver classification | Not assessed | — | UNVERIFIED |
| Municipal restrictions | Not assessed | — | UNVERIFIED |

Do not claim legal or regulatory compliance from this registry.

### M12 — Sources for Lagos

| Source | Date | What it proves | Confidence |
| --- | --- | --- | --- |
| `lib/config/drive.ts` | Inspected 2026-11-11 | Lagos-only city, 14 landmarks, 4 classes, quote formula, assignment grace | HIGH |
| `lib/services/core/drive.service.ts` | Inspected 2026-11-11 | Dispatch, presence, tracking, verification, receipt, ratings, safety, full-fare release, zero cancellation fee | HIGH |
| `prisma/schema.prisma` | Inspected 2026-11-11 | `DriverProfile`, `Ride`, `RideVerification`, `RideRating`, `RideSafetyReport`, vendor-only `Payout` | HIGH |
| `components/drive/drive-landing.tsx` | Inspected 2026-11-11 | Landing claims, driver recruitment closed, no airport surcharge | HIGH |
| `app/naijadrive/help/page.tsx` | Inspected 2026-11-11 | Support limits, cash/wallet, no scheduled rides, no phone line | HIGH |
| `docs/handoff.md:519-523` | 2026-11-03 | Uber Nigeria ride page captured; NaijaDrive fare comparison | MEDIUM |
| `docs/reference-and-tooling-evidence.md:40-67` | 2026-11-03 | Uber/Bolt Kenya public page structure captures | MEDIUM |
| `docs/phase-tracker.md` Phase 02, Phase 05, Phase 06 | 2026-11-03 | Axe/keyboard history, Control Center, partner lifecycle | MEDIUM |
| `docs/mobile-foundation.md` | 2026-11-09 | PWA, location limits, Android APK builds | MEDIUM |
| `docs/nairadrive/current-state-audit.md` | 2026-11-11 | Consolidated audit at HEAD `ecd0e54` | HIGH |

---

## 5. Nigeria — Abuja

**Launch state: `researching`.** Abuja is in the commerce country/city catalogue and has a commerce
delivery zone, but NaijaDrive dispatch is hardcoded to Lagos. There are no Abuja landmarks, no Abuja
driver onboarding and no Abuja market research.

| Field | Value | Source | Confidence |
| --- | --- | --- | --- |
| M1 identity | Nigeria (NG), Abuja, NGN, Africa/Lagos | `lib/config/regions.ts:12`; `lib/config/commerce.ts:72` | HIGH for catalogue presence |
| Dispatch support | **Not supported**; `DRIVE_CITY = "Lagos"`; service-radius check uses Lagos landmarks | `lib/config/drive.ts:14`; `drive.service.ts:1457-1463` | HIGH |
| M2 competitors | Not researched | — | UNVERIFIED |
| M3 fare/fee | No Abuja quote exists; no Abuja pricing | `lib/config/drive.ts` | HIGH for absence; UNVERIFIED for market |
| M4 driver deductions | Same code policy as Lagos, but no Abuja supply or onboarding | Code inspection | HIGH for code; UNVERIFIED for market |
| M5 categories/onboarding | No Abuja driver onboarding | Same approval gap as Lagos | HIGH for absence |
| M6 pickup/cancellation | Not applicable until Abuja landmarks and dispatch exist | — | UNVERIFIED |
| M7 safety/support | Generic platform only; no Abuja operations | — | UNVERIFIED |
| M8 payments | Same cash/wallet code; no Abuja provider or float | Code inspection | HIGH for code; UNVERIFIED for market |
| M9 language/accessibility | Same English-only drive UI | Code inspection | HIGH for code; UNVERIFIED for market |
| M10 network/device | Not researched for Abuja | — | UNVERIFIED |
| M11 legal | FCT transport rules not assessed | — | UNVERIFIED |
| M12 sources | `lib/config/drive.ts`, `lib/config/regions.ts`, `lib/config/commerce.ts`, this audit | 2026-11-11 | HIGH for repository state |

**Next action:** desk research and a city-activation decision. Do not present Abuja as covered,
available or "coming soon" without an approved date and supply plan.

---

## 6. Template for the next market

Copy this block for each new country/city. Replace every `TBD`; do not delete a field because it is
unknown — mark it `UNVERIFIED`.

```text
Country:
City:
Currency:
Timezone:
Launch state: researching | preparing | onboarding | pilot | live | paused
Owner:
Last reviewed:
Next review:

M1 service area:
M2 competitors:
M3 fare/fee disclosure:
M4 driver deductions/payout terms:
M5 categories/onboarding:
M6 pickup reliability/cancellation:
M7 safety/support:
M8 payment preferences:
M9 language/accessibility:
M10 network/device constraints:
M11 legal requirements:
M12 sources (path/URL, date, confidence):
Open questions:
Decision record:
```

---

## 7. Registry maintenance rules

1. **No source, no claim.** Mark `UNVERIFIED`; do not fill gaps with intuition or competitor
   marketing.
2. **Separate repository evidence from market evidence.** "The code supports cash" is not "the market
   prefers cash".
3. **Date every capture.** A page captured on 2026-11-03 does not prove terms in 2027.
4. **Do not infer terms from page structure.** A homepage capture proves layout, not commission,
   insurance or cancellation policy.
5. **Record contradictions instead of overwriting.** If a new source conflicts with an old one, keep
   both and date the change.
6. **A launch state is a decision, not a code status.** Code can be ready while the market remains
   `preparing`.
7. **Review before every state change and at least quarterly.** A stale registry is a risk.
8. **No coverage or parity claim.** A row in this registry is not an announcement.

### Change log

| Date | Change | Author |
| --- | --- | --- |
| 2026-11-11 | Initial registry created; Lagos seeded as `preparing`; Abuja seeded as `researching`; all competitor commercial terms marked unverified | Read-only audit pass |
