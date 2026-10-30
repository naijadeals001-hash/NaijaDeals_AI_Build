# Reference folder and tooling evidence

Recorded 2026-10-30 while starting the ecosystem increment.

## 1. `C:\Users\User\Documents\Uber and Bolt`

Inventory (measured, not estimated):

| Item | Count / size |
| --- | --- |
| Files | 365 |
| Total size | 542.9 MB |
| PNG images | 193 |
| JPG images | 168 |
| MP4 video | 1 (`All in one Super App … Appscrip` demo, 83.5 MB) |
| APK | 1 (`taxify-driver.apk`, 13.1 MB — Bolt/Taxify driver app) |
| EXE | 1 (`Spotify - Music and Podcasts Installer.exe`, 813 KB) |
| Text | 1 (`naijadeals project prompt.txt`, 11.6 KB) |
| Folders | `2026-08`, `2026-09` (bulk screenshot sets) |

Named screenshot sets include `home page.png`, `How uber and bolt work 1/2.png`,
`How Uber works 1/2/3/4.png`, `how uber eats works.png`, `Ride Details.png`,
`Ride History User story 1.png`, `After booking.png`, `add a restaurant.png`,
`Courier.png`, `AS a User.png`, `Nice to have.png` and `Nice to have story.png`.

Conclusion: this folder is **research material**, not the application. It contains
competitor UI screenshots, a driver APK, an installer and a copy of the product
prompt. Nothing in it is imported into the site. Layout and journey patterns were used
for study only; no competitor branding, screenshots, code or assets were copied.

Screenshots are sometimes referenced by opaque hash names (for example
`07KGFbvdQH.png`), so the named files were used to establish themes and the rest remain
visual evidence in the folder.

## 2. REPOSITORY

The running application is `C:\Users\User\Documents\naijadeals.com`
(Next.js 14, TypeScript, Prisma/PostgreSQL), branch `naijashop-marketplace`.

`C:\Users\User\Documents\Naijadeals` is a separate investigation/tooling folder that
contains `AGENTS.md` and REA assets; it is not the app. `C:\Users\User\Documents\Default Project`
holds an unrelated earlier static prototype.

## 3. MANDATORY TOOLS

| Tool | Availability | Evidence | Blocker |
| --- | --- | --- | --- |
| REA | Installed (`rea@6.8.0`, CLI at `%APPDATA%\npm\rea.ps1`) | `rea --help`, `rea doctor --format json`, `rea capabilities --format json` all execute and return structured output | `rea doctor` reports `healthy: false`. Hopper is unsupported on win32; Ghidra (`GHIDRA_INSTALL_DIR`), IDA MCP and JADX are not configured; no analysis provider is bound. Web-bundle analysis needs a live CDP endpoint + target and no browser session was registered for it. |
| ECC | Not installed | `Get-Command ecc` → not found; global npm list has no ECC package | Workflow tool unavailable; the documented repo commands were used instead (`type-check`, `lint`, `build`, `test:marketplace`, visual QA). |
| Soup | Not installed | `Get-Command soup` → not found; not in global npm list | Skills/context tool unavailable; no Soup context was consumed. |

REA was still useful for its environment audit: it confirmed Node 24.22.1 and the
missing engines precisely, which is recorded here rather than hidden.

## 4. REFERENCE OBSERVATIONS USED

Observed from the named screenshots and public product patterns (not copied):

- Homepages open with a short value proposition, one primary search/booking action and
  a compact grid of services.
- Service cards are large, image-led and open the service itself, not a brochure page.
- Mobile navigation is a fixed bottom bar with four to five destinations.
- Ride flows separate pickup, destination, vehicle choice, fare confirmation, matching
  and receipt; cancellation and safety are reachable throughout.
- Food flows separate restaurant discovery, menu options, basket, preparation and
  courier hand-off.
- Partner tools separate operational queues from customer navigation.

These observations drove the hero, the product card system, the bottom navigation and
the honest module-status pages in this increment.

## 5. UNVERIFIED ASSUMPTIONS

- The hash-named screenshots may cover journeys not described by their filenames.
- No competitor administration system was accessed; Control Center work is based on
  public dashboards and this repository's existing admin.
- No real provider dashboard, merchant approval or settlement account exists locally,
  so no payment claim can be live-verified.
