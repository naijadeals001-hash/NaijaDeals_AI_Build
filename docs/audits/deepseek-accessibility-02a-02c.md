# Accessibility audit — 02A tokens and 02C ARIA/contrast (2026-11-03)

## Method

- **Tooling:** axe-core 4.12 (already present via `eslint-plugin-jsx-a11y`) injected into real
  Chrome 156 pages through Playwright; rules tagged `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`.
- **Contrast:** computed from the Tailwind tokens with the WCAG 2.x relative-luminance formula
  (alpha-composited where the UI uses `/70`–`/75` white).
- **Keyboard:** real <kbd>Tab</kbd> traversal from the top of the page; focus style read from
  `getComputedStyle`; skip-link target measured while focused.
- **Targets:** every `a`/`button` measured at 390×844; anything below 24×24 flagged (WCAG 2.5.8 AA).
- **Viewports:** 1440×1000 desktop, 390×844 mobile.

## Contrast (tokens)

| Pair | Ratio | Verdict |
| --- | --- | --- |
| `primary #006d38` on white | 6.47:1 | AA |
| white on `primary` | 6.47:1 | AA |
| `muted #4B5563` on white | 7.56:1 | AA |
| `ink #191c1e` on white | 17.13:1 | AA |
| `primary-live #00a859` on hero `#04140f` | 6.07:1 | AA |
| white on hero | 18.88:1 | AA |
| white/75 on hero | 10.75:1 | AA |
| white/70 on wallet `#0b1a13` | 9.16:1 | AA |
| admin muted `#8B949E` on `#161B22` | 5.62:1 | AA |
| **amber `#F59E0B` on white (old status dot)** | **2.15:1** | **FAIL (UI 3:1)** |
| amber-strong `#B45309` on white (new) | 5.02:1 | AA / UI |

## Fixes applied

1. **Status-dot contrast (02A).** The 6 px "Setup required" dot used `#F59E0B` on white (2.15:1).
   Added an `amber-strong` token (`#B45309`, 5.02:1) for dots on light surfaces; amber stays on
   dark surfaces where it already exceeds 6:1.
2. **Tap target (02C).** The sidebar "Sign in or create an account" link was 16 px tall; it is now
   a 36 px inline-flex target.
3. **aria-hidden focus (02C).** The Leaflet container on `/naijadrive` was `aria-hidden="true"`
   while Leaflet injects focusable zoom/attribution controls (axe `aria-hidden-focus`, serious).
   The container is now a labelled `role="region"` ("Route map showing pickup and drop-off"), so
   its controls are reachable and announced instead of hidden-but-focusable.

## Results after fixes

| Route | axe violations (WCAG A/AA) |
| --- | --- |
| `/` (desktop) | 0 |
| `/` (mobile 390) | 0 |
| `/naijashop` | 0 |
| `/naijadrive` | 0 |
| `/products` | 0 |
| `/search?q=phone` | 0 |
| `/sell` | 0 |
| `/naijasend` | 0 |
| `/naijaeats` | 0 |
| `/login` | 0 |
| `/cart` | 0 |
| `/checkout`, `/orders`, `/account`, `/wallet`, `/super-admin` | 0 (redirect to sign-in; audited there) |

**Keyboard:** first <kbd>Tab</kbd> lands on "Skip to content" (147×40 px when focused), then the
brand, primary navigation, language button, search, cart, sign-in, and the sidebar sign-in link.
Every sampled stop has a visible focus outline (`auto 1px`, or a 2 px solid ring on the language
control). No focus trap observed. Heading order is a single `h1` followed by `h2`/`h3` with no
skipped levels; all images have an `alt` attribute; scroll width equals the viewport at 390 px.

## Still open (02B / 02D)

- 02B: keyboard operation of the Leaflet map (pan/zoom), date inputs and any dialog focus traps.
- 02D: manual screen-reader walkthrough (NVDA/VoiceOver), Arabic RTL traversal, forced-colors and
  200 % zoom, and a recorded acceptance script.
- Colour is never the sole carrier of status (labels accompany every dot), but the "live/setup"
  dots still merit a non-colour cue under WCAG 1.4.1 review.

## Reproduce

`node qa-artifacts/a11y-audit.cjs` (homepage, desktop + mobile, axe + keyboard) and
`node qa-artifacts/a11y-wide.cjs` (route sweep). Both are Git-ignored; axe is loaded from
`node_modules/axe-core/axe.min.js`, so no network install is required.
