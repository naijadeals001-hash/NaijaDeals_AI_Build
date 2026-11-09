# NaijaDeals mobile & PWA foundation

Last updated: 2026-11-09 · Branch `naijashop-marketplace`

One shared platform for every vertical. Nothing here is a second app: the website,
the installable PWA and the Android shell all run **the same server-rendered web
app**, the same identity, the same wallet/ledger and the same APIs.

---

## 1. What was actually read

| Document | Read |
|---|---|
| `AGENTS.md` (workspace rules) | in full, this session and prior ones |
| `docs/NaijaDeals_Phased_Build_Playbook.md` — Part D (website, PWA, native) and Phase 03 | read |
| `docs/architecture.md`, `docs/decisions.md`, `docs/phase-tracker.md`, `docs/handoff.md` | read in earlier sessions; architecture and decisions re-checked here |
| `docs/requirements-matrix.md` (PWA row) | read — previously `NOT STARTED` |

Inspected code: `app/layout.tsx`, `app/driver/page.tsx`,
`components/functional/driver-dashboard.tsx` (geolocation use),
`lib/services/core/drive.service.ts`, `app/api/drive/*`, `app/naijasend/driver/jobs`,
`prisma/schema.prisma` (Ride, DriverProfile, LogisticsShipment/ShipmentAssignment).

Not read this session: `docs/operations-runbook.md`, `docs/deployment-*.md`,
`docs/audits/*`. They are not claimed as covered.

Tooling verified: Node 26.13.0, npm 11.20.0, JDK 21 present, **no Android SDK,
no `adb`, no Gradle** on this machine.

---

## 2. Distribution reality (verified, not assumed)

### "Store-free" ≠ "no registration" on Android

Google's **Android Developer Verification** applies to installs on certified
Android devices *regardless of source* — direct APK downloads included. Rolling
out from 2026 (limited markets, then globally). Consequences documented so no one
assumes a free, frictionless sideload:

- A developer account is required (there is a **free limited-distribution account**
  for a small number of devices; a **standard account carries a fee** and identity
  verification).
- Unverified apps cannot install through the normal path on certified devices in
  enforced regions; the "advanced flow" requires developer options plus a waiting
  period, and ADB remains exempt.
- Alternative stores still require the store's own agreement.

Check Google's official page before each release: these rules are still changing.

### iPhone/iPad

- **Background location is unavailable to iOS home-screen web apps.** All iOS
  browsers use WebKit; a web app receives location only while it is visible.
  Background Sync is also unavailable. This is a platform limitation, not a bug in
  this codebase, and no workaround here claims otherwise.
- Legitimate routes to dependable background tracking on iOS all require Apple
  developer tooling and distribution (App Store, or TestFlight for testing).
  Enterprise distribution is for internal staff only and is **not** public
  distribution. None of that is built.

---

## 3. What is implemented

### Web + PWA
| Item | Where |
|---|---|
| Web manifest (name, icons, standalone, scope, shortcuts) | `public/manifest.webmanifest` |
| Original app icon, all sizes + maskable + apple-touch | `public/icons/*` (Kie.ai, FLUX 3 Klein) |
| Service worker with a narrow cache policy | `public/sw.js` |
| Registration, update prompt, connectivity | `components/platform/platform-provider.tsx` |
| Offline, update, install banners | `components/platform/platform-banner.tsx` |
| Offline fallback page | `app/offline/page.tsx` |
| Install + capability + Android download page | `app/install/page.tsx` |
| Live capability table | `components/platform/capability-matrix.tsx` |

**Cache policy — what is deliberately *not* cached:** `/api/*`, `/admin`,
`/super-admin`, `/wallet`, `/checkout`, `/pay`, `/login`, `/register`, `/account`,
`/seller`, `/driver`, `/courier`, and every non-GET request. Pages are
network-first (never served from cache to a different user). The worker never
retries a payment, transfer or booking; server-side idempotency remains the only
replay protection.

### Shared capability and location layer
| Item | Where |
|---|---|
| Capability detection shared by all verticals | `lib/platform/capabilities.ts` |
| Location controller (adapters, queue, staleness) | `lib/platform/location.ts` |
| Driver tracking panel | `components/platform/driver-tracking-panel.tsx` |
| Device registration / revocation | `app/api/location/devices/route.ts` |
| Location upload + read, session-scoped | `app/api/location/pings/route.ts` |
| Models | `DeviceRegistration`, `LocationPing` (migration `20261109211500_platform_devices_location`) |

Rules enforced in code:
- Tracking starts only by explicit action, bound to `drive:<rideId>` or
  `send:<shipmentId>`, and the server refuses any session the caller does not own
  (403).
- Uploads are idempotent per `(deviceId, clientId)` via a unique constraint;
  re-uploading a queue stores nothing new (proven in tests).
- Ordering uses device capture time, never arrival time.
- `stale` is computed server-side and in the UI after 90 s without a fix; the UI
  stops calling the position live and shows the exact last-update time.
- The queue survives reloads (localStorage, capped at 500 fixes) and retries.
- Wake lock is opt-in, explicitly releasable, with a battery warning.

### Android shell
`capacitor/capacitor.config.json` + `capacitor/README.md` define the shell, the
plugin contract (`window.NaijaDealsLocation.start/stop`) and the build/sign/
rollback procedure. **The APK is not built** — see blockers.

---

## 4. Feature compatibility matrix

Live detection is on `/install`; this is the general picture.

| Feature | Android Chrome PWA | Android app (planned) | iOS/iPadOS PWA | Desktop |
|---|---|---|---|---|
| Install to home screen | Yes (prompt) | n/a | Yes (Share → Add to Home Screen) | Yes (browser prompt) |
| Offline shell / offline page | Yes | Yes | Yes | Yes |
| Current location (visible) | Yes | Yes | Yes | Yes (with permission) |
| **Background location** | **No** | **Yes (unbuilt)** | **No** | No |
| Screen wake lock | Yes | Yes | No | Yes |
| Push notifications | Yes (where configured) | Planned | Only in installed PWA on iOS 16.4+, unverified here | Yes |
| Camera / file upload | Yes | Yes | Yes | Yes |
| Share sheet | Yes | Planned | Yes | Partial |
| Payment Request API | Yes | n/a | No | Depends on browser |

Anything marked unverified has not been tested on a physical device.

---

## 5. Dependency and licence inventory

No new runtime dependency was added. The PWA is built on platform APIs only.

| Component | Version | Licence | Use |
|---|---|---|---|
| Service worker / Web App Manifest | W3C standards | — | install, offline |
| Wake Lock API | W3C | — | screen stays on during a trip |
| Geolocation API | W3C | — | location |
| `leaflet` (existing) | 1.9.4 | BSD-2-Clause | maps already in use |
| OpenStreetMap tiles | — | ODbL data, tile usage policy | map tiles |
| Capacitor (planned, **not installed**) | — | MIT | Android shell |

Kie.ai generated 1 icon (FLUX 3 Klein, 1.6 credits ≈ $0.01). Provenance is in
`scripts/image-registry.json` under `platform-app-icon`.

---

## 6. Security and location-data handling

- Location rows carry `userId`; reads are restricted to the owner for that
  session, and the operational copy is only reachable through authenticated
  staff endpoints (not built — see gaps).
- Devices can be revoked; revoked devices cannot post.
- No location is collected unless a session is active; nothing runs in the
  background without the native plugin.
- Intent to retain pings for 30 days — **retention job not implemented**, so data
  currently persists indefinitely. This must be added before production.
- Coordinates outside valid ranges are rejected. Accuracy, speed and heading are
  optional and never synthesised.
- Signing keys must live outside the repository; `.gitignore` already excludes
  `.env*` and the build instructions place the keystore under `~/.keystores`.

---

## 7. Test evidence

```
node scripts/platform-pwa-e2e.cjs        → 27 passed, 0 failed
```

Covers: manifest validity and every icon file; service-worker policy (no
non-GET, private prefixes blocked, no API caching, versioned cleanup); offline and
install pages; manifest link on every page; unauthenticated upload 401; foreign
session 403; owner upload accepted; replay accepted 0; exactly five rows; capture
order; out-of-range coords rejected; stale flag flips when fixes age.

Regression: all verticals return 200 (`/naijashop`, `/naijaeats`, `/naijasend`,
`/naijagigs`, `/naijastay`, `/naijastream`, `/wallet`).

**Not tested:** physical devices; a 30-minute locked-screen session; permission
revocation mid-trip; battery-saver behaviour; service-worker update across a
deploy; iOS install and push.

---

## 8. Deliverable status

| Deliverable | Implemented | Built | Tested | Physically verified | Ready for release | Blocked |
|---|---|---|---|---|---|---|
| Responsive site | Yes | Yes | Yes | Partly (browser only) | Yes | — |
| PWA (manifest, SW, offline, install) | Yes | Yes | Yes | No | Yes, pending device check | — |
| Capability + location interfaces | Yes | Yes | Yes | No | Yes | — |
| Android native tracking + APK | Contract + config only | **No** | No | No | **No** | No Android SDK/Gradle on this machine; signing key not created |
| Direct-download/update flow | Page + release metadata | Page only | Yes (blocker shown) | No | **No** | Depends on the APK |
| iPhone PWA | Yes | Yes | Yes (browser) | No | Yes for customer use | Background tracking **unsupported by platform** |
| Capability matrix, licence inventory, security doc | Yes | — | — | — | Yes | — |

---

## 9. Gaps that remain

1. Push notifications: no push provider is configured, so the app shows no push
   capability and does not promise any.
2. Server-side location visibility for dispatch: a staff endpoint to read live or
   stale driver positions for authorised operations does not exist yet.
3. Retention/deletion job for location pings (30-day target) is not implemented.
4. iOS push in an installed PWA is untested.
5. Capacitor packages are not installed and the Android plugin is not written.

## 10. Physical device test procedure (to run when devices are available)

1. Install the PWA on an Android phone; open NaijaDrive driver board, accept a
   test ride, press **Start sharing location**.
2. Lock the screen; keep it locked 30 minutes while stationary and while moving
   in a vehicle. Record: first gap, largest gap, number of queued fixes, whether
   uploads resume on unlock.
3. Switch to a navigation app for 10 minutes; repeat the observation.
4. Enable aeroplane mode for 10 minutes, disable it, and confirm the queue drains
   with no duplicates (`LocationPing` count vs distinct `clientId`).
5. Revoke location permission mid-session; confirm the panel shows an error and
   the UI marks the position stale within 90 s.
6. Force-stop the app; reopen; confirm tracking does **not** silently resume.
7. Repeat on an iPhone PWA and record that position stops updating when Safari
   leaves the foreground — expected, and the reason background tracking is marked
   unsupported on iOS.
