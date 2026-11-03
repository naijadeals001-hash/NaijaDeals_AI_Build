# Design direction (2026-11-03)

This records the visual direction now applied to the NaijaDeals homepage and the rules that
govern the rest of the ecosystem. It is derived from the project's own specification, not invented:

- `docs/NaijaDeals_Phased_Build_Playbook.md` §2 (homepage), §4 (Control Center), §14 (assets),
  §15 (design system), and the "Uber + Bolt experience" section of V3.
- `docs/stitch-design-inventory.md`: palette (canvas white, near-black ink, commerce green
  `#006d38`, live green `#00a859`, amber trust `#F59E0B`), Inter + Plus Jakarta Sans, sticky top
  bar / desktop rail / mobile bottom navigation, verified badges, rails, trust and escrow strips.
- `docs/stitch-conversion-worklist.md`: screen-by-screen component blueprint.
- REA captures of Uber Kenya, the Uber public price estimate and Bolt Kenya (2026-11-03), used for
  observable layout patterns only — no competitor assets or code are copied.
- `design-references/admin/naijadeals-control-center-master.png` for the Control Center.

## Principles

1. **One primary action per screen.** Location-first hero, unified search, then service entry.
2. **Editorial hierarchy.** Oversized Plus Jakarta display type, a single accent, generous
   whitespace, restrained borders — no template card soup.
3. **Honest status is part of the design.** Live / Setup required badges come from the vertical
   catalogue; no invented metrics or fake balances.
4. **One ecosystem.** Every module shares the same shell, tokens and status language; each keeps
   its own imagery and accent.
5. **Mobile-first.** 390 px layouts are designed, not squeezed: stacked hero, scrollable module
   rail, bottom navigation, large tap targets.

## Implemented in this slice (homepage)

| Section | What changed |
| --- | --- |
| Hero | Full-bleed editorial image, cinematic multi-stop gradient, location + currency + live-count badges, 4.1rem display headline, glass search, quick chips (Shop/Drive/Pay), trust micro-row |
| Ecosystem pulse | Compact strip with honest live/setup counts and a scrollable rail of all ten modules |
| Service grid | Asymmetric bento: NaijaShop and NaijaDrive as large image-led feature cards; the remaining eight as compact cards with status, icon and description |
| Wallet band | Dark "One wallet" band with an abstract NaijaPay card (labels only — no fake balance), escrow/delivery/verified chips and direct CTAs |
| Trust and partner | Refined trust tiles and a partner band with depth/glow, unchanged copy and links |
| Routing | `/drive` now redirects to the real ride experience at `/naijadrive` |

No new dependencies, no new i18n strings, and the existing shell markers (viewport, skip link,
primary navigation) are preserved so the regression suite still finds them.

## Evidence

- Desktop 1440×1100 and mobile 390×844 captures:
  `qa-artifacts/preview/final-redesign-desktop.png`, `final-redesign-mobile.png`,
  `final-redesign-mobile-full.png`, `final-redesign-tablet.png` (Git-ignored).
- Browser checks: HTTP 200, zero console errors, 11 images loaded, `/naijashop`, `/naijadrive`,
  `/wallet`, `/products` all 200.

## Next design increments

1. Shell and navigation polish (top bar density, rail active states, mobile tab clarity).
2. NaijaShop listing/detail surfaces against the Stitch product grid and the price/verified-trust
   language.
3. NaijaDrive booking flow: map-first fare estimate, vehicle cards, fare breakdown.
4. Control Center density pass against the master reference (compact KPIs, module tabs).
5. Accessibility pass (02A–02D): contrast, focus order, screen-reader labels.
