# NaijaDeals Android shell (Capacitor)

The Android app is a thin native shell around the same deployed web app, plus one
native capability the browser cannot provide: **location while the screen is
locked**. Everything else (UI, API calls, auth) is the shared website.

`server.url` points at the production origin, so `webDir` is only used for the
offline fallback assets. This is deliberate: the app must not ship a stale copy
of the site, and the site is server-rendered — packaging it as static files
would produce a non-working app.

## What the app needs from the host project

| Item | Where | Status |
|---|---|---|
| `@capacitor/core`, `@capacitor/android` | devDependencies | **not installed** (no Android SDK to build against) |
| `NaijaDealsLocation` plugin | `android/app/src/main/java/...` | **not implemented** (blocked: no SDK) |
| Signed release keystore | outside the repo | **not created** |

The web layer already calls the plugin through a documented contract, so the
native side can be added without changing any web code:

```ts
window.NaijaDealsLocation?.start({ sessionRef })   // returns a Promise
window.NaijaDealsLocation?.stop()
```

Until that plugin exists, the app falls back to visible-session tracking and the
UI says so (`capabilities.backgroundLocation === false`).

## Building a signed APK (requires an Android SDK)

```bash
# 1. Install the Android SDK (command-line tools + platform 34 + build-tools)
#    and set ANDROID_HOME. Confirm with: sdkmanager --list

# 2. Install the Capacitor packages at the pinned versions
npm i -D @capacitor/cli @capacitor/core @capacitor/android

# 3. Create the Android project (once)
npx cap add android
cp capacitor/capacitor.config.json capacitor.config.json

# 4. Create a release keystore — keep it OUTSIDE the repository
keytool -genkeypair -v -keystore ~/.keystores/naijadeals-release.jks \
        -alias naijadeals -keyalg RSA -keysize 2048 -validity 10000

# 5. Configure signing in android/keystore.properties (git-ignored) and build
cd android && ./gradlew assembleRelease && cd ..

# 6. Record the checksum next to the release
sha256sum android/app/build/outputs/apk/release/app-release.apk
```

Copy the APK to `public/downloads/naijadeals-<version>.apk`, put the checksum in
`lib/platform/release.ts`, and set `available: true` only after that file exists.

## Update and rollback

- **Update:** ship a new APK with the same `applicationId` and a higher
  `versionCode`. Users install it over the old one; data is kept. The app never
  updates itself silently — there are no auto-update hooks.
- **Rollback:** keep the previous APK and its checksum. Reinstalling an older
  `versionCode` requires uninstalling first (Android refuses downgrades), which
  deletes app data — so roll forward with a fix when possible.
- **Signing key:** if the keystore is lost, no future update can be installed
  over the existing app; users would have to uninstall and reinstall. Back the
  keystore and its password up in a password manager, never in Git.
