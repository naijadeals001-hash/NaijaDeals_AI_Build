# NaijaDeals Plus+ — membership foundation

Implemented 2026-11-12 on `naijashop-marketplace`. This records what exists, what does
not, and which decisions remain with the owner. It is not a claim that Plus+ is complete.

## What exists

- Persistent service-awareness cards (`PlusContentCard`) with draft/published/archived
  status, image + accessible alt, destination, service key, ordering, language, country
  scope and start/end schedule. The landing page renders only published, in-window,
  in-scope rows; no merchandising is hardcoded in components.
- Plans and terms (`PlusPlan`, `PlusPlanTerm`, `PlusPlanCountry`), memberships
  (`PlusMembership`), entitlements (`PlusEntitlement`) and redemption records
  (`PlusRedemption`) with an idempotency key.
- Genuine member benefits (`PlusBenefit`) and promotions (`PlusPromotion`) as separate
  types: house promotion, member benefit, sponsored advertisement. Sponsored rows
  require a sponsor name and an explicit disclosure label and cannot publish without
  advertiser approval.
- Server-side permissions: `plus:content:read`, `plus:content:write`,
  `plus:content:publish`, `plus:membership:configure`, `plus:advertiser:approve`, with
  staff roles `plus_editor`, `plus_publisher`, `plus_membership_admin`,
  `plus_advertiser_reviewer`. Ordinary `admin` gets read/write only — not publish,
  membership configuration or advertiser approval. Zero-role ADMIN keeps the existing
  fail-safe set (read/write, no elevation).
- Control Center workspace at `/admin/plus` (navigation entry added) with overview,
  service awareness, plans & membership, benefits and promotions.
- Country eligibility is derived only from an ACTIVE plan, an enabled plan-country row
  and, where priced, an approved effective term. Marketplace country configuration is
  not eligibility; with no plan every country renders "Not yet available".
- Priced activation is refused server-side with `paid_activation_not_approved` unless an
  approved effective term exists and paid activation is explicitly approved. Checkout
  remains unconfigured and no purchase path exists.

## What does not exist

- No approved price, plan, trial, billing rule, cancellation/refund policy or benefit
  register. No customer can buy or join anything; there is no payment route.
- No entitlement is enforced in any other vertical. Entitlements are records only.
- No advertiser accounts, targeting, billing or live campaigns. `PlusPromotion.campaignRef`
  is a nullable integration seam; no advertising engine was created because the Growth &
  Campaigns module does not exist yet.
- No automated renewal, dunning, proration, refunds or payouts for memberships.
- No screen-reader certification or assistive-technology session.

## Verification

- `npx tsc --noEmit --incremental false` exit 0; production build exit 0.
- Migration `20261112150000_plus_membership_foundation` applied to the isolated
  `naijadeals_plus_test` and to the canonical TEST database
  `naijadeals_checkout_refund_test` (classification `TEST`). `naijadeals_core` untouched.
- Committed suites: `scripts/plus-lifecycle-acceptance.ts`,
  `scripts/plus-admin-acceptance.ts`, `scripts/plus-carousel-a11y.cjs`,
  `scripts/plus-honesty-tests.ts`.

## Research-date record

The earlier landing page displayed "Public status reviewed 5 November 2026". No Plus+
research record, commit or document dated 2026-11-05 exists; the dated records from that
day concern NaijaPay and Aura. The unsupported date was removed rather than replaced, and
no new research date was invented.
