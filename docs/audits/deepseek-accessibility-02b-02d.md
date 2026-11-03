# Accessibility audit — 02B keyboard flows and 02D RTL / reflow / high contrast (2026-11-03)

Continues `deepseek-accessibility-02a-02c.md`. All checks run against the live preview
(`http://localhost:3000`) in Chrome 156 via Playwright; axe-core 4.12 where noted.

## 02D — Arabic RTL

The locale is cookie-driven (`nd_lang=ar`), so the audit set the cookie before navigation.

| Check | Result |
| --- | --- |
| `<html dir lang>` | `rtl` / `ar` |
| Arabic homepage copy | rendered (e.g. "تطبيق واحد لطريقة تنقّل إفريقيا وشرائها ودفعها.") |
| Navigation and sidebar mirroring | correct — nav moves to the right, the rail flips, the hero text block anchors right |
| axe-core (WCAG A/AA) in RTL | **0 violations** |
| Horizontal overflow at 1440 px | none |
| Horizontal overflow at 320 px (WCAG 1.4.10 reflow) | none |
| Screenshot | `qa-artifacts/preview/a11y-rtl-desktop.png`, `a11y-rtl-320.png` |

## 02D — Text resize and reflow

- 320 × 760 viewport: `scrollWidth === clientWidth` (no horizontal page scrolling).
- Root font-size forced to 200 %: H1 computes at **131 px** and the page still has no horizontal
  overflow (typography is rem-based and wraps instead of clipping).

## 02D — Forced colors (Windows high contrast)

First run exposed a real defect: the UA flattened the hero/wallet/partner backgrounds to
`Canvas` while leaving `text-white`, producing white-on-white blocks and unreadable chips.
Fix: brand surfaces carry `data-forced-colors="preserve"` and `app/globals.css` opts those
surfaces out with `forced-color-adjust: none` under `@media (forced-colors: active)`. System
chrome (sidebar, nav links, buttons) still adopts the user's colours.

After the fix: hero background computed `rgb(4, 20, 15)`, text and chips are legible
(`qa-artifacts/preview/a11y-forced-colors.png`).

## 02B — Keyboard operation of the map

| Check | Result |
| --- | --- |
| Leaflet container | `tabindex="0"`, `role="region"`, label "Route map showing pickup and drop-off" |
| Arrow-key pan | ArrowRight twice shifts `.leaflet-map-pane` by **−80 px** — keyboard pan works |
| Focus visibility | browser focus ring preserved on the container |

No modal dialogs exist in the audited routes, so focus-trap testing is not applicable yet; when
dialogs are introduced (Phase 05 record detail), a trap/escape test must be added.

## Semantic tree (homepage)

- Landmarks: one `header`, `nav[aria-label="Primary"]`, `nav[aria-label="Marketplace"]`,
  `nav[aria-label="Mobile"]`, `main#main-content`, one `footer`, one `aside`.
- **0** unnamed buttons, **0** unnamed links, and the only input (`home-search`) has a real
  `<label for>`.

## Record-detail dialog (2026-11-03)

The Control Center now has a record-detail view for Orders and Vendors. It uses a native
`<dialog>` opened with `showModal()`:

| Check | Result |
| --- | --- |
| Dialog opens with a labelled title (`aria-labelledby`) | pass — "Yaba Home & Living" |
| Modal semantics | `:modal` true, backdrop dims the page |
| Initial focus | inside the dialog |
| Keyboard trap | Tab/Shift+Tab cycle inside; explicit wrap handler supplements the native trap |
| Escape | closes the dialog |
| Focus restoration | returns to the "View" button that opened it |
| axe-core with dialog open | 0 violations |

A StrictMode bug was caught during testing: closing the dialog in the effect cleanup fired the
`close` event immediately on the double-invoked effect, dismissing it. Cleanup no longer calls
`close()`; unmounting removes the element.

## Remaining

- Manual screen-reader pass (NVDA or VoiceOver) over the homepage and booking flow — automated
  checks cannot certify announcement order or verbosity.
- Dialog focus management once record-detail dialogs land.
- A non-colour cue for live/setup status (WCAG 1.4.1) beyond the current text labels.
