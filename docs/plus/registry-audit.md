# Service registry audit — Plus+ awareness cards

Date: 2026-11-12. Source of truth: `lib/data/public-services.ts` (10 entries) and
`lib/data/ecosystem.ts` (`verticals` statuses). Nothing below is a claim of operational
readiness beyond the catalogue's own labels.

## Current registry

Shop, Rides (Drive), Food (Eats), Deliveries & Freight (Send), Services (Gigs), Stays,
Groceries (Fresh), Music (Stream), Wallet (Pay), Earn & Affiliates. All carry the
catalogue's live label. Each destination route exists (`app/naijashop`, `app/naijadrive`,
`app/naijaeats`, `app/naijasend`, `app/naijagigs`, `app/naijastay`, `app/naijafresh`,
`app/naijastream`, `app/pay`, `app/affiliate`).

## Approved additions not present

- **Healthcare** — briefed by the owner as a future vertical, no implementation, no
  route, no programme-matrix row. It is therefore NOT added to the registry: a card
  would be a dead control and an availability claim. Add it only with the vertical.
- **Growth & Campaigns** — described as future capability. No advertising engine
  exists; only affiliate campaigns (`AffiliateCampaign`) serve a different purpose.
  Plus+ promotions use their own review workflow with `campaignRef` as a nullable
  integration seam, not a duplicate engine.

## Consequences in the Plus+ page

- Awareness cards are configured rows, not a fixed list, so adding an approved service
  does not require a code change. The page never states a fixed service count.
- Cards are seeded from the canonical registry by `scripts/plus-awareness-seed.ts`
  (deterministic key `service:<key>`), so the landing content tracks the registry and
  remains editable or removable through the Control Center.
- Nothing is labelled an exclusive Plus+ benefit; the benefits register is separate and
  empty until a plan and genuine benefits are approved.
- Proposed verticals must not be seeded. If one is added later, its card inherits the
  registry's status label; the page must not upgrade it to "live".
